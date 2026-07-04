# Inventory Screen Implementation Plan (Survival v1, slice ②)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Press E in survival to open a 36-slot inventory screen with a vanilla-style drag/drop item cursor; close returns any held stack to the inventory (overflow drops at the player's feet).

**Architecture:** A pure-logic `InvCursor` (cursor-stack transactions over the existing `Inventory`, fully unit-tested in node) plus a thin DOM view `InvScreen` (slot grid + cursor icon, mirroring the existing hotbar/picker DOM patterns). `main.ts` wires E/Esc, pointer-lock choreography (copied from the creative picker), HUD sync, and overflow drops. Creative is untouched.

**Tech Stack:** TypeScript, Vite, vitest, DOM (no Three.js in the new module).

## Global Constraints

- Conventional Commits for every commit message (`feat(scope): …`, `test: …`).
- Creative mode must remain byte-for-byte unchanged (E opens the picker, no inventory screen).
- `Inventory.add`/`consume` signatures must not change; the cursor mutates `inventory.slots` directly under existing stack rules (`itemKey`, `maxStack`).
- New logic modules must run in plain node (no DOM/Three.js imports in the logic half) — same rule as `inventory.ts`.
- All 71 existing tests must stay green; `npx tsc --noEmit` must stay clean.

---

### Task 1: `GameRules.inventoryScreen` flag

**Files:**
- Modify: `src/gamemode.ts`
- Test: `test/gamemode.test.ts` (create)

**Interfaces:**
- Produces: `GameRules` gains `inventoryScreen: boolean` — true in survival, false in creative. Task 5 reads `rules.inventoryScreen` in the E handler.

- [ ] **Step 1: Write the failing test**

```ts
// test/gamemode.test.ts
// Pins the per-mode rules table: creative = sandbox (fly/picker, no survival
// systems), survival = the inverse, including the slice-2 inventory screen.
import { describe, it, expect } from 'vitest';
import { rulesFor } from '../src/gamemode';

describe('rulesFor', () => {
  it('creative: fly + picker, no drops/consume/inventory screen', () => {
    expect(rulesFor('creative')).toEqual({
      fly: true, picker: true, drops: false, consumeOnPlace: false, inventoryScreen: false,
    });
  });
  it('survival: no fly/picker, drops + consume + inventory screen', () => {
    expect(rulesFor('survival')).toEqual({
      fly: false, picker: false, drops: true, consumeOnPlace: true, inventoryScreen: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/gamemode.test.ts`
Expected: FAIL — `rulesFor` result has no `inventoryScreen` key (toEqual mismatch).

- [ ] **Step 3: Add the flag**

In `src/gamemode.ts`, add to `GameRules`:

```ts
export interface GameRules {
  fly: boolean; // F / double-space fly toggle available
  picker: boolean; // E opens the creative item picker
  drops: boolean; // breaking spawns item entities
  consumeOnPlace: boolean; // placing decrements the held stack
  inventoryScreen: boolean; // E opens the survival inventory screen
}

export function rulesFor(mode: GameMode): GameRules {
  const creative = mode === 'creative';
  return {
    fly: creative,
    picker: creative,
    drops: !creative,
    consumeOnPlace: !creative,
    inventoryScreen: !creative,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/gamemode.test.ts` → PASS. Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/gamemode.ts test/gamemode.test.ts
git commit -m "feat(gamemode): add inventoryScreen rule (survival-only)"
```

---

### Task 2: `InvCursor.leftClick` — pickup / place / merge / swap

**Files:**
- Create: `src/invScreen.ts` (logic half only in this task)
- Test: `test/invCursor.test.ts` (create)

**Interfaces:**
- Consumes: `Inventory` (`slots: (ItemStack|null)[]`, `add(item, count): number`) from `src/inventory.ts`; `itemKey(item)`, `maxStack(item)` from `src/items.ts`.
- Produces: `class InvCursor { cursor: ItemStack | null; constructor(inv: Inventory); leftClick(slot: number): void }` — Tasks 3–4 extend this class; Task 5's DOM layer calls it.

- [ ] **Step 1: Write the failing tests**

```ts
// test/invCursor.test.ts
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
  it('tools (maxStack 1) never merge — a second tool swaps instead', () => {
    const { inv, cur } = mk();
    inv.slots[0] = { item: pick, count: 1 };
    inv.slots[1] = { item: pick, count: 1 };
    cur.leftClick(0); // cursor: pick
    cur.leftClick(1); // same itemKey but limit 1 → merge transfers 0; stays on cursor
    expect(inv.slots[1]).toEqual({ item: pick, count: 1 });
    expect(cur.cursor).toEqual({ item: pick, count: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/invCursor.test.ts`
Expected: FAIL — `Cannot find module '../src/invScreen'`.

- [ ] **Step 3: Implement `InvCursor.leftClick`**

```ts
// src/invScreen.ts
// ---------------------------------------------------------------------------
// Survival inventory screen (E). Split in two halves:
//  - InvCursor: pure cursor-stack transactions over the shared Inventory
//    (vanilla pickup/place/merge/swap/split rules) — no DOM, unit-tested.
//  - InvScreen (added in a later task): the DOM panel + cursor icon.
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/invCursor.test.ts` → 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/invScreen.ts test/invCursor.test.ts
git commit -m "feat(inventory): InvCursor left-click transactions (pickup/place/merge/swap)"
```

---

### Task 3: `InvCursor.rightClick` — half pickup / place one

**Files:**
- Modify: `src/invScreen.ts`
- Test: `test/invCursor.test.ts` (append)

**Interfaces:**
- Produces: `rightClick(slot: number): void` on `InvCursor` (Task 5 maps mouse button 2 to it).

- [ ] **Step 1: Write the failing tests (append to `test/invCursor.test.ts`)**

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/invCursor.test.ts`
Expected: FAIL — `cur.rightClick is not a function`.

- [ ] **Step 3: Implement `rightClick` (add method to `InvCursor`)**

```ts
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
```

- [ ] **Step 4: Run tests** → all invCursor tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/invScreen.ts test/invCursor.test.ts
git commit -m "feat(inventory): InvCursor right-click (half pickup, place one)"
```

---

### Task 4: `InvCursor.close` — flush cursor, report overflow

**Files:**
- Modify: `src/invScreen.ts`
- Test: `test/invCursor.test.ts` (append)

**Interfaces:**
- Produces: `close(): ItemStack | null` — returns the overflow stack that did not fit (caller drops it in the world), or null. Cursor is always null afterwards. Task 6's `closeInv()` consumes this.

- [ ] **Step 1: Write the failing tests (append)**

```ts
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
```

- [ ] **Step 2: Run to verify they fail** — `cur.close is not a function`.

- [ ] **Step 3: Implement `close` (add method to `InvCursor`)**

```ts
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
```

- [ ] **Step 4: Run the full suite** — `npx vitest run` → all PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/invScreen.ts test/invCursor.test.ts
git commit -m "feat(inventory): InvCursor.close flushes cursor and reports overflow"
```

---

### Task 5: `InvScreen` DOM panel + cursor icon

**Files:**
- Modify: `src/invScreen.ts` (add the view class)
- Modify: `index.html` (panel markup + CSS)

No unit test — DOM layer; verified in-browser in Task 7. Keep all rules in `InvCursor`.

**Interfaces:**
- Consumes: `InvCursor` (Tasks 2–4); `makeItemIcon(item, tiles, px)` from `src/textures.ts`; `.slot`/`.count` CSS already in `index.html`.
- Produces: `class InvScreen { open: boolean; logic: InvCursor; onChange: (() => void) | null; constructor(inv: Inventory); show(tiles: HTMLCanvasElement[]): void; hide(): void }`. `onChange` fires after every click transaction (Task 6 uses it to sync HUD + held mesh). `logic.close()` stays the caller's job (Task 6) so overflow handling lives in `main.ts`.

- [ ] **Step 1: Add markup + CSS to `index.html`**

After the `#picker` div (line ~154), add:

```html
    <div id="invScreen" class="hidden">
      <div class="panel">
        <div id="invTitle">Inventory     ·     [E] / [Esc] close</div>
        <div id="invGrid"></div>
        <div id="invHotbarRow"></div>
      </div>
    </div>
    <div id="invCursorIcon" class="hidden"></div>
```

In the `<style>` block, after the `.pcell canvas` rule (line ~134), add:

```css
      /* Survival inventory screen (E) */
      #invScreen {
        position: fixed; inset: 0; z-index: 25;
        display: flex; align-items: center; justify-content: center;
        background: rgba(10, 20, 40, 0.55); backdrop-filter: blur(2px);
      }
      #invScreen.hidden { display: none; }
      #invScreen .panel {
        background: rgba(0, 0, 0, 0.6); border: 2px solid #2b2b2b; border-radius: 4px;
        padding: 14px 16px;
      }
      #invTitle {
        color: #fff; font-size: 13px; text-align: center; margin-bottom: 10px;
        text-shadow: 1px 1px 0 #000;
      }
      #invGrid, #invHotbarRow {
        display: grid; grid-template-columns: repeat(9, var(--hotbar-slot));
        gap: 4px; image-rendering: pixelated;
      }
      #invHotbarRow { margin-top: 12px; }
      #invScreen .slot { cursor: pointer; }
      #invScreen .slot:hover { outline: 2px solid #ffffff; outline-offset: 1px; }
      #invCursorIcon {
        position: fixed; z-index: 26; pointer-events: none;
        width: var(--hotbar-slot); height: var(--hotbar-slot);
        transform: translate(-50%, -50%); image-rendering: pixelated;
      }
      #invCursorIcon.hidden { display: none; }
      #invCursorIcon canvas { width: 80%; height: 80%; }
      #invCursorIcon .count {
        position: absolute; right: 2px; bottom: 0;
        font-size: 14px; font-weight: 700; color: #fff;
        text-shadow: 1px 1px 0 #3f3f3f;
      }
```

- [ ] **Step 2: Add the `InvScreen` class to `src/invScreen.ts`**

Append below `InvCursor` (this half touches the DOM, so the file header's
"no DOM" note applies to `InvCursor` only — keep the class comment honest):

```ts
import { makeItemIcon } from './textures';

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
```

Note: `test/invCursor.test.ts` imports from `src/invScreen.ts`, which now
imports `./textures`. If `textures.ts` touches the DOM at module scope and
node import breaks, split the view into `src/invScreenView.ts` instead and
keep `invScreen.ts` logic-only — check by running the suite in Step 3.

- [ ] **Step 3: Verify nothing broke**

Run: `npx vitest run` → all PASS (confirms the node-side import of
`invScreen.ts` still works). `npx tsc --noEmit` → clean.
If the vitest import of `textures` fails at module scope: move `InvScreen`
to `src/invScreenView.ts` (same code, `import { InvCursor } from './invScreen'`)
and update `main.ts` wiring in Task 6 accordingly.

- [ ] **Step 4: Commit**

```bash
git add src/invScreen.ts index.html
git commit -m "feat(inventory): InvScreen DOM panel with drag/drop cursor icon"
```

---

### Task 6: Wire E / Esc / pointer lock / HUD sync / overflow drop in `main.ts`

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `InvScreen` (Task 5), `rules.inventoryScreen` (Task 1), `drops.spawn(item, count, x, y, z)` (existing), `syncHotbar()` (existing, `main.ts:60`), `player.pos` (feet centre).

- [ ] **Step 1: Construct the screen**

After `const picker = new Picker(tiles);` (`main.ts:67`) there is no inventory
yet (it is created in `choose()`), so construct the screen lazily alongside it.
In `choose()` (`main.ts:100`), inside the `if (m === 'survival')` branch after
`inventory = new Inventory();`, add:

```ts
      invScreen = new InvScreen(inventory);
      invScreen.onChange = syncHotbar;
```

and declare next to the other mode state (`main.ts:93`):

```ts
let invScreen: InvScreen | null = null;
```

with the import at the top:

```ts
import { InvScreen } from './invScreen';
```

- [ ] **Step 2: Open/close helpers (mirror the picker's, `main.ts:139-148`)**

```ts
// --- survival inventory screen (E) ---
function openInv() {
  if (!rules.inventoryScreen || !invScreen || !started || invScreen.open || !input.locked) return;
  invScreen.show(tiles); // pointer released below; onLockChange keeps overlay hidden
  document.exitPointerLock();
}
function closeInv() {
  if (!invScreen || !invScreen.open) return;
  const overflow = invScreen.logic.close();
  if (overflow && inventory) {
    // vanilla: what the hand can't stow gets thrown out — drop it at the feet
    drops.spawn(overflow.item, overflow.count, player.pos.x, player.pos.y + 0.9, player.pos.z);
  }
  invScreen.hide();
  syncHotbar();
  input.requestLock(); // gesture-safe: called from the keydown handler below
}
```

- [ ] **Step 3: Extend the E/Esc keydown handler (`main.ts:149-159`)**

```ts
window.addEventListener('keydown', (e) => {
  if (e.repeat) return; // ignore OS key-repeat so a held key can't thrash the picker
  if (e.code === 'KeyE') {
    if (!started) return;
    e.preventDefault();
    if (rules.picker) {
      if (picker.open) closePicker();
      else openPicker();
    } else if (rules.inventoryScreen) {
      if (invScreen?.open) closeInv();
      else openInv();
    }
  } else if (e.code === 'Escape') {
    if (picker.open) closePicker();
    else if (invScreen?.open) closeInv();
  }
});
```

- [ ] **Step 4: Extend the pointer-lock guards (`main.ts:121-136`)**

```ts
input.onLockChange = (locked) => {
  // While the picker/inventory screen is open the pointer is intentionally
  // released; keep the start overlay hidden so it doesn't pop up behind it.
  if (picker.open || invScreen?.open) {
    overlayEl.classList.add('hidden');
    return;
  }
  overlayEl.classList.toggle('hidden', locked);
};
input.onLockError = () => {
  // A re-lock was rejected (e.g. closing the panel during Chrome's post-Esc
  // cooldown). Never leave the game stuck unlocked with no UI: close panels
  // and show the start overlay so a fresh click can re-enter.
  picker.close();
  if (invScreen?.open) {
    const overflow = invScreen.logic.close();
    if (overflow && inventory)
      drops.spawn(overflow.item, overflow.count, player.pos.x, player.pos.y + 0.9, player.pos.z);
    invScreen.hide();
    syncHotbar();
  }
  overlayEl.classList.remove('hidden');
};
```

- [ ] **Step 5: Expose for e2e + debug**

Extend the `__game` handle (`main.ts:278`) with `invScreen: () => invScreen`.

- [ ] **Step 6: Full suite + typecheck + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all PASS, tsc clean, build green.

- [ ] **Step 7: Commit**

```bash
git add src/main.ts
git commit -m "feat(inventory): wire E to the survival inventory screen with pointer-lock handling"
```

---

### Task 7: In-browser E2E verification + docs

**Files:**
- Modify: `README.md` (controls table + architecture table)

- [ ] **Step 1: E2E through the real code paths (preview server + `__game`)**

Steps (each verifiable via `preview_eval`/screenshot or manual):
1. Start survival; break dirt bare-handed until the hotbar has a stack of ≥2.
2. Press E → screen opens, pointer released, no pause overlay behind it.
3. Left-click the hotbar stack in the bottom row → cursor icon follows mouse.
4. Left-click an empty backpack cell → stack lands there; HUD hotbar slot
   empties immediately; held mesh switches to the bare arm.
5. Right-click the backpack stack → cursor holds the larger half.
6. Press E with the cursor held → screen closes, cursor stack returned to
   the inventory (no items lost), pointer re-locks.
7. Fill the inventory completely (`__game` loop), reopen, pick up a stack,
   fill its slot via `__game`, close → overflow drop spawns at the feet.
8. Creative regression: E still opens the picker; no inventory screen.
9. Esc path: open the screen, press Esc → same close behaviour.

- [ ] **Step 2: Update `README.md`**

Controls row `| E | Item picker (creative only) |` becomes:

```
| E | Inventory screen (survival) / item picker (creative) |
```

Architecture table: after the `picker.ts` row, add:

```
| `invScreen.ts` | Survival inventory screen: cursor transactions + DOM panel |
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: inventory screen controls + architecture entry"
```

---

## Self-Review Notes

- Spec coverage: rules flag (T1), cursor model incl. all click rules (T2–4),
  DOM panel/cursor icon (T5), E/Esc + lock choreography + HUD sync + overflow
  drop (T6), e2e + creative regression + docs (T7). Persistence, shift-click,
  throwing, crafting: explicitly out of scope per spec.
- Type consistency: `InvCursor.cursor: ItemStack | null`, `close(): ItemStack | null`,
  `InvScreen.logic: InvCursor`, `show(tiles: HTMLCanvasElement[])` used
  consistently across T5/T6.
- Known risk (called out in T5 Step 3): importing `textures.ts` from
  `invScreen.ts` may drag DOM APIs into the vitest import graph; fallback is
  the `invScreenView.ts` split, decided by running the suite.
