// ---------------------------------------------------------------------------
// Survival inventory: 36 slots of ItemStack|null (0-8 are the hotbar). Pure
// data + rules, no DOM: the hotbar UI renders slots 0-8, the inventory screen
// (next slice) will render all 36. add() merges into existing stacks first,
// then fills empty slots, in index order — which is Minecraft's hotbar-first.
// ---------------------------------------------------------------------------

import { Item, itemKey, maxStack } from './items';

export interface ItemStack {
  item: Item;
  count: number;
}

export const INV_SIZE = 36;
export const HOTBAR_SIZE = 9;

export class Inventory {
  slots: (ItemStack | null)[] = new Array(INV_SIZE).fill(null);

  /** Add `count` of `item`. Returns the leftover that did not fit (0 = all in). */
  add(item: Item, count = 1): number {
    const limit = maxStack(item);
    const key = itemKey(item);
    for (let i = 0; i < INV_SIZE && count > 0; i++) {
      const s = this.slots[i];
      if (!s || s.count >= limit || itemKey(s.item) !== key) continue;
      const take = Math.min(limit - s.count, count);
      s.count += take;
      count -= take;
    }
    for (let i = 0; i < INV_SIZE && count > 0; i++) {
      if (this.slots[i]) continue;
      const take = Math.min(limit, count);
      this.slots[i] = { item, count: take };
      count -= take;
    }
    return count;
  }

  /** Remove n from a slot; false (and no change) if it holds fewer than n. */
  consume(slot: number, n = 1): boolean {
    const s = this.slots[slot];
    if (!s || s.count < n) return false;
    s.count -= n;
    if (s.count === 0) this.slots[slot] = null;
    return true;
  }
}
