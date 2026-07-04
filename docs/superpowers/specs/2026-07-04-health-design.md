# Health (Survival v1, slice ④ of 5)

**Date:** 2026-07-04
**Status:** Draft — scope fixed by the approved milestone decomposition in
`2026-07-02-survival-foundation-design.md` ("Health — 10 hearts, Minecraft
fall damage, death scatters inventory as item entities, respawn at spawn")

## Slice ④ goal

Survival gets stakes: a 10-heart bar above the hotbar, vanilla fall damage
(1 HP per block beyond 3, `ceil`), a brief red flash on damage, and death —
the screen dims to "You died" with a Respawn button, the whole inventory
scatters as item entities at the death spot, and respawning returns the
player to the world spawn with full health. Creative is untouched (no
hearts, no fall damage).

**Out of scope:** hunger (and hunger-gated regen), drowning/lava/mob damage
(no sources exist), armor, difficulty settings, persistence (⑤ — death and
reload both reset to spawn today).

## Health model (`src/health.ts`, pure logic)

- `MAX_HP = 20` (half-heart granularity, 10 hearts).
- `Health`: `hp`, `damage(n)` (clamps at 0, resets the regen timer),
  `heal(n)` (clamps at max), `dead`, `reset()`.
- Passive regen stands in for the excluded hunger system (otherwise there is
  no way to recover): `tick(dt)` heals 1 HP every 4 s while below max —
  peaceful-difficulty style. Damage restarts the interval. Returns whether
  hp changed so the UI only repaints on change.
- `fallDamage(dist) = max(0, ceil(dist - 3 - ε))` — vanilla's formula, with
  an epsilon so a mathematically exact 3-block hop can't tick 1 damage.

## Fall tracking (`src/player.ts`)

- Accumulate `fallDistance` from the per-frame downward position delta while
  airborne and not flying; flying or standing in a liquid resets it to 0
  (falling into water is a safe landing, vanilla behaviour).
- On the frame the player lands, expose `landedFall` (blocks fallen); 0 on
  every other frame. `main.ts` converts it to damage — the Player stays
  ignorant of Health.

## UI (`src/ui.ts`, `index.html`)

- `#hearts` row above the hotbar: 10 CSS hearts, full/half/empty from `hp`
  (`setHealth(hp)`; hidden in creative alongside `showCounts`).
- `#damageFlash`: a red vignette that pulses once per damage event.
- `#deathScreen` overlay (above the pause overlay): "You died" + Respawn.

## Death & respawn (`main.ts`)

- On `hp == 0`: flush the inventory screen if open, scatter every inventory
  stack via `drops.spawn` around the death position (small jitter), clear
  the inventory, release the pointer, show `#deathScreen` (the pause overlay
  stays suppressed behind it).
- Respawn: `player.spawn(0, 0)` (the world-spawn rule the start of the game
  uses), `health.reset()`, hide the overlay, re-lock the pointer
  (gesture-safe: it runs in the button's click handler).
- Item entities persist through death (300 s despawn), so a corpse run is
  possible — that's the vanilla loop.

## Testing

- Unit: Health clamping/regen cadence/damage-resets-regen/reset; fallDamage
  table (3 → 0, 3.5 → 1, 4 → 1, 10 → 7, 0 → 0).
- E2E: teleport up and fall — hearts drop by the predicted amount and the
  flash fires; fall into water — no damage; repeat falls to death — death
  screen shows, inventory scatters as drops at the spot, respawn restores
  20 HP at spawn and the drops remain collectable; creative regression —
  no hearts, no fall damage while flying off cliffs.
