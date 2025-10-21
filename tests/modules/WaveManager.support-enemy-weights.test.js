import { describe, expect, it } from 'vitest';
import { WaveManager } from '../../src/modules/enemies/managers/WaveManager.js';
import * as CONSTANTS from '../../src/core/GameConstants.js';

class StubRandom {
  fork() {
    return this;
  }

  float() {
    return 0.5;
  }
}

function createWaveManager() {
  const random = new StubRandom();
  const enemySystem = {
    getRandomScope: () => random,
  };
  return new WaveManager({ enemySystem, random, eventBus: null });
}

function withWaveManagerControl(callback) {
  const previousUseOverride = globalThis.__USE_WAVE_MANAGER_OVERRIDE__;
  const previousHandlesOverride =
    globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__;

  globalThis.__USE_WAVE_MANAGER_OVERRIDE__ = true;
  globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__ = true;

  try {
    return callback();
  } finally {
    if (previousUseOverride === undefined) {
      delete globalThis.__USE_WAVE_MANAGER_OVERRIDE__;
    } else {
      globalThis.__USE_WAVE_MANAGER_OVERRIDE__ = previousUseOverride;
    }

    if (previousHandlesOverride === undefined) {
      delete globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__;
    } else {
      globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__ =
        previousHandlesOverride;
    }
  }
}

describe('WaveManager support enemy weights', () => {
  it('does not return support weights before configured start waves', () => {
    const result = withWaveManagerControl(() => {
      const manager = createWaveManager();
      const earliestStart = Math.min(
        CONSTANTS.SUPPORT_ENEMY_PROGRESSION.drone.startWave,
        CONSTANTS.SUPPORT_ENEMY_PROGRESSION.mine.startWave,
        CONSTANTS.SUPPORT_ENEMY_PROGRESSION.hunter.startWave,
      );

      return manager.computeSupportWeights(earliestStart - 1);
    });

    expect(result).toEqual([]);
  });

  it('applies weight scaling configured in constants for each support enemy', () => {
    withWaveManagerControl(() => {
      const manager = createWaveManager();

      const droneStart = CONSTANTS.SUPPORT_ENEMY_PROGRESSION.drone.startWave;
      const mineStart = CONSTANTS.SUPPORT_ENEMY_PROGRESSION.mine.startWave;
      const hunterStart = CONSTANTS.SUPPORT_ENEMY_PROGRESSION.hunter.startWave;

      const waveDroneOnly = manager.computeSupportWeights(droneStart);
      expect(waveDroneOnly).toEqual([{ key: 'drone', weight: 1 }]);

      const waveWithMines = manager.computeSupportWeights(mineStart);
      const droneAtMineWave = waveWithMines.find((entry) => entry.key === 'drone');
      const mineAtMineWave = waveWithMines.find((entry) => entry.key === 'mine');

      expect(droneAtMineWave?.weight).toBeCloseTo(
        1 + (mineStart - droneStart) * CONSTANTS.SUPPORT_ENEMY_PROGRESSION.drone.weightScaling,
        5,
      );
      expect(mineAtMineWave?.weight).toBeCloseTo(1, 5);

      const waveAllSupports = manager.computeSupportWeights(hunterStart + 2);
      const droneWeight = waveAllSupports.find((entry) => entry.key === 'drone')?.weight ?? 0;
      const mineWeight = waveAllSupports.find((entry) => entry.key === 'mine')?.weight ?? 0;
      const hunterWeight = waveAllSupports.find((entry) => entry.key === 'hunter')?.weight ?? 0;

      expect(droneWeight).toBeCloseTo(
        1 + (hunterStart + 2 - droneStart) * CONSTANTS.SUPPORT_ENEMY_PROGRESSION.drone.weightScaling,
        5,
      );
      expect(mineWeight).toBeCloseTo(
        1 + (hunterStart + 2 - mineStart) * CONSTANTS.SUPPORT_ENEMY_PROGRESSION.mine.weightScaling,
        5,
      );
      expect(hunterWeight).toBeCloseTo(
        1 + 2 * CONSTANTS.SUPPORT_ENEMY_PROGRESSION.hunter.weightScaling,
        5,
      );
    });
  });

  it('returns no support weights when the wave manager does not control asteroid spawns', () => {
    const previousUseOverride = globalThis.__USE_WAVE_MANAGER_OVERRIDE__;
    const previousHandlesOverride =
      globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__;

    globalThis.__USE_WAVE_MANAGER_OVERRIDE__ = true;
    globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__ = false;

    try {
      const manager = createWaveManager();
      expect(manager.computeSupportWeights(20)).toEqual([]);
    } finally {
      if (previousUseOverride === undefined) {
        delete globalThis.__USE_WAVE_MANAGER_OVERRIDE__;
      } else {
        globalThis.__USE_WAVE_MANAGER_OVERRIDE__ = previousUseOverride;
      }

      if (previousHandlesOverride === undefined) {
        delete globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__;
      } else {
        globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__ =
          previousHandlesOverride;
      }
    }
  });

  it('injects support groups into dynamically generated waves as progression unlocks them', () => {
    withWaveManagerControl(() => {
      const manager = createWaveManager();
      const progression = CONSTANTS.SUPPORT_ENEMY_PROGRESSION;

      const getSupportGroup = (waveConfig, key) => {
        const expectedType = manager.enemyTypeKeys?.[key] || key;
        return waveConfig.enemies.find((group) => group.type === expectedType);
      };

      const droneWave = manager.generateDynamicWave(progression.drone.startWave);
      const droneAtStart = getSupportGroup(droneWave, 'drone');
      const mineAtDroneWave = getSupportGroup(droneWave, 'mine');
      const hunterAtDroneWave = getSupportGroup(droneWave, 'hunter');

      expect(droneAtStart?.count).toBeGreaterThan(0);
      expect(mineAtDroneWave).toBeUndefined();
      expect(hunterAtDroneWave).toBeUndefined();

      const mineWave = manager.generateDynamicWave(progression.mine.startWave);
      const droneAtMineWave = getSupportGroup(mineWave, 'drone');
      const mineAtStart = getSupportGroup(mineWave, 'mine');

      expect(droneAtMineWave?.count).toBeGreaterThan(0);
      expect(mineAtStart?.count).toBeGreaterThan(0);

      const hunterWave = manager.generateDynamicWave(progression.hunter.startWave);
      const droneAtHunterWave = getSupportGroup(hunterWave, 'drone');
      const mineAtHunterWave = getSupportGroup(hunterWave, 'mine');
      const hunterAtStart = getSupportGroup(hunterWave, 'hunter');

      expect(droneAtHunterWave?.count).toBeGreaterThan(0);
      expect(mineAtHunterWave?.count).toBeGreaterThan(0);
      expect(hunterAtStart?.count).toBeGreaterThan(0);
    });
  });
});
