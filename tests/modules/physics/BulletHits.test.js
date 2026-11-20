import { describe, expect, it } from 'vitest';
import { BulletHits } from '../../../src/modules/physics/BulletHits.js';

describe('BulletHits', () => {
  it('a piercing lance past A finds B, the next one it touches', () => {
    // Two enemies overlapping on the lance's line: A nearer, B behind it.
    const a = { id: 'a', x: 290, y: 0, radius: 12 };
    const b = { id: 'b', x: 300, y: 0, radius: 12 };
    const hits = new BulletHits({
      activeEnemies: new Set([a, b]),
      maxEnemyRadius: () => 12,
      getNearbyEnemies: () => [a, b],
      performanceMetrics: () => ({ collisionChecks: 0 }),
    });
    const bullet = { x: 292, y: 0, hit: false, pierced: [] };
    const found = () => {
      const ids = [];
      hits.forEachBulletCollision([bullet], (shot, enemy) =>
        ids.push(enemy.id)
      );
      return ids;
    };

    expect(found()).toEqual(['a']);
    bullet.pierced.push(a);
    expect(found()).toEqual(['b']);
  });
});
