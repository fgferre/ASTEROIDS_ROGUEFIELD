import RandomService from '../core/RandomService.js';

/**
 * AudioCache - Sistema de cache para buffers de áudio e patterns
 * Evita regeneração desnecessária de buffers de ruído
 */
class AudioCache {
  constructor(audioContext, maxCacheSize = 20, { random } = {}) {
    this.context = audioContext;
    this.maxCacheSize = maxCacheSize;
    this.random = random || null;
    this._fallbackRandom = new RandomService('audio-cache:fallback');

    // Cache de buffers por tipo
    this.noiseBuffers = new Map();
    this.customBuffers = new Map();

    // LRU tracking
    this.accessOrder = [];

    // Fork seeds por assinatura
    this.noiseForkSeeds = new Map();
    this.noiseRandomForks = new Map();
    this._noiseSeedSnapshot = null;

    // Performance metrics
    this.stats = {
      hits: 0,
      misses: 0,
      created: 0,
      evicted: 0
    };

    // Pregenerate common noise patterns
    this._pregenerateCommonBuffers();

    console.log('[AudioCache] Initialized with max cache size:', maxCacheSize);
  }

  /**
   * Obtém um buffer de ruído com características específicas
   */
  getNoiseBuffer(duration, fadeOut = false, amplitudePattern = 'linear', options = {}) {
    const { random = this.random, family = 'noise' } = options || {};
    const normalizedFamily = typeof family === 'string' && family.length > 0 ? family : 'noise';
    const forkKey = `${normalizedFamily}:${duration}:${fadeOut ? 'fade' : 'flat'}:${amplitudePattern}`;

    let forkRecord = this.noiseForkSeeds.get(forkKey) || null;
    let generatorRandom = this.noiseRandomForks.get(forkKey) || null;

    if (!forkRecord) {
      if (random && typeof random.fork === 'function') {
        const scope = `audio-cache:${forkKey}`;
        const forked = random.fork(scope);
        forkRecord = {
          seed: forked.seed >>> 0,
          scope,
          source: 'service'
        };
        generatorRandom = forked;
      } else {
        const scope = `audio-cache:fallback:${forkKey}`;
        const fallbackFork = this._fallbackRandom.fork(scope);
        forkRecord = {
          seed: fallbackFork.seed >>> 0,
          scope,
          source: 'fallback'
        };
        generatorRandom = fallbackFork;
      }

      this.noiseForkSeeds.set(forkKey, forkRecord);
      if (generatorRandom) {
        this.noiseRandomForks.set(forkKey, generatorRandom);
      }
    }

    if (!generatorRandom && forkRecord && typeof forkRecord.seed === 'number') {
      generatorRandom = new RandomService(forkRecord.seed);
      this.noiseRandomForks.set(forkKey, generatorRandom);
    }

    const seedComponent =
      forkRecord && typeof forkRecord.seed === 'number'
        ? forkRecord.seed
        : this._getSeedComponent(random);

    const key = `noise_${normalizedFamily}_${seedComponent}_${duration}_${fadeOut}_${amplitudePattern}`;

    if (this.noiseBuffers.has(key)) {
      this._updateAccessOrder(key);
      this.stats.hits++;
      return this.noiseBuffers.get(key);
    }

    // Create new buffer
    const buffer = this._createNoiseBuffer(duration, fadeOut, amplitudePattern, generatorRandom);
    this._cacheBuffer(key, buffer, this.noiseBuffers);
    this.stats.misses++;
    this.stats.created++;

    return buffer;
  }

  /**
   * Obtém um buffer customizado com uma função geradora
   */
  getCustomBuffer(key, duration, generatorFn) {
    if (this.customBuffers.has(key)) {
      this._updateAccessOrder(key);
      this.stats.hits++;
      return this.customBuffers.get(key);
    }

    // Create new buffer
    const bufferSize = this.context.sampleRate * duration;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const output = buffer.getChannelData(0);

    generatorFn(output, bufferSize);

    this._cacheBuffer(key, buffer, this.customBuffers);
    this.stats.misses++;
    this.stats.created++;

    return buffer;
  }

  /**
   * Pregenera buffers comuns para reduzir latência
   */
  _pregenerateCommonBuffers() {
    // Common explosion noise patterns
    this.getNoiseBuffer(0.4, true, 'exponential', { family: 'explosion' }); // Big explosion
    this.getNoiseBuffer(0.35, true, 'linear', { family: 'shield' });       // Shield shockwave
    this.getNoiseBuffer(0.5, true, 'exponential', { family: 'asteroid' });  // Large asteroid break

    // Common short noises
    this.getNoiseBuffer(0.1, true, 'linear', { family: 'impact' });        // Quick impact
    this.getNoiseBuffer(0.15, true, 'exponential', { family: 'impact' });  // Medium impact

    console.log('[AudioCache] Pregenerated', this.noiseBuffers.size, 'common buffers');
  }

  /**
   * Cria um buffer de ruído com padrão específico
   */
  _createNoiseBuffer(duration, fadeOut, amplitudePattern, randomInstance = null) {
    const bufferSize = this.context.sampleRate * duration;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const output = buffer.getChannelData(0);

    const rng = randomInstance instanceof RandomService
      ? randomInstance
      : randomInstance && typeof randomInstance.range === 'function'
        ? randomInstance
        : this._fallbackRandom;

    for (let i = 0; i < bufferSize; i++) {
      const noise = rng.range(-1, 1);
      let amplitude = 1;

      if (fadeOut) {
        const progress = i / bufferSize;
        switch (amplitudePattern) {
          case 'linear':
            amplitude = 1 - progress;
            break;
          case 'exponential':
            amplitude = Math.pow(1 - progress, 2);
            break;
          case 'logarithmic':
            amplitude = Math.log(1 + (1 - progress)) / Math.log(2);
            break;
        }
      }

      output[i] = noise * amplitude;
    }

    return buffer;
  }

  /**
   * Armazena um buffer no cache com LRU management
   */
  _cacheBuffer(key, buffer, cacheMap) {
    // Check if we need to evict
    if (this.accessOrder.length >= this.maxCacheSize) {
      const oldestKey = this.accessOrder.shift();

      // Remove from both maps
      this.noiseBuffers.delete(oldestKey);
      this.customBuffers.delete(oldestKey);
      this.stats.evicted++;
    }

    cacheMap.set(key, buffer);
    this.accessOrder.push(key);
  }

  /**
   * Atualiza ordem de acesso para LRU
   */
  _updateAccessOrder(key) {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
      this.accessOrder.push(key);
    }
  }

  /**
   * Cria um novo AudioBufferSourceNode com o buffer
   */
  createSourceWithBuffer(buffer) {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  /**
   * Clear cache específico
   */
  clearCache(type = 'all') {
    switch (type) {
      case 'noise':
        this.noiseBuffers.clear();
        this.noiseForkSeeds.clear();
        this.noiseRandomForks.clear();
        if (this._fallbackRandom && typeof this._fallbackRandom.reset === 'function') {
          this._fallbackRandom.reset('audio-cache:fallback');
        }
        break;
      case 'custom':
        this.customBuffers.clear();
        break;
      case 'all':
      default:
        this.noiseBuffers.clear();
        this.customBuffers.clear();
        this.accessOrder = [];
        this.noiseForkSeeds.clear();
        this.noiseRandomForks.clear();
        if (this._fallbackRandom && typeof this._fallbackRandom.reset === 'function') {
          this._fallbackRandom.reset('audio-cache:fallback');
        }
        break;
    }
  }

  /**
   * Obtém estatísticas do cache
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;

    return {
      ...this.stats,
      hitRate,
      totalCached: this.noiseBuffers.size + this.customBuffers.size,
      cacheUtilization: (this.accessOrder.length / this.maxCacheSize) * 100,
      cacheSizes: {
        noise: this.noiseBuffers.size,
        custom: this.customBuffers.size
      }
    };
  }

  /**
   * Reset das estatísticas
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      created: 0,
      evicted: 0
    };
  }

  _getSeedComponent(randomInstance) {
    if (!randomInstance) {
      return 'unseeded';
    }

    if (typeof randomInstance.seed === 'number') {
      return randomInstance.seed >>> 0;
    }

    try {
      const snapshot =
        typeof randomInstance.debugSnapshot === 'function'
          ? randomInstance.debugSnapshot()
          : null;
      if (snapshot && typeof snapshot.seed === 'number') {
        return snapshot.seed >>> 0;
      }
    } catch (error) {
      // Ignore snapshot failures in production
    }

    return 'unseeded';
  }

  captureNoiseSeeds() {
    const forks = [];
    for (const [key, record] of this.noiseForkSeeds.entries()) {
      const normalizedSeed =
        record && typeof record.seed === 'number' ? record.seed >>> 0 : undefined;
      if (normalizedSeed === undefined) {
        continue;
      }
      forks.push({
        key,
        seed: normalizedSeed,
        scope: record?.scope || `audio-cache:${key}`,
        source: record?.source || 'service'
      });
    }

    const snapshot = {
      baseSeed:
        this.random && typeof this.random.seed === 'number'
          ? this.random.seed >>> 0
          : null,
      fallbackSeed:
        this._fallbackRandom && typeof this._fallbackRandom.seed === 'number'
          ? this._fallbackRandom.seed >>> 0
          : null,
      forks
    };

    this._noiseSeedSnapshot = JSON.parse(JSON.stringify(snapshot));
    return JSON.parse(JSON.stringify(snapshot));
  }

  reseedNoiseGenerators(snapshot = null) {
    const payload = snapshot
      ? JSON.parse(JSON.stringify(snapshot))
      : this._noiseSeedSnapshot
        ? JSON.parse(JSON.stringify(this._noiseSeedSnapshot))
        : this.captureNoiseSeeds();

    if (!payload) {
      return null;
    }

    if (
      this.random &&
      typeof this.random.reset === 'function' &&
      typeof payload.baseSeed === 'number'
    ) {
      this.random.reset(payload.baseSeed);
    }

    if (
      this._fallbackRandom &&
      typeof this._fallbackRandom.reset === 'function' &&
      typeof payload.fallbackSeed === 'number'
    ) {
      this._fallbackRandom.reset(payload.fallbackSeed);
    }

    this.noiseForkSeeds.clear();
    this.noiseRandomForks.clear();

    if (Array.isArray(payload.forks)) {
      payload.forks.forEach(entry => {
        if (!entry || typeof entry.seed !== 'number') {
          return;
        }

        const { key, seed, scope, source } = entry;
        const normalizedSeed = seed >>> 0;
        const normalizedScope = scope || `audio-cache:${key}`;
        const normalizedSource = source || 'service';

        let rngInstance = null;

        if (normalizedSource === 'service' && this.random && typeof this.random.fork === 'function') {
          const forked = this.random.fork(normalizedScope);
          if (typeof forked.reset === 'function') {
            forked.reset(normalizedSeed);
          }
          rngInstance = forked;
        } else if (
          normalizedSource === 'fallback' &&
          this._fallbackRandom &&
          typeof this._fallbackRandom.fork === 'function'
        ) {
          const forked = this._fallbackRandom.fork(normalizedScope);
          if (typeof forked.reset === 'function') {
            forked.reset(normalizedSeed);
          }
          rngInstance = forked;
        } else {
          rngInstance = new RandomService(normalizedSeed);
        }

        this.noiseForkSeeds.set(key, {
          seed: normalizedSeed,
          scope: normalizedScope,
          source: normalizedSource
        });

        if (rngInstance) {
          this.noiseRandomForks.set(key, rngInstance);
        }
      });
    }

    this._noiseSeedSnapshot = JSON.parse(JSON.stringify(payload));
    return JSON.parse(JSON.stringify(payload));
  }
}

export default AudioCache;
