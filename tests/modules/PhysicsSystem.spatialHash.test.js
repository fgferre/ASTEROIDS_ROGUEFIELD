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

  it('adds an active boss the hash missed after the rocks, keeping order', () => {
    const physics = new PhysicsSystem({});
    const rockA = { id: 'a', x: 100, y: 100, radius: 12 };
    const rockB = { id: 'b', x: 110, y: 100, radius: 12 };
    physics.registerEnemy(rockA);
    physics.registerEnemy(rockB);
    physics.updateSpatialHash();
    const boss = { id: 'boss', x: 105, y: 100, radius: 40 };
    physics.activeEnemies.add(boss);
    physics.activeBosses.add(boss);

    const plain = physics.spatialHash.query(105, 100, 50, { sorted: false });
    const found = physics.getNearbyEnemies(105, 100, 50);

    expect(found).toEqual([...found.filter((e) => e !== boss), boss]);
    expect(found).toHaveLength(plain.filter((e) => e !== boss).length + 1);
    expect(found).toContain(rockA);
  });
});
