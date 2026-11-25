import { describe, test, expect, beforeEach } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';

describe('GamePools bullets', () => {
  beforeEach(() => {
    GamePools.destroy?.();
    GamePools.initialize();
  });

  test('a recycled bullet keeps its trail array, emptied', () => {
    const bullet = GamePools.bullets.acquire();
    const trail = bullet.trail;
    trail.push({ x: 1, y: 2 });
    GamePools.bullets.release(bullet);

    const reused = GamePools.bullets.acquire();
    expect(reused).toBe(bullet);
    expect(reused.trail).toBe(trail);
    expect(reused.trail).toHaveLength(0);
  });
});
