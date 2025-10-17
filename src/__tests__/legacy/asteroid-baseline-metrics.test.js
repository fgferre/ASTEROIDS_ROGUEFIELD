import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnemySystem } from '../../modules/EnemySystem.js';
import { ServiceRegistry } from '../../core/ServiceRegistry.js';
import { GamePools } from '../../core/GamePools.js';
import * as CONSTANTS from '../../core/GameConstants.js';

const TEST_SEED = 123456;
const SAMPLE_ASTEROID_COUNT = 1000;
const VARIANT_SAMPLE_COUNT = 5000;
const WAVE_VARIANT_SAMPLE_COUNT = 3000;
const FRAGMENT_SAMPLE_COUNT = 800;
const FRAGMENT_ANALYSIS_WAVE = 6;

function createEnemySystemHarness(seed = TEST_SEED) {
  if (GamePools.asteroids?.releaseAll) {
    GamePools.asteroids.releaseAll();
  }
  if (typeof GamePools.destroy === 'function') {
    GamePools.destroy();
  }

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

  const healthHearts = {
    awardHeart: () => {},
    removeHeart: () => {},
    isEnabled: () => false
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
    'xp-orbs': xpOrbs,
    healthHearts
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
    healthHearts,
    physics,
    random
  });

  enemySystem.refreshInjectedServices({ force: true, suppressWarnings: true });
  enemySystem.reseedRandomScopes({ resetSequences: true });

  return { enemySystem, container, services: { world, player, progression, physics, xpOrbs, random } };
}

function prepareWave(enemySystem, waveNumber, options = {}) {
  const { spawnInitial = false } = options;

  enemySystem.waveState = enemySystem.createInitialWaveState();
  const total = Math.floor(
    CONSTANTS.ASTEROIDS_PER_WAVE_BASE *
      Math.pow(CONSTANTS.ASTEROIDS_PER_WAVE_MULTIPLIER, waveNumber - 1)
  );

  const waveState = enemySystem.waveState;
  waveState.current = waveNumber;
  waveState.isActive = true;
  waveState.totalAsteroids = Math.min(total, 25);
  waveState.asteroidsSpawned = 0;
  waveState.asteroidsKilled = 0;
  waveState.initialSpawnDone = false;
  waveState.spawnTimer = 0;
  waveState.spawnDelay = Math.max(0.8, 2.0 - waveNumber * 0.1);
  waveState.timeRemaining = CONSTANTS.WAVE_DURATION;

  enemySystem.asteroids = [];
  enemySystem.spawnTimer = 0;
  enemySystem.sessionActive = true;
  if (typeof enemySystem.invalidateActiveEnemyCache === 'function') {
    enemySystem.invalidateActiveEnemyCache();
  }

  enemySystem.reseedRandomScopes({ resetSequences: true });

  if (spawnInitial) {
    enemySystem.spawnInitialAsteroids(4);
  }
}

function simulateWave(enemySystem, waveNumber, maxIterations = 1500) {
  prepareWave(enemySystem, waveNumber, { spawnInitial: true });

  let iterations = 0;
  const deltaTime = 0.5;

  while (enemySystem.waveState.isActive && iterations < maxIterations) {
    enemySystem.update(deltaTime);

    expect(enemySystem.getActiveEnemyCount()).toBeLessThanOrEqual(
      CONSTANTS.MAX_ASTEROIDS_ON_SCREEN
    );

    const activeEnemies = enemySystem.getActiveEnemies();
    if (activeEnemies.length > 0) {
      enemySystem.destroyAsteroid(activeEnemies[0], { createFragments: false });
    }

    iterations += 1;
  }

  expect(iterations).toBeLessThan(maxIterations);

  const finalState = { ...enemySystem.waveState };

  enemySystem.getAllEnemies().forEach((asteroid) => {
    enemySystem.destroyAsteroid(asteroid, { createFragments: false });
  });

  enemySystem.update(0);

  return {
    waveState: finalState
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

function computeExpectedVariantBreakdown(enemySystem, size, wave) {
  const chanceConfig = CONSTANTS.ASTEROID_VARIANT_CHANCES[size];
  if (!chanceConfig) {
    return {
      specialChance: 0,
      probabilities: { common: 1 },
      excluded: []
    };
  }

  const variantConfig = CONSTANTS.ASTEROID_VARIANTS || {};
  let specialChance = chanceConfig.baseChance ?? 0;
  if (typeof enemySystem.computeVariantWaveBonus === 'function') {
    specialChance += enemySystem.computeVariantWaveBonus(wave);
  }
  specialChance = Math.min(Math.max(specialChance, 0), 1);

  const allowedEntries = [];
  const excluded = [];
  Object.entries(chanceConfig.distribution || {}).forEach(([variant, weight]) => {
    const config = variantConfig[variant];
    const allowedSizes = config?.allowedSizes;
    const minWave = config?.availability?.minWave;
    const sizeAllowed =
      !Array.isArray(allowedSizes) || allowedSizes.includes(size);
    const waveAllowed = typeof minWave !== 'number' || wave >= minWave;
    const usable = weight > 0 && sizeAllowed && waveAllowed;
    if (usable) {
      allowedEntries.push([variant, weight]);
    } else {
      excluded.push(variant);
    }
  });

  const totalWeight = allowedEntries.reduce(
    (sum, [, weight]) => sum + weight,
    0
  );

  if (!allowedEntries.length || totalWeight <= 0) {
    return {
      specialChance: 0,
      probabilities: { common: 1 },
      excluded
    };
  }

  const probabilities = { common: 1 - specialChance };
  allowedEntries.forEach(([variant, weight]) => {
    probabilities[variant] = (weight / totalWeight) * specialChance;
  });

  excluded
    .filter((variant) => !probabilities[variant])
    .forEach((variant) => {
      probabilities[variant] = 0;
    });

  return { specialChance, probabilities, excluded };
}

function expectWithinTolerance(actual, expected) {
  const tolerance = Math.max(0.0025, Math.min(0.03, expected * 0.3));
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

function computeAverageFragmentsForSize(enemySystem, size, wave, count) {
  enemySystem.waveState = enemySystem.createInitialWaveState();
  enemySystem.waveState.current = wave;
  enemySystem.waveState.isActive = true;
  enemySystem.reseedRandomScopes({ resetSequences: true });

  let totalFragments = 0;

  for (let i = 0; i < count; i += 1) {
    const variant = enemySystem.decideVariant(size, {
      wave,
      spawnType: 'spawn'
    });

    const asteroid = enemySystem.acquireAsteroid({
      x: 0,
      y: 0,
      size,
      variant,
      wave,
      vx: 60,
      vy: -40,
      randomScope: 'spawn'
    });

    const fragments = enemySystem.destroyAsteroid(asteroid, {
      createFragments: true,
      triggerExplosion: false
    });

    totalFragments += fragments.length;

    fragments.forEach((fragment) => {
      enemySystem.destroyAsteroid(fragment, { createFragments: false });
    });
  }

  return totalFragments / count;
}

function getFragmentRuleForVariant(variant) {
  const variantConfig = CONSTANTS.ASTEROID_VARIANTS[variant] || {};
  const profileKey =
    variantConfig.fragmentProfile || variantConfig.key || variant || 'default';
  return (
    CONSTANTS.ASTEROID_FRAGMENT_RULES[profileKey] ||
    CONSTANTS.ASTEROID_FRAGMENT_RULES.default
  );
}

function getFragmentRangeStats(rule, size) {
  const range =
    rule?.countBySize?.[size] ?? rule?.countBySize?.default ?? [0, 0];

  if (Array.isArray(range) && range.length === 2) {
    const min = Math.max(0, Math.floor(Number(range[0]) || 0));
    const max = Math.max(min, Math.floor(Number(range[1]) || 0));
    return {
      min,
      max,
      mean: (min + max) / 2
    };
  }

  const value = Math.max(0, Math.round(Number(range) || 0));
  return { min: value, max: value, mean: value };
}

function computeFragmentExpectationBounds(enemySystem, size, wave) {
  const expected = computeExpectedVariantBreakdown(enemySystem, size, wave);

  return Object.entries(expected.probabilities).reduce(
    (acc, [variant, probability]) => {
      if (probability <= 0) {
        return acc;
      }

      const rule = getFragmentRuleForVariant(variant);
      const { min, max, mean } = getFragmentRangeStats(rule, size);

      acc.min += probability * min;
      acc.max += probability * max;
      acc.mean += probability * mean;
      return acc;
    },
    { min: 0, max: 0, mean: 0 }
  );
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

describe.sequential('Legacy Asteroid Baseline Metrics', () => {
  let harness;

  beforeEach(() => {
    harness = createEnemySystemHarness(TEST_SEED);
  });

  afterEach(() => {
    if (GamePools.asteroids?.releaseAll) {
      GamePools.asteroids.releaseAll();
    }
    if (typeof GamePools.destroy === 'function') {
      GamePools.destroy();
    }
    if (harness?.container?.dispose) {
      harness.container.dispose();
    }
    harness = undefined;
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

      try {
        expect(total).toBe(SAMPLE_ASTEROID_COUNT);
        expectWithinTolerance(sizeCounts.large / total, 0.5);
        expectWithinTolerance(sizeCounts.medium / total, 0.3);
        expectWithinTolerance(sizeCounts.small / total, 0.2);
      } finally {
        spawnLog.forEach((asteroid) => {
          if (asteroid) {
            harness.enemySystem.destroyAsteroid(asteroid, { createFragments: false });
          }
        });

        if (typeof harness.enemySystem.cleanupDestroyed === 'function') {
          harness.enemySystem.cleanupDestroyed();
        }
      }
    });
  });

  describe('Variant Distribution by Size', () => {
    const sizes = ['large', 'medium', 'small'];

    sizes.forEach((size) => {
      test(`${size} variant mix matches availability-aware distribution`, () => {
        const wave = 1;
        const results = sampleVariants(
          harness.enemySystem,
          size,
          wave,
          VARIANT_SAMPLE_COUNT
        );

        const totalVariants = Object.values(results).reduce(
          (sum, value) => sum + value,
          0
        );

        expect(totalVariants).toBe(VARIANT_SAMPLE_COUNT);

        const expected = computeExpectedVariantBreakdown(
          harness.enemySystem,
          size,
          wave
        );

        const actualSpecial = 1 - (results.common || 0) / totalVariants;
        expectWithinTolerance(actualSpecial, expected.specialChance);

        Object.entries(expected.probabilities).forEach(([variant, probability]) => {
          const actual = (results[variant] || 0) / totalVariants;
          expectWithinTolerance(actual, probability);
        });

        expected.excluded.forEach((variant) => {
          expect(results[variant] || 0).toBe(0);
        });
      });
    });

    test('parasite remains unavailable before wave 4', () => {
      const results = sampleVariants(
        harness.enemySystem,
        'medium',
        3,
        VARIANT_SAMPLE_COUNT
      );

      expect(results.parasite || 0).toBe(0);
    });

    test('parasite participates in the distribution from wave 4 onward', () => {
      const wave = 4;
      const results = sampleVariants(
        harness.enemySystem,
        'medium',
        wave,
        VARIANT_SAMPLE_COUNT
      );

      const total = Object.values(results).reduce((sum, value) => sum + value, 0);
      const expected = computeExpectedVariantBreakdown(
        harness.enemySystem,
        'medium',
        wave
      );

      const actualParasite = (results.parasite || 0) / total;
      expectWithinTolerance(actualParasite, expected.probabilities.parasite);
    });

    test('gold variant never spawns for large asteroids', () => {
      const results = sampleVariants(
        harness.enemySystem,
        'large',
        6,
        VARIANT_SAMPLE_COUNT
      );

      expect(results.gold || 0).toBe(0);
    });

    test('denseCore variant absent for small asteroids', () => {
      const results = sampleVariants(
        harness.enemySystem,
        'small',
        6,
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

        const expected = computeExpectedVariantBreakdown(
          harness.enemySystem,
          'medium',
          waveNumber
        );

        const tolerance = Math.max(
          0.003,
          Math.min(0.02, expected.specialChance * 0.2)
        );

        expect(Math.abs(actualSpecial - expected.specialChance)).toBeLessThanOrEqual(
          tolerance
        );
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

  describe('Average fragments per destruction', () => {
    test('mean fragment output per size is stable', () => {
      ['large', 'medium', 'small'].forEach((size) => {
        const mean = computeAverageFragmentsForSize(
          harness.enemySystem,
          size,
          FRAGMENT_ANALYSIS_WAVE,
          FRAGMENT_SAMPLE_COUNT
        );

        const bounds = computeFragmentExpectationBounds(
          harness.enemySystem,
          size,
          FRAGMENT_ANALYSIS_WAVE
        );

        const guardBand = 0.05;
        const closeness = Math.max(0.05, (bounds.max - bounds.min) * 0.25);

        expect(mean).toBeGreaterThanOrEqual(bounds.min - guardBand);
        expect(mean).toBeLessThanOrEqual(bounds.max + guardBand);
        expect(Math.abs(mean - bounds.mean)).toBeLessThanOrEqual(closeness);
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

  describe('Feature Flag: USE_WAVE_MANAGER', () => {
    test('Legacy system remains functional when flag is false', () => {
      expect(CONSTANTS.USE_WAVE_MANAGER).toBe(false);

      const legacySpy = vi.spyOn(harness.enemySystem, 'updateWaveLogic');
      const { waveState } = simulateWave(harness.enemySystem, 1, 400);

      expect(waveState.totalAsteroids).toBe(4);
      expect(waveState.asteroidsSpawned).toBeGreaterThan(0);
      expect(legacySpy).toHaveBeenCalled();

      legacySpy.mockRestore();
    });

    test('EnemySystem gracefully handles missing WaveManager', () => {
      const originalDescriptor = Object.getOwnPropertyDescriptor(
        CONSTANTS,
        'USE_WAVE_MANAGER'
      );

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const legacySpy = vi.spyOn(harness.enemySystem, 'updateWaveLogic');

      harness.enemySystem.waveManager = null;
      prepareWave(harness.enemySystem, 1);

      try {
        try {
          Object.defineProperty(CONSTANTS, 'USE_WAVE_MANAGER', {
            configurable: true,
            get: () => true
          });
        } catch (error) {
          globalThis.__USE_WAVE_MANAGER_OVERRIDE__ = true;
        }

        expect(() => harness.enemySystem.update(0.5)).not.toThrow();
        expect(legacySpy).toHaveBeenCalled();

        const warningEmitted = warnSpy.mock.calls.some(([message]) =>
          String(message).includes('WaveManager indisponível')
        );
        expect(warningEmitted).toBe(true);
      } finally {
        if (originalDescriptor && originalDescriptor.configurable) {
          Object.defineProperty(CONSTANTS, 'USE_WAVE_MANAGER', originalDescriptor);
        }

        delete globalThis.__USE_WAVE_MANAGER_OVERRIDE__;

        legacySpy.mockRestore();
        warnSpy.mockRestore();
      }
    });

    test('WaveManager counters sync into legacy waveState when enabled', () => {
      const stubState = {
        currentWave: 7,
        inProgress: true,
        spawned: 5,
        killed: 3,
        total: 11
      };

      prepareWave(harness.enemySystem, 2);

      harness.enemySystem.waveManager = {
        update: vi.fn(),
        getState: vi.fn(() => ({ ...stubState }))
      };

      const initialWaveState = { ...harness.enemySystem.waveState };

      try {
        globalThis.__USE_WAVE_MANAGER_OVERRIDE__ = true;

        harness.enemySystem.update(0.25);

        expect(harness.enemySystem.waveManager.update).toHaveBeenCalledWith(0.25);

        const syncedState = harness.enemySystem.waveState;
        expect(syncedState.current).not.toBe(initialWaveState.current);
        expect(syncedState.current).toBe(stubState.currentWave);
        expect(syncedState.isActive).toBe(stubState.inProgress);
        expect(syncedState.asteroidsSpawned).toBe(stubState.spawned);
        expect(syncedState.asteroidsKilled).toBe(stubState.killed);
        expect(syncedState.totalAsteroids).toBe(stubState.total);
      } finally {
        delete globalThis.__USE_WAVE_MANAGER_OVERRIDE__;
        harness.enemySystem.waveManager = null;
      }
    });
  });
});
