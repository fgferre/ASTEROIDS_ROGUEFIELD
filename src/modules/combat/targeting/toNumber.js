// src/modules/combat/targeting/toNumber.js
//
// A finite number from any value, or the fallback. The aiming settings (danger
// weights, dynamic prediction) pass through it before they are used.

export function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
