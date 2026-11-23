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
// - `?voo=c`, "o voo que fica" (Felipe, 22/11, after flying the steps): B from
//   the start, no drag at all ("o modo inicial, ele é o modo simulação"); each
//   braking and agility card the computer lighting jets for the pilot; the
//   Flight Computer the modern proposal 3, the turbo ("Eu gostei do Turbo"),
//   braking as firmly as today's hand; the main flame a burst off the line,
//   then a steady flame while the key holds ("não precisa ser esse jato da
//   explosão"). The spin keeps its momentum too (Felipe, 22/11: "quando a
//   gente solta, imediatamente ela para o giro"), worked off slowly from the
//   start, since the start's cannon is the nose (he flew it with none: "está
//   bem difícil"); the RCS System owns the spin, each level stopping it
//   firmer, the Braking System the travel (agreed with him, 22/11: "concordo,
//   faz assim", after "peguei um UCS e nao melhorou o giro"); the modern nose
//   swings with weight.
// - `?voo=e`: C whose travel slows slowly from the start too, as today's
//   start does, on the jets against the motion; for comparison only.
// The six jets every hull has: the main engine (forward), the retro (back), a
// flank's two side jets (the whole hull sideways) and a crossed pair (a turn).

import {
  GLIDE_ACCEL_SCALE,
  GLIDE_SPEED_SCALE,
  SHIP_ANGULAR_DAMPING,
  SHIP_FACE_VELOCITY_MIN_SPEED,
  SHIP_HEADING_TURN_RATE,
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
// `?voo=c`: its modern proposal; the main flame while the key holds at the
// top speed (where the engine no longer pushes); the modern auto-brake's
// force × B's, so a turbo run stops about as firmly as today's hand.
const STAYING_TRIAL = 3;
const CRUISE_FLAME = 0.35;
const STAYING_MODERN_BRAKE = 1.5;
// `?voo=c`'s modern nose: a spring onto the heading (s^-2 and its damping
// ratio, under 1 so it swings past and back), its push (rad/s²), all × the
// RCS System; capped at today's turn rate. With no heading, the spin is
// worked off at NOSE_STOP_ACCEL (× the RCS System's levels, squared).
const NOSE_STIFFNESS = 100;
const NOSE_DAMPING_RATIO = 0.55;
const NOSE_SPIN_ACCEL = 150;
const NOSE_STOP_ACCEL = 12;
// `?voo=c` classic: a released spin is worked off at SPIN_ASSIST (rad/s²)
// with no card, about 1.7 s from the top turn rate (Felipe, 22/11: "um pouco
// de assitencia desde o inicio, mas muito pouco"); with the RCS System, at
// this share of the turn pair's push × its level (the pair is already ×
// it): from half a second at level 1 to a fifth at 5, steadily, not snapped.
const SPIN_ASSIST = 0.75;
const SPIN_STOP_SHARE = 0.5;
// `?voo=e`: with no Braking System, the jets against the motion brake at this
// share of their push (about today's start's slow loss, ~0.2 naves/s²).
const TRAVEL_ASSIST_SHARE = 0.25;

/** C, and E beside it: the flight that stays. */
const isStayingFlight = (jets) => ['c', 'e'].includes(jets);

/**
 * `?voo=c`'s modern nose: onto the keys' direction, else onto the motion,
 * else the spin brought to a stop (the Braking System the Flight Computer
 * always comes with). Returns the spin's change this step (rad/s²).
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

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/** 'a', 'b', 'c' or 'e' from `?voo=`, else null (today's flight). */
export function jetsFromUrl() {
  try {
    const value = new URLSearchParams(window.location.search).get('voo');
    return ['a', 'b', 'c', 'e'].includes(value) ? value : null;
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

  // A modern proposal (modernTrial.js): its own cruise, and the flight
  // computer drawing more from the same jets.
  const staying = isStayingFlight(flight.jets);
  const travelAssist = flight.jets === 'e' && !(flight.brakingDamping > 0);
  const trial = modern
    ? MODERN_TRIALS[flight.modernTrial ?? (staying ? STAYING_TRIAL : null)]
    : null;
  // One main engine for both flights (the hull's and Main Thrusters'); the
  // Braking System's levels multiply the retro, the RCS System's the flanks.
  const main =
    flight.acceleration * GLIDE_ACCEL_SCALE * (trial ? trial.jets : 1);
  const braking =
    (flight.baseLinearDamping + flight.brakingDamping) /
    flight.baseLinearDamping;
  const forces = {
    main,
    retro: main * JET_RETRO_SHARE * braking,
    flank: main * JET_FLANK_SHARE * flight.agility,
  };
  // A modern proposal cruises at × the start's top speed.
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
      flight.brakingDamping > 0 ||
      travelAssist);

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
    reach =
      Math.max(BRAKE_FLOOR, Math.min(1, speed / (top * BRAKE_FULL_SHARE))) *
      (staying && modern ? STAYING_MODERN_BRAKE : 1) *
      (travelAssist && !modern ? TRAVEL_ASSIST_SHARE : 1);
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
  if (modern && staying) {
    const quick = flight.agility;
    spin = swingNose(ship, deltaTime, move, quick);
    spinShown = NOSE_SPIN_ACCEL * quick;
  } else if (modern) {
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
    const turn = asks.right - asks.left;
    let goal = turn * JET_TURN_TOP * flight.agility;
    let pair = spinShown;
    if (staying && !turn) {
      // Let go: the spin is worked off, slowly with no card, firmer with
      // each level of the RCS System.
      pair = Math.max(
        SPIN_ASSIST,
        flight.agility > 1 ? spinShown * SPIN_STOP_SHARE * flight.agility : 0
      );
    }
    spin = Math.max(
      -pair,
      Math.min(pair, (goal - ship.angularVelocity) / deltaTime)
    );
    ship.angularVelocity += spin * deltaTime;
    ship.angle = wrapAngle(ship.angle + ship.angularVelocity * deltaTime);
  }

  const shown = pilotShown(flight, move, fwd, asks);
  const pilotForce = modern ? moveForce : 1;
  // `?voo=c`: the flame holds while the key does, past the burst.
  if (staying) {
    jets.main = Math.max(
      jets.main,
      CRUISE_FLAME * shown.pilotMain * pilotForce
    );
  }
  return {
    fwd,
    ...shown,
    pilotForce,
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
