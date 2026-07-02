// Tests for per-block drop tables (src/blocks.ts → DropSpec, src/items.ts →
// dropFor). Drops are gated on canHarvest: wrong tool / insufficient tier
// yields nothing. dropFor is a pure function with no DOM/Three.js dependency,
// so these run in plain node.

import { describe, it, expect } from 'vitest';
import { Blocks, blockDef, Material, ToolType } from '../src/blocks';
import { dropFor, tool, block, material, Tier } from '../src/items';

const d = (id: number) => blockDef(id);
const woodPick = tool(ToolType.Pickaxe, Tier.Wood);
const stonePick = tool(ToolType.Pickaxe, Tier.Stone);

describe('dropFor', () => {
  it('self-drops: dirt by hand drops dirt', () => {
    expect(dropFor(d(Blocks.DIRT), null)).toEqual(block(Blocks.DIRT));
  });
  it('stone: nothing by hand, cobblestone with any pick', () => {
    expect(dropFor(d(Blocks.STONE), null)).toBeNull();
    expect(dropFor(d(Blocks.STONE), woodPick)).toEqual(block(Blocks.COBBLESTONE));
  });
  it('grass drops dirt', () => {
    expect(dropFor(d(Blocks.GRASS), null)).toEqual(block(Blocks.DIRT));
  });
  it('coal ore needs a pick and drops coal', () => {
    expect(dropFor(d(Blocks.COAL_ORE), null)).toBeNull();
    expect(dropFor(d(Blocks.COAL_ORE), woodPick)).toEqual(material(Material.Coal));
  });
  it('iron ore needs stone tier', () => {
    expect(dropFor(d(Blocks.IRON_ORE), woodPick)).toBeNull();
    expect(dropFor(d(Blocks.IRON_ORE), stonePick)).toEqual(material(Material.RawIron));
  });
  it('leaves and glass drop nothing', () => {
    expect(dropFor(d(Blocks.OAK_LEAVES), null)).toBeNull();
    expect(dropFor(d(Blocks.GLASS), null)).toBeNull();
  });
});
