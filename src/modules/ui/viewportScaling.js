// src/modules/ui/viewportScaling.js
//
// Fits the game canvas to the whole window, at any aspect: its CSS size is
// the window's, its backing store that × the device pixel ratio (capped);
// the HUD's text scale follows the window.

import {
  applyCanvasResolution,
  resolveDevicePixelRatio,
} from '../../core/viewport.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../../core/GameConstants.js';

// The window's share of the HUD scale stops here: a 1080p window is 1.2, the
// size the instruments are drawn at (--hud-u = 1 there, hudStyles.js).
const HUD_FIT_MAX = 1.2;

export class ViewportScaling {
  /**
   * `refs.canvas`: the game canvas.
   * `hud()`: the AAA HUD layout (its panel corners are measured again).
   */
  constructor({ refs, hud }) {
    this.refs = refs;
    this.hud = hud;
    this.resizeRaf = null;
    this.currentHudBaseScale = 1;
    this.currentHudAutoScale = 1;
    this.currentCanvasWidth = 0;
    this.currentCanvasHeight = 0;
    this.currentCanvasDpr = 0;
    this.handleResize = this.handleResize.bind(this);
  }

  /** The Settings panel's HUD scale: the new base, applied at once. */
  setHudBaseScale(scale) {
    this.currentHudBaseScale = scale;
    this.updateHudScale();
    this.requestViewportScaleUpdate();
  }

  initializeViewportScaling() {
    if (typeof window === 'undefined') {
      return;
    }

    this.requestViewportScaleUpdate(true);
    window.addEventListener('resize', this.handleResize, { passive: true });
  }

  handleResize() {
    this.hud()?.invalidatePanelCorners();
    this.requestViewportScaleUpdate();
  }

  requestViewportScaleUpdate(force = false) {
    if (typeof window === 'undefined') {
      return;
    }

    if (force) {
      if (this.resizeRaf) {
        window.cancelAnimationFrame(this.resizeRaf);
        this.resizeRaf = null;
      }
      this.updateViewportScaling({ force: true });
      return;
    }

    if (this.resizeRaf) {
      return;
    }

    this.resizeRaf = window.requestAnimationFrame(() => {
      this.resizeRaf = null;
      this.updateViewportScaling();
    });
  }

  updateViewportScaling(options = {}) {
    if (typeof window === 'undefined') {
      return;
    }

    const { canvas } = this.refs;
    if (!canvas) {
      return;
    }

    const width =
      window.innerWidth || document.documentElement?.clientWidth || GAME_WIDTH;
    const height =
      window.innerHeight ||
      document.documentElement?.clientHeight ||
      GAME_HEIGHT;
    const dpr = resolveDevicePixelRatio();
    if (
      !options.force &&
      width === this.currentCanvasWidth &&
      height === this.currentCanvasHeight &&
      dpr === this.currentCanvasDpr
    ) {
      return;
    }

    this.currentCanvasWidth = width;
    this.currentCanvasHeight = height;
    this.currentCanvasDpr = dpr;

    applyCanvasResolution(canvas, width, height, dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // The HUD text scales as it did with the 800×600 box fitted to the window.
    const fit = Math.min(width / GAME_WIDTH, height / GAME_HEIGHT);
    this.updateHudScale(Math.min(HUD_FIT_MAX, Math.max(0.82, fit)));
  }

  updateHudScale(autoScale = null) {
    if (Number.isFinite(autoScale)) {
      this.currentHudAutoScale = autoScale;
    }

    const baseScale = Number.isFinite(this.currentHudBaseScale)
      ? this.currentHudBaseScale
      : 1;
    const auto = Number.isFinite(this.currentHudAutoScale)
      ? this.currentHudAutoScale
      : 1;
    // The window's fit is capped, not the product: HUD Scale 130 % really
    // is 1.3× the HUD at any window size.
    const effective = Math.max(0.6, baseScale * auto);
    const root = document.documentElement;

    if (root) {
      root.style.setProperty('--hud-scale-effective', effective.toFixed(3));
    }
    this.hud()?.invalidatePanelCorners();
  }
}
