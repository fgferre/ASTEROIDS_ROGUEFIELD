// src/data/constants/physics.js

// === SHIP PHYSICS ===
export const SHIP_ACCELERATION = 280;
export const SHIP_MAX_SPEED = 220;
export const SHIP_LINEAR_DAMPING = 3.1; // s^-1
export const SHIP_ROTATION_SPEED = 8; // rad/s
export const SHIP_ANGULAR_DAMPING = 6.2; // s^-1
export const SHIP_MASS = 60;

// === MODERN CONTROLS === (NORTE §4b) PROPOSAL 18/10 ("proposta 18/10"), judged by playing.
// WASD moves on the screen axes; the hull faces the motion; a turret aims.
export const MODERN_MOVE_ACCEL = 1; // × ship acceleration along the WASD direction
export const SHIP_HEADING_TURN_RATE = 10; // rad/s cap turning onto the WASD direction
export const SHIP_MOVE_TURN_RATE = 6; // rad/s cap turning onto the velocity (no input)
export const SHIP_FACE_VELOCITY_MIN_SPEED = 20; // px/s; slower than this, hold heading
export const SHIP_FACING_RESPONSE = 14; // s^-1 exponential approach (no overshoot)
export const TURRET_TURN_RATE = 14; // rad/s cap turning onto the aim point
export const TURRET_RESPONSE = 30; // s^-1 exponential approach (no overshoot)
export const TURRET_PIVOT_X = 2.5; // px ahead of the hull centre, behind the cockpit
export const TURRET_BARREL_LENGTH = 9; // px from the pivot to the muzzle

// === ASTEROID SPEEDS ===
export const ASTEROID_SPEEDS = Object.freeze({
  large: 25,
  medium: 45,
  small: 70,
});

// === CRACK MECHANICS ===
export const ASTEROID_CRACK_THRESHOLDS = Object.freeze([0.7, 0.4, 0.15]);

export const ASTEROID_CRACK_GRAPH_RULES = Object.freeze({
  continuationBias: 0.82,
  newRootChance: 0.22,
  childPenalty: 0.45,
  branchParentPenalty: 0.5,
  microParentPenalty: 0.35,
  minSegmentLengthRatio: 0.12,
  surfaceMargin: 0.65,
  branchAnchorJitter: 0.15,
  microAnchorJitter: 0.22,
  continuationJitter: 0.5,
});
