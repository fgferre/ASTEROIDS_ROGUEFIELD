// src/utils/deepFreeze.js

/**
 * Recursively freezes an object graph, ensuring nested objects and arrays
 * cannot be mutated at runtime.
 *
 * @template T
 * @param {T} value - Object or array to freeze.
 * @returns {T} The frozen object reference.
 */
export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.values(value).forEach((nested) => {
    if (nested && typeof nested === 'object') {
      deepFreeze(nested);
    }
  });

  return Object.freeze(value);
}

