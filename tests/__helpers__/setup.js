import { afterEach, vi } from 'vitest';
import { ServiceRegistry } from '../../src/core/ServiceRegistry.js';

const hasOwn = Object.prototype.hasOwnProperty;
let previousGlobalsStack = null;

/**
 * Configure globalThis with the default mocks used across integration tests.
 *
 * @param {{performance?: {now: () => number}}} [options] - Optional overrides for the global mocks.
 * @returns {{performance?: any, hadPerformance: boolean}}
 * @example
 * const snapshot = setupGlobalMocks();
 * // run test logic
 * cleanupGlobalState();
 */
export function setupGlobalMocks(options = {}) {
  const { performance = { now: () => 0 } } = options;

  const previous = {
    performance: globalThis.performance,
    hadPerformance: hasOwn.call(globalThis, 'performance'),
  };

  globalThis.performance = performance;

  if (previousGlobalsStack === null) {
    previousGlobalsStack = [];
  }

  previousGlobalsStack.push(previous);
  globalThis.__HAS_GLOBAL_MOCKS__ = true;

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
  const stack = previousGlobalsStack;
  const snapshot = (stack && stack.length ? stack.pop() : null) ?? {
    performance: globalThis.performance,
    hadPerformance: hasOwn.call(globalThis, 'performance'),
  };

  if (snapshot.hadPerformance) {
    globalThis.performance = snapshot.performance;
  } else {
    delete globalThis.performance;
  }

  delete globalThis.__USE_WAVE_MANAGER_OVERRIDE__;
  delete globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__;

  vi.restoreAllMocks();
  if (stack && stack.length === 0) {
    previousGlobalsStack = null;
  }

  if (previousGlobalsStack && previousGlobalsStack.length > 0) {
    globalThis.__HAS_GLOBAL_MOCKS__ = true;
  } else {
    delete globalThis.__HAS_GLOBAL_MOCKS__;
  }
}

/**
 * Execute a callback with WaveManager feature flags temporarily overridden.
 *
 * @param {{useManager?: boolean, managerHandlesAsteroids?: boolean}} config - Flags to apply during the callback execution.
 * @param {() => Promise<any>|any} callback - Callback executed with overrides enabled.
 * @returns {Promise<any>} Resolves with the callback result once overrides are restored.
 * @example
 * await withWaveOverrides({ useManager: true }, async () => {
 *   // assertions
 * });
 */
export async function withWaveOverrides(config, callback) {
  const { useManager = true, managerHandlesAsteroids = true } = config ?? {};

  const previousUseManager = globalThis.__USE_WAVE_MANAGER_OVERRIDE__;
  const previousManagerHandles =
    globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__;

  globalThis.__USE_WAVE_MANAGER_OVERRIDE__ = useManager;
  globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__ =
    managerHandlesAsteroids;

  try {
    const result = await callback();
    return result;
  } finally {
    if (previousUseManager === undefined) {
      delete globalThis.__USE_WAVE_MANAGER_OVERRIDE__;
    } else {
      globalThis.__USE_WAVE_MANAGER_OVERRIDE__ = previousUseManager;
    }

    if (previousManagerHandles === undefined) {
      delete globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__;
    } else {
      globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__ =
        previousManagerHandles;
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

afterEach(() => {
  while (globalThis.__HAS_GLOBAL_MOCKS__) {
    cleanupGlobalState();
  }

  vi.restoreAllMocks();
});
