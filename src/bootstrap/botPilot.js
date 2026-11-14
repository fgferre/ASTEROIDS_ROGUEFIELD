// src/bootstrap/botPilot.js
//
// The playtest bot: a pilot that flies like a person, by an algorithm. It
// reads only what a player sees on the screen (positions, velocities, radii,
// telegraph shapes and their timers, a boss's open plates) from a plain
// `world` snapshot (botPilotAdapter.js builds it from the running systems),
// and returns the keys to hold. No DOM, no game services.
//
// Each plan it rolls the ship forward along the 8 key directions and
// standing still, scores each path (danger along it, loot, a firing
// distance, a boss's open side), picks the best, and dashes or raises the
// shield when a hit looks close. Its skill is a few named knobs (PRESETS).

import RandomService from '../core/RandomService.js';
import {
  DASH_DURATION,
  DASH_INVULNERABILITY,
  DASH_SPEED_CAP_MULTIPLIER,
} from '../data/constants/gameplay.js';
import { cageFences } from '../modules/enemies/types/SentinelInterdictor.js';

/**
 * The bot's skill. `reactionMs`: a plan acts this long after the world it
 * read. `horizon`: seconds each candidate path is rolled ahead, sampled at
 * `substeps` points. `planHz`: plans per second. `miss`: the chance a newly
 * seen hazard goes unnoticed for `missFor` seconds.
 */
export const PRESETS = Object.freeze({
  average: Object.freeze({
    reactionMs: 250,
    horizon: 0.7,
    substeps: 5,
    planHz: 8,
    miss: 0.15,
    missFor: 0.6,
  }),
  good: Object.freeze({
    reactionMs: 120,
    horizon: 1.0,
    substeps: 8,
    planHz: 12,
    miss: 0.02,
    missFor: 0.3,
  }),
});

// px past a hazard's edge over which its danger fades from 1 to 0.
const MARGIN = 14;
// A warning counts this many seconds before its timer runs out.
const EARLY = 0.08;
// Seconds ahead that count as "about to be hit" (dash, shield).
const CLOSE = 0.25;
const ROLL_DT = 1 / 30;
// Score weights.
const DANGER_WEIGHT = 10;
const LOOT_WEIGHT = 1.2;
const RANGE_WEIGHT = 0.6;
const BEHIND_WEIGHT = 0.5;
const STEADY_BONUS = 0.15;
const MOVE_WEIGHT = 0.3;
const EDGE_WEIGHT = 0.6;
const EDGE_GAP = 70; // px from a field edge where it starts to count
// The end of a path is checked this many seconds later too, at this weight.
const TAIL = [0.4, 0.8];
const TAIL_WEIGHT = 0.5;
// Loot farther than this is not worth a detour (px).
const LOOT_REACH = 360;
// Where the turret works well: this far past a foe's edge (px).
const FIRING_GAP = 170;
const OPEN_GAP = 110;
// Rough reach of a boss's slag-like hazards not given in their telegraph.
const LINE_HALF = 7; // a solid barrier or fence, half its drawn thickness
const SHOT_HALF = 8; // a marksman's shot along its aim line
const ROCK_HALF = 18; // an ejected rock along its line
const FAN_REACH = 420; // a spread volley flies at least this far
const ARM_SWING = (50 * Math.PI) / 180; // a warned arm swings about this far
const MOUTH_REACH = 50; // the Quarry Maw's open mouth hurts within this

const S = Math.SQRT1_2;
/** The 8 key directions and standing still (index 0), screen axes, y down. */
export const DIRECTIONS = Object.freeze([
  null,
  { x: 0, y: -1 },
  { x: S, y: -S },
  { x: 1, y: 0 },
  { x: S, y: S },
  { x: 0, y: 1 },
  { x: -S, y: S },
  { x: -1, y: 0 },
  { x: -S, y: -S },
]);

// --- geometry -------------------------------------------------------------

const wrapDelta = (d, size) => d - size * Math.round(d / size);

function wrapAngle(angle) {
  const a = (((angle + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return a - Math.PI;
}

function segmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  const s = lengthSq
    ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq))
    : 0;
  return Math.hypot(px - (x1 + dx * s), py - (y1 + dy * s));
}

/** 1 within `half` px, fading to 0 over MARGIN px past it. */
const band = (distance, half) =>
  distance <= half ? 1 : Math.max(0, 1 - (distance - half) / MARGIN);

/** A line from (x, y) along `angle`, `length` long. */
function rayDistance(px, py, x, y, angle, length) {
  return segmentDistance(
    px,
    py,
    x,
    y,
    x + Math.cos(angle) * length,
    y + Math.sin(angle) * length
  );
}

/** 1 inside the wedge from (x, y) facing `angle`, `arc` wide, `range` long. */
function wedge(px, py, x, y, angle, arc, range, pad = 0) {
  const d = Math.hypot(px - x, py - y);
  if (d > range + pad) return 0;
  const off = Math.abs(wrapAngle(Math.atan2(py - y, px - x) - angle));
  const outside = Math.max(0, off - arc / 2) * d;
  return band(outside, pad) * band(d, range + pad);
}

/** 1 inside the ring sector round (x, y), `inner`..`outer` px, `width` rad. */
function ringSector(px, py, x, y, s, angle, widen = 0) {
  const d = Math.hypot(px - x, py - y);
  if (d < s.inner - MARGIN || d > s.outer + MARGIN) return 0;
  const off = Math.abs(wrapAngle(Math.atan2(py - y, px - x) - angle));
  const outside = Math.max(0, off - s.width / 2 - widen) * d;
  const radial = Math.max(0, s.inner - d, d - s.outer);
  return band(Math.hypot(outside, radial), 0);
}

// --- timing ---------------------------------------------------------------

/** A warning: it hurts from when its timer runs out. */
const from = (timer, t) => (t + EARLY >= (timer ?? 0) ? 1 : 0);
/** A burn: it hurts now, until its timer runs out (for good without one). */
const until = (timer, t) => (!(timer > 0) || t <= timer + 0.05 ? 1 : 0);

// --- hazards: one adapter per telegraph type ------------------------------
// Each reads the game's own telegraph fields (render3d/enemies/telegraph.js
// draws the same ones) plus the owner's position (ox, oy) and radius (or),
// and returns the danger (0..1) at (x, y), `t` s ahead, for a ship of
// radius `r`.

function lane(z, x, y, t, r) {
  if (!z.charging && !from(z.timer, t)) return 0;
  const half = (z.width || z.or * 1.8) / 2 + r;
  const length = Math.max(z.or * 2, z.length || 400);
  return band(
    rayDistance(x, y, z.x ?? z.ox, z.y ?? z.oy, z.angle || 0, length),
    half
  );
}

function aim(z, x, y, t, r) {
  if (!from(z.timer, t)) return 0;
  const d = rayDistance(x, y, z.ox, z.oy, z.angle || 0, z.length || 900);
  // an unlocked line still follows the ship: only a hint
  return band(d, SHOT_HALF + r) * (z.locked ? 1 : 0.4);
}

function fan(z, x, y, t, r) {
  if (!from(z.timer, t)) return 0;
  const reach = Math.max(FAN_REACH, z.length || 0);
  const ox = z.x ?? z.ox;
  const oy = z.y ?? z.oy;
  return wedge(x, y, ox, oy, z.angle || 0, (z.arc || 0) + 0.15, reach, r);
}

function intake(z, x, y, t, r) {
  const now = z.pulling ? 1 : from(z.timer, t);
  if (!now) return 0;
  const angle = z.angle || 0;
  const mouthX = z.x + Math.cos(angle) * z.or * 0.9;
  const mouthY = z.y + Math.sin(angle) * z.or * 0.9;
  const mouth = band(Math.hypot(x - mouthX, y - mouthY), MOUTH_REACH + r);
  const cone = wedge(x, y, z.x, z.y, angle, z.arc || 1, z.length || 300, r);
  return Math.max(mouth, cone * 0.4);
}

function lines(z, x, y, t, r) {
  if (!from(z.timer, t)) return 0;
  const chorus = z.type === 'chorus';
  let worst = 0;
  for (const line of z.lines || []) {
    const length = chorus
      ? Math.hypot(z.focus.x - line.x, z.focus.y - line.y) + 80
      : (line.length || 200) * 1.6;
    const d = rayDistance(x, y, line.x, line.y, line.angle, length);
    worst = Math.max(worst, band(d, (chorus ? SHOT_HALF : ROCK_HALF) + r));
  }
  return worst;
}

function barrier(z, x, y, t, r) {
  if (z.phase === 'fade') return 0;
  if (z.phase === 'warn' ? !from(z.timer, t) : !until(z.timer, t)) return 0;
  // solid, a turning wall keeps turning as seen (spin, rad/s); its span is
  // the field's width along the line, so a turned one spans the field too
  const turn = z.phase === 'solid' ? (z.spin || 0) * t : 0;
  const ux = Math.cos(z.angle + turn);
  const uy = Math.sin(z.angle + turn);
  const along = (x - z.x) * ux + (y - z.y) * uy;
  const off = Math.abs(-(x - z.x) * uy + (y - z.y) * ux);
  const [lo, hi] = turn ? [-Infinity, Infinity] : z.span || [-1000, 1000];
  const gap = Math.abs(along - z.gapAt) - z.gapWidth / 2;
  const outside = Math.max(0, lo - along, along - hi);
  // the gap's edges are posts: the distance to the solid pieces
  const alongMiss = Math.max(outside, gap < 0 ? -gap : 0);
  return band(Math.hypot(off, alongMiss), LINE_HALF + r);
}

function sectors(z, x, y, t) {
  if (z.phase === 'warn' ? !from(z.timer, t) : !until(z.timer, t)) return 0;
  const width = (Math.PI * 2) / z.count;
  let worst = 0;
  for (let i = 0; i < z.count; i += 1) {
    if ((i + z.offset) % 2 !== 0) continue;
    const angle = z.angle + width * (i + 0.5);
    worst = Math.max(worst, wedge(x, y, z.x, z.y, angle, width, z.length, 6));
  }
  return worst;
}

function pools(z, x, y, t) {
  let worst = 0;
  for (const pool of z.pools || []) {
    const live =
      pool.phase === 'warn' ? from(pool.timer, t) : until(pool.timer, t);
    if (!live) continue;
    worst = Math.max(
      worst,
      band(Math.hypot(x - pool.x, y - pool.y), pool.radius)
    );
  }
  return worst;
}

function segments(list, x, y, half) {
  let worst = 0;
  for (const s of list || []) {
    worst = Math.max(
      worst,
      band(segmentDistance(x, y, s.x1, s.y1, s.x2, s.y2), half)
    );
  }
  return worst;
}

function prism(z, x, y, t) {
  if (z.phase === 'warn' ? !from(z.timer, t) : !until(z.timer, t)) return 0;
  // burning, the crown turns: a little more room
  return segments(
    z.segments,
    x,
    y,
    z.width / 2 + (z.phase === 'burn' ? 10 : 4)
  );
}

function arms(z, x, y, t) {
  const warning = z.phase === 'warn';
  if (warning && !from(z.timer, t)) return 0;
  let worst = 0;
  for (const s of z.segments || []) {
    // swinging, its turn so far carries on (spin, rad/s, as seen moving)
    const angle = s.angle + (warning ? 0 : (z.spin || 0) * t);
    const widen = warning ? ARM_SWING : 0.08;
    worst = Math.max(worst, ringSector(x, y, z.x, z.y, s, angle, widen));
  }
  return worst;
}

function grid(z, x, y, t, r) {
  if (z.phase === 'fade') return 0;
  if (z.phase === 'warn' ? !from(z.timer, t) : !until(z.timer, t)) return 0;
  // solid, a closing cage keeps closing round its centre as seen (closing,
  // px/s of its side): its fences where they will be, rebuilt as the game
  // does (the doorway keeps its width, its stubs shorten)
  const fences =
    z.phase === 'solid' && z.closing && z.size > 0
      ? cageFences(
          z.x,
          z.y,
          Math.max(0, z.size + z.closing * t),
          z.open,
          z.door
        )
      : z.fences;
  return segments(fences, x, y, LINE_HALF + r);
}

function lock(z, x, y, t) {
  const live = {
    aim: 0.3 * from(z.timer, t),
    freeze: from(z.timer, t),
    burn: until(z.timer, t),
  }[z.phase];
  if (!live) return 0;
  const d = segmentDistance(x, y, z.x, z.y, z.x2, z.y2);
  return live * band(d, z.width / 2 + 4);
}

// A shell in the air or a marked point: a blast disc at its landing.
function shell(z, x, y, t, r) {
  if (t + EARLY < z.timer || t > z.timer + 0.2) return 0;
  return band(Math.hypot(x - z.x, y - z.y), z.radius + r);
}

function mine(z, x, y, t, r) {
  const reach = Math.max(z.proximityRadius || 0, z.explosionRadius || 0);
  return band(Math.hypot(x - z.x, y - z.y), reach + r) * (z.armed ? 1 : 0.3);
}

const ZONES = {
  charge: lane,
  lane,
  aim,
  fan,
  intake,
  eject: lines,
  chorus: lines,
  barrier,
  sectors,
  pools,
  prism,
  arms,
  grid,
  lock,
  shell,
  mine,
};

/**
 * The danger (0 = safe, 1 = a hit; overlaps add up) at field point (x, y),
 * `t` s from now: every moving body extrapolated by its velocity (the field
 * wraps), every telegraph by its own adapter.
 */
export function hazardAt(world, x, y, t = 0) {
  const { width, height } = world;
  const r = world.ship?.radius ?? 15;
  let danger = 0;
  for (const m of world.movers) {
    const dx = wrapDelta(m.x + m.vx * t - x, width);
    const dy = wrapDelta(m.y + m.vy * t - y, height);
    danger += band(Math.hypot(dx, dy), m.radius + r);
  }
  for (const z of world.zones) {
    danger += ZONES[z.type]?.(z, x, y, t, r) ?? 0;
  }
  return danger;
}

// --- the ship's own motion (PlayerSystem's modern scheme, simplified) ------

// One step of flight along `dir` (null: no keys) for the state { x, y, vx,
// vy, dashLeft }.
function fly(world, state, dir, dt) {
  const ship = world.ship;
  if (dir) {
    state.vx += dir.x * ship.acceleration * dt;
    state.vy += dir.y * ship.acceleration * dt;
  } else {
    // the auto-brake pushes against the drift
    const speed = Math.hypot(state.vx, state.vy);
    if (speed > 2) {
      const cut = Math.min(speed, ship.acceleration * 0.6 * dt) / speed;
      state.vx -= state.vx * cut;
      state.vy -= state.vy * cut;
    }
  }
  if (state.dashLeft <= 0) {
    const keep = Math.exp(-(ship.damping + (dir ? 0 : ship.braking)) * dt);
    state.vx *= keep;
    state.vy *= keep;
  }
  const dashing = state.dashLeft > 0;
  const cap = ship.maxSpeed * (dashing ? DASH_SPEED_CAP_MULTIPLIER : 1);
  const speed = Math.hypot(state.vx, state.vy);
  if (speed > cap) {
    state.vx *= cap / speed;
    state.vy *= cap / speed;
  }
  state.x = (state.x + state.vx * dt + world.width) % world.width;
  state.y = (state.y + state.vy * dt + world.height) % world.height;
  state.dashLeft -= dt;
}

/** The pilot's reaction delay, in seconds. */
const leadOf = (knobs) => (knobs.reactionMs || 0) / 1000;

/**
 * The ship's path: `held` (the keys already down) through the reaction
 * delay, then `dir` (null: no keys; with `dash`, a dash along it first) for
 * `horizon` s, sampled at `substeps` points after the delay: [{ x, y, t }],
 * `t` counted from now.
 */
export function rollout(world, dir, knobs, dash = false, held = null) {
  const { horizon, substeps } = knobs;
  const lead = leadOf(knobs);
  const state = { ...world.ship, dashLeft: 0 };
  const leadSteps = Math.round(lead / ROLL_DT);
  for (let i = 0; i < leadSteps; i += 1)
    fly(world, state, held, lead / leadSteps);
  if (dash && dir) {
    state.vx += dir.x * world.ship.dashImpulse;
    state.vy += dir.y * world.ship.dashImpulse;
    state.dashLeft = DASH_DURATION;
  }
  const every = Math.max(1, Math.round(horizon / substeps / ROLL_DT));
  const steps = every * substeps;
  const dt = horizon / steps;
  const path = [];
  for (let i = 1; i <= steps; i += 1) {
    fly(world, state, dir, dt);
    if (i % every === 0) {
      const { x, y, vx, vy } = state;
      path.push({ x, y, vx, vy, t: lead + i * dt });
    }
  }
  return path;
}

/**
 * Danger along a path: the weighted total (nearer counts more) and the
 * worst within CLOSE s of acting.
 */
function pathDanger(world, path, knobs, safeUntil) {
  const lead = leadOf(knobs);
  let total = 0;
  let soon = 0;
  path.forEach((p, i) => {
    if (p.t < safeUntil) return;
    const h = hazardAt(world, p.x, p.y, p.t);
    total += h * (1.5 - (p.t - lead) / knobs.horizon);
    if (i === 0 || p.t <= lead + CLOSE + 1e-9) soon = Math.max(soon, h);
  });
  // where it ends up should stay safe a little longer (a landing ring, a
  // line of shots still on its way)
  const end = path.at(-1);
  for (const later of TAIL) {
    total += TAIL_WEIGHT * hazardAt(world, end.x, end.y, end.t + later);
  }
  return { total, soon };
}

// What a path is pulled toward and kept off; loot only when it is `safe`.
function intentScore(world, end, start, safe) {
  let score = 0;
  const edgeOf = (p) =>
    Math.min(p.x, world.width - p.x, p.y, world.height - p.y);
  // a boss beyond the weapon's reach comes first: loot it never got to (a
  // heart in a corner) held a scatter gun 340 px off one for 15 minutes
  const boss = world.boss;
  const reach = world.ship.reach ?? Infinity;
  const outOfReach =
    boss &&
    Math.hypot(boss.x - start.x, boss.y - start.y) - boss.radius > reach;
  const chase = safe && !outOfReach;
  // loot: the nearest worth having, closer by the end of the path; straight
  // distances, as the edge term keeps it off the wrap (loot just across it
  // held the ship against the wall for minutes)
  let best = null;
  let bestDistance = LOOT_REACH;
  for (const item of world.loot) {
    // a heart dropped past the edge can never be picked up: not worth waiting for
    const outside =
      item.x < 0 || item.x > world.width || item.y < 0 || item.y > world.height;
    if (outside) continue;
    const d = Math.hypot(item.x - start.x, item.y - start.y);
    if (d < bestDistance) {
      best = item;
      bestDistance = d;
    }
  }
  if (best && chase) {
    const gain = bestDistance - Math.hypot(best.x - end.x, best.y - end.y);
    score += (LOOT_WEIGHT * gain) / Math.max(40, world.ship.maxSpeed * 0.5);
  }
  // off the edges: across the wrap the turret loses its aim and new foes
  // come in there; loot it goes for lets it as close as the loot lies (a
  // heart 25 px in held it just out of reach for twenty minutes)
  const edgeGap =
    best && chase ? Math.max(1, Math.min(EDGE_GAP, edgeOf(best))) : EDGE_GAP;
  score -= EDGE_WEIGHT * Math.max(0, 1 - edgeOf(end) / edgeGap);
  // a moving ship is a harder target: keep some way on
  const terminal = world.ship.acceleration / Math.max(0.1, world.ship.damping);
  score += MOVE_WEIGHT * Math.min(1, Math.hypot(end.vx, end.vy) / terminal);
  // a firing distance from the nearest foe (the turret aims on its own and
  // does not shoot across the wrap: straight distances here)
  let foe = null;
  let foeGap = Infinity;
  for (const m of world.movers) {
    if (m.kind === 'bullet') continue;
    const gap = Math.hypot(m.x - start.x, m.y - start.y) - m.radius;
    if (gap < foeGap) {
      foe = m;
      foeGap = gap;
    }
  }
  // inside the weapon's reach (px from the muzzle): a firing gap past it
  // hits nothing (a scatter gun, reach 180, sat 340 px off a boss)
  if (boss) {
    const open = boss.open > 0.5;
    const gap = Math.min(open ? OPEN_GAP : FIRING_GAP + 50, reach);
    const want = boss.radius + gap;
    const d = Math.hypot(end.x - boss.x, end.y - boss.y);
    score -= (RANGE_WEIGHT * Math.abs(d - want)) / 200;
    // a raised plate soaks the front: go round it
    if (boss.shieldUp > 0.5 && Number.isFinite(boss.facing)) {
      const bearing = Math.atan2(end.y - boss.y, end.x - boss.x);
      score -= BEHIND_WEIGHT * Math.cos(wrapAngle(bearing - boss.facing));
    }
  } else if (foe) {
    const d = Math.hypot(end.x - foe.x, end.y - foe.y) - foe.radius;
    score -= (RANGE_WEIGHT * Math.abs(d - Math.min(FIRING_GAP, reach))) / 200;
  }
  return score;
}

/**
 * One plan from `world`: { dir (index into DIRECTIONS), dash, shield,
 * danger (the chosen path's) }. `previous` is the last plan's dir, held
 * through the reaction delay before this plan acts.
 */
export function decide(world, knobs, previous = 0) {
  const ship = world.ship;
  const safeUntil = ship.invulnerable || 0;
  const held = DIRECTIONS[previous];
  let best = null;
  DIRECTIONS.forEach((dir, index) => {
    const path = rollout(world, dir, knobs, false, held);
    const danger = pathDanger(world, path, knobs, safeUntil);
    let score = -DANGER_WEIGHT * danger.total;
    score += intentScore(world, path.at(-1), ship, danger.total < 0.05);
    if (index === previous) score += STEADY_BONUS;
    if (!best || score > best.score) best = { index, score, danger };
  });

  const plan = {
    dir: best.index,
    dash: false,
    shield: false,
    danger: best.danger,
  };
  if (best.danger.soon < 0.3) return plan;

  // About to be hit: a dash that gets clear (its start is invulnerable).
  if (ship.dashReady) {
    let escape = null;
    DIRECTIONS.forEach((dir, index) => {
      if (!dir) return;
      const path = rollout(world, dir, knobs, true, held);
      const danger = pathDanger(
        world,
        path,
        knobs,
        Math.max(safeUntil, leadOf(knobs) + DASH_INVULNERABILITY)
      );
      if (!escape || danger.total < escape.danger.total) {
        escape = { index, danger };
      }
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
  // A hit that looks unavoidable: the shield, when it is installed and ready.
  if (ship.shieldReady && best.danger.soon >= 0.7) plan.shield = true;
  return plan;
}

/** WASD held for a plan's direction. */
export function keysFor(dir) {
  const d = DIRECTIONS[dir];
  return {
    up: Boolean(d && d.y < -0.1),
    down: Boolean(d && d.y > 0.1),
    left: Boolean(d && d.x < -0.1),
    right: Boolean(d && d.x > 0.1),
  };
}

/**
 * The card policy, one place to change it: never a cursed card; a weapon
 * first, then damage, then survivability, then the rest; ties keep the
 * offer's order. Returns the chosen option's id, or null.
 */
export function pickCard(options = []) {
  const rank = (option) => {
    if (option.cursed) return -1;
    const tags = option.tags || [];
    const category = option.category?.id ?? option.category;
    if (tags.includes('weapon')) return 4;
    if (tags.includes('damage') || category === 'offense') return 3;
    if (category === 'defense') return 2;
    return 1;
  };
  let chosen = null;
  for (const option of options) {
    if (!chosen || rank(option) > rank(chosen)) chosen = option;
  }
  return chosen?.id ?? null;
}

/**
 * A pilot with a skill (`preset` and any `knobs` over it) and a `seed` for
 * what it misses. step(world) once per frame returns the keys to hold this
 * frame ({ up, down, left, right, dash, shield }; dash and shield are taps,
 * true on one frame). It plans `planHz` times a second; a plan acts
 * `reactionMs` after the world it read.
 */
export function createBotPilot({
  preset = 'average',
  knobs = {},
  seed = 1,
} = {}) {
  const skill = { ...PRESETS[preset], ...knobs };
  const random = new RandomService(seed);
  const noticed = new Map(); // a hazard → the time it is missed until
  const queue = [];
  let nextPlan = 0;
  let previous = 0;
  let current = { dir: 0, dash: false, shield: false };
  let fresh = false;

  // The world without the hazards this pilot has not noticed yet.
  function perceive(world) {
    const seen = new Set();
    const keep = (item) => {
      const ref = item.ref ?? item;
      seen.add(ref);
      if (!noticed.has(ref)) {
        const missed = skill.miss > 0 && random.chance(skill.miss);
        noticed.set(ref, missed ? world.time + skill.missFor : -Infinity);
      }
      return noticed.get(ref) <= world.time;
    };
    const perceived = {
      ...world,
      movers: world.movers.filter(keep),
      zones: world.zones.filter(keep),
    };
    for (const ref of noticed.keys()) if (!seen.has(ref)) noticed.delete(ref);
    return perceived;
  }

  return {
    skill,
    step(world) {
      if (world.time + 1e-9 >= nextPlan) {
        const plan = decide(perceive(world), skill, previous);
        previous = plan.dir;
        queue.push({ at: world.time + skill.reactionMs / 1000, plan });
        nextPlan = world.time + 1 / skill.planHz;
      }
      while (queue.length && queue[0].at <= world.time + 1e-9) {
        current = queue.shift().plan;
        fresh = true;
      }
      const keys = {
        ...keysFor(current.dir),
        dash: fresh && current.dash,
        shield: fresh && current.shield,
      };
      fresh = false;
      return keys;
    },
  };
}
