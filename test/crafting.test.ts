// Tests for the shaped-recipe matcher and recipe set (src/crafting.ts).
// matchRecipe normalizes the occupied bounding box of a w*h grid and compares
// it (and, for mirror-flagged recipes, its horizontal flip) against each
// pattern by itemKey. Pure logic, runs in plain node.

import { describe, it, expect } from 'vitest';
import { matchRecipe } from '../src/crafting';
import { ItemStack } from '../src/inventory';
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
