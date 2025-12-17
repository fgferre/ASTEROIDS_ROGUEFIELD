import { BaseSystem } from '../core/BaseSystem.js';
import AudioPool from './AudioPool.js';
import AudioCache from './AudioCache.js';
import AudioBatcher from './AudioBatcher.js';
import RandomService from '../core/RandomService.js';
import { normalizeDependencies, resolveService } from '../core/serviceUtils.js';
import {
  BOSS_AUDIO_FREQUENCY_PRESETS,
  MUSIC_LAYER_CONFIG,
} from '../core/GameConstants.js';
import { WAVE_BOSS_INTERVAL } from '../data/constants/gameplay.js';

/**
 * ThrusterLoopManager - Manages continuous thruster loop sounds
 * Handles start→loop→stop lifecycle for main, retro, and side thrusters
 */
class ThrusterLoopManager {
  constructor() {
    // Map of active loops: type → {oscillators, gains, sources, filters, startTime, variation, intensity}
    this.activeLoops = new Map();
  }

  /**
   * Starts a thruster loop for given type
   * @param {string} type - Thruster type: 'main', 'retro', or 'side'
   * @param {number} variation - Variation index for deterministic sound
   * @param {number} intensity - Loop intensity (0-1)
   * @param {AudioContext} context - Web Audio context
   * @param {AudioPool} pool - Audio node pool
   * @param {AudioCache} cache - Audio buffer cache
   * @param {object} randomScope - Random service scope for this thruster type
   * @param {function} connectFn - Function to connect gain node to destination
   * @returns {object} Loop state object
   */
  startLoop(
    type,
    variation,
    intensity,
    context,
    pool,
    cache,
    randomScope,
    connectFn
  ) {
    // Prevent duplicate loops
    if (this.activeLoops.has(type)) {
      console.warn(
        `[ThrusterLoopManager] Loop already active for type: ${type}`
      );
      return this.activeLoops.get(type);
    }

    const now = context.currentTime;
    const loopState = { type, variation, intensity, startTime: now };

    // Create oscillators (saw + square mix for rich timbre)
    const sawOsc = pool ? pool.getOscillator() : context.createOscillator();
    const squareOsc = pool ? pool.getOscillator() : context.createOscillator();
    const sawGain = pool ? pool.getGain() : context.createGain();
    const squareGain = pool ? pool.getGain() : context.createGain();

    sawOsc.type = 'sawtooth';
    squareOsc.type = 'square';

    // Frequency varies by thruster type
    // [NEO-ARCADE AUDIO] Bass Boost & Rumble
    // Filter chain created later (bpFilter etc)

    // Frequency varies by thruster type but stays low for weight
    let baseFreq, freqVariation, noiseDuration, filterCutoff;
    if (type === 'main') {
      baseFreq = 55; // Lowerfreq (was 85)
      filterCutoff = 600; // Muffled rumble
      freqVariation = randomScope?.range ? randomScope.range(-3, 3) : 0;
      noiseDuration =
        1.2 + (randomScope?.range ? randomScope.range(-0.2, 0.3) : 0);
    } else if (type === 'retro') {
      baseFreq = 65; // (was 95)
      filterCutoff = 800;
      freqVariation = randomScope?.range ? randomScope.range(-4, 4) : 0;
      noiseDuration =
        1.0 + (randomScope?.range ? randomScope.range(-0.2, 0.2) : 0);
    } else {
      // side
      baseFreq = 90; // (was 110)
      filterCutoff = 1200; // Hissier for side thrusters
      freqVariation = randomScope?.range ? randomScope.range(-5, 5) : 0;
      noiseDuration =
        0.8 + (randomScope?.range ? randomScope.range(-0.1, 0.2) : 0);
    }

    const freq = baseFreq + freqVariation;
    sawOsc.frequency.setValueAtTime(freq, now);
    squareOsc.frequency.setValueAtTime(freq, now);

    // Configure Filter (Removed dead lowPass)

    // Component gains calibrated to sum to -6dB peak at intensity=1.0
    sawGain.gain.setValueAtTime(0.35, now); // Boosted
    squareGain.gain.setValueAtTime(0.25, now);

    // Chain: Osc -(connect)-> OscGain -> [BP Filter] -> ...
    sawOsc.connect(sawGain);
    squareOsc.connect(squareGain);

    // lowPass was dead code here (connected but output nowhere). Removed.

    // Create noise component with tileable buffer
    const familyName =
      type === 'main'
        ? 'thrusterMain'
        : type === 'retro'
          ? 'thrusterRetro'
          : 'thrusterSide';
    let noiseBuffer = null;

    if (cache) {
      noiseBuffer = cache.getNoiseBuffer(noiseDuration, false, 'linear', {
        family: familyName,
        random: randomScope,
      });
    } else {
      // Fallback: create simple noise buffer
      const bufferSize = Math.floor(context.sampleRate * noiseDuration);
      noiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = randomScope?.range
          ? randomScope.range(-1, 1)
          : Math.random() * 2 - 1;
      }
    }

    const noiseSource = pool
      ? pool.getBufferSource()
      : context.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true; // CRITICAL: enable looping

    const noiseGain = pool ? pool.getGain() : context.createGain();
    noiseGain.gain.setValueAtTime(0.25, now);
    noiseSource.connect(noiseGain);

    // Create band-pass filter (1.2-6kHz for thruster characteristic)
    const bpFilter = context.createBiquadFilter();
    bpFilter.type = 'bandpass';
    bpFilter.frequency.setValueAtTime(
      type === 'main' ? 3000 : type === 'retro' ? 2500 : 3500,
      now
    );
    bpFilter.Q.setValueAtTime(1.2, now);

    // Create EQ chain: highpass → peaking (low) → peaking (high)
    const hpf = context.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.setValueAtTime(70, now);

    const peakLow = context.createBiquadFilter();
    peakLow.type = 'peaking';
    peakLow.frequency.setValueAtTime(250, now);
    peakLow.Q.setValueAtTime(1.0, now);
    peakLow.gain.setValueAtTime(
      type === 'main' ? 3 : type === 'retro' ? 2 : 2.5,
      now
    ); // +2-3dB warmth

    const peakHigh = context.createBiquadFilter();
    peakHigh.type = 'peaking';
    peakHigh.frequency.setValueAtTime(3000, now);
    peakHigh.Q.setValueAtTime(1.0, now);
    peakHigh.gain.setValueAtTime(
      type === 'main' ? 2 : type === 'retro' ? 1.5 : 2,
      now
    ); // +1.5-2dB presence

    // Create master gain for this loop (clamp to 0.5 = -6dB at intensity=1.0)
    const masterGain = pool ? pool.getGain() : context.createGain();
    const clampedIntensity = Math.min(intensity, 1.0) * 0.5; // Max -6dB
    masterGain.gain.setValueAtTime(clampedIntensity, now);

    // Connect chain: oscillators → BP filter → HPF → peakLow → peakHigh → master gain
    sawGain.connect(bpFilter);
    squareGain.connect(bpFilter);
    noiseGain.connect(bpFilter);
    bpFilter.connect(hpf);
    hpf.connect(peakLow);
    peakLow.connect(peakHigh);
    peakHigh.connect(masterGain);

    // Connect to destination
    if (connectFn && typeof connectFn === 'function') {
      connectFn(masterGain);
    }

    // Start all sources
    sawOsc.start(now);
    squareOsc.start(now);
    noiseSource.start(now);

    // Store loop state
    loopState.oscillators = [sawOsc, squareOsc];
    loopState.gains = [sawGain, squareGain, noiseGain, masterGain];
    loopState.source = noiseSource;
    loopState.filters = [bpFilter, hpf, peakLow, peakHigh]; // Store all filters for cleanup

    this.activeLoops.set(type, loopState);

    return loopState;
  }

  /**
   * Updates loop intensity smoothly
   * @param {string} type - Thruster type
   * @param {number} intensity - New intensity (0-1)
   */
  updateLoop(type, intensity) {
    const loop = this.activeLoops.get(type);
    if (!loop) {
      console.warn(
        `[ThrusterLoopManager] Cannot update: no active loop for type ${type}`
      );
      return;
    }

    // Store new intensity
    loop.intensity = intensity;

    // Update master gain smoothly (clamp to -6dB)
    if (loop.gains && loop.gains[3]) {
      const masterGain = loop.gains[3];
      const now = masterGain.context.currentTime;
      const clampedIntensity = Math.min(intensity, 1.0) * 0.5; // Max -6dB
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(clampedIntensity, now + 0.05);
    }
  }

  /**
   * Stops a thruster loop
   * @param {string} type - Thruster type
   * @param {AudioPool} pool - Audio pool to return nodes to
   */
  stopLoop(type, pool) {
    const loop = this.activeLoops.get(type);
    if (!loop) {
      return;
    }

    const now = loop.oscillators[0].context.currentTime;

    // Stop oscillators and source
    loop.oscillators.forEach((osc) => {
      try {
        osc.stop(now + 0.01);
      } catch (e) {
        // Already stopped
      }
    });

    try {
      loop.source.stop(now + 0.01);
    } catch (e) {
      // Already stopped
    }

    // Disconnect all filters
    if (loop.filters && Array.isArray(loop.filters)) {
      loop.filters.forEach((filter) => {
        try {
          filter.disconnect();
        } catch (e) {
          // Already disconnected
        }
      });
    }

    // Return gains to pool after sounds finish
    if (pool) {
      setTimeout(() => {
        loop.gains.forEach((gain) => {
          try {
            gain.disconnect();
            pool.returnGain(gain);
          } catch (e) {
            // Ignore
          }
        });
      }, 50);
    }

    this.activeLoops.delete(type);
  }

  /**
   * Checks if a loop is currently active
   * @param {string} type - Thruster type
   * @returns {boolean}
   */
  isActive(type) {
    return this.activeLoops.has(type);
  }

  /**
   * Cleanup all active loops (called on reset)
   * @param {AudioPool} pool - Audio pool to return nodes to
   */
  cleanup(pool) {
    for (const [type, loop] of this.activeLoops) {
      // Stop all oscillators and sources
      loop.oscillators.forEach((osc) => {
        try {
          osc.stop();
        } catch (e) {
          // Already stopped
        }
      });

      try {
        loop.source.stop();
      } catch (e) {
        // Already stopped
      }

      // Disconnect and return gains
      if (pool) {
        loop.gains.forEach((gain) => {
          try {
            gain.disconnect();
            pool.returnGain(gain);
          } catch (e) {
            // Ignore
          }
        });
      }

      // Disconnect all filters
      if (loop.filters && Array.isArray(loop.filters)) {
        loop.filters.forEach((filter) => {
          try {
            filter.disconnect();
          } catch (e) {
            // Ignore
          }
        });
      }
    }

    this.activeLoops.clear();
  }
}

class AudioSystem extends BaseSystem {
  constructor(dependencies = {}) {
    super(dependencies, {
      systemName: 'AudioSystem',
      serviceName: 'audio',
    });
    this.context = null;
    this.masterGain = null;
    this.musicGain = null;
    this.effectsGain = null;
    this.initialized = false;
    this.sounds = new Map();
    this.settings = resolveService('settings', this.dependencies);
    this.random =
      resolveService('random', this.dependencies) ||
      (this.dependencies && this.dependencies.random) ||
      new RandomService('audio-system:fallback');
    this.randomScopes = {
      ...this._createRandomScopes(this.random),
      seeds: null,
      cacheSnapshot: null,
      batcherSnapshot: null,
    };
    this._fallbackRandom = null;
    this.volumeState = {
      master: 0.25,
      music: 0.6,
      effects: 1,
      muteAll: false,
    };

    // Optimization systems
    this.pool = null;
    this.cache = null;
    this.batcher = null;

    // Performance tracking
    this.performanceMonitor = {
      enabled: true,
      frameCount: 0,
      audioCallsPerFrame: 0,
      averageCallsPerFrame: 0,
      peakCallsPerFrame: 0,
      lastFrameTime: performance.now(),
      totalAudioCalls: 0,
    };

    // AudioContext resume coordination
    this.resumePromise = null;
    this.pendingSoundQueue = [];

    // Low health warning state
    this.lowHealthWarning = false;

    // UI sound debouncing
    this.lastUIHoverTime = 0;

    const initialIntensityLevel =
      typeof MUSIC_LAYER_CONFIG?.initialIntensity === 'number'
        ? MUSIC_LAYER_CONFIG.initialIntensity
        : 0;

    this.musicController = {
      initialized: false,
      layers: {},
      intensityLevel: initialIntensityLevel,
      targetLevel: initialIntensityLevel,
      bossActive: false,
      relaxTimeout: null,
      lastNonBossIntensity: initialIntensityLevel,
      pendingNonBossIntensity: null,
      relaxedIntensity:
        typeof MUSIC_LAYER_CONFIG?.relaxedIntensity === 'number'
          ? MUSIC_LAYER_CONFIG.relaxedIntensity
          : initialIntensityLevel,
      bossIntensity:
        typeof MUSIC_LAYER_CONFIG?.bossIntensity === 'number'
          ? MUSIC_LAYER_CONFIG.bossIntensity
          : initialIntensityLevel,
      rampDurations: {
        rise: MUSIC_LAYER_CONFIG?.rampDurations?.rise ?? 1.2,
        fall: MUSIC_LAYER_CONFIG?.rampDurations?.fall ?? 2.0,
        bossRise: MUSIC_LAYER_CONFIG?.rampDurations?.bossRise ?? 0.6,
        bossFall: MUSIC_LAYER_CONFIG?.rampDurations?.bossFall ?? 2.8,
      },
    };

    this.bossAudioState = {
      lastPhase: null,
    };

    // Thruster sound system
    this.thrusterLoopManager = new ThrusterLoopManager();
    this.thrusterState = {
      lastIntensity: { main: 0, retro: 0, side: 0 },
      lastEventTime: { main: 0, retro: 0, side: 0 }, // Timestamp of last event per type
      startThreshold: 0.1, // Intensity threshold to start thruster sound
      stopThreshold: 0.05, // Hysteresis: lower threshold to stop (prevents flapping)
      inactivityTimeout: 150, // ms: stop loop if no event received for this duration
    };
    this.thrusterInactivityCheckInterval = null;

    this.captureRandomScopes();
    this.bootstrapSettings();
    this._exposeRandomDebugControls();
    this._setupEarlyInit();
  }

  /**
   * Sets up early audio initialization on first user interaction
   * This ensures audio works immediately, even before game starts
   */
  _setupEarlyInit() {
    if (typeof document === 'undefined') return;

    const initOnInteraction = async () => {
      if (!this.initialized) {
        try {
          await this.init();
        } catch (e) {
          console.warn('[AudioSystem] Early init failed:', e);
        }
      }
      // Remove listeners after first interaction
      document.removeEventListener('click', initOnInteraction, true);
      document.removeEventListener('keydown', initOnInteraction, true);
      document.removeEventListener('touchstart', initOnInteraction, true);
    };

    // Use capture phase to catch events early
    document.addEventListener('click', initOnInteraction, true);
    document.addEventListener('keydown', initOnInteraction, true);
    document.addEventListener('touchstart', initOnInteraction, true);
  }

  async init() {
    if (this.initialized) return;

    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      await this.context.resume();

      this.masterGain = this.context.createGain();
      this.masterGain.connect(this.context.destination);

      this.musicGain = this.context.createGain();
      this.effectsGain = this.context.createGain();

      this.musicGain.connect(this.masterGain);
      this.effectsGain.connect(this.masterGain);

      // Initialize optimization systems
      this.pool = new AudioPool(this.context, 50);
      this.cache = new AudioCache(this.context, 20, {
        random: this.randomScopes.cache,
      });
      this.batcher = new AudioBatcher(this, 0, {
        random: this.randomScopes.batcher,
      });

      this.captureRandomScopes();

      this.applyVolumeToNodes();
      this.initializeMusicController();
      this.initialized = true;

      // Start performance monitoring
      this._startPerformanceMonitoring();

      // Start thruster inactivity checker
      this._startThrusterInactivityChecker();
    } catch (error) {
      console.warn('Áudio não disponível:', error);
      this.initialized = false;
    }
  }

  /**
   * Registers listeners for gameplay events that trigger audio feedback.
   *
   * Enemy modules should emit `enemy-fired`/`mine-exploded` so that all audio
   * synthesis stays centralized here instead of touching the AudioSystem
   * directly. This keeps new enemy types decoupled from the sound pipeline
   * while still allowing bespoke effects per archetype.
   */
  setupEventListeners() {
    this.registerEventListener('settings-audio-changed', (payload = {}) => {
      if (payload?.values) {
        this.updateVolumeState(payload.values);
      }
    });

    this.registerEventListener('weapon-fired', (data) => {
      this.playLaserShot(data || {});
    });

    this.registerEventListener('combat-target-lock', (data) => {
      if (data?.lost) {
        return;
      }
      this.playTargetLock(data || {});
    });

    this.registerEventListener('enemy-destroyed', (data) => {
      if (!data) return;

      // Epic sound when Gold asteroid is destroyed
      if (data.variant === 'gold') {
        this.playGoldJackpot();
      }

      this.playAsteroidBreak(data.size);
      if (data.size === 'large') {
        this.playBigExplosion();
      }
    });

    this.registerEventListener('asteroid-volatile-exploded', () => {
      this.playBigExplosion();
    });

    this.registerEventListener('player-leveled-up', () => {
      this.playLevelUp();
    });

    this.registerEventListener('xp-collected', () => {
      // All orbs play same sound (all are tier 1 blue)
      this.playXPCollect();
    });

    this.registerEventListener('xp-orb-fused', (data) => {
      // Play fusion sound based on tier
      this.playOrbFusion(data?.toClass);
    });

    this.registerEventListener('enemy-spawned', (data) => {
      // Special sound for Gold spawn
      if (data?.enemy?.variant === 'gold') {
        this.playGoldSpawn();
      }
    });

    // Enemy modules fire projectiles/explosions exclusively through events so
    // the audio layer can orchestrate batching and pooling.
    this.registerEventListener('enemy-fired', (data = {}) => {
      const enemyType = (
        data?.enemyType ||
        data?.enemy?.type ||
        ''
      ).toLowerCase();

      if (enemyType === 'drone') {
        this.playDroneFire(data);
        return;
      }

      if (enemyType === 'hunter') {
        this.playHunterBurst(data);
        return;
      }
    });

    this.registerEventListener('wave-started', (waveEvent = {}) => {
      this.updateWaveMusicIntensity(waveEvent);
    });

    this.registerEventListener('mine-exploded', (data = {}) => {
      this.playMineExplosion(data);
    });

    this.registerEventListener('boss-spawned', (data = {}) => {
      this.playBossRoar(data);
      this._onBossFightStarted(data);
    });

    this.registerEventListener('boss-phase-changed', (data = {}) => {
      this.playBossPhaseChange(data);
      this._onBossPhaseChanged(data);
    });

    this.registerEventListener('boss-defeated', (data = {}) => {
      this.playBossDefeated(data);
      this._onBossDefeated(data);
    });

    this.registerEventListener('bullet-hit', (data) => {
      // Play hit confirm sound
      this.playBulletHit(data?.killed || false);
    });

    this.registerEventListener('player-took-damage', () => {
      this.playShipHit();
    });

    this.registerEventListener('shield-activated', () => {
      this.playShieldActivate();
    });

    this.registerEventListener('shield-hit', () => {
      this.playShieldImpact();
    });

    this.registerEventListener('shield-broken', () => {
      this.playShieldBreak();
    });

    this.registerEventListener('shield-recharged', () => {
      this.playShieldRecharged();
    });

    this.registerEventListener('shield-activation-failed', () => {
      this.playShieldFail();
    });

    this.registerEventListener('shield-shockwave', () => {
      this.playShieldShockwave();
    });

    // UI Sound Effects
    this.registerEventListener('upgrade-applied', (data) => {
      this.playUpgradeSelect(data?.rarity || 'common');
    });

    this.registerEventListener('pause-state-changed', (data) => {
      if (data?.isPaused) {
        this.playPauseOpen();
      } else {
        this.playPauseClose();
      }
    });

    this.registerEventListener('screen-changed', () => {
      this.playMenuTransition();
    });

    this.registerEventListener('input-confirmed', () => {
      this.playUISelect();
    });

    // UI hover (debounced to prevent accumulation)
    this.registerEventListener('ui-hover', () => {
      const now = performance.now();
      // Simple debouncing: only play if 80ms have passed since last hover sound
      if (now - this.lastUIHoverTime > 80) {
        this.lastUIHoverTime = now;
        this.playUIHover();
      }
    });

    // Game started
    this.registerEventListener('game-started', () => {
      this.playUIStartGame();
    });

    // Low health warning
    this.registerEventListener('player-health-changed', (data) => {
      const healthPercent = data?.health / data?.maxHealth;
      if (healthPercent <= 0.25 && healthPercent > 0) {
        // Only play if we just entered low health state
        if (!this.lowHealthWarning) {
          this.playLowHealthWarning();
          this.lowHealthWarning = true;
        }
      } else {
        this.lowHealthWarning = false;
      }
    });

    // Thruster sounds (continuous loops)
    this.registerEventListener('thruster-effect', (data) => {
      this.handleThrusterEffect(data || {});
    });
  }

  updateWaveMusicIntensity(waveEvent = {}) {
    const intensities = MUSIC_LAYER_CONFIG?.intensities || [];
    if (!intensities.length) {
      return;
    }

    const waveNumber = Number(waveEvent?.wave);
    if (!Number.isFinite(waveNumber) || waveNumber <= 0) {
      return;
    }

    const isBossWave = this._isBossWaveEvent(waveEvent, waveNumber);
    const targetLevel = this._calculateWaveIntensityLevel(waveNumber);

    if (isBossWave) {
      this.musicController.pendingNonBossIntensity = null;
      return;
    }

    this.musicController.lastNonBossIntensity = targetLevel;

    if (this.musicController.bossActive) {
      this.musicController.pendingNonBossIntensity = targetLevel;
      return;
    }

    if (
      targetLevel === this.musicController.targetLevel &&
      targetLevel === this.musicController.intensityLevel
    ) {
      this.musicController.pendingNonBossIntensity = null;
      return;
    }

    this.musicController.pendingNonBossIntensity = null;

    const gentleRamp =
      this.musicController?.rampDurations?.rise ??
      this.musicController?.rampDurations?.fall ??
      1.2;

    this.setMusicIntensity(targetLevel, {
      rampDuration: gentleRamp,
    });
  }

  _isBossWaveEvent(waveEvent = {}, waveNumber = null) {
    if (typeof waveEvent?.isBossWave === 'boolean') {
      return waveEvent.isBossWave;
    }

    const configFlag = waveEvent?.config?.isBossWave;
    if (typeof configFlag === 'boolean') {
      return configFlag;
    }

    const resolvedWaveNumber = Number.isFinite(waveNumber)
      ? waveNumber
      : Number(waveEvent?.wave);
    if (!Number.isFinite(resolvedWaveNumber) || resolvedWaveNumber <= 0) {
      return false;
    }

    const rawInterval = Number(WAVE_BOSS_INTERVAL);
    if (!Number.isFinite(rawInterval) || rawInterval <= 0) {
      return false;
    }

    const normalizedInterval = Math.max(1, Math.floor(rawInterval));
    if (normalizedInterval <= 0) {
      return false;
    }

    return resolvedWaveNumber % normalizedInterval === 0;
  }

  _calculateWaveIntensityLevel(waveNumber) {
    const intensities = MUSIC_LAYER_CONFIG?.intensities || [];
    const stepCount = intensities.length - 1;

    if (stepCount <= 0) {
      return 0;
    }

    const normalizedWave = Math.max(1, Math.floor(Number(waveNumber) || 0));

    const configuredStep = Number(MUSIC_LAYER_CONFIG?.wavesPerIntensityStep);
    const progressionWindow = Number(
      MUSIC_LAYER_CONFIG?.intensityProgressionWindow
    );

    let wavesPerStep = Number.isFinite(configuredStep) ? configuredStep : null;

    if (!wavesPerStep || wavesPerStep <= 0) {
      const fallbackWindow =
        Number.isFinite(progressionWindow) && progressionWindow > 0
          ? progressionWindow
          : stepCount * 3;
      wavesPerStep = Math.max(1, Math.round(fallbackWindow / stepCount));
    }

    const level = Math.floor((normalizedWave - 1) / wavesPerStep);
    return Math.min(stepCount, Math.max(0, level));
  }

  _randomBetween(min, max) {
    const candidates = [
      this.randomScopes?.families?.music,
      this.randomScopes?.base,
      this.random,
    ];

    for (const rng of candidates) {
      if (rng && typeof rng.range === 'function') {
        return rng.range(min, max);
      }
    }

    const [low, high] = max >= min ? [min, max] : [max, min];
    return low + (high - low) * Math.random();
  }

  bootstrapSettings() {
    if (
      this.settings &&
      typeof this.settings.getCategoryValues === 'function'
    ) {
      const values = this.settings.getCategoryValues('audio');
      if (values) {
        this.updateVolumeState(values);
        return;
      }
    }

    this.applyVolumeToNodes();
  }

  sanitizeVolume(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.min(1, Math.max(0, numeric));
  }

  updateVolumeState(values = {}) {
    this.volumeState = {
      master: this.sanitizeVolume(values.masterVolume, this.volumeState.master),
      music: this.sanitizeVolume(values.musicVolume, this.volumeState.music),
      effects: this.sanitizeVolume(
        values.effectsVolume,
        this.volumeState.effects
      ),
      muteAll: Boolean(values.muteAll ?? this.volumeState.muteAll),
    };

    this.applyVolumeToNodes();
  }

  applyVolumeToNodes() {
    if (!this.masterGain) {
      return;
    }

    const { master, music, effects, muteAll } = this.volumeState;
    const masterValue = muteAll ? 0 : master;

    this.masterGain.gain.value = masterValue;

    if (this.musicGain) {
      this.musicGain.gain.value = muteAll ? 0 : master * music;
    }

    if (this.effectsGain) {
      this.effectsGain.gain.value = muteAll ? 0 : master * effects;
    }
  }

  getEffectsDestination() {
    if (this.effectsGain) {
      return this.effectsGain;
    }
    if (this.masterGain) {
      return this.masterGain;
    }
    return null;
  }

  connectGainNode(node) {
    const destination = this.getEffectsDestination();
    if (destination && node && typeof node.connect === 'function') {
      node.connect(destination);
    }
  }

  connectMusicNode(node) {
    const destination = this.musicGain || this.masterGain;
    if (destination && node && typeof node.connect === 'function') {
      node.connect(destination);
    }
  }

  initializeMusicController() {
    if (!this.context || this.musicController.initialized) {
      return;
    }

    const layersConfig = MUSIC_LAYER_CONFIG?.layers || {};
    const now = this.context.currentTime;

    const createdLayers = {};

    Object.entries(layersConfig).forEach(([key, layerConfig = {}]) => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      const baseFrequency = Number(layerConfig.frequency) || 110;

      osc.type = layerConfig.type || 'sine';
      osc.frequency.setValueAtTime(Math.max(10, baseFrequency), now);

      if (typeof layerConfig.detuneCents === 'number') {
        osc.detune.setValueAtTime(layerConfig.detuneCents, now);
      }

      const randomDetuneSpan = Number(layerConfig.randomDetuneCents);
      if (Number.isFinite(randomDetuneSpan) && randomDetuneSpan > 0) {
        const offset = this._randomBetween(
          -Math.abs(randomDetuneSpan),
          Math.abs(randomDetuneSpan)
        );
        osc.detune.setValueAtTime(
          (Number(layerConfig.detuneCents) || 0) + offset,
          now
        );
      }

      gain.gain.setValueAtTime(0, now);

      osc.connect(gain);

      let outputNode = gain;
      const filterConfig = layerConfig.filter;
      let filterNode = null;

      if (
        filterConfig &&
        typeof this.context.createBiquadFilter === 'function'
      ) {
        filterNode = this.context.createBiquadFilter();
        filterNode.type = filterConfig.type || 'lowpass';

        if (typeof filterConfig.frequency === 'number') {
          filterNode.frequency.setValueAtTime(
            Math.max(10, filterConfig.frequency),
            now
          );
        }

        if (typeof filterConfig.Q === 'number') {
          filterNode.Q.setValueAtTime(Math.max(0.0001, filterConfig.Q), now);
        }

        if (
          typeof filterConfig.gain === 'number' &&
          ['lowshelf', 'highshelf', 'peaking'].includes(filterNode.type)
        ) {
          filterNode.gain.setValueAtTime(filterConfig.gain, now);
        }

        gain.connect(filterNode);
        outputNode = filterNode;
      }

      let modulator = null;
      const depthMultiplier =
        typeof layerConfig.modulationDepth === 'number'
          ? Math.max(0, Math.min(0.95, layerConfig.modulationDepth))
          : 0;

      if (
        depthMultiplier > 0 &&
        typeof this.context.createOscillator === 'function'
      ) {
        const lfo = this.context.createOscillator();
        const depthGain = this.context.createGain();
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
          const offsetWindow = Math.min(cycleDuration, 2.5);
          phaseOffset = this._randomBetween(0, offsetWindow);
        }

        lfo.start(now + Math.max(0, phaseOffset));

        modulator = {
          lfo,
          depthGain,
          depthMultiplier,
        };
      }

      this.connectMusicNode(outputNode);
      osc.start(now);

      createdLayers[key] = {
        osc,
        gain,
        config: layerConfig,
        filter: filterNode,
        modulator,
      };
    });

    this.musicController.layers = createdLayers;
    this.musicController.initialized = true;

    this.setMusicIntensity(this.musicController.intensityLevel, {
      immediate: true,
    });
  }

  setMusicIntensity(level, options = {}) {
    const intensities = MUSIC_LAYER_CONFIG?.intensities || [];

    if (!intensities.length) {
      this.musicController.intensityLevel = level;
      this.musicController.targetLevel = level;
      return;
    }

    const maxLevel = intensities.length - 1;
    const targetLevel = Math.min(Math.max(0, Math.floor(level)), maxLevel);
    const { immediate = false, rampDuration, reason } = options;

    this.musicController.targetLevel = targetLevel;

    if (!this.musicController.initialized || !this.context) {
      this.musicController.intensityLevel = targetLevel;
      return;
    }

    let duration = typeof rampDuration === 'number' ? rampDuration : null;
    if (duration === null) {
      const isIncrease = targetLevel > this.musicController.intensityLevel;
      if (reason === 'boss') {
        duration = this.musicController.rampDurations.bossRise;
      } else if (reason === 'bossVictory') {
        duration = this.musicController.rampDurations.bossFall;
      } else {
        duration = isIncrease
          ? this.musicController.rampDurations.rise
          : this.musicController.rampDurations.fall;
      }
    }

    this._applyMusicIntensity(targetLevel, {
      immediate,
      duration,
    });

    this.musicController.intensityLevel = targetLevel;
  }

  _applyMusicIntensity(level, options = {}) {
    if (!this.musicController.initialized || !this.context) {
      return;
    }

    const profile = (MUSIC_LAYER_CONFIG?.intensities || [])[level];
    if (!profile) {
      return;
    }

    const { immediate = false, duration = 1.2 } = options;
    const rampDuration = Math.max(0.05, duration || 0.05);
    const now = this.context.currentTime;

    Object.entries(this.musicController.layers).forEach(([key, layer]) => {
      const gainNode = layer?.gain;
      if (!gainNode || !gainNode.gain) {
        return;
      }

      const targetGain = profile[key] ?? 0;

      try {
        gainNode.gain.cancelScheduledValues(now);
      } catch (error) {
        // Some browsers throw if there are no scheduled values
      }

      if (immediate) {
        gainNode.gain.setValueAtTime(targetGain, now);
      } else {
        const currentValue =
          typeof gainNode.gain.value === 'number'
            ? gainNode.gain.value
            : targetGain;

        gainNode.gain.setValueAtTime(currentValue, now);
        gainNode.gain.linearRampToValueAtTime(targetGain, now + rampDuration);
      }

      const modulator = layer?.modulator;
      const depthParam = modulator?.depthGain?.gain;
      if (!depthParam) {
        return;
      }

      const depthValue = Math.max(0, targetGain * modulator.depthMultiplier);

      try {
        depthParam.cancelScheduledValues(now);
      } catch (error) {
        // Ignore browsers that throw when clearing empty schedules
      }

      if (immediate) {
        depthParam.setValueAtTime(depthValue, now);
        return;
      }

      const currentDepth =
        typeof depthParam.value === 'number' ? depthParam.value : depthValue;

      depthParam.setValueAtTime(currentDepth, now);
      depthParam.linearRampToValueAtTime(depthValue, now + rampDuration);
    });
  }

  _scheduleMusicRelaxation(delay = 0) {
    if (this.musicController.relaxTimeout) {
      clearTimeout(this.musicController.relaxTimeout);
      this.musicController.relaxTimeout = null;
    }

    if (!Number.isFinite(delay) || delay <= 0) {
      return;
    }

    this.musicController.relaxTimeout = setTimeout(() => {
      this.musicController.relaxTimeout = null;

      const hasPendingLevel =
        this.musicController.pendingNonBossIntensity !== null &&
        this.musicController.pendingNonBossIntensity !== undefined;

      if (!hasPendingLevel) {
        return;
      }

      const fallbackLevel = this.musicController.pendingNonBossIntensity;

      this.musicController.pendingNonBossIntensity = null;

      if (!Number.isFinite(fallbackLevel)) {
        return;
      }

      this.setMusicIntensity(fallbackLevel, {
        reason: 'bossVictory',
        rampDuration: this.musicController.rampDurations.fall,
      });

      this.musicController.lastNonBossIntensity = fallbackLevel;
    }, delay);
  }

  _onBossFightStarted(payload = {}) {
    this.musicController.bossActive = true;
    if (this.musicController.relaxTimeout) {
      clearTimeout(this.musicController.relaxTimeout);
      this.musicController.relaxTimeout = null;
    }

    this.setMusicIntensity(this.musicController.bossIntensity, {
      reason: 'boss',
      rampDuration: this.musicController.rampDurations.bossRise,
    });

    if (payload?.phase != null) {
      this.bossAudioState.lastPhase = payload.phase;
    }
  }

  _onBossPhaseChanged(payload = {}) {
    if (!this.musicController.bossActive) {
      this._onBossFightStarted(payload);
    } else {
      const quickRamp = Math.max(
        0.3,
        this.musicController.rampDurations.bossRise * 0.75
      );
      this.setMusicIntensity(this.musicController.bossIntensity, {
        reason: 'boss',
        rampDuration: quickRamp,
      });
    }

    const nextPhase =
      payload?.phase ?? payload?.nextPhase ?? payload?.newPhase ?? null;
    if (nextPhase != null) {
      this.bossAudioState.lastPhase = nextPhase;
    }
  }

  _onBossDefeated(payload = {}) {
    this.musicController.bossActive = false;
    this.bossAudioState.lastPhase = null;

    this.setMusicIntensity(this.musicController.relaxedIntensity, {
      reason: 'bossVictory',
      rampDuration: this.musicController.rampDurations.bossFall,
    });

    this._scheduleMusicRelaxation(4000);
  }

  handleBossEvent(eventName, payload = {}) {
    switch (eventName) {
      case 'boss-spawned':
        this.playBossRoar(payload);
        this._onBossFightStarted(payload);
        break;
      case 'boss-phase-changed':
        this.playBossPhaseChange(payload);
        this._onBossPhaseChanged(payload);
        break;
      case 'boss-defeated':
        this.playBossDefeated(payload);
        this._onBossDefeated(payload);
        break;
      default:
        break;
    }
  }

  playBossEvent(eventName, payload = {}) {
    this.handleBossEvent(eventName, payload);
  }

  safePlay(soundFunction) {
    if (
      !this.initialized ||
      !this.context ||
      typeof soundFunction !== 'function'
    ) {
      return;
    }

    if (this.context.state !== 'running' || this.resumePromise) {
      this.pendingSoundQueue.push(soundFunction);
      this._ensureContextResumed();
      return;
    }

    if (this.pendingSoundQueue.length) {
      this._flushPendingSounds();
    }

    this._invokeSoundFunction(soundFunction);
  }

  _ensureContextResumed() {
    if (
      !this.context ||
      this.context.state === 'running' ||
      this.resumePromise
    ) {
      return;
    }

    this.resumePromise = this.context
      .resume()
      .catch((error) => {
        console.warn('Erro ao retomar contexto de áudio:', error);
      })
      .finally(() => {
        this.resumePromise = null;
        this._flushPendingSounds();
      });
  }

  _flushPendingSounds() {
    if (!this.pendingSoundQueue.length) {
      return;
    }

    if (!this.context || this.context.state !== 'running') {
      this.pendingSoundQueue.length = 0;
      return;
    }

    const queuedSounds = this.pendingSoundQueue.splice(0);
    queuedSounds.forEach((callback) => {
      this._invokeSoundFunction(callback);
    });
  }

  _invokeSoundFunction(callback) {
    try {
      callback();
    } catch (error) {
      console.warn('Erro ao reproduzir som:', error);
    }
  }

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

    this.safePlay(() => {
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

      const destination = this.getEffectsDestination();
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

  _scheduleBatchedSound(soundType, params = [], options = {}) {
    if (!this.batcher) {
      return false;
    }

    return this.batcher.scheduleSound(soundType, params, options);
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

  _resolveRandom(...candidates) {
    for (const candidate of candidates) {
      if (candidate && typeof candidate.float === 'function') {
        return candidate;
      }
    }

    if (!this._fallbackRandom) {
      if (this.random && typeof this.random.fork === 'function') {
        this._fallbackRandom = this.random.fork('audio-system:fallback-base');
      } else {
        this._fallbackRandom = new RandomService('audio-system:fallback-base');
      }
    }

    return this._fallbackRandom;
  }

  _playLaserShotDirect(params = {}) {
    this.safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

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
    this.safePlay(() => {
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
        this.connectGainNode(gain);

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
    this.safePlay(() => {
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
        this.connectGainNode(gain);

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
    this.safePlay(() => {
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
      const destination = this.getEffectsDestination();
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
          this.randomScopes?.base,
          this.random
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
    this.safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

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
    this.safePlay(() => {
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

      const destination = this.getEffectsDestination();
      if (destination) {
        filter.connect(destination);
      } else {
        // Fallback connection if getEffectsDestination fails
        this.connectGainNode(filter);
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
    this.safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

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
          `[AudioSystem] No direct handler registered for "${soundType}"`
        );
        break;
    }
  }

  playLevelUp() {
    this.safePlay(() => {
      const frequencies = [440, 554, 659, 880, 1108];
      frequencies.forEach((freq, index) => {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();

        osc.connect(gain);
        this.connectGainNode(gain);

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
    this.safePlay(() => {
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
        this.connectGainNode(gain);

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
      this.connectGainNode(bellGain);

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
    this.safePlay(() => {
      const frequencies = [880, 1108, 1318, 1760]; // A5-A6 arpeggio
      frequencies.forEach((freq, index) => {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();

        osc.connect(gain);
        this.connectGainNode(gain);

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
    this.safePlay(() => {
      // First "ka" (percussive)
      const noise = this.context.createOscillator();
      const noiseGain = this.context.createGain();
      noise.connect(noiseGain);
      this.connectGainNode(noiseGain);

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
        this.connectGainNode(gain);

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

  playBossRoar(payload = {}) {
    this._trackPerformance('playBossRoar');

    this.safePlay(() => {
      const config = BOSS_AUDIO_FREQUENCY_PRESETS?.roar;
      if (!config) {
        return;
      }

      const now = this.context.currentTime;
      const duration = config.duration ?? 1.2;
      const sweepStart = config.sweep?.start ?? 90;
      const sweepEnd = config.sweep?.end ?? 150;
      const sweepDuration = config.sweep?.duration ?? duration * 0.6;

      const baseOsc = this.context.createOscillator();
      const baseGain = this.context.createGain();
      const filter = this.context.createBiquadFilter();

      baseOsc.type = 'sawtooth';
      baseOsc.frequency.setValueAtTime(sweepStart, now);
      baseOsc.frequency.linearRampToValueAtTime(sweepEnd, now + sweepDuration);

      filter.type = config.filter?.type || 'lowpass';
      filter.frequency.setValueAtTime(config.filter?.frequency ?? 420, now);

      baseGain.gain.setValueAtTime(0, now);
      baseGain.gain.linearRampToValueAtTime(
        config.attackGain ?? 0.25,
        now + 0.12
      );
      const sustainTime =
        now + Math.max(0.2, duration - (config.releaseDuration ?? 0.5));
      baseGain.gain.linearRampToValueAtTime(
        config.sustainGain ?? 0.18,
        sustainTime
      );
      baseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      baseOsc.connect(filter);
      filter.connect(baseGain);
      this.connectGainNode(baseGain);

      baseOsc.start(now);
      baseOsc.stop(now + duration);

      if (config.vibrato) {
        const vibratoOsc = this.context.createOscillator();
        const vibratoGain = this.context.createGain();
        vibratoOsc.type = 'sine';
        vibratoOsc.frequency.setValueAtTime(config.vibrato.speed ?? 5, now);
        vibratoGain.gain.setValueAtTime(config.vibrato.depth ?? 6, now);
        vibratoOsc.connect(vibratoGain);
        vibratoGain.connect(baseOsc.frequency);
        vibratoOsc.start(now);
        vibratoOsc.stop(now + duration);
      }

      if (Array.isArray(config.harmonics)) {
        config.harmonics.forEach((frequency, index) => {
          const osc = this.context.createOscillator();
          const gain = this.context.createGain();
          const startTime = now + index * 0.05;

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(frequency, startTime);

          gain.gain.setValueAtTime(0, startTime);
          const harmonicGain = (config.sustainGain ?? 0.18) * 0.4;
          gain.gain.linearRampToValueAtTime(harmonicGain, startTime + 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

          osc.connect(gain);
          this.connectGainNode(gain);

          osc.start(startTime);
          osc.stop(now + duration);
        });
      }

      if (config.tail?.frequency) {
        const tailOsc = this.context.createOscillator();
        const tailGain = this.context.createGain();
        const tailStart = now + (config.sweep?.duration ?? duration * 0.6);
        const tailDuration = config.tail.duration ?? 0.5;

        tailOsc.type = 'sine';
        tailOsc.frequency.setValueAtTime(config.tail.frequency, tailStart);

        tailGain.gain.setValueAtTime(0, tailStart);
        tailGain.gain.linearRampToValueAtTime(
          config.tail.gain ?? 0.12,
          tailStart + 0.05
        );
        tailGain.gain.exponentialRampToValueAtTime(
          0.001,
          tailStart + tailDuration
        );

        tailOsc.connect(tailGain);
        this.connectGainNode(tailGain);

        tailOsc.start(tailStart);
        tailOsc.stop(tailStart + tailDuration);
      }
    });
  }

  playBossPhaseChange(payload = {}) {
    this._trackPerformance('playBossPhaseChange');

    this.safePlay(() => {
      const config = BOSS_AUDIO_FREQUENCY_PRESETS?.phaseChange;
      if (!config) {
        return;
      }

      const now = this.context.currentTime;
      const duration = config.duration ?? 0.6;
      const sweepOsc = this.context.createOscillator();
      const sweepGain = this.context.createGain();

      const startFreq = config.sweep?.start ?? 220;
      const endFreq = config.sweep?.end ?? 820;

      sweepOsc.type = 'triangle';
      sweepOsc.frequency.setValueAtTime(startFreq, now);
      sweepOsc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

      sweepGain.gain.setValueAtTime(0, now);
      sweepGain.gain.linearRampToValueAtTime(0.16, now + 0.08);
      sweepGain.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.25);

      sweepOsc.connect(sweepGain);
      this.connectGainNode(sweepGain);

      sweepOsc.start(now);
      sweepOsc.stop(now + duration + 0.25);

      const shimmerConfig = config.shimmer || {};
      if (Array.isArray(shimmerConfig.frequencies)) {
        const spacing = shimmerConfig.spacing ?? 0.08;
        const shimmerDuration = shimmerConfig.duration ?? 0.45;
        const shimmerGainBase = shimmerConfig.gain ?? 0.1;
        const phaseIndex =
          (payload?.phase ?? payload?.nextPhase ?? payload?.newPhase ?? 1) - 1;
        const intensityScale = 1 + Math.max(0, phaseIndex) * 0.12;

        shimmerConfig.frequencies.forEach((frequency, index) => {
          const osc = this.context.createOscillator();
          const gain = this.context.createGain();
          const startTime = now + 0.1 + index * spacing;

          osc.type = 'sine';
          osc.frequency.setValueAtTime(frequency, startTime);

          gain.gain.setValueAtTime(0, startTime);
          gain.gain.linearRampToValueAtTime(
            shimmerGainBase * intensityScale,
            startTime + 0.04
          );
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            startTime + shimmerDuration
          );

          osc.connect(gain);
          this.connectGainNode(gain);

          osc.start(startTime);
          osc.stop(startTime + shimmerDuration);
        });
      }

      if (config.swell?.frequency) {
        const swellOsc = this.context.createOscillator();
        const swellGain = this.context.createGain();
        const swellDuration = config.swell.duration ?? 0.8;

        swellOsc.type = 'sine';
        swellOsc.frequency.setValueAtTime(config.swell.frequency, now);
        swellOsc.frequency.linearRampToValueAtTime(
          config.swell.frequency * 0.75,
          now + swellDuration
        );

        swellGain.gain.setValueAtTime(0, now);
        swellGain.gain.linearRampToValueAtTime(
          config.swell.gain ?? 0.12,
          now + 0.1
        );
        swellGain.gain.exponentialRampToValueAtTime(0.001, now + swellDuration);

        swellOsc.connect(swellGain);
        this.connectGainNode(swellGain);

        swellOsc.start(now);
        swellOsc.stop(now + swellDuration);
      }
    });
  }

  playBossDefeated(payload = {}) {
    this._trackPerformance('playBossDefeated');

    this.safePlay(() => {
      const config = BOSS_AUDIO_FREQUENCY_PRESETS?.defeated;
      if (!config) {
        return;
      }

      const now = this.context.currentTime;

      const fanfare = config.fanfare;
      if (fanfare?.notes?.length) {
        fanfare.notes.forEach((note, index) => {
          const osc = this.context.createOscillator();
          const gain = this.context.createGain();
          const noteDelay = Number.isFinite(note.delay)
            ? note.delay
            : index * 0.18;
          const startTime = now + Math.max(0, noteDelay);
          const noteDuration = note.duration ?? 0.6;

          osc.type = 'sine';
          osc.frequency.setValueAtTime(note.frequency ?? 440, startTime);

          gain.gain.setValueAtTime(0, startTime);
          gain.gain.linearRampToValueAtTime(
            note.gain ?? 0.18,
            startTime + 0.05
          );
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            startTime + Math.max(0.3, noteDuration)
          );

          osc.connect(gain);
          this.connectGainNode(gain);

          osc.start(startTime);
          osc.stop(startTime + Math.max(0.4, noteDuration));
        });

        if (Array.isArray(fanfare.harmony?.frequencies)) {
          const harmonyGain = this.context.createGain();
          const harmonyStart = now + (fanfare.notes[0]?.delay ?? 0);
          const harmonyDuration = fanfare.harmony.duration ?? 1.6;

          harmonyGain.gain.setValueAtTime(0, harmonyStart);
          harmonyGain.gain.linearRampToValueAtTime(
            fanfare.harmony.gain ?? 0.12,
            harmonyStart + 0.2
          );
          harmonyGain.gain.exponentialRampToValueAtTime(
            0.001,
            harmonyStart + harmonyDuration
          );

          this.connectGainNode(harmonyGain);

          fanfare.harmony.frequencies.forEach((frequency) => {
            const osc = this.context.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(frequency, harmonyStart);
            osc.connect(harmonyGain);
            osc.start(harmonyStart);
            osc.stop(harmonyStart + harmonyDuration);
          });
        }
      }

      if (config.choir?.frequency) {
        const choirOsc = this.context.createOscillator();
        const choirGain = this.context.createGain();
        const choirStart = now + 0.2;
        const choirDuration = config.choir.duration ?? 1.8;

        choirOsc.type = 'sawtooth';
        choirOsc.frequency.setValueAtTime(config.choir.frequency, choirStart);
        choirOsc.frequency.linearRampToValueAtTime(
          config.choir.frequency * 0.75,
          choirStart + choirDuration
        );

        choirGain.gain.setValueAtTime(0, choirStart);
        choirGain.gain.linearRampToValueAtTime(
          config.choir.gain ?? 0.08,
          choirStart + 0.25
        );
        choirGain.gain.exponentialRampToValueAtTime(
          0.001,
          choirStart + choirDuration
        );

        choirOsc.connect(choirGain);
        this.connectGainNode(choirGain);

        choirOsc.start(choirStart);
        choirOsc.stop(choirStart + choirDuration);
      }

      if (Array.isArray(config.sparkle?.frequencies)) {
        const spacing = config.sparkle.spacing ?? 0.12;
        const sparkleDuration = config.sparkle.duration ?? 0.5;
        const sparkleGain = config.sparkle.gain ?? 0.08;

        config.sparkle.frequencies.forEach((frequency, index) => {
          const osc = this.context.createOscillator();
          const gain = this.context.createGain();
          const startTime = now + 0.4 + index * spacing;

          osc.type = 'sine';
          osc.frequency.setValueAtTime(frequency, startTime);

          gain.gain.setValueAtTime(0, startTime);
          gain.gain.linearRampToValueAtTime(sparkleGain, startTime + 0.03);
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            startTime + sparkleDuration
          );

          osc.connect(gain);
          this.connectGainNode(gain);

          osc.start(startTime);
          osc.stop(startTime + sparkleDuration);
        });
      }
    });
  }

  playBulletHit(killed = false) {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

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
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

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

  playShieldActivate() {
    this.safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

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
    this.safePlay(() => {
      // [NEO-ARCADE AUDIO] Punchy Blaster Shot
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

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

  playShieldBreak() {
    this.safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

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
    this.safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

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
    this.safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

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

    this.safePlay(() => {
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
            this.randomScopes.base,
            this.random
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
      this.connectGainNode(noiseGain);

      osc.connect(oscGain);
      this.connectGainNode(oscGain);

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

  _createRandomScopes(baseRandom) {
    const canFork = baseRandom && typeof baseRandom.fork === 'function';
    if (!canFork) {
      return {
        base: baseRandom,
        cache: null,
        families: {},
        bufferFamilies: {},
        batcher: null,
      };
    }

    const supportsSnapshot =
      typeof baseRandom?.debugSnapshot === 'function' &&
      typeof baseRandom?.restore === 'function';
    const snapshot = supportsSnapshot ? baseRandom.debugSnapshot() : null;

    let families = {};
    let cacheRandom = null;
    let bufferFamilies = {};
    let batcherRandom = null;

    try {
      families = {
        laser: baseRandom.fork('audio:family:laser'),
        explosion: baseRandom.fork('audio:family:explosion'),
        shield: baseRandom.fork('audio:family:shield'),
        asteroid: baseRandom.fork('audio:family:asteroid'),
        xp: baseRandom.fork('audio:family:xp'),
        impact: baseRandom.fork('audio:family:impact'),
        music: baseRandom.fork('audio:family:music'),
        ui: baseRandom.fork('audio:family:ui'),
        uiHover: baseRandom.fork('audio:family:ui:hover'),
        uiSelect: baseRandom.fork('audio:family:ui:select'),
        uiStartGame: baseRandom.fork('audio:family:ui:startgame'),
        thruster: baseRandom.fork('audio:family:thruster'),
        thrusterMain: baseRandom.fork('audio:family:thruster:main'),
        thrusterRetro: baseRandom.fork('audio:family:thruster:retro'),
        thrusterSide: baseRandom.fork('audio:family:thruster:side'),
      };

      cacheRandom = baseRandom.fork('audio:cache');
      batcherRandom = baseRandom.fork('audio:batcher');

      bufferFamilies = Object.fromEntries(
        Object.entries({
          ...families,
          generic: cacheRandom,
        }).map(([name, rng]) => [
          name,
          rng && typeof rng.fork === 'function'
            ? rng.fork(`audio:buffer:${name}`)
            : null,
        ])
      );
    } finally {
      if (snapshot) {
        try {
          baseRandom.restore(snapshot);
        } catch (error) {
          console.warn(
            '[Audio] Failed to restore base RNG state after creating audio scopes:',
            error
          );
        }
      }
    }

    return {
      base: baseRandom,
      cache: cacheRandom,
      families,
      bufferFamilies,
      batcher: batcherRandom,
    };
  }

  captureRandomScopes({ refreshForks = false } = {}) {
    if (!this.random) {
      return null;
    }

    if (!this.randomScopes || refreshForks) {
      const refreshed = this._createRandomScopes(this.random);
      this.randomScopes = {
        ...refreshed,
        seeds: this.randomScopes?.seeds ?? null,
        cacheSnapshot: this.randomScopes?.cacheSnapshot ?? null,
        batcherSnapshot: this.randomScopes?.batcherSnapshot ?? null,
      };
    }

    if (refreshForks) {
      if (this.cache) {
        this.cache.random = this.randomScopes.cache;
        if (typeof this.cache.clearCache === 'function') {
          this.cache.clearCache('all');
        }
        if (typeof this.cache.resetStats === 'function') {
          this.cache.resetStats();
        }
      }

      if (this.batcher) {
        this.batcher.random = this.randomScopes.batcher;
        if (typeof this.batcher._initializeRandomForks === 'function') {
          this.batcher.randomForks = this.batcher._initializeRandomForks(
            this.randomScopes.batcher
          );
        }
        if (typeof this.batcher.resetStats === 'function') {
          this.batcher.resetStats();
        }
      }
    }

    const seeds = {
      base:
        typeof this.random.seed === 'number' ? this.random.seed >>> 0 : null,
      cache:
        this.randomScopes?.cache &&
        typeof this.randomScopes.cache.seed === 'number'
          ? this.randomScopes.cache.seed >>> 0
          : null,
      batcher:
        this.randomScopes?.batcher &&
        typeof this.randomScopes.batcher.seed === 'number'
          ? this.randomScopes.batcher.seed >>> 0
          : null,
      families: {},
      bufferFamilies: {},
    };

    Object.entries(this.randomScopes?.families || {}).forEach(([name, rng]) => {
      seeds.families[name] =
        rng && typeof rng.seed === 'number' ? rng.seed >>> 0 : null;
    });

    Object.entries(this.randomScopes?.bufferFamilies || {}).forEach(
      ([name, rng]) => {
        seeds.bufferFamilies[name] =
          rng && typeof rng.seed === 'number' ? rng.seed >>> 0 : null;
      }
    );

    this.randomScopes.seeds = seeds;

    if (this.cache && typeof this.cache.captureNoiseSeeds === 'function') {
      this.randomScopes.cacheSnapshot = this.cache.captureNoiseSeeds();
    }

    if (
      this.batcher &&
      typeof this.batcher.captureRandomForkSeeds === 'function'
    ) {
      this.randomScopes.batcherSnapshot = this.batcher.captureRandomForkSeeds();
    }

    this._exposeRandomDebugControls();
    return { ...seeds };
  }

  reseedRandomScopes({ refreshForks = false } = {}) {
    if (!this.random) {
      return null;
    }

    if (!this.randomScopes || refreshForks) {
      this.captureRandomScopes({ refreshForks: true });
    }

    if (!this.randomScopes?.seeds) {
      this.captureRandomScopes();
    }

    const seeds = this.randomScopes?.seeds;
    if (!seeds) {
      return null;
    }

    const applySeed = (rng, seed) => {
      if (rng && typeof rng.reset === 'function' && typeof seed === 'number') {
        rng.reset(seed);
      }
    };

    const canPreserveBaseState =
      typeof this.random?.debugSnapshot === 'function' &&
      typeof this.random?.restore === 'function';
    const baseSnapshot = canPreserveBaseState
      ? this.random.debugSnapshot()
      : null;

    try {
      applySeed(this.randomScopes?.cache, seeds.cache);
      applySeed(this.randomScopes?.batcher, seeds.batcher);

      Object.entries(this.randomScopes?.families || {}).forEach(
        ([name, rng]) => {
          applySeed(rng, seeds.families?.[name]);
        }
      );

      Object.entries(this.randomScopes?.bufferFamilies || {}).forEach(
        ([name, rng]) => {
          applySeed(rng, seeds.bufferFamilies?.[name]);
        }
      );

      if (this.cache) {
        this.cache.random = this.randomScopes?.cache || this.cache.random;
        if (typeof this.cache.reseedNoiseGenerators === 'function') {
          this.cache.reseedNoiseGenerators(this.randomScopes?.cacheSnapshot);
        }
      }

      if (this.batcher) {
        this.batcher.random = this.randomScopes?.batcher || this.batcher.random;
        if (
          refreshForks &&
          typeof this.batcher._initializeRandomForks === 'function'
        ) {
          this.batcher.randomForks = this.batcher._initializeRandomForks(
            this.batcher.random
          );
        }
        if (typeof this.batcher.reseedRandomForks === 'function') {
          this.batcher.reseedRandomForks();
        }
      }
    } finally {
      if (baseSnapshot) {
        try {
          this.random.restore(baseSnapshot);
        } catch (error) {
          console.warn(
            '[Audio] Failed to restore base RNG state after reseeding audio scopes:',
            error
          );
        }
      }
    }

    this.captureRandomScopes();
    return { ...seeds };
  }

  _exposeRandomDebugControls() {
    if (typeof window === 'undefined') {
      return;
    }

    if (
      typeof process !== 'undefined' &&
      process.env &&
      process.env.NODE_ENV !== 'development'
    ) {
      return;
    }

    const debugData = {
      seed: this.random?.seed ?? null,
      debugSnapshot: () => this.random?.debugSnapshot(),
      forks: {},
      seeds: this.randomScopes?.seeds || null,
    };

    Object.entries(this.randomScopes?.families || {}).forEach(([name, rng]) => {
      debugData.forks[name] = {
        seed: rng?.seed ?? null,
        debugSnapshot: () => rng?.debugSnapshot(),
      };
    });

    if (!debugData.forks.cache && this.randomScopes?.cache) {
      debugData.forks.cache = {
        seed: this.randomScopes.cache.seed ?? null,
        debugSnapshot: () => this.randomScopes.cache.debugSnapshot(),
      };
    }

    window.__AUDIO_RANDOM_DEBUG__ = debugData;
  }

  // === UI Sound Effects ===

  /**
   * Play upgrade selection sound - pitch varies by rarity
   */
  playUpgradeSelect(rarity = 'common') {
    const frequencies = {
      common: 440, // A4
      uncommon: 554, // C#5
      rare: 659, // E5
      epic: 784, // G5
    };

    const freq = frequencies[rarity] || 440;

    this.safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();
      const filter = this.context.createBiquadFilter();

      // Chain: Osc -> Gain -> Filter -> Out
      osc.connect(gain);
      gain.connect(filter);
      this.connectGainNode(filter);

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

  /**
   * Play button click sound - quick blip
   * @deprecated Use playUISelect() instead
   */
  playButtonClick() {
    this.playUISelect(); // Redirect to the new high-quality handler
  }

  /**
   * Play pause menu open sound - descending "dum" (Optimized)
   */
  playPauseOpen() {
    this.safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();
      const filter = this.context.createBiquadFilter();

      osc.connect(gain);
      gain.connect(filter);
      this.connectGainNode(filter);

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

  /**
   * Play pause menu close sound - ascending "boop"
   */
  /**
   * Play pause menu close sound - ascending "boop" (Optimized)
   */
  playPauseClose() {
    this.safePlay(() => {
      const osc = this.pool
        ? this.pool.getOscillator()
        : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

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

  /**
   * Play menu transition sound - soft glassy swipe
   */
  playMenuTransition() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      const filter = this.context.createBiquadFilter();

      // Chain: Osc -> Gain -> Filter -> Out
      osc.connect(gain);
      gain.connect(filter);
      this.connectGainNode(filter);

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

  /**
   * Play low health warning sound - urgent alarm
   */
  /**
   * Play low health warning sound - urgent alarm
   */
  playLowHealthWarning() {
    this.safePlay(() => {
      const now = this.context.currentTime;

      // Two-tone alarm pattern - Triangle waves for less harshness
      for (let i = 0; i < 2; i++) {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        const filter = this.context.createBiquadFilter();

        osc.connect(gain);
        gain.connect(filter);
        this.connectGainNode(filter);

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

  /**
   * Play UI hover sound - Extremely subtle "tick" for presence
   * Non-intrusive, low volume, filtered high end
   */
  playUIHover() {
    // No tracking needed for such freq event
    this.safePlay(() => {
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

      const destination = this.getEffectsDestination();
      if (destination) {
        filter.connect(destination);
      } else {
        this.connectGainNode(filter);
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

  /**
   * Play UI select/confirm sound - "Glassy" tech click
   * Replaces the harsh "beep" with a polished tone
   */
  playUISelect() {
    this._trackPerformance('playUISelect');
    this.safePlay(() => {
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

      const destination = this.getEffectsDestination();
      if (destination) {
        filter.connect(destination);
      } else {
        this.connectGainNode(filter);
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

  /**
   * Play UI start game sound - ascending ping + whoosh with delay-based reverb
   * 2 variations, 300-450ms, creates sense of space and excitement
   */
  playUIStartGame() {
    this._trackPerformance('playUIStartGame');
    this.safePlay(() => {
      const randomScope = this.randomScopes.families.uiStartGame;
      if (!randomScope) {
        console.warn(
          '[AudioSystem] playUIStartGame: uiStartGame random scope not available'
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
      this.connectGainNode(delayGain);

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
      this.connectGainNode(masterGain);

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
            console.warn('[AudioSystem] Cleanup error in playUIStartGame:', e);
          }
        },
        duration * 1000 + 200
      );
    });
  }

  // === THRUSTER SOUNDS ===

  /**
   * Handles thruster-effect events from PlayerSystem
   * Manages start→loop→stop lifecycle based on intensity changes
   * Uses timestamp-based inactivity detection to stop loops
   * Distinguishes between manual and automatic thrusters
   */
  handleThrusterEffect(data) {
    if (!this.initialized || !this.context) return;

    const { type, intensity, isAutomatic } = data;
    if (!type || typeof intensity !== 'number') return;

    // Map PlayerSystem event types to internal thruster keys
    // PlayerSystem emits: 'main', 'aux' (braking), 'side'
    let thrusterKey = type;
    if (type === 'aux') {
      thrusterKey = 'retro'; // Aux thruster = retro/braking thruster
    }

    const currentIntensity = intensity;
    const lastIntensity = this.thrusterState.lastIntensity[thrusterKey] || 0;
    const isActive = this.thrusterLoopManager.isActive(thrusterKey);
    const now = performance.now();

    // Update last event time
    this.thrusterState.lastEventTime[thrusterKey] = now;

    // State machine: determine action based on intensity thresholds
    if (currentIntensity > this.thrusterState.startThreshold && !isActive) {
      // START: intensity crossed start threshold and loop not active
      this._startThrusterSound(
        thrusterKey,
        currentIntensity,
        isAutomatic || false
      );
    } else if (
      currentIntensity > this.thrusterState.stopThreshold &&
      isActive
    ) {
      // UPDATE: intensity changed but still above stop threshold
      this._updateThrusterSound(thrusterKey, currentIntensity);
    } else if (
      currentIntensity <= this.thrusterState.stopThreshold &&
      isActive
    ) {
      // STOP: intensity dropped below stop threshold (hysteresis)
      this._stopThrusterSound(thrusterKey);
    }

    // Update last intensity
    this.thrusterState.lastIntensity[thrusterKey] = currentIntensity;
  }

  /**
   * Starts thruster sound (plays start burst + begins loop)
   * @param {string} type - Thruster type
   * @param {number} intensity - Intensity 0-1
   * @param {boolean} isAutomatic - If true, skip burst (auto-damping thrusters)
   */
  _startThrusterSound(type, intensity, isAutomatic = false) {
    this._trackPerformance(`_startThrusterSound:${type}`);

    // For automatic damping thrusters: skip burst, go straight to loop with lower volume
    if (isAutomatic) {
      // Immediate loop start, no burst
      const randomScope = this._getThrusterRandomScope(type);
      const variation = Math.floor(
        randomScope?.range ? randomScope.range(0, 3) : Math.random() * 3
      );

      // Reduce intensity for automatic thrusters (softer spray sound)
      const autoIntensity = intensity * 0.4; // 60% reduction for subtle auto-damping

      this.thrusterLoopManager.startLoop(
        type,
        variation,
        autoIntensity,
        this.context,
        this.pool,
        this.cache,
        randomScope,
        (node) => this.connectGainNode(node)
      );
      return;
    }

    // Manual thrusters: play burst then loop
    this._playThrusterStartBurst(type);

    // Then start continuous loop after a short delay
    setTimeout(
      () => {
        if (!this.initialized || !this.context) return;

        const randomScope = this._getThrusterRandomScope(type);
        const variation = Math.floor(
          randomScope?.range ? randomScope.range(0, 3) : Math.random() * 3
        );

        this.thrusterLoopManager.startLoop(
          type,
          variation,
          intensity,
          this.context,
          this.pool,
          this.cache,
          randomScope,
          (node) => this.connectGainNode(node)
        );
      },
      type === 'side' ? 80 : type === 'retro' ? 140 : 160
    ); // Delay ajustado para burst mais longo
  }

  /**
   * Updates thruster loop intensity
   */
  _updateThrusterSound(type, intensity) {
    this.thrusterLoopManager.updateLoop(type, intensity);
  }

  /**
   * Stops thruster sound (plays stop release + ends loop)
   * @param {string} type - Thruster type
   * @param {boolean} skipRelease - If true, skip release sound (for automatic thrusters)
   */
  _stopThrusterSound(type, skipRelease = false) {
    this._trackPerformance(`_stopThrusterSound:${type}`);

    // Stop loop first
    this.thrusterLoopManager.stopLoop(type, this.pool);

    // Play stop release sound only for manual thrusters
    if (!skipRelease) {
      this._playThrusterStopRelease(type);
    }
  }

  /**
   * Plays thruster start burst sound
   */
  _playThrusterStartBurst(type) {
    this.safePlay(() => {
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
      this.connectGainNode(lpf);

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

  /**
   * Plays thruster stop release sound
   * Ajustado para ser muito mais suave, grave e sutil (como um suspiro)
   */
  _playThrusterStopRelease(type) {
    this.safePlay(() => {
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
      this.connectGainNode(lpf);

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

  /**
   * Gets the appropriate random scope for a thruster type
   */
  _getThrusterRandomScope(type) {
    if (type === 'main') {
      return (
        this.randomScopes?.families?.thrusterMain ||
        this.randomScopes?.families?.thruster ||
        this.randomScopes?.base
      );
    } else if (type === 'retro') {
      return (
        this.randomScopes?.families?.thrusterRetro ||
        this.randomScopes?.families?.thruster ||
        this.randomScopes?.base
      );
    } else {
      // side
      return (
        this.randomScopes?.families?.thrusterSide ||
        this.randomScopes?.families?.thruster ||
        this.randomScopes?.base
      );
    }
  }

  /**
   * Starts interval to check for thruster inactivity
   * Stops loops that haven't received events within timeout period
   */
  _startThrusterInactivityChecker() {
    if (this.thrusterInactivityCheckInterval) {
      clearInterval(this.thrusterInactivityCheckInterval);
    }

    // Check every 50ms
    this.thrusterInactivityCheckInterval = setInterval(() => {
      this._checkThrusterInactivity();
    }, 50);
  }

  /**
   * Checks if any active thruster loops have timed out due to inactivity
   * Stops loops that haven't received events in the last 150ms
   */
  _checkThrusterInactivity() {
    if (!this.initialized || !this.thrusterLoopManager) return;

    const now = performance.now();
    const timeout = this.thrusterState.inactivityTimeout;

    // Check each thruster type
    ['main', 'retro', 'side'].forEach((type) => {
      const isActive = this.thrusterLoopManager.isActive(type);
      if (!isActive) return;

      const lastEventTime = this.thrusterState.lastEventTime[type] || 0;
      const timeSinceLastEvent = now - lastEventTime;

      // If no event received within timeout period, stop the loop
      // Skip release sound since this is typically automatic damping
      if (timeSinceLastEvent > timeout) {
        this._stopThrusterSound(type, true); // skipRelease = true
      }
    });
  }

  reset() {
    // Cleanup optimization systems
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

    // Cleanup thruster loops
    if (this.thrusterLoopManager) {
      this.thrusterLoopManager.cleanup(this.pool);
    }
    if (this.thrusterInactivityCheckInterval) {
      clearInterval(this.thrusterInactivityCheckInterval);
      this.thrusterInactivityCheckInterval = null;
    }
    if (this.thrusterState) {
      this.thrusterState.lastIntensity = { main: 0, retro: 0, side: 0 };
      this.thrusterState.lastEventTime = { main: 0, retro: 0, side: 0 };
    }

    // Reset performance monitoring
    this._resetPerformanceMonitoring();

    // Clear pending playback queue
    this.pendingSoundQueue.length = 0;
    this.resumePromise = null;

    if (this.musicController.relaxTimeout) {
      clearTimeout(this.musicController.relaxTimeout);
      this.musicController.relaxTimeout = null;
    }

    this.musicController.bossActive = false;
    this.bossAudioState.lastPhase = null;

    const initialIntensityLevel =
      typeof MUSIC_LAYER_CONFIG?.initialIntensity === 'number'
        ? MUSIC_LAYER_CONFIG.initialIntensity
        : 0;

    this.setMusicIntensity(initialIntensityLevel, { immediate: true });

    this.reseedRandomScopes();
  }

  // === Performance Monitoring ===

  /**
   * Inicia o sistema de monitoramento de performance
   */
  _startPerformanceMonitoring() {
    if (!this.performanceMonitor.enabled) return;

    // Update performance stats every second
    setInterval(() => {
      this._updatePerformanceStats();
    }, 1000);
  }

  /**
   * Tracked de chamadas de áudio para performance
   */
  _trackPerformance(methodName) {
    if (!this.performanceMonitor.enabled) return;

    this.performanceMonitor.audioCallsPerFrame++;
    this.performanceMonitor.totalAudioCalls++;
  }

  /**
   * Atualiza estatísticas de performance
   */
  _updatePerformanceStats() {
    const now = performance.now();
    const deltaTime = now - this.performanceMonitor.lastFrameTime;

    if (deltaTime >= 1000) {
      // Update every second
      this.performanceMonitor.frameCount++;

      // Calculate average calls per frame
      const avgCalls = this.performanceMonitor.audioCallsPerFrame;
      this.performanceMonitor.averageCallsPerFrame =
        (this.performanceMonitor.averageCallsPerFrame + avgCalls) / 2;

      // Track peak calls
      if (avgCalls > this.performanceMonitor.peakCallsPerFrame) {
        this.performanceMonitor.peakCallsPerFrame = avgCalls;
      }

      // Reset frame counters
      this.performanceMonitor.audioCallsPerFrame = 0;
      this.performanceMonitor.lastFrameTime = now;

      // Log performance periodically (every 10 seconds)
      if (this.performanceMonitor.frameCount % 10 === 0) {
        this._logPerformanceStats();
      }
    }
  }

  /**
   * Log de estatísticas de performance
   */
  _logPerformanceStats() {
    if (!this.performanceMonitor.enabled) return;

    const poolStats = this.pool ? this.pool.getStats() : null;
    const cacheStats = this.cache ? this.cache.getStats() : null;
    const batcherStats = this.batcher ? this.batcher.getStats() : null;

    console.log('[AudioSystem] Performance Stats:', {
      totalAudioCalls: this.performanceMonitor.totalAudioCalls,
      averageCallsPerFrame:
        this.performanceMonitor.averageCallsPerFrame.toFixed(1),
      peakCallsPerFrame: this.performanceMonitor.peakCallsPerFrame,
      pool: poolStats,
      cache: cacheStats,
      batcher: batcherStats,
    });
  }

  /**
   * Reset de monitoramento de performance
   */
  _resetPerformanceMonitoring() {
    this.performanceMonitor = {
      enabled: true,
      frameCount: 0,
      audioCallsPerFrame: 0,
      averageCallsPerFrame: 0,
      peakCallsPerFrame: 0,
      lastFrameTime: performance.now(),
      totalAudioCalls: 0,
    };

    if (this.pool) this.pool.resetStats();
    if (this.cache) this.cache.resetStats();
    if (this.batcher) this.batcher.resetStats();
  }

  // === Public API for Performance ===

  /**
   * Obtém estatísticas completas do sistema de áudio
   */
  getPerformanceStats() {
    return {
      performance: { ...this.performanceMonitor },
      pool: this.pool ? this.pool.getStats() : null,
      cache: this.cache ? this.cache.getStats() : null,
      batcher: this.batcher ? this.batcher.getStats() : null,
      optimizationsEnabled: {
        pooling: !!this.pool,
        caching: !!this.cache,
        batching: !!this.batcher,
      },
    };
  }

  /**
   * Enable/disable performance monitoring
   */
  setPerformanceMonitoring(enabled) {
    this.performanceMonitor.enabled = enabled;
    if (!enabled) {
      this._resetPerformanceMonitoring();
    }
  }

  /**
   * Força flush de todos os batches pendentes
   */
  flushAudioBatches() {
    if (this.batcher) {
      this.batcher.flushPendingBatches();
    }
  }
}

export default AudioSystem;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioSystem;
}
