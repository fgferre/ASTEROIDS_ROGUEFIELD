// Math utility functions for scalar operations
// Used by game systems for clamping, interpolation, and easing

/**
 * Clamps a value between min and max bounds.
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum bound
 * @param {number} max - Maximum bound
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation between two values.
 * @param {number} start - Start value
 * @param {number} end - End value
 * @param {number} t - Interpolation factor (0-1, automatically clamped)
 * @returns {number} Interpolated value
 */
export function lerp(start, end, t) {
  return start + (end - start) * clamp(t, 0, 1);
}

/**
 * Cubic easing function (ease-in-out).
 * @param {number} t - Progress value (0-1)
 * @returns {number} Eased value (0-1)
 */
export function easeInOutCubic(t) {
  if (t <= 0) {
    return 0;
  }
  if (t >= 1) {
    return 1;
  }
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
