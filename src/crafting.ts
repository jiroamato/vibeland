// ---------------------------------------------------------------------------
// Shaped crafting. RECIPES hold vanilla-style patterns (rows of single-char
// cells keyed to items); matchRecipe normalizes the occupied bounding box of
// a crafting grid and compares it — and the horizontal mirror for recipes
// that allow it (axe, hoe) — against each pattern by itemKey. CraftArea (in
// invScreen.ts's task) layers slot state on top. Pure logic, no DOM.
// ---------------------------------------------------------------------------

import { ItemStack } from './inventory';
import { Item, block, tool, material, itemKey, Tier } from './items';
import { Blocks, Material, ToolType } from './blocks';

export interface CraftResult {
  item: Item;
  count: number;
}

export interface Recipe {
  /** Rows of cells; each char indexes `key`, ' ' means empty. */
  pattern: string[];
  key: Record<string, Item>;
  result: Item;
  count: number;
  /** Also accept the horizontally flipped pattern (asymmetric tools). */
  mirror?: boolean;
}

const P = block(Blocks.OAK_PLANKS);
const L = block(Blocks.OAK_LOG);
const C = block(Blocks.COBBLESTONE);
const S = material(Material.Stick);

export const RECIPES: Recipe[] = [
  { pattern: ['l'], key: { l: L }, result: P, count: 4 },
  { pattern: ['p', 'p'], key: { p: P }, result: S, count: 4 },
  { pattern: ['pp', 'pp'], key: { p: P }, result: block(Blocks.CRAFTING_TABLE), count: 1 },
];

// Tool recipes for the two tiers this milestone allows (iron+ needs smelting).
for (const [mat, tier] of [
  [P, Tier.Wood],
  [C, Tier.Stone],
] as const) {
  const key = { m: mat, s: S };
  RECIPES.push(
    { pattern: ['mmm', ' s ', ' s '], key, result: tool(ToolType.Pickaxe, tier), count: 1 },
    { pattern: ['mm', 'ms', ' s'], key, result: tool(ToolType.Axe, tier), count: 1, mirror: true },
    { pattern: ['m', 's', 's'], key, result: tool(ToolType.Shovel, tier), count: 1 },
    { pattern: ['mm', ' s', ' s'], key, result: tool(ToolType.Hoe, tier), count: 1, mirror: true },
  );
}

/** The grid's occupied bounding box as a matrix of itemKeys (null = empty). */
function boundingBox(slots: (ItemStack | null)[], w: number, h: number): (string | null)[][] | null {
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (slots[y * w + x]) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) return null; // empty grid
  const box: (string | null)[][] = [];
  for (let y = y0; y <= y1; y++) {
    const row: (string | null)[] = [];
    for (let x = x0; x <= x1; x++) {
      const s = slots[y * w + x];
      row.push(s ? itemKey(s.item) : null);
    }
    box.push(row);
  }
  return box;
}

/** A recipe's pattern as an itemKey matrix, optionally horizontally flipped. */
function patternBox(r: Recipe, mirrored: boolean): (string | null)[][] {
  return r.pattern.map((row) => {
    const cells = [...row].map((ch) => (ch === ' ' ? null : itemKey(r.key[ch])));
    return mirrored ? cells.reverse() : cells;
  });
}

function boxesEqual(a: (string | null)[][], b: (string | null)[][]): boolean {
  if (a.length !== b.length || a[0].length !== b[0].length) return false;
  for (let y = 0; y < a.length; y++)
    for (let x = 0; x < a[0].length; x++) if (a[y][x] !== b[y][x]) return false;
  return true;
}

/** Match the grid against every recipe; null when nothing matches. */
export function matchRecipe(slots: (ItemStack | null)[], w: number, h: number): CraftResult | null {
  const box = boundingBox(slots, w, h);
  if (!box) return null;
  for (const r of RECIPES) {
    if (boxesEqual(box, patternBox(r, false))) return { item: r.result, count: r.count };
    if (r.mirror && boxesEqual(box, patternBox(r, true))) return { item: r.result, count: r.count };
  }
  return null;
}
