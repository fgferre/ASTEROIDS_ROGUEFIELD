# Tests

Vitest, node environment, no browser. Passing tests print nothing; only failures show their console.

## How to run

- `npm test`: the whole suite. `npm run done`: lint, format check, suite and build, once at the end of a task.
- `npm run test:tocados`: the tests that cover the files you touched (see Selection). `npm run gate` is lint plus that.
- `npx vitest run <file or folder>` for one thing; `npm run test:<domain>` per top-level folder (core, modules, utils, services, integration, balance, visual, physics).

## Layout: a mirror of `src/` by domain

- `tests/core/`: infrastructure (DI container, pools, RandomService, replay, fixed step, spatial hash).
- `tests/modules/`: game systems; `enemies/`, `audio/`, `ui/`, `render3d/`, `collectibles/` mirror the folders under `src/modules/`.
- `tests/services/`: session, command queue, hangar, codex, difficulty, run records.
- `tests/data/`: the data tables (layers, bosses per layer, catalogs).
- `tests/utils/`, `tests/physics/`: helpers in `src/utils/`; collision accuracy.
- `tests/integration/`: several systems together: headless runs, replay, `determinism/`, `scenarios/`, boss curve, audio event coverage, golden trace (every layer hashed second by second: a refactor must leave it passing).
- `tests/balance/`: reward mechanics and asteroid metrics over many waves (numbers, not feel: the owner's play is the judge).
- `tests/visual/`: determinism of rendering, menu background, shake and audio, measured as numbers, never pixels.
- `tests/process/`: rules about the repository itself: no dev globals reach production, the test selector picks the right tests.
- `tests/unit/`: small pure functions.

## Playtest bot

- `npm run playtest` flies all nine sector runs headless with the bot pilot (`src/bootstrap/botPilot.js`, fed by `botPilotAdapter.js`), a mortal ship and one life each, and prints a report per sector and a summary table. About 3 minutes (a better bot lives longer, so it runs longer).
- `npm run playtest -- good` picks the `good` bot (default `average`); `npm run playtest -- <sector-id> [average|good] [seed]` flies one sector; the seed (default 1, env `PLAYTEST_SEED`) seeds both the world and the bot, so a sector is judged over several seeds. `PLAYTEST_CARRY=1` makes the bot win the chapter's earlier sectors first and arrive with that build, as in the campaign.
- It runs `tests/playtest/*.playtest.js` through `vitest.playtest.config.js` (`scripts/playtest.mjs` passes the choice and the seed in the environment), so `npm test` and the gate never run it.
- The bot reads only what the screen shows (bodies, bullets, telegraphs and their timers, a boss's open plates); its skill is the named knobs in `PRESETS`. Its numbers are a probe, not a verdict: the owner's play judges difficulty.

## Helpers and fixtures

- `tests/__helpers__/headlessGame.js` boots the real service manifest and steps frames without a browser; `scriptedPlayer.js` drives the inputs. Most integration and scenario tests go through them.
- `global-setup.js` restores mocks after every test; do not add your own `afterEach` for that. `mocks.js` (event bus), `stubs.js` (deterministic random), `fixtures.js`, `assertions.js`, `asteroid-helpers.js`, `fakeGamepad.js`, `audio-manifest-wiring.js` cover the rest.
- `tests/__fixtures__/` holds data fixtures (`golden-trace.json` changes only in a commit that means to change behavior); `tests/fixtures/audio-event-inventory.json` is the inventory the audio coverage test checks.

## Conventions (from AGENTS.md)

- A new module gets its test in the mirrored folder, named `<Name>.test.js` or `<Name>.<behaviour>.test.js`.
- One focused test per behaviour, sized like its neighbours; prefer a behaviour test over a snapshot.
- Determinism is a feature: draw from RandomService or the deterministic stubs, never `Math.random` (the process tests and `mathRandomGuard` enforce it).

## Selection: what `npm run test:tocados` runs

- Touched means changed since the branch left `main` (committed, staged or unstaged) plus untracked files; on `main` itself, changed since HEAD.
- A touched test runs itself. A touched `src` file runs every test that reaches it by following imports through `src/` and the helpers, `vi.mock` paths included. Any `src` change also runs `tests/process/`.
- Touching `tests/__helpers__/`, `tests/__fixtures__/`, `tests/fixtures/` or `vite.config.js` runs the whole suite.
- A touched `src` file that no test reaches is printed as unguarded: add a test, or run the whole suite before you call the task done.
