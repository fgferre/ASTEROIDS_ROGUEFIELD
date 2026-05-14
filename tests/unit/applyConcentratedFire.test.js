/**
 * Unit tests for `applyConcentratedFire` helper extracted from CombatSystem.
 *
 * Plan 01.07 Task 1 — RED phase. These tests describe the discriminator-typed
 * API:
 *   - `{ kind: 'target', enemy, predictedAim?, fireOrigin? }` → concentrated fire on a specific enemy.
 *   - `{ kind: 'direction', angle, originPos }` → concentrated fire in a direction from an origin.
 *
 * Lane clamp for kind:'target' is `Math.min(spacing, targetRadius + BULLET_SIZE)` so
 * outer lanes never exceed the target's effective hit radius (radius + bullet radius).
 *
 * Reference: .planning/phases/01-profiling-baseline-pre-flight-deliverables/01.07-aim-centerline-toggles-PLAN.md
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  setupGlobalMocks,
  cleanupGlobalState,
  createTestContainer,
} from '../__helpers__/setup.js';
import { GamePools } from '../../src/core/GamePools.js';
import CombatSystem from '../../src/modules/CombatSystem.js';
import { BULLET_SIZE } from '../../src/core/GameConstants.js';

const TEST_SEED = 0xCF01;

function makeCombat() {
  const container = createTestContainer(String(TEST_SEED));
  const eventBus = container.resolve('event-bus');
  const random = container.resolve('random');
  const playerPos = { x: 0, y: 0 };
  const player = {
    isDead: false,
    isRetrying: false,
    _quitExplosionHidden: false,
    getPosition() { return { ...playerPos }; },
    getVelocity() { return { x: 0, y: 0 }; },
    getAngle() { return 0; },
    getRotation() { return 0; },
    getHullBoundingRadius() { return 16; },
    getStats() { return { multishot: 1, damage: 10 }; },
  };
  const enemies = { forEachActiveEnemy: () => {} };
  const physics = { forEachBulletCollision: () => {} };
  return new CombatSystem({ eventBus, random, player, enemies, physics });
}

describe('applyConcentratedFire', () => {
  beforeAll(() => {
    if (!GamePools.initialized) {
      GamePools.initialize();
    }
  });

  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());

  describe('kind:target', () => {
    it('returns 4 entries with perpendicular offsets within ±(targetRadius + BULLET_SIZE) for radius 16, shotCount 4', () => {
      const combat = makeCombat();
      const playerPos = { x: 0, y: 0 };
      const enemy = { id: 'e1', x: 300, y: 0, radius: 16 };
      const playerStats = { damage: 10, multishot: 4 };

      const result = combat.applyConcentratedFire(
        { kind: 'target', enemy, fireOrigin: playerPos },
        4,
        playerStats
      );

      expect(result).toHaveLength(4);

      const limit = enemy.radius + BULLET_SIZE; // 19
      result.forEach((entry) => {
        // Perpendicular distance from centerline (the line from player to enemy on x axis).
        // Centerline is the x-axis (y=0), so |aimPoint.y - 0| is the perpendicular offset.
        const perpOffset = Math.abs(entry.aimPoint.y);
        expect(perpOffset).toBeLessThanOrEqual(limit + 0.0001);

        // Both fireOrigin and aimPoint shifted by the same perpendicular vector.
        const originPerp = Math.abs(entry.fireOrigin.y);
        expect(Math.abs(originPerp - perpOffset)).toBeLessThan(0.0001);
      });
    });

    it('lanes clamped to ±(radius + BULLET_SIZE) for small radius 8, shotCount 4 (all within hitbox silhouette)', () => {
      const combat = makeCombat();
      const playerPos = { x: 0, y: 0 };
      const enemy = { id: 'e1', x: 300, y: 0, radius: 8 };
      const playerStats = { damage: 10, multishot: 4 };

      const result = combat.applyConcentratedFire(
        { kind: 'target', enemy, fireOrigin: playerPos },
        4,
        playerStats
      );

      expect(result).toHaveLength(4);
      const limit = 8 + BULLET_SIZE; // 11
      result.forEach((entry) => {
        expect(Math.abs(entry.aimPoint.y)).toBeLessThanOrEqual(limit + 0.0001);
      });
    });

    it('returns empty array when enemy is null', () => {
      const combat = makeCombat();
      const result = combat.applyConcentratedFire(
        { kind: 'target', enemy: null },
        4,
        { damage: 10, multishot: 4 }
      );
      expect(result).toEqual([]);
    });
  });

  describe('kind:direction', () => {
    it('returns 3 entries on +x axis with x ≈ 1000 for angle 0, shotCount 3', () => {
      const combat = makeCombat();
      const playerStats = { damage: 10, multishot: 3 };

      const result = combat.applyConcentratedFire(
        { kind: 'direction', angle: 0, originPos: { x: 0, y: 0 } },
        3,
        playerStats
      );

      expect(result).toHaveLength(3);
      result.forEach((entry) => {
        // Each aim point lies at +1000 along the angle direction from its fireOrigin.
        const dx = entry.aimPoint.x - entry.fireOrigin.x;
        const dy = entry.aimPoint.y - entry.fireOrigin.y;
        expect(dx).toBeCloseTo(1000, 1);
        expect(dy).toBeCloseTo(0, 1);
      });

      // Three lanes ordered along the y axis (perpendicular to +x).
      const ys = result.map((entry) => entry.fireOrigin.y).sort((a, b) => a - b);
      expect(ys[0]).toBeLessThan(ys[1]);
      expect(ys[1]).toBeLessThan(ys[2]);
      // Middle lane has zero offset (shotCount 3 → indices -1, 0, +1).
      expect(ys[1]).toBeCloseTo(0, 5);
    });

    it('uses perpendicular offset on x axis for angle π/2 (straight up), shotCount 2', () => {
      const combat = makeCombat();
      const result = combat.applyConcentratedFire(
        { kind: 'direction', angle: Math.PI / 2, originPos: { x: 0, y: 0 } },
        2,
        { damage: 10, multishot: 2 }
      );

      expect(result).toHaveLength(2);
      // Both aim points lie at +1000 along +y from their fireOrigin.
      result.forEach((entry) => {
        const dx = entry.aimPoint.x - entry.fireOrigin.x;
        const dy = entry.aimPoint.y - entry.fireOrigin.y;
        expect(dx).toBeCloseTo(0, 1);
        expect(dy).toBeCloseTo(1000, 1);
      });

      // Two lanes ordered along x axis (perpendicular to +y).
      const xs = result.map((entry) => entry.fireOrigin.x).sort((a, b) => a - b);
      expect(xs[0]).toBeLessThan(xs[1]);
      // Symmetric around 0 (shotCount 2 → indices -0.5, +0.5).
      expect(xs[0]).toBeCloseTo(-xs[1], 5);
    });
  });

  describe('edge cases', () => {
    it('shotCount=1 returns single zero-offset entry regardless of kind (target)', () => {
      const combat = makeCombat();
      const enemy = { id: 'e1', x: 300, y: 0, radius: 16 };

      const result = combat.applyConcentratedFire(
        { kind: 'target', enemy },
        1,
        { damage: 10, multishot: 1 }
      );

      expect(result).toHaveLength(1);
      expect(result[0].aimPoint.x).toBeCloseTo(300, 5);
      expect(result[0].aimPoint.y).toBeCloseTo(0, 5);
    });

    it('shotCount=1 returns single zero-offset entry regardless of kind (direction)', () => {
      const combat = makeCombat();

      const result = combat.applyConcentratedFire(
        { kind: 'direction', angle: 0, originPos: { x: 50, y: 50 } },
        1,
        { damage: 10, multishot: 1 }
      );

      expect(result).toHaveLength(1);
      expect(result[0].fireOrigin.x).toBeCloseTo(50, 5);
      expect(result[0].fireOrigin.y).toBeCloseTo(50, 5);
    });

    it('throws on invalid kind discriminator', () => {
      const combat = makeCombat();
      expect(() => {
        combat.applyConcentratedFire(
          { kind: 'invalid' },
          2,
          { damage: 10, multishot: 2 }
        );
      }).toThrow();
    });
  });
});
