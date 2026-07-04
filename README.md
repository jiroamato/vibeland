# Vibeland — a from-scratch Minecraft-like

A browser voxel sandbox built from scratch in **TypeScript + Three.js + Vite**. No game
engines, and no voxel/physics libraries — the chunking, meshing, lighting and collision
are all hand-written. No Mojang assets are bundled: block textures are generated as
original 16×16 pixel art in code, and a resource-pack loader lets you drop in your own
pack for an exact look.

## Run it

```bash
npm install
npm run dev      # open the printed http://localhost:5173 URL
```

The start screen offers **Play Survival** and **Play Creative** (either locks the mouse).
Creative is the original sandbox: fly, infinite blocks, item picker. Survival starts with
an empty hotbar — mine bare-handed and blocks pop out as Minecraft-style item drops that
vacuum into a stacking 36-slot inventory; placing consumes items. Craft planks, sticks,
a crafting table and wood/stone tools; watch your 10 hearts — falls past 3 blocks hurt,
and dying scatters your inventory where you fell (respawn at spawn, run back for it).
`npm run build` type-checks and produces a production build in `dist/`.

## Controls

| Input | Action |
|-------|--------|
| Mouse | Look |
| WASD | Move |
| Space | Jump (hold to fly up in fly mode) |
| Shift | Sneak (won't walk off edges) / fly down |
| Ctrl or double-tap W | Sprint |
| F or double-tap Space | Toggle fly (creative only) |
| Left-click (hold) | Break block (crack animation, per-block time) |
| Right-click | Place selected block |
| 1–9 / scroll | Select hotbar slot |
| E | Inventory screen with 2×2 crafting (survival) / item picker (creative) |
| Right-click a crafting table | 3×3 crafting screen (survival) |
| F3 | Debug overlay (FPS, XYZ, facing, chunk) |
| Esc | Release mouse |

## Resource packs

Click **"Load a resource pack folder…"** on the start screen and pick a pack folder. It
reads the standard layout `assets/minecraft/textures/block/<name>.png` and swaps the
matching tiles (stone, dirt, grass_block_top/side, cobblestone, sand, oak_log(_top),
oak_planks, oak_leaves, glass, water_still, coal_ore, iron_ore, bedrock). Vanilla-
resolution (16×16) packs match 1:1; higher-resolution packs are downsampled to 16px.

## Architecture (`src/`)

| Module | Responsibility |
|--------|----------------|
| `constants.ts` | Chunk dimensions, sea level, render distance, index helpers |
| `noise.ts` | Seedable 2D/3D simplex noise + fBm |
| `blocks.ts` | Block registry: ids, faces, opacity, break times, render layer |
| `textures.ts` | Procedural 16×16 tiles, atlas, isometric hotbar icons |
| `resourcepack.ts` | Loads a local pack and swaps tiles |
| `chunk.ts` | 16×128×16 block + skylight arrays |
| `world.ts` | Chunk store, terrain/ore/tree generation, world-space access |
| `lighting.ts` | Skylight column seed + BFS flood (soft cliffs/overhangs) |
| `mesher.ts` | Face-culled meshing with per-face shading + ambient occlusion |
| `chunkMaterial.ts` | Texture × baked-shade × skylight × day/night shader |
| `chunkManager.ts` | Generate→light→mesh→unload streaming on a frame budget |
| `collision.ts` | Shared swept-AABB voxel collision (player + item entities) |
| `player.ts` | Camera, movement, AABB voxel collision (Minecraft numbers) |
| `input.ts` | Pointer lock, keys, mouse, scroll, double-tap |
| `gamemode.ts` | Survival/creative mode rules consulted by input, picker and interaction |
| `inventory.ts` | 36-slot ItemStack inventory (hotbar = slots 0–8), stack/merge/consume rules |
| `interaction.ts` | Voxel raycast, hold-to-break + crack, placement, outline |
| `itemMesh.ts` | Mesh builders for items: skinned block cubes + 16×16 sprite extrusions |
| `itemEntity.ts` | Item-drop entities: pop physics, merging, vacuum pickup, despawn |
| `sky.ts` | Sky color, fog, sun/moon, clouds, 20-minute day/night |
| `held.ts` | First-person held block (overlay scene) + swing; tools/materials render as sprite extrusions |
| `ui.ts` | Hotbar with stack count badges + F3 debug overlay |
| `invScreen.ts` | Survival inventory screen (E): cursor transactions + DOM panel |
| `crafting.ts` | Shaped recipes: matcher (bounding box + mirror), recipe set, craft-grid state |
| `health.ts` | Survival health: 20 HP, passive regen, vanilla fall-damage formula |
| `main.ts` | Wires everything together and runs the frame loop |

## Out of scope

Multiplayer, mobs, redstone, hunger, sounds, world saving (planned), furnace/smelting (planned), swimming — and crafting is the next slice, so it's off this list.
