import { MUSIC_LAYER_CONFIG } from '../../core/GameConstants.js';

/**
 * MusicMixer — adaptive 4-layer synth music (AUDIO-01 / INFRA-02).
 *
 * Plain manager class (ThrusterLoopManager analog). The AudioSystem facade owns
 * the EventBus + randomScopes and DELEGATES boss-arc + pause events here; the
 * mixer never reaches back into the facade.
 *
 * Two-phase lifecycle (construction-timing safety — review fix):
 *   - constructor(config): stores config ONLY. No AudioContext work.
 *   - init(context, targetNode): builds the node graph.
 *   - dispose(): stops timers, onended-cleans pulse oscillators, disconnects;
 *     both init() and dispose() are idempotent.
 *
 * Gain topology (single writer per AudioParam — cross-plan contract):
 *   layerGains[base|tension|danger|climax]        (writer: MusicMixer)
 *     → music lowpass (pre-built at init; bypass ~20kHz; writer: MusicMixer
 *        pause ramps its FREQUENCY only — built HERE, never at pause time)
 *     → musicPauseFadeGain                          (writer: MusicMixer pause/fade)
 *     → targetNode == musicGain SLIDER stage        (writer: facade ONLY — the
 *        mixer routes INTO this node but NEVER schedules on its gain param).
 *
 * MusicIntensityResolver lives INSIDE this class (PROJECT.md lock — not a 7th
 * manager): setIntensityFromBossEvent maps the boss arc to an intensity level
 * (D-04: ONLY the boss arc drives music; HP/combo/density do NOT).
 */

// Lowpass bypass cutoff — effectively "open" so the filter is permanently in
// the signal path (built once at init) yet inaudible until pause ramps it down.
const LOWPASS_BYPASS_FREQUENCY = 20000;

// D-05: tension/danger rises are slow crossfades (8-15s, imperceptible). One
// tunable constant inside that window — the browser-check calibrates the feel.
const SLOW_RISE_SECONDS = 11;

// Boss-arc → intensity-level map (D-04). The ONLY events that drive music.
//   boss-warning      → tension  (pre-boss wave)
//   boss-spawned      → danger   (the alert)
//   boss-phase-changed→ climax   (the fight intensifies)
//   boss-defeated     → base     (resolve back to calm)
const BOSS_ARC_INTENSITY = Object.freeze({
  'boss-warning': 1,
  'boss-spawned': 2,
  'boss-phase-changed': 3,
  'boss-defeated': 0,
});

class MusicMixer {
  /**
   * @param {object} [config]
   * @param {object} [config.randomScope] - Seeded RNG scope (range/float) for
   *   detune + pulse variation. NEVER Math.random.
   * @param {object} [config.rampDurations] - Optional override of the rise/fall
   *   ramp windows (relocated from the legacy musicController state model).
   */
  constructor(config = {}) {
    // --- config only (NO AudioContext work) ---
    this.randomScope = config.randomScope || null;
    this.rampDurations = {
      rise: SLOW_RISE_SECONDS,
      fall: SLOW_RISE_SECONDS,
      bossRise: SLOW_RISE_SECONDS,
      bossFall: SLOW_RISE_SECONDS,
      ...(config.rampDurations || {}),
    };

    // --- runtime state (relocated musicController model) ---
    this.context = null;
    this.targetNode = null;
    this.layers = {};
    this.lowpass = null;
    this.musicPauseFadeGain = null;

    const initialLevel =
      typeof MUSIC_LAYER_CONFIG?.initialIntensity === 'number'
        ? MUSIC_LAYER_CONFIG.initialIntensity
        : 0;
    this.intensityLevel = initialLevel;
    this.targetLevel = initialLevel;

    this.initialized = false;
  }

  /**
   * Build the node graph. Idempotent: a second call is a no-op (no duplicate
   * nodes). Constructor did NO context work — everything is built here, after
   * the facade has created the context + buses.
   *
   * @param {AudioContext} context
   * @param {AudioNode} targetNode - the music SLIDER stage (musicGain). The
   *   mixer routes into it but NEVER writes its gain param.
   */
  init(context, targetNode) {
    if (this.initialized) return;
    if (!context) return;

    this.context = context;
    this.targetNode = targetNode || null;
    const now = context.currentTime;

    // --- pre-built lowpass (D-10): constructed ONCE, bypass ~20kHz, permanently
    // in the path; pause ramps its FREQUENCY only — never created on the fly. ---
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(LOWPASS_BYPASS_FREQUENCY, now);
    if (lowpass.Q && typeof lowpass.Q.setValueAtTime === 'function') {
      lowpass.Q.setValueAtTime(0.7071, now);
    }
    this.lowpass = lowpass;

    // --- musicPauseFadeGain: the ONLY stage the mixer writes for pause/fade ---
    const pauseFade = context.createGain();
    pauseFade.gain.setValueAtTime(1, now);
    this.musicPauseFadeGain = pauseFade;

    // lowpass → pauseFade → targetNode (slider stage)
    lowpass.connect(pauseFade);
    if (targetNode) {
      pauseFade.connect(targetNode);
    }

    // --- 4 synth layers → lowpass ---
    this.layers = this._buildLayers(context, now, lowpass);

    this.initialized = true;

    // Anchor every layer to its initial-level profile immediately (no ramp).
    this._applyIntensity(this.intensityLevel, { immediate: true });
  }

  /**
   * Build one oscillator+gain(+filter+modulator) graph per configured layer.
   * Mirrors the legacy initializeMusicController engine, re-rooted onto the
   * pre-built lowpass (the single music insert point).
   * @private
   */
  _buildLayers(context, now, lowpass) {
    const layersConfig = MUSIC_LAYER_CONFIG?.layers || {};
    const created = {};

    Object.entries(layersConfig).forEach(([key, layerConfig = {}]) => {
      const osc = context.createOscillator();
      const gain = context.createGain();

      const baseFrequency = Number(layerConfig.frequency) || 110;
      osc.type = layerConfig.type || 'sine';
      osc.frequency.setValueAtTime(Math.max(10, baseFrequency), now);

      // Seeded detune (replay-deterministic — never Math.random).
      const detuneCents = Number(layerConfig.detuneCents) || 0;
      const randomDetuneSpan = Number(layerConfig.randomDetuneCents);
      let detune = detuneCents;
      if (Number.isFinite(randomDetuneSpan) && randomDetuneSpan > 0) {
        const span = Math.abs(randomDetuneSpan);
        detune += this._randomBetween(-span, span);
      }
      if (osc.detune && typeof osc.detune.setValueAtTime === 'function') {
        osc.detune.setValueAtTime(detune, now);
      }

      // Layers start silent — intensity ramps them in.
      gain.gain.setValueAtTime(0, now);
      osc.connect(gain);

      let outputNode = gain;
      let filterNode = null;
      const filterConfig = layerConfig.filter;
      if (filterConfig && typeof context.createBiquadFilter === 'function') {
        filterNode = context.createBiquadFilter();
        filterNode.type = filterConfig.type || 'lowpass';
        if (typeof filterConfig.frequency === 'number') {
          filterNode.frequency.setValueAtTime(
            Math.max(10, filterConfig.frequency),
            now
          );
        }
        if (
          filterNode.Q &&
          typeof filterNode.Q.setValueAtTime === 'function' &&
          typeof filterConfig.Q === 'number'
        ) {
          filterNode.Q.setValueAtTime(Math.max(0.0001, filterConfig.Q), now);
        }
        gain.connect(filterNode);
        outputNode = filterNode;
      }

      // Slow amplitude modulation (LFO → gain.gain) for an atmospheric drone.
      let modulator = null;
      const depthMultiplier =
        typeof layerConfig.modulationDepth === 'number'
          ? Math.max(0, Math.min(0.95, layerConfig.modulationDepth))
          : 0;
      if (
        depthMultiplier > 0 &&
        typeof context.createOscillator === 'function'
      ) {
        const lfo = context.createOscillator();
        const depthGain = context.createGain();
        const rate =
          typeof layerConfig.modulationRate === 'number'
            ? Math.max(0.01, layerConfig.modulationRate)
            : 0.12;
        lfo.type = layerConfig.modulationType || 'sine';
        lfo.frequency.setValueAtTime(rate, now);
        depthGain.gain.setValueAtTime(0, now);
        lfo.connect(depthGain);
        depthGain.connect(gain.gain);

        let phaseOffset = 0;
        if (layerConfig.randomizeModulationPhase !== false && rate > 0) {
          const cycleDuration = 1 / rate;
          phaseOffset = this._randomBetween(0, Math.min(cycleDuration, 2.5));
        }
        lfo.start(now + Math.max(0, phaseOffset));
        modulator = { lfo, depthGain, depthMultiplier };
      }

      // Route the layer output into the pre-built lowpass (the single insert).
      outputNode.connect(lowpass);
      osc.start(now);

      created[key] = {
        osc,
        gain,
        filter: filterNode,
        modulator,
        config: layerConfig,
      };
    });

    return created;
  }

  /**
   * MusicIntensityResolver (D-04): map a boss-arc event to an intensity level
   * and crossfade. Non-boss events are ignored — ONLY the boss arc drives music
   * (HP, combo, enemy density explicitly do NOT).
   *
   * @param {string} eventName
   */
  setIntensityFromBossEvent(eventName) {
    if (!Object.prototype.hasOwnProperty.call(BOSS_ARC_INTENSITY, eventName)) {
      return; // non-boss event — leave targetLevel unchanged
    }
    const level = BOSS_ARC_INTENSITY[eventName];
    this._applyIntensity(level);
  }

  /**
   * Crossfade every layer gain to its profile value for `level` using the
   * click-safe ramp (cancel + anchor + linearRamp ending at now + rampDuration).
   * Writes ONLY layer gains — never the slider stage (single-writer rule).
   * @private
   */
  _applyIntensity(level, options = {}) {
    const intensities = MUSIC_LAYER_CONFIG?.intensities || [];
    const maxLevel = Math.max(0, intensities.length - 1);
    const targetLevel = Math.min(Math.max(0, Math.floor(level)), maxLevel);

    this.targetLevel = targetLevel;

    if (!this.initialized || !this.context) {
      this.intensityLevel = targetLevel;
      return;
    }

    const profile = intensities[targetLevel];
    if (!profile) {
      this.intensityLevel = targetLevel;
      return;
    }

    const { immediate = false } = options;
    const rampDuration = Math.max(0.05, this.rampDurations.rise);
    const now = this.context.currentTime;

    Object.entries(this.layers).forEach(([key, layer]) => {
      const gainNode = layer?.gain;
      if (!gainNode || !gainNode.gain) return;
      const targetGain = profile[key] ?? 0;
      this._rampParam(
        gainNode.gain,
        targetGain,
        now,
        immediate ? 0 : rampDuration
      );

      // Track the LFO depth alongside the carrier gain so modulation scales in.
      const depthParam = layer?.modulator?.depthGain?.gain;
      if (depthParam) {
        const depthValue = Math.max(
          0,
          targetGain * layer.modulator.depthMultiplier
        );
        this._rampParam(
          depthParam,
          depthValue,
          now,
          immediate ? 0 : rampDuration
        );
      }
    });

    this.intensityLevel = targetLevel;
  }

  /**
   * Click-safe ramp on a single AudioParam: cancel scheduled values, anchor to
   * the current value, then linear-ramp to target at now + duration (or set
   * immediately when duration <= 0). Clamps the target to a finite value and
   * never below the 0.0001 floor when non-zero (T-02-07 mitigation).
   * @private
   */
  _rampParam(param, target, now, duration) {
    if (!param) return;
    const safeTarget = Number.isFinite(target) ? Math.max(0, target) : 0;
    try {
      param.cancelScheduledValues(now);
    } catch (error) {
      // Some browsers throw when there are no scheduled values — ignore.
    }
    if (!duration || duration <= 0) {
      param.setValueAtTime(safeTarget, now);
      return;
    }
    const currentValue =
      typeof param.value === 'number' ? param.value : safeTarget;
    param.setValueAtTime(currentValue, now);
    param.linearRampToValueAtTime(safeTarget, now + duration);
  }

  /**
   * Tear down the node graph. Cancels scheduled values on owned params, stops
   * + disconnects layer oscillators/modulators, disconnects the lowpass and
   * pauseFade, and nulls refs. Idempotent (second call no-op via the guard).
   */
  dispose() {
    if (!this.initialized) return;

    const now = this.context?.currentTime ?? 0;

    Object.values(this.layers || {}).forEach((layer) => {
      this._safeStop(layer?.osc, now);
      this._safeStop(layer?.modulator?.lfo, now);
      this._safeDisconnect(layer?.gain);
      this._safeDisconnect(layer?.filter);
      this._safeDisconnect(layer?.modulator?.depthGain);
    });

    if (this.lowpass) {
      this._cancel(this.lowpass.frequency, now);
      this._safeDisconnect(this.lowpass);
    }
    if (this.musicPauseFadeGain) {
      this._cancel(this.musicPauseFadeGain.gain, now);
      this._safeDisconnect(this.musicPauseFadeGain);
    }

    this.layers = {};
    this.lowpass = null;
    this.musicPauseFadeGain = null;
    this.targetNode = null;
    this.context = null;
    this.initialized = false;
  }

  /** @private */
  _safeStop(node, now) {
    if (!node || typeof node.stop !== 'function') return;
    try {
      node.stop(now);
    } catch (error) {
      // Already stopped.
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
  _randomBetween(min, max) {
    if (this.randomScope && typeof this.randomScope.range === 'function') {
      return this.randomScope.range(min, max);
    }
    const [low, high] = max >= min ? [min, max] : [max, min];
    return low + (high - low) * 0.5; // deterministic midpoint fallback
  }
}

export default MusicMixer;
