/**
 * Progression rate harness — FIX-03.
 * Deterministic Wave 1-5 simulation: seeded RandomService, scripted XP
 * grants, no player-input variability. Asserts appliedUpgrades.size lands
 * in the target band per ROADMAP SC3 (6-8 upgrades by end of Wave 5).
 * Seed: PROGRESSION_FIX03_SEED = 0xF003 (distinct from AIM_REGRESSION_SEED).
 *
 * XP_PER_WAVE schedule is derived from the live RewardManager/WaveManager
 * pre-flight (Task 0; see docs/balance-retune-2026-05-12.md FIX-03 pre-flight
 * section) per REVIEWS Concern 1. The schedule may diverge from live play if
 * RewardManager changes — re-run the pre-flight spike to refresh.
 *
 * Per the Plan 01 ESM probe (docs/esm-import-shapes-2026-05-12.md),
 * ProgressionSystem uses `export default` — imported here as
 * `import ProgressionSystem from '...'`.
 *
 * Project is ESM (`"type": "module"` in package.json) — all imports MUST be
 * static ESM `import` statements at the top of the file (no `require()`).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setupGlobalMocks,
  cleanupGlobalState,
  createTestContainer,
} from '../__helpers__/setup.js';
import * as CONSTANTS from '../../src/core/GameConstants.js';
import ProgressionSystem from '../../src/modules/ProgressionSystem.js';

// Distinct from AIM_REGRESSION_SEED (0xA1A1) per D-05 / D-13 convention.
const PROGRESSION_FIX03_SEED = 0xF003;
const TARGET_MIN = 6;
const TARGET_MAX = 8;

// Live-derived schedule from Task 0 pre-flight
// (docs/balance-retune-2026-05-12.md FIX-03 pre-flight section).
// Verdict at time of authoring: LOW_VARIANCE (total variance 4.3% vs proposed).
// If RewardManager changes, re-run the Task 0 spike and refresh this array.
const XP_PER_WAVE = [80, 95, 110, 160, 225];

// Concern 9 + D-23: surface determinism skips so they don't pass silently.
// Phase 0 expected value: false. ProgressionSystem.applyLevelUp +
// prepareUpgradeOptions consume the seeded `random` service (RandomService
// with its `selection` fork) — no Math.random leak observed at the upgrade-
// selection surface. The gate is scaffolding for Phase 5a / INFRA-05.
const MATH_RANDOM_LEAK_DETECTED = false;
if (MATH_RANDOM_LEAK_DETECTED) {
  // eslint-disable-next-line no-console
  console.warn(
    '[WARN] Determinism test skipped due to Math.random leak — see INFRA-05'
  );
}

const noop = () => {};

/**
 * Build a ProgressionSystem fed by the seeded test container and run the
 * scripted Wave 1-5 XP grants. Picks the first offered upgrade card on each
 * level-up to remove player-variability per D-13.
 *
 * @param {string} seedScope - Seed scope label forwarded to createTestContainer.
 * @returns {Map<string, number>} Final appliedUpgrades map.
 */
function runWave5Simulation(seedScope = `progression-fix03-${PROGRESSION_FIX03_SEED}`) {
  const container = createTestContainer(seedScope);
  const eventBus = container.resolve('event-bus');
  const random = container.resolve('random');

  // Mirror tests/modules/ProgressionSystem.test.js mock shape — Progression-
  // System resolves these via the cached-services helper.
  const progression = new ProgressionSystem({
    random,
    eventBus,
    player: {},
    ui: {},
    effects: {},
    'xp-orbs': {
      attachProgression: noop,
    },
  });

  progression.initialize();
  progression.setupEventListeners();

  // Listen for the level-up topic ProgressionSystem actually emits
  // (ProgressionSystem.js:374 — literal string 'upgrade-options-ready').
  let pendingOptions = null;
  eventBus.on('upgrade-options-ready', (payload) => {
    pendingOptions = Array.isArray(payload?.options) ? payload.options : null;
  });

  // Drive each wave's XP in 10 equal chunks. After every chunk, if a level-up
  // surfaced upgrade options, apply the first option deterministically. This
  // is the "no player variability" path per D-13.
  for (let wave = 1; wave <= 5; wave += 1) {
    const totalXp = XP_PER_WAVE[wave - 1];
    const chunk = Math.max(1, Math.floor(totalXp / 10));
    for (let i = 0; i < 10; i += 1) {
      progression.collectXP(chunk);
      while (pendingOptions && pendingOptions.length > 0) {
        const optionId = pendingOptions[0]?.id;
        pendingOptions = null;
        if (optionId) {
          progression.applyUpgrade(optionId);
        }
      }
    }
  }

  return progression.getAllUpgrades();
}

describe('Progression rate harness (FIX-03)', () => {
  beforeEach(() => {
    setupGlobalMocks();
  });

  afterEach(() => {
    cleanupGlobalState();
  });

  // Determinism gate. ProgressionSystem.prepareUpgradeOptions reads from
  // `randomForks.selection` (UpgradeSystem.js:123), which the BaseSystem
  // creates from the injected `random` service. Same seed → same shuffle.
  (MATH_RANDOM_LEAK_DETECTED ? it.skip : it)(
    'deterministic across runs with the same seed',
    () => {
      const a = runWave5Simulation('progression-fix03-A');
      const b = runWave5Simulation('progression-fix03-A');
      expect(Array.from(a.entries())).toEqual(Array.from(b.entries()));
    }
  );

  it('appliedUpgrades.size lands in target band [6, 8] after Wave 5', () => {
    const upgrades = runWave5Simulation();
    const size = upgrades.size;
    // Diagnostic line — Task 2 reads this to iterate the constants.
    // eslint-disable-next-line no-console
    console.log(
      '[FIX-03] appliedUpgrades.size:',
      size,
      'with constants:',
      {
        LEVEL_SCALING: CONSTANTS.PROGRESSION_LEVEL_SCALING,
        INITIAL_XP: CONSTANTS.PROGRESSION_INITIAL_XP_REQUIREMENT,
      }
    );
    expect(size).toBeGreaterThanOrEqual(TARGET_MIN);
    expect(size).toBeLessThanOrEqual(TARGET_MAX);
  });
});
