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
  it('swaps different items between cursor and slot', () => {
    const { inv, cur } = mk();
    inv.slots[0] = { item: dirt, count: 7 };
    inv.slots[1] = { item: sand, count: 3 };
    cur.leftClick(0);
    cur.leftClick(1);
    expect(inv.slots[1]).toEqual({ item: dirt, count: 7 });
    expect(cur.cursor).toEqual({ item: sand, count: 3 });
  });
  it('tools (maxStack 1) never merge — the cursor tool stays held', () => {
    const { inv, cur } = mk();
    inv.slots[0] = { item: pick, count: 1 };
    inv.slots[1] = { item: pick, count: 1 };
    cur.leftClick(0); // cursor: pick
    cur.leftClick(1); // same itemKey but limit 1 → merge transfers 0; stays on cursor
    expect(inv.slots[1]).toEqual({ item: pick, count: 1 });
    expect(cur.cursor).toEqual({ item: pick, count: 1 });
  });
});
