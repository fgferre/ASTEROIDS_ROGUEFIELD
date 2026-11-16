// src/bootstrap/botPilotGlide.js
//
// The playtest bot's classic glide: A/D turn the hull, W pushes along the
// nose, S pushes against it, nothing brakes by itself, and the cannon sits on
// the nose (?controls=classic&flight=glide&aim=nose). Where botPilot.js
// rolls the ship along 8 directions, this rolls it along key sequences (turn
// left / none / right × push forward / none / back) through the same
// physics the game runs (player/flight.js, read as numbers by
// botPilotAdapter.js into `world.ship.glide`), scores each path by the same
// danger and loot terms, and adds the one thing the new way of flying asks:
// the nose has to be turned onto a foe for the cannon to hit it.

import {
  DASH_DECAY_SECONDS,
  DASH_DURATION,
  DASH_INVULNERABILITY,
  DASH_SPEED_CAP_MULTIPLIER,
} from '../data/constants/gameplay.js';
import { intentScore, pathDanger } from './botPilot.js';

const AIM_WEIGHT = 7;
const DANGER_WEIGHT = 10;
const STEADY_BONUS = 0.15;
const TURN_COST = 0.04;
const PUSH_COST = 0.15;
// Extra px of clearance round the hull: turning and pushing are slow here.
const SAFETY_PAD = 35;
// A shot only counts as lined up within this many rad of the foe's edge.
const AIM_SLACK = 0.06;
// The foe it keeps aiming at is dropped once another is this much nearer (px).
const TARGET_STICK = 60;

/** The 9 key combinations: index = (turn + 1) × 3 + (push + 1). */
export const KEY_COMBOS = Object.freeze(
  Array.from({ length: 9 }, (_, i) =>
    Object.freeze({ turn: Math.floor(i / 3) - 1, push: (i % 3) - 1 })
  )
);
export const COAST = 4;

/** A, D, W, S held for a plan's key combination (none for null). */
export function glideKeys(index) {
  const combo = KEY_COMBOS[index];
  return {
    up: Boolean(combo && combo.push > 0),
    down: Boolean(combo && combo.push < 0),
    left: Boolean(combo && combo.turn < 0),
    right: Boolean(combo && combo.turn > 0),
  };
}

const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

// One step of the ship (player/flight.js's glide, A/D torque and W/S push),
// for the state { x, y, vx, vy, angle, spin, dashLeft, decayLeft }.
function step(world, state, combo, dt) {
  const { glide } = world.ship;
  const dashing = state.dashLeft > 0;
  if (combo.push) {
    const push = combo.push > 0 ? 1 : glide.retro;
    const accel = glide.accel * push * dt;
    state.vx += Math.cos(state.angle) * accel * Math.sign(combo.push);
    state.vy += Math.sin(state.angle) * accel * Math.sign(combo.push);
  }
  if (!dashing) {
    const keep = Math.exp(
      -(glide.damping + (combo.push ? 0 : glide.braking)) * dt
    );
    state.vx *= keep;
    state.vy *= keep;
  }
  const fraction = dashing
    ? 1
    : Math.max(0, state.decayLeft / DASH_DECAY_SECONDS);
  const cap = glide.maxSpeed * (1 + (DASH_SPEED_CAP_MULTIPLIER - 1) * fraction);
  const speed = Math.hypot(state.vx, state.vy);
  if (speed > cap) {
    state.vx *= cap / speed;
    state.vy *= cap / speed;
  }
  state.spin += combo.turn * glide.turn * dt;
  state.spin *= Math.exp(-glide.turnDamping * dt);
  state.spin = Math.max(-glide.turn, Math.min(glide.turn, state.spin));
  state.angle = wrapAngle(state.angle + state.spin * dt);
  state.x = (state.x + state.vx * dt + world.width) % world.width;
  state.y = (state.y + state.vy * dt + world.height) % world.height;
  if (dashing) {
    state.dashLeft -= dt;
    if (state.dashLeft <= 0) state.decayLeft = DASH_DECAY_SECONDS;
  } else {
    state.decayLeft = Math.max(0, state.decayLeft - dt);
  }
}

/**
 * The ship's path: `held` through the reaction delay, then `first` for the
 * first half of the horizon and `second` for the rest (with `dash`, a dash
 * along the nose, or against it while only the back key is down, as the
 * delay ends): [{ x, y, vx, vy, angle, t }], sampled `substeps` times.
 */
export function glideRollout(world, first, second, knobs, dash, held) {
  const { horizon, substeps } = knobs;
  const dt = world.ship.glide.step;
  const state = {
    x: world.ship.x,
    y: world.ship.y,
    vx: world.ship.vx,
    vy: world.ship.vy,
    angle: world.ship.angle,
    spin: world.ship.spin,
    dashLeft: 0,
    decayLeft: 0,
  };
  const lead = (knobs.reactionMs || 0) / 1000;
  const leadSteps = Math.round(lead / dt);
  for (let i = 0; i < leadSteps; i += 1) step(world, state, held, dt);
  if (dash) {
    const sign = first.push < 0 ? -1 : 1;
    state.vx += Math.cos(state.angle) * world.ship.dashImpulse * sign;
    state.vy += Math.sin(state.angle) * world.ship.dashImpulse * sign;
    state.dashLeft = DASH_DURATION;
  }
  const every = Math.max(1, Math.round(horizon / substeps / dt));
  const steps = every * substeps;
  const path = [];
  for (let i = 1; i <= steps; i += 1) {
    step(world, state, i <= steps / 2 ? first : second, dt);
    if (i % every === 0) {
      const { x, y, vx, vy, angle } = state;
      path.push({ x, y, vx, vy, angle, t: leadSteps * dt + i * dt });
    }
  }
  return path;
}

// The foe the cannon is meant for: the boss if there is one, else the
// nearest body that is not a bullet, kept while it is not clearly worse.
function chooseTarget(world, state) {
  const { x, y } = world.ship;
  const gapOf = (m) => Math.hypot(m.x - x, m.y - y) - m.radius;
  let best = null;
  let bestGap = Infinity;
  for (const m of world.movers) {
    if (m.kind === 'bullet') continue;
    const gap = gapOf(m) - (m.kind === 'boss' ? 400 : 0);
    if (gap < bestGap) {
      best = m;
      bestGap = gap;
    }
  }
  const kept = world.movers.find((m) => m.ref === state.target);
  if (kept && best && gapOf(kept) < bestGap + TARGET_STICK) best = kept;
  state.target = best?.ref ?? null;
  return best;
}

// How well the nose points at where the foe will be when the shot gets
// there, averaged over the path (0..1); a wide soft part pulls the turn.
function aimScore(world, path, target) {
  if (!target) return 0;
  const { reach } = world.ship;
  const { bulletSpeed } = world.ship.glide;
  let total = 0;
  for (const p of path) {
    const tx = target.x + target.vx * p.t;
    const ty = target.y + target.vy * p.t;
    const distance = Math.max(1, Math.hypot(tx - p.x, ty - p.y));
    const travel = distance / bulletSpeed;
    const bearing = Math.atan2(
      ty + target.vy * travel - p.y,
      tx + target.vx * travel - p.x
    );
    const off = Math.abs(wrapAngle(bearing - p.angle));
    const tolerance = Math.atan2(target.radius + 4, distance) + AIM_SLACK;
    const lined = Math.exp(-((off / tolerance) ** 2));
    const pull = (1 + Math.cos(off)) / 2;
    const inReach = distance - target.radius <= reach ? 1 : 0.3;
    total += inReach * (0.7 * lined + 0.3 * pull);
  }
  return total / path.length;
}

/**
 * One plan from `world` for the glide: { dir (a KEY_COMBOS index), dash,
 * shield, danger }. `previous` is the last plan's dir, held through the
 * reaction delay; `state` keeps the foe it aims at between plans.
 */
export function decideGlide(seen, knobs, previous = COAST, state = {}) {
  const world = {
    ...seen,
    ship: { ...seen.ship, radius: seen.ship.radius + SAFETY_PAD },
  };
  const { ship } = world;
  const safeUntil = ship.invulnerable || 0;
  const held = KEY_COMBOS[previous];
  const target = chooseTarget(world, state);
  // The shared loot, edge and firing-gap terms read the ship's push and drag.
  const intentWorld = {
    ...world,
    ship: {
      ...ship,
      acceleration: ship.glide.accel,
      damping: ship.glide.damping,
    },
  };
  let best = null;
  KEY_COMBOS.forEach((first, i) => {
    KEY_COMBOS.forEach((second, j) => {
      const path = glideRollout(world, first, second, knobs, false, held);
      const danger = pathDanger(world, path, knobs, safeUntil);
      const end = path.at(-1);
      let score = -DANGER_WEIGHT * danger.total;
      score += intentScore(intentWorld, end, ship, danger.total < 0.05);
      score += AIM_WEIGHT * aimScore(world, path, target);
      score -= TURN_COST * (Math.abs(first.turn) + Math.abs(second.turn));
      score -= PUSH_COST * (Math.abs(first.push) + Math.abs(second.push));
      if (i === previous && j === previous) score += STEADY_BONUS;
      if (!best || score > best.score) best = { index: i, score, danger };
    });
  });

  const plan = {
    dir: best.index,
    dash: false,
    shield: false,
    danger: best.danger,
  };
  if (best.danger.soon < 0.3) return plan;

  // About to be hit: a dash along (or against) the nose that gets clear.
  if (ship.dashReady) {
    let escape = null;
    KEY_COMBOS.forEach((first, i) => {
      KEY_COMBOS.forEach((second) => {
        const path = glideRollout(world, first, second, knobs, true, held);
        const danger = pathDanger(
          world,
          path,
          knobs,
          Math.max(
            safeUntil,
            (knobs.reactionMs || 0) / 1000 + DASH_INVULNERABILITY
          )
        );
        if (!escape || danger.total < escape.danger.total) {
          escape = { index: i, danger };
        }
      });
    });
    if (
      escape.danger.soon < 0.2 &&
      escape.danger.total < best.danger.total * 0.6
    ) {
      return {
        dir: escape.index,
        dash: true,
        shield: false,
        danger: escape.danger,
      };
    }
  }
  if (ship.shieldReady && best.danger.soon >= 0.7) plan.shield = true;
  return plan;
}
