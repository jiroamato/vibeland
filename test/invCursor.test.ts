// Tests for the inventory-screen cursor transactions (src/invScreen.ts,
// InvCursor). Vanilla rules: left-click picks up / places / merges / swaps;
// right-click picks up the larger half and places one at a time; close()
// flushes the cursor back into the inventory and reports overflow. Pure
// logic over the existing Inventory — runs in plain node.

import { describe, it, expect } from 'vitest';
import { Inventory } from '../src/inventory';
import { InvCursor } from '../src/invScreen';
import { block, tool, Tier } from '../src/items';
import { Blocks, ToolType } from '../src/blocks';

const dirt = block(Blocks.DIRT);
const sand = block(Blocks.SAND);
const pick = tool(ToolType.Pickaxe, Tier.Wood);
const mk = () => {
  const inv = new Inventory();
  return { inv, cur: new InvCursor(inv) };
};

describe('InvCursor.leftClick', () => {
  it('picks up a whole stack, leaving the slot empty', () => {
    const { inv, cur } = mk();
    inv.slots[3] = { item: dirt, count: 10 };
    cur.leftClick(3);
    expect(cur.cursor).toEqual({ item: dirt, count: 10 });
    expect(inv.slots[3]).toBeNull();
  });
  it('does nothing on an empty slot with an empty cursor', () => {
    const { inv, cur } = mk();
    cur.leftClick(0);
    expect(cur.cursor).toBeNull();
    expect(inv.slots[0]).toBeNull();
  });
  it('places the whole cursor stack into an empty slot', () => {
    const { inv, cur } = mk();
    inv.slots[0] = { item: dirt, count: 5 };
    cur.leftClick(0);
    cur.leftClick(20);
    expect(inv.slots[20]).toEqual({ item: dirt, count: 5 });
    expect(cur.cursor).toBeNull();
  });
  it('merges same items up to the stack limit, remainder stays on the cursor', () => {
    const { inv, cur } = mk();
    inv.slots[0] = { item: dirt, count: 30 };
    inv.slots[1] = { item: dirt, count: 60 };
    cur.leftClick(0); // cursor: 30 dirt
    cur.leftClick(1); // slot 1 tops to 64, cursor keeps 26
    expect(inv.slots[1]).toEqual({ item: dirt, count: 64 });
    expect(cur.cursor).toEqual({ item: dirt, count: 26 });
  });
  it('left-click on a full same-item slot swaps the stacks (vanilla)', () => {
    const { inv, cur } = mk();
    inv.slots[0] = { item: dirt, count: 30 };
    inv.slots[1] = { item: dirt, count: 64 };
    cur.leftClick(0); // cursor: 30 dirt
    cur.leftClick(1); // slot full → swap, not silent no-op
    expect(inv.slots[1]).toEqual({ item: dirt, count: 30 });
    expect(cur.cursor).toEqual({ item: dirt, count: 64 });
  });
  it('swaps different items between cursor and slot', () => {
    const { inv, cur } = mk();
    inv.slots[0] = { item: dirt, count: 7 };
    inv.slots[1] = { item: sand, count: 3 };
    cur.leftClick(0);
    cur.leftClick(1);
    expect(inv.slots[1]).toEqual({ item: dirt, count: 7 });
    expect(cur.cursor).toEqual({ item: sand, count: 3 });
  });
  it('tools (maxStack 1) never merge — clicking swaps identical tools', () => {
    const { inv, cur } = mk();
    inv.slots[0] = { item: pick, count: 1 };
    inv.slots[1] = { item: pick, count: 1 };
    cur.leftClick(0); // cursor: pick
    cur.leftClick(1); // limit 1 → merge takes 0 → full-slot swap; still one each
    expect(inv.slots[1]).toEqual({ item: pick, count: 1 });
    expect(cur.cursor).toEqual({ item: pick, count: 1 });
  });
});

describe('InvCursor.rightClick', () => {
  it('picks up the larger half of an odd stack', () => {
    const { inv, cur } = mk();
    inv.slots[0] = { item: dirt, count: 7 };
    cur.rightClick(0);
    expect(cur.cursor).toEqual({ item: dirt, count: 4 });
    expect(inv.slots[0]).toEqual({ item: dirt, count: 3 });
  });
  it('picking up half of a single-item stack empties the slot', () => {
    const { inv, cur } = mk();
    inv.slots[0] = { item: dirt, count: 1 };
    cur.rightClick(0);
    expect(cur.cursor).toEqual({ item: dirt, count: 1 });
    expect(inv.slots[0]).toBeNull();
  });
  it('places exactly one into an empty slot; cursor nulls at zero', () => {
    const { inv, cur } = mk();
    inv.slots[0] = { item: dirt, count: 2 };
    cur.leftClick(0); // cursor: 2 dirt
    cur.rightClick(10);
    cur.rightClick(11);
    expect(inv.slots[10]).toEqual({ item: dirt, count: 1 });
    expect(inv.slots[11]).toEqual({ item: dirt, count: 1 });
    expect(cur.cursor).toBeNull();
  });
  it('places one onto a same-item stack, but not past the limit', () => {
    const { inv, cur } = mk();
    inv.slots[0] = { item: dirt, count: 10 };
    inv.slots[1] = { item: dirt, count: 64 };
    cur.leftClick(0); // cursor: 10 dirt
    cur.rightClick(1); // full → no-op
    expect(inv.slots[1]).toEqual({ item: dirt, count: 64 });
    expect(cur.cursor).toEqual({ item: dirt, count: 10 });
  });
  it('right-click on a different item swaps, like left-click', () => {
    const { inv, cur } = mk();
    inv.slots[0] = { item: dirt, count: 5 };
    inv.slots[1] = { item: sand, count: 2 };
    cur.leftClick(0);
    cur.rightClick(1);
    expect(inv.slots[1]).toEqual({ item: dirt, count: 5 });
    expect(cur.cursor).toEqual({ item: sand, count: 2 });
  });
});

describe('InvCursor click-at (arbitrary slot arrays)', () => {
  it('leftClickAt/rightClickAt operate on a bare array (craft grids)', () => {
    const { cur } = mk();
    const craft: (typeof cur.cursor)[] = [null, { item: dirt, count: 5 }, null, null];
    cur.leftClickAt(craft, 1);
    expect(cur.cursor).toEqual({ item: dirt, count: 5 });
    expect(craft[1]).toBeNull();
    cur.rightClickAt(craft, 0);
    expect(craft[0]).toEqual({ item: dirt, count: 1 });
    expect(cur.cursor).toEqual({ item: dirt, count: 4 });
  });
});

describe('InvCursor.close', () => {
  it('returns null and flushes the cursor back into the inventory', () => {
    const { inv, cur } = mk();
    inv.slots[0] = { item: dirt, count: 10 };
    cur.leftClick(0);
    expect(cur.close()).toBeNull();
    expect(cur.cursor).toBeNull();
    expect(inv.slots[0]).toEqual({ item: dirt, count: 10 });
  });
  it('returns the overflow when the inventory cannot absorb the cursor', () => {
    const { inv, cur } = mk();
    inv.slots[0] = { item: dirt, count: 64 };
    cur.leftClick(0); // cursor: 64 dirt
    for (let i = 0; i < 36; i++) inv.slots[i] = { item: sand, count: 64 }; // now full
    const overflow = cur.close();
    expect(overflow).toEqual({ item: dirt, count: 64 });
    expect(cur.cursor).toBeNull();
  });
  it('close with an empty cursor is a no-op returning null', () => {
    const { cur } = mk();
    expect(cur.close()).toBeNull();
  });
});
