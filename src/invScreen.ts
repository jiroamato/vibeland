// ---------------------------------------------------------------------------
// Survival inventory screen (E). Split in two halves:
//  - InvCursor: pure cursor-stack transactions over the shared Inventory
//    (vanilla pickup/place/merge/swap/split rules) — no DOM, unit-tested.
//  - InvScreen (further down): the DOM panel + mouse-riding cursor icon.
// ---------------------------------------------------------------------------

import { Inventory, ItemStack } from './inventory';
import { itemKey, maxStack } from './items';
import { makeItemIcon } from './textures';

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

  /** Vanilla right-click: pick up the larger half / place exactly one. */
  rightClick(slot: number): void {
    const s = this.inv.slots[slot];
    if (!this.cursor) {
      if (!s) return;
      const take = Math.ceil(s.count / 2);
      this.cursor = { item: s.item, count: take };
      s.count -= take;
      if (s.count === 0) this.inv.slots[slot] = null;
      return;
    }
    if (!s) {
      this.inv.slots[slot] = { item: this.cursor.item, count: 1 };
      this.cursor.count -= 1;
      if (this.cursor.count === 0) this.cursor = null;
      return;
    }
    if (itemKey(s.item) === itemKey(this.cursor.item)) {
      if (s.count < maxStack(s.item)) {
        s.count += 1;
        this.cursor.count -= 1;
        if (this.cursor.count === 0) this.cursor = null;
      }
      return;
    }
    this.inv.slots[slot] = this.cursor;
    this.cursor = s;
  }

  /**
   * Return the cursor stack to the inventory (merge-before-empty, hotbar
   * first — Inventory.add's rules). Returns the overflow that did not fit,
   * or null; the caller spawns it as a world drop. Cursor ends empty.
   */
  close(): ItemStack | null {
    if (!this.cursor) return null;
    const left = this.inv.add(this.cursor.item, this.cursor.count);
    const overflow = left > 0 ? { item: this.cursor.item, count: left } : null;
    this.cursor = null;
    return overflow;
  }
}

/** Display order: backpack rows (slots 9-35) on top, hotbar row (0-8) below. */
const GRID_SLOTS = [...Array(27).keys()].map((i) => i + 9);
const HOTBAR_SLOTS = [...Array(9).keys()];

export class InvScreen {
  open = false;
  readonly logic: InvCursor;
  /** Fires after every click transaction so the HUD/held mesh can resync. */
  onChange: (() => void) | null = null;

  private el = document.getElementById('invScreen')!;
  private gridEl = document.getElementById('invGrid')!;
  private hotbarRowEl = document.getElementById('invHotbarRow')!;
  private cursorEl = document.getElementById('invCursorIcon')!;
  private slotEls = new Map<number, HTMLElement>(); // inventory index → cell
  private tiles: HTMLCanvasElement[] = [];

  constructor(private inv: Inventory) {
    this.logic = new InvCursor(inv);
    // Cells are permanent; only their icon/badge children re-render.
    for (const [parent, slots] of [
      [this.gridEl, GRID_SLOTS],
      [this.hotbarRowEl, HOTBAR_SLOTS],
    ] as const) {
      for (const idx of slots) {
        const cell = document.createElement('div');
        cell.className = 'slot';
        cell.addEventListener('mousedown', (e) => {
          if (!this.open) return;
          e.preventDefault();
          if (e.button === 0) this.logic.leftClick(idx);
          else if (e.button === 2) this.logic.rightClick(idx);
          else return;
          this.renderSlot(idx);
          this.renderCursor();
          this.onChange?.();
        });
        parent.appendChild(cell);
        this.slotEls.set(idx, cell);
      }
    }
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.open || !this.logic.cursor) return;
      this.cursorEl.style.left = e.clientX + 'px';
      this.cursorEl.style.top = e.clientY + 'px';
    });
  }

  show(tiles: HTMLCanvasElement[]): void {
    this.tiles = tiles;
    this.open = true;
    for (const idx of this.slotEls.keys()) this.renderSlot(idx);
    this.renderCursor();
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.open = false;
    this.el.classList.add('hidden');
    this.cursorEl.classList.add('hidden');
  }

  /** Repaint one cell's icon + count badge from the inventory (or clear it). */
  private renderSlot(idx: number): void {
    const cell = this.slotEls.get(idx)!;
    cell.innerHTML = '';
    const stack = this.inv.slots[idx];
    if (!stack) return;
    cell.appendChild(makeItemIcon(stack.item, this.tiles, 64));
    if (stack.count > 1) {
      const badge = document.createElement('span');
      badge.className = 'count';
      badge.textContent = String(stack.count);
      cell.appendChild(badge);
    }
  }

  /** Repaint the mouse-riding stack (hidden when the hand is empty). */
  private renderCursor(): void {
    const stack = this.logic.cursor;
    this.cursorEl.classList.toggle('hidden', !stack);
    this.cursorEl.innerHTML = '';
    if (!stack) return;
    this.cursorEl.appendChild(makeItemIcon(stack.item, this.tiles, 64));
    if (stack.count > 1) {
      const badge = document.createElement('span');
      badge.className = 'count';
      badge.textContent = String(stack.count);
      this.cursorEl.appendChild(badge);
    }
  }
}
