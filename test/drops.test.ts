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

// Full drop matrix: every block id x a representative held item. Pins the whole
// table so a drop-spec edit can never silently change another block's yield.
describe('dropFor matrix', () => {
  const woodAxe = tool(ToolType.Axe, Tier.Wood);
  const woodShovel = tool(ToolType.Shovel, Tier.Wood);
  const goldPick = tool(ToolType.Pickaxe, Tier.Gold);
  const diamondPick = tool(ToolType.Pickaxe, Tier.Diamond);
  const cases: [name: string, id: number, held: ReturnType<typeof tool> | null, expected: unknown][] = [
    ['air / hand', Blocks.AIR, null, null],
    ['stone / hand', Blocks.STONE, null, null],
    ['stone / wood pick', Blocks.STONE, woodPick, block(Blocks.COBBLESTONE)],
    ['stone / axe (wrong tool)', Blocks.STONE, woodAxe, null],
    ['grass / hand', Blocks.GRASS, null, block(Blocks.DIRT)],
    ['grass / shovel', Blocks.GRASS, woodShovel, block(Blocks.DIRT)],
    ['dirt / hand', Blocks.DIRT, null, block(Blocks.DIRT)],
    ['cobblestone / hand', Blocks.COBBLESTONE, null, null],
    ['cobblestone / wood pick', Blocks.COBBLESTONE, woodPick, block(Blocks.COBBLESTONE)],
    ['sand / hand', Blocks.SAND, null, block(Blocks.SAND)],
    ['oak log / hand', Blocks.OAK_LOG, null, block(Blocks.OAK_LOG)],
    ['oak log / axe', Blocks.OAK_LOG, woodAxe, block(Blocks.OAK_LOG)],
    ['oak planks / hand', Blocks.OAK_PLANKS, null, block(Blocks.OAK_PLANKS)],
    ['oak leaves / hand', Blocks.OAK_LEAVES, null, null],
    ['oak leaves / hoe (correct tool, null drop)', Blocks.OAK_LEAVES, tool(ToolType.Hoe, Tier.Wood), null],
    ['glass / hand', Blocks.GLASS, null, null],
    ['glass / diamond pick', Blocks.GLASS, diamondPick, null],
    ['water / hand', Blocks.WATER, null, null],
    ['coal ore / hand', Blocks.COAL_ORE, null, null],
    ['coal ore / wood pick', Blocks.COAL_ORE, woodPick, material(Material.Coal)],
    ['coal ore / axe (wrong tool)', Blocks.COAL_ORE, woodAxe, null],
    ['iron ore / hand', Blocks.IRON_ORE, null, null],
    ['iron ore / wood pick (tier too low)', Blocks.IRON_ORE, woodPick, null],
    ['iron ore / gold pick (gold mines at wood level)', Blocks.IRON_ORE, goldPick, null],
    ['iron ore / stone pick', Blocks.IRON_ORE, stonePick, material(Material.RawIron)],
    ['iron ore / diamond pick', Blocks.IRON_ORE, diamondPick, material(Material.RawIron)],
    ['bedrock / hand', Blocks.BEDROCK, null, null],
    ['bedrock / diamond pick', Blocks.BEDROCK, diamondPick, null],
  ];
  it.each(cases)('%s', (_name, id, held, expected) => {
    expect(dropFor(d(id), held)).toEqual(expected);
  });
});
