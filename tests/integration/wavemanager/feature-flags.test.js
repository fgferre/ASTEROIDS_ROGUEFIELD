import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as CONSTANTS from '../../../src/core/GameConstants.js';
import { GamePools } from '../../../src/core/GamePools.js';
import {
  setupGlobalMocks,
  cleanupGlobalState,
} from '../../__helpers__/setup.js';
import {
  createEnemySystemHarness,
  prepareWave,
} from '../../__helpers__/asteroid-helpers.js';

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
    test('EnemySystem gracefully handles missing WaveManager', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const legacySpies = [vi.spyOn(harness.enemySystem, 'updateWaveLogic')];
      if (harness.enemySystem.updateSystem) {
        legacySpies.push(
          vi.spyOn(harness.enemySystem.updateSystem, 'updateWaveLogic')
        );
      }

      harness.enemySystem.waveManager = null;
      prepareWave(harness.enemySystem, 1);

      try {
        expect(() => harness.enemySystem.update(0.5)).not.toThrow();
        const legacyCalled = legacySpies.some((spy) => spy.mock.calls.length);
        expect(legacyCalled).toBe(true);

        const warningEmitted = warnSpy.mock.calls.some(([message]) =>
          String(message).includes('WaveManager indisponível')
        );
        expect(warningEmitted).toBe(true);
      } finally {
        legacySpies.forEach((spy) => spy.mockRestore());
        warnSpy.mockRestore();
      }
    });

    test('WaveManager completion event schedules break timer and suppresses legacy emit', async () => {
      const eventBus = harness?.container?.resolve('event-bus');
      expect(eventBus).toBeTruthy();

      const emitSpy = vi.spyOn(eventBus, 'emit');
      const legacyListener = vi.fn();
      eventBus.on('wave-completed', legacyListener);

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
        enemySystem.waveState = enemySystem.createInitialWaveState();
        enemySystem.waveState.current = 0;
        enemySystem.waveState.isActive = false;
        enemySystem.waveState.breakTimer = 0;
        enemySystem.waveState.totalAsteroids = 0;
        enemySystem.waveState.asteroidsSpawned = 0;
        enemySystem.waveState.asteroidsKilled = 0;
        enemySystem.waveState.completedWaves = 0;
        enemySystem.waveState.initialSpawnDone = false;
        enemySystem.spawnTimer = 0;

        enemySystem.update(0);

        expect(enemySystem.waveManager).toBeTruthy();

        if (!enemySystem.waveManager.waveInProgress) {
          const started = enemySystem.waveManager.startNextWave();
          expect(started).toBe(true);
        }

        enemySystem.update(0);

        const currentWave = enemySystem.waveManager.currentWave;
        expect(currentWave).toBeGreaterThan(0);

        enemySystem.waveState.current = currentWave;
        enemySystem.waveState.isActive = true;
        enemySystem.waveState.breakTimer = 0;
        enemySystem.waveState.totalAsteroids = 0;
        enemySystem.waveState.asteroidsSpawned = 0;
        enemySystem.waveState.asteroidsKilled = 0;

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
        enemySystem.waveState.totalAsteroids = spawnTarget;
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

        const waveCompletedEmits = emitSpy.mock.calls.filter(
          ([eventName]) => eventName === 'wave-completed'
        );
        expect(waveCompletedEmits.length).toBe(0);
        expect(legacyListener).not.toHaveBeenCalled();
      } finally {
        eventBus.off('wave-completed', legacyListener);
        emitSpy.mockRestore();
      }
    });

    test("WaveManager kills sync into waveState; spawned and total stay EnemySystem's", () => {
      const stubState = {
        currentWave: 7,
        inProgress: true,
        spawned: 5,
        killed: 3,
        total: 11,
      };

      prepareWave(harness.enemySystem, 2);

      harness.enemySystem.waveManager = {
        update: vi.fn(),
        getState: vi.fn(() => ({ ...stubState })),
      };

      const initialWaveState = { ...harness.enemySystem.waveState };

      try {
        harness.enemySystem.update(0.25);

        expect(harness.enemySystem.waveManager.update).toHaveBeenCalledWith(
          0.25
        );

        const syncedState = harness.enemySystem.waveState;
        expect(syncedState.current).not.toBe(initialWaveState.current);
        expect(syncedState.current).toBe(stubState.currentWave);
        expect(syncedState.isActive).toBe(stubState.inProgress);
        expect(syncedState.asteroidsSpawned).not.toBe(stubState.spawned);
        expect(syncedState.totalAsteroids).not.toBe(stubState.total);
        expect(syncedState.asteroidsKilled).toBe(stubState.killed);
      } finally {
        harness.enemySystem.waveManager = null;
      }
    });
  });
});
