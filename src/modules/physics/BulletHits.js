// src/modules/physics/BulletHits.js
//
// Player shots against enemies: for each bullet in flight, the closest enemy
// it touches this frame, found through the spatial index (bosses included
// even when the hash lags behind them). PhysicsSystem owns it; CombatSystem
// hands it the bullets and resolves each hit.

import { BULLET_SIZE } from '../../core/GameConstants.js';
import { GameDebugLogger } from '../../utils/dev/GameDebugLogger.js';
import { resolveEnemyCollisionRadius } from './bossTuning.js';

export class BulletHits {
  /**
   * `activeEnemies`: the Set of tracked enemies.
   * `maxEnemyRadius()`: the widest enemy radius seen, which pads the search.
   * `getNearbyEnemies(x, y, radius)`: the boss-aware spatial query.
   * `performanceMetrics()`: the physics counters (collisionChecks).
   */
  constructor({
    activeEnemies,
    maxEnemyRadius,
    getNearbyEnemies,
    performanceMetrics,
  }) {
    this.activeEnemies = activeEnemies;
    this.maxEnemyRadius = maxEnemyRadius;
    this.getNearbyEnemies = getNearbyEnemies;
    this.performanceMetrics = performanceMetrics;
  }

  forEachBulletCollision(bullets, handler) {
    if (!Array.isArray(bullets) || typeof handler !== 'function') {
      return;
    }

    if (!this.activeEnemies.size) {
      return;
    }

    const bulletRadius = BULLET_SIZE || 0;
    const maxCheckRadius = bulletRadius + this.maxEnemyRadius();

    for (let i = 0; i < bullets.length; i += 1) {
      const bullet = bullets[i];
      if (!bullet || bullet.hit) {
        continue;
      }

      // Reuse boss-aware candidate collection so bullets still see the boss
      // when spatial-hash indexing temporarily falls behind the tracked entity.
      const candidates = this.getNearbyEnemies(
        bullet.x,
        bullet.y,
        maxCheckRadius
      );

      this.performanceMetrics().collisionChecks += candidates.length;

      let closestMatch = null;
      let closestDistanceSq = Infinity;

      for (let j = 0; j < candidates.length; j += 1) {
        const asteroid = candidates[j];
        if (!asteroid) {
          continue;
        }
        const collisionRadius = resolveEnemyCollisionRadius(asteroid);

        // Precise collision detection
        if (
          this.checkCircleCollision(
            bullet.x,
            bullet.y,
            bulletRadius,
            asteroid.x,
            asteroid.y,
            collisionRadius
          )
        ) {
          const dx = bullet.x - asteroid.x;
          const dy = bullet.y - asteroid.y;
          const distanceSq = dx * dx + dy * dy;

          if (distanceSq < closestDistanceSq) {
            closestDistanceSq = distanceSq;
            closestMatch = asteroid;
          }
        }
      }

      if (closestMatch) {
        if (closestMatch.type === 'boss') {
          const bossRadius = resolveEnemyCollisionRadius(closestMatch);
          const effectiveBossRadius = Number.isFinite(bossRadius)
            ? bossRadius
            : closestMatch.radius || 0;
          const distance = Math.sqrt(Math.max(0, closestDistanceSq));
          const hitRadius = (bulletRadius || 0) + effectiveBossRadius;

          GameDebugLogger.log('COLLISION', 'Bullet hit boss', {
            bulletPosition: {
              x: Math.round(bullet.x ?? 0),
              y: Math.round(bullet.y ?? 0),
            },
            bossPosition: {
              x: Math.round(closestMatch.x ?? 0),
              y: Math.round(closestMatch.y ?? 0),
            },
            distance: Number.isFinite(distance)
              ? Number(distance.toFixed(2))
              : distance,
            hitRadius: Number.isFinite(hitRadius)
              ? Number(hitRadius.toFixed(2))
              : hitRadius,
            damage: bullet.damage || 0,
            bossHealth: closestMatch.health,
            bossInvulnerable: !!closestMatch.invulnerable,
          });
        }

        handler(bullet, closestMatch);
      }
    }
  }

  /**
   * Checks collision between two circular objects.
   * Optimized circle-circle collision detection.
   */
  checkCircleCollision(x1, y1, r1, x2, y2, r2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    const totalRadius = r1 + r2;

    // Use squared distance to avoid expensive sqrt operation
    return dx * dx + dy * dy <= totalRadius * totalRadius;
  }
}
