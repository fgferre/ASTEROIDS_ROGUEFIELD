import { afterEach, vi } from 'vitest';
import { holdProgress } from '../../src/core/storage.js';

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

afterEach(() => {
  while (globalThis.__HAS_GLOBAL_MOCKS__) {
    cleanupGlobalState();
  }

  vi.restoreAllMocks();
  // A test that started a replay or a demo run must not hold the next one's saves.
  holdProgress(false);
});
