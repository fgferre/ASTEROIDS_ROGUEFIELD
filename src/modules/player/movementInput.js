// src/modules/player/movementInput.js
//
// The move keys and sticks the ship flies by each step: the input system's
// frame of the step, else the last one, and what the sticks point at.
// PlayerSystem owns one.

import {
  GAMEPAD_AIM_ENGAGE,
  GAMEPAD_STICK_CURVES,
} from '../../data/constants/gamepad.js';

/**
 * Modern WASD, or the left stick's direction, as a unit vector on the
 * screen axes (W up), or null. The stick steers at full thrust like a key.
 */
export function getModernMove(input) {
  const stickX = Number(input.moveX) || 0;
  const stickY = Number(input.moveY) || 0;
  const stick = Math.hypot(stickX, stickY);
  if (stick > 0) {
    return { x: stickX / stick, y: stickY / stick };
  }
  const x = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const y = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const length = Math.hypot(x, y);
  return length > 0 ? { x: x / length, y: y / length } : null;
}

/**
 * A pad stick's force 0..1 one way: `value` is the stick past its deadzone
 * (+ that way), curved by the frame's `sensitivity` (the player stamps the
 * setting on each step's frame; Medium without one). Keys, the d-pad and
 * touch are not `pad` frames: 0.
 */
export function padForce(input, value) {
  const curve =
    GAMEPAD_STICK_CURVES[input.sensitivity] ?? GAMEPAD_STICK_CURVES.medium;
  return input.pad && value > 0 ? value ** curve : 0;
}

/**
 * Classic's asks, 0..1: a key or the d-pad is full; a pad's sticks (Felipe's
 * two-stick scheme) push as far as they lean: the left one thrusts (up) and
 * backs (down), the right one turns. The flight, the dash and the brake all
 * read these.
 */
export function classicAsks(input) {
  const stickY = Number(input.moveY) || 0;
  const turn = Number(input.aimX) || 0;
  return {
    up: Math.max(input.up ? 1 : 0, padForce(input, -stickY)),
    down: Math.max(input.down ? 1 : 0, padForce(input, stickY)),
    left: Math.max(input.left ? 1 : 0, padForce(input, -turn)),
    right: Math.max(input.right ? 1 : 0, padForce(input, turn)),
  };
}

// The start's left stick leaning sideways strafes, but a thumb pushing it
// forward a little crooked slid the ship (measured 23/11: 23 units in 5 s at
// 10° off, 68 at 20°): its sideways part under this share is ignored and the
// rest rescaled, so up to some 20° off straight nothing slides and a lean
// clearly sideways still strafes. Not the keys, the strafe hold or touch.
export const STRAFE_STICK_DEADZONE = 0.4;

/**
 * The pilot's strafe, -1 (to port) .. 1 (to starboard), and the input left to
 * steer by. Z and C strafe in both flights. Held (Space, LB, the touch
 * STRAFE), the sideways keys, d-pad and stick strafe instead of turning, and
 * modern flight lets go of the steering (the nose holds). In classic flight
 * the pad's left stick strafes sideways on its own, as far as it leans.
 */
export function splitStrafe(input, modern) {
  const keys = (input.strafeRight ? 1 : 0) - (input.strafeLeft ? 1 : 0);
  const stickX = Number(input.moveX) || 0;
  // `|| 0` folds -0 into 0.
  const stick = Math.sign(stickX) * padForce(input, Math.abs(stickX)) || 0;
  if (!input.strafeHold) {
    // On its own the stick strafes only past STRAFE_STICK_DEADZONE sideways.
    const side = Math.max(
      0,
      (Math.abs(stickX) - STRAFE_STICK_DEADZONE) / (1 - STRAFE_STICK_DEADZONE)
    );
    const free = Math.sign(stickX) * padForce(input, side) || 0;
    return { strafe: keys || (modern ? 0 : free), steer: input };
  }
  const sideways = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const steer = modern
    ? {
        ...input,
        up: false,
        down: false,
        left: false,
        right: false,
        moveX: 0,
        moveY: 0,
      }
    : { ...input, left: false, right: false };
  return { strafe: keys || sideways || stick, steer };
}

/** The right stick's unit direction past the engage, or null. */
export function getAimStickDirection(input) {
  const x = Number(input.aimX) || 0;
  const y = Number(input.aimY) || 0;
  const magnitude = Math.hypot(x, y);
  if (magnitude <= GAMEPAD_AIM_ENGAGE) {
    return null;
  }
  return { x: x / magnitude, y: y / magnitude };
}

export class MovementInput {
  constructor() {
    this.cachedMovementInput = this.getDefaultMovementBinary();
  }

  // This step's movement, once per update: the input's new step frame, else
  // the last one (a step with no input step, or a driver steering the ship
  // through cachedMovementInput meanwhile).
  readMovement(inputSystem) {
    const frame = inputSystem.takeStepFrame();
    if (frame) {
      this.cachedMovementInput = {
        up: Boolean(frame.up),
        down: Boolean(frame.down),
        left: Boolean(frame.left),
        right: Boolean(frame.right),
        strafeLeft: Boolean(frame.strafeLeft),
        strafeRight: Boolean(frame.strafeRight),
        strafeHold: Boolean(frame.strafeHold),
        moveX: Number(frame.moveX) || 0,
        moveY: Number(frame.moveY) || 0,
        aimX: Number(frame.aimX) || 0,
        aimY: Number(frame.aimY) || 0,
        pad: Boolean(frame.pad),
      };
    }
    return { ...this.cachedMovementInput };
  }

  getDefaultMovementBinary() {
    return {
      up: false,
      down: false,
      left: false,
      right: false,
      strafeLeft: false,
      strafeRight: false,
      strafeHold: false,
    };
  }
}
