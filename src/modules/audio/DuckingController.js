/**
 * DuckingController — dynamic ducking envelope on DEDICATED duck nodes
 * (AUDIO-03 / D-11).
 *
 * Plain manager class (two-phase lifecycle). The AudioSystem facade owns the
 * EventBus and calls duck() on threshold crossings / boss telegraphs; the
 * controller never reaches back into the facade.
 *
 * MULTIPLICATIVE BY TOPOLOGY (D-11, review fix): the controller CREATES two
 * dedicated gain nodes — musicDuckGain and effectsDuckGain — that REST at 1.0
 * and splices them into the serial chains:
 *
 *   music:   musicPauseFadeGain → musicDuckGain (rests 1.0) → musicGain (slider)
 *   effects: SFX content        → effectsDuckGain (rests 1.0) → effectsGain (slider)
 *
 * Because the stages are serial gains, the duck factor MULTIPLIES the slider
 * value automatically — the controller NEVER reads or writes the slider stages
 * (the facade settings handler is their sole writer). The duck envelope ramps
 * the dedicated node 1.0 → factor → 1.0; "nominal" is ALWAYS 1.0, so no slider
 * tracking is required and a mid-duck slider change can never be fought.
 *
 * Two-phase lifecycle:
 *   - constructor(config): stores config ONLY. No AudioContext work.
 *   - init(context, { musicSpliceFrom, musicSpliceTo, effectsSpliceTo }):
 *       creates the duck nodes and splices them with EXPLICIT
 *       disconnect-before-reconnect (no double path).
 *   - dispose(): un-splices (restores the direct connections) and is idempotent.
 *
 * SC3: duck ≥6dB (factor ≤0.501) with the full envelope returning to nominal
 * within ≤1.5s. duck({ startTime }) is the 02.08 co-scheduling seam (a roar and
 * its duck hit the same instant). Determinism: every scheduled time derives from
 * context.currentTime ONLY — no wall-clock or PRNG source is referenced here.
 */

// Duck envelope defaults (calibration — the browser-check tunes the feel inside
// the SC3 gate). attack + hold + release = 1.2s ≤ 1.5s budget.
// 6.1dB (slightly past the 6dB floor) → factor ≈0.4955 ≤0.501, so SC3's
// "trough ≤ nominal*0.501" holds with margin while staying ≥6dB.
const DEFAULT_DEPTH_DB = 6.1; // ≥6dB → factor ≤0.501
const DEFAULT_ATTACK_MS = 120; // fast dip
const DEFAULT_HOLD_MS = 180; // brief trough
const DEFAULT_RELEASE_MS = 900; // smooth recovery (total 1.2s)

// MDN gotcha: exponentialRampToValueAtTime(0) throws — never ramp below this.
const MIN_RAMP_VALUE = 0.0001;

// The dedicated duck nodes always rest here (multiplicative nominal).
const NOMINAL_GAIN = 1;

class DuckingController {
  /**
   * @param {object} [config] - Reserved for future calibration overrides.
   */
  constructor(config = {}) {
    // --- config only (NO AudioContext work) ---
    this.config = config || {};

    // --- runtime state ---
    this.context = null;
    this.musicDuckGain = null;
    this.effectsDuckGain = null;

    // Splice endpoints (held so dispose can restore the direct connections).
    this._musicSpliceFrom = null; // musicPauseFadeGain
    this._musicSpliceTo = null; // musicGain (slider)
    this._effectsSpliceTo = null; // effectsGain (slider)

    this.initialized = false;
  }

  /**
   * Create the dedicated duck nodes and splice them into both chains with
   * EXPLICIT disconnect-before-reconnect (no double path). Idempotent.
   *
   * @param {AudioContext} context
   * @param {object} endpoints
   * @param {AudioNode} endpoints.musicSpliceFrom - upstream music node
   *   (musicPauseFadeGain) currently feeding musicGain directly.
   * @param {AudioNode} endpoints.musicSpliceTo - the music slider stage
   *   (musicGain). The controller routes INTO it but NEVER writes its gain.
   * @param {AudioNode} endpoints.effectsSpliceTo - the effects slider stage
   *   (effectsGain). The facade re-points its SFX routing to effectsDuckGain.
   */
  init(context, endpoints = {}) {
    if (this.initialized) return;
    if (!context) return;

    const { musicSpliceFrom, musicSpliceTo, effectsSpliceTo } = endpoints;

    this.context = context;
    this._musicSpliceFrom = musicSpliceFrom || null;
    this._musicSpliceTo = musicSpliceTo || null;
    this._effectsSpliceTo = effectsSpliceTo || null;

    const now = context.currentTime;

    // --- musicDuckGain: rests at 1.0, spliced between pauseFade and musicGain ---
    this.musicDuckGain = context.createGain();
    this._restNode(this.musicDuckGain, now);
    this.musicDuckGain.connect(this._musicSpliceTo);
    // EXPLICIT disconnect of the old direct path BEFORE reconnecting through the
    // duck node (review: no double path).
    if (this._musicSpliceFrom) {
      this._safeDisconnect(this._musicSpliceFrom);
      this._musicSpliceFrom.connect(this.musicDuckGain);
    }

    // --- effectsDuckGain: rests at 1.0, spliced before effectsGain ---
    this.effectsDuckGain = context.createGain();
    this._restNode(this.effectsDuckGain, now);
    if (this._effectsSpliceTo) {
      this.effectsDuckGain.connect(this._effectsSpliceTo);
    }

    this.initialized = true;
  }

  /**
   * The effects-content insert point: callers that previously connected SFX
   * content into effectsGain now connect into effectsDuckGain (the facade
   * re-points connectGainNode's destination here). Falls back to the slider
   * stage when not yet initialized so SFX is never silently dropped.
   *
   * @returns {AudioNode|null}
   */
  getEffectsInput() {
    return this.effectsDuckGain || this._effectsSpliceTo || null;
  }

  /**
   * Duck the chosen bus: ramp the DEDICATED duck node(s) 1.0 → factor → 1.0,
   * anchored at startTime (default now). depthDb=6 → trough ≤0.501; the default
   * envelope total is ≤1.5s (SC3). The startTime parameter is the 02.08
   * co-scheduling seam (roar + duck hit together).
   *
   * @param {object} [options]
   * @param {number} [options.depthDb=6] - Attenuation depth in dB (≥6 → ≤0.501).
   * @param {number} [options.attackMs]
   * @param {number} [options.holdMs]
   * @param {number} [options.releaseMs]
   * @param {number} [options.startTime] - context.currentTime domain; default now.
   * @param {'music'|'effects'|'both'} [options.bus='music']
   */
  duck(options = {}) {
    if (!this.initialized || !this.context) return;

    const {
      depthDb = DEFAULT_DEPTH_DB,
      attackMs = DEFAULT_ATTACK_MS,
      holdMs = DEFAULT_HOLD_MS,
      releaseMs = DEFAULT_RELEASE_MS,
      startTime,
      bus = 'music',
    } = options;

    const now = this.context.currentTime;
    const anchorTime =
      Number.isFinite(startTime) && startTime >= now ? startTime : now;

    // factor = 10^(-depthDb/20); ≥6dB → ≤0.501. Clamp to the [MIN, 1] band.
    const safeDepthDb = Number.isFinite(depthDb) ? Math.max(0, depthDb) : 0;
    const factor = Math.min(
      NOMINAL_GAIN,
      Math.max(MIN_RAMP_VALUE, Math.pow(10, -safeDepthDb / 20))
    );

    const attackS = Math.max(0, attackMs / 1000);
    const holdS = Math.max(0, holdMs / 1000);
    const releaseS = Math.max(0, releaseMs / 1000);

    const targets = [];
    if (bus === 'music' || bus === 'both') targets.push(this.musicDuckGain);
    if (bus === 'effects' || bus === 'both') targets.push(this.effectsDuckGain);

    targets.forEach((node) => {
      this._applyEnvelope(node, anchorTime, factor, attackS, holdS, releaseS);
    });
  }

  /**
   * Apply the 1.0 → factor → 1.0 envelope on a single duck node, anchored at
   * startTime. Re-anchor (cancel + setValueAtTime(current)) so a retrigger
   * during recovery does not click or stack.
   * @private
   */
  _applyEnvelope(node, startTime, factor, attackS, holdS, releaseS) {
    const param = node?.gain;
    if (!param) return;

    // Re-anchor: cancel any in-flight envelope, hold the CURRENT value at the
    // anchor so the new ramp starts click-free.
    this._cancel(param, startTime);
    const current =
      typeof param.value === 'number' ? param.value : NOMINAL_GAIN;
    if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(current, startTime);
    }

    const troughTime = startTime + attackS;
    const holdEndTime = troughTime + holdS;
    const recoveryTime = holdEndTime + releaseS;

    // Attack: dip to the (floored) trough. Never ramp to exactly 0.
    const troughTarget = Math.max(MIN_RAMP_VALUE, factor);
    if (typeof param.exponentialRampToValueAtTime === 'function') {
      param.exponentialRampToValueAtTime(troughTarget, troughTime);
    } else if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(troughTarget, troughTime);
    }

    // Hold the trough.
    if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(troughTarget, holdEndTime);
    }

    // Release: recover to nominal 1.0 exactly.
    if (typeof param.exponentialRampToValueAtTime === 'function') {
      param.exponentialRampToValueAtTime(NOMINAL_GAIN, recoveryTime);
    } else if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(NOMINAL_GAIN, recoveryTime);
    }
  }

  /** Set a duck node to its 1.0 rest value. @private */
  _restNode(node, now) {
    const param = node?.gain;
    if (!param || typeof param.setValueAtTime !== 'function') return;
    param.setValueAtTime(NOMINAL_GAIN, now);
  }

  /**
   * Un-splice: restore the direct pauseFade → musicGain connection and detach
   * the duck nodes. Idempotent (guarded).
   */
  dispose() {
    if (!this.initialized) return;

    // Restore the direct music connection: disconnect the duck node, reconnect
    // pauseFade straight to the slider stage.
    this._safeDisconnect(this.musicDuckGain);
    if (this._musicSpliceFrom) {
      this._safeDisconnect(this._musicSpliceFrom);
      if (this._musicSpliceTo) {
        this._musicSpliceFrom.connect(this._musicSpliceTo);
      }
    }

    this._safeDisconnect(this.effectsDuckGain);

    this.musicDuckGain = null;
    this.effectsDuckGain = null;
    this._musicSpliceFrom = null;
    this._musicSpliceTo = null;
    this._effectsSpliceTo = null;
    this.context = null;
    this.initialized = false;
  }

  /** @private */
  _cancel(param, now) {
    if (!param || typeof param.cancelScheduledValues !== 'function') return;
    try {
      param.cancelScheduledValues(now);
    } catch (error) {
      // Ignore browsers that throw on empty schedules.
    }
  }

  /** @private */
  _safeDisconnect(node) {
    if (!node || typeof node.disconnect !== 'function') return;
    try {
      node.disconnect();
    } catch (error) {
      // Already disconnected.
    }
  }
}

export default DuckingController;
