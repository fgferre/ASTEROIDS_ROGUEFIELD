import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as CONSTANTS from '../../../src/core/GameConstants.js';
import { GamePools } from '../../../src/core/GamePools.js';
import {
  setupGlobalMocks,
  cleanupGlobalState,
} from '../../__helpers__/setup.js';
import { createEnemySystemHarness } from '../../__helpers__/asteroid-helpers.js';

describe('WaveManager Integration', () => {
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

  // Note: vi.restoreAllMocks() handled by global setup (tests/__helpers__/setup.js)

  describe('EnemySystem wave flow', () => {
    test('WaveManager completion closes the rocks and schedules the break timer', async () => {
      const eventBus = harness?.container?.resolve('event-bus');
      expect(eventBus).toBeTruthy();

      const emitSpy = vi.spyOn(eventBus, 'emit');

      const waitForWaveComplete = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          eventBus.off('wave-complete', handler);
          reject(new Error('wave-complete event was not emitted'));
        }, 2000);

        function handler(payload) {
          clearTimeout(timeout);
          eventBus.off('wave-complete', handler);
          resolve(payload);
        }

        eventBus.on('wave-complete', handler);
      });

      const { enemySystem } = harness;

      try {
        enemySystem.sessionActive = true;

        enemySystem.update(0);

        expect(enemySystem.waveManager).toBeTruthy();

        if (!enemySystem.waveManager.waveInProgress) {
          const started = enemySystem.waveManager.startNextWave();
          expect(started).toBe(true);
        }

        enemySystem.update(0);

        const currentWave = enemySystem.waveManager.currentWave;
        expect(currentWave).toBeGreaterThan(0);

        Object.assign(enemySystem.waveManager, {
          rocksTotal: 0,
          rocksSpawned: 0,
        });
        expect(enemySystem.waveState).toMatchObject({
          current: currentWave,
          isActive: true,
          breakTimer: 0,
          asteroidsKilled: 0,
        });

        const spawnedAsteroids = [];
        const spawnTarget = 4;

        for (let index = 0; index < spawnTarget; index += 1) {
          const asteroid = enemySystem.spawnAsteroid();
          if (asteroid) {
            spawnedAsteroids.push(asteroid);
          }
        }

        expect(spawnedAsteroids.length).toBeGreaterThan(0);
        expect(spawnedAsteroids.length).toBe(spawnTarget);

        expect(enemySystem.waveManager.totalEnemiesThisWave).toBe(
          spawnedAsteroids.length
        );
        expect(enemySystem.waveManager.enemiesSpawnedThisWave).toBe(
          spawnedAsteroids.length
        );
        enemySystem.waveManager.rocksTotal = spawnTarget;
        // Layer 1's Rockfall surge is still scheduled (src/data/layers.js);
        // this test covers the completion path, not the schedule.
        enemySystem.waveManager.layerSchedule = [];

        expect(enemySystem.waveManager.enemiesKilledThisWave).toBe(0);

        spawnedAsteroids.forEach((asteroid) => {
          enemySystem.destroyAsteroid(asteroid, { createFragments: false });
        });

        expect(enemySystem.waveManager.enemiesKilledThisWave).toBe(
          spawnedAsteroids.length
        );
        expect(enemySystem.getActiveEnemyCount()).toBe(0);

        const completionPayload = await waitForWaveComplete;

        enemySystem.update(0);

        expect(completionPayload?.wave).toBe(currentWave);
        expect(enemySystem.waveState.isActive).toBe(false);
        expect(enemySystem.waveState.breakTimer).toBe(
          CONSTANTS.WAVE_BREAK_TIME
        );
        expect(enemySystem.waveState.completedWaves).toBe(1);

        const waveCompleteEmits = emitSpy.mock.calls.filter(
          ([eventName]) => eventName === 'wave-complete'
        );
        expect(waveCompleteEmits.length).toBeGreaterThan(0);
      } finally {
        emitSpy.mockRestore();
      }
    });
  });
});
