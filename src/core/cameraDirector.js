// The gameplay camera director (PLAN.md 14.2b; the near framing the owner
// chose by playing on 16/11/2026): top-down while playing, in two states.
// Near shows the field's whole width across the middle of the screen,
// tilted: it never moves sideways and follows the ship up and down, a
// little ahead toward the aim, with a slow drift when calm, and may show
// some space past the top and bottom edges. Wide shows the whole field from
// nearly straight above: at the end of a wave (for the orbs), when something
// about to hit is out of the near view (it opens before it arrives), when
// enemies close in from several sides out of view, when a boss or Herald is
// not wholly in view, and for short looks (a wave starting, an elite or an
// announced attack out of sight, a boss arriving). A look lasts its own
// time; a danger keeps the view open a while after it is gone. A boss
// falling or breaking a phase dives the view back near, leaning toward it.
// The ship is always on screen, except in the live scene of a Warden's
// entrance: low and moving, it follows the shot in the Warden's own recipe
// while the Warden flies in (enemies/boss/arrival.js) and hands back to the
// play view the moment it closes up. Every number is in
// data/constants/camera.js and the Wardens' recipes (src/content/bosses/).
// Pure: the renderer poses the perspective camera from `pose` with the same
// math (cameraShot.js, render3d/cameraRig.js).

import { CAMERA_DIRECTOR } from '../data/constants/camera.js';
import { fieldFitDistance, projectToScreen, shotExtent } from './cameraShot.js';
import { dampTo } from './dampTo.js';
import { SHIP_MAX_SPEED } from './GameConstants.js';

const DEG = Math.PI / 180;
// The ship counts with this radius on screen.
const SHIP_RADIUS = 24;
const BISECT_STEPS = 12;
// A Warden's entrance shots (content/bosses, `arrival.shot`) give their
// distances for the 38° lens they were framed with; another lens moves the
// camera in proportion, so the Warden fills the same share of the screen.
const ARRIVAL_TAN_V = Math.tan(19 * DEG);
// Where things must sit on screen to count as shown (share of the half-screen).
const SHOWN = 0.9;
const SHIP_SHOWN = 0.95;
// The states, for dev scenes (`?moment=near|wide`).
export const MOMENTS = Object.freeze(['near', 'wide']);

function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
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

/** Whether `thing` ({ x, y, vx, vy, radius }) reaches `ship` ({ x, y, vx, vy }) within `seconds`. */
export function hitsWithin(ship, thing, seconds) {
  return (
    timeToHit(
      thing.x - ship.x,
      thing.y - ship.y,
      (thing.vx || 0) - ship.vx,
      (thing.vy || 0) - ship.vy,
      SHIP_RADIUS + (thing.radius || 0)
    ) <= seconds
  );
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
    // The look-ahead the camera asks for (camera.js lookAheadFor): up and
    // down, and sideways (used only where the near view follows sideways).
    leadX: 0,
    leadY: 0,
    // Live lists, read in place: enemies (x, y, vx, vy, radius, type,
    // destroyed), hostile shots (x, y, vx, vy, radius, active, hit) and XP
    // orbs (x, y, collected).
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

  // 'near', 'wide' or 'arrival' (a Warden's entrance).
  let state = 'near';
  // Seconds the wide view stays open after its last reason.
  let wideFor = 0;
  // Seconds left: the cleared wave's orbs, and the short looks.
  let clearedFor = 0;
  let glanceFor = 0;
  // Seconds left of the dive: near, whatever else asks for wide.
  let diveFor = 0;
  // Where the boss that dived the view was, and its radius (0: none).
  const fallen = { x: 0, y: 0, radius: 0 };
  // Seconds the springs stay quick after an entrance hands back.
  let handbackFor = 0;
  let clock = 0;
  let primed = false;
  let sliding = false;
  let lastShip = null;

  const nearAngles = { tilt: T.near.tilt * DEG, yaw: 0, roll: 0 };
  const wideAngles = { tilt: T.wide.tilt * DEG, yaw: 0, roll: 0 };
  // The wide shot for the current screen shape (worked out when it changes).
  const wide = { aspect: 0, x: 0, y: 0, distance: 1 };

  const px = { value: fieldWidth / 2, velocity: 0 };
  const py = { value: fieldHeight / 2, velocity: 0 };
  const dist = { value: 1, velocity: 0 };
  const tilt = { value: nearAngles.tilt, velocity: 0 };
  const yaw = { value: 0, velocity: 0 };
  const goal = {
    x: fieldWidth / 2,
    y: fieldHeight / 2,
    distance: 1,
    tilt: 0,
    yaw: 0,
  };

  const pose = {
    x: fieldWidth / 2,
    y: fieldHeight / 2,
    distance: 1,
    tilt: nearAngles.tilt,
    yaw: 0,
    // The calm drift's lean (radians); the renderer adds the strafe bank,
    // up to rollMax, and the shake.
    roll: 0,
    rollMax: 0,
    // How close, as the farthest in-field shot at this tilt over the
    // distance (1 = that shot; the wide view is under 1).
    zoom: 1,
    // How much closer the near view comes on a small screen (1: not).
    closer: 1,
  };
  const probe = { x: 0, y: 0, distance: 1, tilt: 0, yaw: 0, roll: 0 };
  const near = { x: 0, y: 0, distance: 1 };
  // The near shot a wide screen would have (the field's width across): what
  // it leaves out opens the wide view, whatever the screen.
  const full = { x: 0, y: 0, distance: 1 };
  const extent = {};
  const fullExtent = {};
  const screen = { x: 0, y: 0, front: true };

  function onScreen(shot, angles, x, y, margin) {
    probe.x = shot.x;
    probe.y = shot.y;
    probe.distance = shot.distance;
    probe.tilt = angles.tilt;
    probe.yaw = angles.yaw;
    probe.roll = angles.roll;
    projectToScreen(probe, lens, x, y, screen);
    return (
      screen.front &&
      Math.abs(screen.x) <= margin &&
      Math.abs(screen.y) <= margin
    );
  }

  // A boss's or Herald's body on `shot`: `reach` times its radius around it,
  // all of it inside the screen.
  function bodyIn(shot, e, reach) {
    const r = (e.radius || 0) * reach;
    return (
      onScreen(shot, nearAngles, e.x - r, e.y, 1) &&
      onScreen(shot, nearAngles, e.x + r, e.y, 1) &&
      onScreen(shot, nearAngles, e.x, e.y - r, 1) &&
      onScreen(shot, nearAngles, e.x, e.y + r, 1)
    );
  }

  // The wide shot: centred on the field, as close as it can be with the four
  // corners inside the margin.
  function updateWide() {
    if (wide.aspect === lens.aspect) return;
    wide.aspect = lens.aspect;
    const e = shotExtent(1, wideAngles, lens, extent);
    const limit = 1 - T.wide.margin;
    const fits = (d) => {
      wide.distance = d;
      wide.x = fieldWidth / 2;
      wide.y = fieldHeight / 2 + (d * (e.up - e.down)) / 2;
      return (
        onScreen(wide, wideAngles, 0, 0, limit) &&
        onScreen(wide, wideAngles, fieldWidth, 0, limit) &&
        onScreen(wide, wideAngles, fieldWidth, fieldHeight, limit) &&
        onScreen(wide, wideAngles, 0, fieldHeight, limit)
      );
    };
    let lo = 1;
    // Far enough for the whole field at any screen shape, at any lens.
    let hi = (1.4 * Math.max(fieldWidth, fieldHeight)) / lens.tanV;
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    fits(hi);
  }

  // The near shot: the field's width fills the screen across its middle,
  // centred; up and down it follows the ship a little ahead, at most
  // `beyondEdge` of the half-view past the field's top or bottom edge. On a
  // small screen (T.small) it comes closer and follows sideways too, never
  // past the field's sides. In a dive it leans toward the boss that fell.
  function updateNear(scene) {
    const lead = reducedMotion ? 0 : 1;
    const keep = 1 - T.near.beyondEdge;
    const within = (low, high, v) =>
      low >= high ? (low + high) / 2 : Math.max(low, Math.min(high, v));
    const y = scene.y + lead * scene.leadY;
    full.distance = fieldWidth / 2 / (lens.tanV * lens.aspect);
    const f = shotExtent(full.distance, nearAngles, lens, fullExtent);
    full.x = fieldWidth / 2;
    full.y = within(f.up * keep, fieldHeight - f.down * keep, y);
    pose.closer =
      lens.width > 0
        ? Math.min(T.small.most, Math.max(1, T.small.width / lens.width))
        : 1;
    near.distance = full.distance / pose.closer;
    const e = shotExtent(near.distance, nearAngles, lens, extent);
    near.x =
      pose.closer > 1
        ? within(e.left, fieldWidth - e.right, scene.x + lead * scene.leadX)
        : full.x;
    near.y = within(e.up * keep, fieldHeight - e.down * keep, y);
    if (diveFor > 0 && fallen.radius > 0) towardFoe(scene, fallen);
  }

  // The near shot moves toward `foe` (a boss or Herald) just far enough to
  // show it whole, and never so far that the ship leaves its margin.
  function towardFoe(scene, foe) {
    const fromX = near.x;
    const fromY = near.y;
    const at = (k) => {
      near.x = fromX + (foe.x - fromX) * k;
      near.y = fromY + (foe.y - fromY) * k;
    };
    const shipIn = () =>
      onScreen(near, nearAngles, scene.x, scene.y, SHIP_SHOWN);
    const foeIn = () => bodyIn(near, foe, T.modelReach);
    // Where `ok` turns from `start` to the opposite along the move.
    const cross = (ok, start) => {
      let a = 0;
      let b = 1;
      for (let i = 0; i < BISECT_STEPS; i += 1) {
        const k = (a + b) / 2;
        at(k);
        if (ok() === start) a = k;
        else b = k;
      }
      return start ? a : b;
    };
    // The least move that shows it, and the most the ship allows.
    at(0);
    const show = foeIn() ? 0 : cross(foeIn, false);
    at(1);
    const most = shipIn() ? 1 : cross(shipIn, true);
    at(Math.min(show, most));
  }

  // --- what opens the wide view -------------------------------------------
  // Judged on the full-width near shot (`full`), so a small screen's closer
  // view opens it for the same things a wide screen would.

  function threatOffNear(scene) {
    const sx = scene.x;
    const sy = scene.y;
    const enemies = scene.enemies;
    for (let i = 0; i < enemies.length; i += 1) {
      const e = enemies[i];
      if (!e || e.destroyed) continue;
      if (e.type === 'boss' || e.type === 'herald') {
        if (!bodyIn(full, e, 1)) return true;
        continue;
      }
      const dx = e.x - sx;
      const dy = e.y - sy;
      const d = Math.hypot(dx, dy);
      const rvx = (e.vx || 0) - scene.vx;
      const rvy = (e.vy || 0) - scene.vy;
      const closing = d > 1e-6 ? -(dx * rvx + dy * rvy) / d : 0;
      if (closing < T.fastThreatSpeed) continue;
      const t = timeToHit(dx, dy, rvx, rvy, SHIP_RADIUS + (e.radius || 0));
      if (
        t <= T.threatHorizon &&
        !onScreen(full, nearAngles, e.x, e.y, SHOWN)
      ) {
        return true;
      }
    }
    const shots = scene.shots;
    for (let i = 0; i < shots.length; i += 1) {
      const s = shots[i];
      if (!s || s.active === false || s.hit) continue;
      const t = timeToHit(
        s.x - sx,
        s.y - sy,
        (s.vx || 0) - scene.vx,
        (s.vy || 0) - scene.vy,
        SHIP_RADIUS + (s.radius || 0)
      );
      if (
        t <= T.threatHorizon &&
        !onScreen(full, nearAngles, s.x, s.y, SHOWN)
      ) {
        return true;
      }
    }
    return false;
  }

  // Enemies close, out of the full-width near shot, on at least `surroundSides` of the
  // four sides of the ship.
  function surrounded(scene) {
    let sides = 0;
    const r2 = T.surroundRange * T.surroundRange;
    const enemies = scene.enemies;
    for (let i = 0; i < enemies.length && sides !== 15; i += 1) {
      const e = enemies[i];
      if (!e || e.destroyed) continue;
      const dx = e.x - scene.x;
      const dy = e.y - scene.y;
      if (dx * dx + dy * dy > r2) continue;
      if (onScreen(full, nearAngles, e.x, e.y, SHOWN)) continue;
      if (Math.abs(dx) >= Math.abs(dy)) sides |= dx >= 0 ? 1 : 4;
      else sides |= dy >= 0 ? 8 : 2;
    }
    let count = 0;
    for (let b = sides; b; b >>= 1) count += b & 1;
    return count >= T.surroundSides;
  }

  function orbsLeft(scene) {
    const orbs = scene.orbs;
    for (let i = 0; i < orbs.length; i += 1) {
      if (orbs[i] && !orbs[i].collected) return true;
    }
    return false;
  }

  // --- a Warden's entrance --------------------------------------------------

  function arrivingWarden(scene) {
    const enemies = scene.enemies;
    for (let i = 0; i < enemies.length; i += 1) {
      const e = enemies[i];
      if (e && !e.destroyed && e.arrival) return e;
    }
    return null;
  }

  // Its recipe's shot, from inside the field toward the edge it comes
  // through (mirrored for the left edge), each pair eased over the entrance.
  function frameArrival(boss) {
    const a = boss.arrival;
    const { shot } = a.recipe;
    const k = smoothstep(a.progress);
    const along = ([from, to]) => from + (to - from) * k;
    const side = a.edge === 'left' ? -1 : 1;
    goal.x = a.to.x + (boss.x - a.to.x) * shot.look;
    goal.y = a.to.y + (boss.y - a.to.y) * shot.look;
    goal.distance = (along(shot.distance) * ARRIVAL_TAN_V) / lens.tanV;
    goal.tilt = along(shot.tilt) * DEG;
    goal.yaw = side * (90 + along(shot.turn)) * DEG;
  }

  // A look (a glance, a cleared wave's orbs) is wide for its own time.
  function looking(scene) {
    return glanceFor > 0 || (clearedFor > 0 && orbsLeft(scene));
  }

  // A danger keeps the view open `wideHold` s after it is gone: it may come
  // back.
  function holdFor(scene) {
    return threatOffNear(scene) || surrounded(scene) ? T.wideHold : 0;
  }

  // 1 when nothing threatens close by, fading to 0 as something nears.
  function calmness(scene) {
    let nearest = Infinity;
    const enemies = scene.enemies;
    for (let i = 0; i < enemies.length; i += 1) {
      const e = enemies[i];
      if (!e || e.destroyed) continue;
      nearest = Math.min(nearest, Math.hypot(e.x - scene.x, e.y - scene.y));
    }
    return smoothstep(nearest / T.drift.calmRange - 0.5);
  }

  // --- the springs ---------------------------------------------------------

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

  function snapAll() {
    px.value = goal.x;
    py.value = goal.y;
    dist.value = goal.distance;
    tilt.value = goal.tilt;
    yaw.value = goal.yaw;
    px.velocity = 0;
    py.velocity = 0;
    dist.velocity = 0;
    tilt.velocity = 0;
    yaw.velocity = 0;
  }

  // The ship stays on screen: move the shot the least toward it.
  function keepShip(scene) {
    const angles = pose;
    if (onScreen(pose, angles, scene.x, scene.y, SHIP_SHOWN)) return;
    const fromX = pose.x;
    const fromY = pose.y;
    let bad = 0;
    let ok = 1;
    for (let i = 0; i < BISECT_STEPS; i += 1) {
      const k = (bad + ok) / 2;
      pose.x = fromX + (scene.x - fromX) * k;
      pose.y = fromY + (scene.y - fromY) * k;
      if (onScreen(pose, angles, scene.x, scene.y, SHIP_SHOWN)) ok = k;
      else bad = k;
    }
    pose.x = fromX + (scene.x - fromX) * ok;
    pose.y = fromY + (scene.y - fromY) * ok;
    px.value = pose.x;
    py.value = pose.y;
  }

  const director = {
    pose,

    /** 'near' or 'wide'. */
    get moment() {
      return state;
    },

    setLens(next) {
      lens = next;
    },

    setReducedMotion(flag) {
      reducedMotion = Boolean(flag);
    },

    /** Dev scenes (`?moment=`): hold this state; null frees it. */
    force(name) {
      forced = MOMENTS.includes(name) ? name : null;
    },

    /**
     * A game event: 'cleared' (a wave's end: open for its orbs), or a short
     * wide look: 'waveStart', 'elite', 'telegraph' (an announced attack),
     * 'bossArrival'. A look at a `target` already in the near shot is
     * skipped. 'dive' (a boss falling or breaking a phase, `target` where
     * it is with its radius): back near at once and for `dive` s, whatever
     * else asks for wide, leaning toward it.
     */
    trigger(kind, target = null) {
      if (kind === 'cleared') {
        clearedFor = T.clearedHold;
        return;
      }
      if (kind === 'dive') {
        fallen.x = target?.x ?? 0;
        fallen.y = target?.y ?? 0;
        fallen.radius = target?.radius ?? 0;
        diveFor = T.dive;
        wideFor = 0;
        glanceFor = 0;
        handbackFor = T.arrival.handbackFor;
        return;
      }
      const seconds = T.glance[kind];
      if (seconds === undefined) return;
      if (target && onScreen(full, nearAngles, target.x, target.y, SHOWN)) {
        return;
      }
      glanceFor = Math.max(glanceFor, seconds);
    },

    /** The next update lands on its shot at once (a new run's first frame). */
    snap() {
      primed = false;
      lastShip = null;
    },

    reset() {
      state = forced || 'near';
      wideFor = 0;
      clearedFor = 0;
      glanceFor = 0;
      diveFor = 0;
      handbackFor = 0;
      sliding = false;
      director.snap();
    },

    /**
     * The shot this frame for `scene` (with a ship). `zoomPulse` scales how
     * close the settled shot is, near or wide (the dash, brake and level-up
     * kicks); not a Warden's entrance.
     */
    update(scene, dt, zoomPulse = 1) {
      const step = Math.max(0, dt);
      clock += step;
      clearedFor = Math.max(0, clearedFor - (diveFor > 0 ? 0 : step));
      diveFor = Math.max(0, diveFor - step);
      glanceFor = Math.max(0, glanceFor - step);
      handbackFor = Math.max(0, handbackFor - step);
      updateWide();
      updateNear(scene);

      const before = state;
      const warden = reducedMotion ? null : arrivingWarden(scene);
      if (warden) {
        state = 'arrival';
      } else if (forced) {
        state = forced;
      } else {
        wideFor = Math.max(wideFor - step, holdFor(scene));
        const open = looking(scene) || wideFor > 0;
        state = open && diveFor === 0 ? 'wide' : 'near';
      }
      if (before === 'arrival' && !warden) handbackFor = T.arrival.handbackFor;

      const isWide = state === 'wide';
      const live = state === 'arrival';
      goal.x = isWide ? wide.x : near.x;
      goal.y = isWide ? wide.y : near.y;
      goal.distance = isWide ? wide.distance : near.distance;
      goal.tilt = isWide ? wideAngles.tilt : nearAngles.tilt;
      goal.yaw = 0;
      if (live) frameArrival(warden);

      // The wrap: a jump of more than half the field slides across (a cut
      // under reduced motion).
      if (
        lastShip &&
        (Math.abs(scene.x - lastShip.x) > fieldWidth / 2 ||
          Math.abs(scene.y - lastShip.y) > fieldHeight / 2)
      ) {
        sliding = !reducedMotion;
        if (reducedMotion) primed = false;
      }
      lastShip = lastShip || { x: 0, y: 0 };
      lastShip.x = scene.x;
      lastShip.y = scene.y;

      if (!primed || (reducedMotion && before !== state)) {
        snapAll();
        primed = true;
      }

      const slow = reducedMotion ? T.reducedMotion.springScale : 1;
      const S = T.springs;
      const opening = goal.distance > dist.value;
      const zoomSmooth = (opening ? S.open : S.close) * slow;
      // The entrance and its hand-back move every part at one quick pace.
      const quick = live
        ? T.arrival.swoop
        : handbackFor > 0
          ? T.arrival.handback
          : 0;
      if (quick) {
        dampPosition(step, quick, Infinity);
        dampTo(dist, goal.distance, quick, step);
        dampTo(tilt, goal.tilt, quick, step);
      } else if (sliding) {
        dampPosition(step, T.springs.open, Infinity);
        if (Math.hypot(px.value - goal.x, py.value - goal.y) < 8) {
          sliding = false;
        }
      } else if (before !== state || Math.abs(dist.value - goal.distance) > 1) {
        // Between the two shots the target moves with the zoom.
        dampPosition(step, zoomSmooth, Infinity);
      } else {
        dampPosition(step, S.position * slow, topSpeed);
      }
      if (!quick) {
        dampTo(dist, goal.distance, zoomSmooth, step);
        dampTo(tilt, goal.tilt, S.tilt * slow, step);
      }
      dampTo(yaw, goal.yaw, quick || S.tilt, step);

      // The calm drift, near only: slow, continuous curves.
      let driftX = 0;
      let driftY = 0;
      let lean = 0;
      if (!isWide && !live && !reducedMotion) {
        const D = T.drift;
        const e = shotExtent(dist.value, nearAngles, lens, extent);
        const amount =
          calmness(scene) *
          D.offset *
          Math.min(e.left + e.right, e.up + e.down);
        const w = (2 * Math.PI) / D.period;
        driftX = amount * Math.sin(clock * w);
        driftY = amount * Math.sin(clock * w * 0.73 + 1.3);
        lean =
          calmness(scene) * D.lean * DEG * Math.sin(clock * w * 0.61 + 2.1);
      }

      pose.x = px.value + driftX;
      pose.y = py.value + driftY;
      pose.distance = live ? dist.value : dist.value / zoomPulse;
      pose.tilt = tilt.value;
      pose.yaw = yaw.value;
      pose.roll = lean;
      pose.rollMax = isWide || live || reducedMotion ? 0 : T.roll * DEG;
      // A low shot sees past the field's far side: it has no fit, and the
      // ship may be off it.
      if (live) {
        pose.zoom = 1;
        return pose;
      }
      pose.zoom =
        fieldFitDistance(pose, lens, fieldWidth, fieldHeight) / pose.distance;
      keepShip(scene);
      return pose;
    },
  };

  return director;
}
