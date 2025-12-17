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

/**
 * Calculates the magnitude of a 2D vector (alias for length).
 * @param {number} vx - X component
 * @param {number} vy - Y component
 * @returns {number} Vector magnitude
 */
export function magnitude(vx, vy) {
  return length(vx, vy);
}

/**
 * Calculates the dot product of two 2D vectors.
 * @param {number} ax - X component of vector A
 * @param {number} ay - Y component of vector A
 * @param {number} bx - X component of vector B
 * @param {number} by - Y component of vector B
 * @returns {number} Dot product
 */
export function dot(ax, ay, bx, by) {
  return ax * bx + ay * by;
}

/**
 * Calculates the Euclidean distance between two points.
 * @param {number} x1 - X coordinate of first point
 * @param {number} y1 - Y coordinate of first point
 * @param {number} x2 - X coordinate of second point
 * @param {number} y2 - Y coordinate of second point
 * @returns {number} Distance between the two points
 */
export function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}
