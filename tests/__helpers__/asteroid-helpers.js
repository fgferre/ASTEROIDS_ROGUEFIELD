import * as CONSTANTS from '../../src/core/GameConstants.js';
import { EnemySystem } from '../../src/modules/EnemySystem.js';
import { GamePools } from '../../src/core/GamePools.js';
import { createTestContainer, withWaveOverrides } from './setup.js';

export const TEST_SEED = 123456;
export const SAMPLE_ASTEROID_COUNT = 1000;
export const VARIANT_SAMPLE_COUNT = 5000;
export const WAVE_VARIANT_SAMPLE_COUNT = 3000;
export const FRAGMENT_SAMPLE_COUNT = 800;
export const FRAGMENT_ANALYSIS_WAVE = 6;

/**
 * Create a lightweight event bus mock tailored for asteroid metric tests.
 *
 * @returns {{
 *   listeners: Map<string, Set<Function>>,
 *   on(eventName: string, handler: Function): () => void,
 *   off(eventName: string, handler: Function): void,
 *   emit(eventName: string, payload?: any): void,
 *   removeAllListeners(eventName?: string): void,
 * }}
 * @example
 * const eventBus = createTestEventBus();
 * const unsubscribe = eventBus.on('enemy-spawned', (payload) => {
 *   // assertions
 * });
 * eventBus.emit('enemy-spawned', { id: 42 });
 * unsubscribe();
 */
export function createTestEventBus() {
  const listeners = new Map();

  function on(eventName, handler) {
    if (!listeners.has(eventName)) {
      listeners.set(eventName, new Set());
    }

    const handlers = listeners.get(eventName);
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        listeners.delete(eventName);
      }
    };
  }

  function off(eventName, handler) {
    const handlers = listeners.get(eventName);
    if (!handlers) {
      return;
    }
    handlers.delete(handler);
    if (handlers.size === 0) {
      listeners.delete(eventName);
    }
  }

  function emit(eventName, payload) {
    const handlers = listeners.get(eventName);
    if (!handlers) {
      return;
    }
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(error);
      }
    }
  }

  function removeAllListeners(eventName) {
    if (typeof eventName === 'string') {
      listeners.delete(eventName);
      return;
    }
    listeners.clear();
  }

  return {
    listeners,
    on,
    off,
    emit,
    removeAllListeners,
  };
}

/**
 * Create a fully wired EnemySystem harness configured for deterministic tests.
 *
 * @param {number} [seed=TEST_SEED] - Seed applied to the RandomService.
 * @returns {{ enemySystem: EnemySystem, container: any, services: Record<string, any> }}
 * @example
 * const harness = createEnemySystemHarness();
 * harness.enemySystem.spawnAsteroid();
 */
export function createEnemySystemHarness(seed = TEST_SEED) {
  if (GamePools.asteroids?.releaseAll) {
    GamePools.asteroids.releaseAll();
  }
  if (typeof GamePools.destroy === 'function') {
    GamePools.destroy();
  }

  const { GAME_WIDTH, GAME_HEIGHT } = CONSTANTS;
  const worldBounds = { left: 0, top: 0, right: GAME_WIDTH, bottom: GAME_HEIGHT };

  const world = {
    getBounds: () => worldBounds,
    handlePlayerDeath: () => {},
    isPlayerAlive: () => true,
    playerAlive: true,
  };

  const player = {
    position: { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 },
    velocity: { x: 0, y: 0 },
    getHullBoundingRadius: () => 20,
    takeDamage: () => {},
    isAlive: () => true,
  };

  const xpOrbs = {
    createXPOrb: () => {},
  };

  const healthHearts = {
    awardHeart: () => {},
    removeHeart: () => {},
    isEnabled: () => false,
  };

  const progression = {
    getDifficulty: () => 1,
    getCurrentWave: () => 1,
  };

  const physics = {
    registerEnemy: () => {},
    unregisterEnemy: () => {},
    bootstrapFromEnemySystem: () => {},
    attachEnemySystem: () => {},
    detachEnemySystem: () => {},
  };

  const eventBus = createTestEventBus();

  const container = createTestContainer(seed);

  if (!container.has('world')) {
    container.register('world', () => world);
  }
  if (!container.has('player')) {
    container.register('player', () => player);
  }
  if (!container.has('progression')) {
    container.register('progression', () => progression);
  }
  if (!container.has('physics')) {
    container.register('physics', () => physics);
  }
  if (!container.has('xp-orbs')) {
    container.register('xp-orbs', () => xpOrbs);
  }
  if (!container.has('healthHearts')) {
    container.register('healthHearts', () => healthHearts);
  }
  if (!container.has('event-bus')) {
    container.register('event-bus', () => eventBus);
  }

  const randomService = container.resolve('random');

  const services = {
    world,
    player,
    xpOrbs,
    healthHearts,
    progression,
    physics,
    random: randomService,
    'xp-orbs': xpOrbs,
    eventBus,
  };

  const enemySystem = new EnemySystem({
    world,
    player,
    progression,
    physics,
    'xp-orbs': xpOrbs,
    healthHearts,
    random: randomService,
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
    physics,
    xpOrbs,
    healthHearts,
    random: randomService,
    eventBus,
  });

  enemySystem.eventBus = eventBus;

  enemySystem.refreshInjectedServices({ force: true, suppressWarnings: true });
  enemySystem.reseedRandomScopes({ seed, resetSequences: true });

  return { enemySystem, container, services };
}

/**
 * Prepare an EnemySystem instance to run the specified wave.
 *
 * @param {EnemySystem} enemySystem - The system under test.
 * @param {number} waveNumber - Target wave to prepare.
 * @param {{ spawnInitial?: boolean }} [options] - Additional setup options.
 * @returns {void}
 * @example
 * prepareWave(enemySystem, 3, { spawnInitial: true });
 */
export function prepareWave(enemySystem, waveNumber, options = {}) {
  const baseState = enemySystem.createInitialWaveState();
  const normalizedWave = Math.max(1, waveNumber);

  const baseCount = Number.isFinite(CONSTANTS.ASTEROIDS_PER_WAVE_BASE)
    ? CONSTANTS.ASTEROIDS_PER_WAVE_BASE
    : 0;
  const perWaveIncrement = Number.isFinite(
    CONSTANTS.ASTEROIDS_PER_WAVE_MULTIPLIER,
  )
    ? CONSTANTS.ASTEROIDS_PER_WAVE_MULTIPLIER
    : 0;

  const computedTotal = Math.floor(
    baseCount + (normalizedWave - 1) * perWaveIncrement,
  );
  const clampedTotal = Math.min(computedTotal, 25);

  const spawnDelay = Math.max(0.8, 2.0 - normalizedWave * 0.1);

  enemySystem.waveState = {
    ...baseState,
    current: normalizedWave,
    isActive: true,
    totalAsteroids: clampedTotal,
    asteroidsSpawned: 0,
    asteroidsKilled: 0,
    initialSpawnDone: false,
    spawnTimer: 0,
    spawnDelay,
    timeRemaining: CONSTANTS.WAVE_DURATION,
    completedWaves: Math.max(0, normalizedWave - 1),
  };

  enemySystem.asteroids.length = 0;
  enemySystem.spawnTimer = 0;
  enemySystem.sessionActive = true;
  enemySystem._waveSystemDebugLogged = false;
  enemySystem._asteroidSpawnDebugLogged = false;
  enemySystem.invalidateActiveEnemyCache?.();
  enemySystem.reseedRandomScopes?.({ resetSequences: true });

  if (options.spawnInitial) {
    enemySystem.spawnInitialAsteroids?.(4);
  }
}

/**
 * Simulate a wave lifecycle until completion or until the iteration limit is reached.
 *
 * @param {EnemySystem} enemySystem - The system to simulate.
 * @param {number} waveNumber - Wave identifier.
 * @param {number} [maxIterations=1500] - Safety cap for the update loop.
 * @returns {{ waveState: ReturnType<EnemySystem['createInitialWaveState']> }}
 * @example
 * const { waveState } = simulateWave(enemySystem, 1, 600);
 */
export function simulateWave(enemySystem, waveNumber, maxIterations = 1500) {
  let resultState = null;

  withWaveOverrides({ useManager: false }, () => {
    prepareWave(enemySystem, waveNumber);

    const deltaTime = 0.5;
    let iterations = 0;

    // Prime the wave state so the legacy system can start the wave
    enemySystem.update(0);

    while (enemySystem.waveState.isActive && iterations < maxIterations) {
      enemySystem.update(deltaTime);

      if (enemySystem.getActiveEnemyCount?.() > CONSTANTS.MAX_ASTEROIDS_ON_SCREEN) {
        throw new Error('Active asteroid count exceeded screen limit.');
      }

      const activeEnemies =
        typeof enemySystem.getActiveEnemies === 'function'
          ? enemySystem.getActiveEnemies()
          : enemySystem.asteroids.filter((asteroid) => !asteroid.isDestroyed);

      if (activeEnemies.length > 0) {
        enemySystem.destroyAsteroid(activeEnemies[0], {
          createFragments: false,
          triggerExplosion: false,
        });
      }

      iterations += 1;
    }

    if (iterations >= maxIterations) {
      throw new Error('Wave simulation exceeded iteration cap.');
    }

    resultState = { ...enemySystem.waveState };

    const remaining =
      typeof enemySystem.getAllEnemies === 'function'
        ? enemySystem.getAllEnemies()
        : enemySystem.asteroids.slice();
    for (const asteroid of remaining) {
      enemySystem.destroyAsteroid(asteroid, {
        createFragments: false,
        triggerExplosion: false,
      });
    }

    enemySystem.update(0);
  });

  return { waveState: resultState };
}

/**
 * Aggregate size and variant counts for a spawn log.
 *
 * @param {Array<{ size: string, variant: string }>} spawnLog - Asteroid spawn records.
 * @returns {{ total: number, sizeCounts: Record<string, number>, variantCounts: Record<string, number> }}
 * @example
 * const metrics = collectSpawnMetrics(spawnLog);
 * expect(metrics.total).toBe(1000);
 */
export function collectSpawnMetrics(spawnLog) {
  const sizeCounts = { large: 0, medium: 0, small: 0 };
  const variantCounts = {};

  for (const entry of spawnLog) {
    const { size, variant } = entry;
    if (sizeCounts[size] !== undefined) {
      sizeCounts[size] += 1;
    }
    variantCounts[variant] = (variantCounts[variant] ?? 0) + 1;
  }

  const total = spawnLog.length;
  return { total, sizeCounts, variantCounts };
}

/**
 * Sample asteroid variants deterministically for the given size and wave.
 *
 * @param {EnemySystem} enemySystem - Target system.
 * @param {'large'|'medium'|'small'} size - Asteroid size.
 * @param {number} wave - Wave number.
 * @param {number} count - Number of samples to collect.
 * @returns {Record<string, number>}
 * @example
 * const samples = sampleVariants(enemySystem, 'medium', 4, 1000);
 */
export function sampleVariants(enemySystem, size, wave, count) {
  enemySystem.waveState.current = wave;
  enemySystem.reseedRandomScopes?.({ resetSequences: true });

  const results = {};
  for (let index = 0; index < count; index += 1) {
    const variant = enemySystem.decideVariant(size, { wave, spawnType: 'spawn' });
    results[variant] = (results[variant] ?? 0) + 1;
  }
  return results;
}

/**
 * Compute the theoretical variant distribution expected for the provided size/wave.
 *
 * @param {EnemySystem} enemySystem - System exposing variant utilities.
 * @param {'large'|'medium'|'small'} size - Asteroid size category.
 * @param {number} wave - Wave number.
 * @returns {{ specialChance: number, probabilities: Record<string, number>, excluded: string[] }}
 * @example
 * const breakdown = computeExpectedVariantBreakdown(enemySystem, 'medium', 4);
 */
export function computeExpectedVariantBreakdown(enemySystem, size, wave) {
  const chanceConfig = CONSTANTS.ASTEROID_VARIANT_CHANCES[size];
  if (!chanceConfig) {
    return { specialChance: 0, probabilities: { common: 1 }, excluded: [] };
  }

  const variantConfig = CONSTANTS.ASTEROID_VARIANTS || {};
  const baseChance =
    chanceConfig.baseChance ?? chanceConfig.base ?? chanceConfig.specialChance ?? 0;
  const waveBonus =
    typeof enemySystem.computeVariantWaveBonus === 'function'
      ? enemySystem.computeVariantWaveBonus(wave)
      : 0;
  const specialChance = Math.min(Math.max(baseChance + waveBonus, 0), 1);

  const allowedEntries = [];
  const excluded = [];
  const distribution = chanceConfig.distribution || {};

  for (const [variant, weight] of Object.entries(distribution)) {
    const config = variantConfig[variant] || {};
    const { allowedSizes, availability } = config;
    const sizeAllowed = !Array.isArray(allowedSizes) || allowedSizes.includes(size);
    const minWave = availability?.minWave;
    const waveAllowed = typeof minWave !== 'number' || wave >= minWave;
    const usable = Number(weight) > 0 && sizeAllowed && waveAllowed;
    if (usable) {
      allowedEntries.push([variant, Number(weight)]);
    } else {
      excluded.push(variant);
    }
  }

  const totalWeight = allowedEntries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!allowedEntries.length || totalWeight <= 0) {
    return { specialChance: 0, probabilities: { common: 1 }, excluded };
  }

  const probabilities = { common: Math.max(0, 1 - specialChance) };
  for (const [variant, weight] of allowedEntries) {
    probabilities[variant] = (weight / totalWeight) * specialChance;
  }

  for (const variant of excluded) {
    if (!(variant in probabilities)) {
      probabilities[variant] = 0;
    }
  }

  return { specialChance, probabilities, excluded };
}

/**
 * Estimate the mean number of fragments produced by destroying asteroids of a given size.
 *
 * @param {EnemySystem} enemySystem - System under test.
 * @param {'large'|'medium'|'small'} size - Asteroid size category.
 * @param {number} wave - Wave number.
 * @param {number} count - Number of simulations to run.
 * @returns {number}
 * @example
 * const average = computeAverageFragmentsForSize(enemySystem, 'large', 6, 100);
 */
export function computeAverageFragmentsForSize(enemySystem, size, wave, count) {
  let totalFragments = 0;

  enemySystem.waveState = enemySystem.createInitialWaveState();
  enemySystem.waveState.current = wave;
  enemySystem.waveState.isActive = true;
  enemySystem.reseedRandomScopes?.({ resetSequences: true });

  for (let index = 0; index < count; index += 1) {
    const variant = enemySystem.decideVariant(size, { wave, spawnType: 'spawn' });
    const asteroid = enemySystem.acquireAsteroid({
      size,
      variant,
      wave,
      x: 0,
      y: 0,
      vx: 60,
      vy: -40,
      randomScope: 'spawn',
    });

    const fragments = enemySystem.destroyAsteroid(asteroid, {
      createFragments: true,
      triggerExplosion: false,
    });

    totalFragments += Array.isArray(fragments) ? fragments.length : 0;

    if (Array.isArray(fragments)) {
      for (const fragment of fragments) {
        enemySystem.destroyAsteroid(fragment, {
          createFragments: false,
          triggerExplosion: false,
        });
      }
    }
  }

  return totalFragments / count;
}

/**
 * Resolve the fragment rule definition for a given asteroid variant.
 *
 * @param {string} variant - Variant identifier.
 * @returns {Record<string, any>}
 * @example
 * const rule = getFragmentRuleForVariant('iron');
 */
export function getFragmentRuleForVariant(variant) {
  const variantConfig = CONSTANTS.ASTEROID_VARIANTS[variant] ?? {};
  const profileKey =
    variantConfig.fragmentProfile ?? variantConfig.key ?? variant ?? 'default';
  return CONSTANTS.ASTEROID_FRAGMENT_RULES[profileKey] ?? CONSTANTS.ASTEROID_FRAGMENT_RULES.default;
}

/**
 * Compute min/max/mean bounds for the fragment rule of a specific size.
 *
 * @param {Record<string, any>} rule - Fragment rule definition.
 * @param {'large'|'medium'|'small'} size - Asteroid size.
 * @returns {{ min: number, max: number, mean: number }}
 * @example
 * const stats = getFragmentRangeStats(rule, 'medium');
 */
export function getFragmentRangeStats(rule, size) {
  const range = rule?.countBySize?.[size] ?? rule?.countBySize?.default ?? [0, 0];

  if (Array.isArray(range) && range.length === 2) {
    const min = Math.max(0, Math.floor(Number(range[0]) || 0));
    const max = Math.max(min, Math.floor(Number(range[1]) || 0));
    return { min, max, mean: (min + max) / 2 };
  }

  const value = Math.max(0, Math.round(Number(range) || 0));
  return { min: value, max: value, mean: value };
}

/**
 * Compute expected fragment bounds by combining variant probabilities.
 *
 * @param {EnemySystem} enemySystem - Target system.
 * @param {'large'|'medium'|'small'} size - Asteroid size.
 * @param {number} wave - Wave number.
 * @returns {{ min: number, max: number, mean: number }}
 * @example
 * const bounds = computeFragmentExpectationBounds(enemySystem, 'small', 6);
 */
export function computeFragmentExpectationBounds(enemySystem, size, wave) {
  const breakdown = computeExpectedVariantBreakdown(enemySystem, size, wave);
  const contributions = { min: 0, max: 0, mean: 0 };

  for (const [variant, probability] of Object.entries(breakdown.probabilities)) {
    if (probability <= 0) {
      continue;
    }

    const rule = getFragmentRuleForVariant(variant);
    const stats = getFragmentRangeStats(rule, size);

    contributions.min += probability * stats.min;
    contributions.max += probability * stats.max;
    contributions.mean += probability * stats.mean;
  }

  return contributions;
}

/**
 * Generate a compact snapshot of an asteroid's state suitable for deterministic comparisons.
 *
 * @param {{ size: string, variant: string, x: number, y: number, vx: number, vy: number, getBoundingRadius?: () => number, wave?: number }} asteroid - Target asteroid.
 * @returns {{ size: string, variant: string, x: number, y: number, vx: number, vy: number, radius: number, wave: number }}
 * @example
 * const summary = summarizeAsteroid(asteroid);
 */
export function summarizeAsteroid(asteroid) {
  return {
    size: asteroid.size,
    variant: asteroid.variant,
    x: Number(asteroid.x.toFixed(2)),
    y: Number(asteroid.y.toFixed(2)),
    vx: Number(asteroid.vx.toFixed(4)),
    vy: Number(asteroid.vy.toFixed(4)),
    radius: typeof asteroid.getBoundingRadius === 'function' ? asteroid.getBoundingRadius() : asteroid.radius ?? 0,
    wave: asteroid.wave ?? 0,
  };
}
