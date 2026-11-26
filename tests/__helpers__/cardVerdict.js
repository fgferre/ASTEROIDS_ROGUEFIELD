// The matrix's verdict rule (fixed before any number was read): see the
// header of upgrades.matrix.test.js.
export function verdict({ a, b, e, tol = 0, promisesChange }) {
  if (e === null || e === undefined) return 'NOT MEASURED';
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  const moved = Math.abs(b - a) > 1e-9 * scale;
  // No number promised: any move the promised way beyond the probe's slack.
  if (e === 'more')
    return b - a > tol && moved
      ? 'WORKS'
      : moved
        ? 'DIFFERENT FROM TEXT'
        : 'NO EFFECT';
  if (e === 'less')
    return a - b > tol && moved
      ? 'WORKS'
      : moved
        ? 'DIFFERENT FROM TEXT'
        : 'NO EFFECT';
  if (!promisesChange)
    return Math.abs(b - a) <= tol + 1e-9 * scale
      ? 'WORKS'
      : 'DIFFERENT FROM TEXT';
  if (!moved) return 'NO EFFECT';
  const slack = 0.25 * Math.abs(e - a) + tol + 1e-9 * scale;
  return Math.abs(b - e) <= slack && Math.sign(b - a) === Math.sign(e - a)
    ? 'WORKS'
    : 'DIFFERENT FROM TEXT';
}
