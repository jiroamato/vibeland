// ---------------------------------------------------------------------------
// HUD: the 9-slot hotbar (Minecraft gray slot style + white selected border),
// isometric block icons, and the F3-style debug overlay.
// ---------------------------------------------------------------------------

import { Item, defaultHotbar } from './items';
import { ItemStack } from './inventory';
import { makeItemIcon } from './textures';

export interface DebugInfo {
  fps: number;
  x: number;
  y: number;
  z: number;
  facing: string;
  chunkX: number;
  chunkZ: number;
  chunks: number;
  flying: boolean;
  onGround: boolean;
  mode: string;
}

export class UI {
  private hotbarEl = document.getElementById('hotbar')!;
  private debugEl = document.getElementById('debug')!;
  private fpsEl = document.getElementById('fps')!;
  private heartsEl = document.getElementById('hearts')!;
  private flashEl = document.getElementById('damageFlash')!;
  private slots: HTMLElement[] = [];
  private tiles: HTMLCanvasElement[] = [];
  private heartFills: HTMLElement[] = [];
  /** The 9 visible hotbar stacks. Creative wraps plain items with count 1. */
  hotbar: (ItemStack | null)[] = defaultHotbar().map((item) => ({ item, count: 1 }));
  /** Show count badges (survival). Creative leaves them hidden. */
  showCounts = false;
  selected = 0;
  debugVisible = false;

  /** Update the always-on top-left FPS counter. */
  updateFps(fps: number): void {
    this.fpsEl.textContent = fps + ' fps';
  }

  /** Show the hearts row (survival) and build its 10 hearts once. */
  showHearts(): void {
    if (this.heartFills.length === 0) {
      for (let i = 0; i < 10; i++) {
        const heart = document.createElement('span');
        heart.className = 'heart';
        heart.textContent = '♥';
        const fill = document.createElement('span');
        fill.className = 'fill';
        fill.textContent = '♥';
        heart.appendChild(fill);
        this.heartsEl.appendChild(heart);
        this.heartFills.push(fill);
      }
    }
    this.heartsEl.classList.add('visible');
  }

  /** Repaint the hearts from hp (2 hp per heart, half-heart granularity). */
  setHealth(hp: number): void {
    this.heartFills.forEach((fill, i) => {
      const w = hp >= (i + 1) * 2 ? '100%' : hp >= i * 2 + 1 ? '50%' : '0';
      fill.style.width = w;
    });
  }

  /** Pulse the red damage vignette (retriggers cleanly mid-animation). */
  damageFlash(): void {
    this.flashEl.classList.remove('hit');
    void this.flashEl.offsetWidth; // reflow so the animation restarts
    this.flashEl.classList.add('hit');
  }

  buildHotbar(tiles: HTMLCanvasElement[]): void {
    this.tiles = tiles;
    this.hotbarEl.innerHTML = '';
    this.slots = [];
    this.hotbar.forEach((_item, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot' + (i === this.selected ? ' selected' : '');
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(i + 1);
      slot.appendChild(num);
      this.hotbarEl.appendChild(slot);
      this.slots.push(slot);
      this.renderSlotIcon(i);
    });
  }

  /** (Re)draw a single slot's icon (and survival count badge) from its stack. */
  private renderSlotIcon(i: number): void {
    const slot = this.slots[i];
    if (!slot) return;
    slot.querySelector('canvas')?.remove();
    slot.querySelector('.count')?.remove();
    const stack = this.hotbar[i];
    if (!stack) return;
    const icon = makeItemIcon(stack.item, this.tiles, 64);
    slot.insertBefore(icon, slot.firstChild);
    if (this.showCounts && stack.count > 1) {
      const badge = document.createElement('span');
      badge.className = 'count';
      badge.textContent = String(stack.count);
      slot.appendChild(badge);
    }
  }

  /** Replace the item in a slot (used by the creative picker). */
  setSlotItem(i: number, item: Item): void {
    if (i < 0 || i >= this.hotbar.length) return;
    this.hotbar[i] = { item, count: 1 };
    this.renderSlotIcon(i);
  }

  /** Survival: mirror inventory slots 0-8 into the hotbar and re-render. */
  setStacks(stacks: (ItemStack | null)[]): void {
    for (let i = 0; i < this.hotbar.length; i++) {
      this.hotbar[i] = stacks[i] ?? null;
      this.renderSlotIcon(i);
    }
  }

  setSelected(i: number): void {
    const n = this.hotbar.length;
    this.selected = ((i % n) + n) % n;
    this.slots.forEach((s, idx) => s.classList.toggle('selected', idx === this.selected));
  }

  get selectedItem(): Item | null {
    return this.hotbar[this.selected]?.item ?? null;
  }

  toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
    this.debugEl.classList.toggle('visible', this.debugVisible);
    // the F3 overlay reports FPS itself, so hide the standalone counter then
    this.fpsEl.classList.toggle('hidden', this.debugVisible);
  }

  updateDebug(d: DebugInfo): void {
    if (!this.debugVisible) return;
    this.debugEl.textContent =
      `Vibeland  (TS + Three.js)\n` +
      `${d.fps} fps\n` +
      `XYZ: ${d.x.toFixed(2)} / ${d.y.toFixed(2)} / ${d.z.toFixed(2)}\n` +
      `Block: ${Math.floor(d.x)} ${Math.floor(d.y)} ${Math.floor(d.z)}\n` +
      `Chunk: ${d.chunkX}, ${d.chunkZ}\n` +
      `Facing: ${d.facing}\n` +
      `Chunks loaded: ${d.chunks}\n` +
      `Mode: ${d.mode}${d.flying ? ' (fly)' : ''}${d.onGround ? ' (grounded)' : ''}`;
  }
}
