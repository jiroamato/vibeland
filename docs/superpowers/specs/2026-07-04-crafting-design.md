# Crafting (Survival v1, slice ③ of 5)

**Date:** 2026-07-04
**Status:** Draft — scope fixed by the approved milestone decomposition in
`2026-07-02-survival-foundation-design.md` ("Crafting — 2×2 personal grid +
crafting-table 3×3, shaped recipes")

## Milestone context

Slice ② (PR #12) added the inventory screen with the drag/drop cursor. This
slice closes the gathering→making loop: logs become planks, planks become
sticks and a crafting table, and the table unlocks wood/stone tools — the
tiers the milestone caps at (iron/diamond wait for the smelting milestone).

## Slice ③ goal

Open the inventory (E): a 2×2 crafting grid with a result slot sits above the
backpack. Drop a log in → 4 planks appear in the result; click to take them
(consumes one craft's inputs). Craft a crafting table, place it in the world,
right-click it → the same screen opens with a 3×3 grid, where tool recipes
(pickaxe/axe/shovel/hoe in wood and stone) work. Closing any screen returns
grid contents to the inventory; overflow drops at the feet, same as the
cursor rule.

**Out of scope:** furnace/smelting (own milestone), iron+ tool recipes,
shift-click mass crafting, recipe book/hints, shapeless-recipe generality
beyond the 1×1 log→planks case, persistence (slice ⑤).

## Recipe model (`src/crafting.ts`, pure logic)

- `Recipe = { pattern: string[][], key: Record<string, Item>, result: Item, count: number }`
  — pattern rows of single-char cells (`' '` = empty), vanilla-style keys.
- `matchRecipe(grid: (ItemStack|null)[], w: number, h: number): { item: Item; count: number } | null`
  — normalizes the grid's occupied bounding box, compares against each
  recipe's pattern (and its horizontal mirror, so asymmetric tools match
  both hands) by `itemKey`. A recipe matches any grid it fits in, so
  log→planks works in both 2×2 and 3×3.
- `RECIPES` (wood + stone only):
  - 1 oak log → 4 oak planks
  - 1 plank above 1 plank → 4 sticks
  - 2×2 planks → 1 crafting table
  - 3-wide material row + 2 sticks below centre → pickaxe
  - 2×2 material block missing one corner + sticks → axe (mirrored allowed)
  - 1 material + 2 sticks column → shovel
  - 2 materials + hook of sticks → hoe (mirrored allowed)
  - material = oak planks (wood tier) or cobblestone (stone tier)

## Crafting table block

- New `Blocks.CRAFTING_TABLE` (id 14 — first free id after bedrock's 13),
  axe-preferred, hardness 2.5, drops self, opaque/solid.
- Two new procedural tiles (`crafting_table_top`, `crafting_table_side`,
  planks tile reused for the bottom face); resource-pack names follow the
  vanilla layout.
- Craftable via the 2×2 recipe; also added to the creative picker
  automatically (it's a placeable block — `HOTBAR_BLOCKS` stays unchanged,
  the picker lists `allItems()` which already includes every block? — the
  picker lists `HOTBAR_BLOCKS`-derived items, so add the table to the picker
  catalogue explicitly, not to the default creative hotbar).

## Screen integration (`invScreen.ts`)

- `InvScreen` gains a craft area: `craftSlots: (ItemStack|null)[]` (4 or 9,
  chosen at `show()`), rendered as a 2×2 or 3×3 grid plus one result cell.
- Cursor transactions extend to craft slots (same left/right-click rules via
  `InvCursor` operating on a slot-array abstraction).
- Result slot: click with a compatible cursor (empty or same item with room)
  takes ONE craft — result goes to the cursor, every occupied grid cell
  decrements by one, match recomputes.
- `close()` flushes craft slots back through `inventory.add` before the
  cursor, overflow drops at the feet.
- Right-clicking a crafting table block in survival opens the 3×3 variant
  instead of placing a block (vanilla sneak-place is out of scope; noted as
  a follow-up).

## Testing

- Unit: recipe normalization (offset placement matches), mirror matching,
  wrong-material rejection, 2×2-vs-3×3 fit rules, result-take decrements,
  every RECIPES entry has a positive and negative case.
- E2E: log→planks→sticks→table chain in the 2×2; place table, right-click
  opens 3×3; craft a wooden pickaxe; verify it mines stone (existing break
  rules); close with grid contents → returned to inventory.

## Milestone-level invariants

- Creative untouched (no crafting UI; the picker already offers every tool).
- Tool progression stays capped at stone: no iron/gold/diamond recipes.
- `Inventory`/`InvCursor` public APIs unchanged.
