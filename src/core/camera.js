// Game camera (docs/NORTE.md §2 "Câmera"): frames the 800×600 logical field
// at a zoom on a screen of any aspect. The view never outgrows the field and
// is clamped to it, so nothing past the edges (and no wrap seam) is ever
// visible. The renderer tells it how far its tilted shot really reaches
// (setReach); headless, the flat view is the shot.
//
// Modes: 'dynamic' (default) hands the shot to the camera director
// (cameraDirector.js, PLAN.md 14.2b): top-down, near the ship or wide on the
// whole field, and free to show past the field's edge; 'classic' is the plain
// follow with a dead zone and a smoothed lag (`?camera=1`, or Settings →
// Graphics), which is also what the dynamic mode does without a scene;
// 'static' is the fixed full-field view (`?camera=0`). Dev: `?moment=near` or
// `?moment=wide` holds the director in that state.
//
// Apply order per frame: base transform → screen shake → applyTransform(ctx).

import {
  createDirector,
  createDirectorScene,
  MOMENTS,
} from './cameraDirector.js';
import { IS_DEV } from './env.js';
import { GAME_HEIGHT, GAME_WIDTH, SHIP_MAX_SPEED } from './GameConstants.js';

export const CAMERA_ZOOM = 1.3;
const DEAD_ZONE_HALF_WIDTH = 30;
const DEAD_ZONE_HALF_HEIGHT = 22.5;
const FOLLOW_TIME_CONSTANT = 0.25;
// Share of a zoom pulse spent pushing in; the rest eases back out.
const PULSE_ATTACK = 0.3;

// Look-ahead: half the distance to the aim point, at most LOOK_AHEAD_MAX;
// a full LOOK_AHEAD_MAX along the nose when it leads on the hull. The
// director caps it further, to a share of the view.
export const LOOK_AHEAD_MAX = 90;
const LOOK_AHEAD_GAIN = 0.5;

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

// Dev scenes: `?moment=<name>` holds the director in that moment.
function momentFromUrl() {
  if (!IS_DEV) return null;
  try {
    const value = new URLSearchParams(window.location.search).get('moment');
    return MOMENTS.includes(value) ? value : null;
  } catch {
    return null; // no window (Node tests)
  }
}

/** The mode to run: the URL flag wins over the Graphics setting. */
export function resolveCameraMode(setting) {
  return cameraModeFromUrl() || (setting === 'classic' ? 'classic' : 'dynamic');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

/** What the dynamic camera reads each frame, from the live services. */
export function createCameraScene() {
  return createDirectorScene();
}

const EMPTY_LIST = Object.freeze([]);

/**
 * Fills `scene` for the director: the ship, its aim, the live enemies, the
 * hostile shots (combat.enemyBullets) and the XP orbs, read in place.
 */
export function readCameraScene(scene, player, combat, enemies, xpOrbs) {
  const position = player?.position;
  const aim = combat?.getPrimaryAimPoint?.() || null;
  scene.hasShip = Boolean(position);
  scene.x = position ? position.x : 0;
  scene.y = position ? position.y : 0;
  scene.hasAim = Boolean(aim);
  scene.aimX = aim ? aim.x : 0;
  scene.aimY = aim ? aim.y : 0;
  scene.vx = player?.velocity?.vx || 0;
  scene.vy = player?.velocity?.vy || 0;
  scene.heading = player?.angle || 0;
  scene.enemies = enemies || EMPTY_LIST;
  scene.shots = combat?.enemyBullets || EMPTY_LIST;
  scene.orbs = xpOrbs?.xpOrbs || EMPTY_LIST;
  return scene;
}

const EMPTY_SCENE = Object.freeze(createCameraScene());

// Distance from the dead-zone box to the point (0 inside it).
function outsideDeadZone(delta, half) {
  return delta - clamp(delta, -half, half);
}

export function createCamera({
  zoom = CAMERA_ZOOM,
  fieldWidth = GAME_WIDTH,
  fieldHeight = GAME_HEIGHT,
} = {}) {
  let enabled = true;
  let mode = 'dynamic';
  let lead = 'aim';
  // How much wider than the field the screen is (aspect ÷ field aspect).
  let stretch = 1;
  // How far the rendered shot reaches from the follow point (setReach);
  // null until a renderer sets it, and the flat view stands in.
  let shot = null;
  let lastTarget = null;
  let baseZoom = zoom;
  let pulse = null;
  let pulseFactor = 1;
  const director = createDirector({ fieldWidth, fieldHeight });
  director.force(momentFromUrl());
  // The director's shot of the last update, null when it did not direct.
  let directed = null;
  const leadOut = { x: 0, y: 0 };
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

    /**
     * The director's shot this frame ({ x, y, distance, tilt, yaw, roll,
     * rollMax, zoom }, see cameraDirector.js), or null when the camera
     * follows plainly (classic, static, no scene).
     */
    get directed() {
      return directed;
    },

    /** The director's state: 'near' or 'wide'. */
    get moment() {
      return director.moment;
    },

    /**
     * Follows (targetX, targetY), the ship. `scene` (readCameraScene) feeds
     * the dynamic mode; without it the dynamic camera is the classic one.
     */
    update(targetX, targetY, dt, scene = EMPTY_SCENE) {
      directed = null;
      if (!enabled) {
        camera.reset();
        return;
      }
      if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;
      advancePulse(dt);
      if (mode === 'dynamic' && scene.hasShip) {
        lookAheadFor(scene, targetX, targetY, leadOut, lead);
        scene.leadX = leadOut.x;
        scene.leadY = leadOut.y;
        directed = director.update(scene, dt, pulseFactor);
        camera.x = directed.x;
        camera.y = directed.y;
        camera.zoom = directed.zoom * Math.max(stretch, 1);
        lastTarget = { x: targetX, y: targetY };
        return;
      }
      camera.zoom = baseZoom * pulseFactor;

      // The field wraps: a jump of more than half of it is a wrap, not motion.
      const wrapped =
        lastTarget &&
        (Math.abs(targetX - lastTarget.x) > fieldWidth / 2 ||
          Math.abs(targetY - lastTarget.y) > fieldHeight / 2);
      lastTarget = { x: targetX, y: targetY };
      if (wrapped) {
        camera.snapTo(targetX, targetY);
        return;
      }

      const lag = 1 - Math.exp(-Math.max(0, dt) / FOLLOW_TIME_CONSTANT);
      camera.x +=
        outsideDeadZone(targetX - camera.x, DEAD_ZONE_HALF_WIDTH) * lag;
      camera.y +=
        outsideDeadZone(targetY - camera.y, DEAD_ZONE_HALF_HEIGHT) * lag;
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

    /** The perspective lens the director frames with (cameraShot.js). */
    setLens(lens) {
      director.setLens(lens);
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
      }
      clampToField();
    },

    // Pushes the zoom to `peak` (under the base: pulls out) and back to the
    // base over `duration` s, leaving from where a running pulse has it. A
    // pulse weaker than the running one's peak is dropped, even in its first
    // frames: a dash never cuts the level-up push short. The director scales
    // its own zoom by the same factor, outside its special moments.
    pulseZoom(peak, duration) {
      if (!(Number.isFinite(peak) && peak > 0 && duration > 0)) return;
      const strength = (factor) => Math.abs(factor / baseZoom - 1);
      if (pulse && strength(peak) < strength(pulse.peak)) return;
      pulse = { peak, duration, elapsed: 0, from: pulseFactor };
    },

    /**
     * A game event for the director: 'cleared', 'waveStart', 'elite' (with
     * where it spawned), 'telegraph' or 'bossArrival'.
     */
    trigger(kind, target) {
      if (enabled && mode === 'dynamic') director.trigger(kind, target);
    },

    snapTo(x, y) {
      if (!enabled) return;
      camera.x = x;
      camera.y = y;
      lastTarget = { x, y };
      director.snap();
      clampToField();
    },

    reset() {
      camera.x = fieldWidth / 2;
      camera.y = fieldHeight / 2;
      camera.zoom = baseZoom;
      lastTarget = null;
      pulse = null;
      pulseFactor = 1;
      directed = null;
      director.reset();
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
      director.reset();
    },

    /** 'aim' | 'hull': what the dynamic look-ahead follows. */
    setLead(next) {
      lead = next === 'hull' ? 'hull' : 'aim';
    },

    setReducedMotion(flag) {
      director.setReducedMotion(flag);
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
