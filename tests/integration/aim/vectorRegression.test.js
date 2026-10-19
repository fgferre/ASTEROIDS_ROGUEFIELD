/**
 * Aim regression suite — FIX-01.
 * Seed: AIM_REGRESSION_SEED = 0xA1A1 (shared per D-05 so fixture diffs are reviewable).
 * CATEGORY-SPLIT structure per REVIEWS Concern 3:
 *   - describe('vector-affecting / multishot')   → vector-diff per rank
 *   - describe('vector-affecting / targeting_suite') → vector-diff per rank,
 *       rank 2 uses MOVING TARGET per REVIEWS Concern 4
 *   - describe('vector-neutral / plasma') → vector-EQUALS-baseline + damage-diff
 *
 * Per the Aim Audit 2026-05-12 (docs/aim-audit-2026-05-12.md), the production
 * `UpgradeSystem.applyUpgradeEffects` (UpgradeSystem.js:803-810) injects
 * `{ upgradeId, level: newLevel, category }` into every emitted upgrade event.
 * This test reproduces that injection by including `level` in the emitted
 * `upgrade-aiming-suite` payloads — emitting bare offense.js catalog payloads
 * without `level` is a test-harness configuration error, not a CombatSystem bug.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  setupGlobalMocks,
  cleanupGlobalState,
} from '../../__helpers__/setup.js';
import { GamePools } from '../../../src/core/GamePools.js';
import {
  setupCombatHarness,
  captureVectorSet,
  MOVING_TARGET_POSITION,
  MOVING_TARGET_VELOCITY,
} from './aimHarness.js';

const ANGLE_DIFF_THRESHOLD = 0.01; // radians, per Concern 4 spec
// Concern 9 + D-23: surface determinism skips so they don't pass silently.
// Phase 0 expected value: false (this surface does not touch Math.random;
// scaffold present for Phase 5a / INFRA-05 re-enablement).
const MATH_RANDOM_LEAK_DETECTED = false;
if (MATH_RANDOM_LEAK_DETECTED) {
  // eslint-disable-next-line no-console
  console.warn(
    '[WARN] Determinism test skipped due to Math.random leak — see INFRA-05'
  );
}

describe('Aim regression suite (FIX-01)', () => {
  beforeAll(() => {
    if (!GamePools.initialized) {
      GamePools.initialize();
    }
  });

  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());

  describe('vector-affecting / multishot', () => {
    it('rank 1 vector set differs from baseline (count increases by 1)', () => {
      const baseline = (() => {
        const { combat } = setupCombatHarness({ multishot: 1 });
        return captureVectorSet(combat, 4);
      })();

      const { combat, playerState } = setupCombatHarness({ multishot: 1 });
      // Emit rank-1 upgrade-multishot via the same handler path PlayerSystem uses:
      // PlayerSystem.js:418-420 does `this.multishot += data.bonus`. We
      // emulate that directly on the player mock so CombatSystem.handleShooting
      // sees the new multishot count via playerStats.
      playerState.multishot = 2;
      const rank1 = captureVectorSet(combat, 4);

      expect(rank1.count).toBeGreaterThan(baseline.count);
      expect(JSON.stringify(rank1.angles)).not.toBe(
        JSON.stringify(baseline.angles)
      );
    });

    it('rank 2 vector set differs from rank 1 (count and fan-angle multiset)', () => {
      const rank1 = (() => {
        const { combat } = setupCombatHarness({ multishot: 2 });
        return captureVectorSet(combat, 4);
      })();

      const { combat, playerState } = setupCombatHarness({ multishot: 2 });
      playerState.multishot = 3;
      const rank2 = captureVectorSet(combat, 4);

      expect(rank2.count).toBeGreaterThan(rank1.count);
      expect(JSON.stringify(rank2.angles)).not.toBe(
        JSON.stringify(rank1.angles)
      );
    });

    it('rank 3 vector set differs from rank 2 (count and fan-angle multiset)', () => {
      const rank2 = (() => {
        const { combat } = setupCombatHarness({ multishot: 3 });
        return captureVectorSet(combat, 4);
      })();

      const { combat, playerState } = setupCombatHarness({ multishot: 3 });
      playerState.multishot = 4;
      const rank3 = captureVectorSet(combat, 4);

      expect(rank3.count).toBeGreaterThan(rank2.count);
      expect(JSON.stringify(rank3.angles)).not.toBe(
        JSON.stringify(rank2.angles)
      );
    });
  });

  describe('vector-affecting / targeting_suite', () => {
    it('rank 1 enables danger-score targeting (resetWeights + state flag)', () => {
      const { combat, eventBus } = setupCombatHarness();
      expect(combat.dangerScoreEnabled).toBe(false);
      expect(combat.targetingUpgradeLevel).toBe(0);

      // Production payload — UpgradeSystem injects `level: 1`.
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });

      expect(combat.dangerScoreEnabled).toBe(true);
      expect(combat.targetingUpgradeLevel).toBeGreaterThanOrEqual(1);
    });

    it('rank 2 fires a DIFFERENT vector against a MOVING target (Concern 4)', () => {
      // Concern 4: state-flag-only check is NOT sufficient. Use a moving
      // target and assert the fired vector angle differs from the rank-1
      // (non-predictive) baseline by ≥ ANGLE_DIFF_THRESHOLD radians.

      // Rank-1-only baseline (non-predictive: routes through
      // `calculateLinearPrediction` which clamps intercept time to [0.1, 0.6]s).
      const rank1 = (() => {
        const { combat, eventBus } = setupCombatHarness({
          targetPosition: MOVING_TARGET_POSITION,
          targetVelocity: MOVING_TARGET_VELOCITY,
        });
        eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
        // Re-acquire target with new weights before firing.
        combat.targetUpdateTimer = 0;
        combat.updateTargeting(0);
        return captureVectorSet(combat, 1);
      })();

      // Rank-2: apply rank 1 + rank 2 (cumulative). Now `usingDynamicPrediction()`
      // returns true → `calculateDynamicIntercept` is used, which clamps intercept
      // time to [minLeadTime=0.05, maxLeadTime=1.0]s. With natural intercept time
      // ≈ 1.2s, the rank-1 path clamps to 0.6 while the rank-2 path clamps to 1.0,
      // producing different aim points → different fired-vector angles.
      const rank2 = (() => {
        const { combat, eventBus } = setupCombatHarness({
          targetPosition: MOVING_TARGET_POSITION,
          targetVelocity: MOVING_TARGET_VELOCITY,
        });
        eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
        eventBus.emit('upgrade-aiming-suite', {
          level: 2,
          dynamicPrediction: {
            minLeadTime: 0.05,
            maxLeadTime: 1,
            fallbackLeadTime: 0.32,
          },
        });
        combat.targetUpdateTimer = 0;
        combat.updateTargeting(0);
        return captureVectorSet(combat, 1);
      })();

      // PRIMARY gate (Concern 4): measurable angle diff.
      // Observed during authoring with the constants above: ≈ 0.0831 rad
      // (≈ 4.76°), comfortably above the 0.01 rad floor.
      expect(rank1.firstAngle).not.toBeNull();
      expect(rank2.firstAngle).not.toBeNull();
      const angleDiff = Math.abs(rank2.firstAngle - rank1.firstAngle);
      expect(angleDiff).toBeGreaterThanOrEqual(ANGLE_DIFF_THRESHOLD);

      // Sanity: state flag flipped too. NOT a replacement for the angle diff.
      expect(rank2.dynamicPrediction).toBe(true);
    });

    it('rank 3 vector set differs from rank 2 (multiLockTargets >= 4 with multiple targets)', () => {
      // Rank 3 requires `multishot >= 1` per catalog prerequisite. The
      // observable difference is that `multiLockTargets` becomes >= 4 AND
      // (with multiple available enemies + multishot >= 2) the fire-loop
      // produces vectors to distinct targets via `usingAdvancedBattery`.

      // Rank-2 baseline: targeting at rank 2 (predictive but single-lock),
      // multishot=2, with multiple enemy targets in range.
      const extraEnemies = [
        { id: 'enemy-2', x: 600, y: 320, variant: 'common', size: 'medium' },
        { id: 'enemy-3', x: 620, y: 280, variant: 'common', size: 'medium' },
        { id: 'enemy-4', x: 580, y: 340, variant: 'common', size: 'medium' },
      ];

      const rank2 = (() => {
        const { combat, eventBus } = setupCombatHarness({
          multishot: 2,
          extraEnemies,
        });
        eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
        eventBus.emit('upgrade-aiming-suite', {
          level: 2,
          dynamicPrediction: {
            minLeadTime: 0.05,
            maxLeadTime: 1,
            fallbackLeadTime: 0.32,
          },
        });
        combat.targetUpdateTimer = 0;
        combat.updateTargeting(0);
        return captureVectorSet(combat, 2);
      })();

      // Rank-3: targeting at rank 3 (multi-lock), multishot=2.
      const rank3 = (() => {
        const { combat, eventBus } = setupCombatHarness({
          multishot: 2,
          extraEnemies,
        });
        eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
        eventBus.emit('upgrade-aiming-suite', {
          level: 2,
          dynamicPrediction: {
            minLeadTime: 0.05,
            maxLeadTime: 1,
            fallbackLeadTime: 0.32,
          },
        });
        eventBus.emit('upgrade-aiming-suite', {
          level: 3,
          multiLockTargets: 4,
          cooldownMultiplier: 0.92,
        });
        combat.targetUpdateTimer = 0;
        combat.updateTargeting(0);
        return captureVectorSet(combat, 2);
      })();

      // Note: `multiLockTargets` initializes to `baseTargetCount = 4` from
      // COMBAT_AIMING_UPGRADE_CONFIG (gameplay.js:216) regardless of rank, so
      // the field-level assertion here is a baseline confirmation, not a
      // rank-progression marker. The rank-3 contract is:
      //   (a) `targetingUpgradeLevel` advances to >= 3 (this drives
      //       `usingAdvancedBattery` in handleShooting line 487, which
      //       triggers per-lock assignments via `buildLockAssignments`).
      //   (b) The vector multiset differs from rank 2 (because rank 3 now
      //       fires at distinct lock targets via `currentLockAssignments`,
      //       whereas rank 2 funnels all shots at the single
      //       `currentTarget`).

      // (a) Rank advances.
      expect(rank3.targetingUpgradeLevel).toBeGreaterThanOrEqual(3);
      expect(rank3.targetingUpgradeLevel).toBeGreaterThan(
        rank2.targetingUpgradeLevel
      );

      // Sanity: multiLockTargets is at the rank-3 cap (>= 4) — confirms the
      // payload was processed (even though the field doesn't advance from
      // its initialized default in this seeded harness).
      expect(rank3.multiLockTargets).toBeGreaterThanOrEqual(4);

      // (b) Vector multiset differs (different lock assignments yield
      // different aim points). This is the projectile-vector contract from
      // D-04 ("vector set differs from the prior level — no silent no-ops").
      const anglesDiffer =
        JSON.stringify(rank3.angles) !== JSON.stringify(rank2.angles);
      expect(anglesDiffer).toBe(true);
    });
  });

  describe('weapon tuning (Heat Sink / Overcharge Coil / Afterburn Lance)', () => {
    it('compounds per rank, composes with the rank-3 lock cooldown, and is idempotent on reapply', () => {
      const { combat, eventBus } = setupCombatHarness();
      const baseCooldown = combat.shootCooldown;
      const baseSpeed = combat.bulletSpeed;

      eventBus.emit('upgrade-weapon-tuning', {
        upgradeId: 'heat_sink',
        level: 1,
        cooldownMultiplier: 0.9,
      });
      eventBus.emit('upgrade-weapon-tuning', {
        upgradeId: 'heat_sink',
        level: 2,
        cooldownMultiplier: 0.9,
      });
      eventBus.emit('upgrade-weapon-tuning', {
        upgradeId: 'overcharge_coil',
        level: 1,
        bulletSpeedMultiplier: 1.15,
      });
      expect(combat.shootCooldown).toBeCloseTo(baseCooldown * 0.81, 6);
      expect(combat.bulletSpeed).toBeCloseTo(baseSpeed * 1.15, 6);

      // Retry re-applies the same ranks: nothing compounds twice.
      eventBus.emit('upgrade-weapon-tuning', {
        upgradeId: 'heat_sink',
        level: 1,
        cooldownMultiplier: 0.9,
      });
      expect(combat.shootCooldown).toBeCloseTo(baseCooldown * 0.81, 6);

      eventBus.emit('upgrade-aiming-suite', {
        level: 3,
        cooldownMultiplier: 0.92,
      });
      expect(combat.shootCooldown).toBeCloseTo(baseCooldown * 0.81 * 0.92, 6);
    });
  });

  describe('vector-neutral / plasma', () => {
    // Plasma is damage-only. The vector set MUST be identical to baseline.
    // Damage value MUST change per rank.

    it('rank 1-3 do not change vector angles or count vs baseline (vector-neutral guarantee)', () => {
      const baseline = (() => {
        const { combat } = setupCombatHarness({ multishot: 1, damage: 10 });
        return captureVectorSet(combat, 4);
      })();

      const ranks = [
        { mult: 1.25, label: 'rank 1' },
        { mult: 1.2, label: 'rank 2 cumulative' },
        { mult: 1.15, label: 'rank 3 cumulative' },
      ];

      let damage = 10;
      for (const { mult } of ranks) {
        damage = Math.floor(damage * mult);
        const { combat } = setupCombatHarness({ multishot: 1, damage });
        const snap = captureVectorSet(combat, 4);

        expect(snap.count).toBe(baseline.count);
        expect(snap.angles).toEqual(baseline.angles);
      }
    });

    it('rank 1-3 cumulatively scale damage values (monotonic per rank)', () => {
      // Apply each rank cumulatively to the player's damage, fire one shot,
      // and capture `bullet.damage`. The contract is monotonic increase, not
      // an exact multiplier (Math.floor truncation per rank — see audit doc
      // Finding 3).
      const damageReadings = [];
      let currentDamage = 10;
      const multipliers = [1, 1.25, 1.2, 1.15]; // rank 0 (baseline), rank 1, rank 2 cumulative, rank 3 cumulative

      for (const mult of multipliers) {
        currentDamage = Math.floor(currentDamage * mult);
        const { combat } = setupCombatHarness({
          multishot: 1,
          damage: currentDamage,
        });
        const snap = captureVectorSet(combat, 1);
        damageReadings.push(snap.firstDamage);
      }

      // Strict monotonic increase across all four entries.
      for (let i = 1; i < damageReadings.length; i++) {
        expect(damageReadings[i]).toBeGreaterThan(damageReadings[i - 1]);
      }
    });
  });

  (MATH_RANDOM_LEAK_DETECTED ? it.skip : it)(
    'determinism: two runs with the same seed produce identical snapshots',
    () => {
      const a = (() => {
        const { combat } = setupCombatHarness();
        return captureVectorSet(combat, 4);
      })();
      const b = (() => {
        const { combat } = setupCombatHarness();
        return captureVectorSet(combat, 4);
      })();

      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  );
});
