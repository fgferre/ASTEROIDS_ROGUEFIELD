import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as CONSTANTS from '../../../src/core/GameConstants.js';
import { GamePools } from '../../../src/core/GamePools.js';
import { setupGlobalMocks, cleanupGlobalState } from '../../__helpers__/setup.js';
import { createEnemySystemHarness, simulateWave } from '../../__helpers__/asteroid-helpers.js';

describe('Asteroid Metrics - Wave Spawn Rate', () => {
  /** @type {{ enemySystem: any, container: any }} */
  let harness;

  beforeEach(() => {
    setupGlobalMocks();
    // Optimization: recreate harness per test to guarantee isolated enemy system state
    harness = createEnemySystemHarness();
  });

  afterEach(() => {
    harness?.container?.dispose?.();
    harness = undefined;
    if (GamePools.asteroids?.releaseAll) {
      GamePools.asteroids.releaseAll();
    }
    if (typeof GamePools.destroy === 'function') {
      GamePools.destroy();
    }
    cleanupGlobalState();
  });

  describe('Wave Spawn Rate (Waves 1-10)', () => {
    // Note: tests mutate global registries per wave; keep sequential execution
    Array.from({ length: 10 }, (_, index) => index + 1).forEach((waveNumber) => {
      test(`wave ${waveNumber} matches baseline formula`, () => {
        const { waveState } = simulateWave(harness.enemySystem, waveNumber, 800);
        const formulaTotal =
          CONSTANTS.ASTEROIDS_PER_WAVE_BASE +
          (waveNumber - 1) * CONSTANTS.ASTEROIDS_PER_WAVE_MULTIPLIER;
        const expectedTotal = Math.min(Math.floor(formulaTotal), 25);

        expect(waveState.totalAsteroids).toBe(expectedTotal);
        expect(waveState.asteroidsSpawned).toBeLessThanOrEqual(expectedTotal);
        expect(waveState.asteroidsKilled).toBeGreaterThanOrEqual(
          waveState.asteroidsSpawned,
        );
        expect(waveState.isActive).toBe(false);
      });
    });

    // Note: vi.restoreAllMocks() handled by global setup (tests/__helpers__/global-setup.js)
    test('golden snapshot for waves 1, 5, and 10', () => {
      const snapshot = [1, 5, 10].map((waveNumber) => {
        const { waveState } = simulateWave(harness.enemySystem, waveNumber, 800);
        return {
          wave: waveNumber,
          totalAsteroids: waveState.totalAsteroids,
          asteroidsSpawned: waveState.asteroidsSpawned,
          asteroidsKilled: waveState.asteroidsKilled,
        };
      });

      expect(snapshot).toMatchInlineSnapshot(`
[
  {
    "asteroidsKilled": 4,
    "asteroidsSpawned": 4,
    "totalAsteroids": 4,
    "wave": 1,
  },
  {
    "asteroidsKilled": 9,
    "asteroidsSpawned": 9,
    "totalAsteroids": 9,
    "wave": 5,
  },
  {
    "asteroidsKilled": 15,
    "asteroidsSpawned": 15,
    "totalAsteroids": 15,
    "wave": 10,
  },
]`);
    });
  });
});
