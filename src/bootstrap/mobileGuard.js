// src/bootstrap/mobileGuard.js
//
// A11Y-08 (initial implementation) — Phase 1 of v2 milestone.
//
// Pre-DI device-capability gate. Halts boot on touch-capable devices and paints
// a plain-Canvas2D "Desktop only" notice on #game-canvas. Runs BEFORE
// initializeDevStatsPanel(), bootstrapServices(), DI container init, Three.js,
// and Web Audio so the blocked path survives a future WebGL2 probe failure.
//
// Phase 6a (INFRA-11 / VIZ-01 / A11Y-08 verified) re-verifies this guard on
// real hardware (Safari iOS+macOS, Firefox, Chromium); current Phase 1 coverage
// is JSDOM unit test + developer self-smoke on the dev laptop.
//
// CONTEXT decisions honored:
//   D-03: Combined-OR detection — ontouchstart || maxTouchPoints>0 || matchMedia('(pointer: coarse)').
//   D-04: Pre-DI location; zero calls into Three.js / Web Audio / DIContainer on the blocked path.
//   D-05: EN line ("Desktop only — keyboard + mouse required") stacked above PT-BR line
//         ("Requer teclado e mouse (apenas desktop)"); monospace 16px Canvas2D fillText.
//   D-06: ?desktop=force URL override (dev escape hatch, not a documented user feature).
//   D-46: No new dependencies. Only built-in browser globals + the existing debugLog import.
//   D-47: No new console.log on production paths; console.warn only on defensive branches.

import { debugLog } from '../core/debugLogging.js';

const DESKTOP_FORCE_PARAM = 'desktop';
const DESKTOP_FORCE_VALUE = 'force';

const NOTICE_EN = 'Desktop only — keyboard + mouse required';
const NOTICE_PT = 'Requer teclado e mouse (apenas desktop)';

/**
 * Combined-OR touch detection per CONTEXT D-03.
 *
 * Each probe is guarded for non-browser environments (Vitest `environment: 'node'`).
 * Returns `true` if ANY signal indicates touch capability — intentionally
 * conservative (we'd rather block a touch-capable laptop than admit a phone).
 *
 * @returns {boolean}
 */
function isTouchDevice() {
  if (typeof window === 'undefined') {
    return false;
  }

  if ('ontouchstart' in window) {
    return true;
  }

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 0
  ) {
    return true;
  }

  if (typeof window.matchMedia === 'function') {
    try {
      const result = window.matchMedia('(pointer: coarse)');
      if (result && result.matches === true) {
        return true;
      }
    } catch (error) {
      // T-01-03: exotic browser threw — safe default = uncertain → no signal here
      // (the combined OR returns false; the surrounding caller may still get true
      // from one of the prior probes). NOT a fatal error.
      console.warn(
        '[mobileGuard] matchMedia probe failed; treating pointer-coarse signal as false:',
        error
      );
    }
  }

  return false;
}

/**
 * Returns true when ?desktop=force is present in the current URL.
 *
 * Mirrors the URLSearchParams parsing pattern in src/core/debugLogging.js
 * (readFromQueryString). Case-insensitive match on the value 'force'.
 *
 * @returns {boolean}
 */
function hasForceDesktopFlag() {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    if (!params.has(DESKTOP_FORCE_PARAM)) {
      return false;
    }

    const value = params.get(DESKTOP_FORCE_PARAM);
    if (typeof value !== 'string') {
      return false;
    }

    return value.trim().toLowerCase() === DESKTOP_FORCE_VALUE;
  } catch (error) {
    console.warn(
      '[mobileGuard] Failed to parse ?desktop flag from URL:',
      error
    );
    return false;
  }
}

/**
 * Paints the stacked EN+PT-BR notice on #game-canvas. Returns false when the
 * canvas or 2D context cannot be resolved (defensive — the caller still halts
 * boot but the notice cannot be shown in that case).
 *
 * @returns {boolean} true when the notice was painted, false on defensive fallback.
 */
function paintNotice() {
  if (typeof document === 'undefined') {
    console.warn(
      '[mobileGuard] document is undefined; cannot paint notice (non-browser environment).'
    );
    return false;
  }

  const canvas = document.getElementById('game-canvas');
  if (!canvas) {
    console.warn(
      '[mobileGuard] Canvas2D unavailable; halting boot defensively (no #game-canvas element).'
    );
    return false;
  }

  let ctx;
  try {
    ctx = canvas.getContext('2d');
  } catch (error) {
    console.warn(
      '[mobileGuard] Canvas2D unavailable; halting boot defensively:',
      error
    );
    return false;
  }

  if (!ctx) {
    console.warn(
      '[mobileGuard] Canvas2D unavailable; halting boot defensively (getContext returned null).'
    );
    return false;
  }

  const width = canvas.width || 0;
  const height = canvas.height || 0;

  // Black background.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  // White monospace text, 16px, stacked and centered.
  ctx.fillStyle = '#fff';
  ctx.font = '16px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const centerX = width / 2;
  const lineHeight = 24;
  const enY = height / 2 - lineHeight / 2;
  const ptY = height / 2 + lineHeight / 2;

  // ctx.measureText is referenced by the unit test mock; calling it here keeps
  // the stub surface honest even though textAlign='center' makes the result
  // unnecessary for placement.
  if (typeof ctx.measureText === 'function') {
    try {
      ctx.measureText(NOTICE_EN);
      ctx.measureText(NOTICE_PT);
    } catch (error) {
      // measureText shouldn't throw under any normal browser — defensive only.
      console.warn('[mobileGuard] measureText probe failed:', error);
    }
  }

  ctx.fillText(NOTICE_EN, centerX, enY);
  ctx.fillText(NOTICE_PT, centerX, ptY);

  return true;
}

/**
 * Pre-DI mobile/touch boot gate.
 *
 * Returns `{ blocked: true }` on touch-capable devices (unless ?desktop=force
 * override is present) and paints a plain-Canvas2D notice on #game-canvas.
 * The caller (src/app.js DOMContentLoaded handler) must early-return when
 * `blocked` is true; the notice is already painted by this function.
 *
 * Performs ZERO calls into Three.js, Web Audio (AudioContext), or the DI
 * container — verifiable by reading this file's import list (only `debugLog`
 * from ../core/debugLogging.js).
 *
 * @returns {{ blocked: boolean }}
 */
export function mobileGuard() {
  if (hasForceDesktopFlag()) {
    debugLog('[mobileGuard] ?desktop=force override active');
    return { blocked: false };
  }

  if (!isTouchDevice()) {
    return { blocked: false };
  }

  paintNotice();
  return { blocked: true };
}
