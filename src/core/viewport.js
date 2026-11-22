// Native-resolution viewport for the game canvas.
//
// Game logic and every draw call live in a fixed 800×600 logical space
// (GAME_WIDTH × GAME_HEIGHT). The canvas backing store, however, is sized to
// the CSS box × devicePixelRatio, and the renderer applies the base transform
// below once per frame, so the same logical drawing lands on native pixels.
//
// Rules for the rest of the code:
//   * never read `canvas.width/height` as the game size: use GAME_WIDTH/HEIGHT;
//   * to draw in "screen space" (ignoring screen shake), call
//     applyBaseTransform(ctx), never setTransform(1, 0, 0, 1, 0, 0);
//   * an offscreen sprite cache bakes at `size * getRenderScale()` pixels and
//     is drawn with an explicit logical destination size.

import { GAME_HEIGHT, GAME_WIDTH } from './GameConstants.js';

// Above 2× the cost grows faster than the visible gain on a 2D field.
export const MAX_DEVICE_PIXEL_RATIO = 2;

const state = {
  dpr: 1,
  cssWidth: GAME_WIDTH,
  cssHeight: GAME_HEIGHT,
  scaleX: 1,
  scaleY: 1,
};

/**
 * Backing pixels per CSS pixel, capped. `?renderScale=1` forces 1× (the old
 * 800×600 look) so the owner can A/B sharpness against frame time on his
 * machine; any value between 1 and MAX_DEVICE_PIXEL_RATIO is accepted.
 */
export function resolveDevicePixelRatio() {
  if (typeof window === 'undefined') return 1;
  const override = readRenderScaleOverride();
  if (override !== null) return override;
  const ratio = Number(window.devicePixelRatio) || 1;
  return Math.max(1, Math.min(MAX_DEVICE_PIXEL_RATIO, ratio));
}

function readRenderScaleOverride() {
  try {
    const raw = new URLSearchParams(window.location.search).get('renderScale');
    if (raw === null) return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    return Math.max(1, Math.min(MAX_DEVICE_PIXEL_RATIO, value));
  } catch {
    return null;
  }
}

/**
 * Sizes the canvas backing store to the given CSS box at native resolution.
 * Returns the viewport state; a no-op when nothing changed.
 */
export function applyCanvasResolution(
  canvas,
  cssWidth,
  cssHeight,
  dpr = resolveDevicePixelRatio()
) {
  if (!canvas) return state;
  const width = Math.max(1, Math.round(cssWidth * dpr));
  const height = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  state.dpr = dpr;
  state.cssWidth = cssWidth;
  state.cssHeight = cssHeight;
  state.scaleX = width / GAME_WIDTH;
  state.scaleY = height / GAME_HEIGHT;
  return state;
}

/**
 * Every size listener hangs on the window's resize event, but iOS can settle
 * the page's size without one (an icon opened sideways right after "Add to
 * Home Screen": the game stayed drawn for the old size, Felipe's iPhone,
 * 21/11). There the game box takes its size first and the window's reported
 * size follows up to a second later, so each size of the box becomes that
 * event once the window reports the same size (or after ~2 s of frames).
 */
export function watchGameBox(box) {
  new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width);
    const height = Math.round(entry.contentRect.height);
    let frames = 120;
    const settle = () => {
      const caughtUp =
        window.innerWidth === width && window.innerHeight === height;
      if (caughtUp || --frames === 0) {
        window.dispatchEvent(new Event('resize'));
      } else {
        window.requestAnimationFrame(settle);
      }
    };
    settle();
  }).observe(box);
}

/** Backing pixels per logical unit (uniform while the 4:3 box is preserved). */
export function getRenderScale() {
  return state.scaleX;
}

export function getViewport() {
  return state;
}

/** Logical 800×600 → the canvas's native pixels. Call before any drawing. */
export function applyBaseTransform(ctx) {
  if (!ctx || typeof ctx.setTransform !== 'function') return;
  const canvas = ctx.canvas;
  const sx = canvas && canvas.width ? canvas.width / GAME_WIDTH : state.scaleX;
  const sy =
    canvas && canvas.height ? canvas.height / GAME_HEIGHT : state.scaleY;
  ctx.setTransform(sx, 0, 0, sy, 0, 0);
}
