import { describe, expect, it, vi } from 'vitest';
import { WaveManager } from '../../src/modules/enemies/managers/WaveManager.js';
import * as CONSTANTS from '../../src/core/GameConstants.js';
import { createDeterministicRandom } from '../__helpers__/stubs.js';
import { withWaveOverrides } from '../__helpers__/setup.js';

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
          CONSTANTS.SUPPORT_ENEMY_PROGRESSION.hunter.startWave
        );

        return manager.computeSupportWeights(earliestStart - 1);
      }
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
        const hunterStart =
          CONSTANTS.SUPPORT_ENEMY_PROGRESSION.hunter.startWave;

        const waveDroneOnly = manager.computeSupportWeights(droneStart);
        expect(waveDroneOnly).toEqual([{ key: 'drone', weight: 1 }]);

        const waveWithMines = manager.computeSupportWeights(mineStart);
        const droneAtMineWave = waveWithMines.find(
          (entry) => entry.key === 'drone'
        );
        const mineAtMineWave = waveWithMines.find(
          (entry) => entry.key === 'mine'
        );

        expect(droneAtMineWave?.weight).toBeCloseTo(
          1 +
            (mineStart - droneStart) *
              CONSTANTS.SUPPORT_ENEMY_PROGRESSION.drone.weightScaling,
          5
        );
        expect(mineAtMineWave?.weight).toBeCloseTo(1, 5);

        const waveAllSupports = manager.computeSupportWeights(hunterStart + 2);
        const droneWeight =
          waveAllSupports.find((entry) => entry.key === 'drone')?.weight ?? 0;
        const mineWeight =
          waveAllSupports.find((entry) => entry.key === 'mine')?.weight ?? 0;
        const hunterWeight =
          waveAllSupports.find((entry) => entry.key === 'hunter')?.weight ?? 0;

        expect(droneWeight).toBeCloseTo(
          1 +
            (hunterStart + 2 - droneStart) *
              CONSTANTS.SUPPORT_ENEMY_PROGRESSION.drone.weightScaling,
          5
        );
        expect(mineWeight).toBeCloseTo(
          1 +
            (hunterStart + 2 - mineStart) *
              CONSTANTS.SUPPORT_ENEMY_PROGRESSION.mine.weightScaling,
          5
        );
        expect(hunterWeight).toBeCloseTo(
          1 + 2 * CONSTANTS.SUPPORT_ENEMY_PROGRESSION.hunter.weightScaling,
          5
        );
      }
    );
  });

  it('still returns support weights when asteroid spawning is legacy-controlled', async () => {
    const expectedWeights = await withWaveOverrides(
      { useManager: true, managerHandlesAsteroids: true },
      () => {
        const manager = createWaveManager();
        return manager.computeSupportWeights(20);
      }
    );

    await withWaveOverrides(
      { useManager: true, managerHandlesAsteroids: false },
      () => {
        const manager = createWaveManager();
        expect(manager.computeSupportWeights(20)).toEqual(expectedWeights);
      }
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
          return waveConfig.enemies.find(
            (group) => group.type === expectedType
          );
        };

        const droneWave = manager.generateDynamicWave(
          progression.drone.startWave
        );
        const droneAtStart = getSupportGroup(droneWave, 'drone');
        const mineAtDroneWave = getSupportGroup(droneWave, 'mine');
        const hunterAtDroneWave = getSupportGroup(droneWave, 'hunter');

        expect(droneAtStart?.count).toBeGreaterThan(0);
        expect(mineAtDroneWave).toBeUndefined();
        expect(hunterAtDroneWave).toBeUndefined();

        const mineWave = manager.generateDynamicWave(
          progression.mine.startWave
        );
        const droneAtMineWave = getSupportGroup(mineWave, 'drone');
        const mineAtStart = getSupportGroup(mineWave, 'mine');

        expect(droneAtMineWave?.count).toBeGreaterThan(0);
        expect(mineAtStart?.count).toBeGreaterThan(0);

        const hunterWave = manager.generateDynamicWave(
          progression.hunter.startWave
        );
        const droneAtHunterWave = getSupportGroup(hunterWave, 'drone');
        const mineAtHunterWave = getSupportGroup(hunterWave, 'mine');
        const hunterAtStart = getSupportGroup(hunterWave, 'hunter');

        expect(droneAtHunterWave?.count).toBeGreaterThan(0);
        expect(mineAtHunterWave?.count).toBeGreaterThan(0);
        expect(hunterAtStart?.count).toBeGreaterThan(0);
      }
    );
  });

  it('tracks boss-wave enemies and completes when the boss dies last in legacy asteroid fallback mode', async () => {
    await withWaveOverrides(
      { useManager: true, managerHandlesAsteroids: false },
      () => {
        const random = createDeterministicRandom({ floatValue: 0.5 });
        const eventBus = {
          on: vi.fn(),
          off: vi.fn(),
          emit: vi.fn(),
        };
        const activeEnemies = [];
        let supportSequence = 0;

        const enemySystem = {
          asteroids: activeEnemies,
          getRandomScope: () => random,
          getCachedWorld: () => ({
            getBounds: () => ({ width: 800, height: 600 }),
          }),
          getCachedPlayer: () => ({
            position: { x: 400, y: 300 },
            velocity: { vx: 0, vy: 0 },
          }),
          getPlayerPositionSnapshot: () => ({ x: 400, y: 300 }),
          spawnBoss: vi.fn((config) => {
            const boss = {
              id: 'boss-10',
              type: 'boss',
              alive: true,
              destroyed: false,
              wave: config.wave,
            };
            activeEnemies.push(boss);
            return boss;
          }),
          acquireEnemyViaFactory: vi.fn((type, config) => ({
            id: `${type}-${supportSequence++}`,
            type,
            alive: true,
            destroyed: false,
            wave: config.wave,
          })),
          registerActiveEnemy: vi.fn((enemy) => {
            if (!activeEnemies.includes(enemy)) {
              activeEnemies.push(enemy);
            }
            return enemy;
          }),
        };

        const manager = new WaveManager({ enemySystem, random, eventBus });
        manager.currentWave = 9;

        expect(manager.startNextWave()).toBe(true);
        expect(manager.currentWave).toBe(10);
        expect(manager.totalEnemiesThisWave).toBe(4);

        const boss = activeEnemies.find((enemy) => enemy.type === 'boss');
        const supports = activeEnemies.filter((enemy) => enemy.type === 'drone');

        expect(boss).toBeTruthy();
        expect(supports).toHaveLength(3);

        for (const support of supports) {
          support.alive = false;
          support.destroyed = true;
          manager.onEnemyDestroyed({ enemy: support });
        }

        expect(manager.waveInProgress).toBe(true);
        expect(manager.enemiesKilledThisWave).toBe(3);

        boss.alive = false;
        manager.onEnemyDestroyed({ enemy: boss });

        expect(manager.waveInProgress).toBe(false);
        expect(manager.enemiesKilledThisWave).toBe(4);
        expect(eventBus.emit).toHaveBeenCalledWith(
          'wave-complete',
          expect.objectContaining({ wave: 10, enemiesKilled: 4 })
        );
      }
    );
  });
});
