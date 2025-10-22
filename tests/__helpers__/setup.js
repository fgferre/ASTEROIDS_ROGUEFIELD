import { vi } from 'vitest';
import { ServiceRegistry } from '../../src/core/ServiceRegistry.js';
import { createEventBusMock, createServiceRegistryMock } from './mocks.js';

const hasOwn = Object.prototype.hasOwnProperty;
let previousGlobals = null;

/**
 * Configure globalThis with the default mocks used across integration tests.
 *
 * @param {{gameEvents?: any, gameServices?: any, performance?: {now: () => number}}} [options] - Optional overrides for the global mocks.
 * @returns {{gameEvents?: any, gameServices?: any, performance?: any, hadGameEvents: boolean, hadGameServices: boolean, hadPerformance: boolean}}
 * @example
 * const snapshot = setupGlobalMocks();
 * // run test logic
 * cleanupGlobalState();
 */
export function setupGlobalMocks(options = {}) {
  const {
    gameEvents = createEventBusMock(),
    gameServices = createServiceRegistryMock(),
    performance = { now: () => 0 },
  } = options;

  const previous = {
    gameEvents: globalThis.gameEvents,
    gameServices: globalThis.gameServices,
    performance: globalThis.performance,
    hadGameEvents: hasOwn.call(globalThis, 'gameEvents'),
    hadGameServices: hasOwn.call(globalThis, 'gameServices'),
    hadPerformance: hasOwn.call(globalThis, 'performance'),
  };

  globalThis.gameEvents = gameEvents;
  globalThis.gameServices = gameServices;
  globalThis.performance = performance;

  previousGlobals = previous;

  return previous;
}

/**
 * Cleanup all global mocks and restore default state.
 *
 * @example
 * afterEach(() => {
 *   cleanupGlobalState();
 * });
 */
export function cleanupGlobalState() {
  const snapshot =
    previousGlobals ?? {
      gameEvents: globalThis.gameEvents,
      gameServices: globalThis.gameServices,
      performance: globalThis.performance,
      hadGameEvents: hasOwn.call(globalThis, 'gameEvents'),
      hadGameServices: hasOwn.call(globalThis, 'gameServices'),
      hadPerformance: hasOwn.call(globalThis, 'performance'),
    };

  if (snapshot.hadGameEvents) {
    globalThis.gameEvents = snapshot.gameEvents;
  } else {
    delete globalThis.gameEvents;
  }

  if (snapshot.hadGameServices) {
    globalThis.gameServices = snapshot.gameServices;
  } else {
    delete globalThis.gameServices;
  }

  if (snapshot.hadPerformance) {
    globalThis.performance = snapshot.performance;
  } else {
    delete globalThis.performance;
  }

  delete globalThis.__USE_WAVE_MANAGER_OVERRIDE__;
  delete globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__;

  vi.restoreAllMocks();
  previousGlobals = null;
}

/**
 * Execute a callback with WaveManager feature flags temporarily overridden.
 *
 * @param {{useManager?: boolean, managerHandlesAsteroids?: boolean}} config - Flags to apply during the callback execution.
 * @param {() => Promise<any>|any} callback - Callback executed with overrides enabled.
 * @returns {Promise<any>|any}
 * @example
 * await withWaveOverrides({ useManager: true }, async () => {
 *   // assertions
 * });
 */
export function withWaveOverrides(config, callback) {
  const {
    useManager = true,
    managerHandlesAsteroids = true,
  } = config ?? {};

  const previousUseManager = globalThis.__USE_WAVE_MANAGER_OVERRIDE__;
  const previousManagerHandles = globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__;

  globalThis.__USE_WAVE_MANAGER_OVERRIDE__ = useManager;
  globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__ = managerHandlesAsteroids;

  try {
    return callback();
  } finally {
    if (previousUseManager === undefined) {
      delete globalThis.__USE_WAVE_MANAGER_OVERRIDE__;
    } else {
      globalThis.__USE_WAVE_MANAGER_OVERRIDE__ = previousUseManager;
    }

    if (previousManagerHandles === undefined) {
      delete globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__;
    } else {
      globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__ = previousManagerHandles;
    }
  }
}

/**
 * Create a ServiceRegistry test container with a deterministic random seed.
 *
 * @param {string} [seed='test-seed'] - Seed forwarded to the container factory.
 * @returns {ReturnType<typeof ServiceRegistry.createTestContainer>}
 * @example
 * const container = createTestContainer('audio-seed');
 * const random = container.resolve('RandomService');
 */
export function createTestContainer(seed = 'test-seed') {
  return ServiceRegistry.createTestContainer({ randomSeed: seed });
}
