import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as CONSTANTS from '../../../src/core/GameConstants.js';
import { GamePools } from '../../../src/core/GamePools.js';
import {
  setupGlobalMocks,
  cleanupGlobalState,
  withWaveOverrides,
} from '../../__helpers__/setup.js';
import {
  createEnemySystemHarness,
  simulateWave,
  prepareWave,
} from '../../__helpers__/asteroid-helpers.js';

describe('Asteroid Metrics - Feature Flags', () => {
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

  test('legacy system remains functional when flag is forced off', async () => {
    expect(CONSTANTS.USE_WAVE_MANAGER).toBe(true);

    const legacySpies = [vi.spyOn(harness.enemySystem, 'updateWaveLogic')];
    const waveManagerSpies = [
      vi.spyOn(harness.enemySystem, 'updateWaveManagerLogic'),
    ];

    if (harness.enemySystem.updateSystem) {
      legacySpies.push(
        vi.spyOn(harness.enemySystem.updateSystem, 'updateWaveLogic')
      );
      waveManagerSpies.push(
        vi.spyOn(harness.enemySystem.updateSystem, 'updateWaveManagerLogic')
      );
    }

    try {
      await withWaveOverrides({ useManager: false }, () => {
        const { waveState } = simulateWave(harness.enemySystem, 1, 400);

        expect(waveState.totalAsteroids).toBe(4);
        expect(waveState.asteroidsSpawned).toBeGreaterThan(0);
        const legacyCalled = legacySpies.some((spy) => spy.mock.calls.length);
        const waveManagerCalled = waveManagerSpies.some(
          (spy) => spy.mock.calls.length
        );

        expect(legacyCalled).toBe(true);
        expect(waveManagerCalled).toBe(false);
      });
    } finally {
      legacySpies.forEach((spy) => spy.mockRestore());
      waveManagerSpies.forEach((spy) => spy.mockRestore());
    }
  });

  test('EnemySystem gracefully handles missing WaveManager', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      CONSTANTS,
      'USE_WAVE_MANAGER'
    );
    const originalWaveManager = harness.enemySystem.waveManager;

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
      await withWaveOverrides({ useManager: true }, () => {
        try {
          Object.defineProperty(CONSTANTS, 'USE_WAVE_MANAGER', {
            configurable: true,
            get: () => true,
          });
        } catch (error) {
          globalThis.__USE_WAVE_MANAGER_OVERRIDE__ = true;
        }

        expect(() => harness.enemySystem.update(0.5)).not.toThrow();
        const legacyCalled = legacySpies.some((spy) => spy.mock.calls.length);
        expect(legacyCalled).toBe(true);

        const warningEmitted = warnSpy.mock.calls.some(([message]) =>
          String(message).includes('WaveManager indisponível')
        );
        expect(warningEmitted).toBe(true);
      });
    } finally {
      if (originalDescriptor && originalDescriptor.configurable) {
        Object.defineProperty(
          CONSTANTS,
          'USE_WAVE_MANAGER',
          originalDescriptor
        );
      }

      harness.enemySystem.waveManager = originalWaveManager;
      warnSpy.mockRestore();
      legacySpies.forEach((spy) => spy.mockRestore());
    }
  });

  test('WaveManager completion event schedules break timer and suppresses legacy emit', async () => {
    expect(CONSTANTS.USE_WAVE_MANAGER).toBe(true);

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

    try {
      const { enemySystem } = harness;

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

      expect(spawnedAsteroids.length).toBe(spawnTarget);
      expect(enemySystem.waveManager.totalEnemiesThisWave).toBe(
        spawnedAsteroids.length
      );
      expect(enemySystem.waveManager.enemiesSpawnedThisWave).toBe(
        spawnedAsteroids.length
      );

      enemySystem.waveState.totalAsteroids = spawnTarget;
      expect(enemySystem.waveManager.enemiesKilledThisWave).toBe(0);

      spawnedAsteroids.forEach((asteroid) => {
        enemySystem.destroyAsteroid(asteroid, { createFragments: false });
      });

      expect(enemySystem.waveManager.enemiesKilledThisWave).toBe(
        spawnedAsteroids.length
      );

      const maxSettlingIterations = 50;
      let iterations = 0;
      while (
        enemySystem.waveState.isActive &&
        iterations < maxSettlingIterations
      ) {
        enemySystem.update(0.5);
        iterations += 1;
      }

      enemySystem.update(0);

      expect(emitSpy).toHaveBeenCalled();
      const completionPayload = await waitForWaveComplete;

      enemySystem.update(0);

      expect(completionPayload?.wave).toBe(
        enemySystem.waveState.completedWaves
      );

      const waveCompleteEmits = emitSpy.mock.calls.filter(
        ([eventName]) => eventName === 'wave-complete'
      );
      expect(waveCompleteEmits.length).toBeGreaterThan(0);
      const waveCompletedEmits = emitSpy.mock.calls.filter(
        ([eventName]) => eventName === 'wave-completed'
      );
      expect(waveCompletedEmits.length).toBe(0);

      expect(enemySystem.getActiveEnemyCount()).toBe(0);
      expect(enemySystem.waveState.isActive).toBe(false);
      expect(enemySystem.waveState.breakTimer).toBe(CONSTANTS.WAVE_BREAK_TIME);
      expect(enemySystem.waveState.completedWaves).toBe(1);
      expect(legacyListener).not.toHaveBeenCalled();
    } finally {
      eventBus.off('wave-completed', legacyListener);
      emitSpy.mockRestore();
    }
  });

  test('WaveManager counters sync into legacy waveState when enabled', async () => {
    const stubState = {
      currentWave: 7,
      inProgress: true,
      spawned: 5,
      killed: 3,
      total: 11,
    };

    prepareWave(harness.enemySystem, 2);

    const originalWaveManager = harness.enemySystem.waveManager;
    harness.enemySystem.waveManager = {
      update: vi.fn(),
      getState: vi.fn(() => ({ ...stubState })),
    };

    const initialWaveState = { ...harness.enemySystem.waveState };

    try {
      await withWaveOverrides({ useManager: true }, () => {
        harness.enemySystem.update(0.25);
      });

      expect(harness.enemySystem.waveManager.update).toHaveBeenCalledWith(0.25);

      const syncedState = harness.enemySystem.waveState;
      expect(syncedState.current).not.toBe(initialWaveState.current);
      expect(syncedState.current).toBe(stubState.currentWave);
      expect(syncedState.isActive).toBe(stubState.inProgress);

      const managerHandlesSpawn = Boolean(
        CONSTANTS.WAVEMANAGER_HANDLES_ASTEROID_SPAWN
      );

      if (managerHandlesSpawn) {
        expect(syncedState.asteroidsSpawned).toBe(stubState.spawned);
        expect(syncedState.totalAsteroids).toBe(stubState.total);
      } else {
        expect(syncedState.asteroidsSpawned).not.toBe(stubState.spawned);
        expect(syncedState.totalAsteroids).not.toBe(stubState.total);
      }

      expect(syncedState.asteroidsKilled).toBe(stubState.killed);
    } finally {
      harness.enemySystem.waveManager = originalWaveManager;
    }
  });
});
