// Tests for the shaped-recipe matcher and recipe set (src/crafting.ts).
// matchRecipe normalizes the occupied bounding box of a w*h grid and compares
// it (and, for mirror-flagged recipes, its horizontal flip) against each
// pattern by itemKey. Pure logic, runs in plain node.

import { describe, it, expect } from 'vitest';
import { matchRecipe, CraftArea } from '../src/crafting';
import { Inventory, ItemStack } from '../src/inventory';
import { block, tool, material, Tier } from '../src/items';
import { Blocks, Material, ToolType } from '../src/blocks';

const log = block(Blocks.OAK_LOG);
const planks = block(Blocks.OAK_PLANKS);
const cobble = block(Blocks.COBBLESTONE);
const stick = material(Material.Stick);
const s = (i: ReturnType<typeof block>, count = 1): ItemStack => ({ item: i, count });

/** Build a w*h grid from a compact picture: 'l'=log 'p'=planks 'c'=cobble 's'=stick '.'=empty */
const grid = (rows: string[], w: number): (ItemStack | null)[] => {
  const map: Record<string, ReturnType<typeof block>> = { l: log, p: planks, c: cobble, s: stick };
  const g: (ItemStack | null)[] = new Array(w * rows.length).fill(null);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '.') g[y * w + x] = s(map[ch]);
  }));
  return g;
};

describe('matchRecipe', () => {
  it('log anywhere in a 3x3 yields 4 planks (bounding-box normalization)', () => {
    for (const rows of [['l..', '...', '...'], ['...', '.l.', '...'], ['...', '...', '..l']]) {
      expect(matchRecipe(grid(rows, 3), 3, 3)).toEqual({ item: planks, count: 4 });
    }
  });
  it('log in a 2x2 also works (recipe smaller than the grid)', () => {
    expect(matchRecipe(grid(['.l', '..'], 2), 2, 2)).toEqual({ item: planks, count: 4 });
  });
  it('two vertical planks yield 4 sticks; horizontal does not', () => {
    expect(matchRecipe(grid(['p.', 'p.'], 2), 2, 2)).toEqual({ item: stick, count: 4 });
    expect(matchRecipe(grid(['pp', '..'], 2), 2, 2)).toBeNull();
  });
  it('2x2 planks yield a crafting table', () => {
    expect(matchRecipe(grid(['pp', 'pp'], 2), 2, 2)).toEqual({
      item: block(Blocks.CRAFTING_TABLE),
      count: 1,
    });
  });
  it('wooden pickaxe: full top row of planks over a stick column', () => {
    expect(matchRecipe(grid(['ppp', '.s.', '.s.'], 3), 3, 3)).toEqual({
      item: tool(ToolType.Pickaxe, Tier.Wood),
      count: 1,
    });
  });
  it('stone tools come from cobblestone', () => {
    expect(matchRecipe(grid(['ccc', '.s.', '.s.'], 3), 3, 3)).toEqual({
      item: tool(ToolType.Pickaxe, Tier.Stone),
      count: 1,
    });
  });
  it('pickaxe never matches a 2x2 grid (pattern wider than the grid)', () => {
    // the closest a 2x2 can get: two planks + a stick — must not match anything
    expect(matchRecipe(grid(['pp', '.s'], 2), 2, 2)).toBeNull();
  });
  it('axe matches both hands (mirror)', () => {
    const rightHanded = grid(['pp.', 'ps.', '.s.'], 3);
    const leftHanded = grid(['.pp', '.sp', '.s.'], 3);
    expect(matchRecipe(rightHanded, 3, 3)).toEqual({ item: tool(ToolType.Axe, Tier.Wood), count: 1 });
    expect(matchRecipe(leftHanded, 3, 3)).toEqual({ item: tool(ToolType.Axe, Tier.Wood), count: 1 });
  });
  it('shovel: one material over two sticks', () => {
    expect(matchRecipe(grid(['.c.', '.s.', '.s.'], 3), 3, 3)).toEqual({
      item: tool(ToolType.Shovel, Tier.Stone),
      count: 1,
    });
  });
  it('hoe matches both hands (mirror)', () => {
    expect(matchRecipe(grid(['pp.', '.s.', '.s.'], 3), 3, 3)).toEqual({
      item: tool(ToolType.Hoe, Tier.Wood),
      count: 1,
    });
    expect(matchRecipe(grid(['.pp', '.s.', '.s.'], 3), 3, 3)).toEqual({
      item: tool(ToolType.Hoe, Tier.Wood),
      count: 1,
    });
  });
  it('mixed materials reject (planks + cobble in one tool head)', () => {
    expect(matchRecipe(grid(['pcp', '.s.', '.s.'], 3), 3, 3)).toBeNull();
  });
  it('empty grid matches nothing', () => {
    expect(matchRecipe(grid(['...', '...', '...'], 3), 3, 3)).toBeNull();
    expect(matchRecipe(grid(['..', '..'], 2), 2, 2)).toBeNull();
  });
});

describe('CraftArea', () => {
  it('result() reflects the current grid', () => {
    const area = new CraftArea(2, 2);
    expect(area.result()).toBeNull();
    area.slots[0] = s(log);
    expect(area.result()).toEqual({ item: planks, count: 4 });
  });
  it('takeResult with an empty cursor takes one craft and decrements inputs', () => {
    const area = new CraftArea(2, 2);
    area.slots[0] = s(log, 3);
    const cursor = area.takeResult(null);
    expect(cursor).toEqual({ item: planks, count: 4 });
    expect(area.slots[0]).toEqual({ item: log, count: 2 });
    expect(area.result()).toEqual({ item: planks, count: 4 }); // still craftable
  });
  it('inputs null at zero and the result disappears', () => {
    const area = new CraftArea(2, 2);
    area.slots[1] = s(log, 1);
    area.takeResult(null);
    expect(area.slots[1]).toBeNull();
    expect(area.result()).toBeNull();
  });
  it('takeResult stacks onto a same-item cursor, rejects a different one', () => {
    const area = new CraftArea(2, 2);
    area.slots[0] = s(log, 2);
    let cursor: ItemStack | null = { item: planks, count: 4 };
    cursor = area.takeResult(cursor);
    expect(cursor).toEqual({ item: planks, count: 8 });
    const wrong: ItemStack = { item: cobble, count: 1 };
    expect(area.takeResult(wrong)).toBe(wrong); // unchanged, no craft consumed
    expect(area.slots[0]).toEqual({ item: log, count: 1 });
  });
  it('takeResult refuses when the cursor cannot hold another craft', () => {
    const area = new CraftArea(2, 2);
    area.slots[0] = s(log, 1);
    const full: ItemStack = { item: planks, count: 62 }; // 62 + 4 > 64
    expect(area.takeResult(full)).toBe(full);
    expect(area.slots[0]).toEqual({ item: log, count: 1 });
  });
  it('multi-cell recipes decrement every occupied cell once', () => {
    const area = new CraftArea(3, 3);
    const g = grid(['ppp', '.s.', '.s.'], 3);
    for (let i = 0; i < 9; i++) area.slots[i] = g[i] ? { ...g[i]!, count: 2 } : null;
    area.takeResult(null);
    expect(area.slots[0]).toEqual({ item: planks, count: 1 });
    expect(area.slots[4]).toEqual({ item: stick, count: 1 });
    expect(area.slots[3]).toBeNull(); // was empty, stays empty
  });
  it('flush returns grid contents to the inventory and reports overflow', () => {
    const area = new CraftArea(2, 2);
    const inv = new Inventory();
    area.slots[0] = s(log, 5);
    expect(area.flush(inv)).toEqual([]);
    expect(inv.slots[0]).toEqual({ item: log, count: 5 });
    expect(area.slots[0]).toBeNull();

    area.slots[0] = s(planks, 10);
    for (let i = 0; i < 36; i++) inv.slots[i] = { item: cobble, count: 64 };
    expect(area.flush(inv)).toEqual([{ item: planks, count: 10 }]);
  });
});
