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

// Two pools nothing took from (shockwaves, a timed one) and a housekeeping
// that grew and shrank the pools on the wall clock inside every fixed step:
// gone (outside audit 8, verdict A4, which proved it changed no run).
describe('GamePools', () => {
  beforeEach(() => {
    GamePools.destroy?.();
    GamePools.initialize();
  });

  test('builds only the pools the game takes from', () => {
    const pools = Object.keys(GamePools.getPoolStats());
    expect(pools).not.toContain('shockwaves');
    expect(pools).not.toContain('tempObjects');
  });

  test('has no housekeeping for the step to run', () => {
    expect(GamePools.update).toBeUndefined();
    expect(GamePools.autoManageAll).toBeUndefined();
  });
});
