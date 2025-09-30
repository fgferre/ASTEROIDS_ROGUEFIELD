/**
 * AudioBatcher - Sistema de batching para sons simultâneos
 * Otimiza sons similares executados ao mesmo tempo
 */
class AudioBatcher {
  constructor(audioSystem, batchWindow = 0) {
    this.audioSystem = audioSystem;
    this.batchWindow = batchWindow; // ms para agrupar sons

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
      'playShieldImpact'
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
        const freq = baseFreq + (Math.random() - 0.5) * freqVariation;
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
    if (soundType.includes('Asteroid') || soundType.includes('asteroid')) return 'asteroid';
    if (soundType.includes('Explosion') || soundType.includes('explosion')) return 'explosion';
    if (soundType.includes('Shield') || soundType.includes('shield')) return 'shield';
    if (soundType.includes('XP') || soundType.includes('xp')) return 'xp';
    if (soundType.includes('Level') || soundType.includes('level')) return 'levelup';
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
    this.stats = {
      batched: 0,
      individual: 0,
      prevented: 0,
      batchReduction: 0
    };
  }
}

export default AudioBatcher;