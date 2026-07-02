# Survival Foundation (Survival v1, slice ① of 5)

**Date:** 2026-07-02
**Status:** Approved
**Depends on:** tool-based mining (#5)

## Milestone context

Survival v1 turns the creative sandbox into a game. It was scoped as five slices,
each its own spec → plan → PR, in dependency order:

1. **Survival foundation** — this spec: mode select, item/inventory data model,
   drop tables, item entities, pickup, place-consumes.
2. Inventory screen — 36-slot UI, drag/drop item cursor.
3. Crafting — 2×2 personal grid + crafting-table 3×3, shaped recipes.
4. Health — 10 hearts, Minecraft fall damage, death scatters inventory as item
   entities, respawn at spawn.
5. Saving — modified chunks + inventory + position + health to IndexedDB with
   auto-save.

Milestone-level decisions already made: two game modes chosen on the start
screen (creative keeps today's behaviour exactly); Minecraft-style item-entity
drops; stacks of 64; tool progression capped at **stone** this milestone (ores
drop materials-in-waiting; furnace/smelting is its own future milestone —
no iron or diamond tools obtainable in survival until then).

**Explicitly out of scope for the milestone:** mobs, hunger, swimming/drowning,
furnace/smelting, saplings/planting, sounds, item durability, multiplayer,
redstone.

## Slice ① goal

The first playable survival moment: pick **Play Survival**, punch a tree bare-
handed, the log pops out as a spinning item entity, walk over it, it stacks
into the hotbar with a count badge, place it — the count decrements.

**Out of scope for this slice:** inventory screen (E is a no-op in survival),
crafting, health, saving, arm rendering for the empty hand.

## Game modes

- `src/gamemode.ts` (new): `GameMode = 'creative' | 'survival'` plus a helper
  answering per-mode questions (fly allowed? picker allowed? drops spawn?
  placing consumes?). Threaded from `main.ts` into interaction, input, and UI.
- Start screen (`index.html`): **Play Survival** and **Play Creative** buttons
  replace the single Play button. The choice is not persisted (slice ⑤).
- **Creative:** byte-for-byte today's behaviour — fly, E-picker, pre-filled
  infinite hotbar, no drops, no consumption. The `Inventory` class is not used.
- **Survival:** hotbar starts empty; fly toggle disabled; E deliberately no-op
  (muscle memory must not open the creative picker); breaking spawns drops;
  placing consumes.
- Debug escape hatch: mode is reachable via the existing `window.__game`
  handle for live flipping in dev; no key is bound.

## Item & inventory data model

`Item` gains a third kind (in `src/items.ts`):

```ts
type Item =
  | { kind: 'block'; block: BlockId }
  | { kind: 'tool'; tool: ToolType; tier: Tier }
  | { kind: 'material'; material: Material }; // NEW
```

- `Material` enum: `Stick`, `Coal`, `RawIron`, `Diamond`. Sticks feed slice ③
  recipes; the rest make ore mining rewarding now and smelting later.
- Each material gets a procedural 16×16 sprite in `textures.ts` (same pipeline
  as tool sprites; resource packs can override later).
- `itemKey()` extends to materials (`m:<id>`).

`src/inventory.ts` (new, pure logic, no DOM):

```ts
interface ItemStack { item: Item; count: number } // max 64; tools cap at 1
```

- `Inventory`: 36 slots of `ItemStack | null`; slots 0–8 are the hotbar. Full
  size from day one even though the backpack UI is slice ② — no rebuild later.
- `add(stack): ItemStack | null` — merge into existing stacks first, then fill
  empty slots, hotbar first (Minecraft order). Returns the overflow remainder
  (caller leaves it in the world), or null if fully absorbed.
- `consumeSelected()` — decrement the selected hotbar stack; null at zero.
- Hotbar slots become nullable: `ui.ts` renders empty cells and a bottom-right
  count badge (hidden at count 1); `held.ts` renders nothing for a null slot.

## Drop tables

`BlockDef` (in `blocks.ts`) gains a `drop` field resolved on successful break:

| Block | Drop |
|---|---|
| dirt, sand, cobblestone, planks, log | itself |
| stone | cobblestone |
| grass | dirt |
| coal_ore | Coal ×1 (material) |
| iron_ore | RawIron ×1 (material) |
| leaves, glass, bedrock, water | nothing |

A drop only occurs when the break satisfies the existing can-harvest rule
(`requiresTool` / `tierNeeded` from the tool-mining spec): stone broken by hand
breaks slowly and drops nothing, exactly like Minecraft.

## Item entities

`src/itemEntity.ts` (new): a `DropManager` owning a flat, world-global list.

```ts
interface ItemEntity { stack: ItemStack; pos: V3; vel: V3; age: number; mesh: Object3D }
```

- **Spawn:** at broken-block center with a small random upward "pop" velocity.
  Death-drops (slice ④) reuse the same spawn call.
- **Physics:** gravity + the player's swept-AABB voxel collision (extracted for
  reuse) with a ~0.25 box and ground friction, stepped with frame `dt`.
  Entities in unloaded/unmeshed chunks skip physics that frame so they never
  fall through missing terrain. Drops in water sink (no buoyancy this slice).
- **Pickup:** within ~1.4 blocks, lerp to the player over ~0.15 s, then
  `inventory.add()`. Overflow remainder stays in the world with a short pickup
  cooldown to avoid thrashing. Creative never picks up (no drops exist).
- **Merging:** same-item entities within ~0.5 blocks merge stacks.
- **Despawn:** at 5 minutes of age; hard cap ~256 live entities, oldest culled
  first.
- **Rendering:** block drops are mini atlas-skinned cubes (cube-skinning logic
  extracted from `held.ts`, scale ~0.25); tool/material drops reuse the sprite-
  extrusion geometry (`buildToolGeometry` generalised to any 16×16 sprite).
  Slow spin + bob. Flat-lit with the baked per-face shading this slice;
  skylight tinting is a named polish follow-up, not part of this spec.
- **No entity-to-entity physics** (drops don't push each other) — intentional
  simplification, invisible in practice.

## Wiring

- `interaction.ts`: survival break path calls `dropManager.spawn()`; placement
  calls `inventory.consumeSelected()` and refuses on empty/null slot.
- `main.ts`: constructs the mode from the start-screen choice, adds
  `dropManager.update(dt, player, inventory)` to the frame loop.

## Testing

Vitest (pure logic, alongside the existing `breakSeconds` suite):

- Inventory: add/merge across partial stacks, overflow returns remainder,
  hotbar-first fill order, consume-to-zero nulls the slot, tools don't stack.
- Drop tables: block × tool × tier matrix — stone-by-hand → nothing,
  stone-by-any-pick → cobblestone, ores → materials, leaves → nothing.

In-browser via the preview workflow: pop arc, settling on terrain, pickup
vacuum, stack merging, despawn cap, count badges, place-consume, and creative
regression (no drops, picker intact).

## Edge cases pinned down

- Full inventory: the drop stays on the ground — no silent loss.
- Placing your last block: slot nulls, held mesh disappears.
- Breaking in creative: no entities at all.
- E in survival: explicit no-op this slice.
- Entities over unloaded terrain: physics paused, never fall through.
