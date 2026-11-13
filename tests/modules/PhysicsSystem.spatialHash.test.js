import { afterEach, describe, expect, it, vi } from 'vitest';

import PhysicsSystem from '../../src/modules/PhysicsSystem.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PhysicsSystem spatial hash', () => {
  it('keeps its cell size however much wall time passes between frames', () => {
    const physics = new PhysicsSystem({});
    const sessionStats = { timeElapsed: 0 };
    physics.enemySystem = { sessionStats };
    physics.lastSpatialHashMaintenance = 0;
    const cellSize = physics.spatialHash.cellSize;
    let wallClock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => wallClock);
    // Sparse rocks, one per cell, spawning on a slow machine (seconds of
    // wall time between frames) within the same simulated instant.
    for (let i = 0; i < 30; i += 1) {
      wallClock += 5000;
      physics.registerEnemy({
        id: `rock-${i}`,
        x: (i % 6) * 150 + 20,
        y: Math.floor(i / 6) * 150 + 20,
        radius: 12,
      });
      physics.updateSpatialHash();
    }
    expect(physics.spatialHash.cellSize).toBe(cellSize);
  });
});
