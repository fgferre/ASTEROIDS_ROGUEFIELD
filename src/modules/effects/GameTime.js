// src/modules/effects/GameTime.js
//
// Game time: the freeze frame and hit-stop of hits and kills, and the
// slow-motion beats of level-up and death. Each step turns the real delta
// into the world's delta. EffectsSystem owns it, ticks it first, and returns
// that delta from its update.

// Hits feel like hits (PLAN.md step 5). PROPOSAL from 17/10, judged by playing.
// Hit-stop on every kill: the world runs at `scale` speed, easing back to
// full speed over `duration` s (freeze frame), by rock size or by the death
// effect (EnemyEffects' DEATH_EFFECTS). Before 17/10 only the large fragment
// (0.18 s at 24 %) and the Tether blast (0.14-0.26 s at 18 %) had one.
const HIT_STOP = Object.freeze({
  small: { duration: 0.05, scale: 0.3 }, // was none
  medium: { duration: 0.08, scale: 0.25 }, // was none
  large: { duration: 0.18, scale: 0.24 }, // unchanged
  'spark-burst': { duration: 0.05, scale: 0.3 }, // the Mote's, was none
  'shock-burst': { duration: 0.09, scale: 0.25 }, // the Seeker's, was none
  blast: { duration: 0.12, scale: 0.18 }, // the Tether's, was 0.14-0.26 s by radius
});
// A kind re-triggers at most once per this many seconds of game time, so a
// multishot that kills three smalls freezes once.
const HIT_STOP_COOLDOWN = 0.1;
// Slow-motion beats (was: level-up a 0.2 s freeze at 40 %, death none). The
// scale holds, then eases back to 1 over `ease` s; the camera zoom pulses to
// `zoom` (base 1.3) and back over the same total time.
export const LEVEL_UP_SLOW_MO = {
  scale: 0.35,
  hold: 0.25,
  ease: 0.2,
  zoom: 1.42,
};
export const DEATH_SLOW_MO = { scale: 0.3, hold: 0.5, ease: 0.4, zoom: 1.5 };

function idleTimeDilation() {
  return {
    timer: 0,
    duration: 0,
    startScale: 1,
    endScale: 1,
    holdScale: 1,
    holdTimer: 0,
    easing: 'outCubic',
    active: false,
  };
}

export class GameTime {
  /**
   * `emit(name, payload)`: sends camera-zoom-pulse on the first running step after a slow-motion beat.
   * `motionReduced()`: Settings → Accessibility → Reduced Motion; shortens freezes and softens slow motion.
   */
  constructor({ emit, motionReduced }) {
    this.emit = emit;
    this.motionReduced = motionReduced;

    this.freezeFrame = { timer: 0, duration: 0, fade: 0 };
    this.hitStopClock = 0;
    this.hitStopReadyAt = {};
    this.pendingZoomPulse = null;
    this.timeDilation = idleTimeDilation();
  }

  // The world's delta for this step: the real one scaled by the freeze
  // frame, then by the time dilation.
  update(baseDelta) {
    this.hitStopClock += baseDelta;
    // Emitted on the first running step: the level-up screen pauses the run
    // in the same step that queued the pulse, so it plays on resume.
    if (this.pendingZoomPulse && baseDelta > 0) {
      this.emit('camera-zoom-pulse', this.pendingZoomPulse);
      this.pendingZoomPulse = null;
    }

    let delta = baseDelta;
    delta *= this.updateFreezeFrameState(baseDelta);
    delta *= this.updateTimeDilationState(baseDelta);
    return delta;
  }

  // A new run or the menu: no freeze or slow motion carries over.
  reset() {
    this.freezeFrame = { timer: 0, duration: 0, fade: 0 };
    this.hitStopClock = 0;
    this.hitStopReadyAt = {};
    this.pendingZoomPulse = null;
    this.timeDilation = idleTimeDilation();
  }

  updateFreezeFrameState(baseDelta) {
    if (!this.freezeFrame || this.freezeFrame.timer <= 0) {
      return 1;
    }

    const frame = this.freezeFrame;
    frame.timer = Math.max(0, frame.timer - baseDelta);

    const duration =
      frame.duration > 0 ? frame.duration : Math.max(frame.timer, 0);
    if (duration <= 0) {
      frame.timer = 0;
      return 1;
    }

    const fade = Math.max(0, Math.min(1, frame.fade ?? 0));
    if (frame.timer <= 0) {
      return 1;
    }

    const remaining = Math.max(0, Math.min(1, frame.timer / duration));
    const normalized = 1 - remaining;
    const multiplier = fade + (1 - fade) * normalized;

    return Math.max(0, Math.min(1, multiplier));
  }

  updateTimeDilationState(baseDelta) {
    if (!this.timeDilation) {
      return 1;
    }

    const state = this.timeDilation;

    if (state.holdTimer > 0) {
      state.holdTimer = Math.max(0, state.holdTimer - baseDelta);
      state.timer = Math.max(state.duration, 0);
      state.active = true;
      const scale = Math.max(0, Math.min(1, state.holdScale ?? 1));
      if (state.holdTimer <= 0 && state.duration <= 0) {
        state.active = false;
      }
      return scale;
    }

    if (state.timer > 0 && state.duration > 0) {
      state.timer = Math.max(0, state.timer - baseDelta);
      const progress =
        state.duration > 0 ? 1 - state.timer / state.duration : 1;
      const eased = this.easeValue(state.easing, progress);
      const start = Number.isFinite(state.startScale) ? state.startScale : 1;
      const end = Number.isFinite(state.endScale) ? state.endScale : 1;
      const scale = start + (end - start) * eased;

      if (state.timer <= 0) {
        state.timer = 0;
        state.duration = 0;
        state.startScale = 1;
        state.endScale = 1;
        state.holdScale = 1;
        state.active = false;
      } else {
        state.active = true;
      }

      return Math.max(0, Math.min(1, scale));
    }

    state.timer = 0;
    state.duration = 0;
    state.startScale = 1;
    state.endScale = 1;
    state.holdScale = 1;
    state.active = false;
    return 1;
  }

  easeValue(easing, t) {
    const clamped = Math.max(0, Math.min(1, t));
    switch (easing) {
      case 'smooth':
        return clamped * clamped * (3 - 2 * clamped);
      case 'outQuad':
        return 1 - Math.pow(1 - clamped, 2);
      case 'outCubic':
      default:
        return 1 - Math.pow(1 - clamped, 3);
    }
  }

  addFreezeFrame(duration, fade = 0) {
    let finalDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
    let finalFade = Number.isFinite(fade) ? fade : 0;

    if (this.motionReduced()) {
      finalDuration = Math.min(finalDuration, 0.12);
      finalFade = Math.min(finalFade, 0.2);
    }

    if (finalDuration <= 0) {
      return;
    }

    // A lighter freeze landing on a running one must not lift its floor.
    this.freezeFrame.fade =
      this.freezeFrame.timer > 0
        ? Math.min(this.freezeFrame.fade, finalFade)
        : finalFade;
    this.freezeFrame.timer = Math.max(this.freezeFrame.timer, finalDuration);
    this.freezeFrame.duration = Math.max(
      this.freezeFrame.duration,
      finalDuration
    );
  }

  addHitStop(kind) {
    const stop = HIT_STOP[kind];
    if (this.hitStopClock < (this.hitStopReadyAt[kind] ?? 0)) {
      return;
    }
    this.hitStopReadyAt[kind] = this.hitStopClock + HIT_STOP_COOLDOWN;
    this.addFreezeFrame(stop.duration, stop.scale);
  }

  playSlowMotion({ scale, hold, ease, zoom }) {
    this.applyTimeDilation(scale, { holdDuration: hold, duration: ease });
    if (!this.motionReduced()) {
      this.pendingZoomPulse = { zoom, duration: hold + ease };
    }
  }

  applyTimeDilation(targetScale, options = {}) {
    if (!this.timeDilation) {
      this.timeDilation = idleTimeDilation();
    }

    const rawScale = Number.isFinite(targetScale) ? targetScale : 1;
    let scale = Math.max(0, Math.min(1, rawScale));

    const optionDuration = Number.isFinite(options.duration)
      ? Math.max(0, options.duration)
      : Number.isFinite(options.transition)
        ? Math.max(0, options.transition)
        : 0.45;
    const optionHold = Number.isFinite(options.holdDuration)
      ? Math.max(0, options.holdDuration)
      : Number.isFinite(options.hold)
        ? Math.max(0, options.hold)
        : 0;
    let duration = optionDuration;
    let holdDuration = optionHold;

    if (this.motionReduced()) {
      scale = Math.max(scale, 0.7);
      duration = Math.min(duration, 0.35);
      holdDuration = Math.min(holdDuration, 0.12);
    }

    if (scale >= 0.999 && holdDuration <= 0 && duration <= 0) {
      return;
    }

    const easing =
      typeof options.easing === 'string' ? options.easing : 'outCubic';

    this.timeDilation.holdScale = scale;
    this.timeDilation.holdTimer = holdDuration;
    this.timeDilation.startScale = scale;
    this.timeDilation.endScale = 1;
    this.timeDilation.duration = duration;
    this.timeDilation.timer = duration;
    this.timeDilation.easing = easing;
    this.timeDilation.active = true;
  }
}
