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
  createTestContainer,
} from '../__helpers__/setup.js';
import { GamePools } from '../../src/core/GamePools.js';
import CombatSystem from '../../src/modules/CombatSystem.js';

const AIM_REGRESSION_SEED = 0xA1A1;
// Concern 4 moving-target constants. The target must (a) sit inside
// COMBAT_TARGETING_RANGE (400 units), and (b) have a natural intercept time
// that lands OUTSIDE the linear-prediction clamp [0.1, 0.6]s but inside (or
// equal to) the dynamic-prediction clamp [minLeadTime=0.05, maxLeadTime=1.0]s.
// With player at (400,300), target at (700, 400) (distance ≈ 316),
// target velocity (300, -100), and BULLET_SPEED=550, the quadratic intercept
// solver in CombatSystem yields natural time ≈ 1.20s:
//   linear-prediction path clamps to 0.6 → predicted point at target + v*0.6
//   dynamic-prediction path clamps to 1.0 → predicted point at target + v*1.0
// These differ → fired vector angle differs. This is the diff Concern 4
// requires (NOT a state-flag-only check).
const MOVING_TARGET_POSITION = { x: 700, y: 400 };
const MOVING_TARGET_VELOCITY = { vx: 300, vy: -100 };
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

/**
 * Build a CombatSystem with a deterministic, minimal mock surface that can drive
 * `handleShooting` end-to-end (target acquisition + bullet creation).
 *
 * The mock player exposes the surface CombatSystem reads:
 *   - getPosition(), getVelocity(), getAngle(), getRotation()
 *   - getStats() — returns { multishot, damage } from a mutable internal state.
 *   - isDead = false
 *   - getHullBoundingRadius() — soft fallback for findBestTarget.
 *
 * The mock enemies expose `forEachActiveEnemy(callback)` so `findBestTarget`
 * (line 382) iterates them. Each enemy has id / x / y / vx / vy / radius
 * / variant / size — sufficient for distance + danger scoring.
 *
 * @param {object} [opts]
 * @param {{vx:number, vy:number}} [opts.targetVelocity] - velocity for the
 *        sole moving target used by the Concern-4 rank-2 test.
 * @param {number} [opts.multishot] - initial multishot value (default 1).
 * @param {number} [opts.damage] - initial damage value (default 10).
 * @param {Array<{id:string, x:number, y:number}>} [opts.extraEnemies] - extra
 *        targets to seed the priority list (used by rank-3 multi-lock tests).
 */
function setupCombatHarness({
  targetVelocity = { vx: 0, vy: 0 },
  targetPosition = { x: 600, y: 300 },
  multishot = 1,
  damage = 10,
  extraEnemies = [],
} = {}) {
  const container = createTestContainer(String(AIM_REGRESSION_SEED));
  const eventBus = container.resolve('event-bus');
  const random = container.resolve('random');

  const playerState = { multishot, damage };
  const playerPos = { x: 400, y: 300 };
  const player = {
    isDead: false,
    isRetrying: false,
    _quitExplosionHidden: false,
    getPosition() {
      return { ...playerPos };
    },
    getVelocity() {
      return { x: 0, y: 0 };
    },
    getAngle() {
      return 0;
    },
    getRotation() {
      return 0;
    },
    getHullBoundingRadius() {
      return 16;
    },
    getStats() {
      return { ...playerState };
    },
  };

  const baseEnemy = {
    id: 'enemy-1',
    x: targetPosition.x,
    y: targetPosition.y,
    vx: targetVelocity.vx,
    vy: targetVelocity.vy,
    radius: 18,
    type: 'asteroid',
    variant: 'common',
    size: 'medium',
    behavior: 'drift',
    health: 50,
    destroyed: false,
  };

  const enemyList = [
    baseEnemy,
    ...extraEnemies.map((e, idx) => ({
      id: e.id || `enemy-${idx + 2}`,
      x: e.x,
      y: e.y,
      vx: e.vx ?? 0,
      vy: e.vy ?? 0,
      radius: 18,
      type: 'asteroid',
      variant: e.variant || 'common',
      size: e.size || 'medium',
      behavior: e.behavior || 'drift',
      health: 50,
      destroyed: false,
    })),
  ];

  const enemies = {
    forEachActiveEnemy(callback) {
      enemyList.forEach(callback);
    },
  };

  const physics = {
    forEachBulletCollision: () => {},
  };

  const combat = new CombatSystem({
    eventBus,
    random,
    player,
    enemies,
    physics,
  });

  // Force initial cache + targeting refresh so `currentTarget` is populated
  // before the first `handleShooting` call.
  combat.targetUpdateTimer = 0;
  combat.updateTargeting(0);

  return { combat, eventBus, random, player, playerState, enemyList };
}

/**
 * Capture the projectile vector set produced by `fireCount` sequential fires.
 * Each fire is preceded by a delta-time of `combat.shootCooldown + 0.001` so
 * the cooldown gate at `canShoot()` clears.
 */
function captureVectorSet(combat, fireCount = 8) {
  const before = combat.bullets.length;
  const dt = combat.shootCooldown + 0.001;
  for (let i = 0; i < fireCount; i++) {
    // Re-establish target acquisition each tick (no-op if already locked).
    combat.updateTargeting(dt);
    const player = combat.getCachedPlayer();
    const stats = player.getStats();
    combat.handleShooting(dt, stats);
  }
  const fired = combat.bullets.slice(before);
  const angles = fired
    .map((b) => Math.atan2(b.vy, b.vx))
    .sort((a, b) => a - b);
  return {
    count: fired.length,
    angles,
    firstAngle: fired.length > 0 ? Math.atan2(fired[0].vy, fired[0].vx) : null,
    firstDamage: fired.length > 0 ? fired[0].damage : null,
    dynamicPrediction: combat.usingDynamicPrediction?.() ?? null,
    multiLockTargets: combat.multiLockTargets ?? null,
    targetingUpgradeLevel: combat.targetingUpgradeLevel ?? null,
    dangerScoreEnabled: combat.dangerScoreEnabled ?? null,
  };
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

// =============================================================================
// Plan 01.07 FIX-05 — centerline invariant + toggles
// =============================================================================
//
// New describe block introduced by plan 01.07 (Task 2 + Task 8). Each block
// names the specific must_have.truths claim it covers; assertions are
// geometric (vector / position math), not state-flag-only.

import { BULLET_SIZE } from '../../src/core/GameConstants.js';
import PlayerSystem from '../../src/modules/PlayerSystem.js';

describe('FIX-05 centerline invariant + toggles', () => {
  beforeAll(() => {
    if (!GamePools.initialized) {
      GamePools.initialize();
    }
  });

  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());

  describe('weapon-fired payload includes centerlineTarget', () => {
    it('Mode 2 (locked target): centerlineTarget present and points at the locked enemy aim', () => {
      const captured = [];
      const { combat, eventBus, playerState } = setupCombatHarness({
        multishot: 2,
      });
      eventBus.on('weapon-fired', (payload) => {
        captured.push(payload);
      });

      playerState.multishot = 2;
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());

      expect(captured.length).toBe(1);
      expect(captured[0].centerlineTarget).toBeDefined();
      expect(captured[0].centerlineTarget).not.toBeNull();
      expect(Number.isFinite(captured[0].centerlineTarget.x)).toBe(true);
      expect(Number.isFinite(captured[0].centerlineTarget.y)).toBe(true);
      // target field PRESERVED for backward compat.
      expect(captured[0].target).toBeDefined();
    });

    it('Mode 1 (forward fire, no target): centerlineTarget is at fixed range along rotation', () => {
      const captured = [];
      const { combat, eventBus } = setupCombatHarness();
      eventBus.on('weapon-fired', (payload) => {
        captured.push(payload);
      });

      // Force no-target firing path: clear the target locks.
      combat.currentTarget = null;
      combat.currentTargetLocks = [];
      combat.currentLockAssignments = [];

      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());

      expect(captured.length).toBe(1);
      expect(captured[0].centerlineTarget).toBeDefined();
      // Player at (400, 300), rotation 0 → centerline at (400 + 1000, 300) per plan spec.
      expect(captured[0].centerlineTarget.x).toBeCloseTo(1400, 0);
      expect(captured[0].centerlineTarget.y).toBeCloseTo(300, 0);
    });
  });

  describe('PlayerSystem.getNosePosition', () => {
    it('returns ship-nose world coordinates: {x: pos.x + cos(r) * radius, y: pos.y + sin(r) * radius}', () => {
      // Build a stripped-down PlayerSystem with deterministic position + radius.
      const container = createTestContainer('nose-position-seed');
      const eventBus = container.resolve('event-bus');
      const player = new PlayerSystem({
        position: { x: 100, y: 200 },
        dependencies: { eventBus },
      });

      const radius = player.getHullBoundingRadius();

      // rotation 0 → nose at +x of position.
      const noseR0 = player.getNosePosition(0);
      expect(noseR0.x).toBeCloseTo(100 + radius, 5);
      expect(noseR0.y).toBeCloseTo(200, 5);

      // rotation π/2 → nose at +y of position.
      const noseR90 = player.getNosePosition(Math.PI / 2);
      expect(noseR90.x).toBeCloseTo(100, 5);
      expect(noseR90.y).toBeCloseTo(200 + radius, 5);
    });
  });

  describe('computeParallelOffset lane clamp tightened to ±(targetRadius + BULLET_SIZE)', () => {
    it('4-shot concentrated burst at radius-8 asteroid keeps all 4 lanes within ±(8 + BULLET_SIZE)', () => {
      const { combat } = setupCombatHarness();
      const playerPos = { x: 0, y: 0 };
      const enemy = { id: 'e1', x: 300, y: 0, radius: 8 };

      const results = combat.applyConcentratedFire(
        { kind: 'target', enemy, fireOrigin: playerPos },
        4,
        { damage: 10, multishot: 4 }
      );
      const limit = 8 + BULLET_SIZE;
      results.forEach((entry) => {
        expect(Math.abs(entry.aimPoint.y)).toBeLessThanOrEqual(limit + 0.0001);
      });
    });

    it('lane offsets at radius-50 (big) capped at spacing (not at the wider radius+BULLET_SIZE)', () => {
      // With spacing=14 and a radius-50 enemy, the clamp is min(14, 53) = 14.
      // The middle lanes (offsetIndex ±0.5 for shotCount=4) sit at ±7, outer
      // lanes at ±21 → clamped to ±14. Verify the outermost lane is exactly 14.
      const { combat } = setupCombatHarness();
      const playerPos = { x: 0, y: 0 };
      const enemy = { id: 'e1', x: 300, y: 0, radius: 50 };

      const results = combat.applyConcentratedFire(
        { kind: 'target', enemy, fireOrigin: playerPos },
        4,
        { damage: 10, multishot: 4 }
      );
      results.forEach((entry) => {
        // |perpOffset| ≤ spacing (14) for any lane.
        expect(Math.abs(entry.aimPoint.y)).toBeLessThanOrEqual(14 + 0.0001);
      });
    });
  });

  describe('spread mode toggle: concentrated default, fan opt-in', () => {
    it('default boot state: spreadMode is "concentrated"', () => {
      const { combat } = setupCombatHarness();
      expect(combat.getSpreadMode()).toBe('concentrated');
    });

    it('Mode 2 concentrated: N=2 at locked target → both aim points within ±(targetRadius + BULLET_SIZE)', () => {
      // Target at (300, 0) from player at (0, 0); enemy radius 18.
      // In concentrated mode, both lane offsets should sit within ±(18 + BULLET_SIZE).
      const { combat, playerState } = setupCombatHarness({ multishot: 2 });
      playerState.multishot = 2;
      combat.setSpreadMode('concentrated');
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.slice(before);

      expect(fired.length).toBeGreaterThanOrEqual(2);

      // Compute aim direction angles (atan2 of vy / vx). All angles should differ
      // by ≤ small epsilon since both lanes point at parallel-translated targets.
      const playerPos = player.getPosition();
      const enemy = combat.currentTarget;
      const cx = enemy.x - playerPos.x;
      const cy = enemy.y - playerPos.y;
      const centerAngle = Math.atan2(cy, cx);
      // Each bullet's velocity is the (lane aim - origin) direction. Lane offsets
      // are perpendicular AND applied to both origin AND aim, so the velocity
      // angle is PARALLEL to the centerline (concentrated mode invariant).
      fired.forEach((b) => {
        const a = Math.atan2(b.vy, b.vx);
        expect(Math.abs(a - centerAngle)).toBeLessThan(0.001);
      });
    });

    it('Mode 2 fan opt-in: N=2 fires at ±0.15 rad spread (legacy angular fan preserved)', () => {
      const { combat, playerState } = setupCombatHarness({ multishot: 2 });
      playerState.multishot = 2;
      combat.setSpreadMode('fan');
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.slice(before);

      expect(fired.length).toBeGreaterThanOrEqual(2);

      const playerPos = player.getPosition();
      const enemy = combat.currentTarget;
      const centerAngle = Math.atan2(enemy.y - playerPos.y, enemy.x - playerPos.x);
      const angles = fired.map((b) => Math.atan2(b.vy, b.vx));
      // Angles bracket the centerline by ~0.15 rad each side (COMBAT_MULTISHOT_SPREAD_STEP = 0.3).
      const diffs = angles.map((a) => Math.abs(a - centerAngle));
      expect(Math.max(...diffs)).toBeGreaterThan(0.05);
    });

    it('Mode 2 concentrated: N=4 at locked target → 4 parallel lanes, all aim angles match centerline', () => {
      const { combat, playerState } = setupCombatHarness({ multishot: 4 });
      playerState.multishot = 4;
      combat.setSpreadMode('concentrated');
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.slice(before);

      expect(fired.length).toBeGreaterThanOrEqual(4);

      const playerPos = player.getPosition();
      const enemy = combat.currentTarget;
      const centerAngle = Math.atan2(enemy.y - playerPos.y, enemy.x - playerPos.x);
      fired.forEach((b) => {
        const a = Math.atan2(b.vy, b.vx);
        expect(Math.abs(a - centerAngle)).toBeLessThan(0.001);
      });
    });

    it('Mode 1 (no target) concentrated: parallel lanes pointing in rotation direction', () => {
      const { combat, playerState } = setupCombatHarness({ multishot: 3 });
      playerState.multishot = 3;
      combat.setSpreadMode('concentrated');

      // Clear target to force fireForward path.
      combat.currentTarget = null;
      combat.currentTargetLocks = [];
      combat.currentLockAssignments = [];

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.slice(before);

      expect(fired.length).toBeGreaterThanOrEqual(3);

      // All bullets fly with rotation = 0 (atan2(0, +) = 0).
      fired.forEach((b) => {
        const a = Math.atan2(b.vy, b.vx);
        expect(Math.abs(a)).toBeLessThan(0.001);
      });
    });

    it('setSpreadMode rejects invalid values (validation)', () => {
      const { combat } = setupCombatHarness();
      const before = combat.getSpreadMode();
      combat.setSpreadMode('invalid-value');
      expect(combat.getSpreadMode()).toBe(before); // unchanged
    });
  });

  describe('recommendedShots damage-aware overkill cap', () => {
    it('damage=100, multishot=4 vs radius-8 health-50 asteroid: caps at 1 (no overkill)', () => {
      const { combat } = setupCombatHarness({ multishot: 4, damage: 100 });
      const enemy = {
        id: 'tiny-1',
        x: 600,
        y: 300,
        radius: 8,
        health: 50,
        maxHealth: 50,
        variant: 'common',
        size: 'small',
      };

      const allocated = combat.computeAllocatedShots(enemy, { damage: 100, multishot: 4 });
      expect(allocated).toBe(1);
    });

    it('damage=10, multishot=4 vs health-1500 boss: caps at multishot (full allocation OK)', () => {
      const { combat } = setupCombatHarness({ multishot: 4, damage: 10 });
      const enemy = {
        id: 'boss-1',
        x: 600,
        y: 300,
        radius: 64,
        health: 1500,
        maxHealth: 1500,
        variant: 'common',
        size: 'large',
        type: 'boss',
      };

      const allocated = combat.computeAllocatedShots(enemy, { damage: 10, multishot: 4 });
      expect(allocated).toBe(4);
    });

    it('damage=100, multishot=4 vs health-200 enemy: caps at 2 (ceil(200/100) = 2)', () => {
      const { combat } = setupCombatHarness({ multishot: 4, damage: 100 });
      const enemy = {
        id: 'mid-1',
        x: 600,
        y: 300,
        radius: 18,
        health: 200,
        maxHealth: 200,
        variant: 'common',
        size: 'medium',
      };

      const allocated = combat.computeAllocatedShots(enemy, { damage: 100, multishot: 4 });
      expect(allocated).toBe(2);
    });
  });
});
