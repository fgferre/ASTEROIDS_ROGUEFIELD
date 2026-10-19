// The camera director (PLAN.md 14.2b; the behaviour page the owner approved
// on 19/10/2026): each frame it decides the moment (calm, pressure, danger,
// wave cleared, boss entrance, boss fight, death, victory), weighs what
// matters (the ship, what is about to hit, the boss, mini-bosses, elites,
// orbs, the rest), picks a target, a zoom and the angles, and eases them with
// springs. Two rules hold by construction, after the springs: the shot never
// shows past the field's edge, and what will hit within the danger time stays
// on screen. Every number is in data/constants/camera.js. Pure: the renderer
// poses the perspective camera from `pose` with the same math (cameraShot.js,
// render3d/cameraRig.js).
//
// Zoom 1 is the farthest the shot may hang at its angles (the field edge to
// edge on the screen's long side); the shot's distance is that over the zoom.

import { CAMERA_DIRECTOR } from '../data/constants/camera.js';
import {
  clampShotToField,
  fieldFitDistance,
  projectToScreen,
} from './cameraShot.js';
import { dampTo } from './dampTo.js';
import { SHIP_MAX_SPEED } from './GameConstants.js';

const DEG = Math.PI / 180;
// The gameplay tilt every moment adds to (cinematics.js FOLLOW_TILT).
const BASE_TILT_DEG = 18;
// The ship counts with this radius in the frame.
const SHIP_RADIUS = 24;
const ORB_RADIUS = 10;
const BISECT_STEPS = 10;
// Weighed things past this many (by weight) are left out of the frame.
const MAX_EXTRAS = 6;
const MAX_CLUSTERS = 8;
// Higher wins at once; a lower one waits out the current one's minActive.
const PRIORITY = {
  death: 7,
  victory: 6,
  bossEntrance: 5,
  danger: 4,
  boss: 3,
  cleared: 2,
  pressure: 1,
  calm: 0,
};
export const MOMENTS = Object.keys(PRIORITY);
// They own the zoom (no pulses), end on their own clock, and cut instead of
// moving under reduced motion.
const SPECIAL = new Set(['death', 'victory', 'bossEntrance']);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function falloff(distance, { near, far }) {
  if (distance <= near) return 1;
  if (distance >= far) return 0;
  const t = (far - distance) / (far - near);
  return t * t * (3 - 2 * t);
}

/**
 * Seconds until something at (dx, dy) from the ship, moving at (vx, vy)
 * relative to it, comes within `reach`; Infinity when it never does.
 */
export function timeToHit(dx, dy, vx, vy, reach) {
  const c = dx * dx + dy * dy - reach * reach;
  if (c <= 0) return 0;
  const a = vx * vx + vy * vy;
  const b = dx * vx + dy * vy;
  if (a < 1e-9 || b >= 0) return Infinity;
  const disc = b * b - a * c;
  if (disc < 0) return Infinity;
  return (-b - Math.sqrt(disc)) / a;
}

/** An empty scene (camera.js readCameraScene fills it). */
export function createDirectorScene() {
  return {
    hasShip: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    heading: 0,
    hasAim: false,
    aimX: 0,
    aimY: 0,
    // The look-ahead the camera asks for (camera.js lookAheadFor).
    leadX: 0,
    leadY: 0,
    // Live lists, read in place: enemies (x, y, vx, vy, radius, type,
    // destroyed, elite), hostile shots (x, y, vx, vy, radius, active, hit)
    // and XP orbs (x, y, collected).
    enemies: [],
    shots: [],
    orbs: [],
  };
}

export function createDirector({
  fieldWidth,
  fieldHeight,
  tuning = CAMERA_DIRECTOR,
} = {}) {
  const T = tuning;
  const topSpeed = T.maxSpeed * SHIP_MAX_SPEED;
  let lens = { tanV: Math.tan(19 * DEG), aspect: 4 / 3 };
  let reducedMotion = false;
  let forced = null;

  let moment = 'calm';
  let since = 0;
  // Seconds left on the event-driven moments; death holds until a reset.
  const timers = { victory: 0, bossEntrance: 0, cleared: 0 };
  let deathHold = false;
  let dangerOn = false;
  let dangerClock = 0;
  let pressureOn = false;
  // The boss its entrance frames (the Warden that just spawned).
  let entranceTarget = null;

  // Eased channels, chasing `goal` (the target after the dead bands).
  const px = { value: fieldWidth / 2, velocity: 0 };
  const py = { value: fieldHeight / 2, velocity: 0 };
  const zoom = { value: 1, velocity: 0 };
  const tilt = { value: BASE_TILT_DEG * DEG, velocity: 0 };
  const yaw = { value: 0, velocity: 0 };
  const goal = { x: fieldWidth / 2, y: fieldHeight / 2, zoom: 1 };
  let sliding = false;
  let lastShip = null;
  let primed = false;

  // What this frame weighs (reused).
  const items = [];
  const extras = [];
  const threats = [];
  const clusters = [];
  for (let i = 0; i < MAX_CLUSTERS; i += 1) clusters.push({ x: 0, y: 0, n: 0 });
  let clusterCount = 0;
  const boss = { has: false, x: 0, y: 0, radius: 0 };
  const commons = { x: 0, y: 0, w: 0 };
  let dangerScore = 0;
  let nearCount = 0;

  const pose = {
    x: fieldWidth / 2,
    y: fieldHeight / 2,
    distance: 1,
    tilt: BASE_TILT_DEG * DEG,
    yaw: 0,
    roll: 0,
    // The most the strafe bank may lean in this moment (radians).
    rollMax: 0,
    zoom: 1,
  };
  const want = { tilt: 0, yaw: 0, roll: 0 };
  const centre = { x: 0, y: 0 };
  const probe = { x: 0, y: 0, distance: 1, tilt: 0, yaw: 0, roll: 0 };
  const shipItem = { x: 0, y: 0, r: SHIP_RADIUS, margin: 1 };
  const shipList = [shipItem];
  const threatItem = { x: 0, y: 0, r: 0, margin: T.margins.threat };
  const threatList = [threatItem];
  const screen = { x: 0, y: 0, front: true };

  function config() {
    return T.moments[moment];
  }

  // The shot's distance for zoom `z` at angles `a`.
  function distanceFor(z, a) {
    return fieldFitDistance(a, lens, fieldWidth, fieldHeight) / z;
  }

  // Poses the probe at (cx, cy), zoom z, angles a, clamped into the field.
  function place(cx, cy, z, a) {
    probe.tilt = a.tilt;
    probe.yaw = a.yaw;
    probe.roll = 0;
    probe.distance = distanceFor(z, a);
    probe.x = cx;
    probe.y = cy;
    return clampShotToField(probe, lens, fieldWidth, fieldHeight);
  }

  function onScreen(x, y, margin) {
    projectToScreen(probe, lens, x, y, screen);
    return (
      screen.front &&
      Math.abs(screen.x) <= margin &&
      Math.abs(screen.y) <= margin
    );
  }

  // Is the disc (x, y, r) inside `margin` of the screen at the probe? Only
  // its part inside the field counts: the shot never shows past the edge.
  function inside(x, y, r, margin) {
    const cx = clamp(x, 0, fieldWidth);
    const cy = clamp(y, 0, fieldHeight);
    if (r <= 0) return onScreen(cx, cy, margin);
    return (
      onScreen(Math.max(0, x - r), cy, margin) &&
      onScreen(Math.min(fieldWidth, x + r), cy, margin) &&
      onScreen(cx, Math.max(0, y - r), margin) &&
      onScreen(cx, Math.min(fieldHeight, y + r), margin)
    );
  }

  function fits(list, count, cx, cy, z, a) {
    place(cx, cy, z, a);
    for (let i = 0; i < count; i += 1) {
      const it = list[i];
      if (!inside(it.x, it.y, it.r, it.margin)) return false;
    }
    return true;
  }

  // Can any shot (centred on it, at zoom 1 or `hi`) show this item?
  function showable(it, hi) {
    const one = [it];
    return (
      fits(one, 1, it.x, it.y, hi, want) || fits(one, 1, it.x, it.y, 1, want)
    );
  }

  // The closest zoom in [lo, hi] at which the first `count` fit; lo when
  // none does.
  function closestFit(list, count, cx, cy, lo, hi, a) {
    if (fits(list, count, cx, cy, hi, a)) return hi;
    if (lo >= hi || !fits(list, count, cx, cy, lo, a)) return lo;
    let ok = lo;
    let bad = hi;
    for (let i = 0; i < BISECT_STEPS; i += 1) {
      const mid = (ok + bad) / 2;
      if (fits(list, count, cx, cy, mid, a)) ok = mid;
      else bad = mid;
    }
    return ok;
  }

  // --- weighing --------------------------------------------------------

  function addThreat(x, y, r, t) {
    const u = T.urgency;
    const urgency = t < u.triple ? 3 : t < u.double ? 2 : 1;
    threats.push({ x, y, r, t, urgency });
  }

  function addExtra(x, y, r, w) {
    extras.push({ x, y, r, w, margin: T.margins.framed, must: false });
  }

  function weigh(scene) {
    threats.length = 0;
    extras.length = 0;
    boss.has = false;
    commons.x = 0;
    commons.y = 0;
    commons.w = 0;
    dangerScore = 0;
    nearCount = 0;
    let crowd = 0;
    let bossDistance = Infinity;
    const W = T.weights;
    const sx = scene.x;
    const sy = scene.y;

    const enemies = scene.enemies;
    for (let i = 0; i < enemies.length; i += 1) {
      const e = enemies[i];
      if (!e || e.destroyed) continue;
      const dx = e.x - sx;
      const dy = e.y - sy;
      const d = Math.hypot(dx, dy);
      const radius = e.radius || 0;
      if (e.type === 'boss') {
        if (d < bossDistance) {
          bossDistance = d;
          boss.has = true;
          boss.x = e.x;
          boss.y = e.y;
          boss.radius = radius;
        }
        continue;
      }
      if (d < T.pressure.range) nearCount += 1;
      if (d < T.danger.crowdRange + radius) crowd += 1;
      const rvx = (e.vx || 0) - scene.vx;
      const rvy = (e.vy || 0) - scene.vy;
      const closing = d > 1e-6 ? -(dx * rvx + dy * rvy) / d : 0;
      if (closing >= T.fastThreatSpeed) {
        const t = timeToHit(dx, dy, rvx, rvy, SHIP_RADIUS + radius);
        if (t <= T.urgency.horizon) addThreat(e.x, e.y, radius, t);
      }
      const f = falloff(d, T.pullRange);
      if (f <= 0) continue;
      if (e.type === 'herald') addExtra(e.x, e.y, radius, W.miniBoss * f);
      else if (e.elite) addExtra(e.x, e.y, radius, W.elite * f);
      else {
        commons.x += e.x * f;
        commons.y += e.y * f;
        commons.w += f;
      }
    }

    const shots = scene.shots;
    for (let i = 0; i < shots.length; i += 1) {
      const s = shots[i];
      if (!s || s.active === false || s.hit) continue;
      const radius = s.radius || 0;
      const t = timeToHit(
        s.x - sx,
        s.y - sy,
        (s.vx || 0) - scene.vx,
        (s.vy || 0) - scene.vy,
        SHIP_RADIUS + radius
      );
      if (t <= T.urgency.horizon) addThreat(s.x, s.y, radius, t);
    }

    for (let i = 0; i < threats.length; i += 1) {
      const u = threats[i].urgency;
      dangerScore += u === 3 ? 1 : u === 2 ? 0.5 : 0.2;
    }
    dangerScore += crowd / T.danger.crowd;
    clusterOrbs(scene.orbs);
  }

  // Greedy clusters: each orb joins the first cluster whose centre is close.
  function clusterOrbs(orbs) {
    clusterCount = 0;
    const r2 = T.orbClusterRadius * T.orbClusterRadius;
    for (let i = 0; i < orbs.length; i += 1) {
      const o = orbs[i];
      if (!o || o.collected) continue;
      let k = 0;
      for (; k < clusterCount; k += 1) {
        const c = clusters[k];
        const dx = o.x - c.x / c.n;
        const dy = o.y - c.y / c.n;
        if (dx * dx + dy * dy <= r2) break;
      }
      if (k === clusterCount) {
        if (k === MAX_CLUSTERS) continue;
        clusters[k].x = 0;
        clusters[k].y = 0;
        clusters[k].n = 0;
        clusterCount += 1;
      }
      clusters[k].x += o.x;
      clusters[k].y += o.y;
      clusters[k].n += 1;
    }
  }

  // --- moments ---------------------------------------------------------

  // Returns true on entering a special moment.
  function decide(dt) {
    for (const k of Object.keys(timers))
      timers[k] = Math.max(0, timers[k] - dt);
    const D = T.danger;
    if (!dangerOn) {
      dangerClock = dangerScore >= D.enter ? dangerClock + dt : 0;
      if (dangerClock >= D.enterFor) {
        dangerOn = true;
        dangerClock = 0;
      }
    } else {
      dangerClock = dangerScore < D.exit ? dangerClock + dt : 0;
      if (dangerClock >= D.exitFor) {
        dangerOn = false;
        dangerClock = 0;
      }
    }
    if (!pressureOn && nearCount >= T.pressure.enter) pressureOn = true;
    if (pressureOn && nearCount < T.pressure.exit) pressureOn = false;

    let wanted = 'calm';
    if (forced) wanted = forced;
    else if (deathHold) wanted = 'death';
    else if (timers.victory > 0) wanted = 'victory';
    else if (timers.bossEntrance > 0) wanted = 'bossEntrance';
    else if (dangerOn) wanted = 'danger';
    else if (boss.has) wanted = 'boss';
    else if (timers.cleared > 0) wanted = 'cleared';
    else if (pressureOn) wanted = 'pressure';

    since += dt;
    if (wanted === moment) return false;
    // A special moment ends on its own clock; the rest wait out minActive
    // unless something higher comes.
    const higher = PRIORITY[wanted] > PRIORITY[moment];
    if (!higher && !SPECIAL.has(moment) && since < config().minActive) {
      return false;
    }
    moment = wanted;
    since = 0;
    return SPECIAL.has(moment);
  }

  // --- framing ---------------------------------------------------------

  function frameItem(x, y, r, w, margin, must) {
    items.push({ x, y, r, w, margin, must });
  }

  // The centre and the zoom this moment asks for (centre.x/y, returned z).
  function aim(scene) {
    const c = config();
    want.tilt = (BASE_TILT_DEG + (reducedMotion ? 0 : c.tilt)) * DEG;
    want.yaw =
      reducedMotion || !c.yaw
        ? 0
        : c.yaw * clamp(since / c.minActive, 0, 1) * DEG;
    want.roll = 0;
    let [lo, hi] = c.zoom;
    if (reducedMotion) {
      hi = Math.min(hi, T.reducedMotion.maxZoom);
      lo = Math.min(lo, hi);
    }

    const W = T.weights;
    items.length = 0;
    // The ship only has to be whole on screen for the zoom: near the field's
    // edge it cannot be central, and keepShip centres it where it can.
    frameItem(scene.x, scene.y, SHIP_RADIUS, W.player, 1, true);
    let cx = scene.x * W.player;
    let cy = scene.y * W.player;
    let total = W.player;
    const add = (x, y, w) => {
      cx += x * w;
      cy += y * w;
      total += w;
    };

    if (moment !== 'death') {
      for (let i = 0; i < threats.length; i += 1) {
        const t = threats[i];
        const w = W.threat * t.urgency;
        frameItem(t.x, t.y, t.r, w, T.margins.threat, t.urgency >= 2);
        add(t.x, t.y, w);
      }
    }

    const entering =
      moment === 'bossEntrance' && entranceTarget && !entranceTarget.destroyed;
    const target = entering ? entranceTarget : boss.has ? boss : null;
    if (target && moment !== 'death' && moment !== 'victory') {
      const must = moment === 'boss' || moment === 'bossEntrance';
      frameItem(
        target.x,
        target.y,
        target.radius || 0,
        W.boss,
        T.margins.framed,
        must
      );
      add(target.x, target.y, W.boss);
    }

    if (moment !== 'death' && moment !== 'victory') {
      extras.sort((p, q) => q.w - p.w);
      for (let i = 0; i < extras.length && i < MAX_EXTRAS; i += 1) {
        const it = extras[i];
        items.push(it);
        add(it.x, it.y, it.w);
      }
      if (commons.w > 0) {
        const w = Math.min(W.common * commons.w, W.commonTotal);
        add(commons.x / commons.w, commons.y / commons.w, w);
      }
      const boost = moment === 'cleared' ? c.orbBoost || 1 : 1;
      let taken = 0;
      for (let k = 0; k < clusterCount && taken < W.orbClusters; k += 1) {
        const cl = clusters[k];
        const ox = cl.x / cl.n;
        const oy = cl.y / cl.n;
        const f = falloff(Math.hypot(ox - scene.x, oy - scene.y), T.pullRange);
        if (f <= 0) continue;
        taken += 1;
        const w = W.orbCluster * boost * f;
        frameItem(ox, oy, ORB_RADIUS, w, T.margins.framed, false);
        add(ox, oy, w);
      }
    }
    cx /= total;
    cy /= total;

    // Ahead toward the aim (or the hull), a share of the view at most.
    if (c.lead > 0 && !reducedMotion) {
      const length = Math.hypot(scene.leadX, scene.leadY);
      if (length > 1e-6) {
        const span = Math.min(fieldWidth, fieldHeight * lens.aspect) / hi;
        const k = Math.min(length, c.lead * span) / length;
        cx += scene.leadX * k;
        cy += scene.leadY * k;
      }
    }

    // What must show decides how far out; the rest come in by weight while
    // the zoom stays in the moment's range.
    // A must that no shot can show (in the strip by a side edge that the
    // tilted shot's narrower bottom never reaches) stops being one.
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      if (it.must && !showable(it, hi)) it.must = false;
    }
    items.sort((p, q) => q.must - p.must || q.w - p.w);
    let must = 0;
    while (must < items.length && items[must].must) must += 1;
    let z = closestFit(items, must, cx, cy, 1, hi, want);
    for (let count = must + 1; z > lo && count <= items.length; count += 1) {
      const next = closestFit(items, count, cx, cy, lo, z, want);
      if (!fits(items, count, cx, cy, next, want)) break;
      z = next;
    }
    keepShip(scene, cx, cy, z);
    return z;
  }

  // The ship stays in its central margin: pull the centre toward it.
  function keepShip(scene, cx, cy, z) {
    centre.x = cx;
    centre.y = cy;
    const margin = T.margins.player;
    place(cx, cy, z, want);
    if (inside(scene.x, scene.y, 0, margin)) return;
    let ok = 0;
    let bad = 1;
    for (let i = 0; i < BISECT_STEPS; i += 1) {
      const k = (ok + bad) / 2;
      place(
        scene.x + (cx - scene.x) * (1 - k),
        scene.y + (cy - scene.y) * (1 - k),
        z,
        want
      );
      if (inside(scene.x, scene.y, 0, margin)) bad = k;
      else ok = k;
    }
    centre.x = scene.x + (cx - scene.x) * (1 - bad);
    centre.y = scene.y + (cy - scene.y) * (1 - bad);
  }

  // --- the hard rules, after the springs ---------------------------------

  // Moves the pose the least toward the list's one item that shows it at
  // zoom z, when a shot centred on it would.
  function moveToShow(list, z) {
    const it = list[0];
    if (fits(list, 1, pose.x, pose.y, z, pose)) return;
    if (!fits(list, 1, it.x, it.y, z, pose)) return;
    let bad = 0;
    let ok = 1;
    for (let i = 0; i < BISECT_STEPS; i += 1) {
      const k = (bad + ok) / 2;
      const x = pose.x + (it.x - pose.x) * k;
      const y = pose.y + (it.y - pose.y) * k;
      if (fits(list, 1, x, y, z, pose)) ok = k;
      else bad = k;
    }
    pose.x += (it.x - pose.x) * ok;
    pose.y += (it.y - pose.y) * ok;
  }

  // The ship stays whole on screen; then what will hit within the danger
  // time stays inside its margin, opening first and then moving toward it
  // (it wins over the ship); then the field's edge.
  function enforce(scene) {
    shipItem.x = scene.x;
    shipItem.y = scene.y;
    moveToShow(shipList, pose.zoom);
    let worst = null;
    if (moment !== 'death') {
      for (let i = 0; i < threats.length; i += 1) {
        const t = threats[i];
        if (t.urgency >= 2 && (!worst || t.t < worst.t)) worst = t;
      }
    }
    if (worst) {
      threatItem.x = worst.x;
      threatItem.y = worst.y;
      threatItem.r = worst.r;
      if (!fits(threatList, 1, pose.x, pose.y, pose.zoom, pose)) {
        pose.zoom = closestFit(
          threatList,
          1,
          pose.x,
          pose.y,
          1,
          pose.zoom,
          pose
        );
        zoom.value = Math.min(zoom.value, pose.zoom);
        moveToShow(threatList, pose.zoom);
      }
    }
    pose.distance = distanceFor(pose.zoom, pose);
    clampShotToField(pose, lens, fieldWidth, fieldHeight);
    px.value = pose.x;
    py.value = pose.y;
  }

  // Unity's SmoothDamp speed cap, on the 2D step toward the goal.
  function dampPosition(dt, smooth, maxSpeed) {
    let tx = goal.x;
    let ty = goal.y;
    const dx = px.value - goal.x;
    const dy = py.value - goal.y;
    const d = Math.hypot(dx, dy);
    const cap = maxSpeed * smooth;
    if (d > cap) {
      tx = px.value - (dx / d) * cap;
      ty = py.value - (dy / d) * cap;
    }
    dampTo(px, tx, smooth, dt);
    dampTo(py, ty, smooth, dt);
  }

  function snapAll(z) {
    goal.x = centre.x;
    goal.y = centre.y;
    goal.zoom = z;
    px.value = goal.x;
    py.value = goal.y;
    zoom.value = z;
    tilt.value = want.tilt;
    yaw.value = want.yaw;
    px.velocity = 0;
    py.velocity = 0;
    zoom.velocity = 0;
    tilt.velocity = 0;
    yaw.velocity = 0;
  }

  const director = {
    pose,

    get moment() {
      return moment;
    },

    setLens(next) {
      lens = next;
    },

    setReducedMotion(flag) {
      reducedMotion = Boolean(flag);
    },

    /** Dev scenes (`?moment=`): hold this moment whatever happens; null frees it. */
    force(name) {
      forced = PRIORITY[name] === undefined ? null : name;
      if (forced) {
        moment = forced;
        since = 0;
      }
    },

    /**
     * An event-driven moment: 'bossEntrance' (with the boss to frame),
     * 'victory', 'death' (holds until a reset) or 'cleared'.
     */
    trigger(kind, target = null) {
      if (kind === 'death') {
        deathHold = true;
        return;
      }
      if (timers[kind] === undefined) return;
      timers[kind] = T.moments[kind].minActive;
      if (kind === 'bossEntrance') entranceTarget = target;
      // The wave is over: its danger and pressure end with it, or the
      // breath would wait out danger's exit time and never show.
      if (kind === 'cleared') {
        dangerOn = false;
        dangerClock = 0;
        pressureOn = false;
        if (!SPECIAL.has(moment) && moment !== 'boss') {
          moment = 'cleared';
          since = 0;
        }
      }
    },

    /** The next update lands on its shot at once (a new run's first frame). */
    snap() {
      primed = false;
      lastShip = null;
    },

    reset() {
      moment = forced || 'calm';
      since = 0;
      for (const k of Object.keys(timers)) timers[k] = 0;
      deathHold = false;
      dangerOn = false;
      dangerClock = 0;
      pressureOn = false;
      entranceTarget = null;
      sliding = false;
      director.snap();
    },

    /**
     * The shot this frame for `scene` (with a ship). `zoomPulse` scales the
     * zoom (the dash, brake and level-up kicks) outside the special moments.
     */
    update(scene, dt, zoomPulse = 1) {
      const step = Math.max(0, dt);
      weigh(scene);
      const entered = decide(step);
      const z = aim(scene);

      // The wrap: a jump of more than half the field slides across.
      if (
        lastShip &&
        (Math.abs(scene.x - lastShip.x) > fieldWidth / 2 ||
          Math.abs(scene.y - lastShip.y) > fieldHeight / 2)
      ) {
        sliding = true;
      }
      lastShip = lastShip || { x: 0, y: 0 };
      lastShip.x = scene.x;
      lastShip.y = scene.y;

      if (!primed || (entered && reducedMotion)) {
        snapAll(z);
        primed = true;
      } else {
        // Dead bands: the goal ignores small changes of the target.
        const DB = T.deadBand;
        if (Math.hypot(centre.x - goal.x, centre.y - goal.y) > DB.position) {
          goal.x = centre.x;
          goal.y = centre.y;
        }
        if (Math.abs(z - goal.zoom) > DB.zoom * goal.zoom) goal.zoom = z;
      }

      const slow = reducedMotion ? T.reducedMotion.springScale : 1;
      const S = T.springs;
      if (sliding) {
        dampPosition(step, T.wrapSlide, Infinity);
        if (Math.hypot(px.value - goal.x, py.value - goal.y) < 8)
          sliding = false;
      } else {
        dampPosition(step, S.position * slow, topSpeed);
      }
      const closing = goal.zoom > zoom.value;
      const closeIn = moment === 'death' ? S.death : S.zoomIn;
      dampTo(zoom, goal.zoom, (closing ? closeIn : S.zoomOut) * slow, step);
      dampTo(tilt, want.tilt, S.angle * slow, step);
      dampTo(yaw, want.yaw, S.angle * slow, step);

      pose.x = px.value;
      pose.y = py.value;
      pose.tilt = tilt.value;
      pose.yaw = yaw.value;
      pose.roll = 0;
      pose.zoom = Math.max(
        1,
        zoom.value * (SPECIAL.has(moment) ? 1 : zoomPulse)
      );
      pose.rollMax = reducedMotion ? 0 : config().roll * DEG;
      enforce(scene);
      return pose;
    },
  };

  return director;
}
