import { describe, expect, it } from 'vitest';
import { WaveManager } from '../../../src/modules/enemies/managers/WaveManager.js';
import * as CONSTANTS from '../../../src/core/GameConstants.js';
import { createDeterministicRandom } from '../../__helpers__/stubs.js';
import { withWaveOverrides } from '../../__helpers__/setup.js';

function createWaveManager() {
  const random = createDeterministicRandom({ floatValue: 0.5 });
  const enemySystem = {
    getRandomScope: () => random,
  };
  return new WaveManager({ enemySystem, random, eventBus: null });
}

describe('WaveManager support enemy weights', () => {
  it('does not return support weights before configured start waves', async () => {
    const result = await withWaveOverrides(
      { useManager: true, managerHandlesAsteroids: true },
      () => {
        const manager = createWaveManager();
        const earliestStart = Math.min(
          CONSTANTS.SUPPORT_ENEMY_PROGRESSION.drone.startWave,
          CONSTANTS.SUPPORT_ENEMY_PROGRESSION.mine.startWave,
          CONSTANTS.SUPPORT_ENEMY_PROGRESSION.hunter.startWave,
        );

        return manager.computeSupportWeights(earliestStart - 1);
      },
    );

    expect(result).toEqual([]);
  });

  it('applies weight scaling configured in constants for each support enemy', async () => {
    await withWaveOverrides(
      { useManager: true, managerHandlesAsteroids: true },
      () => {
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
      },
    );
  });

  it('still returns support weights when asteroid spawning is legacy-controlled', async () => {
    const expectedWeights = await withWaveOverrides(
      { useManager: true, managerHandlesAsteroids: true },
      () => {
        const manager = createWaveManager();
        return manager.computeSupportWeights(20);
      },
    );

    await withWaveOverrides(
      { useManager: true, managerHandlesAsteroids: false },
      () => {
        const manager = createWaveManager();
        expect(manager.computeSupportWeights(20)).toEqual(expectedWeights);
      },
    );
  });

  it('injects support groups into dynamically generated waves as progression unlocks them', async () => {
    await withWaveOverrides(
      { useManager: true, managerHandlesAsteroids: true },
      () => {
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
      },
    );
  });
});
