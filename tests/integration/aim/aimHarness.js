/**
 * Shared harness for the aim regression suite (tests/integration/aim/*.test.js).
 * Seed: AIM_REGRESSION_SEED = 0xA1A1 (shared per D-05 so fixture diffs are reviewable).
 */

import { createTestContainer } from '../../__helpers__/setup.js';
import CombatSystem from '../../../src/modules/CombatSystem.js';

const AIM_REGRESSION_SEED = 0xa1a1;
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
export const MOVING_TARGET_POSITION = { x: 700, y: 400 };
export const MOVING_TARGET_VELOCITY = { vx: 300, vy: -100 };

/**
 * Build a CombatSystem with a deterministic, minimal mock surface that can drive
 * `handleShooting` end-to-end (target acquisition + bullet creation).
 *
 * The mock player exposes the surface CombatSystem reads:
 *   - getPosition(), getVelocity(), getAngle(), getRotation()
 *   - getStats() — returns { multishot, damage } from a mutable internal state.
 *   - isDead = false
 *   - getHullBoundingRadius(), getShieldRadius(), getNosePosition()
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
export function setupCombatHarness({
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
    getShieldRadius() {
      return 16;
    },
    getTurretAngle() {
      return 0;
    },
    getMuzzlePoint() {
      return { ...playerPos };
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
export function captureVectorSet(combat, fireCount = 8) {
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
  const angles = fired.map((b) => Math.atan2(b.vy, b.vx)).sort((a, b) => a - b);
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
