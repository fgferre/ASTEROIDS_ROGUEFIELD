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

    // Cache de buffers por tipo
    this.noiseBuffers = new Map();
    this.customBuffers = new Map();

    // LRU tracking
    this.accessOrder = [];

    // Fork seeds por assinatura
    this.noiseForkSeeds = new Map();

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

    let forkSeed = this.noiseForkSeeds.get(forkKey);
    let generatorRandom = null;

    if (!forkSeed && random && typeof random.fork === 'function') {
      const forked = random.fork(`audio-cache:${forkKey}`);
      forkSeed = forked.seed >>> 0;
      generatorRandom = forked;
      this.noiseForkSeeds.set(forkKey, forkSeed);
    }

    const seedComponent =
      typeof forkSeed === 'number'
        ? forkSeed
        : this._getSeedComponent(random);

    const key = `noise_${normalizedFamily}_${seedComponent}_${duration}_${fadeOut}_${amplitudePattern}`;

    if (this.noiseBuffers.has(key)) {
      this._updateAccessOrder(key);
      this.stats.hits++;
      return this.noiseBuffers.get(key);
    }

    if (!generatorRandom && typeof forkSeed === 'number') {
      generatorRandom = new RandomService(forkSeed);
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

    for (let i = 0; i < bufferSize; i++) {
      const noise = randomInstance
        ? randomInstance.range(-1, 1)
        : Math.random() * 2 - 1;
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
        break;
      case 'custom':
        this.customBuffers.clear();
        break;
      case 'all':
      default:
        this.noiseBuffers.clear();
        this.customBuffers.clear();
        this.accessOrder = [];
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
}

export default AudioCache;
