// Shared bloom pass (docs/NORTE.md §2: "light exists only where there is
// energy"). Systems draw their light sources a second time into the emissive
// context this module hands out; at the end of the frame the emissive image
// is downscaled to 1/2, 1/4 and 1/8, blurred at each size, and added back
// over the frame. Blurring the small copies keeps the cost near three
// full-canvas draws per frame regardless of radius.
//
// Usage per frame (RenderingSystem does this):
//   beginFrame(ctx)   — after screen shake is applied, so the layer aligns
//   ... systems call getEmissive() and draw into it (same logical coords)
//   composite(ctx)    — adds the glow; identity transform inside

import { applyBaseTransform } from './viewport.js';

const LEVELS = [
  { scale: 0.5, blur: 2, alpha: 0.55 },
  { scale: 0.25, blur: 2, alpha: 0.45 },
  { scale: 0.125, blur: 2, alpha: 0.35 },
];

const state = {
  enabled: true,
  intensity: 1,
  emissive: null,
  emissiveCtx: null,
  levels: [],
  active: false,
  supportsFilter: null,
};

function makeCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function ensureSize(width, height) {
  if (
    state.emissive &&
    state.emissive.width === width &&
    state.emissive.height === height
  ) {
    return true;
  }
  const emissive = makeCanvas(width, height);
  if (!emissive) return false;
  state.emissive = emissive;
  state.emissiveCtx = emissive.getContext('2d');
  state.levels = LEVELS.map((level) => {
    const w = Math.max(1, Math.round(width * level.scale));
    const h = Math.max(1, Math.round(height * level.scale));
    const canvas = makeCanvas(w, h);
    return { ...level, canvas, ctx: canvas ? canvas.getContext('2d') : null };
  });
  if (state.supportsFilter === null) {
    state.supportsFilter = 'filter' in state.emissiveCtx;
  }
  return Boolean(state.emissiveCtx);
}

export function configure({ enabled, intensity } = {}) {
  if (typeof enabled === 'boolean') state.enabled = enabled;
  if (Number.isFinite(intensity)) state.intensity = Math.max(0, intensity);
}

export function isEnabled() {
  return state.enabled;
}

/** Call after the main ctx has its base transform and screen shake applied. */
export function beginFrame(mainCtx) {
  state.active = false;
  if (!state.enabled || !mainCtx || !mainCtx.canvas) return;
  const { width, height } = mainCtx.canvas;
  if (!ensureSize(width, height)) return;
  const ectx = state.emissiveCtx;
  ectx.setTransform(1, 0, 0, 1, 0, 0);
  ectx.clearRect(0, 0, width, height);
  if (typeof mainCtx.getTransform === 'function') {
    ectx.setTransform(mainCtx.getTransform());
  } else {
    applyBaseTransform(ectx);
  }
  ectx.globalCompositeOperation = 'lighter';
  ectx.globalAlpha = 1;
  state.active = true;
}

/** The context to draw light sources into, or null when bloom is off. */
export function getEmissive() {
  return state.active ? state.emissiveCtx : null;
}

/** Adds the blurred emissive image over the frame. */
export function composite(mainCtx) {
  if (!state.active || !mainCtx) return;
  state.active = false;
  const src = state.emissive;
  const { width, height } = mainCtx.canvas;

  // downscale chain, blurring each small copy
  let prev = src;
  for (const level of state.levels) {
    const { ctx, canvas } = level;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.filter = state.supportsFilter ? `blur(${level.blur}px)` : 'none';
    ctx.drawImage(prev, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';
    prev = canvas;
  }

  mainCtx.save();
  mainCtx.setTransform(1, 0, 0, 1, 0, 0);
  mainCtx.globalCompositeOperation = 'lighter';
  mainCtx.imageSmoothingEnabled = true;
  mainCtx.imageSmoothingQuality = 'high';
  for (const level of state.levels) {
    mainCtx.globalAlpha = Math.min(1, level.alpha * state.intensity);
    mainCtx.drawImage(level.canvas, 0, 0, width, height);
  }
  mainCtx.restore();
}

/** Test/debug helper. */
export function getState() {
  return state;
}
