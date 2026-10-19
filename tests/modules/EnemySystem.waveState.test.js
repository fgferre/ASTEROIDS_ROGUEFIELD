/**
 * WaveManager owns the layer's rock counts: EnemySystem.waveState is a
 * read-only copy of them and EnemySpawnSystem keeps none of its own.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import {
  createEnemySystemHarness,
  prepareWave,
} from '../__helpers__/asteroid-helpers.js';

const TRICKLE_STEPS = 120; // 2 s at 60 Hz

describe('EnemySystem.waveState', () => {
  let harness;

  afterEach(() => {
    harness?.container?.dispose?.();
    GamePools.releaseAll();
  });

  it("reports the trickle's rocks from WaveManager; the spawn system counts none", () => {
    harness = createEnemySystemHarness();
    const { enemySystem } = harness;
    prepareWave(enemySystem, 3);
    const { waveManager } = enemySystem;

    for (let step = 0; step < TRICKLE_STEPS; step += 1) {
      waveManager.updateRockTrickle(1 / 60);
    }

    expect(waveManager.rocksSpawned).toBeGreaterThan(1);
    expect(enemySystem.waveState.asteroidsSpawned).toBe(
      waveManager.rocksSpawned
    );
    expect(Object.keys(enemySystem.spawnSystem)).toEqual(['facade']);
    expect(Object.hasOwn(enemySystem, 'waveState')).toBe(false);
  });
});
