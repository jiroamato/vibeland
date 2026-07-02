# Survival Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First playable survival slice — mode select on the start screen, Minecraft-style item-entity drops, stacking hotbar inventory, place-consumes-item (spec: `docs/superpowers/specs/2026-07-02-survival-foundation-design.md`).

**Architecture:** New pure-logic modules (`inventory.ts`, `collision.ts`, drop resolution in `items.ts`/`blocks.ts`) each land with vitest suites; rendering/DOM modules (`itemMesh.ts`, `itemEntity.ts`, `gamemode.ts`, UI changes) land behind them and are verified in-browser. Creative mode must stay byte-for-byte identical in behaviour throughout.

**Tech Stack:** TypeScript (strict) + Three.js + Vite + vitest. No new dependencies.

## Global Constraints

- Branch: `feat/survival-foundation` (spec already committed there).
- No new npm dependencies.
- Every new file starts with the repo's banner-comment style (`// ---… // Purpose … // ---…`).
- `npm run typecheck` and `npm test` must pass at every commit; `npm run build` before the PR.
- Creative mode behaviour is frozen: fly, E-picker, pre-filled hotbar, no drops, no consumption, no count badges.
- Tests use vitest, live in `test/`, and run with `npm test` (no DOM available — only import DOM-free modules there: `items.ts`, `blocks.ts`, `inventory.ts`, `collision.ts`, `itemEntity.ts` logic via stubs; never `textures.ts`, `ui.ts`, `held.ts`).
- Tuning constants from the spec: stack max 64 (tools 1), pickup attract 1.4 / absorb 0.5, merge radius 0.5, despawn 300 s, entity cap 256, entity box 0.25×0.25, drop scale 0.25.

---

### Task 1: Material item kind

**Files:**
- Modify: `src/blocks.ts` (add `Material` enum after `ToolType`, ~line 39)
- Modify: `src/items.ts`
- Create: `test/items.test.ts`

**Interfaces:**
- Consumes: existing `Item`, `itemKey`, `Tier` from `items.ts`.
- Produces: `Material` enum (in blocks.ts: `Stick=0, Coal=1, RawIron=2, Diamond=3`); `Item` union gains `{ kind: 'material'; material: Material }`; `material(m): Item`, `materialDisplayName(m): string`, `maxStack(item): number` in items.ts; `itemKey` returns `m:<n>` for materials.

- [ ] **Step 1: Write the failing test**

```ts
// test/items.test.ts
import { describe, it, expect } from 'vitest';
import { Material, Blocks, ToolType } from '../src/blocks';
import { block, tool, material, itemKey, maxStack, materialDisplayName, Tier } from '../src/items';

describe('material items', () => {
  it('itemKey distinguishes all three kinds', () => {
    expect(itemKey(block(Blocks.DIRT))).toBe('b:3');
    expect(itemKey(tool(ToolType.Pickaxe, Tier.Wood))).toBe('t:0:0');
    expect(itemKey(material(Material.Coal))).toBe('m:1');
  });
  it('maxStack: tools 1, blocks and materials 64', () => {
    expect(maxStack(tool(ToolType.Axe, Tier.Stone))).toBe(1);
    expect(maxStack(block(Blocks.STONE))).toBe(64);
    expect(maxStack(material(Material.Stick))).toBe(64);
  });
  it('display names', () => {
    expect(materialDisplayName(Material.RawIron)).toBe('Raw Iron');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/items.test.ts`
Expected: FAIL — `'Material' has no exported member` / `material is not a function`.

- [ ] **Step 3: Implement**

In `src/blocks.ts`, directly after the `ToolType` enum (line 39):

```ts
// Raw material items dropped by blocks (sticks, coal, raw iron…). Lives here
// (not items.ts) for the same reason as ToolType: block drop specs reference
// it without a circular import.
export const enum Material {
  Stick = 0,
  Coal = 1,
  RawIron = 2,
  Diamond = 3,
}
```

In `src/items.ts`: import `Material` from `./blocks`, extend the union, and add helpers:

```ts
import { BlockId, BlockDef, HOTBAR_BLOCKS, ToolType, Material } from './blocks';

export type Item =
  | { kind: 'block'; block: BlockId }
  | { kind: 'tool'; tool: ToolType; tier: Tier }
  | { kind: 'material'; material: Material };

const MATERIAL_NAMES: Record<Material, string> = {
  [Material.Stick]: 'Stick',
  [Material.Coal]: 'Coal',
  [Material.RawIron]: 'Raw Iron',
  [Material.Diamond]: 'Diamond',
};

export function materialDisplayName(m: Material): string {
  return MATERIAL_NAMES[m];
}

export function material(m: Material): Item {
  return { kind: 'material', material: m };
}

/** Stack limit per item: tools are unstackable, everything else stacks to 64. */
export function maxStack(item: Item): number {
  return item.kind === 'tool' ? 1 : 64;
}
```

Replace the `itemKey` ternary with a three-way branch:

```ts
export function itemKey(item: Item): string {
  if (item.kind === 'block') return 'b:' + item.block;
  if (item.kind === 'tool') return 't:' + item.tool + ':' + item.tier;
  return 'm:' + item.material;
}
```

`breakSeconds`'s `item.kind === 'tool'` check already handles the new kind correctly (materials mine at hand speed).

- [ ] **Step 4: Run tests to verify pass** — `npm test` → all green (existing `breakSeconds` suite included).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: material item kind (stick, coal, raw iron, diamond)"`

---

### Task 2: Empty hand — `Item | null` through break/place/held

**Files:**
- Modify: `src/items.ts` (`canHarvest` + `breakSeconds`), `src/interaction.ts`, `src/held.ts`
- Test: `test/breakSeconds.test.ts` (extend)

**Interfaces:**
- Produces: `canHarvest(def: BlockDef, item: Item | null): boolean` and `breakSeconds(def: BlockDef, item: Item | null): number` in items.ts; `Interaction.update(dt, input, player, world, selected: Item | null)`; `HeldItem.setItem(item: Item | null)` (null hides both meshes).
- Survival's empty hotbar slots pass `null` everywhere an `Item` flowed before.

- [ ] **Step 1: Write the failing test** — add to `test/breakSeconds.test.ts`:

```ts
it('empty hand: no-tool blocks harvest at 1.5x, tool-required at 5x', () => {
  expect(breakSeconds(blockDef(Blocks.DIRT), null)).toBeCloseTo(0.5 * 1.5);
  expect(breakSeconds(blockDef(Blocks.STONE), null)).toBeCloseTo(1.5 * 5);
});
```

(Match the existing suite's import style; `breakSeconds`'s parameter type must accept `null`.)

- [ ] **Step 2: Run test** — `npx vitest run` → FAIL (type error / runtime on `item.kind`).
- [ ] **Step 3: Implement**

`src/items.ts` — extract the harvest rule and null-guard both functions (replaces the body of `breakSeconds`):

```ts
/** Can this break yield a drop / take the fast 1.5x path? (vanilla rule) */
export function canHarvest(def: BlockDef, item: Item | null): boolean {
  let correct = false;
  let level = 0;
  if (item && item.kind === 'tool') {
    correct = def.tool !== null && item.tool === def.tool;
    if (correct) level = TIER_LEVEL[item.tier];
  }
  return !def.requiresTool || (correct && level >= def.tierNeeded);
}

export function breakSeconds(def: BlockDef, item: Item | null): number {
  if (!Number.isFinite(def.hardness)) return Infinity;
  let speed = 1;
  if (item && item.kind === 'tool' && def.tool !== null && item.tool === def.tool) {
    speed = TIER_SPEED[item.tier];
  }
  return (def.hardness * (canHarvest(def, item) ? 1.5 : 5)) / speed;
}
```

`src/interaction.ts` — `update(..., selected: Item | null)`; the break key becomes
`const key = hit.x + ',' + hit.y + ',' + hit.z + '|' + (selected ? itemKey(selected) : 'hand');`
and the placement branch guard becomes `if (selected && selected.kind === 'block') {` (with `selected.block` references inside unchanged).

`src/held.ts` — `setItem(item: Item | null)`, `private currentItem: Item | null = null` (already), and at the top:

```ts
setItem(item: Item | null): void {
  const key = item ? itemKey(item) : 'none';
  if (key === this.currentKey) return;
  this.currentKey = key;
  this.currentItem = item;
  if (!item) {
    this.cube.visible = false;
    this.toolPivot.visible = false;
    return;
  }
  // …existing block/tool branches unchanged…
```

- [ ] **Step 4: Run** — `npm test` and `npm run typecheck` → green.
- [ ] **Step 5: Commit** — `feat: empty-hand (null item) support in break/place/held`

---

### Task 3: Drop tables

**Files:**
- Modify: `src/blocks.ts` (`DropSpec`, `BlockDef.drop`, every `def({...})` call), `src/items.ts` (`dropFor`)
- Create: `test/drops.test.ts`

**Interfaces:**
- Produces: `DropSpec = { kind: 'self' } | { kind: 'block'; block: BlockId } | { kind: 'material'; material: Material } | null`; `BlockDef.drop: DropSpec`; `dropFor(def: BlockDef, held: Item | null): Item | null` (count is always 1 this slice).

- [ ] **Step 1: Write the failing test**

```ts
// test/drops.test.ts
import { describe, it, expect } from 'vitest';
import { Blocks, blockDef, Material, ToolType } from '../src/blocks';
import { dropFor, tool, block, material, Tier } from '../src/items';

const d = (id: number) => blockDef(id);
const woodPick = tool(ToolType.Pickaxe, Tier.Wood);
const stonePick = tool(ToolType.Pickaxe, Tier.Stone);

describe('dropFor', () => {
  it('self-drops: dirt by hand drops dirt', () => {
    expect(dropFor(d(Blocks.DIRT), null)).toEqual(block(Blocks.DIRT));
  });
  it('stone: nothing by hand, cobblestone with any pick', () => {
    expect(dropFor(d(Blocks.STONE), null)).toBeNull();
    expect(dropFor(d(Blocks.STONE), woodPick)).toEqual(block(Blocks.COBBLESTONE));
  });
  it('grass drops dirt', () => {
    expect(dropFor(d(Blocks.GRASS), null)).toEqual(block(Blocks.DIRT));
  });
  it('coal ore needs a pick and drops coal', () => {
    expect(dropFor(d(Blocks.COAL_ORE), null)).toBeNull();
    expect(dropFor(d(Blocks.COAL_ORE), woodPick)).toEqual(material(Material.Coal));
  });
  it('iron ore needs stone tier', () => {
    expect(dropFor(d(Blocks.IRON_ORE), woodPick)).toBeNull();
    expect(dropFor(d(Blocks.IRON_ORE), stonePick)).toEqual(material(Material.RawIron));
  });
  it('leaves and glass drop nothing', () => {
    expect(dropFor(d(Blocks.OAK_LEAVES), null)).toBeNull();
    expect(dropFor(d(Blocks.GLASS), null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — FAIL (`drop` missing on BlockDef, `dropFor` not exported).
- [ ] **Step 3: Implement**

`src/blocks.ts` — add above `BlockDef`:

```ts
/** What a block yields when broken with a satisfying tool (see items.dropFor). */
export type DropSpec =
  | { kind: 'self' }
  | { kind: 'block'; block: BlockId }
  | { kind: 'material'; material: Material }
  | null;
```

Add to the `BlockDef` interface: `/** Drop yielded on harvest; null = never drops. */ drop: DropSpec;`

Add `const SELF: DropSpec = { kind: 'self' };` above the `def(...)` calls, then append a `drop` field to every call:

| Block | `drop` value |
|---|---|
| AIR, OAK_LEAVES, GLASS, WATER, BEDROCK | `null` |
| STONE | `{ kind: 'block', block: Blocks.COBBLESTONE }` |
| GRASS | `{ kind: 'block', block: Blocks.DIRT }` |
| COAL_ORE | `{ kind: 'material', material: Material.Coal }` |
| IRON_ORE | `{ kind: 'material', material: Material.RawIron }` |
| DIRT, COBBLESTONE, SAND, OAK_LOG, OAK_PLANKS | `SELF` |

`src/items.ts`:

```ts
/** Resolve a block's drop for the held item, or null (wrong tool / no drop). */
export function dropFor(def: BlockDef, held: Item | null): Item | null {
  if (!def.drop || !canHarvest(def, held)) return null;
  if (def.drop.kind === 'self') return { kind: 'block', block: def.id };
  if (def.drop.kind === 'block') return { kind: 'block', block: def.drop.block };
  return { kind: 'material', material: def.drop.material };
}
```

- [ ] **Step 4: Run** — `npm test` + `npm run typecheck` → green.
- [ ] **Step 5: Commit** — `feat: per-block drop tables gated on can-harvest`

---

### Task 4: Inventory model

**Files:**
- Create: `src/inventory.ts`
- Create: `test/inventory.test.ts`

**Interfaces:**
- Produces: `ItemStack { item: Item; count: number }`; `INV_SIZE = 36`, `HOTBAR_SIZE = 9`; `class Inventory` with `slots: (ItemStack | null)[]`, `add(item: Item, count = 1): number` (returns leftover count, 0 = fully absorbed; merge pass then empty pass, index order = hotbar first), `consume(slot: number, n = 1): boolean` (nulls slot at zero).

- [ ] **Step 1: Write the failing test**

```ts
// test/inventory.test.ts
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
```

- [ ] **Step 2: Run** — FAIL (module not found).
- [ ] **Step 3: Implement**

```ts
// src/inventory.ts
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
```

- [ ] **Step 4: Run** — `npm test` → green.
- [ ] **Step 5: Commit** — `feat: 36-slot survival inventory model`

---

### Task 5: Material sprites & icons

**Files:**
- Modify: `src/textures.ts`

**Interfaces:**
- Consumes: existing `Tile`, `Palette`, `rangesToPts`, `drawShadedMask`, `TIER_PAL`, `HANDLE_PAL`, `TILE_RES`.
- Produces: `materialPixels(m: Material): Uint8ClampedArray` (16×16 RGBA, for the 3D extrusion) and `makeMaterialIcon(m: Material, size = 64): HTMLCanvasElement`; `makeItemIcon` handles `kind === 'material'`.

No vitest (canvas/DOM module); verified by typecheck now, visually in Task 12.

- [ ] **Step 1: Implement** — in `src/textures.ts`, import `Material` in the existing `./blocks` import, then add after `genToolSprite` (~line 529):

```ts
// --- material sprites (stick, coal, raw iron, diamond) ----------------------
const MAT_PAL: Record<Material, Palette> = {
  [Material.Stick]: HANDLE_PAL,
  [Material.Coal]: { outline: [24, 24, 28, 255], base: [52, 52, 58, 255], light: [86, 86, 94, 255], dark: [38, 38, 44, 255] },
  [Material.RawIron]: { outline: [140, 100, 78, 255], base: [216, 176, 148, 255], light: [240, 208, 184, 255], dark: [178, 138, 112, 255] },
  [Material.Diamond]: TIER_PAL[Tier.Diamond],
};

// Silhouettes: stick = 2px diagonal; the rest are shaded lumps/gem.
const MAT_MASK: Record<Material, [number, number][]> = {
  [Material.Stick]: (() => {
    const p: [number, number][] = [];
    for (let s = 0; s <= 8; s++) p.push([3 + s, 12 - s], [4 + s, 12 - s]);
    return p;
  })(),
  [Material.Coal]: rangesToPts([[5, 6, 10], [6, 5, 11], [7, 4, 11], [8, 4, 11], [9, 5, 10], [10, 6, 9]]),
  [Material.RawIron]: rangesToPts([[4, 6, 9], [5, 5, 11], [6, 4, 11], [7, 4, 12], [8, 5, 11], [9, 5, 10], [10, 7, 9]]),
  [Material.Diamond]: rangesToPts([[4, 6, 9], [5, 5, 10], [6, 4, 11], [7, 5, 10], [8, 6, 9], [9, 7, 8]]),
};

const matCanvasCache = new Map<Material, HTMLCanvasElement>();

function materialSpriteCanvas(m: Material): HTMLCanvasElement {
  let cv = matCanvasCache.get(m);
  if (!cv) {
    const t = new Tile();
    drawShadedMask(t, MAT_MASK[m], MAT_PAL[m]);
    cv = t.toCanvas();
    matCanvasCache.set(m, cv);
  }
  return cv;
}

/** 16x16 RGBA pixels for a material sprite (3D drop/held extrusion). */
export function materialPixels(m: Material): Uint8ClampedArray {
  return materialSpriteCanvas(m).getContext('2d')!.getImageData(0, 0, TILE_RES, TILE_RES).data;
}

/** Upscaled flat material icon for the hotbar. */
export function makeMaterialIcon(m: Material, size = 64): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(materialSpriteCanvas(m), 0, 0, TILE_RES, TILE_RES, 0, 0, size, size);
  return cv;
}
```

Replace `makeItemIcon`'s body:

```ts
export function makeItemIcon(item: Item, tiles: HTMLCanvasElement[], size = 64): HTMLCanvasElement {
  if (item.kind === 'block') return makeBlockIcon(item.block, tiles, size);
  if (item.kind === 'tool') return makeToolIcon(item.tool, item.tier, size);
  return makeMaterialIcon(item.material, size);
}
```

- [ ] **Step 2: Verify** — `npm run typecheck` → clean; `npm test` still green.
- [ ] **Step 3: Commit** — `feat: procedural material sprites + icons`

---

### Task 6: Hotbar renders ItemStacks with count badges

**Files:**
- Modify: `src/ui.ts`, `src/main.ts` (picker wiring), `index.html` (badge CSS)

**Interfaces:**
- Produces: `UI.hotbar: (ItemStack | null)[]`, `UI.showCounts: boolean` (false = creative, no badges), `UI.setStacks(stacks: (ItemStack | null)[]): void` (replaces slots 0-8 and re-renders), `UI.setSlotItem(i, item: Item)` (wraps `{ item, count: 1 }` — picker path), `UI.selectedItem: Item | null`.
- Creative default is unchanged visually: `defaultHotbar().map(item => ({ item, count: 1 }))`, `showCounts = false`.

- [ ] **Step 1: Implement `src/ui.ts`**

```ts
import { Item, defaultHotbar } from './items';
import { ItemStack } from './inventory';
import { makeItemIcon } from './textures';
```

Field changes inside `UI`:

```ts
/** The 9 visible hotbar stacks. Creative wraps plain items with count 1. */
hotbar: (ItemStack | null)[] = defaultHotbar().map((item) => ({ item, count: 1 }));
/** Show count badges (survival). Creative leaves them hidden. */
showCounts = false;
```

`renderSlotIcon` becomes:

```ts
private renderSlotIcon(i: number): void {
  const slot = this.slots[i];
  if (!slot) return;
  slot.querySelector('canvas')?.remove();
  slot.querySelector('.count')?.remove();
  const stack = this.hotbar[i];
  if (!stack) return;
  const icon = makeItemIcon(stack.item, this.tiles, 64);
  slot.insertBefore(icon, slot.firstChild);
  if (this.showCounts && stack.count > 1) {
    const badge = document.createElement('span');
    badge.className = 'count';
    badge.textContent = String(stack.count);
    slot.appendChild(badge);
  }
}
```

`setSlotItem` wraps: `this.hotbar[i] = { item, count: 1 };` (rest unchanged). Add:

```ts
/** Survival: mirror inventory slots 0-8 into the hotbar and re-render. */
setStacks(stacks: (ItemStack | null)[]): void {
  for (let i = 0; i < this.hotbar.length; i++) {
    this.hotbar[i] = stacks[i] ?? null;
    this.renderSlotIcon(i);
  }
}

get selectedItem(): Item | null {
  return this.hotbar[this.selected]?.item ?? null;
}
```

(`buildHotbar`'s `forEach` iterates the same array; no change needed there.)

- [ ] **Step 2: `index.html`** — add after the `.slot .num` rule (~line 54):

```css
.slot .count {
  position: absolute; right: 2px; bottom: 0;
  font-size: 14px; font-weight: 700; color: #fff;
  text-shadow: 1px 1px 0 #3f3f3f;
}
```

- [ ] **Step 3: `src/main.ts`** — no signature changes needed (`held.setItem(ui.selectedItem)` and `interaction.update(..., ui.selectedItem)` now flow `Item | null`, which Tasks 2 already accepts). Fix any remaining type errors surfaced by `npm run typecheck` — there should be none beyond these.
- [ ] **Step 4: Verify** — `npm run typecheck` clean; `npm run dev` + preview: creative hotbar looks identical (icons, selection, picker swap still work), no badges anywhere.
- [ ] **Step 5: Commit** — `feat: hotbar renders ItemStack slots with survival count badges`

---

### Task 7: Extract swept-AABB collision

**Files:**
- Create: `src/collision.ts`
- Modify: `src/player.ts` (delete private `collideAxis`, call the shared one)
- Create: `test/collision.test.ts`

**Interfaces:**
- Produces: `SolidAt = (x: number, y: number, z: number) => boolean`; `Box { half: number; height: number }` (AABB around a bottom-centre `pos`); `collideAxis(solidAt: SolidAt, pos: THREE.Vector3, vel: THREE.Vector3, box: Box, axis: 'x' | 'y' | 'z', amount: number): boolean` — moves `pos[axis] += amount`, snaps against solids in the direction of travel, zeroes `vel[axis]` on hit, returns whether it hit.
- `Player` keeps `onGround`/sub-stepping/sneak logic; only the axis resolution moves.

- [ ] **Step 1: Write the failing test**

```ts
// test/collision.test.ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { collideAxis } from '../src/collision';

// solid floor at y < 0, wall at x >= 3
const world = (x: number, y: number, _z: number) =>
  Math.floor(y) < 0 || Math.floor(x) >= 3;
const box = { half: 0.3, height: 1.8 };

describe('collideAxis', () => {
  it('falling onto the floor snaps and reports the hit', () => {
    const pos = new THREE.Vector3(0.5, 0.4, 0.5);
    const vel = new THREE.Vector3(0, -10, 0);
    const hit = collideAxis(world, pos, vel, box, 'y', -0.45);
    expect(hit).toBe(true);
    expect(pos.y).toBeCloseTo(0, 2);
    expect(vel.y).toBe(0);
  });
  it('free fall with no block below moves the full amount', () => {
    const pos = new THREE.Vector3(0.5, 5, 0.5);
    const vel = new THREE.Vector3(0, -10, 0);
    expect(collideAxis(world, pos, vel, box, 'y', -0.4)).toBe(false);
    expect(pos.y).toBeCloseTo(4.6);
  });
  it('walking into a wall snaps to its face', () => {
    const pos = new THREE.Vector3(2.5, 0.1, 0.5);
    const vel = new THREE.Vector3(5, 0, 0);
    const hit = collideAxis(world, pos, vel, box, 'x', 0.4);
    expect(hit).toBe(true);
    expect(pos.x).toBeCloseTo(3 - 0.3, 2);
    expect(vel.x).toBe(0);
  });
});
```

- [ ] **Step 2: Run** — FAIL (module not found).
- [ ] **Step 3: Implement `src/collision.ts`** — a verbatim port of `Player.collideAxis` (player.ts:95-133) with `HALF`/`HEIGHT`/`this` replaced by parameters:

```ts
// ---------------------------------------------------------------------------
// Shared swept-AABB voxel collision, extracted from Player so item entities
// (and future mobs) resolve against the world the same way. pos is the AABB's
// bottom-centre; each call moves ONE axis and snaps against the nearest
// blocking face in the direction of travel (see player.ts for the original
// derivation and the corner-catch rationale).
// ---------------------------------------------------------------------------

import * as THREE from 'three';

const EPS = 1e-3;

export type SolidAt = (x: number, y: number, z: number) => boolean;

export interface Box {
  half: number; // x/z half-extent
  height: number; // y extent above pos
}

/** Move pos on one axis and resolve; zeroes vel[axis] and returns true on hit. */
export function collideAxis(
  solidAt: SolidAt,
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  box: Box,
  axis: 'x' | 'y' | 'z',
  amount: number,
): boolean {
  if (amount === 0) return false;
  const before = pos[axis];
  pos[axis] += amount;

  const lowExt = axis === 'y' ? 0 : box.half;
  const highExt = axis === 'y' ? box.height : box.half;
  const lead = amount > 0 ? before + highExt : before - lowExt;

  const x0 = Math.floor(pos.x - box.half),
    x1 = Math.floor(pos.x + box.half - 1e-9);
  const y0 = Math.floor(pos.y),
    y1 = Math.floor(pos.y + box.height - 1e-9);
  const z0 = Math.floor(pos.z - box.half),
    z1 = Math.floor(pos.z + box.half - 1e-9);

  let hit = false;
  let bound = 0;
  for (let bx = x0; bx <= x1; bx++)
    for (let by = y0; by <= y1; by++)
      for (let bz = z0; bz <= z1; bz++) {
        if (!solidAt(bx + 0.5, by + 0.5, bz + 0.5)) continue;
        const coord = axis === 'x' ? bx : axis === 'y' ? by : bz;
        if (amount > 0 ? coord < lead - EPS : coord + 1 > lead + EPS) continue;
        if (!hit) {
          hit = true;
          bound = coord;
        } else {
          bound = amount > 0 ? Math.min(bound, coord) : Math.max(bound, coord);
        }
      }
  if (!hit) return false;

  pos[axis] = amount > 0 ? bound - highExt - EPS : bound + 1 + lowExt + EPS;
  vel[axis] = 0;
  return true;
}
```

`src/player.ts` — delete the private `collideAxis` method; add imports/fields:

```ts
import { collideAxis, Box } from './collision';
// in the class:
private box: Box = { half: HALF, height: HEIGHT };
private solidCb = (x: number, y: number, z: number) => this.solidAt(x, y, z);
```

In `update`'s sub-step loop, replace the three calls:

```ts
if (collideAxis(this.solidCb, this.pos, this.vel, this.box, 'y', syMove) && syMove < 0) this.onGround = true;

const beforeX = this.pos.x;
collideAxis(this.solidCb, this.pos, this.vel, this.box, 'x', sxMove);
// (sneak-protect blocks unchanged)
const beforeZ = this.pos.z;
collideAxis(this.solidCb, this.pos, this.vel, this.box, 'z', szMove);
```

(The old method set `onGround` internally only for `axis==='y' && amount<0` — the new call site reproduces that exactly.)

- [ ] **Step 4: Run** — `npm test` + `npm run typecheck` green; then `npm run dev` + preview: walk, jump, sneak-edge, fly — movement feels identical.
- [ ] **Step 5: Commit** — `refactor: extract swept-AABB voxel collision for reuse`

---

### Task 8: Shared item meshes (`itemMesh.ts`)

**Files:**
- Create: `src/itemMesh.ts`
- Modify: `src/held.ts` (use the shared builders; render materials in hand)

**Interfaces:**
- Produces: `FACE_SHADE: number[]` (moved from held.ts); `buildSpriteGeometry(px: Uint8ClampedArray): THREE.BufferGeometry` (moved `buildToolGeometry` verbatim, incl. `TOOL_DEPTH = 3/16` renamed `SPRITE_DEPTH`); `applyBlockSkin(geo: THREE.BoxGeometry, baseUV: Float32Array, id: BlockId): void` (the UV+vertex-colour loop from `held.skinBlock`); `buildDropMesh(item: Item, atlas: THREE.Texture): THREE.Mesh` (0.25-scale mesh for any item: block → skinned cube, tool/material → sprite extrusion; transparent + DoubleSide for non-opaque blocks).
- `held.ts` consumes all of these; `setItem`'s tool branch generalises to `item.kind === 'tool' || item.kind === 'material'` using `toolPixels(...)` / `materialPixels(...)`.

- [ ] **Step 1: Create `src/itemMesh.ts`** — move `buildToolGeometry` (held.ts:21-56) verbatim as `buildSpriteGeometry`, move `FACE_SHADE`, add:

```ts
/** Skin a unit BoxGeometry with a block's atlas tiles + baked face shading. */
export function applyBlockSkin(geo: THREE.BoxGeometry, baseUV: Float32Array, id: BlockId): void {
  const def = blockDef(id);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const colors = new Float32Array(24 * 3);
  for (let face = 0; face < 6; face++) {
    const [u0, v0, u1, v1] = tileUV(def.faces[face]);
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      const ou = baseUV[i * 2];
      const ov = baseUV[i * 2 + 1];
      uv.setXY(i, u0 + ou * (u1 - u0), v0 + ov * (v1 - v0));
      const s = FACE_SHADE[face];
      colors[i * 3] = s;
      colors[i * 3 + 1] = s;
      colors[i * 3 + 2] = s;
    }
  }
  uv.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** 0.25-scale world mesh for a dropped item. Caller positions/animates it. */
export function buildDropMesh(item: Item, atlas: THREE.Texture): THREE.Mesh {
  if (item.kind === 'block') {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const baseUV = (geo.getAttribute('uv').array as Float32Array).slice();
    applyBlockSkin(geo, baseUV, item.block);
    const seeThrough = blockDef(item.block).layer !== RenderLayer.Opaque;
    const mat = new THREE.MeshBasicMaterial({
      map: atlas,
      vertexColors: true,
      transparent: seeThrough,
      side: seeThrough ? THREE.DoubleSide : THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(0.25);
    return mesh;
  }
  const px = item.kind === 'tool' ? toolPixels(item.tool, item.tier) : materialPixels(item.material);
  const mesh = new THREE.Mesh(
    buildSpriteGeometry(px),
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  );
  mesh.scale.setScalar(0.25);
  return mesh;
}
```

(Imports: `BlockId, blockDef, RenderLayer` from `./blocks`; `Item` from `./items`; `tileUV, toolPixels, materialPixels` from `./textures`; banner comment on top per house style.)

- [ ] **Step 2: Refactor `src/held.ts`** — delete `buildToolGeometry`, `FACE_SHADE`, `TOOL_DEPTH`; import `{ buildSpriteGeometry, applyBlockSkin, FACE_SHADE }` from `./itemMesh` (FACE_SHADE only if still referenced — `skinBlock` now reduces to the transparency flags + `applyBlockSkin(this.cubeGeom, this.baseUV, id)`). In `setItem`, the tool branch becomes the sprite branch:

```ts
} else {
  this.kind = 'tool';
  this.cube.visible = false;
  this.toolPivot.visible = true;
  let geo = this.toolGeoCache.get(key);
  if (!geo) {
    const px = item.kind === 'tool' ? toolPixels(item.tool, item.tier) : materialPixels(item.material);
    geo = buildSpriteGeometry(px);
    this.toolGeoCache.set(key, geo);
  }
  // …rest unchanged…
```

(Add `materialPixels` to the textures import.)

- [ ] **Step 3: Verify** — `npm run typecheck` + `npm test` green; preview: held block/tool identical to before this task (screenshot compare vs. PR #6 poses).
- [ ] **Step 4: Commit** — `refactor: shared item mesh builders; materials renderable in hand`

---

### Task 9: DropManager (item entities)

**Files:**
- Create: `src/itemEntity.ts`
- Create: `test/itemEntity.test.ts`

**Interfaces:**
- Consumes: `collideAxis` (Task 7), `Inventory` (Task 4), `itemKey`, `maxStack`.
- Produces:

```ts
export interface EntityWorld {
  solidAt(x: number, y: number, z: number): boolean;
  chunkLoaded(wx: number, wz: number): boolean;
}
export class DropManager {
  constructor(world: EntityWorld, meshFactory: (item: Item) => THREE.Object3D, scene: THREE.Scene | null);
  spawn(item: Item, count: number, x: number, y: number, z: number): void;
  update(dt: number, playerPos: THREE.Vector3, inventory: Inventory | null, onPickup: () => void): void;
  get count(): number;
}
```

- Constants: `GRAVITY 24`, box `{ half: 0.125, height: 0.25 }`, `ATTRACT 1.4`, `ABSORB 0.5`, `MERGE 0.5`, `DESPAWN 300` s, `CAP 256`, attract speed `8` m/s, pickup-cooldown after overflow `1.5` s. Pop velocity: `vel = (rand-0.5)*3, 5.5, (rand-0.5)*3`.
- `meshFactory` is injected so tests stub it (`() => new THREE.Object3D()`); main passes `(item) => buildDropMesh(item, atlasTexture)`.

- [ ] **Step 1: Write the failing test**

```ts
// test/itemEntity.test.ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DropManager } from '../src/itemEntity';
import { Inventory } from '../src/inventory';
import { block } from '../src/items';
import { Blocks } from '../src/blocks';

const flat = { solidAt: (_x: number, y: number, _z: number) => y < 0, chunkLoaded: () => true };
const stub = () => new THREE.Object3D();
const dirt = block(Blocks.DIRT);
const mk = () => new DropManager(flat, stub, null);
const settle = (dm: DropManager, s = 120) => { for (let i = 0; i < s; i++) dm.update(1 / 60, FAR, null, () => {}); };
const FAR = new THREE.Vector3(100, 0, 100);

describe('DropManager', () => {
  it('spawned drops fall and settle on the floor', () => {
    const dm = mk();
    dm.spawn(dirt, 1, 0.5, 3, 0.5);
    settle(dm);
    expect(dm.entities[0].pos.y).toBeGreaterThanOrEqual(0);
    expect(dm.entities[0].pos.y).toBeLessThan(0.2);
  });
  it('same-item drops within 0.5 merge', () => {
    const dm = mk();
    dm.spawn(dirt, 1, 0.5, 0.5, 0.5);
    dm.spawn(dirt, 2, 0.7, 0.5, 0.5);
    settle(dm);
    expect(dm.count).toBe(1);
    expect(dm.entities[0].stack.count).toBe(3);
  });
  it('nearby player vacuums the drop into the inventory', () => {
    const dm = mk();
    const inv = new Inventory();
    dm.spawn(dirt, 3, 0.5, 0.5, 0.5);
    let picked = false;
    for (let i = 0; i < 120; i++) dm.update(1 / 60, new THREE.Vector3(1.2, 0, 0.5), inv, () => { picked = true; });
    expect(dm.count).toBe(0);
    expect(picked).toBe(true);
    expect(inv.slots[0]).toEqual({ item: dirt, count: 3 });
  });
  it('full inventory leaves the drop in the world', () => {
    const dm = mk();
    const inv = new Inventory();
    for (let i = 0; i < 36; i++) inv.slots[i] = { item: block(Blocks.SAND), count: 64 };
    dm.spawn(dirt, 1, 0.5, 0.5, 0.5);
    for (let i = 0; i < 120; i++) dm.update(1 / 60, new THREE.Vector3(0.5, 0, 0.5), inv, () => {});
    expect(dm.count).toBe(1);
  });
  it('drops despawn after 300s and the cap culls the oldest', () => {
    const dm = mk();
    dm.spawn(dirt, 1, 0.5, 0.5, 0.5);
    for (let i = 0; i < 320; i++) dm.update(1, FAR, null, () => {});
    expect(dm.count).toBe(0);
    for (let i = 0; i < 300; i++) dm.spawn(block(Blocks.SAND), 1, i * 2, 0.5, 0.5); // spaced: no merging
    expect(dm.count).toBe(256);
  });
});
```

- [ ] **Step 2: Run** — FAIL (module not found).
- [ ] **Step 3: Implement `src/itemEntity.ts`**

```ts
// ---------------------------------------------------------------------------
// Item entities (drops): the small spinning items that pop out of broken
// blocks, fall with the shared voxel collision, merge into piles, and vacuum
// into the player's inventory. Mesh creation is injected so the logic stays
// testable without a DOM (tests pass a stub factory).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { collideAxis, Box } from './collision';
import { Item, itemKey, maxStack } from './items';
import { Inventory, ItemStack } from './inventory';

const GRAVITY = 24;
const BOX: Box = { half: 0.125, height: 0.25 };
const ATTRACT = 1.4; // start flying toward the player
const ABSORB = 0.5; // close enough to collect
const ATTRACT_SPEED = 8;
const MERGE = 0.5;
const DESPAWN = 300; // seconds
const CAP = 256;
const OVERFLOW_COOLDOWN = 1.5; // pause pickup attempts after a full inventory

export interface EntityWorld {
  solidAt(x: number, y: number, z: number): boolean;
  chunkLoaded(wx: number, wz: number): boolean;
}

interface ItemEntity {
  stack: ItemStack;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  cooldown: number;
  mesh: THREE.Object3D;
}

let seed = 9241;
function rand(): number {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}

export class DropManager {
  entities: ItemEntity[] = [];

  constructor(
    private world: EntityWorld,
    private meshFactory: (item: Item) => THREE.Object3D,
    private scene: THREE.Scene | null,
  ) {}

  get count(): number {
    return this.entities.length;
  }

  spawn(item: Item, count: number, x: number, y: number, z: number): void {
    const mesh = this.meshFactory(item);
    const e: ItemEntity = {
      stack: { item, count },
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3((rand() - 0.5) * 3, 5.5, (rand() - 0.5) * 3),
      age: 0,
      cooldown: 0,
      mesh,
    };
    this.entities.push(e);
    this.scene?.add(mesh);
    if (this.entities.length > CAP) this.remove(this.entities[0]);
  }

  private remove(e: ItemEntity): void {
    const i = this.entities.indexOf(e);
    if (i >= 0) this.entities.splice(i, 1);
    this.scene?.remove(e.mesh);
  }

  update(dt: number, playerPos: THREE.Vector3, inventory: Inventory | null, onPickup: () => void): void {
    const target = new THREE.Vector3(playerPos.x, playerPos.y + 0.9, playerPos.z);
    const d = new THREE.Vector3();
    for (const e of [...this.entities]) {
      e.age += dt;
      if (e.age > DESPAWN) {
        this.remove(e);
        continue;
      }
      if (e.cooldown > 0) e.cooldown -= dt;

      d.subVectors(target, e.pos);
      const dist = d.length();
      if (inventory && e.cooldown <= 0 && dist < ATTRACT) {
        if (dist < ABSORB) {
          const leftover = inventory.add(e.stack.item, e.stack.count);
          if (leftover === 0) {
            this.remove(e);
            onPickup();
            continue;
          }
          if (leftover < e.stack.count) onPickup();
          e.stack.count = leftover;
          e.cooldown = OVERFLOW_COOLDOWN;
        } else {
          // magnet: fly straight at the player, ignore terrain
          e.pos.addScaledVector(d.normalize(), Math.min(ATTRACT_SPEED * dt, dist));
          this.sync(e);
          continue;
        }
      }

      if (!this.world.chunkLoaded(e.pos.x, e.pos.z)) continue; // frozen until terrain exists

      e.vel.y -= GRAVITY * dt;
      if (e.vel.y < -40) e.vel.y = -40;
      const dy = e.vel.y * dt; // capture sign: collideAxis zeroes vel on hit
      const onGround = collideAxis(this.world.solidAt.bind(this.world), e.pos, e.vel, BOX, 'y', dy) && dy < 0;
      collideAxis(this.world.solidAt.bind(this.world), e.pos, e.vel, BOX, 'x', e.vel.x * dt);
      collideAxis(this.world.solidAt.bind(this.world), e.pos, e.vel, BOX, 'z', e.vel.z * dt);
      if (onGround) {
        e.vel.x *= Math.max(0, 1 - 10 * dt);
        e.vel.z *= Math.max(0, 1 - 10 * dt);
      }
      this.sync(e);
    }
    this.mergePass();
  }

  private sync(e: ItemEntity): void {
    e.mesh.position.set(e.pos.x, e.pos.y + 0.125 + Math.sin(e.age * 2) * 0.04, e.pos.z);
    e.mesh.rotation.y = e.age * 1.5;
  }

  private mergePass(): void {
    for (let i = 0; i < this.entities.length; i++) {
      const a = this.entities[i];
      const limit = maxStack(a.stack.item);
      for (let j = this.entities.length - 1; j > i; j--) {
        const b = this.entities[j];
        if (itemKey(a.stack.item) !== itemKey(b.stack.item)) continue;
        if (a.stack.count + b.stack.count > limit) continue;
        if (a.pos.distanceTo(b.pos) > MERGE) continue;
        a.stack.count += b.stack.count;
        this.remove(b);
      }
    }
  }
}
```

- [ ] **Step 4: Run** — `npm test` → green (tune nothing; if the settle test is flaky, raise `settle` steps, not the physics).
- [ ] **Step 5: Commit** — `feat: item-entity DropManager (physics, pickup, merge, despawn)`

---

### Task 10: Game modes + start screen

**Files:**
- Create: `src/gamemode.ts`
- Modify: `index.html` (two buttons + CSS), `src/player.ts` (`allowFly`), `src/main.ts` (mode selection), `src/ui.ts` (debug line)

**Interfaces:**
- Produces: `GameMode = 'creative' | 'survival'`; `GameRules { fly, picker, drops, consumeOnPlace: boolean }`; `rulesFor(mode): GameRules`; `Player.allowFly: boolean` (default true; F/double-space ignored when false).

- [ ] **Step 1: `src/gamemode.ts`**

```ts
// ---------------------------------------------------------------------------
// Game modes. Creative is the original sandbox (fly, infinite picker, no
// drops); survival adds the gathering loop. The rules object is the single
// place systems consult, so slice 2-5 features hang new flags here.
// ---------------------------------------------------------------------------

export type GameMode = 'creative' | 'survival';

export interface GameRules {
  fly: boolean; // F / double-space fly toggle available
  picker: boolean; // E opens the creative item picker
  drops: boolean; // breaking spawns item entities
  consumeOnPlace: boolean; // placing decrements the held stack
}

export function rulesFor(mode: GameMode): GameRules {
  const creative = mode === 'creative';
  return { fly: creative, picker: creative, drops: !creative, consumeOnPlace: !creative };
}
```

- [ ] **Step 2: `index.html`** — replace the single play button (line 151) with:

```html
<button class="play" id="playSurvival">Play Survival</button>
<button class="play creative" id="playCreative">Play Creative</button>
```

Add CSS after the `.play:hover` rule: `#overlay .play.creative { background: #3a76ab; text-shadow: 1px 1px 0 #1d3c58; } #overlay .play.creative:hover { background: #4a8cc7; }`
Update the controls line: `E items (creative)` instead of `E items`.

- [ ] **Step 3: `src/player.ts`** — add field `allowFly = true;`; gate the toggle:

```ts
if (this.allowFly && (input.wasPressed('KeyF') || input.consumeDoubleTap('Space'))) {
```

- [ ] **Step 4: `src/main.ts`** — replace the play-button block (lines 73-76):

```ts
import { GameMode, GameRules, rulesFor } from './gamemode';
import { Inventory, HOTBAR_SIZE } from './inventory';

let mode: GameMode | null = null; // chosen on first Play click, then fixed
let rules: GameRules = rulesFor('creative');
let inventory: Inventory | null = null;

const overlayEl = document.getElementById('overlay')!;
const loadingEl = document.getElementById('loading')!;
const survivalBtn = document.getElementById('playSurvival')!;
const creativeBtn = document.getElementById('playCreative')!;

function choose(m: GameMode) {
  if (mode === null) {
    mode = m;
    rules = rulesFor(m);
    player.allowFly = rules.fly;
    if (m === 'survival') {
      inventory = new Inventory();
      ui.showCounts = true;
      ui.setStacks(new Array(HOTBAR_SIZE).fill(null));
      held.setItem(ui.selectedItem);
      survivalBtn.textContent = 'Resume';
      creativeBtn.classList.add('hidden');
    } else {
      creativeBtn.textContent = 'Resume';
      survivalBtn.classList.add('hidden');
    }
  }
  input.requestLock();
}
survivalBtn.addEventListener('click', () => choose('survival'));
creativeBtn.addEventListener('click', () => choose('creative'));
```

Add `.hidden { display: none; }` handling: the buttons need `#overlay .play.hidden { display: none; }` in index.html's CSS.
Gate the picker in `openPicker`: `if (!rules.picker || !started || picker.open || !input.locked) return;`
`ui.ts` debug: change the `Mode:` line to accept the mode — extend `DebugInfo` with `mode: string` and print `Mode: ${d.mode}${d.flying ? ' (fly)' : ''}${d.onGround ? ' (grounded)' : ''}`; main passes `mode: mode ?? 'menu'`.

- [ ] **Step 5: Verify** — preview: creative path identical to today (pick Creative → fly, picker, prefilled hotbar); survival path: empty hotbar, F does nothing, E does nothing.
- [ ] **Step 6: Commit** — `feat: survival/creative mode select on the start screen`

---

### Task 11: Survival wiring — break → drop → pickup → place-consume

**Files:**
- Modify: `src/interaction.ts`, `src/main.ts`

**Interfaces:**
- `Interaction.update` gains a final param:

```ts
export interface SurvivalCtx {
  drops: DropManager;
  inventory: Inventory;
  selectedSlot: number;
  onChange: () => void; // main re-syncs hotbar UI + held item
}
update(dt, input, player, world, selected: Item | null, survival: SurvivalCtx | null): boolean
```

- [ ] **Step 1: `src/interaction.ts`** — import `dropFor` from `./items`, `DropManager` + `Inventory` types; in the break-complete branch (after `world.setBlock(hit.x, hit.y, hit.z, Blocks.AIR);`):

```ts
if (survival) {
  const drop = dropFor(def, selected);
  if (drop) survival.drops.spawn(drop, 1, hit.x + 0.5, hit.y + 0.6, hit.z + 0.5);
}
```

In the placement branch, after the successful `world.setBlock(px, py, pz, selected.block);`:

```ts
if (survival) {
  survival.inventory.consume(survival.selectedSlot);
  survival.onChange();
}
```

- [ ] **Step 2: `src/main.ts`** — construct the manager and adapter after `chunks`:

```ts
import { DropManager, EntityWorld } from './itemEntity';
import { buildDropMesh } from './itemMesh';
import { blockDef } from './blocks';

const entityWorld: EntityWorld = {
  solidAt: (x, y, z) => blockDef(world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))).solid,
  chunkLoaded: (wx, wz) => world.getChunk(floorDiv(Math.floor(wx), CHUNK_SX), floorDiv(Math.floor(wz), CHUNK_SZ)) !== undefined,
};
const drops = new DropManager(entityWorld, (item) => buildDropMesh(item, atlasTexture), scene);

function syncHotbar() {
  if (!inventory) return;
  ui.setStacks(inventory.slots.slice(0, HOTBAR_SIZE));
  held.setItem(ui.selectedItem);
}
```

In the frame loop, replace the interaction call and add the drop update:

```ts
if (started && input.locked) {
  player.update(dt, input);
  const survival = inventory ? { drops, inventory, selectedSlot: ui.selected, onChange: syncHotbar } : null;
  swung = interaction.update(dt, input, player, world, ui.selectedItem, survival);
  drops.update(dt, player.pos, inventory, syncHotbar);
}
```

Extend the debug handle: `(window as any).__game = { …existing…, drops, inventory: () => inventory, mode: () => mode };`

- [ ] **Step 3: Verify types/tests** — `npm run typecheck`, `npm test` green.
- [ ] **Step 4: Commit** — `feat: survival loop wiring (break drops, vacuum pickup, place consumes)`

---

### Task 12: End-to-end verification, docs, PR

**Files:**
- Modify: `README.md` (controls + architecture rows + out-of-scope line)

- [ ] **Step 1: Full suite** — `npm run build` && `npm test` → green.
- [ ] **Step 2: In-browser verification** (preview workflow, click the real buttons with `preview_click`):
  - Creative regression: Play Creative → prefilled hotbar, fly works, picker works, breaking spawns nothing (`__game.drops.count === 0`), placing doesn't decrement.
  - Survival: Play Survival → empty hotbar; `__game.world.setBlock` a dirt column near spawn, break by hand → entity pops, falls, vacuums in; hotbar shows dirt with badge count; break stone by hand → no drop; place dirt → count decrements; place last → slot empties, held mesh vanishes; F and E do nothing.
  - `preview_screenshot` proof of: a drop mid-air, and a badge on the hotbar.
- [ ] **Step 3: README** — controls table: `F | Toggle fly (creative)`; `E | Item picker (creative)`; add architecture rows for `gamemode.ts`, `inventory.ts`, `collision.ts`, `itemMesh.ts`, `itemEntity.ts`; change the out-of-scope line: drop "crafting/inventory" (now in progress), keep the rest, add "furnace/smelting" and "swimming".
- [ ] **Step 4: Commit + PR** — push `feat/survival-foundation`, `gh pr create` describing the slice against the spec, then run the `/greploop` skill until Greptile reports 5/5 with zero unresolved comments and squash-merge titled `… (#N)` (per `MEMORY.md` workflow).
