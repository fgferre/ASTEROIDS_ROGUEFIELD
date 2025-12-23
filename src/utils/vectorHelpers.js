// Vector utility functions for 2D vector operations
// Used by game systems for movement, collision, and rendering

const EPSILON = 1e-6;

/**
 * Calculates the length (magnitude) of a 2D vector.
 * @param {number} vx - X component
 * @param {number} vy - Y component
 * @returns {number} Vector length
 */
export function length(vx, vy) {
  return Math.hypot(vx, vy);
}

/**
 * Normalizes a 2D vector to unit length.
 * @param {number} vx - X component
 * @param {number} vy - Y component
 * @returns {{x: number, y: number, length: number}} Normalized vector with original length
 */
export function normalize(vx, vy) {
  const len = length(vx, vy);
  if (len < EPSILON) {
    return { x: 0, y: 0, length: 0 };
  }
  return {
    x: vx / len,
    y: vy / len,
    length: len,
  };
}

/**
 * Normalizes a 2D vector to unit length (simple version without length).
 * @param {number} vx - X component
 * @param {number} vy - Y component
 * @returns {{x: number, y: number}} Normalized vector
 */
export function normalizeSimple(vx, vy) {
  const len = length(vx, vy);
  if (len < EPSILON) {
    return { x: 0, y: 0 };
  }
  return { x: vx / len, y: vy / len };
}
