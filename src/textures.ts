// ---------------------------------------------------------------------------
// Procedural 16x16 pixel-art block textures, generated in code (no Mojang
// assets). Tiles are assembled into a single horizontal-strip atlas used by the
// chunk mesher, and rendered into pseudo-3D isometric icons for the hotbar.
//
// A resource-pack loader (resourcepack.ts) can swap individual tile canvases
// and ask us to rebuild the atlas, so any vanilla-resolution pack matches 1:1.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { TILE_COUNT, ToolType, Material } from './blocks';
import { blockDef, BlockId } from './blocks';
import { Tier, Item, TOOL_TYPES, TIERS } from './items';

export const TILE_RES = 16;

// --- small seeded PRNG so generated textures are deterministic --------------
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x9e3779b9) | 0;
    let t = Math.imul(a ^ (a >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

type RGBA = [number, number, number, number];

class Tile {
  data: Uint8ClampedArray;
  constructor() {
    this.data = new Uint8ClampedArray(TILE_RES * TILE_RES * 4);
  }
  set(x: number, y: number, c: RGBA) {
    if (x < 0 || y < 0 || x >= TILE_RES || y >= TILE_RES) return;
    const i = (y * TILE_RES + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c[3];
  }
  fill(c: RGBA) {
    for (let y = 0; y < TILE_RES; y++) for (let x = 0; x < TILE_RES; x++) this.set(x, y, c);
  }
  toCanvas(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = TILE_RES;
    cv.height = TILE_RES;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(TILE_RES, TILE_RES);
    img.data.set(this.data);
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

// vary a base colour by +/- amount per channel
function shade(base: RGBA, d: number): RGBA {
  return [base[0] + d, base[1] + d, base[2] + d, base[3]];
}

// ---------------------------------------------------------------------------
// Individual tile generators
// ---------------------------------------------------------------------------

function genStone(seed: number, base: RGBA = [127, 127, 127, 255]): Tile {
  const t = new Tile();
  const r = rng(seed);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const n = (r() - 0.5) * 26;
      t.set(x, y, shade(base, n));
    }
  // a few darker cracks
  for (let i = 0; i < 10; i++) {
    const x = (r() * 16) | 0;
    const y = (r() * 16) | 0;
    t.set(x, y, shade(base, -42));
  }
  return t;
}

function genDirt(seed: number): Tile {
  const t = new Tile();
  const r = rng(seed);
  const base: RGBA = [134, 96, 67, 255];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const n = (r() - 0.5) * 30;
      t.set(x, y, shade(base, n));
    }
  for (let i = 0; i < 18; i++) t.set((r() * 16) | 0, (r() * 16) | 0, shade(base, -34));
  return t;
}

function genGrassTop(seed: number): Tile {
  const t = new Tile();
  const r = rng(seed);
  const base: RGBA = [110, 162, 73, 255];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const n = (r() - 0.5) * 34;
      t.set(x, y, shade(base, n));
    }
  for (let i = 0; i < 22; i++) t.set((r() * 16) | 0, (r() * 16) | 0, shade(base, -30));
  return t;
}

function genGrassSide(seed: number): Tile {
  // dirt body with a green fringe along the top + a couple of drips.
  const t = genDirt(seed);
  const r = rng(seed ^ 0x55);
  const green: RGBA = [104, 156, 70, 255];
  const fringe = 4;
  for (let x = 0; x < 16; x++) {
    const h = fringe + (r() < 0.4 ? 1 : 0); // jagged bottom edge
    for (let y = 0; y < h; y++) t.set(x, y, shade(green, (r() - 0.5) * 30));
    if (r() < 0.25) t.set(x, h, shade(green, -10)); // a hanging blade
  }
  return t;
}

function genCobble(seed: number): Tile {
  const t = new Tile();
  const r = rng(seed);
  const base: RGBA = [122, 122, 122, 255];
  t.fill(shade(base, -34)); // dark mortar background
  // scatter rounded stones
  const stones = 9;
  for (let i = 0; i < stones; i++) {
    const sx = 1 + ((r() * 13) | 0);
    const sy = 1 + ((r() * 13) | 0);
    const w = 2 + ((r() * 3) | 0);
    const h = 2 + ((r() * 3) | 0);
    const tone = (r() - 0.3) * 30;
    for (let y = sy; y < sy + h; y++)
      for (let x = sx; x < sx + w; x++) {
        if (x >= 15 || y >= 15) continue;
        t.set(x, y, shade(base, tone + (r() - 0.5) * 18));
      }
  }
  return t;
}

function genSand(seed: number): Tile {
  const t = new Tile();
  const r = rng(seed);
  const base: RGBA = [219, 205, 158, 255];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) t.set(x, y, shade(base, (r() - 0.5) * 22));
  for (let i = 0; i < 12; i++) t.set((r() * 16) | 0, (r() * 16) | 0, shade(base, -26));
  return t;
}

function genLogSide(seed: number): Tile {
  const t = new Tile();
  const r = rng(seed);
  const bark: RGBA = [102, 78, 48, 255];
  for (let x = 0; x < 16; x++) {
    const streak = (r() - 0.5) * 22;
    for (let y = 0; y < 16; y++) {
      const n = (r() - 0.5) * 14 + streak;
      t.set(x, y, shade(bark, n));
    }
  }
  // vertical grooves
  for (let i = 0; i < 4; i++) {
    const x = 1 + ((r() * 14) | 0);
    for (let y = 0; y < 16; y++) t.set(x, y, shade(bark, -30 + (r() - 0.5) * 10));
  }
  return t;
}

function genLogTop(seed: number): Tile {
  const t = new Tile();
  const r = rng(seed);
  const wood: RGBA = [160, 128, 82, 255];
  const cx = 7.5;
  const cy = 7.5;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const ring = Math.sin(d * 1.7) * 16;
      const n = ring + (r() - 0.5) * 10;
      t.set(x, y, shade(wood, n));
    }
  // bark ring on the border
  for (let i = 0; i < 16; i++) {
    t.set(i, 0, shade([96, 72, 44, 255], (r() - 0.5) * 12));
    t.set(i, 15, shade([96, 72, 44, 255], (r() - 0.5) * 12));
    t.set(0, i, shade([96, 72, 44, 255], (r() - 0.5) * 12));
    t.set(15, i, shade([96, 72, 44, 255], (r() - 0.5) * 12));
  }
  return t;
}

function genPlanks(seed: number): Tile {
  const t = new Tile();
  const r = rng(seed);
  const base: RGBA = [164, 132, 80, 255];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const n = (r() - 0.5) * 16;
      t.set(x, y, shade(base, n));
    }
  // horizontal plank seams every 4 rows
  for (let y = 3; y < 16; y += 4) for (let x = 0; x < 16; x++) t.set(x, y, shade(base, -40));
  // a couple of vertical board joints, staggered
  for (let band = 0; band < 4; band++) {
    const jointX = 2 + ((r() * 12) | 0);
    const y0 = band * 4;
    for (let y = y0; y < y0 + 3; y++) t.set(jointX, y, shade(base, -34));
  }
  // small knots
  for (let i = 0; i < 3; i++) t.set(1 + ((r() * 14) | 0), 1 + ((r() * 14) | 0), shade(base, -48));
  return t;
}

function genLeaves(seed: number): Tile {
  const t = new Tile();
  const r = rng(seed);
  const base: RGBA = [62, 102, 44, 255];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const n = (r() - 0.5) * 40;
      const c = shade(base, n);
      // occasional bright/dark leaf clusters
      if (r() < 0.12) t.set(x, y, shade(base, 26));
      else if (r() < 0.14) t.set(x, y, shade(base, -34));
      else t.set(x, y, c);
    }
  return t;
}

function genGlass(_seed: number): Tile {
  const t = new Tile();
  // Faint translucent blue-white pane (alpha-blended), so glass reads as glass
  // — visible but see-through — rather than a fully clear (invisible) hole.
  const body: RGBA = [170, 208, 230, 92];
  t.fill(body);
  // defined border frame
  const frame: RGBA = [228, 242, 250, 235];
  for (let i = 0; i < 16; i++) {
    t.set(i, 0, frame);
    t.set(i, 15, frame);
    t.set(0, i, frame);
    t.set(15, i, frame);
  }
  // inner corner accents
  for (const [cx, cy] of [[1, 1], [14, 1], [1, 14], [14, 14]] as const) t.set(cx, cy, frame);
  // diagonal reflection streaks (the classic glass shine)
  for (let i = 0; i < 6; i++) t.set(3 + i, 11 - i, [255, 255, 255, 170]);
  for (let i = 0; i < 3; i++) t.set(9 + i, 12 - i, [255, 255, 255, 130]);
  return t;
}

function genWater(seed: number): Tile {
  const t = new Tile();
  const r = rng(seed);
  const base: RGBA = [56, 104, 196, 200];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      // gentle horizontal wave banding
      const wave = Math.sin((y + x * 0.3) * 0.8) * 12;
      const n = (r() - 0.5) * 10 + wave;
      t.set(x, y, [base[0] + n, base[1] + n, base[2] + n, base[3]]);
    }
  return t;
}

function genOre(seed: number, blobColor: RGBA): Tile {
  const t = genStone(seed); // ore sits in a stone matrix
  const r = rng(seed ^ 0xabcd);
  const blobs = 4;
  for (let i = 0; i < blobs; i++) {
    const sx = 2 + ((r() * 11) | 0);
    const sy = 2 + ((r() * 11) | 0);
    const w = 2 + ((r() * 2) | 0);
    const h = 2 + ((r() * 2) | 0);
    for (let y = sy; y < sy + h; y++)
      for (let x = sx; x < sx + w; x++) {
        if (x > 14 || y > 14) continue;
        if (r() < 0.78) t.set(x, y, shade(blobColor, (r() - 0.5) * 30));
      }
  }
  return t;
}

function genCraftingTableTop(seed: number): Tile {
  const t = genPlanks(seed);
  const dark: RGBA = [96, 72, 40, 255];
  // work-surface border frame, two pixels in from the edge
  for (let i = 2; i <= 13; i++) {
    t.set(i, 2, dark);
    t.set(i, 13, dark);
    t.set(2, i, dark);
    t.set(13, i, dark);
  }
  // centre grid cross suggesting the 3x3 layout
  for (let i = 3; i <= 12; i++) {
    t.set(i, 7, shade(dark, 12));
    t.set(7, i, shade(dark, 12));
  }
  return t;
}

function genCraftingTableSide(seed: number): Tile {
  const t = genPlanks(seed);
  const dark: RGBA = [82, 60, 34, 255];
  const steel: RGBA = [188, 188, 196, 255];
  // saw silhouette: dark blade with a bright top edge
  for (let x = 2; x <= 6; x++) for (let y = 5; y <= 9; y++) t.set(x, y, dark);
  for (let x = 2; x <= 6; x++) t.set(x, 5, steel);
  // hammer head to the right
  for (let x = 9; x <= 13; x++) for (let y = 6; y <= 8; y++) t.set(x, y, dark);
  for (let y = 9; y <= 12; y++) t.set(11, y, shade(dark, -18));
  return t;
}

function genBedrock(seed: number): Tile {
  const t = new Tile();
  const r = rng(seed);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const v = 40 + ((r() * 60) | 0);
      t.set(x, y, [v, v, v, 255]);
    }
  return t;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Generate the default procedural tile set as an array of 16x16 canvases. */
export function generateDefaultTiles(): HTMLCanvasElement[] {
  const tiles: Tile[] = [];
  tiles[0] = genStone(101);
  tiles[1] = genDirt(202);
  tiles[2] = genGrassTop(303);
  tiles[3] = genGrassSide(404);
  tiles[4] = genCobble(505);
  tiles[5] = genSand(606);
  tiles[6] = genLogSide(707);
  tiles[7] = genLogTop(808);
  tiles[8] = genPlanks(909);
  tiles[9] = genLeaves(111);
  tiles[10] = genGlass(222);
  tiles[11] = genWater(333);
  tiles[12] = genOre(444, [38, 38, 40, 255]); // coal
  tiles[13] = genOre(555, [216, 175, 147, 255]); // iron
  tiles[14] = genBedrock(666);
  tiles[15] = genCraftingTableTop(777);
  tiles[16] = genCraftingTableSide(888);
  return tiles.map((t) => t.toCanvas());
}

export const ATLAS_W = TILE_RES * TILE_COUNT;
export const ATLAS_H = TILE_RES;

/** (Re)draw the tile canvases into an existing atlas canvas. */
export function paintAtlas(canvas: HTMLCanvasElement, tiles: HTMLCanvasElement[]): void {
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);
  for (let i = 0; i < TILE_COUNT; i++) {
    if (tiles[i]) ctx.drawImage(tiles[i], 0, 0, tiles[i].width, tiles[i].height, i * TILE_RES, 0, TILE_RES, TILE_RES);
  }
}

/** Assemble tile canvases into one strip atlas + a configured THREE texture. */
export function buildAtlas(tiles: HTMLCanvasElement[]): {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
} {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  paintAtlas(canvas, tiles);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false; // canvas row 0 == v 0 (top of tile)
  texture.needsUpdate = true;
  return { canvas, texture };
}

/**
 * UV rectangle for a tile, inset by half a texel to avoid bleeding between
 * neighbouring atlas tiles under nearest filtering. Returns [u0, v0, u1, v1]
 * where v0 is the TOP of the tile (flipY === false).
 */
export function tileUV(tileIndex: number): [number, number, number, number] {
  const uEps = 0.5 / ATLAS_W;
  const vEps = 0.5 / ATLAS_H;
  const u0 = (tileIndex * TILE_RES) / ATLAS_W + uEps;
  const u1 = ((tileIndex + 1) * TILE_RES) / ATLAS_W - uEps;
  return [u0, vEps, u1, 1 - vEps];
}

// ---------------------------------------------------------------------------
// Isometric hotbar icon
// ---------------------------------------------------------------------------

/** Render a pseudo-3D block icon (top + two sides, shaded) into a canvas. */
export function makeBlockIcon(blockId: BlockId, tiles: HTMLCanvasElement[], size = 64): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const def = blockDef(blockId);
  const topTile = tiles[def.faces[2]];
  const leftTile = tiles[def.faces[1]]; // -x face
  const rightTile = tiles[def.faces[4]]; // +z face

  const cx = size / 2;
  const w = size * 0.4; // half width of top diamond
  const h = w * 0.5;
  const sideH = w * 1.08;
  const cy0 = size * 0.12;

  const T = { x: cx, y: cy0 };
  const R = { x: cx + w, y: cy0 + h };
  const B = { x: cx, y: cy0 + 2 * h };
  const L = { x: cx - w, y: cy0 + h };
  const B2 = { x: B.x, y: B.y + sideH };
  const L2 = { x: L.x, y: L.y + sideH };
  const R2 = { x: R.x, y: R.y + sideH };

  // face = parallelogram defined by origin O and basis to U (tile +x) and V (tile +y)
  function drawFace(tile: HTMLCanvasElement | undefined, O: any, U: any, V: any, bright: number) {
    if (!tile) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(O.x, O.y);
    ctx.lineTo(O.x + U.x, O.y + U.y);
    ctx.lineTo(O.x + U.x + V.x, O.y + U.y + V.y);
    ctx.lineTo(O.x + V.x, O.y + V.y);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(U.x / TILE_RES, U.y / TILE_RES, V.x / TILE_RES, V.y / TILE_RES, O.x, O.y);
    ctx.drawImage(tile, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // shade overlay
    ctx.fillStyle = `rgba(0,0,0,${1 - bright})`;
    ctx.beginPath();
    ctx.moveTo(O.x, O.y);
    ctx.lineTo(O.x + U.x, O.y + U.y);
    ctx.lineTo(O.x + U.x + V.x, O.y + U.y + V.y);
    ctx.lineTo(O.x + V.x, O.y + V.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // top face (T as origin, U toward R, V toward L)
  drawFace(topTile, T, { x: R.x - T.x, y: R.y - T.y }, { x: L.x - T.x, y: L.y - T.y }, 1.0);
  // left face (L origin, U toward B, V down)
  drawFace(leftTile, L, { x: B.x - L.x, y: B.y - L.y }, { x: 0, y: sideH }, 0.8);
  // right face (B origin, U toward R, V down)
  drawFace(rightTile, B, { x: R.x - B.x, y: R.y - B.y }, { x: 0, y: sideH }, 0.6);

  // suppress unused-var lint for the helper corners we keep for readability
  void B2;
  void L2;
  void R2;

  return cv;
}

// ---------------------------------------------------------------------------
// Tool sprites: procedural 16x16 flat item icons (transparent background). A
// shared brown stick plus a per-tool head shape, recoloured per material tier.
// Used both as upscaled HUD icons and as the texture on the held tool plane.
// ---------------------------------------------------------------------------

interface Palette {
  outline: RGBA; // shadow side (bottom/right edges)
  base: RGBA; // interior
  light: RGBA; // lit side (top/left edges)
  dark: RGBA; // handle shadow column
}

const HANDLE_PAL: Palette = {
  outline: [60, 42, 24, 255],
  base: [122, 88, 52, 255],
  light: [150, 112, 70, 255],
  dark: [92, 64, 36, 255],
};

// Material tier palette for tool heads.
const TIER_PAL: Record<Tier, Palette> = {
  [Tier.Wood]: { outline: [78, 54, 28, 255], base: [152, 110, 64, 255], light: [184, 144, 96, 255], dark: [120, 84, 46, 255] },
  [Tier.Stone]: { outline: [56, 56, 56, 255], base: [126, 126, 126, 255], light: [162, 162, 162, 255], dark: [96, 96, 96, 255] },
  [Tier.Iron]: { outline: [120, 120, 120, 255], base: [214, 214, 214, 255], light: [244, 244, 244, 255], dark: [178, 178, 178, 255] },
  [Tier.Gold]: { outline: [150, 108, 22, 255], base: [248, 208, 62, 255], light: [255, 240, 154, 255], dark: [210, 162, 32, 255] },
  [Tier.Diamond]: { outline: [40, 140, 134, 255], base: [98, 224, 214, 255], light: [172, 248, 240, 255], dark: [56, 188, 178, 255] },
  [Tier.Netherite]: { outline: [22, 16, 20, 255], base: [82, 72, 80, 255], light: [116, 104, 114, 255], dark: [52, 44, 52, 255] },
};

// Rows of [y, x0, x1] inclusive ranges → flat list of [x, y] pixels.
function rangesToPts(rows: [number, number, number][]): [number, number][] {
  const pts: [number, number][] = [];
  for (const [y, x0, x1] of rows) for (let x = x0; x <= x1; x++) pts.push([x, y]);
  return pts;
}

// Filled head silhouettes per tool (16x16), drawn in the upper-right where the
// shared handle ends near (8,7). Auto-shading turns each into pixel art.
const HEADS: Record<ToolType, [number, number][]> = {
  // wide head bar with two down-tips and a central neck to the handle
  [ToolType.Pickaxe]: [
    ...rangesToPts([[2, 4, 12], [3, 3, 13]]),
    [3, 4], [13, 4], // tips
    ...rangesToPts([[4, 8, 9], [5, 8, 9], [6, 8, 9]]), // neck
  ],
  // chunky blade to the right of the handle top
  [ToolType.Axe]: rangesToPts([[2, 10, 12], [3, 9, 13], [4, 9, 13], [5, 9, 12], [6, 9, 10]]),
  // rounded spade blade above the handle
  [ToolType.Shovel]: rangesToPts([[1, 7, 9], [2, 6, 10], [3, 6, 10], [4, 6, 10], [5, 7, 9], [6, 8, 9]]),
  // top bar with a short downward flange (the classic hoe L)
  [ToolType.Hoe]: rangesToPts([[2, 8, 13], [3, 8, 13], [4, 8, 9], [5, 8, 9], [6, 8, 9]]),
};

// The shared wooden handle: a 2px diagonal stick, lit on its upper-left column
// and shaded on its lower-right column.
function drawHandle(t: Tile): void {
  for (let s = 0; s <= 6; s++) {
    const x = 2 + s;
    const y = 13 - s;
    t.set(x, y, HANDLE_PAL.base);
    t.set(x + 1, y, HANDLE_PAL.dark);
  }
  t.set(2, 13, HANDLE_PAL.outline); // grounded bottom tip
}

// Directional shading: bottom/right edges → outline (shadow), top/left edges →
// light, fully-enclosed pixels → base. Gives flat silhouettes a 3D read.
function drawShadedMask(t: Tile, pts: [number, number][], pal: Palette): void {
  const set = new Set(pts.map(([x, y]) => x + ',' + y));
  const has = (x: number, y: number) => set.has(x + ',' + y);
  for (const [x, y] of pts) {
    const shadow = !has(x, y + 1) || !has(x + 1, y);
    const lit = !has(x, y - 1) || !has(x - 1, y);
    t.set(x, y, shadow ? pal.outline : lit ? pal.light : pal.base);
  }
}

function genToolSprite(toolType: ToolType, tier: Tier): Tile {
  const t = new Tile();
  drawHandle(t); // handle first…
  drawShadedMask(t, HEADS[toolType], TIER_PAL[tier]); // …head drawn over its top
  return t;
}

// --- material sprites (stick, coal, raw iron, diamond) ----------------------
const MAT_PAL: Record<Material, Palette> = {
  [Material.Stick]: HANDLE_PAL,
  [Material.Coal]: { outline: [24, 24, 28, 255], base: [52, 52, 58, 255], light: [86, 86, 94, 255], dark: [38, 38, 44, 255] },
  [Material.RawIron]: { outline: [140, 100, 78, 255], base: [216, 176, 148, 255], light: [240, 208, 184, 255], dark: [178, 138, 112, 255] },
  [Material.Diamond]: TIER_PAL[Tier.Diamond],
};

// Silhouettes: stick = 2px diagonal; the rest are shaded lumps/gem.
const MAT_MASK: Record<Material, [number, number][]> = {
  [Material.Stick]: (() => {
    const p: [number, number][] = [];
    for (let s = 0; s <= 8; s++) p.push([3 + s, 12 - s], [4 + s, 12 - s]);
    return p;
  })(),
  [Material.Coal]: rangesToPts([[5, 6, 10], [6, 5, 11], [7, 4, 11], [8, 4, 11], [9, 5, 10], [10, 6, 9]]),
  [Material.RawIron]: rangesToPts([[4, 6, 9], [5, 5, 11], [6, 4, 11], [7, 4, 12], [8, 5, 11], [9, 5, 10], [10, 7, 9]]),
  [Material.Diamond]: rangesToPts([[4, 6, 9], [5, 5, 10], [6, 4, 11], [7, 5, 10], [8, 6, 9], [9, 7, 8]]),
};

const matCanvasCache = new Map<Material, HTMLCanvasElement>();

function materialSpriteCanvas(m: Material): HTMLCanvasElement {
  let cv = matCanvasCache.get(m);
  if (!cv) {
    const t = new Tile();
    drawShadedMask(t, MAT_MASK[m], MAT_PAL[m]);
    cv = t.toCanvas();
    matCanvasCache.set(m, cv);
  }
  return cv;
}

/** 16x16 RGBA pixels for a material sprite (3D drop/held extrusion). */
export function materialPixels(m: Material): Uint8ClampedArray {
  return materialSpriteCanvas(m).getContext('2d')!.getImageData(0, 0, TILE_RES, TILE_RES).data;
}

/** Upscaled flat material icon for the hotbar. */
export function makeMaterialIcon(m: Material, size = 64): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(materialSpriteCanvas(m), 0, 0, TILE_RES, TILE_RES, 0, 0, size, size);
  return cv;
}

// Cache key shared by every tool-sprite cache.
const toolCacheKey = (toolType: ToolType, tier: Tier) => toolType + ':' + tier;

// --- open-source Minetest textures (CC BY-SA 3.0) ---------------------------
// Loaded from /assets/tools (see public/assets/tools/ATTRIBUTION.md). The
// procedural genToolSprite above stays as a fallback if the assets fail to load.
const TOOL_FILE: Record<ToolType, string> = {
  [ToolType.Pickaxe]: 'pick',
  [ToolType.Axe]: 'axe',
  [ToolType.Shovel]: 'shovel',
  [ToolType.Hoe]: 'hoe',
};
// Minetest tier filename per Vibeland tier; Netherite is derived from steel.
const TIER_FILE: Record<Tier, string | null> = {
  [Tier.Wood]: 'wood',
  [Tier.Stone]: 'stone',
  [Tier.Iron]: 'steel',
  [Tier.Gold]: 'mese',
  [Tier.Diamond]: 'diamond',
  [Tier.Netherite]: null,
};

const assetCanvasCache = new Map<string, HTMLCanvasElement>();
const fallbackCache = new Map<string, HTMLCanvasElement>();

function imageToCanvas(img: ImageBitmap): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = TILE_RES;
  cv.height = TILE_RES;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, TILE_RES, TILE_RES);
  return cv;
}

// Recolour a steel (grayscale metal + brown handle) canvas into netherite:
// darken the metal pixels toward a dark purple-grey, keep the wooden handle.
function deriveNetherite(steel: HTMLCanvasElement): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = TILE_RES;
  cv.height = TILE_RES;
  const ctx = cv.getContext('2d')!;
  const img = steel.getContext('2d')!.getImageData(0, 0, TILE_RES, TILE_RES);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 40) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r - b > 18) continue; // warm brown = wooden handle, leave untouched
    const lum = (r + g + b) / 3;
    d[i] = lum * 0.42;
    d[i + 1] = lum * 0.37;
    d[i + 2] = lum * 0.45;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/**
 * Fetch the Minetest tool textures into 16x16 canvases keyed by (tool, tier),
 * deriving netherite from steel. Resolves true if the assets loaded; on any
 * failure the procedural sprites are used instead. Call once at startup.
 */
export async function loadToolTextures(): Promise<boolean> {
  try {
    // Fetch into local pairs and only commit to the shared cache once ALL
    // succeed. A failed fetch rejects Promise.all but does NOT cancel its
    // siblings, so mutating the cache mid-flight (and clearing it in catch)
    // would race: a late sibling could repopulate the just-cleared cache,
    // leaving a half-asset/half-procedural state. Commit-on-full-success avoids it.
    const loaded = await Promise.all(
      TOOL_TYPES.flatMap((tool) =>
        TIERS.map((tier) => ({ tool, tier, file: TIER_FILE[tier] }))
          // Type-predicate filter narrows `file` to string, so a future second
          // null tier is excluded here instead of fetching "..._null.png".
          .filter((e): e is { tool: ToolType; tier: Tier; file: string } => e.file !== null)
          .map(async ({ tool, tier, file }): Promise<[string, HTMLCanvasElement]> => {
            const url = `assets/tools/${TOOL_FILE[tool]}_${file}.png`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(url);
            const bmp = await createImageBitmap(await res.blob());
            return [toolCacheKey(tool, tier), imageToCanvas(bmp)];
          }),
      ),
    );
    for (const [key, canvas] of loaded) assetCanvasCache.set(key, canvas);
    for (const tool of TOOL_TYPES) {
      const steel = assetCanvasCache.get(toolCacheKey(tool, Tier.Iron));
      if (steel) assetCanvasCache.set(toolCacheKey(tool, Tier.Netherite), deriveNetherite(steel));
    }
    return true;
  } catch {
    return false; // never touched the shared cache → procedural fallback stays intact
  }
}

/** The 16x16 sprite canvas for a tool: loaded asset if present, else procedural. */
function toolSpriteCanvas(toolType: ToolType, tier: Tier): HTMLCanvasElement {
  const k = toolCacheKey(toolType, tier);
  const asset = assetCanvasCache.get(k);
  if (asset) return asset;
  let cv = fallbackCache.get(k);
  if (!cv) {
    cv = genToolSprite(toolType, tier).toCanvas();
    fallbackCache.set(k, cv);
  }
  return cv;
}

/** 16x16 RGBA pixels for a tool sprite (used by the 3D held extrusion). */
export function toolPixels(toolType: ToolType, tier: Tier): Uint8ClampedArray {
  return toolSpriteCanvas(toolType, tier).getContext('2d')!.getImageData(0, 0, TILE_RES, TILE_RES).data;
}

/** Upscaled flat tool icon for the hotbar / picker. */
export function makeToolIcon(toolType: ToolType, tier: Tier, size = 64): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(toolSpriteCanvas(toolType, tier), 0, 0, TILE_RES, TILE_RES, 0, 0, size, size);
  return cv;
}

/** Icon for any hotbar/picker item: block iso-icon or flat tool/material sprite. */
export function makeItemIcon(item: Item, tiles: HTMLCanvasElement[], size = 64): HTMLCanvasElement {
  if (item.kind === 'block') return makeBlockIcon(item.block, tiles, size);
  if (item.kind === 'tool') return makeToolIcon(item.tool, item.tier, size);
  return makeMaterialIcon(item.material, size);
}
