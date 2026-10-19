// src/modules/ui/runCinematics.js
//
// Sequencing of the run's cinematics (PLAN.md R5.1), on wall-clock time like
// the HUD banners. Intro: the renderer descends to the ship while the
// simulation is held (no step runs, so replays stay exact), a skip hint shows
// and any key skips; the layer banner — the title card — shows once, when it
// ends. Epilogue: the renderer pulls back as the Ring wakes, the victory line
// plays over it, and the victory screen waits for it to end. Warden arrival:
// the camera visits the Warden under letterbox bars while the run plays on
// (no hold, no skip). A renderer that can't move the camera (2D, reduced
// motion, `?camera=0`) refuses all three, and the run keeps the plain banner.

import {
  EPILOGUE_MS,
  INTRO_MS,
  WARDEN_ARRIVAL,
} from '../../core/cinematics.js';

// The bars leave as the camera starts back; they are gone when it lands.
const ARRIVAL_MS = (WARDEN_ARRIVAL.travelIn + WARDEN_ARRIVAL.hold) * 1000;

export class RunCinematics {
  /**
   * `renderer()`/`hud()` resolve the current ones (playIntro, playEpilogue,
   * playArrival, endCinematic / cancelBanner, showCinematicHint,
   * showLetterbox). `holdSim(flag)` stops or
   * restarts the fixed step; `bindSkip(fn)` listens for the skip and returns
   * the unbind; `onIntroEnd()` shows the layer banner.
   */
  constructor({ eventBus, renderer, hud, holdSim, bindSkip, onIntroEnd }) {
    this.eventBus = eventBus;
    this.renderer = renderer;
    this.hud = hud;
    this.holdSim = holdSim;
    this.bindSkip = bindSkip;
    this.onIntroEnd = onIntroEnd;
    this.kind = null;
    this.timer = null;
    this.unbindSkip = null;
    this.afterEpilogue = null;
  }

  get introActive() {
    return this.kind === 'intro';
  }

  /** False (nothing happens) when the renderer can't play it. */
  startIntro() {
    this.stop();
    if (!this.renderer()?.playIntro?.(INTRO_MS)) {
      return false;
    }
    this.begin('intro', INTRO_MS, () => this.endIntro());
    this.hud()?.cancelBanner();
    this.hud()?.showCinematicHint(true);
    this.holdSim(true);
    this.unbindSkip = this.bindSkip(() => this.skip());
    return true;
  }

  /** Ends the intro now; the camera eases back to the ship. */
  skip() {
    if (!this.introActive) {
      return;
    }
    this.renderer()?.endCinematic();
    this.endIntro();
  }

  startEpilogue() {
    this.stop();
    if (!this.renderer()?.playEpilogue?.(EPILOGUE_MS)) {
      return false;
    }
    // Nothing on the banner may hold back the victory line.
    this.hud()?.cancelBanner();
    this.begin('epilogue', EPILOGUE_MS, () => {
      const show = this.afterEpilogue;
      this.finish();
      show?.();
    });
    return true;
  }

  /**
   * The letterbox while the camera visits `warden`; false (nothing happens)
   * when the renderer can't. Never over the intro or the epilogue; a second
   * Warden during one only retargets the camera.
   */
  startArrival(warden) {
    if (this.kind === 'arrival') {
      return this.renderer()?.playArrival?.(warden) ?? false;
    }
    if (this.kind || !this.renderer()?.playArrival?.(warden)) {
      return false;
    }
    this.hud()?.showLetterbox(true);
    this.begin('arrival', ARRIVAL_MS, () => this.finish());
    return true;
  }

  /** Runs `show` when the epilogue ends; false (run it now) without one. */
  deferUntilEpilogueEnds(show) {
    if (this.kind !== 'epilogue') {
      return false;
    }
    this.afterEpilogue = show;
    return true;
  }

  /** The run went on past victory: the camera comes back down. */
  release() {
    this.stop();
    this.renderer()?.endCinematic();
  }

  /** Drops whatever plays, without its ending (a new run, a reset). */
  stop() {
    if (this.introActive) {
      this.hud()?.showCinematicHint(false);
      this.holdSim(false);
    }
    if (this.kind) {
      this.finish();
    }
  }

  begin(kind, durationMs, onEnd) {
    this.kind = kind;
    this.timer = setTimeout(onEnd, durationMs);
    this.eventBus.emit('cinematic-started', { kind });
  }

  endIntro() {
    this.hud()?.showCinematicHint(false);
    this.holdSim(false);
    this.finish();
    this.onIntroEnd();
  }

  finish() {
    const { kind } = this;
    if (kind === 'arrival') {
      this.hud()?.showLetterbox(false);
    }
    clearTimeout(this.timer);
    this.unbindSkip?.();
    this.timer = null;
    this.unbindSkip = null;
    this.afterEpilogue = null;
    this.kind = null;
    this.eventBus.emit('cinematic-ended', { kind });
  }
}
