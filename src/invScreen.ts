// ---------------------------------------------------------------------------
// Survival inventory screen (E). Split in two halves:
//  - InvCursor: pure cursor-stack transactions over the shared Inventory
//    (vanilla pickup/place/merge/swap/split rules) — no DOM, unit-tested.
//  - InvScreen (further down): the DOM panel + mouse-riding cursor icon.
// ---------------------------------------------------------------------------

import { Inventory, ItemStack } from './inventory';
import { itemKey, maxStack } from './items';

export class InvCursor {
  /** The stack riding on the mouse, or null when the hand is empty. */
  cursor: ItemStack | null = null;

  constructor(private inv: Inventory) {}

  /** Vanilla left-click: pick up / place / merge (same item) / swap. */
  leftClick(slot: number): void {
    const s = this.inv.slots[slot];
    if (!this.cursor) {
      if (!s) return;
      this.cursor = s;
      this.inv.slots[slot] = null;
      return;
    }
    if (!s) {
      this.inv.slots[slot] = this.cursor;
      this.cursor = null;
      return;
    }
    if (itemKey(s.item) === itemKey(this.cursor.item)) {
      const take = Math.min(maxStack(s.item) - s.count, this.cursor.count);
      s.count += take;
      this.cursor.count -= take;
      if (this.cursor.count === 0) this.cursor = null;
      return;
    }
    this.inv.slots[slot] = this.cursor;
    this.cursor = s;
  }
}
