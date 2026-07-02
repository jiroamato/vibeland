// Regression tests for the vanilla break-time formula (src/items.ts → breakSeconds).
// These pin the exact numbers the tool-mining feature claims, so the faithful
// vanilla mechanics can't silently drift. breakSeconds is a pure function with no
// DOM/Three.js dependency, so these run in plain node.

import { describe, it, expect } from 'vitest';
import { breakSeconds, block, tool, Tier } from '../src/items';
import { blockDef, Blocks, ToolType } from '../src/blocks';

// A block-kind item behaves as "hand" — no tool type, so no speed/level bonus.
const hand = block(Blocks.GRASS);

describe('breakSeconds — vanilla break-time formula', () => {
  it('stone: hand is slow; correct pickaxe scales by tier speed', () => {
    const stone = blockDef(Blocks.STONE);
    expect(breakSeconds(stone, hand)).toBeCloseTo(7.5, 5); // 1.5*5/1
    expect(breakSeconds(stone, tool(ToolType.Pickaxe, Tier.Wood))).toBeCloseTo(1.125, 5); // 1.5*1.5/2
    expect(breakSeconds(stone, tool(ToolType.Pickaxe, Tier.Diamond))).toBeCloseTo(0.28125, 5); // 1.5*1.5/8
    expect(breakSeconds(stone, tool(ToolType.Pickaxe, Tier.Netherite))).toBeCloseTo(0.25, 5); // 1.5*1.5/9
  });

  it('wrong tool gives no bonus (axe on stone == hand on stone)', () => {
    const stone = blockDef(Blocks.STONE);
    expect(breakSeconds(stone, tool(ToolType.Axe, Tier.Diamond))).toBeCloseTo(7.5, 5);
  });

  it('iron ore is gated by mining level, not just speed', () => {
    const ironOre = blockDef(Blocks.IRON_ORE);
    // wood pickaxe: correct tool but level 0 < tierNeeded 1 → slow 5x path
    expect(breakSeconds(ironOre, tool(ToolType.Pickaxe, Tier.Wood))).toBeCloseTo(7.5, 5); // 3*5/2
    // stone pickaxe: level 1 >= 1 → fast 1.5x path
    expect(breakSeconds(ironOre, tool(ToolType.Pickaxe, Tier.Stone))).toBeCloseTo(1.125, 5); // 3*1.5/4
  });

  it('gold quirk: fastest speed but lowest mining level', () => {
    const stone = blockDef(Blocks.STONE);
    const ironOre = blockDef(Blocks.IRON_ORE);
    // gold (speed 12, level 0) is the fastest tier on stone…
    expect(breakSeconds(stone, tool(ToolType.Pickaxe, Tier.Gold))).toBeCloseTo(0.1875, 5); // 1.5*1.5/12
    // …but can't fast-harvest iron ore (level 0 < 1) → slow path despite the speed
    expect(breakSeconds(ironOre, tool(ToolType.Pickaxe, Tier.Gold))).toBeCloseTo(1.25, 5); // 3*5/12
  });

  it('blocks that need no tool always take the fast path (just faster with the right tool)', () => {
    const dirt = blockDef(Blocks.DIRT);
    const log = blockDef(Blocks.OAK_LOG);
    expect(breakSeconds(dirt, hand)).toBeCloseTo(0.75, 5); // 0.5*1.5/1
    expect(breakSeconds(dirt, tool(ToolType.Shovel, Tier.Wood))).toBeCloseTo(0.375, 5); // 0.5*1.5/2
    expect(breakSeconds(log, hand)).toBeCloseTo(3, 5); // 2*1.5/1
    expect(breakSeconds(log, tool(ToolType.Axe, Tier.Wood))).toBeCloseTo(1.5, 5); // 2*1.5/2
    // wrong tool on a no-tool-required block: still fast path, no speed bonus
    expect(breakSeconds(log, tool(ToolType.Pickaxe, Tier.Diamond))).toBeCloseTo(3, 5);
  });

  it('glass has no preferred tool — never sped up', () => {
    const glass = blockDef(Blocks.GLASS);
    expect(breakSeconds(glass, hand)).toBeCloseTo(0.45, 5); // 0.3*1.5/1
    expect(breakSeconds(glass, tool(ToolType.Pickaxe, Tier.Diamond))).toBeCloseTo(0.45, 5);
  });

  it('empty hand: no-tool blocks harvest at 1.5x, tool-required at 5x', () => {
    expect(breakSeconds(blockDef(Blocks.DIRT), null)).toBeCloseTo(0.5 * 1.5);
    expect(breakSeconds(blockDef(Blocks.STONE), null)).toBeCloseTo(1.5 * 5);
  });

  it('bedrock and water are unbreakable', () => {
    expect(breakSeconds(blockDef(Blocks.BEDROCK), tool(ToolType.Pickaxe, Tier.Netherite))).toBe(Infinity);
    expect(breakSeconds(blockDef(Blocks.WATER), hand)).toBe(Infinity);
  });
});
