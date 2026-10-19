// Game camera (docs/NORTE.md §2 "Câmera"): frames the 800×600 logical field
// at a zoom on a screen of any aspect, following the player with a dead zone
// and a smoothed lag. The view never outgrows the field and is clamped to it,
// so nothing past the edges (and no wrap seam) is ever visible. The renderer
// tells it how far its tilted shot really reaches (setReach); headless, the
// flat view is the shot.
//
// Modes (PLAN R5.7, proposta 18/10): 'dynamic' (default) leads toward the
// aim (or along the hull with Settings → Controls → Camera Lead), breathes
// the zoom with the threat count and frames ship + boss;
// 'classic' is the plain follow (`?camera=1`, or Settings → Graphics);
// 'static' is the fixed full-field view (`?camera=0`). In either moving mode a
// travel (travelTo: the Warden's arrival) takes the shot to a target and back.
//
// Apply order per frame: base transform → screen shake → applyTransform(ctx).

import { GAME_HEIGHT, GAME_WIDTH, SHIP_MAX_SPEED } from './GameConstants.js';

export const CAMERA_ZOOM = 1.3;
const DEAD_ZONE_HALF_WIDTH = 30;
const DEAD_ZONE_HALF_HEIGHT = 22.5;
const FOLLOW_TIME_CONSTANT = 0.25;
// Share of a zoom pulse spent pushing in; the rest eases back out.
const PULSE_ATTACK = 0.3;

// Look-ahead: half the distance to the aim point, at most LOOK_AHEAD_MAX;
// a full LOOK_AHEAD_MAX along the nose when it leads on the hull.
export const LOOK_AHEAD_MAX = 90;
const LOOK_AHEAD_GAIN = 0.5;
const LOOK_AHEAD_SMOOTH = 0.35;
// Threat zoom: base (1.3×) up to THREAT_CALM enemies near the ship, down to
// base × THREAT_BUSY_RATIO (1.05×) at THREAT_BUSY or more.
export const THREAT_RADIUS = 500;
const THREAT_CALM = 2;
const THREAT_BUSY = 10;
const THREAT_BUSY_RATIO = 1.05 / CAMERA_ZOOM;
const THREAT_ZOOM_SMOOTH = 1.2;
// Boss framing: a boss/herald this close pulls the shot to a 60/40 midpoint
// at the zoom that keeps both inside the margin.
export const FRAME_RANGE = 900;
const FRAME_SHIP_WEIGHT = 0.6;
const FRAME_MARGIN = 120;
const FRAME_ZOOM_MIN = 0.85;
const FRAME_ZOOM_MAX = 1.3;
const FRAME_ZOOM_SMOOTH = 0.35;
const MODE_BLEND_SECONDS = 0.6;
// Reduced motion: zoom changes take this many times longer.
const REDUCED_MOTION_ZOOM_SLOWDOWN = 2.5;

// 'static' for `?camera=0`, 'classic' for `?camera=1`, else null.
function cameraModeFromUrl() {
  try {
    const value = new URLSearchParams(window.location.search).get('camera');
    if (value === '0') return 'static';
    if (value === '1') return 'classic';
  } catch {
    // no window (Node tests)
  }
  return null;
}

/** The mode to run: the URL flag wins over the Graphics setting. */
export function resolveCameraMode(setting) {
  return cameraModeFromUrl() || (setting === 'classic' ? 'classic' : 'dynamic');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep01(t) {
  return t * t * (3 - 2 * t);
}

/**
 * Critically damped step of `d` ({ value, velocity }) toward `target`
 * (Game Programming Gems 4, 1.10): no overshoot, frame-rate independent.
 */
export function dampTo(d, target, smoothTime, dt) {
  const step = Math.max(0, dt);
  const omega = 2 / smoothTime;
  const x = omega * step;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = d.value - target;
  const temp = (d.velocity + omega * change) * step;
  d.velocity = (d.velocity - omega * temp) * decay;
  d.value = target + (change + temp) * decay;
  return d.value;
}

/**
 * The look-ahead offset (out.x/y) the scene asks for at ship (x, y). `lead`
 * 'hull' looks along the hull heading, 'aim' toward the aim point.
 */
export function lookAheadFor(scene, x, y, out, lead = 'aim') {
  let dx = 0;
  let dy = 0;
  let length = 0;
  if (lead === 'hull') {
    dx = Math.cos(scene.heading);
    dy = Math.sin(scene.heading);
    length = LOOK_AHEAD_MAX;
  } else if (scene.hasAim) {
    dx = scene.aimX - x;
    dy = scene.aimY - y;
    length = Math.min(LOOK_AHEAD_MAX, Math.hypot(dx, dy) * LOOK_AHEAD_GAIN);
  } else {
    dx = scene.vx;
    dy = scene.vy;
    length = LOOK_AHEAD_MAX * Math.min(1, Math.hypot(dx, dy) / SHIP_MAX_SPEED);
  }
  const d = Math.hypot(dx, dy);
  out.x = d > 1e-6 ? (dx / d) * length : 0;
  out.y = d > 1e-6 ? (dy / d) * length : 0;
  return out;
}

/** The zoom for `count` enemies near the ship (non-increasing in count). */
export function threatZoomFor(count, base = CAMERA_ZOOM) {
  const t = clamp((count - THREAT_CALM) / (THREAT_BUSY - THREAT_CALM), 0, 1);
  return base * (1 - (1 - THREAT_BUSY_RATIO) * t);
}

/**
 * Midpoint (ship 0.6 / boss 0.4) and the zoom that fits both + margin in a
 * view of viewWidth × viewHeight at zoom 1 (the field's, at 4:3). The boss
 * counts with its radius, so a wide Warden's rim stays inside the margin
 * instead of its centre only.
 */
export function frameFor(
  ax,
  ay,
  bx,
  by,
  out,
  viewWidth = GAME_WIDTH,
  viewHeight = GAME_HEIGHT,
  bossRadius = 0
) {
  const mx = ax * FRAME_SHIP_WEIGHT + bx * (1 - FRAME_SHIP_WEIGHT);
  const my = ay * FRAME_SHIP_WEIGHT + by * (1 - FRAME_SHIP_WEIGHT);
  const hx =
    Math.max(Math.abs(ax - mx), Math.abs(bx - mx) + bossRadius) + FRAME_MARGIN;
  const hy =
    Math.max(Math.abs(ay - my), Math.abs(by - my) + bossRadius) + FRAME_MARGIN;
  out.x = mx;
  out.y = my;
  out.zoom = clamp(
    Math.min(viewWidth / (2 * hx), viewHeight / (2 * hy)),
    FRAME_ZOOM_MIN,
    FRAME_ZOOM_MAX
  );
  return out;
}

/** What the dynamic camera reads each frame, from the live services. */
export function createCameraScene() {
  return {
    hasAim: false,
    aimX: 0,
    aimY: 0,
    vx: 0,
    vy: 0,
    heading: 0,
    threats: 0,
    hasBoss: false,
    bossX: 0,
    bossY: 0,
    bossRadius: 0,
  };
}

export function readCameraScene(scene, player, combat, enemies) {
  const position = player?.position;
  const aim = combat?.getPrimaryAimPoint?.() || null;
  scene.hasAim = Boolean(aim);
  scene.aimX = aim ? aim.x : 0;
  scene.aimY = aim ? aim.y : 0;
  scene.vx = player?.velocity?.vx || 0;
  scene.vy = player?.velocity?.vy || 0;
  scene.heading = player?.angle || 0;
  scene.threats = 0;
  scene.hasBoss = false;
  if (!position) return scene;
  let bossDistance = FRAME_RANGE * FRAME_RANGE;
  const reach = THREAT_RADIUS * THREAT_RADIUS;
  for (let i = 0; i < enemies.length; i += 1) {
    const e = enemies[i];
    if (!e || e.destroyed) continue;
    const dx = e.x - position.x;
    const dy = e.y - position.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= reach) scene.threats += 1;
    if ((e.type === 'boss' || e.type === 'herald') && d2 <= bossDistance) {
      bossDistance = d2;
      scene.hasBoss = true;
      scene.bossX = e.x;
      scene.bossY = e.y;
      scene.bossRadius = e.radius || 0;
    }
  }
  return scene;
}

const EMPTY_SCENE = Object.freeze(createCameraScene());

// Distance from the dead-zone box to the point (0 inside it).
function outsideDeadZone(delta, half) {
  return delta - clamp(delta, -half, half);
}

// What the follow closes of `delta`: what lies past the dead zone, and the
// rest too as a travel's weight `w` nears 1 (the shot lands on its target).
function followDelta(delta, half, w) {
  const outside = outsideDeadZone(delta, half);
  return outside + (delta - outside) * w;
}

export function createCamera({
  zoom = CAMERA_ZOOM,
  fieldWidth = GAME_WIDTH,
  fieldHeight = GAME_HEIGHT,
} = {}) {
  let enabled = true;
  let mode = 'dynamic';
  let lead = 'aim';
  let reducedMotion = false;
  // How much wider than the field the screen is (aspect ÷ field aspect).
  let stretch = 1;
  // How far the rendered shot reaches from the follow point (setReach);
  // null until a renderer sets it, and the flat view stands in.
  let shot = null;
  let lastTarget = null;
  let baseZoom = zoom;
  let pulse = null;
  let pulseFactor = 1;
  // A timed trip of the shot to a target and back (travelTo) and its eased
  // 0..1 weight this frame.
  let travel = null;
  let travelWeight = 0;
  // Dynamic state: smoothed look-ahead, threat zoom, framing zoom and the
  // 0..1 blend toward boss framing.
  const lookX = { value: 0, velocity: 0 };
  const lookY = { value: 0, velocity: 0 };
  const threatZoom = { value: zoom, velocity: 0 };
  const fitZoom = { value: zoom, velocity: 0 };
  let frameBlend = 0;
  const boss = { x: 0, y: 0, radius: 0 };
  const goal = { x: 0, y: 0, zoom };
  const size = { width: fieldWidth, height: fieldHeight };
  const flat = { halfWidth: 0, up: 0, down: 0 };

  const camera = {
    x: fieldWidth / 2,
    y: fieldHeight / 2,
    zoom,

    get effectiveZoom() {
      return enabled ? camera.zoom : 1;
    },

    get mode() {
      return enabled ? mode : 'static';
    },

    // 0 = plain follow, 1 = boss framing (eased).
    get frameWeight() {
      return smoothstep01(frameBlend);
    },

    /**
     * Follows (targetX, targetY), the ship. `scene` (readCameraScene) feeds
     * the dynamic mode; without it the dynamic camera is the classic one.
     */
    update(targetX, targetY, dt, scene = EMPTY_SCENE) {
      if (!enabled) {
        camera.reset();
        return;
      }
      if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;
      advancePulse(dt);
      advanceTravel(dt);
      let followX = targetX;
      let followY = targetY;
      if (mode === 'dynamic') {
        dynamicGoal(targetX, targetY, dt, scene);
        followX = goal.x;
        followY = goal.y;
        camera.zoom = goal.zoom * pulseFactor;
      } else {
        camera.zoom = baseZoom * pulseFactor;
      }
      // A travel pulls the followed point and the zoom toward its target,
      // and the follow below tightens to a direct one with its weight.
      if (travelWeight > 0) {
        followX += (travel.x - followX) * travelWeight;
        followY += (travel.y - followY) * travelWeight;
        camera.zoom += (travel.zoom - camera.zoom) * travelWeight;
      }

      // The field wraps: a jump of more than half of it is a wrap, not motion.
      const wrapped =
        lastTarget &&
        (Math.abs(targetX - lastTarget.x) > fieldWidth / 2 ||
          Math.abs(targetY - lastTarget.y) > fieldHeight / 2);
      lastTarget = { x: targetX, y: targetY };
      if (wrapped) {
        camera.snapTo(followX, followY);
        lastTarget = { x: targetX, y: targetY };
        return;
      }

      const w = travelWeight;
      const lag = 1 - Math.exp(-Math.max(0, dt) / FOLLOW_TIME_CONSTANT);
      const step = lag + (1 - lag) * w;
      camera.x +=
        followDelta(followX - camera.x, DEAD_ZONE_HALF_WIDTH, w) * step;
      camera.y +=
        followDelta(followY - camera.y, DEAD_ZONE_HALF_HEIGHT, w) * step;
      clampToField();
    },

    applyTransform(ctx) {
      const z = camera.effectiveZoom;
      ctx.translate(fieldWidth / 2, fieldHeight / 2);
      ctx.scale(z, z);
      ctx.translate(-camera.x, -camera.y);
    },

    /** What is on screen: the bounding box of the shot's reach. */
    getView() {
      const { halfWidth, up, down } = reach();
      return {
        x: camera.x - halfWidth,
        y: camera.y - up,
        width: 2 * halfWidth,
        height: up + down,
      };
    },

    /** The flat view's size at this zoom and aspect (viewSize below). */
    flatView() {
      const { width, height } = viewSize(camera.effectiveZoom);
      return { width, height };
    },

    /** The screen's width ÷ height (the renderer's canvas). */
    setAspect(aspect) {
      stretch = aspect / (fieldWidth / fieldHeight);
      clampToField();
    },

    /**
     * How far the rendered shot reaches from the follow point, in field
     * units: `halfWidth` to each side, `up` and `down`. The clamp and
     * getView use it from now on.
     */
    setReach({ halfWidth, up, down }) {
      shot = shot || { halfWidth: 0, up: 0, down: 0 };
      shot.halfWidth = halfWidth;
      shot.up = up;
      shot.down = down;
      clampToField();
    },

    setZoom(z) {
      if (Number.isFinite(z) && z > 0) {
        baseZoom = z;
        camera.zoom = z;
        resetDynamic();
      }
      clampToField();
    },

    // Pushes the zoom to `peak` (under the base: pulls out) and back to the
    // base over `duration` s, leaving from where a running pulse has it. A
    // pulse weaker than the running one's peak is dropped, even in its first
    // frames: a dash never cuts the level-up push short.
    pulseZoom(peak, duration) {
      if (!(Number.isFinite(peak) && peak > 0 && duration > 0)) return;
      const strength = (factor) => Math.abs(factor / baseZoom - 1);
      if (pulse && strength(peak) < strength(pulse.peak)) return;
      pulse = { peak, duration, elapsed: 0, from: pulseFactor };
    },

    // Takes the shot to `target` (anything with x/y, read live: the Warden)
    // and back: eases there over `travelIn` s, holds `hold` s at `zoom`,
    // eases back over `travelBack` s, the follow carrying on underneath. A
    // call while one runs only retargets it: trips never stack.
    travelTo(target, { travelIn, hold, travelBack, zoom: travelZoom }) {
      if (!enabled) return;
      if (travel) {
        travel.target = target;
        return;
      }
      travel = {
        target,
        x: target.x,
        y: target.y,
        zoom: travelZoom,
        travelIn,
        hold,
        travelBack,
        elapsed: 0,
      };
    },

    snapTo(x, y) {
      if (!enabled) return;
      camera.x = x;
      camera.y = y;
      lastTarget = { x, y };
      clampToField();
    },

    reset() {
      camera.x = fieldWidth / 2;
      camera.y = fieldHeight / 2;
      camera.zoom = baseZoom;
      lastTarget = null;
      pulse = null;
      pulseFactor = 1;
      travel = null;
      travelWeight = 0;
      resetDynamic();
    },

    setEnabled(flag) {
      enabled = Boolean(flag);
      if (!enabled) camera.reset();
    },

    /** 'dynamic' | 'classic' | 'static' (see resolveCameraMode). */
    setMode(next) {
      if (camera.mode === next) return;
      camera.setEnabled(next !== 'static');
      mode = next === 'classic' ? 'classic' : 'dynamic';
      resetDynamic();
    },

    /** 'aim' | 'hull': what the dynamic look-ahead follows. */
    setLead(next) {
      lead = next === 'hull' ? 'hull' : 'aim';
    },

    setReducedMotion(flag) {
      reducedMotion = Boolean(flag);
    },

    isEnabled() {
      return enabled;
    },
  };

  // The pulse scales whatever zoom the mode wants, so the two never fight:
  // at base zoom it is base + (peak - base) × envelope. The attack leaves
  // from the factor the pulse started at (1 unless it replaced another).
  function advancePulse(dt) {
    pulseFactor = 1;
    if (!pulse) return;
    pulse.elapsed += Math.max(0, dt);
    const t = pulse.elapsed / pulse.duration;
    if (t >= 1) {
      pulse = null;
      return;
    }
    const envelope =
      t < PULSE_ATTACK
        ? Math.sin((t / PULSE_ATTACK) * (Math.PI / 2))
        : 0.5 +
          0.5 * Math.cos(((t - PULSE_ATTACK) / (1 - PULSE_ATTACK)) * Math.PI);
    const from = t < PULSE_ATTACK ? pulse.from : 1;
    pulseFactor = from + (pulse.peak / baseZoom - from) * envelope;
  }

  // travelWeight: eased in over travelIn, 1 through the hold, eased out over
  // travelBack. A target destroyed mid-trip keeps its last position.
  function advanceTravel(dt) {
    travelWeight = 0;
    if (!travel) return;
    travel.elapsed += Math.max(0, dt);
    const { elapsed, travelIn, hold, travelBack, target } = travel;
    const back = elapsed - travelIn - hold;
    if (back >= travelBack) {
      travel = null;
      return;
    }
    if (!target.destroyed) {
      travel.x = target.x;
      travel.y = target.y;
    }
    travelWeight = smoothstep01(
      back > 0 ? 1 - back / travelBack : Math.min(1, elapsed / travelIn)
    );
  }

  // goal.x/y/zoom: ship + look-ahead at the threat zoom, blended over
  // MODE_BLEND_SECONDS toward the boss framing.
  function dynamicGoal(x, y, dt, scene) {
    const slow = reducedMotion ? REDUCED_MOTION_ZOOM_SLOWDOWN : 1;
    lookAheadFor(scene, x, y, goal, lead);
    dampTo(lookX, goal.x, LOOK_AHEAD_SMOOTH, dt);
    dampTo(lookY, goal.y, LOOK_AHEAD_SMOOTH, dt);
    dampTo(
      threatZoom,
      threatZoomFor(scene.threats, baseZoom),
      THREAT_ZOOM_SMOOTH * slow,
      dt
    );

    const framing =
      scene.hasBoss &&
      Math.hypot(scene.bossX - x, scene.bossY - y) <= FRAME_RANGE;
    if (framing) {
      boss.x = scene.bossX;
      boss.y = scene.bossY;
      boss.radius = scene.bossRadius;
    }
    // Entering from plain follow, the framing zoom starts where we are.
    if (framing && frameBlend === 0) {
      fitZoom.value = threatZoom.value;
      fitZoom.velocity = 0;
    }
    frameBlend = clamp(
      frameBlend + ((framing ? 1 : -1) * Math.max(0, dt)) / MODE_BLEND_SECONDS,
      0,
      1
    );
    const w = smoothstep01(frameBlend);
    // Leaving (boss dead or far), frame its last position while blending out.
    if (w > 0) {
      frameFor(
        x,
        y,
        boss.x,
        boss.y,
        goal,
        fieldWidth * stretch,
        fieldHeight,
        boss.radius
      );
    }
    if (w > 0) dampTo(fitZoom, goal.zoom, FRAME_ZOOM_SMOOTH * slow, dt);
    const leadX = x + lookX.value;
    const leadY = y + lookY.value;
    goal.x = w > 0 ? leadX + (goal.x - leadX) * w : leadX;
    goal.y = w > 0 ? leadY + (goal.y - leadY) * w : leadY;
    goal.zoom = threatZoom.value + (fitZoom.value - threatZoom.value) * w;
  }

  function resetDynamic() {
    lookX.value = 0;
    lookX.velocity = 0;
    lookY.value = 0;
    lookY.velocity = 0;
    threatZoom.value = baseZoom;
    threatZoom.velocity = 0;
    frameBlend = 0;
  }

  // The field units the view spans: the field's height over the zoom, as
  // wide as the screen's aspect, shrunk until it fits the field (at 4:3,
  // fieldWidth/zoom × fieldHeight/zoom, the whole field from zoom 1 down).
  function viewSize(z) {
    const fit = Math.max(z, stretch, 1);
    size.width = (fieldWidth * stretch) / fit;
    size.height = fieldHeight / fit;
    return size;
  }

  // How far the view reaches from the follow point: the shot's, once set,
  // else half the flat view each way.
  function reach() {
    if (shot) return shot;
    const { width, height } = viewSize(camera.effectiveZoom);
    flat.halfWidth = width / 2;
    flat.up = height / 2;
    flat.down = height / 2;
    return flat;
  }

  function clampToField() {
    const { halfWidth, up, down } = reach();
    camera.x = clamp(camera.x, halfWidth, fieldWidth - halfWidth);
    camera.y = clamp(camera.y, up, fieldHeight - down);
  }

  return camera;
}
