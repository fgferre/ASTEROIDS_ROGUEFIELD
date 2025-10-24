// src/data/constants/physics.js

// === SHIP PHYSICS ===
export const SHIP_ACCELERATION = 280;
export const SHIP_MAX_SPEED = 220;
export const SHIP_LINEAR_DAMPING = 3.1; // s^-1
export const SHIP_ROTATION_SPEED = 8; // rad/s
export const SHIP_ANGULAR_DAMPING = 6.2; // s^-1
export const SHIP_MASS = 60;

// === ASTEROID SPEEDS ===
export const ASTEROID_SPEEDS = Object.freeze({
  large: 25,
  medium: 45,
  small: 70,
});

// === CRACK MECHANICS ===
export const ASTEROID_CRACK_THRESHOLDS = [0.7, 0.4, 0.15];

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
