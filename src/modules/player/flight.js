// src/modules/player/flight.js
//
// How the hull flies: one algorithm, the jets the hull already has (Felipe,
// 21/11: "A nave ela é movimentada porque está ligado um thruster [...] de
// acordo com os thrusters que já existem hoje na nave"; flown and kept 22/11:
// "Ficou bom: o voo que fica"). The six jets: the main engine (forward), the
// retro (back), a flank's two side jets (the whole hull sideways) and a
// crossed pair (a turn). Every change of motion is a jet that shows.
// - The start (classic, gliding): a simulation, no drag ("o modo inicial, ele é
//   o modo simulação"). W and S fire the main engine and the retro; let go,
//   the ship keeps its speed until the pilot stops it. A released spin keeps
//   its momentum, worked off slowly ("um pouco de assitencia desde o inicio,
//   mas muito pouco").
// - The cards are the computer lighting jets for the pilot: the Braking System
//   stops the travel when the keys let go (and strengthens the retro), the RCS
//   System stops the spin, firmer each level (and strengthens the side jets),
//   Main Thrusters is the engine and its top speed.
// - The Flight Computer: modern flight with the turbo ("Eu gostei do Turbo"):
//   the computer flies the ship onto the keys' velocity, 1.2× the start's top
//   speed, a straight run building up to 1.4× that; it draws 1.5× from the
//   same jets and brakes 1.5× firmer still; the nose swings with weight.
// - The main flame: a burst off the line, then a steady third while the key
//   holds ("Assim, um terço do estouro").
// PlayerSystem owns one; its updateMovement runs this, then the turret, then
// the thruster events with the step this returns. The playtest bot's start
// (bootstrap/botPilotGlide.js) plans with the exported numbers.

import {
  GLIDE_ACCEL_SCALE,
  GLIDE_SPEED_SCALE,
  SHIP_ACCELERATION,
  SHIP_ANGULAR_DAMPING,
  SHIP_FACE_VELOCITY_MIN_SPEED,
  SHIP_HEADING_TURN_RATE,
  SHIP_LINEAR_DAMPING,
  SHIP_MAX_SPEED,
  SHIP_ROTATION_SPEED,
} from '../../data/constants/physics.js';
import {
  DASH_DECAY_SECONDS,
  DASH_SPEED_CAP_MULTIPLIER,
} from '../../data/constants/gameplay.js';
import { classicAsks, getModernMove, padForce } from './movementInput.js';

// The retro and a flank's pair each push this share of the main engine; the
// Braking System multiplies the retro, the RCS System the side jets.
export const RETRO_SHARE = 0.5;
const FLANK_SHARE = 0.5;
// Classic: the turn pair spins the hull up and back down at this (rad/s²), to
// the top turn rate (≈70°/s); the RCS System multiplies both.
export const TURN_ACCEL = 4;
export const TURN_TOP = SHIP_ROTATION_SPEED / SHIP_ANGULAR_DAMPING;
// A released classic spin is worked off at SPIN_ASSIST (rad/s²) with no card,
// about 1.7 s from the top turn rate; with the RCS System, at this share of
// the turn pair's push × its level (the pair is already × it): from half a
// second at level 1 to a fifth at 5, steadily, not snapped.
export const SPIN_ASSIST = 0.75;
export const SPIN_STOP_SHARE = 0.5;
// The auto-brake: full push above this share of the top speed; slower, ever
// gentler, never under BRAKE_FLOOR of it, until the ship stops.
export const BRAKE_FULL_SHARE = 0.5;
export const BRAKE_FLOOR = 0.5;
// The Flight Computer: its cruise × the start's top speed; the turbo × that;
// the jets' force and the auto-brake's, × the start's.
const MODERN_TOP = 1.2;
const TURBO = 1.4;
const MODERN_JETS = 1.5;
const MODERN_BRAKE = 1.5;
// Turbo: from nothing to full over this (s) while the keys hold one way; it
// fades over TURBO_FADE_S when they let go or turn more than TURBO_TURN off.
const TURBO_RAMP_S = 1.2;
const TURBO_FADE_S = 0.4;
// (less a hair, so W then W+D, exactly 45°, keeps it).
const TURBO_TURN = Math.cos(Math.PI / 4) - 1e-9;
// The modern nose: a spring onto the heading (s^-2 and its damping ratio,
// under 1 so it swings past and back), its push (rad/s²), all × the RCS
// System; capped at the heading turn rate. With no heading, the spin is worked
// off at NOSE_STOP_ACCEL (× the RCS System's level, squared).
const NOSE_STIFFNESS = 100;
const NOSE_DAMPING_RATIO = 0.55;
const NOSE_SPIN_ACCEL = 150;
const NOSE_STOP_ACCEL = 12;
// Over the cap by less than this (px/s, a sideways push at the top speed
// nudges it by a hair), the speed is trimmed with no jet shown.
const CAP_SHOWN_OVER = 1;
// The main flame while the key holds at the top speed, where the engine no
// longer pushes.
const CRUISE_FLAME = 0.35;
// Modern: the main flame is full within ~50° of the move (the pilot's own
// burn, which the trail cards drop on).
const SHOWN_MAIN_GAIN = 1.6;

const clamp01 = (value) => Math.max(0, Math.min(1, value));

// The same heading within -π..π (the player's angles and the turret's).
export function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

/**
 * Each jet's share of `forces` (px/s²: main, retro, flank) giving the push
 * `ax` along the nose and `ay` to starboard: the retro pushes aft, the port
 * flank's pair to starboard, the starboard pair to port.
 */
function jetShares(ax, ay, forces) {
  return {
    main: ax > 0 ? clamp01(ax / forces.main) : 0,
    aux: ax < 0 ? clamp01(-ax / forces.retro) : 0,
    toStarboard: ay > 0 ? clamp01(ay / forces.flank) : 0,
    toPort: ay < 0 ? clamp01(-ay / forces.flank) : 0,
  };
}

/**
 * The part of the push (`ax`, `ay`, hull frame) the jets can give: the whole
 * push shrinks together, so it keeps its direction.
 */
function withinJets(ax, ay, forces) {
  let scale = 1;
  if (ax !== 0) {
    scale = Math.min(
      scale,
      (ax > 0 ? forces.main : forces.retro) / Math.abs(ax)
    );
  }
  if (ay !== 0) scale = Math.min(scale, forces.flank / Math.abs(ay));
  return { ax: ax * scale, ay: ay * scale };
}

function mergeJets(jets, more) {
  if (!more) return jets;
  ['main', 'aux', 'toStarboard', 'toPort'].forEach((key) => {
    jets[key] = Math.max(jets[key], more[key]);
  });
  return jets;
}

// A dash and the emergency brake's stop keep their own push (gameplay.js,
// maneuvers.js); they show at full on the jets pointing their way.
function maneuverJets(maneuvers, fwd, right) {
  let x;
  let y;
  if (maneuvers.dashTimer > 0 && maneuvers.dashDirection) {
    ({ x, y } = maneuvers.dashDirection);
  } else if (maneuvers.brakeTimer > 0 && maneuvers.brakeFrom) {
    x = -maneuvers.brakeFrom.vx;
    y = -maneuvers.brakeFrom.vy;
  } else {
    return null;
  }
  const ax = x * fwd.x + y * fwd.y;
  const ay = x * right.x + y * right.y;
  const most = Math.max(Math.abs(ax), Math.abs(ay)) || 1;
  return jetShares(ax / most, ay / most, { main: 1, retro: 1, flank: 1 });
}

// Which jets the pilot's own keys or stick lit (they sound louder); the rest
// are the brake's and the flight computer's.
function pilotFlags(modern, move, { up, down, left, right }) {
  return {
    mainAuto: modern ? !move : !up,
    auxAuto: modern ? !move : !down,
    sideAuto: !(modern && move),
    turnAuto: modern ? !move : !left && !right,
  };
}

// The classic turn pair's push stopping a released spin (rad/s²): slowly
// with no card, firmer with each level of the RCS System (`agility`).
function spinStop(agility) {
  return Math.max(
    SPIN_ASSIST,
    agility > 1 ? TURN_ACCEL * agility * SPIN_STOP_SHARE * agility : 0
  );
}

/**
 * How far (rad, signed) a classic spin `spin` still turns if the pilot turns
 * against it now (the turn pair, × the RCS System's `agility`): the touch
 * controls' "aponta" mode counter-steers from there.
 */
export function spinCoast(spin, agility = 1) {
  return (Math.sign(spin) * spin * spin) / (2 * TURN_ACCEL * agility);
}

/**
 * The modern nose: onto the keys' direction, else onto the motion, else the
 * spin brought to a stop. Returns the spin's change this step (rad/s²).
 */
function swingNose(ship, deltaTime, move, quick) {
  const v = ship.velocity;
  let heading = null;
  if (move) heading = Math.atan2(move.y, move.x);
  else if (Math.hypot(v.vx, v.vy) > SHIP_FACE_VELOCITY_MIN_SPEED) {
    heading = Math.atan2(v.vy, v.vx);
  }
  const stiffness = NOSE_STIFFNESS * quick;
  const w = ship.angularVelocity;
  let spin;
  if (heading === null) {
    const stop = NOSE_STOP_ACCEL * quick * quick;
    spin = -Math.sign(w) * Math.min(Math.abs(w) / deltaTime, stop);
  } else {
    const most = NOSE_SPIN_ACCEL * quick;
    const pull =
      stiffness * wrapAngle(heading - ship.angle) -
      2 * NOSE_DAMPING_RATIO * Math.sqrt(stiffness) * w;
    spin = Math.max(-most, Math.min(most, pull));
  }
  const top = SHIP_HEADING_TURN_RATE * quick;
  ship.angularVelocity = Math.max(
    -top,
    Math.min(top, ship.angularVelocity + spin * deltaTime)
  );
  ship.angle = wrapAngle(ship.angle + ship.angularVelocity * deltaTime);
  return spin;
}

export class PlayerFlight {
  /**
   * `ship`: the player's velocity, angle, angularVelocity and controlScheme, read and set live.
   * `maneuvers`: the player's PlayerManeuvers; a dash in progress or easing off lifts the speed cap.
   * `glide`: the start's classic flight (true until the Flight Computer).
   */
  constructor({ ship, maneuvers, glide = false }) {
    this.ship = ship;
    this.maneuvers = maneuvers;
    this.glide = glide;
    // The turbo's charge (0..1) and the direction it builds along.
    this.turbo = 0;
    this.turboDir = null;

    // === CONFIGURAÇÕES DE MOVIMENTO ===
    this.maxSpeed = SHIP_MAX_SPEED;
    this.acceleration = SHIP_ACCELERATION;
    // RCS System's level (1: none): × the side jets and the turn.
    this.agility = 1;
    // The Braking System's level: (base + braking) ÷ base × the retro, and
    // with any level the auto-brake on the travel.
    this.baseLinearDamping = SHIP_LINEAR_DAMPING;
    this.brakingDamping = 0;
  }

  // The combined total, for readers of the old shape (snapshot, tooltip).
  get linearDamping() {
    return this.baseLinearDamping + this.brakingDamping;
  }

  // The turbo's multiplier this step (`move`: the keys' unit direction or null).
  turboScale(move, deltaTime) {
    const held =
      move &&
      this.turboDir &&
      move.x * this.turboDir.x + move.y * this.turboDir.y >= TURBO_TURN;
    if (held) {
      this.turbo = Math.min(1, this.turbo + deltaTime / TURBO_RAMP_S);
    } else {
      this.turbo = Math.max(0, this.turbo - deltaTime / TURBO_FADE_S);
      if (move && this.turbo === 0) this.turboDir = move;
    }
    return 1 + (TURBO - 1) * this.turbo;
  }

  /**
   * One step of flight by the jets. Returns what the thrusters show
   * (thrusters.js): `jets`, each jet's push 0..1 and who lit it; `pilotMain`
   * × `pilotForce`, the pilot's own main burn the trail cards drop on.
   */
  updateMovement(deltaTime, input) {
    const { ship, maneuvers } = this;
    const modern = ship.controlScheme === 'modern';
    const fwd = { x: Math.cos(ship.angle), y: Math.sin(ship.angle) };
    const right = { x: -fwd.y, y: fwd.x };
    const asks = classicAsks(input);
    const move = modern ? getModernMove(input) : null;
    const lean = Math.hypot(Number(input.moveX) || 0, Number(input.moveY) || 0);
    const moveForce = move && input.pad && lean > 0 ? padForce(input, lean) : 1;
    const dashing = maneuvers.dashTimer > 0;
    const easing = dashing || maneuvers.dashDecayTimer > 0;

    // One main engine (the hull's and Main Thrusters'), the Flight Computer
    // drawing more from it; the Braking System's levels multiply the retro,
    // the RCS System's the flanks.
    const main =
      this.acceleration * GLIDE_ACCEL_SCALE * (modern ? MODERN_JETS : 1);
    const braking =
      (this.baseLinearDamping + this.brakingDamping) / this.baseLinearDamping;
    const forces = {
      main,
      retro: main * RETRO_SHARE * braking,
      flank: main * FLANK_SHARE * this.agility,
    };
    const top =
      this.maxSpeed *
      (modern
        ? GLIDE_SPEED_SCALE * MODERN_TOP * this.turboScale(move, deltaTime)
        : GLIDE_SPEED_SCALE);

    const v = ship.velocity;
    const speed = Math.hypot(v.vx, v.vy);
    const isMainManual = modern ? Boolean(move) : asks.up > 0;
    const isAuxManual = !modern && asks.down > 0;
    const noLinearInput = modern ? !move : !asks.up && !asks.down;
    // The auto-brake: the Flight Computer's always; the start's with the
    // Braking System (without it, stopping is the pilot's).
    const autoBrake =
      noLinearInput && speed > 0 && (modern || this.brakingDamping > 0);

    // The push wanted, world px/s².
    let wantX = 0;
    let wantY = 0;
    let reach = 1;
    if (easing) {
      // A dash and its ease-off fly on their own; the jets show the maneuver.
    } else if (modern && move) {
      // The flight computer flies the ship onto the stick's velocity.
      wantX = (move.x * top * moveForce - v.vx) / deltaTime;
      wantY = (move.y * top * moveForce - v.vy) / deltaTime;
    } else if (autoBrake) {
      wantX = -v.vx / deltaTime;
      wantY = -v.vy / deltaTime;
      reach =
        Math.max(BRAKE_FLOOR, Math.min(1, speed / (top * BRAKE_FULL_SHARE))) *
        (modern ? MODERN_BRAKE : 1);
    } else if (!modern) {
      const push = asks.up * forces.main - asks.down * forces.retro;
      wantX = fwd.x * push;
      wantY = fwd.y * push;
      // The engine never pushes past the top speed; the rest of the push still
      // bends the path.
      if (speed > 0) {
        const along = (wantX * v.vx + wantY * v.vy) / speed;
        const room = Math.max(0, (top - speed) / deltaTime);
        if (along > room) {
          wantX -= ((along - room) * v.vx) / speed;
          wantY -= ((along - room) * v.vy) / speed;
        }
      }
    }

    const given = withinJets(
      wantX * fwd.x + wantY * fwd.y,
      wantX * right.x + wantY * right.y,
      {
        main: forces.main * reach,
        retro: forces.retro * reach,
        flank: forces.flank * reach,
      }
    );
    v.vx += (fwd.x * given.ax + right.x * given.ay) * deltaTime;
    v.vy += (fwd.y * given.ax + right.y * given.ay) * deltaTime;
    const jets = jetShares(given.ax, given.ay, forces);

    // A dash lifts the cap, which eases back to the top speed.
    const dashCapFraction = dashing
      ? 1
      : maneuvers.dashDecayTimer / DASH_DECAY_SECONDS;
    const dashTop =
      this.maxSpeed *
      (this.glide ? GLIDE_SPEED_SCALE : 1) *
      DASH_SPEED_CAP_MULTIPLIER *
      maneuvers.dashDistanceMultiplier;
    const cap = top + Math.max(0, dashTop - top) * dashCapFraction;
    // Above it (the dash easing off, a knock), the jets against the motion
    // burn at full.
    const after = Math.hypot(v.vx, v.vy);
    if (after > cap + CAP_SHOWN_OVER) {
      const ax = -(v.vx * fwd.x + v.vy * fwd.y) / after;
      const ay = -(v.vx * right.x + v.vy * right.y) / after;
      const most = Math.max(Math.abs(ax), Math.abs(ay));
      mergeJets(
        jets,
        jetShares(ax / most, ay / most, { main: 1, retro: 1, flank: 1 })
      );
    }
    if (after > cap) {
      v.vx *= cap / after;
      v.vy *= cap / after;
    }
    mergeJets(jets, maneuverJets(maneuvers, fwd, right));

    let spin;
    let spinShown;
    if (modern) {
      spin = swingNose(ship, deltaTime, move, this.agility);
      spinShown = NOSE_SPIN_ACCEL * this.agility;
    } else {
      // The pilot's turn to the pair's top rate; let go, the spin is worked
      // off, slowly with no card, firmer with each level of the RCS System.
      spinShown = TURN_ACCEL * this.agility;
      const turn = asks.right - asks.left;
      const goal = turn * TURN_TOP * this.agility;
      const pair = turn ? spinShown : spinStop(this.agility);
      spin = Math.max(
        -pair,
        Math.min(pair, (goal - ship.angularVelocity) / deltaTime)
      );
      ship.angularVelocity += spin * deltaTime;
      ship.angle = wrapAngle(ship.angle + ship.angularVelocity * deltaTime);
    }

    // The pilot's own main burn: classic, W; modern, the keys once the nose is
    // near them. The flame holds a third of the burst while the key does.
    const pilotForce = modern ? moveForce : 1;
    const pilotMain = modern
      ? clamp01((move ? move.x * fwd.x + move.y * fwd.y : 0) * SHOWN_MAIN_GAIN)
      : asks.up;
    jets.main = Math.max(jets.main, CRUISE_FLAME * pilotMain * pilotForce);
    return {
      fwd,
      pilotMain,
      pilotForce,
      isMainManual,
      isAuxManual,
      jets: {
        ...jets,
        turn: Math.max(-1, Math.min(1, spin / spinShown)),
        ...pilotFlags(modern, move, asks),
      },
    };
  }
}
