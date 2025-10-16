import AudioPool from './AudioPool.js';
import AudioCache from './AudioCache.js';
import AudioBatcher from './AudioBatcher.js';
import RandomService from '../core/RandomService.js';
import { normalizeDependencies, resolveService } from '../core/serviceUtils.js';
import {
  BOSS_AUDIO_FREQUENCY_PRESETS,
  MUSIC_LAYER_CONFIG,
  WAVE_BOSS_INTERVAL,
} from '../core/GameConstants.js';

class AudioSystem {
  constructor(dependencies = {}) {
    this.dependencies = normalizeDependencies(dependencies);
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
      totalAudioCalls: 0
    };

    // AudioContext resume coordination
    this.resumePromise = null;
    this.pendingSoundQueue = [];

    // Low health warning state
    this.lowHealthWarning = false;

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

    if (typeof gameServices !== 'undefined') {
      gameServices.register('audio', this);
    }

    this.captureRandomScopes();
    this.setupEventListeners();
    this.bootstrapSettings();
    this._exposeRandomDebugControls();
    console.log('[AudioSystem] Initialized');
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

      console.log('[AudioSystem] Fully initialized with optimizations');
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
    if (typeof gameEvents === 'undefined') return;

    gameEvents.on('settings-audio-changed', (payload = {}) => {
      if (payload?.values) {
        this.updateVolumeState(payload.values);
      }
    });

    gameEvents.on('weapon-fired', (data) => {
      this.playLaserShot(data || {});
    });

    gameEvents.on('combat-target-lock', (data) => {
      if (data?.lost) {
        return;
      }
      this.playTargetLock(data || {});
    });

    gameEvents.on('enemy-destroyed', (data) => {
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

    gameEvents.on('asteroid-volatile-exploded', () => {
      this.playBigExplosion();
    });

    gameEvents.on('player-leveled-up', () => {
      this.playLevelUp();
    });

    gameEvents.on('xp-collected', () => {
      // All orbs play same sound (all are tier 1 blue)
      this.playXPCollect();
    });

    gameEvents.on('xp-orb-fused', (data) => {
      // Play fusion sound based on tier
      this.playOrbFusion(data?.toClass);
    });

    gameEvents.on('enemy-spawned', (data) => {
      // Special sound for Gold spawn
      if (data?.enemy?.variant === 'gold') {
        this.playGoldSpawn();
      }
    });

    // Enemy modules fire projectiles/explosions exclusively through events so
    // the audio layer can orchestrate batching and pooling.
    gameEvents.on('enemy-fired', (data = {}) => {
      const enemyType = (data?.enemyType || data?.enemy?.type || '').toLowerCase();

      if (enemyType === 'drone') {
        this.playDroneFire(data);
        return;
      }

      if (enemyType === 'hunter') {
        this.playHunterBurst(data);
        return;
      }
    });

    gameEvents.on('wave-started', (waveEvent = {}) => {
      this.updateWaveMusicIntensity(waveEvent);
    });

    gameEvents.on('mine-exploded', (data = {}) => {
      this.playMineExplosion(data);
    });

    gameEvents.on('boss-spawned', (data = {}) => {
      this.playBossRoar(data);
      this._onBossFightStarted(data);
    });

    gameEvents.on('boss-phase-changed', (data = {}) => {
      this.playBossPhaseChange(data);
      this._onBossPhaseChanged(data);
    });

    gameEvents.on('boss-defeated', (data = {}) => {
      this.playBossDefeated(data);
      this._onBossDefeated(data);
    });

    gameEvents.on('bullet-hit', (data) => {
      // Play hit confirm sound
      this.playBulletHit(data?.killed || false);
    });

    gameEvents.on('player-took-damage', () => {
      this.playShipHit();
    });

    gameEvents.on('shield-activated', () => {
      this.playShieldActivate();
    });

    gameEvents.on('shield-hit', () => {
      this.playShieldImpact();
    });

    gameEvents.on('shield-broken', () => {
      this.playShieldBreak();
    });

    gameEvents.on('shield-recharged', () => {
      this.playShieldRecharged();
    });

    gameEvents.on('shield-activation-failed', () => {
      this.playShieldFail();
    });

    gameEvents.on('shield-shockwave', () => {
      this.playShieldShockwave();
    });

    // UI Sound Effects
    gameEvents.on('upgrade-applied', (data) => {
      this.playUpgradeSelect(data?.rarity || 'common');
    });

    gameEvents.on('pause-state-changed', (data) => {
      if (data?.isPaused) {
        this.playPauseOpen();
      } else {
        this.playPauseClose();
      }
    });

    gameEvents.on('screen-changed', () => {
      this.playMenuTransition();
    });

    gameEvents.on('input-confirmed', () => {
      this.playButtonClick();
    });

    // Low health warning
    gameEvents.on('player-health-changed', (data) => {
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

    let wavesPerStep = Number.isFinite(configuredStep)
      ? configuredStep
      : null;

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
          filterNode.Q.setValueAtTime(
            Math.max(0.0001, filterConfig.Q),
            now
          );
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

      if (depthMultiplier > 0 && typeof this.context.createOscillator === 'function') {
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
        gainNode.gain.linearRampToValueAtTime(
          targetGain,
          now + rampDuration
        );
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
    if (!this.initialized || !this.context || typeof soundFunction !== 'function') {
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
    if (!this.context || this.context.state === 'running' || this.resumePromise) {
      return;
    }

    this.resumePromise = this.context.resume()
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
        [
          Math.round(params.pitchMultiplier * 1000),
          params.lockCount,
        ],
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
      enemyType: (data?.enemyType || data?.enemy?.type || 'drone').toLowerCase(),
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
      enemyType: (data?.enemyType || data?.enemy?.type || 'hunter').toLowerCase(),
    };
  }

  _normalizeMineExplosionOptions(data = {}) {
    const radius = Number(data?.radius);
    const damage = Number(data?.damage);
    const normalizedRadius = Number.isFinite(radius) ? radius : 120;
    const normalizedDamage = Number.isFinite(damage) ? damage : 40;

    const intensityBase =
      normalizedRadius / 160 + normalizedDamage / 140;
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
      this._scheduleBatchedSound(
        'playTargetLock',
        [lockCount],
        { allowOverlap: false, priority: 2 }
      )
    ) {
      return;
    }

    this._playTargetLockDirect({ lockCount });
  }

  playAsteroidBreak(size) {
    this._trackPerformance('playAsteroidBreak');

    if (this._scheduleBatchedSound('playAsteroidBreak', [size], { allowOverlap: false, priority: 2 })) {
      return;
    }

    this._playAsteroidBreakDirect(size);
  }

  playBigExplosion() {
    this._trackPerformance('playBigExplosion');

    this.safePlay(() => {
      const osc = this.pool ? this.pool.getOscillator() : this.context.createOscillator();
      const oscGain = this.pool ? this.pool.getGain() : this.context.createGain();
      osc.connect(oscGain);
      const destination = this.getEffectsDestination();
      if (destination) {
        oscGain.connect(destination);
      }

      // Use cached noise buffer if available
      let noiseBuffer;
      if (this.cache) {
        noiseBuffer = this.cache.getNoiseBuffer(0.5, true, 'exponential', {
          family: 'explosion',
          random: this.randomScopes.bufferFamilies.explosion,
        });
      } else {
        // Fallback to creating buffer
        const bufferSize = this.context.sampleRate * 0.5;
        noiseBuffer = this.context.createBuffer(
          1,
          bufferSize,
          this.context.sampleRate
        );
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          const bufferRandom =
            this.randomScopes.bufferFamilies.explosion ||
            this.randomScopes.families.explosion ||
            this.randomScopes.base ||
            null;
          const rng = this._resolveRandom(
            bufferRandom,
            this.randomScopes.base,
            this.random
          );
          const sample =
            typeof rng.range === 'function'
              ? rng.range(-1, 1)
              : rng.float() * 2 - 1;
          output[i] = sample;
        }
      }

      const noise = this.pool ? this.pool.getBufferSource() : this.context.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = this.pool ? this.pool.getGain() : this.context.createGain();
      noise.connect(noiseGain);
      if (destination) {
        noiseGain.connect(destination);
      }

      const now = this.context.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);

      oscGain.gain.setValueAtTime(0.2, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      noiseGain.gain.setValueAtTime(0.5, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.start(now);
      osc.stop(now + 0.5);

      noise.start(now);
      noise.stop(now + 0.4);

      // Return gains to pool after use if using pool
      if (this.pool) {
        setTimeout(() => {
          this.pool.returnGain(oscGain);
          this.pool.returnGain(noiseGain);
        }, 510);
      }
    });
  }

  playXPCollect() {
    this._trackPerformance('playXPCollect');

    if (this._scheduleBatchedSound('playXPCollect', [], { allowOverlap: true, priority: 1 })) {
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
    const normalizedType = typeof enemyType === 'string' ? enemyType.toLowerCase() : '';
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
      const osc = this.pool ? this.pool.getOscillator() : this.context.createOscillator();
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
          setTimeout(() => {
            this.pool.returnGain(gain);
          }, (voiceStart + duration - now) * 1000 + 20);
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
          setTimeout(() => {
            this.pool.returnGain(gain);
          }, (shotStart + duration - now) * 1000 + 20);
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
            typeof rng.range === 'function' ? rng.range(-1, 1) : rng.float() * 2 - 1;
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
        setTimeout(() => {
          this.pool.returnGain(rumbleGain);
          this.pool.returnGain(noiseGain);
        }, duration * 1000 + 40);
      }
    });
  }

  _playTargetLockDirect(params = {}) {
    this.safePlay(() => {
      const osc = this.pool ? this.pool.getOscillator() : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

      const lockCount = Math.max(1, Math.floor(params.lockCount || 1));
      const baseFrequency = 720;
      const frequency = Math.min(1200, baseFrequency * (1 + (lockCount - 1) * 0.12));
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
      const baseFreq = size === 'large' ? 70 : size === 'medium' ? 110 : 150;
      const duration =
        size === 'large' ? 0.35 : size === 'medium' ? 0.25 : 0.18;

      const osc = this.pool ? this.pool.getOscillator() : this.context.createOscillator();
      const gain = this.pool ? this.pool.getGain() : this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(baseFreq, this.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        baseFreq * 0.4,
        this.context.currentTime + duration
      );

      gain.gain.setValueAtTime(0.15, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.context.currentTime + duration
      );

      osc.start();
      osc.stop(this.context.currentTime + duration);

      if (this.pool) {
        setTimeout(() => {
          this.pool.returnGain(gain);
        }, duration * 1000 + 10);
      }
    });
  }

  _playXPCollectDirect() {
    this.safePlay(() => {
      const osc = this.pool ? this.pool.getOscillator() : this.context.createOscillator();
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
        console.warn(`[AudioSystem] No direct handler registered for "${soundType}"`);
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
        'xp-green': 523,    // C5 (tier 2)
        'xp-yellow': 659,   // E5 (tier 3)
        'xp-purple': 784,   // G5 (tier 4)
        'xp-red': 988,      // B5 (tier 5)
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
      noiseGain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.05);

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
      baseOsc.frequency.linearRampToValueAtTime(
        sweepEnd,
        now + sweepDuration
      );

      filter.type = config.filter?.type || 'lowpass';
      filter.frequency.setValueAtTime(config.filter?.frequency ?? 420, now);

      baseGain.gain.setValueAtTime(0, now);
      baseGain.gain.linearRampToValueAtTime(
        config.attackGain ?? 0.25,
        now + 0.12
      );
      const sustainTime = now + Math.max(0.2, duration - (config.releaseDuration ?? 0.5));
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
        vibratoOsc.frequency.setValueAtTime(
          config.vibrato.speed ?? 5,
          now
        );
        vibratoGain.gain.setValueAtTime(
          config.vibrato.depth ?? 6,
          now
        );
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
          gain.gain.linearRampToValueAtTime(
            harmonicGain,
            startTime + 0.1
          );
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
      sweepOsc.frequency.exponentialRampToValueAtTime(
        endFreq,
        now + duration
      );

      sweepGain.gain.setValueAtTime(0, now);
      sweepGain.gain.linearRampToValueAtTime(0.16, now + 0.08);
      sweepGain.gain.exponentialRampToValueAtTime(
        0.001,
        now + duration + 0.25
      );

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
        swellGain.gain.exponentialRampToValueAtTime(
          0.001,
          now + swellDuration
        );

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
          osc.frequency.setValueAtTime(
            note.frequency ?? 440,
            startTime
          );

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
        choirOsc.frequency.setValueAtTime(
          config.choir.frequency,
          choirStart
        );
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
          gain.gain.linearRampToValueAtTime(
            sparkleGain,
            startTime + 0.03
          );
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
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

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
    });
  }

  playShieldImpact() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

      const now = this.context.currentTime;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.1);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.start(now);
      osc.stop(now + 0.12);
    });
  }

  playShieldBreak() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

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
    });
  }

  playShieldRecharged() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

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
    });
  }

  playShieldFail() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

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

      const noise = this.pool ? this.pool.getBufferSource() : this.context.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = this.pool ? this.pool.getGain() : this.context.createGain();

      const osc = this.pool ? this.pool.getOscillator() : this.context.createOscillator();
      const oscGain = this.pool ? this.pool.getGain() : this.context.createGain();

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
      if (
        rng &&
        typeof rng.reset === 'function' &&
        typeof seed === 'number'
      ) {
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

      Object.entries(this.randomScopes?.families || {}).forEach(([name, rng]) => {
        applySeed(rng, seeds.families?.[name]);
      });

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
      'common': 440,      // A4
      'uncommon': 554,    // C#5
      'rare': 659,        // E5
      'epic': 784         // G5
    };

    const freq = frequencies[rarity] || 440;

    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

      const now = this.context.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.15);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.start(now);
      osc.stop(now + 0.15);
    });
  }

  /**
   * Play button click sound - quick blip
   */
  playButtonClick() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

      const now = this.context.currentTime;
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, now);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.start(now);
      osc.stop(now + 0.04);
    });
  }

  /**
   * Play pause menu open sound - descending "dum"
   */
  playPauseOpen() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

      const now = this.context.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.12);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.start(now);
      osc.stop(now + 0.12);
    });
  }

  /**
   * Play pause menu close sound - ascending "boop"
   */
  playPauseClose() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

      const now = this.context.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.start(now);
      osc.stop(now + 0.1);
    });
  }

  /**
   * Play menu transition sound - soft whoosh
   */
  playMenuTransition() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      this.connectGainNode(gain);

      const now = this.context.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.start(now);
      osc.stop(now + 0.08);
    });
  }

  /**
   * Play low health warning sound - urgent alarm
   */
  playLowHealthWarning() {
    this.safePlay(() => {
      const now = this.context.currentTime;

      // Two-tone alarm pattern
      for (let i = 0; i < 2; i++) {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();

        osc.connect(gain);
        this.connectGainNode(gain);

        const offset = i * 0.15; // Stagger the beeps
        const freq = i === 0 ? 880 : 660; // High-low pattern

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now + offset);

        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(0.18, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);

        osc.start(now + offset);
        osc.stop(now + offset + 0.12);
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

    if (deltaTime >= 1000) { // Update every second
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
      averageCallsPerFrame: this.performanceMonitor.averageCallsPerFrame.toFixed(1),
      peakCallsPerFrame: this.performanceMonitor.peakCallsPerFrame,
      pool: poolStats,
      cache: cacheStats,
      batcher: batcherStats
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
      totalAudioCalls: 0
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
        batching: !!this.batcher
      }
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
