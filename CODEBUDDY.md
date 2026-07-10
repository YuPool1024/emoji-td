# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## Project Overview

A browser-based **Emoji tower-defense game** ("Emoji 塔防"). Pure vanilla HTML5 Canvas + JavaScript — no framework, no build step, no dependencies. Open `index.html` in a browser to play.

Design doc: `docs/plans/2026-07-10-tower-defense-design.md` (game design + balance). Implementation plan: `docs/plans/2026-07-10-tower-defense-impl.md` (9 tasks, TDD).

## Common Commands

No build/lint. The only tooling is Node-based logic tests:

```bash
node tests/test_map.js          # map: 500 random maps all have >=2 paths; canPlace bounds
node tests/test_balance.js      # balance: 3 difficulty tiers, wave-10 score in (1,3]
node tests/sim_playthrough.js   # headless full-playthrough sim for all 3 tiers (dev tool)
node --check js/<file>.js       # syntax check a single JS file
```

Run all logic tests together:
```bash
node tests/test_map.js && node tests/test_balance.js && node tests/sim_playthrough.js
```

There is **no browser automation**; UI behavior is verified by manual play (`index.html`) or `sim_playthrough.js`, which mirrors `main.js`'s update loop against the real modules.

## Architecture

Eight classic `<script>` tags in `index.html` load in dependency order: `utils → map → towers → enemies → hero → game → [balance] → main`. All run in one shared global scope. `main.js` is an IIFE that reads every other module via `window.X`.

**Browser global-scope rule (critical):** Each module follows this dual pattern:
```js
var CFG = (typeof module !== 'undefined') ? require('./utils.js').CFG : window.CFG;
// ... module body ...
if (typeof module !== 'undefined') module.exports = { /* node */ };
else { window.Symbol = Symbol; /* browser globals */ }
```
- Shared config (`CFG`, `DIFFICULTY`) is declared with `var` (NOT `const`) in `utils.js` only, so other modules can re-declare `var CFG` without a duplicate-`const` SyntaxError. Never add a top-level `const CFG`/`const DIFFICULTY` to another file.
- `const` object exports (e.g. `TOWER_TYPES`, `ENEMY_TYPES`, `GameState`) are NOT auto-attached to `window`; each module must explicitly assign them in its `else` branch. When adding a new module that `main.js` depends on, expose its exports on `window` in the browser branch.

**Module responsibilities:**
- `utils.js` — `CFG` constants, `DIFFICULTY` (easy/normal/hard: `g` growth, `m` count mult, `f` gold mult), helpers (`dist`, `choice`, `randInt`, `clamp`).
- `map.js` — `generateMap()` returns `{grid, start, end}`; `grid` values: `0`=empty, `1`=road, `9`=occupied. `countPaths` uses Dinic max-flow (vertex-split) to guarantee/count ≥2 vertex-disjoint paths. `canPlace(map,r,c)` rejects non-empty or out-of-range cells and any placement that drops paths below 2.
- `towers.js` — `TOWER_TYPES` (6 towers), `makeTower`, `upgradeTower`, `upgradeCost`. Tower fields: `range` (grid cells), `dps`, `splash` (radius), `hitsAir`, `slow`, `dot`.
- `enemies.js` — `ENEMY_TYPES` (7 enemies), `spawnWave(w,diff)` (composition + scaling), `makeEnemy(type,wave,diff)` (HP scales by `g^(wave-1)`). `armor` reduces single-target damage only. `air` enemies hit only by `hitsAir` towers. `buildPathNodes` is a dead stub — pathing lives in `main.js`.
- `hero.js` — `makeHero`, `upgradeHero`, `heroUpgradeCost`, `reviveHero`. `stickCount = 1 + level`; has its own `hp`; `alive` flag.
- `game.js` — `GameState`, `createGame`, `startNextWave`, `onKill`, `grantWaveReward`. `onKill` bounty = `enemy.gold`; `grantWaveReward` multiplies by `diffCfg.f`.
- `main.js` — the integration: BFS distance-field road pathing (`buildDistField`/`nextStep`, random branch at junctions), enemy/tower/hero update loop, rendering, HUD, input, upgrade/sell UI. Combat constants: `FIRE_INTERVAL=0.5`, shot damage = `dps*0.5`; armor rule is `target.armor>0 && tw.splash===0`; frost applies `slowT`; flame `dot` is applied as instant per-shot damage (not a true DoT timer).

**Balance model:** `balance.js` is design-time only (used by `test_balance.js`); runtime economy is in `game.js`. `CFG.MAX_DPS` (462) is the space-capped DPS ceiling (`TOWER_SLOTS_CAP*BLENDED_DPS + HERO_DPS_BONUS`), not enforced as a hard game limit but is the basis for the documented balance scores.

## Known Constraints / Gotchas

- Enemy movement follows the **road grid** via BFS distance-to-end; enemies must never leave road cells and randomly branch at junctions. Do not make enemies move in straight lines toward the base.
- Hero death: `updateHero` must clear all enemies' `stuck` flag when the hero is absent/dead, or stuck enemies freeze forever and the wave never clears (infinite loop). Preserve this behavior.
- `index.html` is missing the `js/balance.js` script tag — intentional (balance.js is test-only, not used at runtime).
- When changing `DIFFICULTY` in `utils.js` for balancing, re-run `test_balance.js` and `sim_playthrough.js` to confirm all three tiers remain winnable with a competent layout and keep their easy/normal/hard gradient.
