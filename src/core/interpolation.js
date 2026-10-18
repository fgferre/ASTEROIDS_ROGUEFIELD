// Render interpolation between fixed simulation steps (fixedStep.js).
//
// The simulation advances in 1/60 s steps but a 144 Hz screen draws 2–3
// frames per step: drawn at their live positions, entities would sit still
// for a frame or two and then jump. After every step the renderer captures
// each entity's pose (prev ← curr, curr ← live) and draws at
// lerp(prev, curr, alpha), alpha being the fixed stepper's leftover fraction.
// Render-only: the simulation never sees an interpolated value.
// `?interp=0` draws live positions (A/B).

const TAU = Math.PI * 2;
// A jump longer than this in one step is a teleport (respawn, pool reuse,
// wrap): drawn at once, never slid across the field.
export const TELEPORT_DISTANCE = 100;

export function interpolationDisabledByUrl() {
  try {
    return new URLSearchParams(window.location.search).get('interp') === '0';
  } catch {
    return false;
  }
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Interpolates along the shortest arc (radians, any winding). */
export function lerpAngle(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return a + d * t;
}

export class StepInterpolator {
  constructor() {
    this.records = new Map();
    this.stamp = 0;
  }

  /** Starts one simulation step's captures. */
  beginStep() {
    this.stamp += 1;
  }

  /**
   * The pose of `key` at the end of the step. First sight (or a new `id` on
   * a pooled object, or a teleport) snaps: prev = curr, no slide-in.
   */
  capture(key, x, y, angle = 0, id = null) {
    let r = this.records.get(key);
    if (!r) {
      r = { px: x, py: y, pa: angle, cx: x, cy: y, ca: angle, id, stamp: 0 };
      this.records.set(key, r);
    }
    const jump = Math.hypot(x - r.cx, y - r.cy);
    const fresh =
      r.stamp !== this.stamp - 1 || r.id !== id || !(jump <= TELEPORT_DISTANCE);
    r.px = fresh ? x : r.cx;
    r.py = fresh ? y : r.cy;
    r.pa = fresh ? angle : r.ca;
    r.cx = x;
    r.cy = y;
    r.ca = angle;
    r.id = id;
    r.stamp = this.stamp;
  }

  /** Forgets whatever was not captured this step. */
  endStep() {
    this.records.forEach((r, key) => {
      if (r.stamp !== this.stamp) this.records.delete(key);
    });
  }

  /**
   * Writes the pose at `alpha` (0 = previous step, 1 = latest) into `out`
   * and returns it; null when the live pose (x, y, angle) is not the one
   * last captured — something moved it outside a step, so draw it live.
   */
  sample(key, x, y, angle, alpha, out) {
    const r = this.records.get(key);
    if (!r || r.cx !== x || r.cy !== y || r.ca !== angle) return null;
    const t = Math.max(0, Math.min(1, alpha));
    out.x = lerp(r.px, r.cx, t);
    out.y = lerp(r.py, r.cy, t);
    out.angle = lerpAngle(r.pa, r.ca, t);
    return out;
  }

  clear() {
    this.records.clear();
  }
}
