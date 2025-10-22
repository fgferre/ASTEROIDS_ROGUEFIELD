import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import { setupGlobalMocks, cleanupGlobalState } from '../../__helpers__/setup.js';
import {
  createEnemySystemHarness,
  summarizeAsteroid,
  TEST_SEED,
} from '../../__helpers__/asteroid-helpers.js';

describe('Asteroid Metrics - Determinism', () => {
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

  describe('Determinism Across Resets', () => {
    test('identical seeds produce identical asteroid sequences', () => {
      const harnessA = createEnemySystemHarness(TEST_SEED);
      const harnessB = createEnemySystemHarness(TEST_SEED);

      const setupHarness = (h) => {
        h.enemySystem.waveState = h.enemySystem.createInitialWaveState();
        h.enemySystem.waveState.current = 1;
        h.enemySystem.waveState.isActive = true;
        h.enemySystem.waveState.totalAsteroids = 10;
        h.enemySystem.waveState.asteroidsSpawned = 0;
        h.enemySystem.reseedRandomScopes?.({ resetSequences: true });
        return h;
      };

      setupHarness(harnessA);
      setupHarness(harnessB);

      const sequenceA = [];
      const sequenceB = [];

      for (let index = 0; index < 10; index += 1) {
        const asteroidA = harnessA.enemySystem.spawnAsteroid();
        const asteroidB = harnessB.enemySystem.spawnAsteroid();
        sequenceA.push(summarizeAsteroid(asteroidA));
        sequenceB.push(summarizeAsteroid(asteroidB));
      }

      expect(sequenceA).toEqual(sequenceB);

      harnessA.container.dispose?.();
      harnessB.container.dispose?.();
    });
  });
});
