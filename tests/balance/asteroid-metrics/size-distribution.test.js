import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import {
  setupGlobalMocks,
  cleanupGlobalState,
  withWaveOverrides,
} from '../../__helpers__/setup.js';
import { expectWithinTolerance } from '../../__helpers__/assertions.js';
import {
  createEnemySystemHarness,
  prepareWave,
  collectSpawnMetrics,
  SAMPLE_ASTEROID_COUNT,
} from '../../__helpers__/asteroid-helpers.js';

describe('Asteroid Metrics - Size Distribution', () => {
  /** @type {{ enemySystem: any, container: any }} */
  let harness;

  beforeEach(() => {
    setupGlobalMocks();
    harness = createEnemySystemHarness();
  });

  afterEach(() => {
    if (GamePools.asteroids?.releaseAll) {
      GamePools.asteroids.releaseAll();
    }
    if (typeof GamePools.destroy === 'function') {
      GamePools.destroy();
    }
    harness?.container?.dispose?.();
    cleanupGlobalState();
  });

  test(
    'spawned asteroids follow 50/30/20 distribution',
    { timeout: 15000 },
    () =>
      withWaveOverrides({ useManager: false }, () => {
        prepareWave(harness.enemySystem, 1);
        harness.enemySystem.waveState.totalAsteroids = SAMPLE_ASTEROID_COUNT;
        const spawnLog = [];

        try {
          for (let index = 0; index < SAMPLE_ASTEROID_COUNT; index += 1) {
            const asteroid = harness.enemySystem.spawnAsteroid();
            if (asteroid) {
              spawnLog.push(asteroid);
            }
          }

          const { sizeCounts, total } = collectSpawnMetrics(spawnLog);
          const tolerance = (expected) =>
            Math.max(0.01, Math.min(0.05, Math.abs(expected) * 0.3 || 0));
          expectWithinTolerance(sizeCounts.large / total, 0.5, tolerance(0.5));
          expectWithinTolerance(sizeCounts.medium / total, 0.3, tolerance(0.3));
          expectWithinTolerance(sizeCounts.small / total, 0.2, tolerance(0.2));
        } finally {
          for (const asteroid of spawnLog) {
            harness.enemySystem.destroyAsteroid(asteroid, {
              createFragments: false,
              triggerExplosion: false,
            });
          }
          harness.enemySystem.cleanupDestroyed?.();
        }
      })
  );
});
