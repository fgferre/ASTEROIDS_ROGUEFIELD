// src/modules/player/jetFlight.js
//
// Felipe's one flight algorithm (21/11: "A nave ela é movimentada porque está
// ligado um thruster [...] de acordo com os thrusters que já existem hoje na
// nave"), flown beside today's flight by the address. PROPOSTA 22/11, the
// owner judges by flying:
// - `?voo=a`: today's motion, and each step the jets that make it light up,
//   as strong as they push (the drag, the speed cap and the nose's own turn
//   included); flight.js runs as today and showNetJets reads what it did.
// - `?voo=b`: the jets alone move and turn the ship, each within its own force
//   (flyByJets): no drag, the top speed a rule of the flight computer, the
//   brake the jets that point against the motion until the ship stops.
// The six jets every hull has: the main engine (forward), the retro (back), a
// flank's two side jets (the whole hull sideways) and a crossed pair (a turn).

import {
  GLIDE_ACCEL_SCALE,
  GLIDE_SPEED_SCALE,
  SHIP_ANGULAR_DAMPING,
  SHIP_ROTATION_SPEED,
} from '../../data/constants/physics.js';
import {
  DASH_DECAY_SECONDS,
  DASH_SPEED_CAP_MULTIPLIER,
} from '../../data/constants/gameplay.js';
import { pilotShown, wrapAngle } from './flight.js';
import { classicAsks, getModernMove, padForce } from './movementInput.js';
import { MODERN_TRIALS, turboScale } from './modernTrial.js';

// B: the retro and a flank's pair each push this share of the main engine;
// the Braking System multiplies the retro, the RCS System the side jets.
export const JET_RETRO_SHARE = 0.5;
export const JET_FLANK_SHARE = 0.5;
// B classic: the turn pair spins the hull up and back down at this (rad/s²),
// to today's top turn rate (≈70°/s); the RCS System multiplies both. At 4 a
// released turn coasts ~12° more, as today's.
export const JET_TURN_ACCEL = 4;
export const JET_TURN_TOP = SHIP_ROTATION_SPEED / SHIP_ANGULAR_DAMPING;
// B modern: the flight computer's cruise, × max speed (today's drag held the
// ship near 88 of 220).
export const MODERN_TOP_SHARE = 0.4;
// B auto-brake: full push above this share of the top speed; slower, ever
// gentler, never under BRAKE_FLOOR of it, until the ship stops.
const BRAKE_FULL_SHARE = 0.5;
const BRAKE_FLOOR = 0.5;
// The modern nose turns by the flight computer at today's rate; its turn
// pair shows full at this spin-up (rad/s²).
const MODERN_TURN_SHOWN = 60;

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/** 'a' or 'b' from `?voo=`, else null (today's flight). */
export function jetsFromUrl() {
  try {
    const value = new URLSearchParams(window.location.search).get('voo');
    return value === 'a' || value === 'b' ? value : null;
  } catch {
    return null; // no window (Node tests)
  }
}

/**
 * Each jet's share of `forces` (px/s²: main, retro, flank) giving the push
 * `ax` along the nose and `ay` to starboard: the retro pushes aft, the port
 * flank's pair to starboard, the starboard pair to port.
 */
export function jetShares(ax, ay, forces) {
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
export function withinJets(ax, ay, forces) {
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

/**
 * `?voo=a`: the jets that made this step's change of motion, from the
 * velocity and spin `before` it. `fwd`/`right`: the hull's axes at its start.
 */
export function showNetJets(flight, before, deltaTime, fwd, right, input) {
  const { ship } = flight;
  const modern = ship.controlScheme === 'modern';
  const dvx = (ship.velocity.vx - before.vx) / deltaTime;
  const dvy = (ship.velocity.vy - before.vy) / deltaTime;
  const ax = dvx * fwd.x + dvy * fwd.y;
  const ay = dvx * right.x + dvy * right.y;
  // Shown against the main engine's full push (retro and flanks alike).
  const engine = flight.acceleration * (flight.glide ? GLIDE_ACCEL_SCALE : 1);
  const jets = jetShares(ax, ay, {
    main: engine,
    retro: engine,
    flank: engine,
  });
  const spin = (ship.angularVelocity - before.w) / deltaTime;
  const turnShown = modern
    ? MODERN_TURN_SHOWN
    : flight.rotationSpeed * (flight.glide ? flight.agility : 1);
  mergeJets(jets, maneuverJets(flight.maneuvers, fwd, right));
  return {
    ...jets,
    turn: Math.max(-1, Math.min(1, spin / turnShown)),
    ...pilotFlags(modern, getModernMove(input), classicAsks(input)),
  };
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

/**
 * `?voo=b`: one step of flight by the jets' own forces. Returns the step
 * PlayerFlight.updateMovement returns, with `jets` for what lights up.
 */
export function flyByJets(flight, deltaTime, input) {
  const { ship, maneuvers } = flight;
  const modern = ship.controlScheme === 'modern';
  const fwd = { x: Math.cos(ship.angle), y: Math.sin(ship.angle) };
  const right = { x: -fwd.y, y: fwd.x };
  const asks = classicAsks(input);
  const move = modern ? getModernMove(input) : null;
  const lean = Math.hypot(Number(input.moveX) || 0, Number(input.moveY) || 0);
  const moveForce = move && input.pad && lean > 0 ? padForce(input, lean) : 1;
  const dashing = maneuvers.dashTimer > 0;
  const easing = dashing || maneuvers.dashDecayTimer > 0;

  // One main engine for both flights (the hull's and Main Thrusters'); the
  // Braking System's levels multiply the retro, the RCS System's the flanks.
  const main = flight.acceleration * GLIDE_ACCEL_SCALE;
  const braking =
    (flight.baseLinearDamping + flight.brakingDamping) /
    flight.baseLinearDamping;
  const forces = {
    main,
    retro: main * JET_RETRO_SHARE * braking,
    flank: main * JET_FLANK_SHARE * flight.agility,
  };
  // A modern proposal (modernTrial.js) cruises at × the start's top speed.
  const trial = modern ? MODERN_TRIALS[flight.modernTrial] : null;
  const top =
    flight.maxSpeed *
    (trial
      ? GLIDE_SPEED_SCALE *
        trial.top *
        turboScale(flight, trial, move, deltaTime)
      : modern
        ? MODERN_TOP_SHARE
        : GLIDE_SPEED_SCALE);

  const v = ship.velocity;
  const speed = Math.hypot(v.vx, v.vy);
  const isMainManual = modern ? Boolean(move) : asks.up > 0;
  const isAuxManual = !modern && asks.down > 0;
  const noLinearInput = modern ? !move : !asks.up && !asks.down;
  // The auto-brake: modern always (not a proposal that keeps its momentum);
  // else with the Braking System (glide's start has none: stopping is the
  // pilot's).
  const autoBrake =
    noLinearInput &&
    speed > 0 &&
    ((trial ? trial.coastBrake : modern || !flight.glide) ||
      flight.brakingDamping > 0);

  // The push wanted, world px/s².
  let wantX = 0;
  let wantY = 0;
  let reach = 1;
  if (easing) {
    // A dash and its ease-off fly as today; the jets show the maneuver.
  } else if (modern && move && (!trial || trial.coastBrake)) {
    // The flight computer flies the ship onto the stick's velocity.
    wantX = (move.x * top * moveForce - v.vx) / deltaTime;
    wantY = (move.y * top * moveForce - v.vy) / deltaTime;
  } else if (autoBrake) {
    wantX = -v.vx / deltaTime;
    wantY = -v.vy / deltaTime;
    reach = Math.max(
      BRAKE_FLOOR,
      Math.min(1, speed / (top * BRAKE_FULL_SHARE))
    );
  } else if (!modern || move) {
    // The pilot's push: classic along the nose; a modern proposal that keeps
    // its momentum along the keys.
    const push = modern
      ? forces.main * moveForce
      : asks.up * forces.main - asks.down * forces.retro;
    const way = modern ? move : fwd;
    wantX = way.x * push;
    wantY = way.y * push;
    // The flight computer never pushes past the top speed; the rest of the
    // push still bends the path.
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

  // A dash lifts the cap as today, which eases back to the top speed.
  const dashCapFraction = dashing
    ? 1
    : maneuvers.dashDecayTimer / DASH_DECAY_SECONDS;
  const dashTop =
    flight.maxSpeed *
    (flight.glide ? GLIDE_SPEED_SCALE : 1) *
    DASH_SPEED_CAP_MULTIPLIER *
    maneuvers.dashDistanceMultiplier;
  const cap = top + Math.max(0, dashTop - top) * dashCapFraction;
  // Above it (the dash easing off, a knock), the jets against the motion
  // burn at full.
  const after = Math.hypot(v.vx, v.vy);
  if (after > cap) {
    const ax = -(v.vx * fwd.x + v.vy * fwd.y) / after;
    const ay = -(v.vx * right.x + v.vy * right.y) / after;
    const most = Math.max(Math.abs(ax), Math.abs(ay));
    mergeJets(
      jets,
      jetShares(ax / most, ay / most, { main: 1, retro: 1, flank: 1 })
    );
    v.vx *= cap / after;
    v.vy *= cap / after;
  }
  mergeJets(jets, maneuverJets(maneuvers, fwd, right));

  let spin;
  let spinShown;
  if (modern) {
    // The nose turns as today (the classic pair would take over a second
    // to swing it 90°); the pair shows the push that takes.
    const w = ship.angularVelocity;
    flight.updateFacing(deltaTime, move, trial ? flight.agility : 1);
    spin = (ship.angularVelocity - w) / deltaTime;
    spinShown = MODERN_TURN_SHOWN;
  } else {
    // The pilot's turn to the pair's top rate; let go, the pair on the other
    // side stops it.
    spinShown = JET_TURN_ACCEL * flight.agility;
    const goal = (asks.right - asks.left) * JET_TURN_TOP * flight.agility;
    spin = Math.max(
      -spinShown,
      Math.min(spinShown, (goal - ship.angularVelocity) / deltaTime)
    );
    ship.angularVelocity += spin * deltaTime;
    ship.angle = wrapAngle(ship.angle + ship.angularVelocity * deltaTime);
  }

  return {
    fwd,
    ...pilotShown(flight, move, fwd, asks),
    pilotForce: modern ? moveForce : 1,
    brake: { aux: 0, main: 0, starboard: 0, port: 0 },
    speed,
    dashing,
    isMainManual,
    isAuxManual,
    jets: {
      ...jets,
      turn: Math.max(-1, Math.min(1, spin / spinShown)),
      ...pilotFlags(modern, move, asks),
    },
  };
}
