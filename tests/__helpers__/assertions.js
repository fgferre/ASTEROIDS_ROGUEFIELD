import { expect } from 'vitest';

/**
 * Assert that two numeric sequences are deterministic within a tolerance.
 *
 * @param {number[]} seq1 - First sequence of numeric values.
 * @param {number[]} seq2 - Second sequence of numeric values.
 * @param {number} [tolerance=0.000001] - Allowed floating point tolerance.
 * @throws {Error} When the sequences differ in length or value beyond the tolerance.
 * @example
 * expectDeterministicSequence([0.1, 0.2], [0.1, 0.2]);
 */
export function expectDeterministicSequence(seq1, seq2, tolerance = 0.000001) {
  if (seq1.length !== seq2.length) {
    throw new Error(
      `Sequences differ in length: ${seq1.length} !== ${seq2.length}`
    );
  }

  seq1.forEach((value, index) => {
    const expected = seq2[index];
    try {
      expectWithinTolerance(value, expected, tolerance);
    } catch (error) {
      throw new Error(
        `Sequence mismatch at index ${index}: ${value} !== ${expected}. ${(error && error.message) || ''}`
      );
    }
  });
}

/**
 * Assert that a value is within an epsilon tolerance of the expected value.
 *
 * @param {number} value - Actual value produced by the system under test.
 * @param {number} expected - Expected deterministic value.
 * @param {number} [tolerance=0.000001] - Allowed difference between the values.
 * @example
 * expectWithinTolerance(0.3000004, 0.3, 0.00001);
 */
export function expectWithinTolerance(value, expected, tolerance = 0.000001) {
  expect(value).toBeCloseTo(expected, getPrecisionFromTolerance(tolerance));
}

/**
 * Assert that two determinism snapshots share the same seeds.
 *
 * @param {Record<string, any>} snapshot1 - First snapshot captured from a test run.
 * @param {Record<string, any>} snapshot2 - Second snapshot captured from a comparison run.
 * @example
 * expectSameSeeds({ enemy: 1 }, { enemy: 1 });
 */
export function expectSameSeeds(snapshot1, snapshot2) {
  const normalizedA = pruneUndefined(snapshot1, true);
  const normalizedB = pruneUndefined(snapshot2, true);

  expect(normalizedA).toEqual(normalizedB);
}

/**
 * Derive the precision argument for toBeCloseTo from a tolerance.
 *
 * @param {number} tolerance - Tolerance used to compare numeric values.
 * @returns {number} Precision argument suitable for toBeCloseTo.
 */
function getPrecisionFromTolerance(tolerance) {
  if (tolerance <= 0) {
    return 5;
  }
  const precision = Math.abs(Math.round(Math.log10(1 / tolerance)));
  return Number.isFinite(precision) ? precision : 5;
}

/**
 * Recursively remove undefined properties from an object tree.
 *
 * @param {any} value - Value potentially containing undefined properties.
 * @param {boolean} [isRoot=false] - Indicates whether the current node is the root snapshot.
 * @returns {any} A sanitized clone free of undefined properties.
 */
function pruneUndefined(value, isRoot = false) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => pruneUndefined(entry))
      .filter((entry) => entry !== undefined);
  }

  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined) {
        continue;
      }
      const sanitized = pruneUndefined(child);
      if (sanitized !== undefined) {
        result[key] = sanitized;
      }
    }
    if (!isRoot && Object.keys(result).length === 0) {
      return undefined;
    }
    return result;
  }

  return value;
}
