// Tests for the 36-slot survival inventory model (src/inventory.ts). Pins the
// hotbar-first fill order, merge-before-open-slot behavior, 64-stack splitting,
// leftover reporting when full, non-stacking tools, and consume() nulling a
// slot at zero. Pure logic with no DOM/Three.js dependency.

import { describe, it, expect } from 'vitest';
import { Inventory, INV_SIZE } from '../src/inventory';
import { block, tool, Tier } from '../src/items';
import { Blocks, ToolType } from '../src/blocks';

const dirt = block(Blocks.DIRT);
const sand = block(Blocks.SAND);
const pick = tool(ToolType.Pickaxe, Tier.Wood);

describe('Inventory', () => {
  it('fills hotbar-first in index order', () => {
    const inv = new Inventory();
    inv.add(dirt);
    inv.add(sand);
    expect(inv.slots[0]).toEqual({ item: dirt, count: 1 });
    expect(inv.slots[1]).toEqual({ item: sand, count: 1 });
  });
  it('merges into existing stacks before opening new slots', () => {
    const inv = new Inventory();
    inv.add(dirt, 10);
    inv.add(sand, 1);
    inv.add(dirt, 5);
    expect(inv.slots[0]).toEqual({ item: dirt, count: 15 });
    expect(inv.slots[2]).toBeNull();
  });
  it('tops up a later partial stack before opening an earlier empty slot', () => {
    const inv = new Inventory();
    inv.slots[5] = { item: dirt, count: 60 };
    expect(inv.add(dirt, 10)).toBe(0);
    expect(inv.slots[5]).toEqual({ item: dirt, count: 64 });
    expect(inv.slots[0]).toEqual({ item: dirt, count: 6 });
    expect(inv.slots[1]).toBeNull();
  });
  it('merges across multiple partial stacks in index order', () => {
    const inv = new Inventory();
    inv.slots[2] = { item: dirt, count: 63 };
    inv.slots[7] = { item: dirt, count: 62 };
    inv.add(dirt, 4);
    expect(inv.slots[2]).toEqual({ item: dirt, count: 64 });
    expect(inv.slots[7]).toEqual({ item: dirt, count: 64 });
    expect(inv.slots[0]).toEqual({ item: dirt, count: 1 });
  });
  it('splits past 64 into a new stack', () => {
    const inv = new Inventory();
    inv.add(dirt, 100);
    expect(inv.slots[0]).toEqual({ item: dirt, count: 64 });
    expect(inv.slots[1]).toEqual({ item: dirt, count: 36 });
  });
  it('returns leftover when completely full', () => {
    const inv = new Inventory();
    for (let i = 0; i < INV_SIZE; i++) inv.slots[i] = { item: dirt, count: 64 };
    expect(inv.add(dirt, 5)).toBe(5);
  });
  it('tools never stack', () => {
    const inv = new Inventory();
    inv.add(pick);
    inv.add(pick);
    expect(inv.slots[0]).toEqual({ item: pick, count: 1 });
    expect(inv.slots[1]).toEqual({ item: pick, count: 1 });
  });
  it('consume decrements and nulls at zero', () => {
    const inv = new Inventory();
    inv.add(dirt, 2);
    expect(inv.consume(0)).toBe(true);
    expect(inv.slots[0]).toEqual({ item: dirt, count: 1 });
    expect(inv.consume(0)).toBe(true);
    expect(inv.slots[0]).toBeNull();
    expect(inv.consume(0)).toBe(false);
  });
});
