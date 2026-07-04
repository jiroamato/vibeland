// ---------------------------------------------------------------------------
// Survival inventory screen (E). Split in two halves:
//  - InvCursor: pure cursor-stack transactions over the shared Inventory
//    (vanilla pickup/place/merge/swap/split rules) — no DOM, unit-tested.
//  - InvScreen (further down): the DOM panel + mouse-riding cursor icon.
// ---------------------------------------------------------------------------

import { Inventory, ItemStack } from './inventory';
import { itemKey, maxStack } from './items';
import { makeItemIcon } from './textures';
import { CraftArea } from './crafting';

export class InvCursor {
  /** The stack riding on the mouse, or null when the hand is empty. */
  cursor: ItemStack | null = null;

  constructor(private inv: Inventory) {}

  /** Vanilla left-click: pick up / place / merge (same item) / swap. */
  leftClick(slot: number): void {
    this.leftClickAt(this.inv.slots, slot);
  }

  /** leftClick against any slot array (the craft grid uses this). */
  leftClickAt(slots: (ItemStack | null)[], slot: number): void {
    const s = slots[slot];
    if (!this.cursor) {
      if (!s) return;
      this.cursor = s;
      slots[slot] = null;
      return;
    }
    if (!s) {
      slots[slot] = this.cursor;
      this.cursor = null;
      return;
    }
    if (itemKey(s.item) === itemKey(this.cursor.item)) {
      const take = Math.min(maxStack(s.item) - s.count, this.cursor.count);
      if (take === 0) {
        // slot already at capacity: vanilla falls back to a swap so a full
        // stack is still retrievable while holding the same item
        slots[slot] = this.cursor;
        this.cursor = s;
        return;
      }
      s.count += take;
      this.cursor.count -= take;
      if (this.cursor.count === 0) this.cursor = null;
      return;
    }
    slots[slot] = this.cursor;
    this.cursor = s;
  }

  /** Vanilla right-click: pick up the larger half / place exactly one. */
  rightClick(slot: number): void {
    this.rightClickAt(this.inv.slots, slot);
  }

  /** rightClick against any slot array (the craft grid uses this). */
  rightClickAt(slots: (ItemStack | null)[], slot: number): void {
    const s = slots[slot];
    if (!this.cursor) {
      if (!s) return;
      const take = Math.ceil(s.count / 2);
      this.cursor = { item: s.item, count: take };
      s.count -= take;
      if (s.count === 0) slots[slot] = null;
      return;
    }
    if (!s) {
      slots[slot] = { item: this.cursor.item, count: 1 };
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
    slots[slot] = this.cursor;
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
  /** The active crafting grid (2x2 inventory / 3x3 table), set by show(). */
  craft: CraftArea | null = null;
  /** Fires after every click transaction so the HUD/held mesh can resync. */
  onChange: (() => void) | null = null;

  private el = document.getElementById('invScreen')!;
  private gridEl = document.getElementById('invGrid')!;
  private hotbarRowEl = document.getElementById('invHotbarRow')!;
  private craftGridEl = document.getElementById('invCraftGrid')!;
  private resultEl = document.getElementById('invResult')!;
  private cursorEl = document.getElementById('invCursorIcon')!;
  private slotEls = new Map<number, HTMLElement>(); // inventory index → cell
  private craftEls: HTMLElement[] = []; // craft grid cells, rebuilt per show()
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
          if (e.button === 0) this.logic.leftClick(idx);
          else if (e.button === 2) this.logic.rightClick(idx);
          else return; // middle/aux buttons keep their browser defaults
          e.preventDefault();
          this.renderSlot(idx);
          // snap the icon to the click point so a fresh pickup never flashes
          // at a stale position before the first mousemove
          this.renderCursor(e.clientX, e.clientY);
          this.onChange?.();
        });
        parent.appendChild(cell);
        this.slotEls.set(idx, cell);
      }
    }
    // Result slot: left-click takes ONE craft if the cursor is compatible.
    this.resultEl.addEventListener('mousedown', (e) => {
      if (!this.open || !this.craft || e.button !== 0) return;
      e.preventDefault();
      this.logic.cursor = this.craft.takeResult(this.logic.cursor);
      this.renderCraft();
      this.renderCursor(e.clientX, e.clientY);
      this.onChange?.();
    });
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.open || !this.logic.cursor) return;
      this.cursorEl.style.left = e.clientX + 'px';
      this.cursorEl.style.top = e.clientY + 'px';
    });
  }

  show(tiles: HTMLCanvasElement[], craftSize: 2 | 3 = 2): void {
    this.tiles = tiles;
    this.open = true;
    this.buildCraftGrid(craftSize);
    for (const idx of this.slotEls.keys()) this.renderSlot(idx);
    this.renderCursor();
    this.el.classList.remove('hidden');
  }

  /** (Re)build the craft cells for this show()'s grid size. */
  private buildCraftGrid(size: 2 | 3): void {
    this.craft = new CraftArea(size, size);
    this.craftGridEl.innerHTML = '';
    this.craftGridEl.style.gridTemplateColumns = `repeat(${size}, var(--hotbar-slot))`;
    this.craftEls = [];
    for (let i = 0; i < size * size; i++) {
      const cell = document.createElement('div');
      cell.className = 'slot';
      cell.addEventListener('mousedown', (e) => {
        if (!this.open || !this.craft) return;
        if (e.button === 0) this.logic.leftClickAt(this.craft.slots, i);
        else if (e.button === 2) this.logic.rightClickAt(this.craft.slots, i);
        else return;
        e.preventDefault();
        this.renderCraft();
        this.renderCursor(e.clientX, e.clientY);
        this.onChange?.();
      });
      this.craftGridEl.appendChild(cell);
      this.craftEls.push(cell);
    }
    this.renderCraft();
  }

  hide(): void {
    this.open = false;
    this.el.classList.add('hidden');
    this.cursorEl.classList.add('hidden');
  }

  /**
   * Flush the craft grid then the cursor back into the inventory. Returns
   * every stack that did not fit; the caller drops them in the world.
   */
  closeAll(): ItemStack[] {
    const overflow = this.craft ? this.craft.flush(this.inv) : [];
    const held = this.logic.close();
    if (held) overflow.push(held);
    return overflow;
  }

  /** Paint an icon + count badge into a cell (cleared first). */
  private paintStack(el: HTMLElement, stack: ItemStack | null): void {
    el.innerHTML = '';
    if (!stack) return;
    el.appendChild(makeItemIcon(stack.item, this.tiles, 64));
    if (stack.count > 1) {
      const badge = document.createElement('span');
      badge.className = 'count';
      badge.textContent = String(stack.count);
      el.appendChild(badge);
    }
  }

  /** Repaint one cell's icon + count badge from the inventory (or clear it). */
  private renderSlot(idx: number): void {
    this.paintStack(this.slotEls.get(idx)!, this.inv.slots[idx]);
  }

  /** Repaint every craft cell and the result preview. */
  private renderCraft(): void {
    if (!this.craft) return;
    this.craftEls.forEach((el, i) => this.paintStack(el, this.craft!.slots[i]));
    const r = this.craft.result();
    this.paintStack(this.resultEl, r ? { item: r.item, count: r.count } : null);
  }

  /** Repaint the mouse-riding stack (hidden when the hand is empty). */
  private renderCursor(x?: number, y?: number): void {
    const stack = this.logic.cursor;
    this.cursorEl.classList.toggle('hidden', !stack);
    this.paintStack(this.cursorEl, stack);
    if (stack && x !== undefined && y !== undefined) {
      this.cursorEl.style.left = x + 'px';
      this.cursorEl.style.top = y + 'px';
    }
  }
}
