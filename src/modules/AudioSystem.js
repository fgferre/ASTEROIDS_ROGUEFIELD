import AudioPool from './AudioPool.js';
import AudioCache from './AudioCache.js';
import AudioBatcher from './AudioBatcher.js';
import RandomService from '../core/RandomService.js';
import { normalizeDependencies, resolveService } from '../core/serviceUtils.js';

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
      this.initialized = true;

      // Start performance monitoring
      this._startPerformanceMonitoring();

      console.log('[AudioSystem] Fully initialized with optimizations');
    } catch (error) {
      console.warn('Áudio não disponível:', error);
      this.initialized = false;
    }
  }

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
