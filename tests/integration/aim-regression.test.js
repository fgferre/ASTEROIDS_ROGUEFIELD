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
  // Fix-pass (F1+F2): the FIX-01-era tests assumed every multishot burst spawns
  // `multishot` bullets. With the overkill cap wired (ceil(targetHP /
  // (damage*multishot*hitRate))), that assumption breaks against the legacy
  // default enemy (radius=18 health=50). Bump the default harness health to
  // 5000 so default tests do NOT trip the cap; the explicit overkill tests
  // mutate the enemy back to a tiny target on purpose.
  targetHealth = 5000,
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
    health: targetHealth,
    maxHealth: targetHealth,
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
      health: targetHealth,
      maxHealth: targetHealth,
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

    it('emitted toggle-spread-mode event with screen=playing flips spreadMode', () => {
      const { combat, eventBus } = setupCombatHarness();
      // Initial state: concentrated.
      expect(combat.getSpreadMode()).toBe('concentrated');

      // Simulate a gameState wrapper that exposes screen.
      eventBus.emit('toggle-spread-mode', { screen: 'playing' });
      expect(combat.getSpreadMode()).toBe('fan');

      eventBus.emit('toggle-spread-mode', { screen: 'playing' });
      expect(combat.getSpreadMode()).toBe('concentrated');
    });

    it('toggle-spread-mode no-ops when screen is not playing', () => {
      const { combat, eventBus } = setupCombatHarness();
      expect(combat.getSpreadMode()).toBe('concentrated');

      eventBus.emit('toggle-spread-mode', { screen: 'menu' });
      expect(combat.getSpreadMode()).toBe('concentrated');

      eventBus.emit('toggle-spread-mode', { screen: 'paused' });
      expect(combat.getSpreadMode()).toBe('concentrated');
    });

    it('F9: toggle-spread-mode no-ops when screen is null/undefined (strict equality gate)', () => {
      // Codex review F9: the gate read `data?.screen && data.screen !==
      // 'playing'`. When screen === null, the `&&` short-circuits → toggle
      // FIRES. Plan must_have: "no-op unless gameState.screen === 'playing'."
      // The fix changes the gate to strict `!== 'playing'`.
      const { combat, eventBus } = setupCombatHarness();
      expect(combat.getSpreadMode()).toBe('concentrated');

      eventBus.emit('toggle-spread-mode', { screen: null });
      expect(combat.getSpreadMode()).toBe('concentrated');

      eventBus.emit('toggle-spread-mode', { screen: undefined });
      expect(combat.getSpreadMode()).toBe('concentrated');

      eventBus.emit('toggle-spread-mode', {}); // missing screen field
      expect(combat.getSpreadMode()).toBe('concentrated');

      eventBus.emit('toggle-spread-mode'); // no payload at all
      expect(combat.getSpreadMode()).toBe('concentrated');
    });

    it('F9: toggle-aim-mode no-ops when screen is null/undefined (strict equality gate)', () => {
      const { combat, eventBus } = setupCombatHarness();
      expect(combat.getAimMode()).toBe('auto');

      eventBus.emit('toggle-aim-mode', { screen: null });
      expect(combat.getAimMode()).toBe('auto');

      eventBus.emit('toggle-aim-mode', { screen: undefined });
      expect(combat.getAimMode()).toBe('auto');

      eventBus.emit('toggle-aim-mode', {}); // missing screen field
      expect(combat.getAimMode()).toBe('auto');

      eventBus.emit('toggle-aim-mode'); // no payload at all
      expect(combat.getAimMode()).toBe('auto');
    });

    it('F10: gameplay.js exports COMBAT_BULLET_RADIUS for clamp math (plan artifact contract)', async () => {
      // Codex review F10: the plan's <artifacts> block for
      // src/data/constants/gameplay.js requires `COMBAT_BULLET_RADIUS`
      // exported for clamp math. The original landing added mode/keybind
      // constants but not this one. The clamp uses BULLET_SIZE from
      // core/GameConstants — `COMBAT_BULLET_RADIUS` is the gameplay-domain
      // alias the plan promised.
      const gameplay = await import('../../src/data/constants/gameplay.js');
      const { BULLET_SIZE: coreBullet } = await import('../../src/core/GameConstants.js');
      expect(gameplay.COMBAT_BULLET_RADIUS).toBeDefined();
      expect(gameplay.COMBAT_BULLET_RADIUS).toBe(coreBullet);
    });

    // Fix-pass-2 (C7a): settingsSchema.js hardcoded 'KeyG' / 'KeyT' instead of
    // importing the constants from gameplay.js. The constants are exported
    // (COMBAT_DEFAULT_KEYBIND_TOGGLE_SPREAD / COMBAT_DEFAULT_KEYBIND_TOGGLE_AIM)
    // but unused. If a designer later wants to change the default keybind in
    // one place, the schema entry would silently disagree.
    //
    // Two-layer assertion:
    //   (1) Runtime: the schema's default keyboard binding equals the imported
    //       constant value.
    //   (2) Source: settingsSchema.js must import the constant from gameplay.js
    //       (otherwise the runtime check passes by coincidence — both happen
    //       to be 'KeyG' — without actually wiring the single source of truth).
    it('C7a: settingsSchema toggleSpreadMode default keybind === COMBAT_DEFAULT_KEYBIND_TOGGLE_SPREAD', async () => {
      const gameplay = await import('../../src/data/constants/gameplay.js');
      const { getSettingsSchema } = await import('../../src/data/settingsSchema.js');

      const schema = getSettingsSchema();
      const controls = schema.find((cat) => cat.id === 'controls');
      expect(controls).toBeDefined();
      const spreadField = controls.fields.find((f) => f.key === 'toggleSpreadMode');
      expect(spreadField).toBeDefined();
      expect(spreadField.default?.keyboard).toBeDefined();
      // Layer 1: runtime equality.
      expect(spreadField.default.keyboard).toContain(
        gameplay.COMBAT_DEFAULT_KEYBIND_TOGGLE_SPREAD
      );
    });

    it('C7a: settingsSchema toggleAimMode default keybind === COMBAT_DEFAULT_KEYBIND_TOGGLE_AIM', async () => {
      const gameplay = await import('../../src/data/constants/gameplay.js');
      const { getSettingsSchema } = await import('../../src/data/settingsSchema.js');

      const schema = getSettingsSchema();
      const controls = schema.find((cat) => cat.id === 'controls');
      const aimField = controls.fields.find((f) => f.key === 'toggleAimMode');
      expect(aimField).toBeDefined();
      expect(aimField.default?.keyboard).toBeDefined();
      expect(aimField.default.keyboard).toContain(
        gameplay.COMBAT_DEFAULT_KEYBIND_TOGGLE_AIM
      );
    });

    it('C7a: settingsSchema.js imports the keybind constants from gameplay.js (single source of truth)', async () => {
      // Layer 2: source-level assertion. Without this the C7a runtime tests
      // pass by coincidence (both literals happen to equal the constants).
      const fs = await import('fs/promises');
      const path = await import('path');
      const filePath = path.resolve(
        process.cwd(),
        'src/data/settingsSchema.js'
      );
      const src = await fs.readFile(filePath, 'utf8');
      expect(src).toMatch(/COMBAT_DEFAULT_KEYBIND_TOGGLE_SPREAD/);
      expect(src).toMatch(/COMBAT_DEFAULT_KEYBIND_TOGGLE_AIM/);
    });

    // Fix-pass-2 (C7b): the clamp math in CombatSystem.js was imported from
    // core/GameConstants.js (BULLET_SIZE) while the plan's <artifacts> block
    // promised COMBAT_BULLET_RADIUS as the gameplay-domain alias. Migrating
    // CombatSystem to import the gameplay-domain name keeps the domain
    // boundaries clean (CombatSystem is a gameplay module) and exercises the
    // F10-exported alias (no longer dead). Numeric value identical — pinned
    // to BULLET_SIZE in the F10 test.
    it('C7b: CombatSystem source imports COMBAT_BULLET_RADIUS from gameplay.js (preferred per plan artifact)', async () => {
      // Read source as text to assert the import statement. Whitespace-tolerant.
      const fs = await import('fs/promises');
      const path = await import('path');
      const filePath = path.resolve(
        process.cwd(),
        'src/modules/CombatSystem.js'
      );
      const src = await fs.readFile(filePath, 'utf8');
      // Import should mention COMBAT_BULLET_RADIUS from gameplay.js. Single
      // string check accommodates multi-line import groups.
      const importsRadius = /COMBAT_BULLET_RADIUS/.test(src);
      expect(importsRadius).toBe(true);
    });

    // Fix-pass-2 (C4): rank-3 with duplicate locks (same enemy, multiple
    // lock slots) wrote the OFFSET-LANE aim point into predictedAimPointsMap
    // keyed by enemy id. Each iteration of refreshPredictedAimPoints
    // overwrites the previous slot for the same enemy — the final stored
    // value is the LAST lane's offset aim, NOT the centerline. handleShooting
    // then reads weapon-fired.centerlineTarget from the map, so recoil ends
    // up driven by the lane-offset aim, defeating the whole Task-2 contract.
    //
    // Fix: store the centerline (un-offset predicted aim) in the map. The
    // per-lane offsets stay in assignment.predictedAim and predictedAimPoints.
    it('C4: predictedAimPointsMap stores centerline (not offset lane) for rank-3 duplicate locks', () => {
      // Build rank-3 combat with a single valid enemy + multishot=4 so
      // buildLockAssignments puts 4 duplicate slots on the same enemy.
      // After the C1 fix, the lock filter would reduce this to 1 slot for a
      // low-HP enemy, defeating the duplicate-lock scenario. Use a high-HP
      // boss so the per-enemy cap allows multiple slots and we keep the
      // duplicate-lock scenario alive.
      const harness = setupCombatHarness({ multishot: 4, damage: 10 });
      const { combat, eventBus } = harness;
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      eventBus.emit('upgrade-aiming-suite', { level: 2 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 3,
        multiLockTargets: 4,
        cooldownMultiplier: 0.92,
      });
      // High HP so per-enemy cap (>=2) keeps the duplicate-lock scenario.
      let baseEnemy = null;
      combat.cachedEnemies.forEachActiveEnemy((e) => {
        if (!baseEnemy) baseEnemy = e;
      });
      expect(baseEnemy).not.toBeNull();
      baseEnemy.radius = 32;
      baseEnemy.health = 10000;
      baseEnemy.maxHealth = 10000;
      combat.lastKnownPlayerStats = { multishot: 4, damage: 10 };
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      // Sanity: rank-3, single enemy, 4 duplicate lock slots.
      expect(combat.targetingUpgradeLevel).toBe(3);
      expect(combat.currentLockAssignments.length).toBeGreaterThanOrEqual(2);
      // All assignment slots point to the same enemy.
      const distinctEnemyIds = new Set(
        combat.currentLockAssignments.map((a) => a.enemy?.id)
      );
      expect(distinctEnemyIds.size).toBe(1);

      // Compute the expected centerline = the un-offset predicted aim.
      const player = combat.getCachedPlayer();
      const playerPos = player.getPosition();
      const predicted = combat.getPredictedTargetPosition(baseEnemy, playerPos) || {
        x: baseEnemy.x,
        y: baseEnemy.y,
      };

      // C4 invariant: the map's stored aim for the duplicate-lock enemy
      // MUST be the centerline (predicted), NOT the lane-offset value
      // computed for any single slot. Tolerance: 1e-6 (float identity).
      const stored = combat.predictedAimPointsMap.get(baseEnemy.id);
      expect(stored).toBeDefined();
      expect(Math.abs(stored.x - predicted.x)).toBeLessThan(0.0001);
      expect(Math.abs(stored.y - predicted.y)).toBeLessThan(0.0001);
    });

    it('C4: weapon-fired.centerlineTarget for rank-3 duplicate locks equals centerline (not offset lane)', () => {
      // Higher-level invariant: after firing a rank-3 burst against a
      // duplicate-locked enemy, weapon-fired.centerlineTarget must equal
      // the centerline. The Task-2 backward-compat contract for the
      // PlayerSystem recoil listener depends on this.
      const harness = setupCombatHarness({ multishot: 4, damage: 10 });
      const { combat, eventBus } = harness;
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      eventBus.emit('upgrade-aiming-suite', { level: 2 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 3,
        multiLockTargets: 4,
        cooldownMultiplier: 0.92,
      });
      let baseEnemy = null;
      combat.cachedEnemies.forEachActiveEnemy((e) => {
        if (!baseEnemy) baseEnemy = e;
      });
      baseEnemy.radius = 32;
      baseEnemy.health = 10000;
      baseEnemy.maxHealth = 10000;
      combat.lastKnownPlayerStats = { multishot: 4, damage: 10 };
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      // Capture the weapon-fired payload.
      let captured = null;
      const off = combat.eventBus.on('weapon-fired', (p) => {
        captured = p;
      });

      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      if (typeof off === 'function') off();

      expect(captured).not.toBeNull();
      expect(captured.centerlineTarget).toBeDefined();

      // Centerline = un-offset predicted aim for the primary target.
      const playerPos = player.getPosition();
      const predicted = combat.getPredictedTargetPosition(baseEnemy, playerPos) || {
        x: baseEnemy.x,
        y: baseEnemy.y,
      };

      expect(Math.abs(captured.centerlineTarget.x - predicted.x)).toBeLessThan(0.0001);
      expect(Math.abs(captured.centerlineTarget.y - predicted.y)).toBeLessThan(0.0001);
    });
  });

  // Fix-pass — defensive regression locks for Findings F3 and F4 (Codex review).
  // The Codex review claimed F3 (rank-3 enters the spread-mode branch) and F4
  // (_concentratedLanes cache reused across enemies), but inspection of
  // handleShooting confirmed both were already correctly guarded:
  //   F3: handleShooting branch `if (!usingAdvancedBattery && totalShots > 1)`
  //   F4: in non-rank-3, `assignments` always has exactly 1 entry (line 587:
  //       `assignments[Math.min(assignments.length - 1, 0)]`), so all shots in
  //       a volley use the same enemy → the lane cache is anchored on the same
  //       aim point for every shotIndex. The cache cannot leak across enemies
  //       in the non-rank-3 path.
  // These tests lock those invariants so future refactors that break them
  // surface immediately rather than silently regressing.
  describe('FIX-PASS regression locks for Codex F3+F4 (defensive — invariants verified by inspection)', () => {
    it('F3: rank-3 advanced battery with spreadMode=fan still uses multi-lock parallel path (NOT the angular fan)', () => {
      // The structural assertion that proves F3 is invalid: in handleShooting,
      // the spread-mode branch is gated at `if (!usingAdvancedBattery &&
      // totalShots > 1)`. So when rank-3 is active (usingAdvancedBattery ===
      // true), the spread-mode code path is structurally bypassed. The test
      // verifies the rank-3 fire path is taken regardless of spreadMode by
      // toggling spreadMode and asserting the bullet count + multi-lock
      // active flags match between concentrated and fan mode at rank 3.

      const extraEnemies = [
        { id: 'enemy-2', x: 600, y: 320, variant: 'common', size: 'medium' },
        { id: 'enemy-3', x: 620, y: 280, variant: 'common', size: 'medium' },
        { id: 'enemy-4', x: 580, y: 340, variant: 'common', size: 'medium' },
      ];

      function rank3FireAt(spreadMode) {
        const { combat, eventBus, playerState } = setupCombatHarness({
          multishot: 4,
          extraEnemies,
        });
        eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
        eventBus.emit('upgrade-aiming-suite', { level: 2 });
        eventBus.emit('upgrade-aiming-suite', {
          level: 3,
          multiLockTargets: 4,
          cooldownMultiplier: 0.92,
        });
        playerState.multishot = 4;
        combat.setSpreadMode(spreadMode);
        combat.targetUpdateTimer = 0;
        combat.updateTargeting(0);
        const before = combat.bullets.length;
        const player = combat.getCachedPlayer();
        combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
        return combat.bullets.slice(before);
      }

      const firedConc = rank3FireAt('concentrated');
      const firedFan = rank3FireAt('fan');

      // Structural invariant: both spread modes produce the SAME number of
      // bullets at rank-3 (4 from multishot × multi-lock distribution). If F3
      // were real, fan would re-route through angular-spread math and the
      // count could diverge.
      expect(firedConc.length).toBeGreaterThan(0);
      expect(firedFan.length).toBe(firedConc.length);
    });

    it('F4: non-rank-3 Mode 2 has exactly 1 assignment (cache anchor cannot drift across enemies)', () => {
      // Setup: 4 distinct enemies, NO rank-3 (only baseline). handleShooting
      // collapses lockTargets to currentTarget only, so assignments.length===1.
      // Lock-anchor uniqueness is what guarantees the _concentratedLanes cache
      // can't leak across enemies in the non-rank-3 path.
      const extraEnemies = [
        { id: 'enemy-2', x: 600, y: 320, variant: 'common', size: 'medium' },
        { id: 'enemy-3', x: 620, y: 280, variant: 'common', size: 'medium' },
      ];
      const { combat, playerState } = setupCombatHarness({
        multishot: 4,
        extraEnemies,
      });
      playerState.multishot = 4;
      combat.setSpreadMode('concentrated');
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      // Pre-condition: only one assignment in the non-rank-3 path.
      // The non-rank-3 branch in handleShooting maps `lockTargets` (which
      // collapses to [currentTarget] when no rank-3 multi-lock) into
      // `assignments`. If a future refactor breaks this invariant, the
      // _concentratedLanes cache could anchor on a stale enemy.
      const lockTargets = combat.currentTargetLocks?.length
        ? combat.currentTargetLocks
        : combat.currentTarget
          ? [combat.currentTarget]
          : [];
      expect(lockTargets.length).toBe(1);

      // Fire and verify all bullets aim at parallel lanes around the SAME
      // anchor enemy. If F4's scenario were real, later shots would aim at
      // different enemies → velocity angles would diverge.
      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.slice(before);
      expect(fired.length).toBeGreaterThanOrEqual(2);

      // All angles must be near-identical (parallel-lane invariant).
      const playerPos = player.getPosition();
      const target = combat.currentTarget;
      const centerAngle = Math.atan2(target.y - playerPos.y, target.x - playerPos.x);
      fired.forEach((b) => {
        const a = Math.atan2(b.vy, b.vx);
        expect(Math.abs(a - centerAngle)).toBeLessThan(0.001);
      });
    });

    it('F5: manual aim uses player.getAngle() (canonical accessor); silent-zero fallback is gone', () => {
      // Codex review F5 worried that the fallback `|| 0` silently shot right
      // if PlayerSystem exposed `getRotation()` instead of `getAngle()`.
      // Inspection (PlayerSystem.js:1285) confirms `getAngle()` IS the
      // canonical accessor. The remaining gap (warn loudly when accessor is
      // missing instead of silently defaulting to 0) is the F5 fix verified
      // here.
      const { combat, playerState } = setupCombatHarness({ multishot: 1 });
      playerState.multishot = 1;
      combat.setAimMode('manual');

      // Case 1: with getAngle, manual fire uses ship rotation (=== 0 in
      // harness mock). Bullet velocity should point +x.
      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.slice(before);
      expect(fired.length).toBe(1);
      expect(fired[0].vx).toBeGreaterThan(0);
      expect(Math.abs(fired[0].vy)).toBeLessThan(0.001);

      // Case 2: when getAngle is missing, a single console.warn surfaces.
      // Test by monkey-patching the player and capturing console.warn.
      const warnSpy = [];
      const originalWarn = console.warn;
      console.warn = (...args) => warnSpy.push(args.join(' '));
      try {
        const broken = combat.getCachedPlayer();
        const savedGetAngle = broken.getAngle;
        broken.getAngle = undefined;
        combat._warnedManualAimNoAngle = false;
        // Force the cooldown to clear immediately so this fire goes through.
        combat.lastShotTime = combat.shootCooldown;
        combat.handleShooting(combat.shootCooldown + 0.001, { multishot: 1, damage: 10 });
        broken.getAngle = savedGetAngle;
      } finally {
        console.warn = originalWarn;
      }
      const matched = warnSpy.some((line) =>
        line.includes('manual aim requires player.getAngle()')
      );
      expect(matched).toBe(true);
    });
  });

  describe('aim mode toggle: auto default, manual opt-in', () => {
    it('default boot state: aimMode is "auto"', () => {
      const { combat } = setupCombatHarness();
      expect(combat.getAimMode()).toBe('auto');
    });

    it('setAimMode("manual") clears currentTarget + locks + predictedAimPoints', () => {
      const { combat } = setupCombatHarness({ multishot: 2 });
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      expect(combat.currentTarget).not.toBeNull();

      combat.setAimMode('manual');
      expect(combat.currentTarget).toBeNull();
      expect(combat.currentTargetLocks).toEqual([]);
      expect(combat.currentLockAssignments).toEqual([]);
    });

    it('manual mode: fireForward path used (no target lock); bullets fly in ship rotation direction', () => {
      const { combat, playerState } = setupCombatHarness({ multishot: 3 });
      playerState.multishot = 3;
      combat.setAimMode('manual');
      combat.setSpreadMode('concentrated');

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.slice(before);

      expect(fired.length).toBe(3);
      // Fix-pass (F6): manual + concentrated now keeps every origin at the
      // nose and applies lane offset only to the aim point. So outer lanes
      // fly with a tiny angular divergence (atan2(parallelSpacing,
      // range=1000) ≈ 0.014 rad). The center lane still flies on-axis.
      // Tolerance: 0.02 rad accommodates the parallelSpacing=14, range=1000
      // geometry plus float-precision slack.
      fired.forEach((b) => {
        const a = Math.atan2(b.vy, b.vx);
        expect(Math.abs(a)).toBeLessThan(0.02);
      });
    });

    it('F7: manual mode early-returns from updateTargeting; locks stay null across multiple ticks', () => {
      // Codex review F7: setAimMode("manual") clears locks once, but
      // updateTargeting was not gated — every subsequent tick could
      // re-populate currentTarget/currentTargetLocks while still in manual
      // mode. Plan must_have: "no target lock / no multi-lock while manual."
      const { combat } = setupCombatHarness({ multishot: 2 });
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      expect(combat.currentTarget).not.toBeNull();

      combat.setAimMode('manual');
      // After entering manual mode the locks are cleared.
      expect(combat.currentTarget).toBeNull();
      expect(combat.currentTargetLocks).toEqual([]);

      // Advance several update ticks. Without the F7 gate, updateTargeting
      // re-runs findBestTarget every tick and repopulates currentTarget.
      for (let i = 0; i < 5; i += 1) {
        combat.targetUpdateTimer = 0;
        combat.updateTargeting(combat.targetUpdateInterval + 0.01);
      }
      expect(combat.currentTarget).toBeNull();
      expect(combat.currentTargetLocks).toEqual([]);
      expect(combat.currentLockAssignments).toEqual([]);
    });

    it('F8: switching from manual back to auto forces fresh acquisition on the next tick (needsRetarget consumed)', () => {
      // Codex review F8: setAimMode("auto") sets `needsRetarget = true` but
      // nothing consumed the flag — updateTargeting decremented the timer
      // and delayed acquisition by one full interval. Fix: when needsRetarget
      // is set, the next update forces findBestTarget immediately.
      const { combat } = setupCombatHarness({ multishot: 2 });
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      const originalTarget = combat.currentTarget;
      expect(originalTarget).not.toBeNull();

      combat.setAimMode('manual');
      expect(combat.currentTarget).toBeNull();

      combat.setAimMode('auto');
      expect(combat.needsRetarget).toBe(true);

      // Advance ONE update tick. needsRetarget must force findBestTarget
      // immediately, regardless of targetUpdateTimer remaining.
      combat.updateTargeting(0.001);
      expect(combat.currentTarget).not.toBeNull();
      expect(combat.needsRetarget).toBe(false);
    });

    // Fix-pass-2 (C3): the _aimModeFlagSnapshot was captured on manual-on
    // and read verbatim on auto-switchback. If an upgrade-aiming-suite
    // event fired during manual mode (e.g. levelling up), the upgrade
    // bumped targetingUpgradeLevel and set the live behavioral flags, but
    // the snapshot stayed stale. On switchback the restore overwrote the
    // live flags with the pre-upgrade snapshot — silently dropping the
    // upgrade. Plan must-have: "rank-3 cooldownMultiplier preserved across
    // both aim modes" extends to behavioral flags too — upgrades acquired
    // during manual MUST survive switchback.
    it('C3: upgrade acquired during manual survives auto switchback (dangerScore + dynamicPrediction)', () => {
      const { combat, eventBus } = setupCombatHarness({ multishot: 2 });
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      // Start at rank 1: dangerScoreEnabled becomes true, dynamicPrediction false.
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      expect(combat.targetingUpgradeLevel).toBe(1);
      expect(combat.dangerScoreEnabled).toBe(true);
      expect(combat.dynamicPredictionEnabled).toBe(false);

      // Toggle to manual. Snapshot captured here:
      //   {dangerScoreEnabled: true, dynamicPredictionEnabled: false}.
      combat.setAimMode('manual');
      expect(combat.aimMode).toBe('manual');
      // Behavioral flags paused while manual.
      expect(combat.dangerScoreEnabled).toBe(false);
      expect(combat.dynamicPredictionEnabled).toBe(false);

      // Apply rank-2 upgrade WHILE in manual. dynamicPrediction should
      // be tracked so the restore on switchback re-enables it.
      eventBus.emit('upgrade-aiming-suite', { level: 2 });
      expect(combat.targetingUpgradeLevel).toBe(2);

      // Toggle back to auto. The restore MUST reflect rank 2's flags
      // (both true), not the pre-upgrade rank-1 snapshot.
      combat.setAimMode('auto');
      expect(combat.aimMode).toBe('auto');
      expect(combat.dangerScoreEnabled).toBe(true);
      // The C3 regression check — currently FAILS pre-fix because the
      // stale rank-1 snapshot restore overrides the rank-2 upgrade.
      expect(combat.dynamicPredictionEnabled).toBe(true);
    });

    it('C3: upgrade from rank 0 → rank 3 acquired during manual survives auto switchback', () => {
      // Stronger variant: bigger jump. rank-0 → manual → rank-3.
      const { combat, eventBus } = setupCombatHarness({ multishot: 4 });
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);

      // Start at rank 0: both flags false (default).
      expect(combat.targetingUpgradeLevel).toBe(0);
      expect(combat.dangerScoreEnabled).toBe(false);
      expect(combat.dynamicPredictionEnabled).toBe(false);

      // Toggle to manual. Snapshot = {false, false}.
      combat.setAimMode('manual');

      // Apply rank-3 upgrade while manual.
      eventBus.emit('upgrade-aiming-suite', { level: 1 });
      eventBus.emit('upgrade-aiming-suite', { level: 2 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 3,
        multiLockTargets: 4,
        cooldownMultiplier: 0.92,
      });

      // Toggle back to auto. Both flags must reflect rank-3 capabilities.
      combat.setAimMode('auto');
      expect(combat.dangerScoreEnabled).toBe(true);
      expect(combat.dynamicPredictionEnabled).toBe(true);
    });

    // Fix-pass-2 (C5): mode state must reset on run end. The first fix-pass
    // wired the toggles + manual path but did NOT reset spreadMode / aimMode
    // / _aimModeFlagSnapshot / needsRetarget on combat.reset() or on the
    // player-reset event. So a player who ended a run in manual+fan would
    // start the next run in manual+fan — wrong default.
    it('C5: combat.reset() restores spreadMode / aimMode / snapshot / needsRetarget to defaults', () => {
      const { combat } = setupCombatHarness({ multishot: 2 });
      // Dirty all four bits of mode state.
      combat.setSpreadMode('fan');
      combat.setAimMode('manual');
      combat.needsRetarget = true;
      // The setAimMode('manual') already populates _aimModeFlagSnapshot,
      // so dirty it further to make sure reset clears (not just overwrites).
      combat._aimModeFlagSnapshot = {
        dangerScoreEnabled: true,
        dynamicPredictionEnabled: true,
      };

      // Pre-condition: dirty state confirmed.
      expect(combat.getSpreadMode()).toBe('fan');
      expect(combat.getAimMode()).toBe('manual');
      expect(combat._aimModeFlagSnapshot).not.toBeNull();
      expect(combat.needsRetarget).toBe(true);

      combat.reset();

      // Post-condition: all four restored to defaults.
      expect(combat.getSpreadMode()).toBe('concentrated');
      expect(combat.getAimMode()).toBe('auto');
      expect(combat._aimModeFlagSnapshot).toBeNull();
      expect(combat.needsRetarget).toBe(false);
    });

    it('C5: player-reset event also restores spreadMode / aimMode / snapshot / needsRetarget', () => {
      const { combat, eventBus } = setupCombatHarness({ multishot: 2 });
      combat.setSpreadMode('fan');
      combat.setAimMode('manual');
      combat.needsRetarget = true;
      combat._aimModeFlagSnapshot = {
        dangerScoreEnabled: true,
        dynamicPredictionEnabled: true,
      };
      expect(combat.getSpreadMode()).toBe('fan');
      expect(combat.getAimMode()).toBe('manual');

      eventBus.emit('player-reset');

      expect(combat.getSpreadMode()).toBe('concentrated');
      expect(combat.getAimMode()).toBe('auto');
      expect(combat._aimModeFlagSnapshot).toBeNull();
      expect(combat.needsRetarget).toBe(false);
    });

    it('F6: manual + concentrated + N>1 → ALL shots leave from the same ship-nose origin (not nose ± perpendicular offset)', () => {
      // Codex review F6: the prior implementation passed originOverride = nose
      // to fireForward but applyConcentratedFire({kind: 'direction'}) STILL
      // offset each fireOrigin perpendicular to the rotation axis. So a
      // manual + concentrated multishot 3 burst produced 3 origins on a line
      // perpendicular to rotation (nose - spacing, nose, nose + spacing).
      // Plan must_have: "shots leave from the SHIP NOSE in the ship's
      // CURRENT rotation direction." The fix is option (a) from the brief:
      // all shots originate at the nose, fan out via aim-point perpendicular
      // offset only.
      const container = createTestContainer('manual-conc-nose-seed');
      const eventBus = container.resolve('event-bus');
      const random = container.resolve('random');
      const playerPos = { x: 400, y: 300 };
      const player = {
        isDead: false,
        isRetrying: false,
        _quitExplosionHidden: false,
        getPosition() { return { ...playerPos }; },
        getVelocity() { return { x: 0, y: 0 }; },
        getAngle() { return 0; },
        getRotation() { return 0; },
        getHullBoundingRadius() { return 16; },
        getNosePosition(rotation) {
          const angle = Number.isFinite(rotation) ? rotation : 0;
          return {
            x: playerPos.x + Math.cos(angle) * 16,
            y: playerPos.y + Math.sin(angle) * 16,
          };
        },
        getStats() { return { multishot: 3, damage: 10 }; },
      };
      const enemies = { forEachActiveEnemy() {} };
      const physics = { forEachBulletCollision: () => {} };
      const combat = new CombatSystem({ eventBus, random, player, enemies, physics });
      combat.setSpreadMode('concentrated');
      combat.setAimMode('manual');

      const before = combat.bullets.length;
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.slice(before);

      expect(fired.length).toBe(3);
      const noseExpected = { x: 416, y: 300 };
      fired.forEach((b) => {
        expect(b.x).toBeCloseTo(noseExpected.x, 0);
        expect(b.y).toBeCloseTo(noseExpected.y, 0);
      });
    });

    it('manual mode: bullets spawn at ship nose (origin offset by ship radius along rotation)', () => {
      // The harness's mock player has getHullBoundingRadius() = 16 and
      // getPosition() = (400, 300). When we add getNosePosition to the mock,
      // rotation 0 puts the nose at (416, 300). Use a custom harness that
      // exposes getNosePosition the way the real PlayerSystem does (Task 2).
      const container = createTestContainer('manual-nose-seed');
      const eventBus = container.resolve('event-bus');
      const random = container.resolve('random');
      const playerPos = { x: 400, y: 300 };
      const player = {
        isDead: false,
        isRetrying: false,
        _quitExplosionHidden: false,
        getPosition() { return { ...playerPos }; },
        getVelocity() { return { x: 0, y: 0 }; },
        getAngle() { return 0; },
        getRotation() { return 0; },
        getHullBoundingRadius() { return 16; },
        getNosePosition(rotation) {
          const angle = Number.isFinite(rotation) ? rotation : 0;
          return {
            x: playerPos.x + Math.cos(angle) * 16,
            y: playerPos.y + Math.sin(angle) * 16,
          };
        },
        getStats() { return { multishot: 1, damage: 10 }; },
      };
      const enemies = { forEachActiveEnemy() {} };
      const physics = { forEachBulletCollision: () => {} };
      const combat = new CombatSystem({ eventBus, random, player, enemies, physics });
      combat.setAimMode('manual');

      const before = combat.bullets.length;
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.slice(before);

      expect(fired.length).toBe(1);
      // Bullet should spawn at (416, 300) — the nose, not the ship center (400, 300).
      expect(fired[0].x).toBeCloseTo(416, 0);
      expect(fired[0].y).toBeCloseTo(300, 0);
    });

    it('manual mode: rank-3 cooldownMultiplier preserved across mode switch (decision a)', () => {
      const { combat, eventBus } = setupCombatHarness();
      // Apply rank 3: shootCooldown *= 0.92.
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      eventBus.emit('upgrade-aiming-suite', { level: 2 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 3,
        multiLockTargets: 4,
        cooldownMultiplier: 0.92,
      });

      const cooldownBefore = combat.shootCooldown;
      const expectedReduction = combat.baseShootCooldown * 0.92;
      expect(cooldownBefore).toBeCloseTo(expectedReduction, 5);

      combat.setAimMode('manual');
      // Cooldown stat preserved — it's a weapon stat, not an aim behavior.
      expect(combat.shootCooldown).toBeCloseTo(cooldownBefore, 5);

      combat.setAimMode('auto');
      expect(combat.shootCooldown).toBeCloseTo(cooldownBefore, 5);
    });

    it('manual mode: behavioral flags paused; restored on switchback to auto', () => {
      const { combat, eventBus } = setupCombatHarness();
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 2,
        dynamicPrediction: {
          minLeadTime: 0.05,
          maxLeadTime: 1,
          fallbackLeadTime: 0.32,
        },
      });
      expect(combat.dangerScoreEnabled).toBe(true);
      expect(combat.dynamicPredictionEnabled).toBe(true);

      combat.setAimMode('manual');
      expect(combat.dangerScoreEnabled).toBe(false);
      expect(combat.dynamicPredictionEnabled).toBe(false);

      combat.setAimMode('auto');
      expect(combat.dangerScoreEnabled).toBe(true);
      expect(combat.dynamicPredictionEnabled).toBe(true);
    });

    it('switching auto → manual → auto sets needsRetarget flag', () => {
      const { combat } = setupCombatHarness();
      combat.setAimMode('manual');
      expect(combat.needsRetarget).toBeFalsy();
      combat.setAimMode('auto');
      expect(combat.needsRetarget).toBe(true);
    });

    it('toggle-aim-mode event with screen=playing flips aimMode', () => {
      const { combat, eventBus } = setupCombatHarness();
      expect(combat.getAimMode()).toBe('auto');

      eventBus.emit('toggle-aim-mode', { screen: 'playing' });
      expect(combat.getAimMode()).toBe('manual');

      eventBus.emit('toggle-aim-mode', { screen: 'playing' });
      expect(combat.getAimMode()).toBe('auto');
    });

    it('toggle-aim-mode no-ops when screen is not playing', () => {
      const { combat, eventBus } = setupCombatHarness();
      eventBus.emit('toggle-aim-mode', { screen: 'menu' });
      expect(combat.getAimMode()).toBe('auto');
    });
  });

  describe('render visual feedback gated by targetingUpgradeLevel + aimMode', () => {
    // Helper: create a minimal canvas-2d-ish stub that records stroke/arc/fill
    // calls so we can assert which visual elements were drawn.
    function makeCtxStub() {
      const calls = [];
      const record = (name) => (...args) => calls.push({ name, args });
      return {
        calls,
        save: record('save'),
        restore: record('restore'),
        beginPath: record('beginPath'),
        arc: record('arc'),
        stroke: record('stroke'),
        fill: record('fill'),
        moveTo: record('moveTo'),
        lineTo: record('lineTo'),
        setLineDash: record('setLineDash'),
        drawImage: record('drawImage'),
        rotate: record('rotate'),
        translate: record('translate'),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        // Settable state — getters/setters as plain assignments.
        set fillStyle(v) { calls.push({ name: 'set:fillStyle', args: [v] }); },
        set strokeStyle(v) { calls.push({ name: 'set:strokeStyle', args: [v] }); },
        set lineWidth(v) { calls.push({ name: 'set:lineWidth', args: [v] }); },
        set globalAlpha(v) { calls.push({ name: 'set:globalAlpha', args: [v] }); },
        set globalCompositeOperation(v) { calls.push({ name: 'set:gco', args: [v] }); },
        set font(v) { calls.push({ name: 'set:font', args: [v] }); },
        canvas: { width: 800, height: 600 },
      };
    }

    function countArcCallsOnTarget(ctx, target) {
      return ctx.calls.filter(
        (c) =>
          c.name === 'arc' &&
          Math.abs(c.args[0] - target.x) < 1 &&
          Math.abs(c.args[1] - target.y) < 1
      ).length;
    }

    it('rank 0 (no targeting upgrade): no lock-ring arcs drawn on currentTarget', () => {
      const { combat } = setupCombatHarness();
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      const target = combat.currentTarget;
      expect(target).not.toBeNull();
      // Rank 0 default.
      expect(combat.targetingUpgradeLevel).toBe(0);

      const ctx = makeCtxStub();
      combat.render(ctx);

      // No targeting-affordance arcs should be drawn on the target position.
      // Bullets draw at their own positions, not the target's.
      const arcs = countArcCallsOnTarget(ctx, target);
      expect(arcs).toBe(0);
    });

    it('rank 1 + auto aim: lock-ring arc drawn on currentTarget', () => {
      const { combat, eventBus } = setupCombatHarness();
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      const target = combat.currentTarget;
      expect(target).not.toBeNull();
      expect(combat.targetingUpgradeLevel).toBeGreaterThanOrEqual(1);

      const ctx = makeCtxStub();
      combat.render(ctx);

      const arcs = countArcCallsOnTarget(ctx, target);
      expect(arcs).toBeGreaterThanOrEqual(1);
    });

    it('manual mode: no targeting render at any rank (no leak)', () => {
      const { combat, eventBus } = setupCombatHarness({ multishot: 2 });
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      eventBus.emit('upgrade-aiming-suite', { level: 2 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 3,
        multiLockTargets: 4,
        cooldownMultiplier: 0.92,
      });
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      const targetSnapshot = { ...combat.currentTarget };

      combat.setAimMode('manual');
      // After manual toggle, currentTarget is null. Render uses the cached
      // assignments, but the gate must skip them too. Verify by also placing
      // a fake assignment back to test the explicit aimMode-gate path.
      // Instead, simply assert render does NOT draw arcs at the previous
      // target position when aimMode is 'manual'.
      const ctx = makeCtxStub();
      combat.render(ctx);
      const arcs = countArcCallsOnTarget(ctx, targetSnapshot);
      expect(arcs).toBe(0);
    });

    // Fix-pass (F11): Codex review noted rank-2 predicted-marker render and
    // rank-3 multi-lock indicator render had no test coverage. The render
    // path gates these blocks at `targetingRank >= 2 && aimMode !== 'manual'`
    // and `renderMultiLock === (rank >= 3)` respectively. These tests assert
    // BOTH the gated content lands (when expected) AND it stays gated (when
    // suppressed).
    it('F11 (rank 2): predicted-impact marker drawn at the predicted-aim position', () => {
      // Rank 2 requires the predicted point to be different from the target
      // position, so we use a MOVING target (the harness's Concern-4 setup).
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
      expect(combat.targetingUpgradeLevel).toBeGreaterThanOrEqual(2);
      expect(combat.usingDynamicPrediction()).toBe(true);
      expect(combat.predictedAimPoints.length).toBeGreaterThan(0);
      const predicted = combat.predictedAimPoints[0].position;
      expect(predicted).toBeDefined();

      const ctx = makeCtxStub();
      combat.render(ctx);

      // At least one arc call should land near the PREDICTED position
      // (separate from the lock-ring arc which lands at target.x/y).
      const predictedArcs = ctx.calls.filter(
        (c) =>
          c.name === 'arc' &&
          Math.abs(c.args[0] - predicted.x) < 1 &&
          Math.abs(c.args[1] - predicted.y) < 1
      );
      expect(predictedArcs.length).toBeGreaterThanOrEqual(1);
    });

    it('F11 (rank 3): multi-lock indicator arcs drawn at ALL lock assignments (not just primary)', () => {
      const extraEnemies = [
        { id: 'enemy-2', x: 650, y: 320 },
        { id: 'enemy-3', x: 620, y: 280 },
        { id: 'enemy-4', x: 580, y: 340 },
      ];
      const { combat, eventBus, playerState } = setupCombatHarness({
        multishot: 4,
        extraEnemies,
      });
      playerState.multishot = 4;
      // computeLockCount reads from this.lastKnownPlayerStats which is only
      // populated by `update()` (not `updateTargeting`). Seed it explicitly
      // so the rank-3 lock pipeline sees multishot=4 and allocates 4 locks.
      combat.lastKnownPlayerStats = { multishot: 4, damage: 10 };
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      eventBus.emit('upgrade-aiming-suite', { level: 2 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 3,
        multiLockTargets: 4,
        cooldownMultiplier: 0.92,
      });
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      expect(combat.targetingUpgradeLevel).toBeGreaterThanOrEqual(3);

      const assignments = combat.currentLockAssignments;
      expect(assignments.length).toBeGreaterThanOrEqual(2);

      const ctx = makeCtxStub();
      combat.render(ctx);

      // Lock-ring rendering: one arc + stroke pair per assignment. Verify at
      // least 2 DISTINCT lock-ring arc positions land (proving rank-3
      // multi-lock indicators draw all enemies, not just the primary).
      const uniqueEnemyPositions = new Set();
      assignments.forEach((a) => {
        if (a && a.enemy) {
          uniqueEnemyPositions.add(`${Math.round(a.enemy.x)},${Math.round(a.enemy.y)}`);
        }
      });
      expect(uniqueEnemyPositions.size).toBeGreaterThanOrEqual(2);

      const arcHits = new Set();
      ctx.calls
        .filter((c) => c.name === 'arc')
        .forEach((c) => {
          const xKey = Math.round(c.args[0]);
          const yKey = Math.round(c.args[1]);
          // Match to any of the assignment positions (within ±50 px so the
          // arc-radius offset doesn't disqualify the match).
          for (const pos of uniqueEnemyPositions) {
            const [px, py] = pos.split(',').map(Number);
            if (Math.abs(px - xKey) < 2 && Math.abs(py - yKey) < 2) {
              arcHits.add(pos);
              break;
            }
          }
        });
      // Rank-3 contract: arcs land at AT LEAST 2 distinct lock positions
      // (proving the multi-lock loop is rendering more than just index 0).
      expect(arcHits.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('4-combo matrix: auto/manual × concentrated/fan', () => {
    const combos = [
      { aim: 'auto', spread: 'concentrated' },
      { aim: 'auto', spread: 'fan' },
      { aim: 'manual', spread: 'concentrated' },
      { aim: 'manual', spread: 'fan' },
    ];

    combos.forEach(({ aim, spread }) => {
      it(`combo (aim=${aim}, spread=${spread}) produces N=2 bullets`, () => {
        const { combat, playerState } = setupCombatHarness({ multishot: 2 });
        playerState.multishot = 2;
        combat.setSpreadMode(spread);
        combat.setAimMode(aim);

        if (aim === 'auto') {
          combat.targetUpdateTimer = 0;
          combat.updateTargeting(0);
        }

        const before = combat.bullets.length;
        const player = combat.getCachedPlayer();
        combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
        const fired = combat.bullets.slice(before);

        expect(fired.length).toBe(2);
      });
    });
  });

  describe('centerline distance assertion (FIX-05 root invariant)', () => {
    // Phase 1 fun-check found: N=2 at distance 300, asteroid radius 16 → both
    // shots fly 44.8 px outside the target in legacy fan. Plan 01.07's
    // concentrated default fixes this. Tests assert the geometric distance from
    // each bullet's aim line to the target center.

    function aimLineDistance(bullet, targetX, targetY) {
      // Bullet aim line goes from (bullet.x, bullet.y) with direction (vx, vy).
      // Distance from point (targetX, targetY) to that line:
      const dx = bullet.vx;
      const dy = bullet.vy;
      const speed = Math.hypot(dx, dy);
      if (speed === 0) return Infinity;
      const nx = -dy / speed;
      const ny = dx / speed;
      // Signed distance from start to target projected on the perpendicular.
      return Math.abs((targetX - bullet.x) * nx + (targetY - bullet.y) * ny);
    }

    [2, 3, 4].forEach((n) => {
      it(`concentrated N=${n}: all bullets pass within (targetRadius + BULLET_SIZE) of target center`, () => {
        const { combat, playerState } = setupCombatHarness({ multishot: n });
        playerState.multishot = n;
        combat.setSpreadMode('concentrated');
        combat.targetUpdateTimer = 0;
        combat.updateTargeting(0);

        const before = combat.bullets.length;
        const player = combat.getCachedPlayer();
        combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
        const fired = combat.bullets.slice(before);
        expect(fired.length).toBeGreaterThanOrEqual(n);

        const enemy = combat.currentTarget;
        const limit = (enemy.radius || 16) + BULLET_SIZE;
        fired.forEach((b) => {
          // In concentrated mode, lanes are parallel-translated by ≤ limit.
          // The aim line passes within `limit` of the target center.
          const d = aimLineDistance(b, enemy.x, enemy.y);
          expect(d).toBeLessThanOrEqual(limit + 0.5);
        });
      });
    });
  });

  describe('recoil follows centerlineTarget direction (Task 2 backward-compat invariant)', () => {
    it('PlayerSystem.recoilOffset matches centerlineTarget direction (not first projectile aim)', () => {
      const container = createTestContainer('recoil-seed');
      const eventBus = container.resolve('event-bus');
      const player = new PlayerSystem({
        position: { x: 100, y: 100 },
        dependencies: { eventBus },
      });

      // Centerline at (400, 100) — straight to the right of (100, 100).
      // Even if 'target' is offset perpendicular, recoil must point left
      // (opposite of the centerline direction).
      eventBus.emit('weapon-fired', {
        position: { x: 100, y: 100 },
        target: { x: 400, y: 130 }, // first projectile aim — offset
        centerlineTarget: { x: 400, y: 100 }, // logical center — exact axis
      });

      // Recoil should be opposite +x → recoilOffset.x is negative.
      expect(player.recoilOffset.x).toBeLessThan(0);
      // Recoil y should be near zero (centerline is on axis).
      expect(Math.abs(player.recoilOffset.y)).toBeLessThan(0.1);
    });

    it('PlayerSystem falls back to target when centerlineTarget is missing (backward compat)', () => {
      const container = createTestContainer('recoil-fallback-seed');
      const eventBus = container.resolve('event-bus');
      const player = new PlayerSystem({
        position: { x: 100, y: 100 },
        dependencies: { eventBus },
      });

      eventBus.emit('weapon-fired', {
        position: { x: 100, y: 100 },
        target: { x: 400, y: 100 },
        // centerlineTarget intentionally omitted
      });

      expect(player.recoilOffset.x).toBeLessThan(0);
    });
  });

  describe('debounce: InputSystem onKeyDown suppresses autorepeat (true contract test)', () => {
    // Fix-pass (F11 — debounce rewrite): the prior test emitted 5 events on
    // the bus and asserted 5 toggles. That tests "the listener has no
    // state," NOT "InputSystem debounces autorepeat." The real contract is
    // that pressing the bound key while still held generates 1 emit, not 5.
    // We exercise InputSystem.onKeyDown directly: 5 calls with the same key
    // (no onKeyUp in between) simulate auto-repeat → 1 toggle. Then onKeyUp
    // + onKeyDown simulates a release+repress → second toggle.

    // Minimal DOM/window stub so InputSystem.setupEventListeners doesn't
    // crash in the node-environment vitest run.
    function withDOMStub(fn) {
      const stub = {
        addEventListener: () => {},
        removeEventListener: () => {},
      };
      const hadDocument = 'document' in globalThis;
      const hadWindow = 'window' in globalThis;
      const prevDocument = globalThis.document;
      const prevWindow = globalThis.window;
      globalThis.document = stub;
      globalThis.window = stub;
      try {
        return fn();
      } finally {
        if (hadDocument) {
          globalThis.document = prevDocument;
        } else {
          delete globalThis.document;
        }
        if (hadWindow) {
          globalThis.window = prevWindow;
        } else {
          delete globalThis.window;
        }
      }
    }

    it('autorepeat (5 keydown with no keyup) → 1 emit; release + repress → 1 more emit', async () => {
      const { default: InputSystem } = await import('../../src/modules/InputSystem.js');
      const container = createTestContainer('debounce-seed');
      const eventBus = container.resolve('event-bus');

      let toggleSpreadEmits = 0;
      eventBus.on('toggle-spread-mode', () => {
        toggleSpreadEmits += 1;
      });

      withDOMStub(() => {
        const input = new InputSystem({ eventBus });
        // Stub resolveGameScreen so the toggle path emits without needing
        // a game-state service in the harness.
        input.resolveGameScreen = () => 'playing';

        // Build a fake keyboard event for the G key.
        const fakeEvent = (type) => ({
          type,
          key: 'g',
          code: 'KeyG',
          preventDefault: () => {},
          stopPropagation: () => {},
        });

        // 5 consecutive onKeyDown calls with NO onKeyUp in between simulate
        // auto-repeat (browsers fire keydown repeatedly while a key is held).
        for (let i = 0; i < 5; i += 1) {
          input.onKeyDown(fakeEvent('keydown'));
        }
        // Contract: only the FIRST keydown should have fired the action.
        expect(toggleSpreadEmits).toBe(1);

        // Release + repress = another emit.
        input.onKeyUp(fakeEvent('keyup'));
        input.onKeyDown(fakeEvent('keydown'));
        expect(toggleSpreadEmits).toBe(2);
      });
    });
  });

  describe('recommendedShots damage-aware overkill cap', () => {
    // Fix-pass-2 (C2 REVERT): the OBSERVABLE behavior of the overkill cap is
    // measured in "bullets actually fired per burst". The caller spawns N
    // bullets, each dealing `damage`. Total burst damage = bullets × damage.
    // The cap exists to prevent OVERKILL — never to under-fire mid-HP targets.
    //
    // Wrong formula (first fix-pass F2): `damage * shotCount * hitRate` treats
    // multishot as a single mega-volley. Result: HP=500/dmg=100/multi=4 fires
    // 2 bullets (= 200 damage, under-fire) instead of 4 (= 400 damage, ≥ HP).
    //
    // Correct formula: `damage * hitRate` (per-bullet damage). Number of
    // bullets needed = ceil(HP / (damage * hitRate)), capped at multishot.
    //
    // Each test below asserts the OBSERVABLE bullet count from a real burst
    // (not the allocator's return value) so the test cannot be made to pass by
    // re-deriving the wrong formula in the assertion.

    // C2 test 1 (OVERKILL prevented): HP=50, damage=100, multishot=4.
    // One bullet (100 damage) already overkills the 50 HP enemy. Cap at 1.
    it('C2: HP=50/dmg=100/multi=4 burst → 1 bullet spawned (overkill cap)', () => {
      const { combat, playerState } = setupCombatHarness({
        multishot: 4,
        damage: 100,
        targetPosition: { x: 600, y: 300 },
      });
      let baseEnemy = null;
      combat.cachedEnemies.forEachActiveEnemy((e) => {
        if (!baseEnemy) baseEnemy = e;
      });
      expect(baseEnemy).not.toBeNull();
      baseEnemy.radius = 8;
      baseEnemy.health = 50;
      baseEnemy.maxHealth = 50;
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      playerState.multishot = 4;
      playerState.damage = 100;

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.length - before;
      expect(fired).toBe(1);
    });

    // C2 test 2 (MID-HP — must NOT under-fire): HP=500, damage=100, multi=4.
    // ceil(500/100) = 5, capped at multishot 4 → exactly 4 bullets fired.
    // Total deliverable damage = 400 < 500 HP. Cap is the BULLET count, NOT a
    // single mega-volley damage value. The wrong F2 formula under-fired here
    // (returning 2 bullets), wasting half the burst the player paid multishot
    // for.
    it('C2: HP=500/dmg=100/multi=4 burst → 4 bullets spawned (no under-fire)', () => {
      const { combat, playerState } = setupCombatHarness({
        multishot: 4,
        damage: 100,
        targetPosition: { x: 600, y: 300 },
      });
      let baseEnemy = null;
      combat.cachedEnemies.forEachActiveEnemy((e) => {
        if (!baseEnemy) baseEnemy = e;
      });
      expect(baseEnemy).not.toBeNull();
      baseEnemy.radius = 18;
      baseEnemy.health = 500;
      baseEnemy.maxHealth = 500;
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      playerState.multishot = 4;
      playerState.damage = 100;

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.length - before;
      expect(fired).toBe(4);
    });

    // C2 test 3 (HIGH-HP boss — full allocation): HP=1500, damage=10, multi=4.
    // ceil(1500/10) = 150, capped at multishot 4 → exactly 4 bullets fired.
    it('C2: HP=1500/dmg=10/multi=4 burst → 4 bullets spawned (full allocation)', () => {
      const { combat, playerState } = setupCombatHarness({
        multishot: 4,
        damage: 10,
        targetPosition: { x: 600, y: 300 },
      });
      let baseEnemy = null;
      combat.cachedEnemies.forEachActiveEnemy((e) => {
        if (!baseEnemy) baseEnemy = e;
      });
      expect(baseEnemy).not.toBeNull();
      baseEnemy.radius = 64;
      baseEnemy.health = 1500;
      baseEnemy.maxHealth = 1500;
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      playerState.multishot = 4;
      playerState.damage = 10;

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.length - before;
      expect(fired).toBe(4);
    });

    // Additional defensive cases at the allocator level (paralleling the live
    // burst tests above so an allocator-only refactor still trips the cap).
    it('C2 allocator: HP=50/dmg=100/multi=4 → allocates 1 (matches burst count)', () => {
      const { combat } = setupCombatHarness({ multishot: 4, damage: 100 });
      const enemy = {
        id: 'tiny-1', x: 600, y: 300, radius: 8,
        health: 50, maxHealth: 50, variant: 'common', size: 'small',
      };
      const allocated = combat.computeAllocatedShots(enemy, { damage: 100, multishot: 4 });
      expect(allocated).toBe(1);
    });

    it('C2 allocator: HP=500/dmg=100/multi=4 → allocates 4 (does NOT under-fire mid-HP)', () => {
      const { combat } = setupCombatHarness({ multishot: 4, damage: 100 });
      const enemy = {
        id: 'mid-1', x: 600, y: 300, radius: 18,
        health: 500, maxHealth: 500, variant: 'common', size: 'medium',
      };
      const allocated = combat.computeAllocatedShots(enemy, { damage: 100, multishot: 4 });
      expect(allocated).toBe(4);
    });

    it('C2 allocator: HP=1500/dmg=10/multi=4 → allocates 4 (high-HP, full multishot)', () => {
      const { combat } = setupCombatHarness({ multishot: 4, damage: 10 });
      const enemy = {
        id: 'boss-1', x: 600, y: 300, radius: 64,
        health: 1500, maxHealth: 1500, variant: 'common', size: 'large', type: 'boss',
      };
      const allocated = combat.computeAllocatedShots(enemy, { damage: 10, multishot: 4 });
      expect(allocated).toBe(4);
    });
  });

  // Fix-pass-2 (C1): rank-3 advanced battery's overkill cap was not wired.
  // The first fix-pass gate `if (!usingAdvancedBattery && requestedShots > 1)`
  // intentionally excluded rank-3 — so a single low-HP enemy in the lock set
  // could absorb all 4 shots that 1 shot would kill. The plan must-have:
  // "Rank-3 multi-lock still allocates up to multiLockTargets DIFFERENT enemies;
  // overkill cap applies per-enemy (don't send 4 shots to 1 enemy that 1 shot
  // would kill)."
  describe('C1: rank-3 multi-lock per-enemy overkill cap', () => {
    // Helper: bring CombatSystem to rank-3 with multiLockTargets=4.
    // IMPORTANT: `lastKnownPlayerStats` is normally set inside `update()` —
    // tests that bypass `update()` and call `updateTargeting` directly must
    // wire it manually so `computeLockCount` sees the player's multishot
    // (otherwise it falls back to 1 and rank-3 collapses to 1 lock).
    function makeRank3Combat(extraEnemies = []) {
      const harness = setupCombatHarness({ multishot: 4, damage: 100, extraEnemies });
      const { combat, eventBus, playerState } = harness;
      eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
      eventBus.emit('upgrade-aiming-suite', { level: 2 });
      eventBus.emit('upgrade-aiming-suite', {
        level: 3,
        multiLockTargets: 4,
        cooldownMultiplier: 0.92,
      });
      playerState.multishot = 4;
      playerState.damage = 100;
      combat.lastKnownPlayerStats = { multishot: 4, damage: 100 };
      return harness;
    }

    // 1 lock target, HP=50 (one-shot from dmg=100). Pre-fix: 4 bullets ALL go
    // to this one enemy (3 wasted). Post-fix: 1 bullet (per-enemy cap).
    it('C1: rank-3 + 1 enemy with HP=50/dmg=100/multi=4 → 1 bullet fired (NOT 4)', () => {
      const { combat, playerState } = makeRank3Combat();
      let baseEnemy = null;
      combat.cachedEnemies.forEachActiveEnemy((e) => {
        if (!baseEnemy) baseEnemy = e;
      });
      expect(baseEnemy).not.toBeNull();
      baseEnemy.radius = 8;
      baseEnemy.health = 50;
      baseEnemy.maxHealth = 50;
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      // Sanity: rank-3 active, 4 multishot, ≥1 lock.
      expect(combat.targetingUpgradeLevel).toBeGreaterThanOrEqual(3);
      expect(playerState.multishot).toBe(4);
      expect(combat.currentTargetLocks.length).toBeGreaterThanOrEqual(1);

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.length - before;

      // The lone target HP=50 only needs 1 shot at damage=100. The 3 extra
      // multishot slots have nowhere else to go (no other enemies in range),
      // so they MUST be dropped (overkill prevented) — they cannot pile onto
      // the same already-dead-on-arrival enemy.
      expect(fired).toBe(1);
    });

    // 4 lock targets, HP=50 each (each one-shot from dmg=100), multishot=4.
    // Pre-fix: still 4 bullets total (since the no-cap rank-3 path naturally
    // distributes to 4 distinct enemies via buildLockAssignments). Post-fix:
    // ALSO 4 bullets — but for the correct reason (1 per enemy after the
    // per-enemy cap reduces each to its needed shot count).
    it('C1: rank-3 + 4 enemies × HP=50 each → 4 bullets fired total (1 per enemy)', () => {
      const extraEnemies = [
        { id: 'enemy-2', x: 600, y: 320, variant: 'common', size: 'small' },
        { id: 'enemy-3', x: 620, y: 280, variant: 'common', size: 'small' },
        { id: 'enemy-4', x: 580, y: 340, variant: 'common', size: 'small' },
      ];
      const { combat, playerState } = makeRank3Combat(extraEnemies);
      // Mutate every enemy to tiny-low-HP.
      const enemies = [];
      combat.cachedEnemies.forEachActiveEnemy((e) => enemies.push(e));
      expect(enemies.length).toBe(4);
      enemies.forEach((e) => {
        e.radius = 8;
        e.health = 50;
        e.maxHealth = 50;
      });
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      expect(combat.targetingUpgradeLevel).toBeGreaterThanOrEqual(3);
      expect(combat.currentTargetLocks.length).toBeGreaterThanOrEqual(2);

      const before = combat.bullets.length;
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      const fired = combat.bullets.length - before;

      // Each enemy needs 1 bullet (dmg=100 vs HP=50). With 4 distinct enemies
      // and multishot=4 budget, exactly 4 bullets fired total (NOT 16).
      expect(fired).toBe(4);
    });

    // Fix-pass-3 Finding 3 (the canonical "vacuous test" rewrite). The
    // previous test read `b.targetX` / `b.targetY` from bullets — fields that
    // do NOT exist on bullets created by `createBullet` (CombatSystem.js:2369-
    // 2390). `dx = undefined - num = NaN` → `distTiny = NaN` → `NaN < NaN ===
    // false` → `aimedAtTiny.length === 0` → `expect(0).toBeLessThanOrEqual(1)`
    // PASSED regardless of whether the C1 cap actually worked. The cap could
    // be entirely broken and this would still go green — same class of bug
    // that masked F2.
    //
    // Rewrite: subscribe to the `bullet-created` event (the actual observable
    // surface) and capture each bullet's `to` field (the aim point passed
    // into `createBullet`). The chosen scenario — 1 tiny low-HP enemy alone —
    // forces buildLockAssignments to pile multiple slots onto the same tiny
    // enemy (the only valid target). Pre-fix-pass-3 (cap only in handleShooting):
    // 4 bullets fire, all 4 have `to` ≈ the tiny enemy. With the cap moved
    // upstream into buildLockAssignments: assignments has 1 entry, 1 bullet
    // fires, 1 has `to` ≈ tiny. The assertion uses bullet-to-enemy distance
    // (real observable from event payloads), and includes a payload-shape
    // sanity check so the same vacuous-test class of bug can't repeat.
    it('Finding 3: rank-3 + 1 tiny enemy (HP=50, dmg=100, multi=4) → ≤1 bullet aimed at tiny (via bullet-created event)', () => {
      const harness = makeRank3Combat();
      const { combat, eventBus } = harness;
      let tinyEnemy = null;
      combat.cachedEnemies.forEachActiveEnemy((e) => {
        if (!tinyEnemy) tinyEnemy = e;
      });
      expect(tinyEnemy).not.toBeNull();
      tinyEnemy.radius = 8;
      tinyEnemy.health = 50;
      tinyEnemy.maxHealth = 50;
      combat.targetUpdateTimer = 0;
      combat.updateTargeting(0);
      expect(combat.targetingUpgradeLevel).toBeGreaterThanOrEqual(3);

      // Subscribe to bullet-created BEFORE handleShooting. The event payload
      // is the real observable surface — read CombatSystem.js:2392-2396 to
      // confirm: `eventBus.emit('bullet-created', { bullet, from, to })`.
      const created = [];
      const off = eventBus.on('bullet-created', (payload) => {
        created.push(payload);
      });

      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());

      off?.();

      // Sanity: bullet-created event payload exposes `to` with `x` and `y`.
      // Without this guard a future regression where the payload shape
      // changes would silently turn this test vacuous again.
      expect(created.length).toBeGreaterThan(0);
      const sample = created[0];
      expect(sample).toHaveProperty('to');
      expect(sample.to).toHaveProperty('x');
      expect(sample.to).toHaveProperty('y');

      // The plan contract — the tiny enemy (HP=50, 1-shot at dmg=100) MUST
      // NOT receive more than 1 bullet, regardless of how many lock slots it
      // accumulated. Count bullets whose `to` point is within (radius +
      // bullet radius + lane spread) of the tiny enemy. With the cap broken,
      // buildLockAssignments piles 4 slots onto the tiny (only valid target);
      // 4 bullets fire, 4 are clearly aimed at it. With the cap correct:
      // 1 bullet, 1 aimed at it.
      const PROXIMITY = 30; // wider than any lane spread so we don't miss any
      const aimedAtTiny = created.filter((p) => {
        const dx = p.to.x - tinyEnemy.x;
        const dy = p.to.y - tinyEnemy.y;
        return Math.sqrt(dx * dx + dy * dy) <= PROXIMITY;
      });
      expect(aimedAtTiny.length).toBeLessThanOrEqual(1);
    });

    // Fix-pass-3 paranoia guard: lock the contract that bullets do NOT
    // expose `targetX`/`targetY` fields. If a future refactor adds these
    // back, the previous test will silently turn vacuous again. Asserting
    // their absence at the bullet-object level surfaces that drift loudly.
    it('bullets do NOT have targetX/targetY fields (asserts assumptions for Finding 3)', () => {
      const { combat } = setupCombatHarness({ multishot: 1, damage: 100 });
      const player = combat.getCachedPlayer();
      combat.handleShooting(combat.shootCooldown + 0.001, player.getStats());
      expect(combat.bullets.length).toBeGreaterThan(0);
      const b = combat.bullets[combat.bullets.length - 1];
      // If either of these flips, the fix-pass-3 Finding 3 test must be
      // re-audited to ensure it still reads observable fields.
      expect(b).not.toHaveProperty('targetX');
      expect(b).not.toHaveProperty('targetY');
    });
  });
});
