// Game camera (docs/NORTE.md §2 "Câmera"): frames the 800×600 logical field
// at a zoom, following the player with a dead zone and a smoothed lag. The
// view is clamped to the field, so nothing past the edges (and no wrap seam)
// is ever visible. `?camera=0` restores the fixed full-field view.
//
// Apply order per frame: base transform → screen shake → applyTransform(ctx).

import { GAME_HEIGHT, GAME_WIDTH } from './GameConstants.js';

export const CAMERA_ZOOM = 1.3;
const DEAD_ZONE_HALF_WIDTH = 30;
const DEAD_ZONE_HALF_HEIGHT = 22.5;
const FOLLOW_TIME_CONSTANT = 0.25;
// Share of a zoom pulse spent pushing in; the rest eases back out.
const PULSE_ATTACK = 0.3;

export function cameraDisabledByUrl() {
  try {
    return new URLSearchParams(window.location.search).get('camera') === '0';
  } catch {
    return false;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

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
  let lastTarget = null;
  let baseZoom = zoom;
  let pulse = null;

  const camera = {
    x: fieldWidth / 2,
    y: fieldHeight / 2,
    zoom,

    get effectiveZoom() {
      return enabled ? camera.zoom : 1;
    },

    update(targetX, targetY, dt) {
      if (!enabled) {
        camera.reset();
        return;
      }
      if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;
      advancePulse(dt);

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

      const step = 1 - Math.exp(-Math.max(0, dt) / FOLLOW_TIME_CONSTANT);
      camera.x +=
        outsideDeadZone(targetX - camera.x, DEAD_ZONE_HALF_WIDTH) * step;
      camera.y +=
        outsideDeadZone(targetY - camera.y, DEAD_ZONE_HALF_HEIGHT) * step;
      clampToField();
    },

    applyTransform(ctx) {
      const z = camera.effectiveZoom;
      ctx.translate(fieldWidth / 2, fieldHeight / 2);
      ctx.scale(z, z);
      ctx.translate(-camera.x, -camera.y);
    },

    getView() {
      const z = camera.effectiveZoom;
      const width = fieldWidth / z;
      const height = fieldHeight / z;
      return {
        x: camera.x - width / 2,
        y: camera.y - height / 2,
        width,
        height,
      };
    },

    setZoom(z) {
      if (Number.isFinite(z) && z > 0) {
        baseZoom = z;
        camera.zoom = z;
      }
      clampToField();
    },

    // Pushes the zoom to `peak` and back to the base over `duration` s.
    pulseZoom(peak, duration) {
      if (Number.isFinite(peak) && peak > 0 && duration > 0) {
        pulse = { peak, duration, elapsed: 0 };
      }
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
    },

    setEnabled(flag) {
      enabled = Boolean(flag);
      if (!enabled) camera.reset();
    },

    isEnabled() {
      return enabled;
    },
  };

  function advancePulse(dt) {
    if (!pulse) return;
    pulse.elapsed += Math.max(0, dt);
    const t = pulse.elapsed / pulse.duration;
    if (t >= 1) {
      pulse = null;
      camera.zoom = baseZoom;
      return;
    }
    const envelope =
      t < PULSE_ATTACK
        ? Math.sin((t / PULSE_ATTACK) * (Math.PI / 2))
        : 0.5 +
          0.5 * Math.cos(((t - PULSE_ATTACK) / (1 - PULSE_ATTACK)) * Math.PI);
    camera.zoom = baseZoom + (pulse.peak - baseZoom) * envelope;
  }

  function clampToField() {
    const z = camera.effectiveZoom;
    if (z <= 1) {
      camera.x = fieldWidth / 2;
      camera.y = fieldHeight / 2;
      return;
    }
    const halfW = fieldWidth / (2 * z);
    const halfH = fieldHeight / (2 * z);
    camera.x = clamp(camera.x, halfW, fieldWidth - halfW);
    camera.y = clamp(camera.y, halfH, fieldHeight - halfH);
  }

  return camera;
}
