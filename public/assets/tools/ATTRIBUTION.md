# Tool texture attribution

The tool textures in this directory are taken from **Minetest Game**
(`minetest_game`), the former default game for the Minetest / Luanti voxel
engine. They are Minecraft-style but **not** Mojang assets.

- **Source:** https://github.com/minetest/minetest_game
  - `mods/default/textures/default_tool_*.png` — pickaxe, axe, shovel
  - `mods/farming/textures/farming_tool_*hoe.png` — hoe
- **License:** CC BY-SA 3.0 — https://creativecommons.org/licenses/by-sa/3.0/
- **Authors:** Minetest Game contributors (see the upstream repository's
  `license.txt` for the full per-file author list).

## Tier mapping used by this project

| Vibeland tier | Minetest texture |
|---------------|------------------|
| wood | `wood` |
| stone | `stone` |
| iron | `steel` |
| gold | `mese` (yellow) |
| diamond | `diamond` |
| netherite | derived at runtime by recolouring `steel` |

Per CC BY-SA 3.0, these files — and adaptations such as the runtime netherite
recolour — remain under CC BY-SA 3.0 with attribution to the original authors.
