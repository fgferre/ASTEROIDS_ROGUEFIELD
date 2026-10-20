/**
 * Progression rate harness.
 * Deterministic Wave 1-5 simulation: seeded RandomService, scripted XP
 * grants, no player-input variability, plus the price of each level.
 * Seed: PROGRESSION_FIX03_SEED = 0xF003 (distinct from AIM_REGRESSION_SEED).
 *
 * How many cards a real run buys per layer is measured in full headless runs
 * (the XP a layer gives grows with the cards owned), not here.
 *
 * Per the Plan 01 ESM probe (docs/esm-import-shapes-2026-05-12.md),
 * ProgressionSystem uses `export default` — imported here as
 * `import ProgressionSystem from '...'`.
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
const PROGRESSION_FIX03_SEED = 0xf003;

// Live-derived schedule from Task 0 pre-flight + Task 0 refinement
// (docs/balance-retune-2026-05-12.md FIX-03 pre-flight + Task 0 schedule
// refinement sections). The common-only baseline [80, 95, 110, 160, 225]
// (sum 670 XP) underestimates live throughput because the scripted-grant
// path doesn't fire enemy-destroyed → combo (cap 2.0x) and excludes
// conditional perfect-wave / quick-time bonuses. Empirical 1.5x multiplier
// applied to the common baseline yields the refined schedule below.
// Verdict at time of authoring: MODERATE_VARIANCE (revised from LOW_VARIANCE
// after Task 1 first-run revealed the effective-XP divergence).
// If RewardManager changes, re-run the Task 0 spike and refresh this array.
const XP_PER_WAVE = [120, 140, 165, 240, 335];

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
function runWave5Simulation(
  seedScope = `progression-fix03-${PROGRESSION_FIX03_SEED}`
) {
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
      // The pick screen opens after the level-up delay (simulation time).
      progression.update(CONSTANTS.LEVEL_UP_SCREEN_DELAY_SECONDS);
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

describe('Progression rate harness', () => {
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

  it('the step to pilot level n costs 120 + 40 × (n − 2)^1.7 XP', () => {
    const container = createTestContainer('progression-curve');
    const progression = new ProgressionSystem({
      random: container.resolve('random'),
      eventBus: container.resolve('event-bus'),
      player: {},
      ui: {},
      effects: {},
      'xp-orbs': { attachProgression: noop },
    });
    const costs = [];
    for (let n = 2; n <= 31; n += 1) {
      costs.push(progression.experienceToNext);
      // Exactly one step's XP, one level each (no combo, no multiplier).
      expect(progression.collectXP(progression.experienceToNext).levels).toBe(
        1
      );
      expect(progression.level).toBe(n);
    }
    expect(costs.slice(0, 5)).toEqual([120, 160, 249, 378, 542]);
    costs.forEach((cost, i) => {
      expect(cost).toBe(Math.floor(120 + 40 * i ** 1.7));
    });
    progression.reset();
    expect(progression.experienceToNext).toBe(120);
  });
});
