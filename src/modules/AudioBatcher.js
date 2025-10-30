import RandomService from '../core/RandomService.js';

/**
 * AudioBatcher - Sistema de batching para sons simultâneos
 * Otimiza sons similares executados ao mesmo tempo
 */
class AudioBatcher {
  constructor(audioSystem, batchWindow = 0, { random } = {}) {
    this.audioSystem = audioSystem;
    this.batchWindow = batchWindow; // ms para agrupar sons
    this.random = random || null;
    this._fallbackRandom = null;
    this._fallbackRandomForks = {};
    this._randomForkSeeds = {};
    this.randomForks = this._initializeRandomForks(this.random);
    this.captureRandomForkSeeds();

    // Queues de batching por tipo de som
    this.pendingBatches = new Map();
    this.pendingFlushes = new Map();

    // Tracking de sobreposição
    this.activeSounds = new Map();

    // Performance metrics
    this.stats = {
      batched: 0,
      individual: 0,
      prevented: 0, // sobreposições evitadas
      batchReduction: 0
    };

    console.log('[AudioBatcher] Initialized with batch window:', batchWindow, 'ms');
  }

  _extractBatchParams(raw) {
    if (!raw) return null;
    if (Array.isArray(raw)) {
      if (raw.length === 1) {
        return raw[0];
      }
      return raw;
    }
    return raw;
  }

  _playBatchedDroneFire(batch) {
    const options = batch
      .map(item => this._extractBatchParams(item.params))
      .filter(Boolean);

    if (!options.length) {
      return;
    }

    const aggregated = options.reduce(
      (acc, opt) => {
        const frequency = Number(opt.frequency) || 680;
        const detune = Number(opt.detune) || 0;
        const duration = Number(opt.duration) || 0.1;
        const intensity = Number(opt.intensity) || 0.7;
        const gain = Number(opt.gain) || 0.12;

        acc.frequency += frequency;
        acc.detune = Math.max(acc.detune, detune);
        acc.duration = Math.max(acc.duration, duration);
        acc.intensity += intensity;
        acc.gain += gain;
        return acc;
      },
      { frequency: 0, detune: 0, duration: 0.1, intensity: 0, gain: 0 }
    );

    aggregated.count = options.length;
    aggregated.frequency /= options.length;
    aggregated.intensity /= options.length;
    aggregated.gain /= options.length;

    this.audioSystem._playDroneFireDirect(aggregated);
  }

  _playBatchedHunterBurst(batch) {
    const options = batch
      .map(item => this._extractBatchParams(item.params))
      .filter(Boolean);

    if (!options.length) {
      return;
    }

    const grouped = new Map();
    options.forEach(opt => {
      const key = opt.burstId ?? `hunter:${grouped.size}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(opt);
    });

    grouped.forEach((group) => {
      if (!group.length) {
        return;
      }

      const base = group[0];
      const aggregated = { ...base };
      aggregated.concurrency = group.length;
      aggregated.intensity =
        group.reduce((sum, opt) => sum + (Number(opt.intensity) || 0.8), 0) /
        group.length;
      aggregated.gain =
        group.reduce((sum, opt) => sum + (Number(opt.gain) || 0.15), 0) /
        group.length;

      this.audioSystem._playHunterBurstDirect(aggregated);
    });
  }

  _playBatchedMineExplosions(batch) {
    const options = batch
      .map(item => this._extractBatchParams(item.params))
      .filter(Boolean);

    if (!options.length) {
      return;
    }

    const strongest = options.reduce((prev, current) => {
      const prevIntensity = Number(prev?.intensity) || 0;
      const currentIntensity = Number(current?.intensity) || 0;
      return currentIntensity > prevIntensity ? current : prev;
    }, options[0]);

    const aggregated = { ...strongest };
    aggregated.clusterSize = options.length;
    aggregated.duration = options.reduce(
      (max, opt) => Math.max(max, Number(opt.duration) || max),
      Number(strongest?.duration) || 0.5
    );
    aggregated.noiseGain = options.reduce(
      (max, opt) => Math.max(max, Number(opt.noiseGain) || 0),
      Number(strongest?.noiseGain) || 0.25
    );
    aggregated.rumbleGain = options.reduce(
      (max, opt) => Math.max(max, Number(opt.rumbleGain) || 0),
      Number(strongest?.rumbleGain) || 0.24
    );
    const totalIntensity = options.reduce(
      (sum, opt) => sum + (Number(opt.intensity) || 0.9),
      0
    );
    aggregated.intensity = Math.min(
      1.5,
      totalIntensity / options.length + 0.12 * (options.length - 1)
    );

    this.audioSystem._playMineExplosionDirect(aggregated);
  }

  /**
   * Agenda um som para batching
   */
  scheduleSound(soundType, params = {}, options = {}) {
    const now = performance.now();
    const { allowOverlap = false, priority = 0 } = options;

    // Check for overlap prevention
    if (!allowOverlap && this._shouldPreventOverlap(soundType, now)) {
      this.stats.prevented++;
      return true;
    }

    // Check if we should batch this sound
    if (this._shouldBatch(soundType, params)) {
      this._addToBatch(soundType, params, now, priority);
      return true;
    }

    // Play immediately
    this._playImmediate(soundType, params);
    this.stats.individual++;
    return true;
  }

  /**
   * Verifica se deve evitar sobreposição
   */
  _shouldPreventOverlap(soundType, now) {
    const category = this._getSoundCategory(soundType);
    const lastPlay = this.activeSounds.get(category);
    if (typeof lastPlay !== 'number') return false;

    // Define minimum intervals between same sounds
    const minIntervals = {
      'laser': 50,      // Rapid fire allowed
      'asteroid': 100,  // Medium spacing
      'explosion': 200, // Slower spacing
      'shield': 150,    // Medium spacing
      'xp': 80,         // Quick succession allowed
      'levelup': 1000   // Prevent spam
    };

    const minInterval = minIntervals[category] || 100;

    return (now - lastPlay) < minInterval;
  }

  /**
   * Determina se um som deve ser agrupado em batch
   */
  _shouldBatch(soundType, params) {
    // Alguns sons se beneficiam mais de batching
    const batchableSounds = [
      'playLaserShot',
      'playAsteroidBreak',
      'playXPCollect',
      'playShieldImpact',
      'playDroneFire',
      'playHunterBurst',
      'playMineExplosion'
    ];

    return batchableSounds.includes(soundType);
  }

  /**
   * Adiciona som ao batch pendente
   */
  _addToBatch(soundType, params, timestamp, priority) {
    if (!this.pendingBatches.has(soundType)) {
      this.pendingBatches.set(soundType, []);
    }

    this.pendingBatches.get(soundType).push({
      params,
      timestamp,
      priority
    });

    this._scheduleBatchExecution(soundType);
  }

  /**
   * Executa um batch de sons
   */
  _executeBatch(soundType) {
    if (this.pendingFlushes.has(soundType)) {
      const handle = this.pendingFlushes.get(soundType);
      if (typeof handle === 'number') {
        clearTimeout(handle);
      }
      this.pendingFlushes.delete(soundType);
    }

    const batch = this.pendingBatches.get(soundType);
    if (!batch || batch.length === 0) {
      this.pendingBatches.delete(soundType);
      return;
    }

    // Sort by priority (higher first)
    batch.sort((a, b) => b.priority - a.priority);

    const batchSize = batch.length;
    this.stats.batched += batchSize;
    this.stats.batchReduction += Math.max(0, batchSize - 1);

    if (batchSize === 1) {
      // Single sound, play normally
      this._playImmediate(soundType, batch[0].params);
    } else {
      // Multiple sounds, optimize
      this._playBatchedSounds(soundType, batch);
    }

    this.pendingBatches.delete(soundType);
  }

  /**
   * Agenda execução do batch respeitando a janela configurada
   */
  _scheduleBatchExecution(soundType) {
    if (this.pendingFlushes.has(soundType)) {
      return;
    }

    if (this.batchWindow <= 0) {
      this.pendingFlushes.set(soundType, 'microtask');
      Promise.resolve().then(() => {
        this._executeBatch(soundType);
      });
      return;
    }

    const handle = setTimeout(() => {
      this._executeBatch(soundType);
    }, this.batchWindow);

    this.pendingFlushes.set(soundType, handle);
  }

  /**
   * Reproduz sons agrupados de forma otimizada
   */
  _playBatchedSounds(soundType, batch) {
    const now = performance.now();

    switch (soundType) {
      case 'playLaserShot':
        this._playBatchedLasers(batch);
        break;
      case 'playAsteroidBreak':
        this._playBatchedAsteroidBreaks(batch);
        break;
      case 'playXPCollect':
        this._playBatchedXPCollects(batch);
        break;
      case 'playShieldImpact':
        this._playBatchedShieldImpacts(batch);
        break;
      case 'playDroneFire':
        this._playBatchedDroneFire(batch);
        break;
      case 'playHunterBurst':
        this._playBatchedHunterBurst(batch);
        break;
      case 'playMineExplosion':
        this._playBatchedMineExplosions(batch);
        break;
      default:
        // Fallback to individual sounds
        batch.forEach(item => {
          this._playImmediate(soundType, item.params);
        });
    }

    // Update active sound tracking
    this.activeSounds.set(this._getSoundCategory(soundType), now);
  }

  /**
   * Batching otimizado para laser shots
   */
  _playBatchedLasers(batch) {
    const count = Math.min(batch.length, 5); // Limit simultaneous lasers

    this.audioSystem.safePlay(() => {
      const baseFreq = 800;
      const freqVariation = 100;

      for (let i = 0; i < count; i++) {
        const osc = this.audioSystem.pool.getOscillator();
        const gain = this.audioSystem.pool.getGain();

        osc.connect(gain);
        this.audioSystem.connectGainNode(gain);

        // Slight frequency variation
        const freq = baseFreq + (i * freqVariation / count) - (freqVariation / 2);
        const delay = i * 0.01; // Small stagger

        osc.frequency.setValueAtTime(freq, this.audioSystem.context.currentTime + delay);
        osc.frequency.exponentialRampToValueAtTime(
          freq * 0.2,
          this.audioSystem.context.currentTime + delay + 0.08
        );

        gain.gain.setValueAtTime(0.12 / count, this.audioSystem.context.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          this.audioSystem.context.currentTime + delay + 0.08
        );

        osc.start(this.audioSystem.context.currentTime + delay);
        osc.stop(this.audioSystem.context.currentTime + delay + 0.08);

        // Return gain to pool after use
        setTimeout(() => {
          this.audioSystem.pool.returnGain(gain);
        }, (delay + 0.08) * 1000 + 10);
      }
    });
  }

  /**
   * Batching otimizado para asteroid breaks
   */
  _playBatchedAsteroidBreaks(batch) {
    // Group by size for more efficient rendering
    const bySize = batch.reduce((acc, item) => {
      const size = item.params[0] || 'medium';
      if (!acc[size]) acc[size] = [];
      acc[size].push(item);
      return acc;
    }, {});

    Object.entries(bySize).forEach(([size, items]) => {
      this._playBatchedAsteroidBreaksBySize(size, items);
    });
  }

  /**
   * Reproduz asteroid breaks do mesmo tamanho em batch
   */
  _playBatchedAsteroidBreaksBySize(size, items) {
    const count = Math.min(items.length, 4); // Limit simultaneous breaks

    this.audioSystem.safePlay(() => {
      const baseFreq = size === 'large' ? 70 : size === 'medium' ? 110 : 150;
      const duration = size === 'large' ? 0.35 : size === 'medium' ? 0.25 : 0.18;

      for (let i = 0; i < count; i++) {
        const osc = this.audioSystem.pool.getOscillator();
        const gain = this.audioSystem.pool.getGain();

        osc.connect(gain);
        this.audioSystem.connectGainNode(gain);

        const freqVariation = baseFreq * 0.3;
        const freqOffset = this._getRandomRange('asteroid', -freqVariation / 2, freqVariation / 2);
        const freq = baseFreq + freqOffset;
        const delay = i * 0.02;

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, this.audioSystem.context.currentTime + delay);
        osc.frequency.exponentialRampToValueAtTime(
          freq * 0.4,
          this.audioSystem.context.currentTime + delay + duration
        );

        gain.gain.setValueAtTime(0.15 / count, this.audioSystem.context.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          this.audioSystem.context.currentTime + delay + duration
        );

        osc.start(this.audioSystem.context.currentTime + delay);
        osc.stop(this.audioSystem.context.currentTime + delay + duration);

        // Return gain to pool after use
        setTimeout(() => {
          this.audioSystem.pool.returnGain(gain);
        }, (delay + duration) * 1000 + 10);
      }
    });
  }

  _initializeRandomForks(random) {
    if (!random || typeof random.fork !== 'function') {
      return {};
    }

    return {
      laser: random.fork('audio-batcher:laser'),
      asteroid: random.fork('audio-batcher:asteroid'),
      shield: random.fork('audio-batcher:shield'),
      xp: random.fork('audio-batcher:xp'),
    };
  }

  _getRandomRange(family, min, max) {
    const rng = this.randomForks[family];
    if (rng && typeof rng.range === 'function') {
      return rng.range(min, max);
    }

    const fallbackRng = this._ensureFallbackRandomFork(family);
    if (fallbackRng && typeof fallbackRng.range === 'function') {
      return fallbackRng.range(min, max);
    }

    if (fallbackRng && typeof fallbackRng.float === 'function') {
      return min + (max - min) * fallbackRng.float();
    }

    const emergency = this._ensureFallbackRandomFork('emergency');
    if (emergency && typeof emergency.range === 'function') {
      return emergency.range(min, max);
    }

    if (emergency && typeof emergency.float === 'function') {
      return min + (max - min) * emergency.float();
    }

    throw new Error('AudioBatcher could not resolve deterministic RNG instance');
  }

  _ensureFallbackRandomFork(family) {
    if (!this._fallbackRandom) {
      this._fallbackRandom = new RandomService('audio-batcher:fallback');
      this.captureRandomForkSeeds();
    }

    if (!this._fallbackRandomForks[family]) {
      this._fallbackRandomForks[family] = this._fallbackRandom.fork(
        `audio-batcher:fallback:${family}`
      );
      this.captureRandomForkSeeds();
    }

    return this._fallbackRandomForks[family];
  }

  captureRandomForkSeeds() {
    const seeds = {};

    if (this.randomForks) {
      Object.entries(this.randomForks).forEach(([name, rng]) => {
        if (rng && typeof rng.reset === 'function' && rng.seed !== undefined) {
          seeds[`family:${name}`] = rng.seed;
        }
      });
    }

    if (this._fallbackRandom) {
      if (
        typeof this._fallbackRandom.reset === 'function' &&
        this._fallbackRandom.seed !== undefined
      ) {
        seeds['fallback:root'] = this._fallbackRandom.seed;
      }

      Object.entries(this._fallbackRandomForks).forEach(([name, rng]) => {
        if (rng && typeof rng.reset === 'function' && rng.seed !== undefined) {
          seeds[`fallback:${name}`] = rng.seed;
        }
      });
    }

    this._randomForkSeeds = seeds;
    return { ...seeds };
  }

  reseedRandomForks() {
    const seeds = this._randomForkSeeds && Object.keys(this._randomForkSeeds).length
      ? this._randomForkSeeds
      : this.captureRandomForkSeeds();

    Object.entries(this.randomForks || {}).forEach(([name, rng]) => {
      const seed = seeds[`family:${name}`];
      if (seed !== undefined && rng && typeof rng.reset === 'function') {
        rng.reset(seed);
      }
    });

    if (this._fallbackRandom && typeof this._fallbackRandom.reset === 'function') {
      const fallbackSeed = seeds['fallback:root'];
      if (fallbackSeed !== undefined) {
        this._fallbackRandom.reset(fallbackSeed);
      }
    }

    Object.entries(this._fallbackRandomForks || {}).forEach(([name, rng]) => {
      const seed = seeds[`fallback:${name}`];
      if (seed !== undefined && rng && typeof rng.reset === 'function') {
        rng.reset(seed);
      }
    });

    return this.captureRandomForkSeeds();
  }

  /**
   * Batching otimizado para XP collect
   */
  _playBatchedXPCollects(batch) {
    const count = Math.min(batch.length, 6); // Allow more XP sounds

    this.audioSystem.safePlay(() => {
      const baseFreq = 600;

      for (let i = 0; i < count; i++) {
        const osc = this.audioSystem.pool.getOscillator();
        const gain = this.audioSystem.pool.getGain();

        osc.connect(gain);
        this.audioSystem.connectGainNode(gain);

        const freq = baseFreq + (i * 50); // Ascending notes
        const delay = i * 0.015;

        osc.frequency.setValueAtTime(freq, this.audioSystem.context.currentTime + delay);
        osc.frequency.exponentialRampToValueAtTime(
          freq * 2,
          this.audioSystem.context.currentTime + delay + 0.12
        );

        gain.gain.setValueAtTime(0.08 / Math.sqrt(count), this.audioSystem.context.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          this.audioSystem.context.currentTime + delay + 0.12
        );

        osc.start(this.audioSystem.context.currentTime + delay);
        osc.stop(this.audioSystem.context.currentTime + delay + 0.12);

        // Return gain to pool after use
        setTimeout(() => {
          this.audioSystem.pool.returnGain(gain);
        }, (delay + 0.12) * 1000 + 10);
      }
    });
  }

  /**
   * Batching otimizado para shield impacts
   */
  _playBatchedShieldImpacts(batch) {
    const count = Math.min(batch.length, 3); // Limit shield impacts

    this.audioSystem.safePlay(() => {
      for (let i = 0; i < count; i++) {
        const osc = this.audioSystem.pool.getOscillator();
        const gain = this.audioSystem.pool.getGain();

        osc.connect(gain);
        this.audioSystem.connectGainNode(gain);

        const baseFreq = 520;
        const freq = baseFreq + (i * 40);
        const delay = i * 0.01;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, this.audioSystem.context.currentTime + delay);
        osc.frequency.exponentialRampToValueAtTime(
          freq * 0.4,
          this.audioSystem.context.currentTime + delay + 0.1
        );

        gain.gain.setValueAtTime(0.18 / count, this.audioSystem.context.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          this.audioSystem.context.currentTime + delay + 0.12
        );

        osc.start(this.audioSystem.context.currentTime + delay);
        osc.stop(this.audioSystem.context.currentTime + delay + 0.12);

        // Return gain to pool after use
        setTimeout(() => {
          this.audioSystem.pool.returnGain(gain);
        }, (delay + 0.12) * 1000 + 10);
      }
    });
  }

  /**
   * Reproduz som imediatamente sem batching
   */
  _playImmediate(soundType, params) {
    const args = Array.isArray(params) ? params : [params];
    const category = this._getSoundCategory(soundType);

    if (typeof this.audioSystem._executeBatchedSound === 'function') {
      this.audioSystem._executeBatchedSound(soundType, args);
    } else if (typeof this.audioSystem[soundType] === 'function') {
      this.audioSystem[soundType](...args);
    }

    this.activeSounds.set(category, performance.now());
  }

  /**
   * Determina categoria do som para tracking
   */
  _getSoundCategory(soundType) {
    if (soundType.includes('Laser') || soundType.includes('laser')) return 'laser';
    if (soundType.includes('Drone') || soundType.includes('Hunter')) return 'laser';
    if (soundType.includes('Asteroid') || soundType.includes('asteroid')) return 'asteroid';
    if (soundType.includes('Explosion') || soundType.includes('explosion')) return 'explosion';
    if (soundType.includes('Shield') || soundType.includes('shield')) return 'shield';
    if (soundType.includes('XP') || soundType.includes('xp')) return 'xp';
    if (soundType.includes('Level') || soundType.includes('level')) return 'levelup';
    if (soundType.includes('UI') || soundType.includes('ui')) return 'ui';
    return 'other';
  }

  /**
   * Força execução de todos os batches pendentes
   */
  flushPendingBatches() {
    for (const [soundType, handle] of Array.from(this.pendingFlushes.entries())) {
      if (typeof handle === 'number') {
        clearTimeout(handle);
      }
      this.pendingFlushes.delete(soundType);
      this._executeBatch(soundType);
    }

    Array.from(this.pendingBatches.keys()).forEach((soundType) => {
      this._executeBatch(soundType);
    });
  }

  /**
   * Obtém estatísticas do batcher
   */
  getStats() {
    const totalSounds = this.stats.batched + this.stats.individual;
    const batchEfficiency = totalSounds > 0 ? (this.stats.batchReduction / totalSounds) * 100 : 0;

    return {
      ...this.stats,
      totalSounds,
      batchEfficiency,
      pendingBatches: this.pendingBatches.size,
      activeSounds: this.activeSounds.size
    };
  }

  /**
   * Reset das estatísticas
   */
  resetStats() {
    this.reseedRandomForks();
    this.stats = {
      batched: 0,
      individual: 0,
      prevented: 0,
      batchReduction: 0
    };
  }
}

export default AudioBatcher;
