// src/modules/player/flight.js
//
// How the hull flies: thrust and auto-braking from the move input in both
// schemes (modern: WASD on the screen axes, the nose turning onto the
// motion; classic: A/D rotate, W thrusts), damping, the speed cap a dash
// raises, and the flight stats the hull, the Hangar and the cards set.
// PlayerSystem owns one; its updateMovement runs this, then the turret, then
// the thruster events with the thrust this returns.

import {
  MODERN_MOVE_ACCEL,
  SHIP_ACCELERATION,
  SHIP_ANGULAR_DAMPING,
  SHIP_FACE_VELOCITY_MIN_SPEED,
  SHIP_FACING_RESPONSE,
  SHIP_HEADING_TURN_RATE,
  SHIP_LINEAR_DAMPING,
  SHIP_MAX_SPEED,
  SHIP_MOVE_TURN_RATE,
  SHIP_ROTATION_SPEED,
} from '../../data/constants/physics.js';
import {
  DASH_DECAY_SECONDS,
  DASH_SPEED_CAP_MULTIPLIER,
} from '../../data/constants/gameplay.js';
import { getModernMove } from './movementInput.js';

const DRIFT_SETTINGS = {
  rampSpeed: 2.8,
  decaySpeed: 5.2,
  brakeReduction: 0.4,
};

// The same heading within -π..π (the player's angles and the turret's).
export function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export class PlayerFlight {
  /**
   * `ship`: the player's velocity, angle, angularVelocity and controlScheme, read and set live.
   * `maneuvers`: the player's PlayerManeuvers; a dash in progress or easing off lifts the speed cap.
   */
  constructor({ ship, maneuvers }) {
    this.ship = ship;
    this.maneuvers = maneuvers;
    this.driftFactor = 0;

    // === CONFIGURAÇÕES DE MOVIMENTO ===
    // Usar constantes do arquivo separado
    this.maxSpeed = SHIP_MAX_SPEED;
    this.acceleration = SHIP_ACCELERATION;
    this.rotationSpeed = SHIP_ROTATION_SPEED;
    // RCS System: under thrust, push and drag × this (1: off).
    this.agility = 1;
    // FIX-02: split damping into base (always) + braking (no-thrust frames only).
    this.baseLinearDamping = SHIP_LINEAR_DAMPING;
    this.brakingDamping = 0;
    this.angularDamping = SHIP_ANGULAR_DAMPING;
  }

  // Backward-compat read shape: `linearDamping` returns the combined total
  // so any external reader (snapshot / serialize / UI tooltip) keeps a sensible
  // value. No setter — writes that previously hit `linearDamping` must
  // route through the upgrade-linear-damping handler or mutate `brakingDamping`
  // directly; any other writer is a latent bug.
  get linearDamping() {
    return this.baseLinearDamping + this.brakingDamping;
  }

  updateMovement(deltaTime, input) {
    // COPIAR EXATAMENTE da função updatePlayerMovement() original
    const modern = this.ship.controlScheme === 'modern';
    const fwd = {
      x: Math.cos(this.ship.angle),
      y: Math.sin(this.ship.angle),
    };
    // Ship's starboard (screen y points down).
    const right = { x: -fwd.y, y: fwd.x };

    const move = modern ? getModernMove(input) : null;

    // Thruster intensities (lógica do original)
    let thrMain = input.up ? 1 : 0;
    let thrAux = input.down ? 1 : 0;
    // Classic: torque. Modern: sideL pushes to starboard, sideR to port.
    let thrSideR = input.left ? 1 : 0; // CCW torque
    let thrSideL = input.right ? 1 : 0; // CW torque
    if (modern) {
      // Main flame while moving (the hull turns onto the motion); side puffs
      // on the part of the move off the nose.
      const lateral = move ? move.x * right.x + move.y * right.y : 0;
      thrMain = move ? 1 : 0;
      thrAux = 0;
      thrSideL = Math.max(0, lateral);
      thrSideR = Math.max(0, -lateral);
    }

    // Track if thrusters are manually controlled (for audio distinction)
    const isMainManual = modern ? Boolean(move) : input.up;
    const isAuxManual = !modern && input.down;
    // Classic sides only turn on A/D; modern ones damp the drift without a move.
    const isSideManual = !modern || Boolean(move);
    const noManualThrust = !isMainManual && !isAuxManual;
    const dashing = this.maneuvers.dashTimer > 0;
    // RCS System: under thrust, push and drag both scale, so the same top
    // speed comes (and turns round) sooner; a dash and its ease-off keep
    // their own.
    const agility =
      noManualThrust || dashing || this.maneuvers.dashDecayTimer > 0
        ? 1
        : this.agility;
    // The push matches the stepped drag, so the top speed stays put.
    const drag = this.baseLinearDamping * deltaTime;
    const push =
      agility === 1 ? 1 : Math.expm1(drag * agility) / Math.expm1(drag);
    const accelStep = this.acceleration * push * deltaTime;

    // Auto-brake quando não há input linear
    const noLinearInput = modern ? !move : !input.up && !input.down;
    const speed = Math.hypot(this.ship.velocity.vx, this.ship.velocity.vy);

    if (noLinearInput) {
      this.driftFactor = Math.min(
        1,
        this.driftFactor + DRIFT_SETTINGS.rampSpeed * deltaTime
      );
    } else {
      this.driftFactor = Math.max(
        0,
        this.driftFactor - DRIFT_SETTINGS.decaySpeed * deltaTime
      );
    }

    const driftBrakeScale =
      1 - this.driftFactor * DRIFT_SETTINGS.brakeReduction;

    // Auto-damping thrusters (activate without manual input)
    if (noLinearInput && speed > 2) {
      const proj =
        this.ship.velocity.vx * fwd.x + this.ship.velocity.vy * fwd.y;
      const kBase = Math.max(
        0.35,
        Math.min(1, Math.abs(proj) / (this.maxSpeed * 0.8))
      );
      const k = kBase * driftBrakeScale;
      if (proj > 0) thrAux = Math.max(thrAux, k);
      else if (proj < 0) thrMain = Math.max(thrMain, k);
      if (modern) {
        // Coasting with the nose off the motion: brake the drift too.
        const lateral =
          this.ship.velocity.vx * right.x + this.ship.velocity.vy * right.y;
        const kLateral =
          Math.max(
            0.35,
            Math.min(1, Math.abs(lateral) / (this.maxSpeed * 0.8))
          ) * driftBrakeScale;
        if (lateral > 0) thrSideR = Math.max(thrSideR, kLateral);
        else if (lateral < 0) thrSideL = Math.max(thrSideL, kLateral);
      }
    }

    // Aplicar forças dos thrusters
    if (move) {
      // Along the WASD direction.
      const moveStep = accelStep * MODERN_MOVE_ACCEL;
      this.ship.velocity.vx += move.x * moveStep;
      this.ship.velocity.vy += move.y * moveStep;
    } else {
      if (thrMain > 0) {
        this.ship.velocity.vx += fwd.x * accelStep * thrMain;
        this.ship.velocity.vy += fwd.y * accelStep * thrMain;
      }
      if (thrAux > 0) {
        this.ship.velocity.vx -= fwd.x * accelStep * thrAux;
        this.ship.velocity.vy -= fwd.y * accelStep * thrAux;
      }
      if (modern) {
        const strafeStep = accelStep * MODERN_MOVE_ACCEL;
        this.ship.velocity.vx += right.x * strafeStep * (thrSideL - thrSideR);
        this.ship.velocity.vy += right.y * strafeStep * (thrSideL - thrSideR);
      }
    }

    // Amortecimento ambiente — FIX-02: split damping with conditional gate.
    // baseLinearDamping always applies; brakingDamping applies ONLY on frames
    // where no manual thrust input is active. This preserves the braking
    // upgrade's "Paradas mais rápidas" intent without making active flight
    // sluggish. The auto-damping thrusters (above) still fire during coast;
    // brakingDamping is the additive component layered on top of base.
    const effectiveDamping =
      (this.baseLinearDamping + (noManualThrust ? this.brakingDamping : 0)) *
      agility;
    // A dash carries its burst undamped, under a raised speed cap.
    if (!dashing) {
      const linearDamp = Math.exp(-effectiveDamping * deltaTime);
      this.ship.velocity.vx *= linearDamp;
      this.ship.velocity.vy *= linearDamp;
    }

    // Limitar velocidade máxima — after a dash the cap eases back down.
    const dashCapFraction = dashing
      ? 1
      : this.maneuvers.dashDecayTimer / DASH_DECAY_SECONDS;
    const dashCap =
      DASH_SPEED_CAP_MULTIPLIER * this.maneuvers.dashDistanceMultiplier;
    const speedCap = this.maxSpeed * (1 + (dashCap - 1) * dashCapFraction);
    const currentSpeed = Math.hypot(
      this.ship.velocity.vx,
      this.ship.velocity.vy
    );
    if (currentSpeed > speedCap) {
      const scale = speedCap / currentSpeed;
      this.ship.velocity.vx *= scale;
      this.ship.velocity.vy *= scale;
    }

    // === MOVIMENTO ANGULAR ===
    if (modern) {
      this.updateFacing(deltaTime, move);
    } else {
      // Restaurando a lógica de aceleração e amortecimento angular do app.js original
      const rotationAccel = this.rotationSpeed * deltaTime;
      let angularAccel = 0;
      if (thrSideR) angularAccel -= rotationAccel; // 'a' ou 'arrowleft'
      if (thrSideL) angularAccel += rotationAccel; // 'd' ou 'arrowright'

      this.ship.angularVelocity += angularAccel;

      // Amortecimento angular
      const angularDamp = Math.exp(-this.angularDamping * deltaTime);
      this.ship.angularVelocity *= angularDamp;

      // Limitar velocidade angular (clamp)
      const maxAng = this.rotationSpeed;
      if (this.ship.angularVelocity > maxAng)
        this.ship.angularVelocity = maxAng;
      if (this.ship.angularVelocity < -maxAng)
        this.ship.angularVelocity = -maxAng;
      this.ship.angle = wrapAngle(
        this.ship.angle + this.ship.angularVelocity * deltaTime
      );
    }

    // What the thrusters show and sound for this step.
    return {
      fwd,
      thrMain,
      thrAux,
      thrSideL,
      thrSideR,
      isMainManual,
      isAuxManual,
      isSideManual,
    };
  }

  // Modern scheme: nose onto the WASD direction, else onto the motion, else
  // hold. Exponential approach under a rate cap, so it never overshoots.
  updateFacing(deltaTime, move) {
    let heading = null;
    let rate = 0;
    if (move) {
      heading = Math.atan2(move.y, move.x);
      rate = SHIP_HEADING_TURN_RATE;
    } else if (
      Math.hypot(this.ship.velocity.vx, this.ship.velocity.vy) >
      SHIP_FACE_VELOCITY_MIN_SPEED
    ) {
      heading = Math.atan2(this.ship.velocity.vy, this.ship.velocity.vx);
      rate = SHIP_MOVE_TURN_RATE;
    }
    if (heading === null) {
      this.ship.angularVelocity = 0;
      return;
    }
    const maxStep = rate * deltaTime;
    const error = wrapAngle(heading - this.ship.angle);
    const step = Math.max(
      -maxStep,
      Math.min(
        maxStep,
        error * (1 - Math.exp(-SHIP_FACING_RESPONSE * deltaTime))
      )
    );
    this.ship.angle = wrapAngle(this.ship.angle + step);
    this.ship.angularVelocity = step / deltaTime;
  }
}
