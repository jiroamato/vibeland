# Inventory Screen (Survival v1, slice ② of 5)

**Date:** 2026-07-04
**Status:** Draft — scope fixed by the approved milestone decomposition in
`2026-07-02-survival-foundation-design.md` ("Inventory screen — 36-slot UI,
drag/drop item cursor")

## Milestone context

Slice ① (merged as #7) landed game modes, the 36-slot `Inventory` data model,
drop tables, item entities and pickup. The inventory was deliberately built at
full size (36 slots) even though only the hotbar row (0–8) is visible — this
slice adds the screen that shows the other 27 and lets the player rearrange
stacks. Crafting grids (slice ③), health (④) and persistence (⑤) stay out.

## Slice ② goal

Press **E** in survival: the game releases the pointer and shows the inventory
screen — a 9×3 backpack grid (slots 9–35) above the 9-slot hotbar row (slots
0–8), same slot styling as the HUD hotbar. Click a stack to pick it up onto a
cursor icon that follows the mouse; click again to place, merge or swap;
right-click for half/one-at-a-time handling. Press E or Esc to close; whatever
is still on the cursor goes back into the inventory (overflow drops at the
player's feet). The hotbar HUD and held mesh reflect every change immediately.

**Out of scope for this slice:** crafting grids (③), shift-click quick-move,
Q/click-outside throwing, armor slots, number-key slot swapping inside the
screen, creative-mode inventory screen (creative keeps the E picker unchanged),
persistence (⑤).

## Cursor transaction model (`src/invScreen.ts`, pure logic)

The testable core: an `InvCursor` owning `cursor: ItemStack | null` and
operating on the existing `Inventory` in place. All rules are vanilla:

- `leftClick(slot)`:
  - cursor empty + slot occupied → pick up the whole stack.
  - cursor held + slot empty → place the whole cursor stack.
  - cursor held + same item (`itemKey` equal) → merge into the slot up to
    `maxStack`; remainder stays on the cursor.
  - cursor held + different item → swap cursor and slot.
- `rightClick(slot)`:
  - cursor empty + slot occupied → pick up the larger half (`ceil(count/2)`).
  - cursor held + slot empty or same item below its stack limit → place
    exactly one; cursor decrements (nulls at zero). Tools (`maxStack` 1)
    behave like a whole-stack place.
  - cursor held + different item → swap (vanilla behaviour).
- `close(): ItemStack | null` — flushes the cursor back via `inventory.add()`
  and returns the overflow remainder (or null), which the caller spawns as a
  drop. The cursor is always empty afterwards.

No DOM, no Three.js — same testability rule as `inventory.ts`.

## Screen view (`src/invScreen.ts` DOM layer + `index.html`/CSS)

- A centred panel (`#invScreen`, hidden by default) with a 9×3 grid then a
  separated 9-slot hotbar row, reusing the `.slot` styling, `makeItemIcon`
  icons and `.count` badges the HUD hotbar already uses.
- The cursor stack renders as an icon element following `mousemove`
  (pointer-events: none), count badge included.
- Slots re-render only on change (per-slot repaint like `UI.renderSlotIcon`,
  not a full rebuild per click).
- `mousedown` per slot maps button 0/2 to `leftClick`/`rightClick`;
  `contextmenu` is suppressed inside the panel.

## Wiring (`main.ts`, `gamemode.ts`)

- `GameRules` gains `inventoryScreen: boolean` (true in survival, false in
  creative). The E handler becomes: creative → picker (unchanged), survival →
  toggle the inventory screen. Esc closes it too.
- Open: releases pointer lock (`document.exitPointerLock()`), suppresses the
  pause overlay exactly like the picker does (`onLockChange` guard extends to
  `invScreen.open`), pauses gameplay input implicitly (existing
  `input.locked` guards already cover movement/interaction/hotbar keys).
- Close: `close()` overflow (if any) spawns via `drops.spawn` at the player,
  then `input.requestLock()` from the keydown handler (gesture-safe), and the
  lock-error fallback mirrors the picker's (never stuck unlocked with no UI).
- After every transaction and on close: `ui.setStacks(inventory.slots.slice(0,9))`
  and `held.setItem(ui.selectedItem)` so HUD + held mesh stay truthful.

## Testing

- Unit (vitest, node): `InvCursor` transitions — pickup/place/swap/merge with
  remainders, right-click half rounding (odd counts pick up the larger half),
  place-one decrementing to null, tool stacking limits respected, `close()`
  returning overflow when the inventory is full.
- E2E (browser, via `__game`): open with E in survival, move a stack from the
  hotbar to the backpack, split with right-click, close with a cursor stack
  held and verify it lands back in the inventory; verify HUD badge + held
  mesh update; verify creative E still opens the picker.

## Milestone-level invariants

- Creative remains byte-for-byte untouched (no inventory screen, E picker).
- `Inventory` API (`add`/`consume`) is not modified — the cursor model
  manipulates `slots` under the same merge-before-empty rules it already has.
- No persistence: closing the tab loses everything (slice ⑤).
