import AudioPool from '../AudioPool.js';
import AudioCache from '../AudioCache.js';
import AudioBatcher from '../AudioBatcher.js';
import ThrusterLoopManager from '../ThrusterLoopManager.js';
import { createSfxSynthPort } from './SfxSynthPort.js';
import RandomService from '../../core/RandomService.js';

/**
 * SFXBus — owns ALL per-event SFX synthesis (INFRA-02).
 *
 * Extraction half of the SFX decomposition (variants/voice-pool/fire evolution
 * are 02.10). The synthesis METHOD BODIES relocate here from the AudioSystem
 * facade; the four helper FILES (AudioPool / AudioCache / AudioBatcher /
 * ThrusterLoopManager) STAY at src/modules/ (AGENTS.md:7) — SFXBus imports them
 * from their current paths and owns the INSTANCES. The facade keeps thin
 * delegating wrappers for its public API while the relocated private bodies are
 * REMOVED from it (review: no duplicate ownership).
 *
 * GAIN TOPOLOGY (cross-plan contract — this plan creates the split):
 *   AMBIENT SFX (enemy/world synth) → ambientBus
 *       → effectsDuckGain (02.06 DuckingController) → effectsGain (slider) → master
 *   PROTECTED SFX (player shot, player-landed hits, player damage) → protectedBus
 *       → effectsGain (slider) DIRECTLY  [bypasses effectsDuckGain — player
 *         feedback never ducks; 02.08 routes boss roars here and splices reverb
 *         at the merge before effectsGain]
 * SFXBus writes ONLY ambientBus / protectedBus and its per-voice nodes — never
 * the duck/slider stages.
 *
 * Resource/lifecycle contract (matches MusicMixer/FileTrack/Ducking managers):
 *   - constructor(config): stores config ONLY. No AudioContext work.
 *   - init(context, deps): builds the buses + owns pool/cache/batcher/thruster.
 *   - dispose(): stops thruster loops, cleans batcher/pool/cache, disconnects
 *       the buses; idempotent.
 *
 * Facade seams (injected — the bus never reaches back into the facade god-class):
 *   - getContext(): the live AudioContext (mutable; tests reassign facade.context)
 *   - getRandomScopes(): the facade-owned seeded scopes (determinism + INFRA-03
 *       debug global stay on the facade; SFXBus only READS the scopes)
 *   - safePlay(fn): the centralized ensureRunning resume gate (INFRA-02 / 02.06)
 *   - trackPerformance(name): the facade's perf counter
 *   - getEffectsFallbackDestination(): pre-init fallback so SFX is never dropped
 *       when the buses are not yet spliced (e.g. tests setting fields directly).
 */
class SFXBus {
  /**
   * @param {object} [config] - Reserved for future calibration overrides.
   */
  constructor(config = {}) {
    // --- config only (NO AudioContext work) ---
    this.config = config || {};

    // --- owned instances (constructed in init) ---
    this.pool = null;
    this.cache = null;
    this.batcher = null;
    this.thrusterLoops = new ThrusterLoopManager();

    // --- owned output buses (created in init) ---
    this.ambientBus = null; // → effectsDuckGain (ducks with the world)
    this.protectedBus = null; // → effectsGain directly (player feedback never ducks)

    // --- injected facade seams (assigned in init) ---
    this._getContext = () => null;
    this._getRandomScopes = () => null;
    this._safePlay = (fn) => {
      if (typeof fn === 'function') fn();
    };
    this._trackPerformance = () => {};
    this._getEffectsFallbackDestination = () => null;

    this._fallbackRandom = null;
    this.initialized = false;
  }

  /**
   * Build the ambient/protected buses and construct the owned instances.
   *
   * @param {AudioContext} context
   * @param {object} deps
   * @param {AudioNode} [deps.effectsDuckGain] - the duck node ambient SFX routes
   *   through (02.06). ambientBus → effectsDuckGain.
   * @param {AudioNode} [deps.effectsGain] - the effects slider stage. protectedBus
   *   → effectsGain DIRECTLY (bypasses the duck).
   * @param {() => AudioContext} [deps.getContext] - live-context getter.
   * @param {() => object} [deps.getRandomScopes] - facade-owned scopes getter.
   * @param {(fn: () => void) => void} [deps.safePlay] - resume gate.
   * @param {(name: string) => void} [deps.trackPerformance]
   * @param {() => AudioNode|null} [deps.getEffectsFallbackDestination]
   * @param {object} [deps.randomScopes] - scopes snapshot for pool/cache/batcher.
   */
  init(context, deps = {}) {
    if (this.initialized) return;
    if (!context) return;

    const {
      effectsDuckGain = null,
      effectsGain = null,
      getContext,
      getRandomScopes,
      safePlay,
      trackPerformance,
      getEffectsFallbackDestination,
      randomScopes,
    } = deps;

    if (typeof getContext === 'function') this._getContext = getContext;
    else this._getContext = () => context;
    if (typeof getRandomScopes === 'function')
      this._getRandomScopes = getRandomScopes;
    if (typeof safePlay === 'function') this._safePlay = safePlay;
    if (typeof trackPerformance === 'function')
      this._trackPerformance = trackPerformance;
    if (typeof getEffectsFallbackDestination === 'function')
      this._getEffectsFallbackDestination = getEffectsFallbackDestination;

    const scopes = randomScopes || this._getRandomScopes() || {};

    // --- ambientBus: world/enemy SFX → effectsDuckGain (ducks) ---
    this.ambientBus = context.createGain();
    if (effectsDuckGain) {
      this.ambientBus.connect(effectsDuckGain);
    } else if (effectsGain) {
      this.ambientBus.connect(effectsGain);
    }

    // --- protectedBus: player feedback → effectsGain DIRECTLY (bypasses duck) ---
    this.protectedBus = context.createGain();
    if (effectsGain) {
      this.protectedBus.connect(effectsGain);
    }

    // --- owned optimization instances (relocated ownership; files unmoved) ---
    this.pool = new AudioPool(context, 50);
    this.cache = new AudioCache(context, 20, {
      random: scopes?.cache,
    });
    // The batcher consumes the port built from THIS bus's OWN direct methods —
    // the cycle (02.04) closes locally, no facade back-reference.
    this.batcher = new AudioBatcher(this.createSfxSynthPort(), 0, {
      random: scopes?.batcher,
    });

    this.initialized = true;
  }

  /**
   * Build the AudioBatcher's SfxSynthPort from THIS bus's OWN bound methods.
   *
   * After extraction the _play*Direct bodies live here, so the port closes the
   * loop locally — the batcher receives this frozen port, never a system. pool/
   * context are late-bound (getPool/getContext) because pool is assigned during
   * init() and context can be reassigned (tests).
   *
   * @returns {Readonly<object>} the frozen SFX synth port.
   */
  createSfxSynthPort() {
    return createSfxSynthPort({
      playDroneFireDirect: (...args) => this._playDroneFireDirect(...args),
      playHunterBurstDirect: (...args) => this._playHunterBurstDirect(...args),
      playMineExplosionDirect: (...args) =>
        this._playMineExplosionDirect(...args),
      safePlay: (fn) => this._safePlay(fn),
      connectGainNode: (node) => this._connectAmbient(node),
      executeImmediate: (soundType, args) =>
        this._executeBatchedSound(soundType, args),
      getPool: () => this.pool,
      getContext: () => this.context,
    });
  }

  // ---------------------------------------------------------------------------
  // Live-resource accessors (read the facade's mutable fields through getters so
  // a test reassigning facade.context / facade.randomScopes is reflected here).
  // ---------------------------------------------------------------------------

  get context() {
    return this._getContext();
  }

  get randomScopes() {
    return this._getRandomScopes() || {};
  }

  // ---------------------------------------------------------------------------
  // Bus routing — ambient (ducks) vs protected (player feedback, never ducks).
  // Falls back to the facade effects destination before the buses are spliced so
  // SFX is never silently dropped (tests / pre-init).
  // ---------------------------------------------------------------------------

  /** The ambient destination (world/enemy SFX route here → effectsDuckGain). */
  getAmbientDestination() {
    return this.ambientBus || this._getEffectsFallbackDestination() || null;
  }

  /** The protected destination (player feedback → effectsGain, bypasses duck). */
  getProtectedDestination() {
    return (
      this.protectedBus ||
      this.ambientBus ||
      this._getEffectsFallbackDestination() ||
      null
    );
  }

  _connectAmbient(node) {
    const destination = this.getAmbientDestination();
    if (destination && node && typeof node.connect === 'function') {
      node.connect(destination);
    }
  }

  _connectProtected(node) {
    const destination = this.getProtectedDestination();
    if (destination && node && typeof node.connect === 'function') {
      node.connect(destination);
    }
  }

  _resolveRandom(...candidates) {
    for (const candidate of candidates) {
      if (candidate && typeof candidate.float === 'function') {
        return candidate;
      }
    }

    if (!this._fallbackRandom) {
      const scopes = this.randomScopes;
      const base = scopes?.base || scopes?.families?.music || null;
      if (base && typeof base.fork === 'function') {
        this._fallbackRandom = base.fork('sfx-bus:fallback-base');
      } else {
        this._fallbackRandom = new RandomService('sfx-bus:fallback-base');
      }
    }

    return this._fallbackRandom;
  }

  // ===========================================================================
  // Option normalizers (relocated verbatim).
  // ===========================================================================

  normalizeLaserShotOptions(options = {}) {
    const targeting = options?.targeting || {};
    const lockCount = Math.max(1, Math.floor(targeting.lockCount || 1));

    let pitchMultiplier = 1;
    if (targeting.dynamicPrediction) {
      pitchMultiplier += 0.12;
    }
    if (lockCount > 1) {
      pitchMultiplier += Math.min(0.18, 0.04 * (lockCount - 1));
    }

    const tailGain = 0.12 + Math.min(0.05, 0.02 * (lockCount - 1));

    return {
      pitchMultiplier,
      tailGain,
      lockCount,
    };
  }

  _normalizeDroneFireOptions(data = {}) {
    const projectileSpeed = Number(data?.projectile?.speed);
    let speed = Number.isFinite(projectileSpeed)
      ? projectileSpeed
      : Math.hypot(data?.velocity?.x ?? 0, data?.velocity?.y ?? 0);
    if (!Number.isFinite(speed)) {
      speed = 320;
    }

    const spread = Math.abs(Number(data?.projectile?.spread ?? 0));
    const wave = Number(data?.wave);
    const speedRatio = Math.min(1, Math.max(0, (speed - 180) / 320));
    const baseFrequency = 600 + speedRatio * 200; // 600-800Hz window
    const detune = Math.min(80, spread * 120);
    const duration = 0.08 + speedRatio * 0.03;
    const intensity = Math.min(1.2, 0.6 + speedRatio * 0.5);

    return {
      type: 'drone',
      frequency: baseFrequency,
      detune,
      duration,
      gain: 0.1 + intensity * 0.04,
      intensity,
      wave,
      enemyType: (
        data?.enemyType ||
        data?.enemy?.type ||
        'drone'
      ).toLowerCase(),
    };
  }

  _normalizeHunterBurstOptions(data = {}) {
    const burst = data?.projectile?.burst || {};
    const totalShots = Math.max(1, Math.floor(burst.total ?? 3));
    const shotsRemaining = Math.max(
      0,
      Math.floor(burst.shotsRemaining ?? totalShots)
    );
    const shotIndex = Math.max(0, totalShots - shotsRemaining);
    const isFirstShot = shotIndex === 0;

    if (!isFirstShot) {
      // We synthesize the entire burst on the opening shot so repeated
      // callbacks in the same burst don't stack unnecessarily.
      return null;
    }

    const projectileSpeed = Number(data?.projectile?.speed);
    const speedRatio = Number.isFinite(projectileSpeed)
      ? Math.min(1, Math.max(0, (projectileSpeed - 260) / 320))
      : 0.5;

    const baseFrequency = 700 + speedRatio * 120;
    const frequencyJitter = 60 + speedRatio * 30;
    const spacing = 0.05;

    return {
      type: 'hunter',
      baseFrequency,
      frequencyJitter,
      shotCount: totalShots,
      spacing,
      duration: 0.09,
      gain: 0.13 + speedRatio * 0.06,
      intensity: Math.min(1.2, 0.7 + speedRatio * 0.5),
      burstId:
        burst.id !== undefined
          ? `hunter:${burst.id}`
          : `hunter:${data?.enemyId ?? 'unknown'}:${data?.wave ?? 'w0'}`,
      enemyType: (
        data?.enemyType ||
        data?.enemy?.type ||
        'hunter'
      ).toLowerCase(),
    };
  }

  _normalizeMineExplosionOptions(data = {}) {
    const radius = Number(data?.radius);
    const damage = Number(data?.damage);
    const normalizedRadius = Number.isFinite(radius) ? radius : 120;
    const normalizedDamage = Number.isFinite(damage) ? damage : 40;

    const intensityBase = normalizedRadius / 160 + normalizedDamage / 140;
    const intensity = Math.min(1.5, Math.max(0.5, intensityBase));
    const duration = 0.42 + Math.min(0.16, intensity * 0.12);

    return {
      type: 'mine',
      duration,
      startFrequency: 110 - intensity * 35,
      endFrequency: 38,
      noiseGain: 0.22 + intensity * 0.18,
      rumbleGain: 0.2 + intensity * 0.18,
      intensity,
      enemyType: (data?.enemyType || data?.enemy?.type || 'mine').toLowerCase(),
    };
  }

  _resolveEnemySoundPriority(enemyType, data = {}) {
    const normalizedType =
      typeof enemyType === 'string' ? enemyType.toLowerCase() : '';
    const caps = {
      drone: 2,
      hunter: 3,
      mine: 3,
    };

    const cap = caps[normalizedType] ?? 2;
    let priority = 1;

    const wave = Number(data?.wave);
    if (Number.isFinite(wave) && wave > 0) {
      priority = Math.max(priority, Math.min(cap, Math.ceil(wave / 8)));
    }

    if (normalizedType === 'drone') {
      const projectileSpeed = Number(data?.projectile?.speed);
      const velocityMagnitude = Math.hypot(
        data?.velocity?.x ?? 0,
        data?.velocity?.y ?? 0
      );
      const speed = Number.isFinite(projectileSpeed)
        ? projectileSpeed
        : velocityMagnitude;
      if (Number.isFinite(speed) && speed > 360) {
        priority = Math.max(priority, 2);
      }
    } else if (normalizedType === 'hunter') {
      const burst = data?.projectile?.burst || {};
      const totalShots = Math.max(1, Math.floor(burst.total ?? 1));
      priority = Math.max(priority, Math.min(cap, totalShots));
    } else if (normalizedType === 'mine') {
      priority = cap;
    }

    const explicitPriority = Number(data?.priority);
    if (Number.isFinite(explicitPriority)) {
      priority = Math.max(priority, explicitPriority);
    }

    return Math.max(0, Math.min(cap, Math.round(priority)));
  }

  _scheduleBatchedSound(soundType, params = [], options = {}) {
    if (!this.batcher) {
      return false;
    }

    return this.batcher.scheduleSound(soundType, params, options);
  }

  // ===========================================================================
  // Public SFX synthesis (player-facing). Player-caused sounds route into the
  // PROTECTED bus (never duck); enemy/world sounds route into the AMBIENT bus.
  // ===========================================================================

  playLaserShot(options = {}) {
    this._trackPerformance('playLaserShot');

    const params = this.normalizeLaserShotOptions(options);

    if (
      this._scheduleBatchedSound(
        'playLaserShot',
        [Math.round(params.pitchMultiplier * 1000), params.lockCount],
        { allowOverlap: true, priority: 1 }
      )
    ) {
      return;
    }

    this._playLaserShotDirect(params);
  }

  playDroneFire(data = {}) {
    this._trackPerformance('playDroneFire');

    const params = this._normalizeDroneFireOptions(data);
    const priority = this._resolveEnemySoundPriority(params.enemyType, data);

    if (
      this._scheduleBatchedSound('playDroneFire', params, {
        allowOverlap: true,
        priority,
      })
    ) {
      return;
    }

    this._playDroneFireDirect(params);
  }

  playHunterBurst(data = {}) {
    this._trackPerformance('playHunterBurst');

    const params = this._normalizeHunterBurstOptions(data);
    if (!params) {
      return;
    }

    const priority = this._resolveEnemySoundPriority(params.enemyType, data);

    if (
      this._scheduleBatchedSound('playHunterBurst', params, {
        allowOverlap: true,
        priority,
      })
    ) {
      return;
    }

    this._playHunterBurstDirect(params);
  }

  playMineExplosion(data = {}) {
    this._trackPerformance('playMineExplosion');

    const params = this._normalizeMineExplosionOptions(data);
    const priority = this._resolveEnemySoundPriority(params.enemyType, data);

    if (
      this._scheduleBatchedSound('playMineExplosion', params, {
        allowOverlap: false,
        priority,
      })
    ) {
      return;
    }

    this._playMineExplosionDirect(params);
  }

  playTargetLock(data = {}) {
    this._trackPerformance('playTargetLock');

    const lockCount = Math.max(1, Math.floor(data.lockCount || 1));

    if (
      this._scheduleBatchedSound('playTargetLock', [lockCount], {
        allowOverlap: false,
        priority: 2,
      })
    ) {
      return;
    }

    this._playTargetLockDirect({ lockCount });
  }

  playAsteroidBreak(size) {
    this._trackPerformance('playAsteroidBreak');

    if (
      this._scheduleBatchedSound('playAsteroidBreak', [size], {
        allowOverlap: false,
        priority: 2,
      })
    ) {
      return;
    }

    this._playAsteroidBreakDirect(size);
  }

  playBigExplosion() {
    this._trackPerformance('playBigExplosion');

    this._safePlay(() => {
      // [NEO-ARCADE AUDIO] Cinematic Explosion
      // Layer 1: Sub-Bass Sine (The "Thud")
      const subOsc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const subGain = this.pool
        ? this.pool.getGain()
        : this.context.createGain();
      subOsc.connect(subGain);

      // Layer 2: Mid-Range Punch (The "Crack")
      const midOsc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const midGain = this.pool
        ? this.pool.getGain()
        : this.context.createGain();
      midOsc.connect(midGain);

      // Layer 3: Filtered Noise (The "Debris")
      // Use proper LPF on noise to avoid cheap "hiss"
      const noiseFilter = this.pool
        ? this.pool.getFilter()
        : this.context.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.value = 1200; // Muffled debris

      const destination = this.getAmbientDestination();
      if (destination) {
        subGain.connect(destination);
        midGain.connect(destination);
        noiseFilter.connect(destination); // Noise -> Filter -> Dest
      }

      // Use cached noise buffer if available
      let noiseBuffer;
      if (this.cache) {
        noiseBuffer = this.cache.getNoiseBuffer(0.8, true, 'exponential', {
          family: 'explosion',
          random: this.randomScopes.bufferFamilies.explosion,
        });
      } else {
        // Fallback
        const bufferSize = this.context.sampleRate * 0.8;
        noiseBuffer = this.context.createBuffer(
          1,
          bufferSize,
          this.context.sampleRate
        );
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }
      }

      const noise = this.pool
        ? this.pool.getBufferSource()
        : this.context.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = this.pool
        ? this.pool.getGain()
        : this.context.createGain();

      noise.connect(noiseGain);
      noiseGain.connect(noiseFilter); // Route noise through filter

      const now = this.context.currentTime;

      // 1. SUB-BASS (Physical Impact) - Tuned for audibility
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(120, now); // Higher start (was 80)
      subOsc.frequency.exponentialRampToValueAtTime(30, now + 0.6); // (was 10)
      subGain.gain.setValueAtTime(1.0, now); // Max volume
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      // 2. MID-RANGE (Texture) - Tuned for punch
      midOsc.type = 'triangle';
      midOsc.frequency.setValueAtTime(250, now); // (was 200)
      midOsc.frequency.exponentialRampToValueAtTime(60, now + 0.3);
      midGain.gain.setValueAtTime(0.4, now); // (was 0.3)
      midGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      // 3. NOISE (Explosion body)
      noiseGain.gain.setValueAtTime(0.6, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      // Sweep filter down slightly
      noiseFilter.frequency.setValueAtTime(1500, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(200, now + 0.7);

      subOsc.start(now);
      subOsc.stop(now + 0.61);

      midOsc.start(now);
      midOsc.stop(now + 0.31);

      noise.start(now);
      noise.stop(now + 0.81);

      // Return nodes to pool
      if (this.pool) {
        setTimeout(() => {
          this.pool.returnGain(subGain);
          this.pool.returnGain(midGain);
          this.pool.returnGain(noiseGain);
          this.pool.returnFilter(noiseFilter); // If we implemented returnFilter
        }, 900);
      }
    });
  }

  playXPCollect() {
    this._trackPerformance('playXPCollect');

    if (
      this._scheduleBatchedSound('playXPCollect', [], {
        allowOverlap: true,
        priority: 1,
      })
    ) {
      return;
    }

    this._playXPCollectDirect();
  }

  // ===========================================================================
  // Direct synthesis (the port + batcher flush paths target these). Relocated
  // verbatim; only the routing call changes (connectGainNode → ambient/protected,
  // getEffectsDestination → getAmbientDestination).
  // ===========================================================================

  _playLaserShotDirect(params = {}) {
    this._safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      // Player shot — protected branch (player feedback never ducks; D-14).
      this._connectProtected(gain);

      const pitchMultiplier = Number.isFinite(params.pitchMultiplier)
        ? Math.max(0.6, Math.min(1.6, params.pitchMultiplier))
        : 1;
      const tailGain = Number.isFinite(params.tailGain)
        ? Math.min(0.22, Math.max(0.08, params.tailGain))
        : 0.12;

      const startFreq = Math.min(1150, 800 * pitchMultiplier);
      const endFreq = Math.max(110, 150 * Math.max(0.7, pitchMultiplier * 0.9));

      osc.frequency.setValueAtTime(startFreq, this.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        endFreq,
        this.context.currentTime + 0.08
      );

      gain.gain.setValueAtTime(tailGain, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.context.currentTime + 0.08
      );

      osc.start();
      osc.stop(this.context.currentTime + 0.08);

      if (this.pool) {
        setTimeout(() => {
          this.pool.returnGain(gain);
        }, 90);
      }
    });
  }

  _playDroneFireDirect(params = {}) {
    this._safePlay(() => {
      if (!this.context) {
        return;
      }

      const voices = Math.max(
        1,
        Math.floor(params.count ?? params.concurrency ?? 1)
      );
      const intensity = Number.isFinite(params.intensity)
        ? params.intensity
        : 0.7;
      const baseGain = Number.isFinite(params.gain) ? params.gain : 0.12;
      const totalGain = Math.min(0.22, baseGain * (1 + (voices - 1) * 0.35));
      const gainPerVoice = Math.max(0.035, totalGain / voices);
      const detune = Number.isFinite(params.detune) ? params.detune : 0;
      const duration = Math.max(0.06, Number(params.duration) || 0.1);
      const startFrequency = Math.max(520, Number(params.frequency) || 680);
      const now = this.context.currentTime;

      for (let i = 0; i < voices; i += 1) {
        const osc = this.pool
          ? this.pool.getOscillator()
          : this.context.createOscillator();
        const gain = this.pool
          ? this.pool.getGain()
          : this.context.createGain();

        osc.connect(gain);
        this._connectAmbient(gain);

        const spreadFactor = voices > 1 ? i / (voices - 1) - 0.5 : 0;
        const pitchOffset = detune * spreadFactor;
        const voiceStart = now + (voices > 2 ? i * 0.004 : 0);
        const voiceFrequency = Math.max(520, startFrequency + pitchOffset);
        const targetFrequency = Math.max(320, voiceFrequency * 0.55);

        osc.type = 'square';
        osc.frequency.setValueAtTime(voiceFrequency, voiceStart);
        osc.frequency.exponentialRampToValueAtTime(
          targetFrequency,
          voiceStart + duration
        );

        const accent = 1 + Math.min(0.35, intensity * 0.25) * spreadFactor;
        gain.gain.setValueAtTime(gainPerVoice * (1 + accent * 0.2), voiceStart);
        gain.gain.exponentialRampToValueAtTime(0.001, voiceStart + duration);

        osc.start(voiceStart);
        osc.stop(voiceStart + duration);

        if (this.pool) {
          setTimeout(
            () => {
              this.pool.returnGain(gain);
            },
            (voiceStart + duration - now) * 1000 + 20
          );
        }
      }
    });
  }

  _playHunterBurstDirect(params = {}) {
    this._safePlay(() => {
      if (!this.context) {
        return;
      }

      const shotCount = Math.max(1, Math.floor(params.shotCount ?? 3));
      const spacing = Math.max(0.02, Number(params.spacing) || 0.05);
      const duration = Math.max(0.06, Number(params.duration) || 0.09);
      const concurrency = Math.max(1, Math.floor(params.concurrency ?? 1));
      const baseFrequency = Math.min(
        900,
        Math.max(700, Number(params.baseFrequency) || 760)
      );
      const frequencyJitter = Math.max(0, Number(params.frequencyJitter) || 60);
      const intensity = Number.isFinite(params.intensity)
        ? params.intensity
        : 0.8;
      const baseGain = Number.isFinite(params.gain) ? params.gain : 0.15;
      const totalGain = Math.min(0.32, baseGain * concurrency);
      const perShotGain = Math.max(0.04, totalGain / shotCount);
      const now = this.context.currentTime;

      for (let shot = 0; shot < shotCount; shot += 1) {
        const osc = this.pool
          ? this.pool.getOscillator()
          : this.context.createOscillator();
        const gain = this.pool
          ? this.pool.getGain()
          : this.context.createGain();

        osc.connect(gain);
        this._connectAmbient(gain);

        const shotStart = now + shot * spacing;
        const position = shotCount > 1 ? shot / (shotCount - 1) : 0.5;
        const freqOffset = (position - 0.5) * frequencyJitter;
        const shotFrequency = Math.min(
          900,
          Math.max(700, baseFrequency + freqOffset)
        );
        const targetFrequency = Math.max(360, shotFrequency * 0.6);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(shotFrequency, shotStart);
        osc.frequency.exponentialRampToValueAtTime(
          targetFrequency,
          shotStart + duration
        );

        const accent = 1 + Math.min(0.4, intensity * 0.3) * (1 - position);
        gain.gain.setValueAtTime(perShotGain * accent, shotStart);
        gain.gain.exponentialRampToValueAtTime(0.001, shotStart + duration);

        osc.start(shotStart);
        osc.stop(shotStart + duration);

        if (this.pool) {
          setTimeout(
            () => {
              this.pool.returnGain(gain);
            },
            (shotStart + duration - now) * 1000 + 20
          );
        }
      }
    });
  }

  _playMineExplosionDirect(params = {}) {
    this._safePlay(() => {
      if (!this.context) {
        return;
      }

      const duration = Math.max(0.32, Number(params.duration) || 0.5);
      const clusterSize = Math.max(1, Math.floor(params.clusterSize ?? 1));
      const intensity = Number.isFinite(params.intensity)
        ? params.intensity
        : 0.9;
      const startFrequency = Math.max(40, Number(params.startFrequency) || 90);
      const endFrequency = Math.max(22, Number(params.endFrequency) || 36);
      const noiseGainValue = Math.min(
        0.55,
        (Number(params.noiseGain) || 0.25) * (1 + (clusterSize - 1) * 0.18)
      );
      const rumbleGainValue = Math.min(
        0.36,
        (Number(params.rumbleGain) || 0.24) * (1 + (clusterSize - 1) * 0.22)
      );

      const now = this.context.currentTime;
      const destination = this.getAmbientDestination();
      if (!destination) {
        return;
      }

      const rumbleOsc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const rumbleGain = this.pool
        ? this.pool.getGain()
        : this.context.createGain();

      rumbleOsc.type = 'sine';
      rumbleOsc.frequency.setValueAtTime(startFrequency, now);
      rumbleOsc.frequency.exponentialRampToValueAtTime(
        endFrequency,
        now + duration
      );
      rumbleOsc.connect(rumbleGain);
      rumbleGain.connect(destination);

      rumbleGain.gain.setValueAtTime(rumbleGainValue, now);
      rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      let noiseBuffer = null;
      if (this.cache && typeof this.cache.getNoiseBuffer === 'function') {
        noiseBuffer = this.cache.getNoiseBuffer(duration, true, 'exponential', {
          family: 'explosion',
          random:
            this.randomScopes?.bufferFamilies?.explosion ||
            this.randomScopes?.families?.explosion ||
            this.randomScopes?.base ||
            null,
        });
      }

      if (!noiseBuffer) {
        const bufferSize = Math.max(
          1,
          Math.floor(this.context.sampleRate * duration)
        );
        noiseBuffer = this.context.createBuffer(
          1,
          bufferSize,
          this.context.sampleRate
        );
        const output = noiseBuffer.getChannelData(0);
        const rng = this._resolveRandom(
          this.randomScopes?.bufferFamilies?.explosion,
          this.randomScopes?.families?.explosion,
          this.randomScopes?.base
        );
        for (let i = 0; i < bufferSize; i += 1) {
          const sample =
            typeof rng.range === 'function'
              ? rng.range(-1, 1)
              : rng.float() * 2 - 1;
          output[i] = sample;
        }
      }

      const noiseSource = this.pool
        ? this.pool.getBufferSource()
        : this.context.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = false;

      const noiseFilter = this.context.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(260 + intensity * 90, now);

      const noiseGain = this.pool
        ? this.pool.getGain()
        : this.context.createGain();

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(destination);

      noiseGain.gain.setValueAtTime(noiseGainValue, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.85);

      rumbleOsc.start(now);
      rumbleOsc.stop(now + duration);

      noiseSource.start(now);
      noiseSource.stop(now + duration * 0.85);

      if (this.pool) {
        setTimeout(
          () => {
            this.pool.returnGain(rumbleGain);
            this.pool.returnGain(noiseGain);
          },
          duration * 1000 + 40
        );
      }
    });
  }

  _playTargetLockDirect(params = {}) {
    this._safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      // Player targeting feedback — protected branch.
      this._connectProtected(gain);

      const lockCount = Math.max(1, Math.floor(params.lockCount || 1));
      const baseFrequency = 720;
      const frequency = Math.min(
        1200,
        baseFrequency * (1 + (lockCount - 1) * 0.12)
      );
      const peakGain = 0.08 + Math.min(0.05, 0.018 * (lockCount - 1));
      const now = this.context.currentTime;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, now);
      osc.frequency.linearRampToValueAtTime(frequency * 1.12, now + 0.1);

      gain.gain.setValueAtTime(peakGain, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.start(now);
      osc.stop(now + 0.14);

      if (this.pool) {
        setTimeout(() => {
          this.pool.returnGain(gain);
        }, 150);
      }
    });
  }

  _playAsteroidBreakDirect(size) {
    this._safePlay(() => {
      // [NEO-ARCADE AUDIO] Crunchy Explosion
      const baseFreq = size === 'large' ? 100 : size === 'medium' ? 140 : 200; // Higher freq for clarity
      const duration = size === 'large' ? 0.4 : size === 'medium' ? 0.3 : 0.2;

      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      // Filter for weight
      const filter = this.pool
        ? this.pool.getFilter()
        : this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, this.context.currentTime); // Open filter slightly
      filter.frequency.exponentialRampToValueAtTime(
        100,
        this.context.currentTime + duration
      );

      osc.connect(gain);
      gain.connect(filter);

      const destination = this.getAmbientDestination();
      if (destination) {
        filter.connect(destination);
      } else {
        // Fallback connection if getAmbientDestination fails
        this._connectAmbient(filter);
      }

      // Square wave for 8-bit crunch
      osc.type = 'square';
      osc.frequency.setValueAtTime(baseFreq, this.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        baseFreq * 0.2, // Deep drop
        this.context.currentTime + duration
      );

      // Louder initial impact
      gain.gain.setValueAtTime(0.3, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.context.currentTime + duration
      );

      osc.start();
      osc.stop(this.context.currentTime + duration);

      if (this.pool) {
        setTimeout(
          () => {
            this.pool.returnGain(gain);
            this.pool.returnFilter(filter); // Assuming returnFilter exists or ignoring if leak is acceptable for now
          },
          duration * 1000 + 50
        );
      }
    });
  }

  _playXPCollectDirect() {
    this._safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      this._connectAmbient(gain);

      osc.frequency.setValueAtTime(600, this.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        1200,
        this.context.currentTime + 0.12
      );

      gain.gain.setValueAtTime(0.08, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.context.currentTime + 0.12
      );

      osc.start();
      osc.stop(this.context.currentTime + 0.12);

      if (this.pool) {
        setTimeout(() => {
          this.pool.returnGain(gain);
        }, 130);
      }
    });
  }

  _executeBatchedSound(soundType, params = []) {
    switch (soundType) {
      case 'playLaserShot':
        this._playLaserShotDirect();
        break;
      case 'playTargetLock':
        this._playTargetLockDirect({ lockCount: params?.[0] });
        break;
      case 'playAsteroidBreak':
        this._playAsteroidBreakDirect(params?.[0]);
        break;
      case 'playXPCollect':
        this._playXPCollectDirect();
        break;
      case 'playDroneFire': {
        const options = Array.isArray(params) ? params[0] : params;
        this._playDroneFireDirect(options || {});
        break;
      }
      case 'playHunterBurst': {
        const options = Array.isArray(params) ? params[0] : params;
        if (options) {
          this._playHunterBurstDirect(options);
        }
        break;
      }
      case 'playMineExplosion': {
        const options = Array.isArray(params) ? params[0] : params;
        this._playMineExplosionDirect(options || {});
        break;
      }
      default:
        console.warn(
          `[SFXBus] No direct handler registered for "${soundType}"`
        );
        break;
    }
  }

  // ===========================================================================
  // Player-landed hits + damage taken (player-caused → protected bus).
  // ===========================================================================

  playBulletHit(killed = false) {
    this._safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      // Player-landed hit — protected branch (player feedback never ducks).
      this._connectProtected(gain);

      osc.type = 'square';

      if (killed) {
        // Kill confirm: Lower pitch, longer, more satisfying
        osc.frequency.setValueAtTime(220, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(
          90,
          this.context.currentTime + 0.15
        );

        gain.gain.setValueAtTime(0.15, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          this.context.currentTime + 0.15
        );

        osc.start();
        osc.stop(this.context.currentTime + 0.15);
      } else {
        // Hit confirm: Higher pitch, quick, subtle
        osc.frequency.setValueAtTime(440, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(
          220,
          this.context.currentTime + 0.06
        );

        gain.gain.setValueAtTime(0.08, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          this.context.currentTime + 0.06
        );

        osc.start();
        osc.stop(this.context.currentTime + 0.06);
      }
    });
  }

  playShipHit() {
    this._safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      // Player damage taken — protected branch (player feedback never ducks).
      this._connectProtected(gain);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, this.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        40,
        this.context.currentTime + 0.3
      );

      gain.gain.setValueAtTime(0.2, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.context.currentTime + 0.3
      );

      osc.start();
      osc.stop(this.context.currentTime + 0.3);
    });
  }

  // ===========================================================================
  // Shield SFX (player feedback → protected bus).
  // ===========================================================================

  playShieldActivate() {
    this._safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      this._connectProtected(gain);

      const now = this.context.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(540, now + 0.18);

      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.start(now);
      osc.stop(now + 0.18);

      if (this.pool) {
        setTimeout(() => {
          this.pool.returnGain(gain);
        }, 200);
      }
    });
  }

  playShieldImpact() {
    this._safePlay(() => {
      // [NEO-ARCADE AUDIO] Punchy Blaster Shot
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      this._connectProtected(gain);

      const now = this.context.currentTime;
      const params = {}; // Assuming params might be passed or defined elsewhere, defaulting to empty for now
      // const pitchMult = 1.0; // Fixed base, modulated by params

      // Square wave for retro 'pixel' crunch
      osc.type = 'square';

      // Rapid pitch drop (Blaster effect)
      // Start high (880Hz) and drop quickly to low (110Hz)
      const startFreq = 880 * (params.pitchMultiplier || 1);
      const endFreq = 110;

      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.15);

      // Tight amplitude envelope
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.start(now);
      osc.stop(now + 0.16);

      // Return to pool using timeout
      if (this.pool) {
        setTimeout(() => {
          this.pool.returnGain(gain);
        }, 180);
      }
    });
  }

  playBossShieldDeflect() {
    this._safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      this._connectProtected(gain);

      const now = this.context.currentTime;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.08);

      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.start(now);
      osc.stop(now + 0.1);

      if (this.pool) {
        setTimeout(() => {
          this.pool.returnGain(gain);
        }, 120);
      }
    });
  }

  playShieldBreak() {
    this._safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      this._connectProtected(gain);

      const now = this.context.currentTime;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.25);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.start(now);
      osc.stop(now + 0.25);

      if (this.pool) {
        setTimeout(() => {
          this.pool.returnGain(gain);
        }, 300);
      }
    });
  }

  playShieldRecharged() {
    this._safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      this._connectProtected(gain);

      const now = this.context.currentTime;
      osc.type = 'square';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.setValueAtTime(540, now + 0.06);
      osc.frequency.setValueAtTime(660, now + 0.12);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.start(now);
      osc.stop(now + 0.18);

      if (this.pool) {
        setTimeout(() => {
          this.pool.returnGain(gain);
        }, 220);
      }
    });
  }

  playShieldFail() {
    this._safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      this._connectProtected(gain);

      const now = this.context.currentTime;
      osc.type = 'square';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.12);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.start(now);
      osc.stop(now + 0.15);

      if (this.pool) {
        setTimeout(() => {
          this.pool.returnGain(gain);
        }, 200);
      }
    });
  }

  playShieldShockwave() {
    this._trackPerformance('playShieldShockwave');

    this._safePlay(() => {
      // Use cached noise buffer if available
      let noiseBuffer;
      if (this.cache) {
        noiseBuffer = this.cache.getNoiseBuffer(0.4, true, 'linear', {
          family: 'shield',
          random: this.randomScopes.bufferFamilies.shield,
        });
      } else {
        // Fallback to creating buffer
        noiseBuffer = this.context.createBuffer(
          1,
          this.context.sampleRate * 0.4,
          this.context.sampleRate
        );
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseBuffer.length; i++) {
          const bufferRandom =
            this.randomScopes.bufferFamilies.shield ||
            this.randomScopes.families.shield ||
            this.randomScopes.base ||
            null;
          const rng = this._resolveRandom(
            bufferRandom,
            this.randomScopes.base
          );
          const noiseSample =
            typeof rng.range === 'function'
              ? rng.range(-1, 1)
              : rng.float() * 2 - 1;
          output[i] = noiseSample * (1 - i / noiseBuffer.length);
        }
      }

      const noise = this.pool
        ? this.pool.getBufferSource()
        : this.context.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = this.pool
        ? this.pool.getGain()
        : this.context.createGain();

      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const oscGain = this.pool
        ? this.pool.getGain()
        : this.context.createGain();

      noise.connect(noiseGain);
      this._connectProtected(noiseGain);

      osc.connect(oscGain);
      this._connectProtected(oscGain);

      const now = this.context.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.4);

      oscGain.gain.setValueAtTime(0.18, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      noiseGain.gain.setValueAtTime(0.4, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      noise.start(now);
      noise.stop(now + 0.35);

      osc.start(now);
      osc.stop(now + 0.4);

      // Return gains to pool after use if using pool
      if (this.pool) {
        setTimeout(() => {
          this.pool.returnGain(noiseGain);
          this.pool.returnGain(oscGain);
        }, 410);
      }
    });
  }

  // ===========================================================================
  // Pickups / jackpots / fanfares (world/UI ambience → ambient bus).
  // ===========================================================================

  playLevelUp() {
    this._safePlay(() => {
      const frequencies = [440, 554, 659, 880, 1108];
      frequencies.forEach((freq, index) => {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();

        osc.connect(gain);
        this._connectAmbient(gain);

        const startTime = this.context.currentTime + index * 0.06;
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.1, startTime + 0.04);
        gain.gain.linearRampToValueAtTime(0, startTime + 0.18);

        osc.start(startTime);
        osc.stop(startTime + 0.18);
      });
    });
  }

  playOrbFusion(toClass) {
    // Beautiful ascending fusion sound based on tier
    this._safePlay(() => {
      // Map tier classes to base frequencies
      const tierFrequencies = {
        'xp-green': 523, // C5 (tier 2)
        'xp-yellow': 659, // E5 (tier 3)
        'xp-purple': 784, // G5 (tier 4)
        'xp-red': 988, // B5 (tier 5)
        'xp-crystal': 1175, // D6 (tier 6)
      };

      const baseFreq = tierFrequencies[toClass] || 440;

      // Sparkle effect: quick ascending notes
      const sparkleNotes = [baseFreq * 0.75, baseFreq, baseFreq * 1.25];
      sparkleNotes.forEach((freq, index) => {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();

        osc.connect(gain);
        this._connectAmbient(gain);

        osc.type = 'sine';
        const startTime = this.context.currentTime + index * 0.04;
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.08, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

        osc.start(startTime);
        osc.stop(startTime + 0.2);
      });

      // Bell-like "ding" for completion
      const bell = this.context.createOscillator();
      const bellGain = this.context.createGain();
      bell.connect(bellGain);
      this._connectAmbient(bellGain);

      bell.type = 'sine';
      const bellTime = this.context.currentTime + 0.12;
      bell.frequency.setValueAtTime(baseFreq * 2, bellTime);

      bellGain.gain.setValueAtTime(0, bellTime);
      bellGain.gain.linearRampToValueAtTime(0.12, bellTime + 0.01);
      bellGain.gain.exponentialRampToValueAtTime(0.001, bellTime + 0.4);

      bell.start(bellTime);
      bell.stop(bellTime + 0.4);
    });
  }

  playGoldSpawn() {
    // Magical "bling!" sound when Gold asteroid spawns
    this._safePlay(() => {
      const frequencies = [880, 1108, 1318, 1760]; // A5-A6 arpeggio
      frequencies.forEach((freq, index) => {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();

        osc.connect(gain);
        this._connectAmbient(gain);

        osc.type = 'triangle';
        const startTime = this.context.currentTime + index * 0.05;
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.15, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

        osc.start(startTime);
        osc.stop(startTime + 0.3);
      });
    });
  }

  playGoldJackpot() {
    // Epic jackpot sound when Gold asteroid is destroyed
    this._safePlay(() => {
      // First "ka" (percussive)
      const noise = this.context.createOscillator();
      const noiseGain = this.context.createGain();
      noise.connect(noiseGain);
      this._connectAmbient(noiseGain);

      noise.type = 'square';
      noise.frequency.setValueAtTime(100, this.context.currentTime);

      noiseGain.gain.setValueAtTime(0.2, this.context.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(
        0.001,
        this.context.currentTime + 0.05
      );

      noise.start();
      noise.stop(this.context.currentTime + 0.05);

      // Then "ching!" (bright bell)
      const frequencies = [1318, 1760, 2217]; // E6-A6-C#7
      frequencies.forEach((freq, index) => {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();

        osc.connect(gain);
        this._connectAmbient(gain);

        osc.type = 'sine';
        const startTime = this.context.currentTime + 0.05 + index * 0.02;
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.18, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);

        osc.start(startTime);
        osc.stop(startTime + 0.5);
      });
    });
  }

  // ===========================================================================
  // UI SFX (menu/HUD feedback → ambient bus; identity preserved).
  // ===========================================================================

  playUpgradeSelect(rarity = 'common') {
    const frequencies = {
      common: 440, // A4
      uncommon: 554, // C#5
      rare: 659, // E5
      epic: 784, // G5
    };

    const freq = frequencies[rarity] || 440;

    this._safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();
      const filter = this.context.createBiquadFilter();

      // Chain: Osc -> Gain -> Filter -> Out
      osc.connect(gain);
      gain.connect(filter);
      this._connectAmbient(filter);

      const now = this.context.currentTime;

      // Filter for smoothness
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(2000, now + 0.15); // Open up

      osc.type = 'triangle'; // Richer than sine
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.2);

      // Envelope
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.start(now);
      osc.stop(now + 0.2);

      if (this.pool) {
        setTimeout(() => {
          this.pool.returnGain(gain);
          // Auto cleanup for osc
        }, 250);
      }
    });
  }

  playPauseOpen() {
    this._safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();
      const filter = this.context.createBiquadFilter();

      osc.connect(gain);
      gain.connect(filter);
      this._connectAmbient(filter);

      const now = this.context.currentTime;

      // Lowpass to make it heavy but soft
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, now);
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.15);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, now); // Lower start
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.15); // Drop down

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.start(now);
      osc.stop(now + 0.15);

      if (this.pool) {
        setTimeout(() => {
          this.pool.returnGain(gain);
        }, 200);
      }
    });
  }

  playPauseClose() {
    this._safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      this._connectAmbient(gain);

      const now = this.context.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(450, now + 0.12);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.start(now);
      osc.stop(now + 0.12);

      if (this.pool) {
        setTimeout(() => {
          this.pool.returnGain(gain);
        }, 150);
      }
    });
  }

  playMenuTransition() {
    this._safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      const filter = this.context.createBiquadFilter();

      // Chain: Osc -> Gain -> Filter -> Out
      osc.connect(gain);
      gain.connect(filter);
      this._connectAmbient(filter);

      const now = this.context.currentTime;

      // Filter sweep for "whoosh" effect
      filter.type = 'lowpass';
      filter.Q.value = 1;
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.exponentialRampToValueAtTime(2000, now + 0.15);

      // Triangle wave for body
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.linearRampToValueAtTime(50, now + 0.2); // Pitch drop

      // Smooth volume envelope
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.05); // Soft attack
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.start(now);
      osc.stop(now + 0.25);
    });
  }

  playLowHealthWarning() {
    this._safePlay(() => {
      const now = this.context.currentTime;

      // Two-tone alarm pattern - Triangle waves for less harshness
      for (let i = 0; i < 2; i++) {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        const filter = this.context.createBiquadFilter();

        osc.connect(gain);
        gain.connect(filter);
        // Player danger warning — protected branch (must cut through, never duck).
        this._connectProtected(filter);

        const offset = i * 0.15; // Stagger the beeps
        const freq = i === 0 ? 880 : 660; // High-low pattern

        osc.type = 'triangle'; // Softer than square
        osc.frequency.setValueAtTime(freq, now + offset);

        // Lowpass to dampen
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, now + offset);

        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(0.12, now + offset + 0.02); // Slightly lower volume
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);

        osc.start(now + offset);
        osc.stop(now + offset + 0.12);
      }
    });
  }

  playUIHover() {
    // No tracking needed for such freq event
    this._safePlay(() => {
      const now = this.context.currentTime;

      // Use a single oscillator for a clean "thip"
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      // Filter to remove sharp edges
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1200; // Cut off harsh high sheen

      osc.connect(gain);
      gain.connect(filter);

      const destination = this.getAmbientDestination();
      if (destination) {
        filter.connect(destination);
      } else {
        this._connectAmbient(filter);
      }

      // Sine wave - naturally soft
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.03); // Quick pitch drop

      // Very low volume and short duration
      gain.gain.setValueAtTime(0.1, now); // Increased from 0.015 to 0.1 for visibility
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      osc.start(now);
      osc.stop(now + 0.04);

      // Cleanup
      if (this.pool) {
        setTimeout(() => {
          this.pool.returnGain(gain);
          // Oscillators are disposable and automatically cleaned up by AudioPool hook
        }, 50);
      }
    });
  }

  playUISelect() {
    this._trackPerformance('playUISelect');
    this._safePlay(() => {
      const now = this.context.currentTime;

      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      // Filter for glass texture
      const filter = this.context.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 400;

      osc.connect(gain);
      gain.connect(filter);

      const destination = this.getAmbientDestination();
      if (destination) {
        filter.connect(destination);
      } else {
        this._connectAmbient(filter);
      }

      // Sine wave for clean tone
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05); // Upward chirp

      // Quick snappy envelope
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.start(now);
      osc.stop(now + 0.12);

      if (this.pool) {
        setTimeout(() => {
          this.pool.returnGain(gain);
          // Oscillators are disposable
        }, 150);
      }
    });
  }

  playUIStartGame() {
    this._trackPerformance('playUIStartGame');
    this._safePlay(() => {
      const randomScope = this.randomScopes.families.uiStartGame;
      if (!randomScope) {
        console.warn(
          '[SFXBus] playUIStartGame: uiStartGame random scope not available'
        );
        return;
      }

      const now = this.context.currentTime;
      const variation = Math.floor(randomScope.range(0, 2));
      const duration = randomScope.range(0.3, 0.45);

      // === PING COMPONENT ===
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const oscGain = this.pool
        ? this.pool.getGain()
        : this.context.createGain();

      osc.type = variation === 0 ? 'sine' : 'triangle';

      const baseFreq = randomScope.range(1000, 1500);
      const pitchRise = Math.pow(2, randomScope.range(2, 3) / 12); // 2-3 semitones
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(
        baseFreq * pitchRise,
        now + duration * 0.6
      );

      osc.connect(oscGain);

      // === WHOOSH COMPONENT ===
      const noiseBuffer = this.cache.getNoiseBuffer(
        duration * 0.6,
        0.05,
        'white',
        { family: 'uiStartGame', random: randomScope }
      );
      const noise = this.pool
        ? this.pool.getBufferSource()
        : this.context.createBufferSource();
      const noiseGain = this.pool
        ? this.pool.getGain()
        : this.context.createGain();
      noise.buffer = noiseBuffer;

      noise.connect(noiseGain);

      // Band-pass filter for whoosh (1-6kHz)
      const bpf = this.context.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.setValueAtTime(3500, now); // Center of 1-6kHz range
      bpf.Q.setValueAtTime(1.0, now);

      noiseGain.connect(bpf);

      // === DELAY-BASED REVERB (simplified approach) ===
      const delay = this.context.createDelay();
      const delayGain = this.pool
        ? this.pool.getGain()
        : this.context.createGain();
      const feedbackGain = this.pool
        ? this.pool.getGain()
        : this.context.createGain();

      delay.delayTime.setValueAtTime(0.08, now); // 80ms delay
      feedbackGain.gain.setValueAtTime(0.3, now); // 30% feedback for tail
      delayGain.gain.setValueAtTime(0.25, now); // -12dB wet signal

      // Delay feedback loop
      delay.connect(feedbackGain);
      feedbackGain.connect(delay); // Create feedback loop
      delay.connect(delayGain);
      this._connectAmbient(delayGain);

      // Send both ping and whoosh to delay
      oscGain.connect(delay);
      bpf.connect(delay);

      // === MASTER GAIN ===
      const masterGain = this.pool
        ? this.pool.getGain()
        : this.context.createGain();
      masterGain.gain.setValueAtTime(0.5, now); // -6dB peak

      // Connect dry signals to master
      oscGain.connect(masterGain);
      bpf.connect(masterGain);
      this._connectAmbient(masterGain);

      // === ENVELOPES ===

      // Ping envelope
      oscGain.gain.setValueAtTime(0, now);
      oscGain.gain.linearRampToValueAtTime(0.5, now + 0.01); // attack
      oscGain.gain.setValueAtTime(0.5, now + duration * 0.5); // sustain
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration); // decay

      // Whoosh envelope (starts later, at 200ms offset)
      noiseGain.gain.setValueAtTime(0, now + 0.2);
      noiseGain.gain.linearRampToValueAtTime(0.2, now + 0.22); // quick attack
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      // === START/STOP ===
      osc.start(now);
      osc.stop(now + duration);
      noise.start(now + 0.2); // Whoosh starts at 200ms
      noise.stop(now + duration);

      // === CLEANUP (longer tail for delay reverb) ===
      setTimeout(
        () => {
          try {
            // CRITICAL: Break feedback loop first to prevent runaway oscillation
            feedbackGain.disconnect();
            delay.disconnect();

            // Disconnect all other nodes
            oscGain.disconnect();
            noiseGain.disconnect();
            bpf.disconnect();
            delayGain.disconnect();
            masterGain.disconnect();

            // Return gains to pool
            if (this.pool) {
              this.pool.returnGain(oscGain);
              this.pool.returnGain(noiseGain);
              this.pool.returnGain(delayGain);
              this.pool.returnGain(feedbackGain);
              this.pool.returnGain(masterGain);
            }
          } catch (e) {
            console.warn('[SFXBus] Cleanup error in playUIStartGame:', e);
          }
        },
        duration * 1000 + 200
      );
    });
  }

  // ===========================================================================
  // Thruster loops (player propulsion → ambient bus; owns ThrusterLoopManager).
  // ===========================================================================

  /**
   * Start a thruster loop (and burst for manual thrusters).
   * @param {string} type
   * @param {number} intensity
   * @param {boolean} isAutomatic
   */
  startThrusterLoop(type, intensity, isAutomatic = false) {
    this._trackPerformance(`_startThrusterSound:${type}`);

    if (isAutomatic) {
      const randomScope = this._getThrusterRandomScope(type);
      const variation = Math.floor(
        randomScope?.range ? randomScope.range(0, 3) : Math.random() * 3
      );

      // Reduce intensity for automatic thrusters (softer spray sound)
      const autoIntensity = intensity * 0.4; // 60% reduction for subtle auto-damping

      this.thrusterLoops.startLoop(
        type,
        variation,
        autoIntensity,
        this.context,
        this.pool,
        this.cache,
        randomScope,
        (node) => this._connectAmbient(node)
      );
      return null;
    }

    // Manual thrusters: play burst then loop after a short delay.
    this._playThrusterStartBurst(type);

    return setTimeout(
      () => {
        if (!this.context) return;

        const randomScope = this._getThrusterRandomScope(type);
        const variation = Math.floor(
          randomScope?.range ? randomScope.range(0, 3) : Math.random() * 3
        );

        this.thrusterLoops.startLoop(
          type,
          variation,
          intensity,
          this.context,
          this.pool,
          this.cache,
          randomScope,
          (node) => this._connectAmbient(node)
        );
      },
      type === 'side' ? 80 : type === 'retro' ? 140 : 160
    ); // Delay ajustado para burst mais longo
  }

  updateThrusterLoop(type, intensity) {
    this.thrusterLoops.updateLoop(type, intensity);
  }

  stopThrusterLoop(type, skipRelease = false) {
    this._trackPerformance(`_stopThrusterSound:${type}`);

    // Stop loop first
    this.thrusterLoops.stopLoop(type, this.pool);

    // Play stop release sound only for manual thrusters
    if (!skipRelease) {
      this._playThrusterStopRelease(type);
    }
  }

  isThrusterActive(type) {
    return this.thrusterLoops.isActive(type);
  }

  _playThrusterStartBurst(type) {
    this._safePlay(() => {
      const randomScope = this._getThrusterRandomScope(type);
      const now = this.context.currentTime;

      // Duration varies by thruster type
      // Ajustado para sons graves, suaves e realistas de ignição (como release)
      let duration, pitchStart, pitchEnd, gainPeak;
      if (type === 'main') {
        duration =
          0.24 + (randomScope?.range ? randomScope.range(-0.02, 0.06) : 0);
        pitchStart = 90; // MUITO mais grave (era 140)
        pitchEnd = 120; // Ramp suave e grave (era 170)
        gainPeak = 0.15; // Mais suave ainda (-16dB, era -9dB)
      } else if (type === 'retro') {
        duration =
          0.2 + (randomScope?.range ? randomScope.range(-0.02, 0.05) : 0);
        pitchStart = 100; // Muito mais grave (era 180)
        pitchEnd = 130; // Descending suave (era 150)
        gainPeak = 0.12; // Mais suave (-18dB, era -10dB)
      } else {
        // side
        duration =
          0.14 + (randomScope?.range ? randomScope.range(-0.01, 0.04) : 0);
        pitchStart =
          140 + (randomScope?.range ? randomScope.range(-10, 10) : 0); // Mais grave (era 220)
        pitchEnd = 110; // Muito mais grave (era 180)
        gainPeak = 0.1; // Mais suave (-20dB, era -12dB)
      }

      // Create oscillator - Triangle wave para suavidade (meio termo entre sine e sawtooth)
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const oscGain = this.pool
        ? this.pool.getGain()
        : this.context.createGain();

      osc.type = 'triangle'; // Triangle é mais suave que sawtooth/square mas com mais corpo que sine
      osc.frequency.setValueAtTime(pitchStart, now);
      osc.frequency.linearRampToValueAtTime(pitchEnd, now + duration);

      osc.connect(oscGain);

      // Create noise burst
      let noiseBuffer;
      const familyName =
        type === 'main'
          ? 'thrusterMain'
          : type === 'retro'
            ? 'thrusterRetro'
            : 'thrusterSide';

      if (this.cache) {
        noiseBuffer = this.cache.getNoiseBuffer(
          duration * 0.8,
          true,
          'linear',
          {
            family: familyName,
            random: randomScope,
          }
        );
      } else {
        const bufferSize = Math.floor(this.context.sampleRate * duration * 0.8);
        noiseBuffer = this.context.createBuffer(
          1,
          bufferSize,
          this.context.sampleRate
        );
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          const progress = i / bufferSize;
          output[i] =
            (randomScope?.range
              ? randomScope.range(-1, 1)
              : Math.random() * 2 - 1) *
            (1 - progress);
        }
      }

      const noise = this.pool
        ? this.pool.getBufferSource()
        : this.context.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = this.pool
        ? this.pool.getGain()
        : this.context.createGain();
      noise.connect(noiseGain);

      // Apply EQ filter chain (muito suave, grave e warm)
      const hpf = this.context.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.setValueAtTime(70, now); // Deixa passar graves (era 80)

      const peaking1 = this.context.createBiquadFilter();
      peaking1.type = 'peaking';
      peaking1.frequency.setValueAtTime(150, now); // Mais grave/warmth (era 200)
      peaking1.Q.setValueAtTime(0.6, now); // Q menor = mais suave (era 0.8)
      peaking1.gain.setValueAtTime(1.5, now); // +1.5dB bump suave (era 2)

      const peaking2 = this.context.createBiquadFilter();
      peaking2.type = 'peaking';
      peaking2.frequency.setValueAtTime(1800, now); // Bem menos harsh (era 2500)
      peaking2.Q.setValueAtTime(0.5, now); // Q menor = mais suave (era 0.7)
      peaking2.gain.setValueAtTime(0.5, now); // +0.5dB presence mínima (era 1)

      // Lowpass agressivo para remover todas as frequências altas
      const lpf = this.context.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.setValueAtTime(2800, now); // Remove muito mais altas (era 5000)
      lpf.Q.setValueAtTime(0.5, now);

      // Connect filter chain
      oscGain.connect(hpf);
      noiseGain.connect(hpf);
      hpf.connect(peaking1);
      peaking1.connect(peaking2);
      peaking2.connect(lpf);
      this._connectAmbient(lpf);

      // Envelope (attack ainda mais longo para ignição muito suave)
      const attackTime =
        type === 'side'
          ? 0.025
          : 0.08 + (randomScope?.range ? randomScope.range(0, 0.03) : 0);

      // Balance osc/noise: ainda menos noise, mais oscillator para som tonal e suave
      oscGain.gain.setValueAtTime(0, now);
      oscGain.gain.linearRampToValueAtTime(gainPeak * 0.75, now + attackTime); // 75% osc (era 70%)
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noiseGain.gain.setValueAtTime(0, now);
      noiseGain.gain.linearRampToValueAtTime(gainPeak * 0.25, now + attackTime); // 25% noise (era 30%)
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      // Start and stop
      osc.start(now);
      osc.stop(now + duration);
      noise.start(now);
      noise.stop(now + duration);

      // Return gains to pool
      if (this.pool) {
        setTimeout(
          () => {
            this.pool.returnGain(oscGain);
            this.pool.returnGain(noiseGain);
          },
          duration * 1000 + 50
        );
      }
    });
  }

  _playThrusterStopRelease(type) {
    this._safePlay(() => {
      const randomScope = this._getThrusterRandomScope(type);
      const now = this.context.currentTime;

      // Duration varies by thruster type - mais longo para fade suave
      let duration, pitchStart, pitchEnd, gainPeak;
      if (type === 'main') {
        duration = 0.2 + (randomScope?.range ? randomScope.range(0, 0.08) : 0);
        pitchStart = 110; // Muito mais grave (era 180)
        pitchEnd = 70; // Drop suave e grave (era 150)
        gainPeak = 0.12; // MUITO mais suave (era 0.707 = -3dB, agora ~-18dB)
      } else if (type === 'retro') {
        duration = 0.18 + (randomScope?.range ? randomScope.range(0, 0.06) : 0);
        pitchStart = 120;
        pitchEnd = 75;
        gainPeak = 0.1; // Muito mais suave (era 0.63, agora ~-20dB)
      } else {
        // side
        duration = 0.15 + (randomScope?.range ? randomScope.range(0, 0.04) : 0);
        pitchStart = 140;
        pitchEnd = 85;
        gainPeak = 0.08; // Muito mais suave (era 0.5, agora ~-22dB)
      }

      // Create oscillator - SINE wave para suavidade máxima
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.type = 'sine'; // Sine é muito mais suave que sawtooth/square
      osc.frequency.setValueAtTime(pitchStart, now);
      osc.frequency.exponentialRampToValueAtTime(pitchEnd, now + duration);

      osc.connect(gain);

      // Apply lowpass filter agressivo - remove todas as frequências altas
      const lpf = this.context.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.setValueAtTime(1200, now); // Começa já bem baixo (era 4000)
      lpf.frequency.exponentialRampToValueAtTime(400, now + duration); // Termina muito baixo (era 800)
      lpf.Q.setValueAtTime(0.5, now); // Q baixo = rolloff suave

      gain.connect(lpf);
      this._connectAmbient(lpf);

      // Gentle release envelope - fade out muito gradual
      gain.gain.setValueAtTime(gainPeak, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.start(now);
      osc.stop(now + duration);

      // Return gain to pool
      if (this.pool) {
        setTimeout(
          () => {
            this.pool.returnGain(gain);
          },
          duration * 1000 + 50
        );
      }
    });
  }

  _getThrusterRandomScope(type) {
    const scopes = this.randomScopes;
    if (type === 'main') {
      return (
        scopes?.families?.thrusterMain ||
        scopes?.families?.thruster ||
        scopes?.base
      );
    } else if (type === 'retro') {
      return (
        scopes?.families?.thrusterRetro ||
        scopes?.families?.thruster ||
        scopes?.base
      );
    } else {
      // side
      return (
        scopes?.families?.thrusterSide ||
        scopes?.families?.thruster ||
        scopes?.base
      );
    }
  }

  // ===========================================================================
  // Lifecycle helpers consumed by the facade reset/destroy.
  // ===========================================================================

  /** Flush + reset the batcher (facade reset). */
  resetBatcher() {
    if (this.batcher) {
      this.batcher.flushPendingBatches();
      this.batcher.resetStats();
    }
  }

  /** Force-flush pending batches (facade flushAudioBatches). */
  flushBatches() {
    if (this.batcher) {
      this.batcher.flushPendingBatches();
    }
  }

  /** Cleanup pool/cache/batcher/thruster state for a fresh run (facade reset). */
  reset() {
    if (this.pool) {
      this.pool.cleanup();
    }
    if (this.cache) {
      this.cache.clearCache();
    }
    if (this.batcher) {
      this.batcher.flushPendingBatches();
      this.batcher.resetStats();
    }
    if (this.thrusterLoops) {
      this.thrusterLoops.cleanup(this.pool);
    }
  }

  /** Aggregate stats for the facade performance logger. */
  getStats() {
    return {
      pool: this.pool ? this.pool.getStats() : null,
      cache: this.cache ? this.cache.getStats() : null,
      batcher: this.batcher ? this.batcher.getStats() : null,
    };
  }

  /**
   * Tear down: stop thruster loops, clean batcher/pool/cache, disconnect the
   * buses. Idempotent (safe to call repeatedly).
   */
  dispose() {
    if (this.thrusterLoops) {
      this.thrusterLoops.cleanup(this.pool);
    }
    if (this.batcher) {
      this.batcher.flushPendingBatches();
      this.batcher.resetStats();
    }
    if (this.cache && typeof this.cache.clearCache === 'function') {
      this.cache.clearCache();
    }
    if (this.pool && typeof this.pool.cleanup === 'function') {
      this.pool.cleanup();
    }

    this._safeDisconnect(this.ambientBus);
    this._safeDisconnect(this.protectedBus);
    this.ambientBus = null;
    this.protectedBus = null;
    this.batcher = null;
    this.pool = null;
    this.cache = null;
    this.initialized = false;
  }

  _safeDisconnect(node) {
    if (!node || typeof node.disconnect !== 'function') return;
    try {
      node.disconnect();
    } catch (error) {
      // Already disconnected.
    }
  }
}

export default SFXBus;
