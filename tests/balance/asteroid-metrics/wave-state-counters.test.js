import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import { setupGlobalMocks, cleanupGlobalState, withWaveOverrides } from '../../__helpers__/setup.js';
import { createEnemySystemHarness, prepareWave } from '../../__helpers__/asteroid-helpers.js';

describe('Asteroid Metrics - Wave State Counters', () => {
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

  test('wave lifecycle updates counters correctly', async () => {
    await withWaveOverrides({ useManager: false }, () => {
      prepareWave(harness.enemySystem, 1);
      const startState = { ...harness.enemySystem.waveState };

      expect(startState.isActive).toBe(true);
      expect(startState.asteroidsSpawned).toBeGreaterThanOrEqual(0);
      expect(startState.asteroidsKilled).toBe(0);

      const spawned = harness.enemySystem.spawnAsteroid();
      expect(spawned).toBeTruthy();

      const midState = { ...harness.enemySystem.waveState };
      expect(midState.asteroidsSpawned).toBeGreaterThan(startState.asteroidsSpawned);
      expect(midState.isActive).toBe(true);

      const fragments = harness.enemySystem.destroyAsteroid(spawned, { createFragments: true });
      expect(Array.isArray(fragments)).toBe(true);

      const afterDestruction = { ...harness.enemySystem.waveState };
      expect(afterDestruction.asteroidsKilled).toBeGreaterThan(midState.asteroidsKilled);
      expect(afterDestruction.totalAsteroids).toBe(midState.totalAsteroids + fragments.length);
      expect(afterDestruction.asteroidsSpawned).toBe(
        midState.asteroidsSpawned + fragments.length,
      );

      fragments.forEach((fragmentAsteroid) => {
        harness.enemySystem.destroyAsteroid(fragmentAsteroid, { createFragments: false });
      });

      while (
        harness.enemySystem.waveState.asteroidsSpawned <
        harness.enemySystem.waveState.totalAsteroids
      ) {
        const extra = harness.enemySystem.spawnAsteroid();
        if (!extra) {
          break;
        }
        harness.enemySystem.destroyAsteroid(extra, { createFragments: false });
      }

      const remainingEnemies =
        typeof harness.enemySystem.getAllEnemies === 'function'
          ? harness.enemySystem.getAllEnemies()
          : harness.enemySystem.asteroids.slice();

      remainingEnemies.forEach((asteroid) => {
        if (!asteroid.destroyed) {
          harness.enemySystem.destroyAsteroid(asteroid, { createFragments: false });
        }
      });

      harness.enemySystem.update(0);

      if (harness.enemySystem.waveState?.isActive) {
        harness.enemySystem.completeCurrentWave?.();
      }

      const finalState = { ...harness.enemySystem.waveState };

      expect(finalState.isActive).toBe(false);
      expect(finalState.asteroidsKilled).toBeGreaterThanOrEqual(finalState.totalAsteroids);
    });
  });
});
