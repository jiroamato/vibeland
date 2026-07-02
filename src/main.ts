// ---------------------------------------------------------------------------
// Entry point: wires the renderer, world, player, input, sky, HUD and chunk
// streaming together and runs the frame loop.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { World } from './world';
import { Player } from './player';
import { Input } from './input';
import { Sky } from './sky';
import { HeldItem } from './held';
import { UI } from './ui';
import { Interaction } from './interaction';
import { Picker } from './picker';
import { ChunkManager } from './chunkManager';
import { makeChunkMaterials } from './chunkMaterial';
import { generateDefaultTiles, buildAtlas, paintAtlas, loadToolTextures } from './textures';
import { loadResourcePack } from './resourcepack';
import { CHUNK_SX, CHUNK_SZ, floorDiv } from './constants';
import { GameMode, GameRules, rulesFor } from './gamemode';
import { Inventory, HOTBAR_SIZE } from './inventory';
import { DropManager, EntityWorld } from './itemEntity';
import { buildDropMesh } from './itemMesh';
import { blockDef } from './blocks';

// --- renderer / scene ---
const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// --- textures / materials ---
const tiles = generateDefaultTiles();
const { canvas: atlasCanvas, texture: atlasTexture } = buildAtlas(tiles);
const materials = makeChunkMaterials(atlasTexture);

// --- world & systems ---
const SEED = 1337;
const world = new World(SEED);
const aspect = window.innerWidth / window.innerHeight;
const player = new Player(world, aspect);
const sky = new Sky(scene);
const held = new HeldItem(atlasTexture, aspect);
const ui = new UI();
const interaction = new Interaction(scene);
const input = new Input(renderer.domElement);
const chunks = new ChunkManager(world, scene, materials);

// --- item drops (survival) ---
const entityWorld: EntityWorld = {
  solidAt: (x, y, z) => blockDef(world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))).solid,
  chunkLoaded: (wx, wz) => world.getChunk(floorDiv(Math.floor(wx), CHUNK_SX), floorDiv(Math.floor(wz), CHUNK_SZ)) !== undefined,
};
const drops = new DropManager(entityWorld, (item) => buildDropMesh(item, atlasTexture), scene);

function syncHotbar() {
  if (!inventory) return;
  ui.setStacks(inventory.slots.slice(0, HOTBAR_SIZE));
  held.setItem(ui.selectedItem);
}

ui.buildHotbar(tiles);
const picker = new Picker(tiles);
held.setItem(ui.selectedItem);

// picker → hotbar wiring
picker.onSlotChange = (slot) => ui.setSelected(slot);
picker.onPick = (slot, item) => {
  ui.setSlotItem(slot, item);
  held.setItem(ui.selectedItem);
};

// Load the open-source (Minetest, CC BY-SA) tool textures asynchronously; until
// they arrive the procedural sprites are used. On success, refresh the icons and
// the held 3D mesh so they swap in seamlessly.
loadToolTextures().then((ok) => {
  if (!ok) return;
  ui.buildHotbar(tiles);
  picker.build(tiles);
  held.refreshTools();
});

// spawn the player above the surface near origin
player.spawn(0, 0);

// --- game mode / overlay / pointer lock ---
let mode: GameMode | null = null; // chosen on first Play click, then fixed
let rules: GameRules = rulesFor('creative');
let inventory: Inventory | null = null;

const overlayEl = document.getElementById('overlay')!;
const loadingEl = document.getElementById('loading')!;
const survivalBtn = document.getElementById('playSurvival')!;
const creativeBtn = document.getElementById('playCreative')!;

function choose(m: GameMode) {
  if (mode === null) {
    mode = m;
    rules = rulesFor(m);
    player.allowFly = rules.fly;
    if (m === 'survival') {
      inventory = new Inventory();
      ui.showCounts = true;
      ui.setStacks(new Array(HOTBAR_SIZE).fill(null));
      held.setItem(ui.selectedItem);
      survivalBtn.textContent = 'Resume';
      creativeBtn.classList.add('hidden');
    } else {
      creativeBtn.textContent = 'Resume';
      survivalBtn.classList.add('hidden');
    }
  }
  input.requestLock();
}
survivalBtn.addEventListener('click', () => choose('survival'));
creativeBtn.addEventListener('click', () => choose('creative'));
input.onLockChange = (locked) => {
  // While the picker is open the pointer is intentionally released; keep the
  // start overlay hidden so it doesn't pop up behind the picker.
  if (picker.open) {
    overlayEl.classList.add('hidden');
    return;
  }
  overlayEl.classList.toggle('hidden', locked);
};
input.onLockError = () => {
  // A re-lock was rejected (e.g. closing the picker during Chrome's post-Esc
  // cooldown). Never leave the game stuck unlocked with no UI: close the picker
  // and show the start overlay so a fresh click can re-enter.
  picker.close();
  overlayEl.classList.remove('hidden');
};

// --- creative item picker (E) ---
function openPicker() {
  if (!rules.picker || !started || picker.open || !input.locked) return;
  picker.show(ui.selected); // releases the pointer; onLockChange keeps overlay hidden
  document.exitPointerLock();
}
function closePicker() {
  if (!picker.open) return;
  picker.close();
  input.requestLock(); // gesture-safe: called from the keydown handler below
}
window.addEventListener('keydown', (e) => {
  if (e.repeat) return; // ignore OS key-repeat so a held key can't thrash the picker
  if (e.code === 'KeyE') {
    if (!started) return;
    e.preventDefault();
    if (picker.open) closePicker();
    else openPicker();
  } else if (e.code === 'Escape' && picker.open) {
    closePicker();
  }
});

// --- resource pack ---
const packInput = document.getElementById('packInput') as HTMLInputElement;
const packStatus = document.getElementById('packStatus')!;
packInput.addEventListener('change', async () => {
  if (!packInput.files || packInput.files.length === 0) return;
  packStatus.textContent = ' loading…';
  const res = await loadResourcePack(packInput.files, tiles);
  paintAtlas(atlasCanvas, tiles);
  atlasTexture.needsUpdate = true;
  ui.buildHotbar(tiles);
  picker.build(tiles);
  packStatus.textContent = ` ${res.replaced}/${res.total} textures applied`;
});

// --- resize ---
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  player.camera.aspect = w / h;
  player.camera.updateProjectionMatrix();
  held.resize(w / h);
}
window.addEventListener('resize', onResize);

// --- frame loop ---
let last = performance.now();
let started = false; // becomes true once the spawn area is meshed
let fpsAccum = 0;
let fpsFrames = 0;
let fps = 0;

function selectFromInput() {
  if (!input.locked) return; // don't change selection while paused/overlay up
  for (let i = 1; i <= 9; i++) if (input.wasPressed('Digit' + i)) ui.setSelected(i - 1);
  const w = input.consumeWheel();
  if (w !== 0) ui.setSelected(ui.selected + w);
  held.setItem(ui.selectedItem);
}

function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  input.setTime(now / 1000);

  // fps meter
  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    fps = Math.round(fpsFrames / fpsAccum);
    fpsAccum = 0;
    fpsFrames = 0;
    ui.updateFps(fps);
  }

  if (input.wasPressed('F3')) ui.toggleDebug();
  selectFromInput();

  const pcx = floorDiv(Math.floor(player.pos.x), CHUNK_SX);
  const pcz = floorDiv(Math.floor(player.pos.z), CHUNK_SZ);

  // stream chunks (always, so the world keeps loading even before play)
  chunks.update(pcx, pcz, started ? 8 : 16);

  // gate: keep "loading" until the spawn area is ready, then re-snap spawn
  if (!started) {
    if (chunks.readyAt(pcx, pcz)) {
      player.spawn(0, 0);
      started = true;
      loadingEl.classList.add('hidden');
      overlayEl.classList.remove('hidden');
    }
  }

  let swung = false;
  if (started && input.locked) {
    player.update(dt, input);
    const survival = inventory ? { drops, inventory, selectedSlot: ui.selected, onChange: syncHotbar } : null;
    swung = interaction.update(dt, input, player, world, ui.selectedItem, survival);
    drops.update(dt, player.pos, inventory, syncHotbar);
  } else {
    // keep camera oriented even while paused
    player.camera.rotation.y = player.yaw;
    player.camera.rotation.x = player.pitch;
    player.camera.position.copy(player.eyePosition);
  }

  sky.update(dt, player.camera.position);
  materials.setDayLight(sky.dayLight);
  held.update(dt, swung);

  renderer.render(scene, player.camera);
  held.render(renderer);

  if (ui.debugVisible) {
    ui.updateDebug({
      fps,
      x: player.pos.x,
      y: player.pos.y,
      z: player.pos.z,
      facing: player.facing(),
      chunkX: pcx,
      chunkZ: pcz,
      chunks: chunks.meshedCount,
      flying: player.flying,
      onGround: player.onGround,
      mode: mode ?? 'menu',
    });
  }

  input.endFrame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Debug handle (handy in the console: e.g. __game.player.pos, __game.sky.time).
(window as any).__game = { player, world, input, interaction, ui, picker, chunks, sky, renderer, held, drops, mode: () => mode, inventory: () => inventory };
