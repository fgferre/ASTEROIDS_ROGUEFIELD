import {
  MUSIC_DEFAULT_THEME,
  MUSIC_LAYER_CONFIG,
  MUSIC_PERCUSSION,
  MUSIC_RUN_INTENSITY,
  MUSIC_THEME_CROSSFADE,
  MUSIC_THEMES,
  RUN_FINAL_LAYER,
} from '../../core/GameConstants.js';
import { midiToHz, themeDegreeHz } from './MusicThemes.js';
import RandomService from '../../core/RandomService.js';

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
 *   theme voices (oscillator stack → voice gain → voice filter, one bank per
 *     MUSIC_THEMES entry; a theme change equal-power crossfades the voice
 *     gains of the outgoing and incoming banks, then stops and releases the
 *     old one)
 *   → layerGains[base|tension|danger|climax]      (writer: MusicMixer)
 *   + percussion hits → the playing bank's percussion voice gain (the outgoing
 *     theme's drums stop at the change; the incoming ones fade in)
 *     → percussionGain (writer: MusicMixer, follows the run intensity)
 *     → music lowpass (pre-built at init; bypass ~20kHz; writer: MusicMixer
 *        pause ramps its FREQUENCY only — built HERE, never at pause time)
 *     → musicPauseFadeGain                          (writer: MusicMixer pause/fade)
 *     → targetNode == musicGain SLIDER stage        (writer: facade ONLY — the
 *        mixer routes INTO this node but NEVER schedules on its gain param).
 *
 * MusicIntensityResolver lives INSIDE this class (PROJECT.md lock — not a 7th
 * manager): the run (wave progress, enemy density, low HP) drives a smoothed
 * 0..1 intensity whose thresholds pick the level (setRunState); the boss arc
 * (setIntensityFromBossEvent) overrides upwards while it is active.
 */

// Lowpass bypass cutoff — effectively "open" so the filter is permanently in
// the signal path (built once at init) yet inaudible until pause ramps it down.
const LOWPASS_BYPASS_FREQUENCY = 20000;

// D-05: tension/danger rises are slow crossfades (8-15s, imperceptible). One
// tunable constant inside that window — the browser-check calibrates the feel.
const SLOW_RISE_SECONDS = 11;

// Boss-arc → intensity-level floor (D-04); the run intensity drives the rest.
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

// Intensity levels at which the rhythmic pulse grid runs (D-02): only
// danger/climax add the quantized pulse; base/tension are gain-only drones.
const RHYTHM_LEVELS = Object.freeze({ 2: true, 3: true });

// Minimal bar-clock (RESEARCH RESOLVED Q3): a ~25ms lookahead scheduler that
// schedules the next pulse onset at nextBarTime. NOT a generic Transport.
const LOOKAHEAD_INTERVAL_MS = 25; // tick granularity
const SCHEDULE_AHEAD_SECONDS = 0.1; // schedule onsets up to this far ahead
const PULSE_DURATION_SECONDS = 0.12; // short percussive blip per onset
// proposta 18/10: on a theme change the outgoing drums stop at once (no new
// hits) and the hits already scheduled ahead fade out over this many seconds,
// while the outgoing drones crossfade over MUSIC_THEME_CROSSFADE.seconds.
const THEME_PERCUSSION_RELEASE_SECONDS = 0.08;

// Pause "underwater" feel (D-10): ramp the pre-built lowpass into this band and
// drop musicPauseFadeGain to ~50%. Tunable — the browser-check calibrates feel.
const PAUSE_LOWPASS_FREQUENCY = 700; // ~600-1000 Hz underwater cutoff
const PAUSE_FADE_GAIN = 0.5; // ~50% on pause
const PAUSE_RAMP_SECONDS = 0.25; // smooth (click-safe) pause transition

const RUN_INTENSITY_EPSILON = 0.002; // smoothing stops once this close to target

const clamp01 = (value) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/**
 * Raw (unsmoothed) run intensity 0..1 from run progress, enemy density and HP.
 *
 * @param {{wave?: number, enemyCount?: number, healthRatio?: number}} [state]
 * @param {number} [finalLayer=RUN_FINAL_LAYER]
 * @returns {number}
 */
export function computeRunIntensity(state = {}, finalLayer = RUN_FINAL_LAYER) {
  const config = MUSIC_RUN_INTENSITY;
  const wave = Number(state.wave) || 0;
  const progress = clamp01(wave / Math.max(1, finalLayer));
  const density = clamp01(
    (Number(state.enemyCount) || 0) / config.densityFullCount
  );
  const healthRatio = Number(state.healthRatio);
  const lowHealth =
    Number.isFinite(healthRatio) &&
    healthRatio > 0 &&
    healthRatio < config.lowHealthRatio;

  return clamp01(
    progress * config.waveWeight +
      density * config.densityWeight +
      (lowHealth ? config.lowHealthBonus : 0)
  );
}

/** Level (index into MUSIC_LAYER_CONFIG.intensities) for an intensity 0..1. */
export function intensityToLevel(intensity) {
  return MUSIC_RUN_INTENSITY.levelThresholds.filter(
    (threshold) => intensity >= threshold
  ).length;
}

/** Final level: the run level, raised to the boss-arc level when one is set. */
export function resolveMusicLevel(intensity, bossLevel = null) {
  const runLevel = intensityToLevel(intensity);
  return Number.isFinite(bossLevel) ? Math.max(runLevel, bossLevel) : runLevel;
}

/**
 * Percussion layer level 0..1 for an intensity 0..1: silent below
 * MUSIC_PERCUSSION.enterIntensity, linear up to 1 at fullIntensity.
 */
export function percussionMix(intensity) {
  const { enterIntensity, fullIntensity } = MUSIC_PERCUSSION;
  return clamp01(
    (intensity - enterIntensity) / (fullIntensity - enterIntensity)
  );
}

/**
 * Intensity the percussion follows: the smoothed run intensity, raised to the
 * threshold of the boss-arc level when one is set.
 */
export function percussionIntensity(runIntensity, bossLevel = null) {
  const thresholds = MUSIC_RUN_INTENSITY.levelThresholds;
  const floor =
    Number.isFinite(bossLevel) && bossLevel > 0
      ? thresholds[Math.min(bossLevel, thresholds.length) - 1]
      : 0;
  return Math.max(runIntensity, floor);
}

/**
 * One-pole step of `current` toward `target` over `dtSeconds`: attack time
 * constant when rising, release when falling.
 */
export function smoothIntensity(current, target, dtSeconds) {
  const tau =
    target > current
      ? MUSIC_RUN_INTENSITY.attackSeconds
      : MUSIC_RUN_INTENSITY.releaseSeconds;
  const alpha = 1 - Math.exp(-Math.max(0, dtSeconds) / tau);
  return current + (target - current) * alpha;
}

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
    this.percussionGain = null;
    this._percussionNoise = null;
    this._percussionTarget = 0;

    const initialLevel =
      typeof MUSIC_LAYER_CONFIG?.initialIntensity === 'number'
        ? MUSIC_LAYER_CONFIG.initialIntensity
        : 0;
    this.intensityLevel = initialLevel;
    this.targetLevel = initialLevel;

    // --- theme: the playing voice bank + banks still fading out ---
    this.themeId = MUSIC_DEFAULT_THEME;
    this._themeBank = null;
    this._fadingBanks = [];

    // --- transport (bar-clock) + pause state ---
    this._lookaheadHandle = null; // setInterval handle for the lookahead
    this._nextBarTime = 0; // next pulse onset (context.currentTime domain)
    this._pulseStep = 0; // index into the theme's pulse pattern
    this._nextPercussionTime = 0; // next percussion step onset
    this._percussionStep = 0; // index into the theme's percussion loop
    this._isPaused = false;

    // --- run-following intensity (raw inputs → smoothed 0..1) + boss override ---
    this.runState = { wave: 0, enemyCount: 0, healthRatio: 1 };
    this.runIntensity = 0;
    this.bossLevel = null;
    this._smoothHandle = null;

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

    // --- 4 intensity layers → lowpass, voiced by the current theme ---
    this.layers = this._buildLayers(context, now, lowpass);
    // --- percussion layer → lowpass (silent until the intensity gate opens) ---
    this.percussionGain = context.createGain();
    this.percussionGain.gain.setValueAtTime(0, now);
    this.percussionGain.connect(lowpass);
    this._percussionNoise = this._buildPercussionNoise(context);
    this._themeBank = this._buildThemeBank(this.themeId, now, 1);

    this.initialized = true;

    // Anchor every layer to its initial-level profile immediately (no ramp).
    this._applyIntensity(this.intensityLevel, { immediate: true });
  }

  /**
   * Build the theme-independent part of each layer: the intensity gain (with
   * its slow LFO) routed into the pre-built lowpass. The theme voices feed it.
   * @private
   */
  _buildLayers(context, now, lowpass) {
    const layersConfig = MUSIC_LAYER_CONFIG?.layers || {};
    const theme = MUSIC_THEMES[this.themeId];
    const created = {};

    Object.entries(layersConfig).forEach(([key, layerConfig = {}]) => {
      const gain = context.createGain();
      // Layers start silent — intensity ramps them in.
      gain.gain.setValueAtTime(0, now);

      // Slow amplitude modulation (LFO → gain.gain) for an atmospheric drone.
      let modulator = null;
      const depthMultiplier =
        typeof layerConfig.modulationDepth === 'number'
          ? Math.max(0, Math.min(0.95, layerConfig.modulationDepth))
          : 0;
      if (depthMultiplier > 0) {
        const lfo = context.createOscillator();
        const depthGain = context.createGain();
        const rate = this._modulationRate(theme, key);
        lfo.type = layerConfig.modulationType || 'sine';
        lfo.frequency.setValueAtTime(rate, now);
        depthGain.gain.setValueAtTime(0, now);
        lfo.connect(depthGain);
        depthGain.connect(gain.gain);

        const phaseOffset = this._randomBetween(0, Math.min(1 / rate, 2.5));
        lfo.start(now + Math.max(0, phaseOffset));
        modulator = { lfo, depthGain, depthMultiplier };
      }

      gain.connect(lowpass);
      created[key] = { gain, modulator, config: layerConfig };
    });

    return created;
  }

  /** LFO rate of a theme's layer (Hz). @private */
  _modulationRate(theme, key) {
    return Math.max(0.01, theme?.layers?.[key]?.modulationRate ?? 0.12);
  }

  /**
   * Build one voice bank for `themeId`: per layer, a stack of oscillators
   * (theme notes, spread + seeded detune) → voice gain → voice filter → the
   * layer's intensity gain. Voice gains start at `weight` × their level.
   * @private
   */
  _buildThemeBank(themeId, now, weight) {
    const context = this.context;
    const theme = MUSIC_THEMES[themeId];
    const voices = {};

    Object.entries(this.layers).forEach(([key, layer]) => {
      const voiceConfig = theme.layers[key];
      if (!voiceConfig) return;
      const notes = voiceConfig.notes;
      // Equal-power sum: a stack of n notes is as loud as one oscillator.
      const level = (voiceConfig.level ?? 1) / Math.sqrt(notes.length);

      const gain = context.createGain();
      gain.gain.setValueAtTime(level * weight, now);

      let output = gain;
      let filter = null;
      if (voiceConfig.filter) {
        filter = context.createBiquadFilter();
        filter.type = voiceConfig.filter.type;
        filter.frequency.setValueAtTime(voiceConfig.filter.frequency, now);
        filter.Q.setValueAtTime(voiceConfig.filter.Q, now);
        gain.connect(filter);
        output = filter;
      }
      output.connect(layer.gain);

      const spread = voiceConfig.detuneCents ?? 0;
      const randomSpan = voiceConfig.randomDetuneCents ?? 0;
      const oscillators = notes.map((note, index) => {
        const osc = context.createOscillator();
        osc.type = voiceConfig.type;
        osc.frequency.setValueAtTime(midiToHz(theme.root + note), now);
        // Seeded detune (replay-deterministic — never Math.random).
        const detune =
          (index - (notes.length - 1) / 2) * spread +
          (randomSpan > 0 ? this._randomBetween(-randomSpan, randomSpan) : 0);
        osc.detune.setValueAtTime(detune, now);
        osc.connect(gain);
        osc.start(now);
        return osc;
      });

      voices[key] = { oscillators, gain, filter, level };
    });

    // Percussion voice: no oscillators — the transport schedules hits into it.
    if (theme.percussion && this.percussionGain) {
      const gain = context.createGain();
      gain.gain.setValueAtTime(weight, now);
      gain.connect(this.percussionGain);
      voices.percussion = { oscillators: [], gain, filter: null, level: 1 };
    }

    return { themeId, voices };
  }

  /** Seeded mono noise buffer shared by the percussion noise hits. @private */
  _buildPercussionNoise(context) {
    if (typeof context.createBuffer !== 'function') return null;
    const rate = context.sampleRate;
    const length = Math.max(
      1,
      Math.floor(rate * MUSIC_PERCUSSION.noiseSeconds)
    );
    const buffer = context.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    const rng = new RandomService(MUSIC_PERCUSSION.noiseSeed);
    for (let i = 0; i < length; i += 1) {
      data[i] = rng.range(-1, 1);
    }
    return buffer;
  }

  /**
   * Switch the music theme. Default: equal-power crossfade of the voice gains
   * over MUSIC_THEME_CROSSFADE.seconds (incoming bank built silent, outgoing
   * bank stopped once silent); `immediate` cuts. Layer intensity gains are not
   * touched, so the run intensity keeps driving which layers sound.
   *
   * @param {string} themeId - key of MUSIC_THEMES
   * @param {{immediate?: boolean}} [options]
   */
  setTheme(themeId, { immediate = false } = {}) {
    if (!MUSIC_THEMES[themeId] || themeId === this.themeId) return;
    this.themeId = themeId;
    this._pulseStep = 0;
    this._percussionStep = 0;
    if (!this.initialized || !this.context) return;

    const now = this.context.currentTime;
    const seconds = immediate ? 0 : MUSIC_THEME_CROSSFADE.seconds;
    const outgoing = this._themeBank;
    const incoming = this._buildThemeBank(themeId, now, immediate ? 1 : 0);
    this._themeBank = incoming;

    const theme = MUSIC_THEMES[themeId];
    Object.entries(this.layers).forEach(([key, layer]) => {
      const lfoRate = layer.modulator?.lfo?.frequency;
      if (lfoRate) {
        this._rampParam(
          lfoRate,
          this._modulationRate(theme, key),
          now,
          seconds
        );
      }
    });

    if (!outgoing) return;
    if (immediate) {
      this._stopBank(outgoing, now);
      return;
    }
    Object.values(incoming.voices).forEach((voice) => {
      this._equalPowerRamp(voice.gain.gain, 0, voice.level, now, seconds);
    });
    Object.entries(outgoing.voices).forEach(([key, voice]) => {
      const from =
        typeof voice.gain.gain.value === 'number'
          ? voice.gain.gain.value
          : voice.level;
      const fade =
        key === 'percussion' ? THEME_PERCUSSION_RELEASE_SECONDS : seconds;
      this._equalPowerRamp(voice.gain.gain, from, 0, now, fade);
    });
    this._stopBank(outgoing, now + seconds);
    this._fadingBanks.push(outgoing);
  }

  /**
   * Equal-power gain move from `from` to `to`: value(t) = from·cos(tπ/2) +
   * to·sin(tπ/2), scheduled as MUSIC_THEME_CROSSFADE.segments linear ramps
   * that end exactly on `to` at now + seconds (click-safe anchor first).
   * @private
   */
  _equalPowerRamp(param, from, to, now, seconds) {
    this._cancel(param, now);
    param.setValueAtTime(from, now);
    const segments = MUSIC_THEME_CROSSFADE.segments;
    for (let i = 1; i <= segments; i += 1) {
      const t = i / segments;
      const value =
        i === segments
          ? to
          : from * Math.cos((t * Math.PI) / 2) +
            to * Math.sin((t * Math.PI) / 2);
      param.linearRampToValueAtTime(value, now + seconds * t);
    }
  }

  /**
   * Stop a bank's oscillators at `when`; the last one to end releases the
   * bank.
   * @private
   */
  _stopBank(bank, when) {
    const oscillators = Object.values(bank.voices).flatMap(
      (voice) => voice.oscillators
    );
    let playing = oscillators.length;
    if (playing === 0) {
      this._releaseBank(bank);
      return;
    }
    oscillators.forEach((osc) => {
      osc.onended = () => {
        this._safeDisconnect(osc);
        playing -= 1;
        if (playing === 0) this._releaseBank(bank);
      };
      this._safeStop(osc, when);
    });
  }

  /** Disconnect a stopped bank's gains and filters and forget it. @private */
  _releaseBank(bank) {
    Object.values(bank.voices).forEach((voice) => {
      this._safeDisconnect(voice.gain);
      this._safeDisconnect(voice.filter);
    });
    this._fadingBanks = this._fadingBanks.filter((fading) => fading !== bank);
  }

  /**
   * Boss arc override: map a boss-arc event to a level floor and crossfade.
   * boss-defeated clears the floor (the run intensity takes over again).
   * Non-boss events are ignored.
   *
   * @param {string} eventName
   */
  setIntensityFromBossEvent(eventName) {
    if (!Object.prototype.hasOwnProperty.call(BOSS_ARC_INTENSITY, eventName)) {
      return; // non-boss event — leave targetLevel unchanged
    }
    this.bossLevel =
      eventName === 'boss-defeated' ? null : BOSS_ARC_INTENSITY[eventName];
    this._applyIntensity(resolveMusicLevel(this.runIntensity, this.bossLevel));
  }

  /**
   * Update the run inputs (any subset of wave / enemyCount / healthRatio). The
   * smoothed intensity follows on a low-rate tick that stops once converged.
   *
   * @param {{wave?: number, enemyCount?: number, healthRatio?: number}} partial
   */
  setRunState(partial = {}) {
    Object.entries(partial).forEach(([key, value]) => {
      if (key in this.runState && Number.isFinite(value)) {
        this.runState[key] = value;
      }
    });
    this._startSmoothing();
  }

  /** Back to a fresh run: inputs, smoothed intensity and boss floor cleared. */
  resetRun() {
    this._stopSmoothing();
    this.runState = { wave: 0, enemyCount: 0, healthRatio: 1 };
    this.runIntensity = 0;
    this.bossLevel = null;
    this._applyIntensity(0, {
      rampSeconds: MUSIC_RUN_INTENSITY.layerFadeSeconds,
    });
    this.setTheme(MUSIC_DEFAULT_THEME, { immediate: true });
  }

  /** @private */
  _startSmoothing() {
    if (this._smoothHandle) return;
    this._smoothHandle = setInterval(
      () => this._smoothTick(),
      MUSIC_RUN_INTENSITY.tickMs
    );
  }

  /** @private */
  _stopSmoothing() {
    if (this._smoothHandle) {
      clearInterval(this._smoothHandle);
      this._smoothHandle = null;
    }
  }

  /**
   * One smoothing step (nominal tick dt, frozen while paused). Crossfades only
   * when the resolved level changes.
   * @private
   */
  _smoothTick() {
    if (this._isPaused) return;
    const target = computeRunIntensity(this.runState);
    this.runIntensity = smoothIntensity(
      this.runIntensity,
      target,
      MUSIC_RUN_INTENSITY.tickMs / 1000
    );
    if (Math.abs(target - this.runIntensity) < RUN_INTENSITY_EPSILON) {
      this.runIntensity = target;
      this._stopSmoothing();
    }
    const level = resolveMusicLevel(this.runIntensity, this.bossLevel);
    if (level !== this.targetLevel) {
      this._applyIntensity(level, {
        rampSeconds: MUSIC_RUN_INTENSITY.layerFadeSeconds,
      });
    } else {
      this._applyPercussion(MUSIC_RUN_INTENSITY.tickMs / 1000);
    }
  }

  /**
   * Ramp the percussion layer to its level for the current run intensity and
   * boss floor over `rampSeconds` (0 = set). Writes ONLY percussionGain.
   * @private
   */
  _applyPercussion(rampSeconds) {
    const target =
      percussionMix(percussionIntensity(this.runIntensity, this.bossLevel)) *
      MUSIC_PERCUSSION.gain;
    this._percussionTarget = target;
    if (!this.initialized || !this.context || !this.percussionGain) return;
    this._rampParam(
      this.percussionGain.gain,
      target,
      this.context.currentTime,
      rampSeconds
    );
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

    const { immediate = false, rampSeconds = this.rampDurations.rise } =
      options;
    const rampDuration = Math.max(0.05, rampSeconds);
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

    this._applyPercussion(immediate ? 0 : rampDuration);
    this.intensityLevel = targetLevel;

    // D-02: the rhythmic pulse grid runs ONLY at danger/climax. Start/stop the
    // minimal bar-clock to match the target level (never while paused).
    this._syncTransport();
  }

  // -------------------------------------------------------------------------
  // Bar-clock transport (D-02) — minimal lookahead scheduler.
  // -------------------------------------------------------------------------

  /**
   * Start the lookahead when the level needs rhythm (danger/climax) and we are
   * not paused; stop it otherwise. Idempotent.
   * @private
   */
  _syncTransport() {
    const needsRhythm = !!RHYTHM_LEVELS[this.intensityLevel];
    if (needsRhythm && !this._isPaused) {
      this._startLookahead();
    } else {
      this._stopLookahead();
    }
  }

  /**
   * Start the ~25ms lookahead. The next onset is anchored to the CURRENT
   * context time (re-anchoring after a pause leaves zero accumulated offset).
   * @private
   */
  _startLookahead() {
    if (this._lookaheadHandle || !this.context) return;
    // Anchor the grid to the present — never to a stale wall-clock position.
    // The first onset lands at the next bar boundary >= now so the first tick
    // schedules it within the schedule-ahead window.
    this._nextBarTime = this.context.currentTime;
    this._nextPercussionTime = this._nextBarTime;
    this._percussionStep = 0;
    this._lookaheadHandle = setInterval(
      () => this._lookaheadTick(),
      LOOKAHEAD_INTERVAL_MS
    );
    // Schedule synchronously on start so the first onset is not delayed a full
    // tick (and so danger/climax produce a pulse immediately under fake timers).
    this._lookaheadTick();
  }

  /** Stop the lookahead and release its handle. Idempotent. @private */
  _stopLookahead() {
    if (this._lookaheadHandle) {
      clearInterval(this._lookaheadHandle);
      this._lookaheadHandle = null;
    }
  }

  /**
   * One lookahead tick: schedule every pulse onset that falls within the
   * schedule-ahead window, advancing the grid by one bar each time. Onset times
   * derive from context.currentTime — NEVER Date.now/performance.now.
   * @private
   */
  _lookaheadTick() {
    if (this._isPaused || !this.context || !this.initialized) return;
    const horizon = this.context.currentTime + SCHEDULE_AHEAD_SECONDS;
    let guard = 0;
    while (this._nextBarTime <= horizon && guard < 64) {
      this._schedulePulse(this._nextBarTime);
      this._nextBarTime += MUSIC_THEMES[this.themeId].barSeconds;
      guard += 1;
    }
    guard = 0;
    while (this._nextPercussionTime <= horizon && guard < 64) {
      this._schedulePercussionStep(this._nextPercussionTime);
      const theme = MUSIC_THEMES[this.themeId];
      this._nextPercussionTime +=
        theme.barSeconds / (theme.percussion?.subdivision || 1);
      guard += 1;
    }
  }

  /**
   * Schedule the percussion hits of the current loop step at `onsetTime` into
   * the playing bank's percussion voice (a bank fading out gets no new hits,
   * so two themes never drum at once). Skips the step while the layer is
   * closed and silent.
   * @private
   */
  _schedulePercussionStep(onsetTime) {
    const step = this._percussionStep;
    this._percussionStep += 1;
    const layerGain = this.percussionGain?.gain;
    if (!layerGain) return;
    if (this._percussionTarget <= 0 && !(layerGain.value > 0.001)) return;

    const voice = this._themeBank?.voices?.percussion;
    if (!voice) return;
    const { percussion } = MUSIC_THEMES[this._themeBank.themeId];
    const loopStep = step % percussion.steps;
    percussion.hits.forEach((hit) => {
      if (hit.steps.includes(loopStep)) {
        this._schedulePercussionHit(hit, onsetTime, voice.gain);
      }
    });
  }

  /**
   * One percussion hit at `onsetTime` into `destination`: a pitch-dropping
   * tone (plus an optional sub tail) or a burst of filtered seeded noise.
   * Every node is released on ended.
   * @private
   */
  _schedulePercussionHit(hit, onsetTime, destination) {
    const context = this.context;
    const playTone = (type, startHz, endHz, seconds, peak) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const end = onsetTime + seconds;
      osc.type = type;
      osc.frequency.setValueAtTime(startHz, onsetTime);
      osc.frequency.exponentialRampToValueAtTime(endHz, end);
      gain.gain.setValueAtTime(peak, onsetTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(destination);
      osc.onended = () => {
        this._safeDisconnect(osc);
        this._safeDisconnect(gain);
      };
      osc.start(onsetTime);
      osc.stop(end);
    };

    if (hit.kind === 'tone') {
      playTone(hit.type, hit.startHz, hit.endHz, hit.seconds, hit.gain);
      if (hit.subHz) {
        playTone('sine', hit.subHz, hit.subHz, hit.subSeconds, hit.subGain);
      }
      return;
    }

    if (!this._percussionNoise) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const end = onsetTime + hit.seconds;
    source.buffer = this._percussionNoise;
    filter.type = hit.filter.type;
    filter.frequency.setValueAtTime(hit.filter.frequency, onsetTime);
    filter.Q.setValueAtTime(hit.filter.Q, onsetTime);
    gain.gain.setValueAtTime(hit.gain, onsetTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.onended = () => {
      this._safeDisconnect(source);
      this._safeDisconnect(filter);
      this._safeDisconnect(gain);
    };
    source.start(onsetTime);
    source.stop(end);
  }

  /**
   * Schedule a single short pulse oscillator at `onsetTime`, pitched on the
   * next step of the theme's pulse pattern. Registers onended
   * cleanup so each per-bar oscillator releases its nodes (no leak across
   * hundreds of bars). Uses the seeded randomScope for variation — never
   * Math.random.
   * @private
   */
  _schedulePulse(onsetTime) {
    const context = this.context;
    if (!context || typeof context.createOscillator !== 'function') return;

    const osc = context.createOscillator();
    const gain = context.createGain();

    const theme = MUSIC_THEMES[this.themeId];
    const { pulse } = theme;
    const degree = pulse.pattern[this._pulseStep % pulse.pattern.length];
    this._pulseStep += 1;

    // Seeded pitch variation (replay-deterministic).
    const detune = this._randomBetween(-12, 12);
    osc.type = pulse.type;
    if (osc.frequency && typeof osc.frequency.setValueAtTime === 'function') {
      osc.frequency.setValueAtTime(
        themeDegreeHz(theme, degree, pulse.octave),
        onsetTime
      );
    }
    if (osc.detune && typeof osc.detune.setValueAtTime === 'function') {
      osc.detune.setValueAtTime(detune, onsetTime);
    }

    // Short percussive envelope on the pulse's own gain.
    const endTime = onsetTime + PULSE_DURATION_SECONDS;
    if (gain.gain) {
      gain.gain.setValueAtTime(pulse.gain, onsetTime);
      if (typeof gain.gain.linearRampToValueAtTime === 'function') {
        gain.gain.linearRampToValueAtTime(0.0001, endTime);
      }
    }

    osc.connect(gain);
    // Route through the same pre-built lowpass so pause muffles the pulse too.
    if (this.lowpass) {
      gain.connect(this.lowpass);
    }

    // onended cleanup — release this per-bar oscillator (no leak).
    osc.onended = () => {
      this._safeDisconnect(osc);
      this._safeDisconnect(gain);
    };

    try {
      osc.start(onsetTime);
      osc.stop(endTime);
    } catch (error) {
      // Defensive: a re-scheduled/stopped node should never crash the grid.
    }
  }

  // -------------------------------------------------------------------------
  // Pause (D-10 / SC1) + fade (D-12).
  // -------------------------------------------------------------------------

  /**
   * Pause/resume the music (D-10). On pause: freeze layer gains (anchor+hold),
   * STOP the lookahead (no new onsets while paused — SC1 no drift), ramp the
   * pre-built lowpass down to the underwater band and musicPauseFadeGain to
   * ~50%. On resume: re-anchor the grid to fresh currentTime, ramp the lowpass
   * back to bypass, restore pauseFadeGain. Writes ONLY owned params.
   *
   * @param {boolean} isPaused
   */
  pause(isPaused) {
    if (!this.initialized || !this.context) {
      this._isPaused = !!isPaused;
      return;
    }
    const now = this.context.currentTime;
    this._isPaused = !!isPaused;

    if (this._isPaused) {
      // Freeze every layer gain at its current value (anchor + hold).
      Object.values(this.layers || {}).forEach((layer) => {
        const param = layer?.gain?.gain;
        this._freezeParam(param, now);
        this._freezeParam(layer?.modulator?.depthGain?.gain, now);
      });
      this._freezeParam(this.percussionGain?.gain, now);
      // Stop the grid — no new onsets while paused (SC1: no wall-clock drift).
      this._stopLookahead();
      // Underwater: ramp the SAME pre-built lowpass down + drop pauseFade ~50%.
      this._rampLowpass(PAUSE_LOWPASS_FREQUENCY, now);
      this._rampParam(
        this.musicPauseFadeGain?.gain,
        PAUSE_FADE_GAIN,
        now,
        PAUSE_RAMP_SECONDS
      );
    } else {
      // Resume: lowpass back to bypass, pauseFade back to unity.
      this._rampLowpass(LOWPASS_BYPASS_FREQUENCY, now);
      this._rampParam(
        this.musicPauseFadeGain?.gain,
        1,
        now,
        PAUSE_RAMP_SECONDS
      );
      // Re-restore layer levels for the current intensity, and re-anchor the
      // grid to fresh currentTime (zero accumulated offset).
      this._applyIntensity(this.intensityLevel);
    }
  }

  /**
   * D-12 death-fade hook: click-safe ramp of musicPauseFadeGain to `targetGain`
   * over `durationSeconds`. Writes the pauseFade stage ONLY — never the slider
   * stage. This is the parameterized fade Phase 4's cinematic death uses.
   *
   * @param {number} targetGain
   * @param {number} durationSeconds
   */
  fade(targetGain, durationSeconds) {
    if (!this.initialized || !this.context || !this.musicPauseFadeGain) return;
    const now = this.context.currentTime;
    const duration = Math.max(0, Number(durationSeconds) || 0);
    this._rampParam(this.musicPauseFadeGain.gain, targetGain, now, duration);
  }

  /**
   * Ramp the pre-built lowpass FREQUENCY (the only param pause touches on it).
   * Prefers a linear ramp; falls back to setValueAtTime when unavailable.
   * @private
   */
  _rampLowpass(target, now) {
    const param = this.lowpass?.frequency;
    if (!param) return;
    try {
      param.cancelScheduledValues(now);
    } catch (error) {
      // Ignore empty-schedule throws.
    }
    const current = typeof param.value === 'number' ? param.value : target;
    if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(current, now);
    }
    if (typeof param.linearRampToValueAtTime === 'function') {
      param.linearRampToValueAtTime(target, now + PAUSE_RAMP_SECONDS);
    } else if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(target, now + PAUSE_RAMP_SECONDS);
    }
  }

  /**
   * Freeze a gain param at its current value (cancel scheduled ramps, hold).
   * @private
   */
  _freezeParam(param, now) {
    if (!param || typeof param.setValueAtTime !== 'function') return;
    try {
      param.cancelScheduledValues(now);
    } catch (error) {
      // Ignore empty-schedule throws.
    }
    const current = typeof param.value === 'number' ? param.value : 0;
    param.setValueAtTime(current, now);
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
    this._stopSmoothing();
    if (!this.initialized) return;

    const now = this.context?.currentTime ?? 0;

    // Stop the bar-clock FIRST — no onset must fire after dispose.
    this._stopLookahead();
    this._isPaused = false;

    [this._themeBank, ...this._fadingBanks].forEach((bank) => {
      if (!bank) return;
      Object.values(bank.voices).forEach((voice) => {
        voice.oscillators.forEach((osc) => {
          this._safeStop(osc, now);
          this._safeDisconnect(osc);
        });
        this._safeDisconnect(voice.gain);
        this._safeDisconnect(voice.filter);
      });
    });
    this._themeBank = null;
    this._fadingBanks = [];

    Object.values(this.layers || {}).forEach((layer) => {
      this._safeStop(layer?.modulator?.lfo, now);
      this._safeDisconnect(layer?.gain);
      this._safeDisconnect(layer?.modulator?.depthGain);
    });

    if (this.percussionGain) {
      this._cancel(this.percussionGain.gain, now);
      this._safeDisconnect(this.percussionGain);
    }

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
    this.percussionGain = null;
    this._percussionNoise = null;
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
