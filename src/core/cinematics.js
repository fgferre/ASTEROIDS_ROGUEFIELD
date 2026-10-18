// Camera paths of the run's two cinematics (PLAN.md R5.1): the intro descends
// from high over the Ring down to the ship, the victory epilogue pulls back
// while the Ring lights up. Pure functions of t (0..1, clamped) returning a
// pose relative to the follow camera: `distance` multiplies the follow
// distance, `tilt` is in degrees, `offsetX/offsetY` move the look-at point in
// logical units, `wake` (0..1) lights the Ring. Both end where the follow
// camera (or the held victory shot) takes over.

export const INTRO_MS = 3000;
export const EPILOGUE_MS = 4000;

export const FOLLOW_TILT = 18;
const INTRO_DISTANCE = 3.2;
const INTRO_TILT = 32;
// Up the field, toward the far Ring arc beyond its top edge.
const INTRO_OFFSET_Y = -420;
const EPILOGUE_DISTANCE = 2.6;
const EPILOGUE_TILT = 26;
const EPILOGUE_OFFSET_Y = -160;
// The Ring wakes once the pull-back is under way.
const WAKE_START = 0.2;

/**
 * Dev captures: `?cinematic=intro&t=0.4` (or `epilogue`) freezes that
 * cinematic's camera at t while it plays. Null without the flag.
 */
export function cinematicFreezeFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const kind = params.get('cinematic');
    const t = Number(params.get('t'));
    if (kind !== 'intro' && kind !== 'epilogue') return null;
    return { kind, t: Number.isFinite(t) ? t : 0.5 };
  } catch {
    return null;
  }
}

function clamp01(t) {
  return Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
}

/** Cubic ease-in-out: slow off the mark and into the landing. */
export function easeInOut(t) {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

function lerp(a, b, k) {
  return a + (b - a) * k;
}

export function introPath(t) {
  const k = easeInOut(t);
  return {
    distance: lerp(INTRO_DISTANCE, 1, k),
    tilt: lerp(INTRO_TILT, FOLLOW_TILT, k),
    offsetX: 0,
    offsetY: lerp(INTRO_OFFSET_Y, 0, k),
    wake: 0,
  };
}

export function epiloguePath(t) {
  const k = easeInOut(t);
  return {
    distance: lerp(1, EPILOGUE_DISTANCE, k),
    tilt: lerp(FOLLOW_TILT, EPILOGUE_TILT, k),
    offsetX: 0,
    offsetY: lerp(0, EPILOGUE_OFFSET_Y, k),
    wake: easeInOut((clamp01(t) - WAKE_START) / (1 - WAKE_START)),
  };
}

/** The follow camera's own pose: what a cinematic hands back to. */
export function followPose() {
  return { distance: 1, tilt: FOLLOW_TILT, offsetX: 0, offsetY: 0, wake: 0 };
}

/** `from` → `to` by `k` (0..1), field by field, into `out`. */
export function blendPose(from, to, k, out = {}) {
  const x = easeInOut(k);
  out.distance = lerp(from.distance, to.distance, x);
  out.tilt = lerp(from.tilt, to.tilt, x);
  out.offsetX = lerp(from.offsetX, to.offsetX, x);
  out.offsetY = lerp(from.offsetY, to.offsetY, x);
  out.wake = lerp(from.wake, to.wake, x);
  return out;
}
