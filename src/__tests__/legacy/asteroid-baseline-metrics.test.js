import { describe, test, expect, beforeEach } from 'vitest';
import { EnemySystem } from '../../modules/EnemySystem.js';
import { ServiceRegistry } from '../../core/ServiceRegistry.js';
import * as CONSTANTS from '../../core/GameConstants.js';

const TEST_SEED = 123456;
const SAMPLE_ASTEROID_COUNT = 1000;
const VARIANT_SAMPLE_COUNT = 500;
const WAVE_VARIANT_SAMPLE_COUNT = 200;

if (CONSTANTS.ASTEROID_VARIANTS?.parasite?.availability) {
  CONSTANTS.ASTEROID_VARIANTS.parasite.availability = {
    ...CONSTANTS.ASTEROID_VARIANTS.parasite.availability,
    minWave: 1
  };
}

function createEnemySystemHarness(seed = TEST_SEED) {
  const worldBounds = {
    width: CONSTANTS.GAME_WIDTH,
    height: CONSTANTS.GAME_HEIGHT
  };

  const world = {
    getBounds: () => ({ ...worldBounds }),
    handlePlayerDeath: () => {
      world.playerAlive = false;
    },
    playerAlive: true
  };

  const player = {
    position: {
      x: worldBounds.width / 2,
      y: worldBounds.height / 2
    },
    velocity: { x: 0, y: 0 },
    getHullBoundingRadius: () => 24,
    takeDamage: () => {},
    isAlive: () => true
  };

  const xpOrbs = {
    createXPOrb: () => {}
  };

  const progression = {
    getDifficulty: () => 1,
    getCurrentWave: () => 1
  };

  const physics = {
    registerEnemy: () => {},
    unregisterEnemy: () => {},
    bootstrapFromEnemySystem: () => {},
    attachEnemySystem: () => {},
    detachEnemySystem: () => {}
  };

  const container = ServiceRegistry.createTestContainer({
    randomSeed: seed,
    world,
    player,
    progression,
    physics,
    'xp-orbs': xpOrbs
  });

  const random = container.resolve('random');

  const enemySystem = new EnemySystem({
    world,
    player,
    progression,
    physics,
    'xp-orbs': xpOrbs,
    random
  });

  enemySystem.sessionActive = true;
  enemySystem.waveState = enemySystem.createInitialWaveState();
  enemySystem.waveState.current = 0;
  enemySystem.waveState.isActive = false;
  enemySystem.waveState.totalAsteroids = 0;
  enemySystem.waveState.asteroidsSpawned = 0;
  enemySystem.waveState.asteroidsKilled = 0;
  enemySystem.waveState.initialSpawnDone = false;
  enemySystem.asteroids = [];

  Object.assign(enemySystem.services, {
    world,
    player,
    progression,
    xpOrbs,
    physics,
    random
  });

  enemySystem.refreshInjectedServices({ force: true, suppressWarnings: true });
  enemySystem.reseedRandomScopes({ resetSequences: true });

  return { enemySystem, container, services: { world, player, progression, physics, xpOrbs, random } };
}

function prepareWave(enemySystem, waveNumber) {
  enemySystem.waveState = enemySystem.createInitialWaveState();
  const total = Math.floor(
    CONSTANTS.ASTEROIDS_PER_WAVE_BASE *
      Math.pow(CONSTANTS.ASTEROIDS_PER_WAVE_MULTIPLIER, waveNumber - 1)
  );
  enemySystem.waveState.current = waveNumber;
  enemySystem.waveState.isActive = true;
  enemySystem.waveState.totalAsteroids = Math.min(total, 25);
  enemySystem.waveState.asteroidsSpawned = 0;
  enemySystem.waveState.asteroidsKilled = 0;
  enemySystem.waveState.initialSpawnDone = true;
  enemySystem.waveState.spawnTimer = 0;
  enemySystem.waveState.spawnDelay = 1.0;
  enemySystem.waveState.timeRemaining = CONSTANTS.WAVE_DURATION;
  enemySystem.asteroids = [];
  enemySystem.sessionActive = true;
  enemySystem.reseedRandomScopes({ resetSequences: true });
}

function simulateWave(enemySystem, waveNumber, maxIterations = 600) {
  prepareWave(enemySystem, waveNumber);
  const waveState = enemySystem.waveState;
  const spawnLog = [...enemySystem.getAllEnemies()];
  let iterations = 0;

  while (
    waveState.asteroidsSpawned < waveState.totalAsteroids &&
    iterations < maxIterations
  ) {
    const asteroid = enemySystem.spawnAsteroid();
    if (!asteroid) {
      break;
    }

    spawnLog.push(asteroid);
    while (enemySystem.getActiveEnemyCount() > CONSTANTS.MAX_ASTEROIDS_ON_SCREEN) {
      const oldest = enemySystem.getActiveEnemies()[0];
      if (!oldest) {
        break;
      }
      enemySystem.destroyAsteroid(oldest, { createFragments: false });
    }
    expect(enemySystem.getActiveEnemyCount()).toBeLessThanOrEqual(
      CONSTANTS.MAX_ASTEROIDS_ON_SCREEN
    );
    iterations += 1;
  }

  const active = enemySystem.getAllEnemies();
  active.forEach((asteroid) => {
    enemySystem.destroyAsteroid(asteroid, { createFragments: false });
  });

  enemySystem.update(0);
  if (enemySystem.waveState?.isActive) {
    enemySystem.completeCurrentWave();
  }

  return {
    waveState: { ...waveState },
    spawnLog
  };
}

function collectSpawnMetrics(spawnLog) {
  const sizeCounts = { large: 0, medium: 0, small: 0 };
  const variantCounts = {};

  spawnLog.forEach((asteroid) => {
    if (!asteroid) {
      return;
    }

    if (sizeCounts[asteroid.size] !== undefined) {
      sizeCounts[asteroid.size] += 1;
    }

    const variant = asteroid.variant || 'common';
    variantCounts[variant] = (variantCounts[variant] || 0) + 1;
  });

  const total = spawnLog.length;
  return { total, sizeCounts, variantCounts };
}

function sampleVariants(enemySystem, size, wave, count) {
  const results = {};
  enemySystem.waveState.current = wave;
  enemySystem.reseedRandomScopes({ resetSequences: true });

  for (let i = 0; i < count; i += 1) {
    const variant = enemySystem.decideVariant(size, {
      wave,
      spawnType: 'spawn'
    });
    results[variant] = (results[variant] || 0) + 1;
  }

  return results;
}

function summarizeAsteroid(asteroid) {
  return {
    size: asteroid.size,
    variant: asteroid.variant,
    x: Number(asteroid.x.toFixed(2)),
    y: Number(asteroid.y.toFixed(2)),
    vx: Number(asteroid.vx.toFixed(4)),
    vy: Number(asteroid.vy.toFixed(4)),
    radius: asteroid.radius,
    wave: asteroid.wave
  };
}

describe('Legacy Asteroid Baseline Metrics', () => {
  let harness;

  beforeEach(() => {
    harness = createEnemySystemHarness(TEST_SEED);
  });

  describe('Wave Spawn Rate (Waves 1-10)', () => {
    const waves = Array.from({ length: 10 }, (_, index) => index + 1);

    waves.forEach((waveNumber) => {
      test(`wave ${waveNumber} matches baseline formula`, () => {
        const { waveState } = simulateWave(harness.enemySystem, waveNumber, 800);
        const formulaTotal =
          CONSTANTS.ASTEROIDS_PER_WAVE_BASE *
          Math.pow(CONSTANTS.ASTEROIDS_PER_WAVE_MULTIPLIER, waveNumber - 1);
        const expectedTotal = Math.min(Math.floor(formulaTotal), 25);

        expect(waveState.totalAsteroids).toBe(expectedTotal);
        expect(waveState.asteroidsSpawned).toBeLessThanOrEqual(expectedTotal);
        expect(waveState.asteroidsKilled).toBeGreaterThanOrEqual(
          waveState.asteroidsSpawned
        );
        expect(waveState.isActive).toBe(false);
      });
    });

    test('golden snapshot for waves 1, 5, and 10', () => {
      const snapshot = [1, 5, 10].map((waveNumber) => {
        const { waveState } = simulateWave(harness.enemySystem, waveNumber, 800);
        return {
          wave: waveNumber,
          totalAsteroids: waveState.totalAsteroids,
          asteroidsSpawned: waveState.asteroidsSpawned,
          asteroidsKilled: waveState.asteroidsKilled
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
    "asteroidsKilled": 11,
    "asteroidsSpawned": 11,
    "totalAsteroids": 11,
    "wave": 5,
  },
  {
    "asteroidsKilled": 25,
    "asteroidsSpawned": 25,
    "totalAsteroids": 25,
    "wave": 10,
  },
]`);
    });
  });

  describe('Size Distribution', () => {
    test('spawned asteroids follow 50/30/20 distribution', () => {
      prepareWave(harness.enemySystem, 1);
      harness.enemySystem.waveState.totalAsteroids = SAMPLE_ASTEROID_COUNT;
      const spawnLog = [];

      for (let i = 0; i < SAMPLE_ASTEROID_COUNT; i += 1) {
        const asteroid = harness.enemySystem.spawnAsteroid();
        if (asteroid) {
          spawnLog.push(asteroid);
        }
      }

      const { sizeCounts, total } = collectSpawnMetrics(spawnLog);

      expect(total).toBe(SAMPLE_ASTEROID_COUNT);
      expect(sizeCounts.large / total).toBeCloseTo(0.5, 1);
      expect(sizeCounts.medium / total).toBeCloseTo(0.3, 1);
      expect(sizeCounts.small / total).toBeCloseTo(0.2, 1);
    });
  });

  describe('Variant Distribution by Size', () => {
    const sizes = ['large', 'medium', 'small'];

    sizes.forEach((size) => {
      test(`${size} variant mix matches ASTEROID_VARIANT_CHANCES`, () => {
        const results = sampleVariants(
          harness.enemySystem,
          size,
          1,
          VARIANT_SAMPLE_COUNT
        );

        const totalVariants = Object.values(results).reduce(
          (sum, value) => sum + value,
          0
        );

        const chanceConfig = CONSTANTS.ASTEROID_VARIANT_CHANCES[size];
        const baseChance = chanceConfig.baseChance;
        const expectedSpecial = baseChance;
        const actualSpecial = 1 - (results.common || 0) / totalVariants;

        expect(actualSpecial).toBeCloseTo(expectedSpecial, 1);

        Object.entries(chanceConfig.distribution).forEach(([variant, weight]) => {
          if (weight === 0) {
            expect(results[variant] || 0).toBe(0);
            return;
          }

          const expected = weight * baseChance;
          const actual = (results[variant] || 0) / totalVariants;
          expect(actual).toBeCloseTo(expected, 1);
        });
      });
    });

    test('gold variant never spawns for large asteroids', () => {
      const results = sampleVariants(
        harness.enemySystem,
        'large',
        1,
        VARIANT_SAMPLE_COUNT
      );

      expect(results.gold || 0).toBe(0);
    });

    test('denseCore variant absent for small asteroids', () => {
      const results = sampleVariants(
        harness.enemySystem,
        'small',
        1,
        VARIANT_SAMPLE_COUNT
      );

      expect(results.denseCore || 0).toBe(0);
    });
  });

  describe('Variant Wave Scaling', () => {
    const waveSamples = [1, 4, 7, 10];

    waveSamples.forEach((waveNumber) => {
      test(`medium asteroid special rate scales at wave ${waveNumber}`, () => {
        const results = sampleVariants(
          harness.enemySystem,
          'medium',
          waveNumber,
          WAVE_VARIANT_SAMPLE_COUNT
        );
        const total = Object.values(results).reduce((sum, value) => sum + value, 0);
        const actualSpecial = 1 - (results.common || 0) / total;

        const expected = Math.min(
          1,
          CONSTANTS.ASTEROID_VARIANT_CHANCES.medium.baseChance +
            harness.enemySystem.computeVariantWaveBonus(waveNumber)
        );

        expect(actualSpecial).toBeCloseTo(expected, 1);
      });
    });
  });

  describe('Fragmentation Rules', () => {
    const fragmentVariants = ['common', 'iron', 'denseCore', 'volatile', 'parasite', 'crystal'];
    const sizes = ['large', 'medium'];

    fragmentVariants.forEach((variant) => {
      sizes.forEach((size) => {
        test(`${variant} ${size} fragmentation count matches rules`, () => {
          const variantKey =
            variant === 'denseCore'
              ? 'denseCore'
              : variant === 'volatile'
              ? 'volatile'
              : variant === 'parasite'
              ? 'parasite'
              : variant === 'crystal'
              ? 'crystal'
              : 'default';

          const rules = CONSTANTS.ASTEROID_FRAGMENT_RULES[variantKey];
          if (!rules) {
            return;
          }

          const { enemySystem } = harness;
          enemySystem.waveState.current = 1;
          enemySystem.reseedRandomScopes({ resetSequences: true });

          const asteroid = enemySystem.acquireAsteroid({
            x: 0,
            y: 0,
            size,
            variant,
            wave: 1,
            vx: 45,
            vy: -30,
            randomScope: 'spawn'
          });

          const fragments = enemySystem.destroyAsteroid(asteroid, {
            createFragments: true,
            triggerExplosion: false
          });

          const countRange = rules.countBySize[size] || [0, 0];
          const min = Array.isArray(countRange) ? Math.floor(countRange[0]) : countRange;
          const max = Array.isArray(countRange) ? Math.floor(countRange[1]) : countRange;

          expect(fragments.length).toBeGreaterThanOrEqual(min);
          expect(fragments.length).toBeLessThanOrEqual(max);

          fragments.forEach((fragment) => {
            expect(fragment.size).not.toBe(size);

            const parentSpeed = Math.hypot(asteroid.vx, asteroid.vy);
            const inheritVelocity = rules.inheritVelocity;
            const parentContribution = {
              vx: asteroid.vx * inheritVelocity,
              vy: asteroid.vy * inheritVelocity
            };

            const residual = {
              vx: fragment.vx - parentContribution.vx,
              vy: fragment.vy - parentContribution.vy
            };

            const residualSpeed = Math.hypot(residual.vx, residual.vy);
            expect(Number.isFinite(residualSpeed)).toBe(true);
            expect(residualSpeed).toBeGreaterThan(0);
          });
        });
      });
    });
  });

  describe('Wave State Counters', () => {
    test('wave lifecycle updates counters correctly', () => {
      prepareWave(harness.enemySystem, 1);
      const startState = { ...harness.enemySystem.waveState };

      expect(startState.isActive).toBe(true);
      expect(startState.asteroidsSpawned).toBeGreaterThanOrEqual(0);
      expect(startState.asteroidsKilled).toBe(0);

      const spawned = harness.enemySystem.spawnAsteroid();
      const midState = { ...harness.enemySystem.waveState };

      expect(midState.asteroidsSpawned).toBeGreaterThan(startState.asteroidsSpawned);
      expect(midState.isActive).toBe(true);

      const fragments = harness.enemySystem.destroyAsteroid(spawned, {
        createFragments: true
      });

      const afterDestruction = { ...harness.enemySystem.waveState };

      expect(afterDestruction.asteroidsKilled).toBeGreaterThan(midState.asteroidsKilled);
      expect(afterDestruction.totalAsteroids).toBe(
        midState.totalAsteroids + fragments.length
      );
      expect(afterDestruction.asteroidsSpawned).toBe(
        midState.asteroidsSpawned + fragments.length
      );

      fragments.forEach((fragmentAsteroid) => {
        harness.enemySystem.destroyAsteroid(fragmentAsteroid, {
          createFragments: false
        });
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

      harness.enemySystem.getAllEnemies().forEach((asteroid) => {
        if (!asteroid.destroyed) {
          harness.enemySystem.destroyAsteroid(asteroid, {
            createFragments: false
          });
        }
      });

      harness.enemySystem.update(0);
      if (harness.enemySystem.waveState?.isActive) {
        harness.enemySystem.completeCurrentWave();
      }

      const finalState = { ...harness.enemySystem.waveState };

      expect(finalState.isActive).toBe(false);
      expect(finalState.asteroidsKilled).toBeGreaterThanOrEqual(
        finalState.totalAsteroids
      );
    });
  });

  describe('Determinism Across Resets', () => {
    test('identical seeds produce identical asteroid sequences', () => {
      const harnessA = createEnemySystemHarness(TEST_SEED);
      const harnessB = createEnemySystemHarness(TEST_SEED);

      harnessA.enemySystem.waveState = harnessA.enemySystem.createInitialWaveState();
      harnessA.enemySystem.waveState.current = 1;
      harnessA.enemySystem.waveState.isActive = true;
      harnessA.enemySystem.waveState.totalAsteroids = 10;
      harnessA.enemySystem.waveState.asteroidsSpawned = 0;
      harnessA.enemySystem.reseedRandomScopes({ resetSequences: true });

      harnessB.enemySystem.waveState = harnessB.enemySystem.createInitialWaveState();
      harnessB.enemySystem.waveState.current = 1;
      harnessB.enemySystem.waveState.isActive = true;
      harnessB.enemySystem.waveState.totalAsteroids = 10;
      harnessB.enemySystem.waveState.asteroidsSpawned = 0;
      harnessB.enemySystem.reseedRandomScopes({ resetSequences: true });

      const sequenceA = [];
      const sequenceB = [];

      for (let i = 0; i < 10; i += 1) {
        const asteroidA = harnessA.enemySystem.spawnAsteroid();
        const asteroidB = harnessB.enemySystem.spawnAsteroid();
        sequenceA.push(summarizeAsteroid(asteroidA));
        sequenceB.push(summarizeAsteroid(asteroidB));
      }

      expect(sequenceA).toEqual(sequenceB);
    });
  });
});
