// src/modules/player/flight.js
//
// How the hull flies: thrust and auto-braking from the move input in both
// schemes (modern: WASD on the screen axes, the nose turning onto the
// motion; classic: A/D rotate, W thrusts), damping, the speed cap a dash
// raises, and the flight stats the hull, the Hangar and the cards set.
// PlayerSystem owns one; its updateMovement runs this, then the turret, then
// the thruster events with the thrust this returns.

import {
  GLIDE_ACCEL_SCALE,
  GLIDE_LINEAR_DAMPING,
  GLIDE_RETRO_SHARE,
  GLIDE_SPEED_SCALE,
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
import { classicAsks, getModernMove, padForce } from './movementInput.js';

const DRIFT_SETTINGS = {
  rampSpeed: 2.8,
  decaySpeed: 5.2,
  brakeReduction: 0.4,
};

// Shown thrust only (proposta 15/11, the owner judges by playing): in the
// modern scheme the main flame is full within ~50° of the move, and the
// retro shows this much of a straight reversal.
const SHOWN_MAIN_GAIN = 1.6;
const SHOWN_RETRO_SHARE = 0.7;

const clamp01 = (value) => Math.max(0, Math.min(1, value));

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
   * `glide`: glide flight (?flight=glide) in either scheme: no auto-brake, light drag, a lower top speed.
   */
  constructor({ ship, maneuvers, glide = false }) {
    this.ship = ship;
    this.maneuvers = maneuvers;
    this.glide = glide;
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
    const glide = this.glide;
    const fwd = {
      x: Math.cos(this.ship.angle),
      y: Math.sin(this.ship.angle),
    };
    // Ship's starboard (screen y points down).
    const right = { x: -fwd.y, y: fwd.x };

    const move = modern ? getModernMove(input) : null;

    // The pilot's asks, 0..1 (classicAsks); modern, the left stick's lean is
    // the push along where it points, and the d-pad is full (a pad frame
    // whose right stick aims still moves at full push on the d-pad).
    const {
      up: thrustIn,
      down: backIn,
      left: leftIn,
      right: rightIn,
    } = classicAsks(input);
    const lean = Math.hypot(Number(input.moveX) || 0, Number(input.moveY) || 0);
    const moveForce = move && input.pad && lean > 0 ? padForce(input, lean) : 1;

    // The thrusters' forces (lógica do original); what they show is at the end.
    let thrMain = thrustIn;
    let thrAux = backIn * (glide ? GLIDE_RETRO_SHARE : 1);
    // Classic: torque. Modern: sideL pushes to starboard, sideR to port.
    let thrSideR = leftIn; // CCW torque
    let thrSideL = rightIn; // CW torque
    if (modern) {
      // Main push while moving (the hull turns onto the motion); side push
      // on the part of the move off the nose.
      const lateral = move ? move.x * right.x + move.y * right.y : 0;
      thrMain = move ? moveForce : 0;
      thrAux = 0;
      thrSideL = Math.max(0, lateral);
      thrSideR = Math.max(0, -lateral);
    }

    // The pilot's own thrust (the Reactor's idle bonus, the coast brake's arming).
    const isMainManual = modern ? Boolean(move) : thrustIn > 0;
    const isAuxManual = !modern && backIn > 0;
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
    const accelStep =
      this.acceleration * (glide ? GLIDE_ACCEL_SCALE : 1) * push * deltaTime;

    // Auto-brake quando não há input linear
    const noLinearInput = modern ? !move : !thrustIn && !backIn;
    const speed = Math.hypot(this.ship.velocity.vx, this.ship.velocity.vy);
    const velocityAlongNose =
      this.ship.velocity.vx * fwd.x + this.ship.velocity.vy * fwd.y;

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

    // Auto-damping thrusters (activate without manual input); glide has none.
    if (noLinearInput && speed > 2 && !glide) {
      const proj = velocityAlongNose;
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
      const moveStep = accelStep * MODERN_MOVE_ACCEL * moveForce;
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
      ((glide ? GLIDE_LINEAR_DAMPING : this.baseLinearDamping) +
        (noManualThrust ? this.brakingDamping : 0)) *
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
    const speedCap =
      this.maxSpeed *
      (glide ? GLIDE_SPEED_SCALE : 1) *
      (1 + (dashCap - 1) * dashCapFraction);
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
      // In glide the RCS System turns the hull quicker too: its pull and its
      // top turn rate (pull ÷ angular damping) both × agility.
      const rotationAccel =
        this.rotationSpeed * (glide ? this.agility : 1) * deltaTime;
      let angularAccel = 0;
      angularAccel -= rotationAccel * thrSideR; // 'a' ou 'arrowleft'
      angularAccel += rotationAccel * thrSideL; // 'd' ou 'arrowright'

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

    // What the thrusters show and sound for this step (thrusters.js): what
    // the pilot asked for, never the solver's corrections above.
    let pilotMain = thrustIn;
    let pilotAux = backIn;
    let pilotTurn = rightIn - leftIn;
    if (modern) {
      // Main flame once the nose is near the move, retro first on a reversal;
      // the turn jets follow the nose's own swing.
      const cos = move ? move.x * fwd.x + move.y * fwd.y : 0;
      pilotMain = clamp01(cos * SHOWN_MAIN_GAIN);
      pilotAux = clamp01(-cos) * SHOWN_RETRO_SHARE;
      pilotTurn = move
        ? Math.max(
            -1,
            Math.min(1, this.ship.angularVelocity / SHIP_HEADING_TURN_RATE)
          )
        : 0;
    }
    // The auto-brake, when it acts: + on the retro (moving nose-first), - on
    // the main engine, as strong as the speed is near the top. Glide has none
    // but the Braking System's, which shows the same way.
    const brakes = !glide || this.brakingDamping > 0;
    const coastBrake =
      noLinearInput && speed > 2 && brakes
        ? (velocityAlongNose < 0 ? -1 : 1) *
          clamp01(
            speed / (this.maxSpeed * (glide ? GLIDE_SPEED_SCALE : 1) * 0.8)
          )
        : 0;
    return {
      fwd,
      pilotMain,
      pilotAux,
      // Modern on a pad: the left stick's push (1 for keys, the d-pad and
      // touch); Classic's asks are already the push.
      pilotForce: modern ? moveForce : 1,
      pilotTurn,
      coastBrake,
      speed,
      dashing,
      isMainManual,
      isAuxManual,
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
