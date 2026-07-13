# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## Project Overview

A browser-based **Emoji tower-defense game** ("Emoji 塔防"). Pure vanilla HTML5 Canvas + JavaScript — no framework, no build step, no dependencies. Open `index.html` in a browser to play.

The core gameplay (map / balance / towers / enemies / hero / state machine / main loop / audio) is complete, and a full **playability layer** has been built on top of it across three milestones:

- **P1 — 顺手级 (done):** onboarding cards, win/lose panels with failure tips, `node`-based test harness (`test_recipes`/`test_store`/`test_tier3`).
- **P2 — 节奏与深度 (done):** pause + speed controls (`Space` / `1`/`2`/`3`), special-wave recipes, tier-3 ultimate tower upgrades, and a UI component layer (`store.js` state bus + `ui.js` action bus + `panels/`).
- **P3 — 重玩与多英雄 (done):** achievement system (9 achievements, localStorage), daily challenge (UTC-seeded mulberry32 PRNG), and 3 hero types (warrior / mage / hunter) gated by achievements.

Design docs live in `docs/plans/`:
- `2026-07-10-tower-defense-design.md` — original game design + balance.
- `2026-07-10-tower-defense-impl.md` — original 9-task implementation plan (TDD).
- `2026-07-13-playability-roadmap.md` — the P1–P3 playability roadmap (status: §10 confirmed).
- `2026-07-13-p1-playability-impl.md`, `2026-07-13-p2-impl.md`, `2026-07-13-p3-impl.md` — milestone implementation plans.
- `docs/review/2026-07-13-code-review.md` — post-P3 code review notes.

## Common Commands

No build/lint. The only tooling is Node-based logic tests:

```bash
node tests/test_map.js          # map: 500 random maps all have >=2 paths; canPlace bounds
node tests/test_balance.js      # balance: 3 difficulty tiers, wave-10 score in (1,3]
node tests/test_targeting.js    # targeting: range/air-filter/cooldown/suppression diagnostics
node tests/test_recipes.js      # recipes: waves 1..10 map to expected recipeId (swarm..finale)
node tests/test_store.js        # store: setState/subscribe, microtask-merged notify
node tests/test_tier3.js        # tier3: every tower has a tier3 config; applyTier3 sets level 3 + perk
node tests/sim_playthrough.js   # headless full-playthrough sim for all 3 tiers (dev tool; 200-iter hard regression)
node --check js/<file>.js       # syntax check a single JS file
```

Run all logic tests together:
```bash
node tests/test_map.js && node tests/test_balance.js && node tests/test_targeting.js && node tests/test_recipes.js && node tests/test_store.js && node tests/test_tier3.js && node tests/sim_playthrough.js
```

There is **no browser automation**; UI behavior is verified by manual play (`index.html`) or `sim_playthrough.js`, which mirrors `main.js`'s update loop against the real modules.

## Architecture

**The page is no longer 8 `<script>` tags — `index.html` loads 22 classic scripts** in this dependency order:

```
audio → utils → map → towers → recipes → enemies → hero → game
      → store → ui
      → panels/toast → panels/hud → panels/menu → panels/towerbar
      → panels/end → panels/popup → panels/achievements
      → panels/hero-select → panels/daily → panels/onboarding
      → main
```

All run in one shared global scope. `main.js` is an IIFE that wires everything together: it reads modules via `window.X`, owns the `requestAnimationFrame` game loop, rendering, input, and panel lifecycle.

**Two-layer UI architecture (introduced in P2):**
- `store.js` — a tiny **publish/subscribe state bus** (`getState` / `setState` / `subscribe` / `select`). `setState` merges a shallow copy and schedules a single microtask-batched `notify`, so multiple `setState` calls per frame fire listeners once. Holds `{ game, paused, speedMul, selectedTowerType, ... }`.
- `ui.js` — an **action event bus** (`on` / `emit`) plus DOM helpers (`toast`, `modal`, `confirm`). All user intent (place tower, upgrade, sell, deploy hero, show achievements, tier-3 confirm, etc.) flows through typed `actions.*` constants and is handled in `main.js` via `ui.on(...)`. Panels never mutate game state directly — they `ui.emit` and let `main.js` apply changes.
- `panels/*.js` — **one module per UI surface**, each a factory returning `{ mount(el), show(...), hide() }` (and sometimes `update(state)`). They render into a DOM node and emit actions; they do not own game logic.

**Browser global-scope rule (critical):** Each module follows this dual pattern:
```js
var CFG = (typeof module !== 'undefined') ? require('./utils.js').CFG : window.CFG;
// ... module body ...
if (typeof module !== 'undefined') module.exports = { /* node */ };
else { window.Symbol = Symbol; /* browser globals */ }
```
- Shared config (`CFG`, `DIFFICULTY`) is declared with `var` (NOT `const`) in `utils.js` only, so other modules can re-declare `var CFG` without a duplicate-`const` SyntaxError. Never add a top-level `const CFG`/`const DIFFICULTY` to another file.
- `const` object exports (`TOWER_TYPES`, `ENEMY_FAMILIES`, `GameState`, …) are NOT auto-attached to `window`; each module must explicitly assign them in its `else` branch. When adding a new module that `main.js` or a panel depends on, expose its exports on `window` in the browser branch.
- `audio.js` and `towers.js`/`enemies.js`/`hero.js` declare top-level `const` globals (`SFX`, `TOWER_TYPES`, `ENEMY_FAMILIES`, `HERO_TYPES`, …) — these names are unique across files, so they coexist in global scope without collision.

**Module responsibilities:**
- `utils.js` — `CFG` constants, `DIFFICULTY` (easy/normal/hard: `g` growth, `m` count mult, `f` gold mult), helpers (`dist`, `choice`, `randInt`, `clamp`).
- `map.js` — `generateMap()` returns `{grid, start, end}`; `grid` values: `0`=empty, `1`=road, `9`=occupied. `countPaths` uses Dinic max-flow (vertex-split) to guarantee/count ≥2 vertex-disjoint paths. `canPlace(map,r,c)` rejects non-empty or out-of-range cells and any placement that drops paths below 2.
- `towers.js` — `TOWER_TYPES` (6 towers). Each has `tier3: { cost, perk, perkName }` for the ultimate upgrade. `makeTower`, `upgradeTower` (L1→2 raises dps×1.35 / range×1.1; L2→3 returns `{ needsConfirm, cost, perk }` instead of applying), `upgradeCost`, `applyTier3` (sets `level=3`, `perk`, and an extra ×1.5 dps / ×1.15 range bump). Tower fields: `range` (grid cells), `dps`, `splash` (radius), `hitsAir`, `slow`, `dot`.
- `recipes.js` — `WAVE_RECIPES` maps each wave 1..10 to a **special-wave recipe** (`swarm`, `swarm_reinforce`, `elite_rush`, `standard`, `armor_break`, `finale`), each a list of `{family, tier, count}` slots. `getRecipeForWave(w)` resolves the recipe for a wave; `RECIPE_DISPLAY` holds the Chinese banner text. This is the data layer behind `enemies.spawnWave`.
- `enemies.js` — `ENEMY_FAMILIES` (4: `swarm` ground/fast/low-hp, `shadow` air/medium, `demon` heavy-armor slow tank, `deep` air+mixed) and `ENEMY_TIERS` (3: `normal`×1, `elite` ×3 hp/×2.5 gold/⭐, `boss` ×10 hp/×10 gold/👑). `spawnWave(w,diff)` calls `getRecipeForWave(w)` and builds a `{family, tier}` list; `makeEnemy(family,wave,diff,tier)` scales HP by `g^(wave-1)` and applies family+tier multipliers. `air` enemies are hit only by `hitsAir` towers; `armor` reduces single-target damage only. `buildPathNodes` is a dead stub — pathing lives in `main.js`.
- `hero.js` — `HERO_TYPES` (3: `warrior` 🦸 group-stun+mid DPS, `mage` 🧙 AoE true-DoT+slow [unlock `full_comp`], `hunter` 🏹 single-target burst+long range [unlock `pacifist`]). `makeHero`, `upgradeHero` (`stickCount = 1 + level`, +hp/dps/radius), `heroUpgradeCost`, `reviveHero` (manual or auto, **always 50% hp** by design decision — instant revive's only advantage is timing, not more hp).
- `game.js` — `GameState` (`MENU/PLAYING/WON/LOST`), `createGame`, `startNextWave` (records `currentRecipeId`, pre-inits `leaksPerWave[wave]`), `onKill` (bounty = `enemy.gold`; also tracks `airKills` / `armorKills` for achievements), `grantWaveReward` (×`diffCfg.f`). Game object carries achievement/stat fields: `kills`, `leaks`, `leaksPerWave`, `towerBuildHistory`, `airKills`, `armorKills`, `duration`.
- `store.js` — pub/sub state bus (see above).
- `ui.js` — action bus + `toast`/`modal`/`confirm` DOM helpers; `actions` enum.
- `audio.js` — `SFX`: pure **Web Audio API** synthesized sound effects (no external assets). Per-tower fire timbres, hit/kill/place/upgrade/sell/revive/wave/baseHit/win/lose/countdown cues. Lazily creates `AudioContext` on first user gesture; mute persisted to `localStorage['td_muted']`.
- `panels/*.js` — UI surfaces: `toast` (transient flash), `hud` (gold/hp/wave/diff + pause/×speed badge, subscribes to store), `menu` (difficulty + hero-select / daily / achievements entry buttons), `towerbar` (6 tower buttons with air/armor tags + hero-deploy button), `end` (win + failure post-mortem with tailored hints), `popup` (tower upgrade/sell, hero upgrade/revive, tier-3 confirm), `achievements` (9 achievements, localStorage, `checkUnlocks(g)`), `hero-select` (3 heroes, locked until achievement), `daily` (UTC-seeded `mulberry32` PRNG; sets `window._dailySeed` + `window._setGlobalRng`), `onboarding` (3 rotating intro cards → countdown → first wave).
- `main.js` — integration + loop: BFS distance-field road pathing (`buildDistField`/`nextStep`, random branch at junctions), enemy/tower/hero update, rendering, HUD, input, and all `ui.on(...)` handlers (place/upgrade/sell/deploy hero/tier-3/pause-speed/menus). Combat constants: `FIRE_INTERVAL=0.5`, shot damage = `dps*0.5`; armor rule is `target.armor>0 && tw.splash===0`; frost applies `slowT`; flame `dot` is applied as instant per-shot damage (not a true DoT timer). Tower cooldown uses a `1e-6` floating-point tolerance (`if (tw.cd > 1e-6) continue; tw.cd = 0;`). Non-hitsAir towers set `tw.suppressedAir` when only air enemies are in range (pulsing ✈️ badge — UX only). `dt` is clamped with `Math.max(0, …)`. **P2.3 speed model:** a fixed-step accumulator (`tickAcc += rawDt * speedMul`) advances the sim, so `speedMul` (1 / 1.5 / 2) does not get eaten by the `dt` clamp. Window keydown: `Space` toggles `paused`; `Digit1/2/3` set speed ×1/×1.5/×2.

**Balance model:** `balance.js` is design-time only (used by `test_balance.js`); runtime economy is in `game.js`. `CFG.MAX_DPS` (462) is the space-capped DPS ceiling (`TOWER_SLOTS_CAP*BLENDED_DPS + HERO_DPS_BONUS`), not a hard game limit but the basis for the documented balance scores.

## Known Constraints / Gotchas

- Enemy movement follows the **road grid** via BFS distance-to-end; enemies must never leave road cells and randomly branch at junctions. Do not make enemies move in straight lines toward the base.
- Hero death: `updateHero` must clear all enemies' `stuck` flag when the hero is absent/dead, or stuck enemies freeze forever and the wave never clears (infinite loop). Preserve this behavior.
- `index.html` is missing the `js/balance.js` script tag — intentional (balance.js is test-only, not used at runtime).
- When changing `DIFFICULTY` in `utils.js` for balancing, re-run `test_balance.js` and `sim_playthrough.js` to confirm all three tiers remain winnable with a competent layout and keep their easy/normal/hard gradient.
- Tower cooldown comparison must use a floating-point tolerance (`> 1e-6`, not `> 0`): `0.5 - 10*0.05` yields `6.9e-17` in IEEE-754, which is `> 0` and would force every tower to wait one extra frame per fire cycle (3% rate loss at 60fps, 9% at 20fps). `sim_playthrough.js` mirrors this exactly — keep both in sync when touching `updateTowers`.
- **Store notify is microtask-batched:** multiple `store.setState(...)` calls in the same tick collapse into one listener pass. Don't rely on listeners firing synchronously after `setState`.
- **Panels are pure view:** they may only `ui.emit` actions; game-state mutations must happen in `main.js`'s `ui.on(...)` handlers. Never have a panel read/write `window._gameRef` to change state directly (popup reads it read-only for cost/disable checks).
- **Tier-3 is a two-step flow:** `upgradeTower` at L2 returns `needsConfirm`; `main.js` opens the confirm popup (`SHOW_TIER3_CONFIRM`) and only calls `applyTier3` after `TIER3_UPGRADE`. Don't let a panel apply the upgrade itself.
- **Daily challenge determinism:** `todaySeed()` uses the UTC date; `_setGlobalRng` swaps the global RNG so the seeded map + spawns are reproducible for the day. Keep `Math.random` out of map/spawn paths when a daily seed is active.
- `tier3` DPS/range bonuses and hero revive hp carry `[PLACEHOLDER]` markers in source — tune by playtesting before treating as final.
