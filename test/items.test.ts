import { describe, it, expect } from 'vitest';
import { Material, Blocks, ToolType } from '../src/blocks';
import { block, tool, material, itemKey, maxStack, materialDisplayName, Tier } from '../src/items';

describe('material items', () => {
  it('itemKey distinguishes all three kinds', () => {
    expect(itemKey(block(Blocks.DIRT))).toBe('b:3');
    expect(itemKey(tool(ToolType.Pickaxe, Tier.Wood))).toBe('t:0:0');
    expect(itemKey(material(Material.Coal))).toBe('m:1');
  });
  it('maxStack: tools 1, blocks and materials 64', () => {
    expect(maxStack(tool(ToolType.Axe, Tier.Stone))).toBe(1);
    expect(maxStack(block(Blocks.STONE))).toBe(64);
    expect(maxStack(material(Material.Stick))).toBe(64);
  });
  it('display names', () => {
    expect(materialDisplayName(Material.RawIron)).toBe('Raw Iron');
  });
});
