// src/modules/player/modernTrial.js
//
// Three proposals for the modern flight (the Flight Computer's), flown beside
// today's by the address `?moderno=1|2|3`, with today's jets or `?voo=a|b`.
// Felipe (22/11): "a gente tem que repensar o modo com o computador de
// manobra [...] tinha que estar ter uma sensação de que a nave está mais
// poderosa, mais rápida, mais manobrável". Today's modern cruises under the
// start's top speed (its drag holds it there); each proposal flies at least
// as fast as the start with the same cards, every card counting, and the RCS
// System turns the nose quicker too. PROPOSTA 22/11, the owner judges by flying.

// `top`: the cruise, × the start's top speed (max speed × GLIDE_SPEED_SCALE).
// `coastBrake`: letting go stops the ship (today's modern); without it the
// ship keeps its momentum as in the start, the Braking System's drag only.
// `turbo`: holding one direction builds the cruise up to this × `top`.
export const MODERN_TRIALS = Object.freeze({
  // 1, "rápida e firme": today's grip, the start's speed and more.
  1: Object.freeze({ top: 1.2, coastBrake: true, turbo: 1 }),
  // 2, "deslize com vetor": the start's momentum, thrust in any direction.
  2: Object.freeze({ top: 1.2, coastBrake: false, turbo: 1 }),
  // 3, "turbo": 1's grip, and a straight run builds speed.
  3: Object.freeze({ top: 1.2, coastBrake: true, turbo: 1.4 }),
});
// Turbo: from nothing to full over this (s) while the keys hold one way; it
// fades over TURBO_FADE_S when they let go or turn more than TURBO_TURN off.
const TURBO_RAMP_S = 1.2;
const TURBO_FADE_S = 0.4;
const TURBO_TURN = Math.cos(Math.PI / 4);

/** The proposal from `?moderno=`, or null (today's modern flight). */
export function modernTrialFromUrl() {
  try {
    const value = Number(
      new URLSearchParams(window.location.search).get('moderno')
    );
    return MODERN_TRIALS[value] ? value : null;
  } catch {
    return null; // no window (Node tests)
  }
}

/**
 * This step's cruise multiplier from the turbo (1 without one): `flight`
 * keeps the turbo's charge and direction; `move` is the keys' unit direction
 * or null.
 */
export function turboScale(flight, trial, move, deltaTime) {
  if (trial.turbo === 1) return 1;
  const held =
    move &&
    flight.turboDir &&
    move.x * flight.turboDir.x + move.y * flight.turboDir.y >= TURBO_TURN;
  if (held) {
    flight.turbo = Math.min(1, flight.turbo + deltaTime / TURBO_RAMP_S);
  } else {
    flight.turbo = Math.max(0, flight.turbo - deltaTime / TURBO_FADE_S);
    if (move && flight.turbo === 0) flight.turboDir = move;
  }
  return 1 + (trial.turbo - 1) * flight.turbo;
}
