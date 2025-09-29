/**
 * AudioPool - Sistema de pooling para AudioNodes reutilizáveis
 * Reduz a criação excessiva de objetos de áudio
 */
class AudioPool {
  constructor(audioContext, maxPoolSize = 50) {
    this.context = audioContext;
    this.maxPoolSize = maxPoolSize;

    // Pools separados por tipo de node
    this.oscillatorPool = [];
    this.gainPool = [];
    this.bufferSourcePool = [];

    // Tracking de nodes ativos
    this.activeNodes = new Set();

    // Performance metrics
    this.stats = {
      created: 0,
      reused: 0,
      poolHits: 0,
      poolMisses: 0
    };

    console.log('[AudioPool] Initialized with max pool size:', maxPoolSize);
  }

  /**
   * Obtém um OscillatorNode do pool ou cria um novo
   */
  getOscillator() {
    let oscillator;

    if (this.oscillatorPool.length > 0) {
      oscillator = this.oscillatorPool.pop();
      this.stats.reused++;
      this.stats.poolHits++;
    } else {
      oscillator = this.context.createOscillator();
      this.stats.created++;
      this.stats.poolMisses++;
    }

    this.activeNodes.add(oscillator);
    this._setupOscillatorCleanup(oscillator);

    return oscillator;
  }

  /**
   * Obtém um GainNode do pool ou cria um novo
   */
  getGain() {
    let gain;

    if (this.gainPool.length > 0) {
      gain = this.gainPool.pop();
      // Reset gain value
      gain.gain.value = 1;
      this.stats.reused++;
      this.stats.poolHits++;
    } else {
      gain = this.context.createGain();
      this.stats.created++;
      this.stats.poolMisses++;
    }

    this.activeNodes.add(gain);
    return gain;
  }

  /**
   * Obtém um AudioBufferSourceNode do pool ou cria um novo
   */
  getBufferSource() {
    let source;

    if (this.bufferSourcePool.length > 0) {
      source = this.bufferSourcePool.pop();
      this.stats.reused++;
      this.stats.poolHits++;
    } else {
      source = this.context.createBufferSource();
      this.stats.created++;
      this.stats.poolMisses++;
    }

    this.activeNodes.add(source);
    this._setupBufferSourceCleanup(source);

    return source;
  }

  /**
   * Retorna um GainNode para o pool
   */
  returnGain(gain) {
    if (!gain || !this.activeNodes.has(gain)) return;

    this.activeNodes.delete(gain);

    // Disconnect all connections
    try {
      gain.disconnect();
    } catch (e) {
      // Node might already be disconnected
    }

    // Return to pool if there's space
    if (this.gainPool.length < this.maxPoolSize) {
      this.gainPool.push(gain);
    }
  }

  /**
   * Setup automático de cleanup para oscillators
   */
  _setupOscillatorCleanup(oscillator) {
    const originalStop = oscillator.stop.bind(oscillator);

    oscillator.stop = (when) => {
      originalStop(when);

      // Schedule cleanup após o stop
      const cleanupTime = when || this.context.currentTime;
      setTimeout(() => {
        this.activeNodes.delete(oscillator);
        try {
          oscillator.disconnect();
        } catch (e) {
          // Node might already be disconnected
        }
        // Oscillators não podem ser reutilizados após stop()
      }, (cleanupTime - this.context.currentTime) * 1000 + 10);
    };
  }

  /**
   * Setup automático de cleanup para buffer sources
   */
  _setupBufferSourceCleanup(source) {
    const originalStop = source.stop.bind(source);

    source.stop = (when) => {
      originalStop(when);

      // Schedule cleanup após o stop
      const cleanupTime = when || this.context.currentTime;
      setTimeout(() => {
        this.activeNodes.delete(source);
        try {
          source.disconnect();
        } catch (e) {
          // Node might already be disconnected
        }
        // BufferSources não podem ser reutilizados após stop()
      }, (cleanupTime - this.context.currentTime) * 1000 + 10);
    };
  }

  /**
   * Cleanup forçado de todos os nodes ativos
   */
  cleanup() {
    for (const node of this.activeNodes) {
      try {
        if (node.stop && typeof node.stop === 'function') {
          node.stop();
        }
        node.disconnect();
      } catch (e) {
        // Node might already be cleaned up
      }
    }

    this.activeNodes.clear();
    this.oscillatorPool = [];
    this.gainPool = [];
    this.bufferSourcePool = [];
  }

  /**
   * Obtém estatísticas de performance do pool
   */
  getStats() {
    const poolEfficiency = this.stats.poolHits / (this.stats.poolHits + this.stats.poolMisses) * 100;

    return {
      ...this.stats,
      poolEfficiency: isFinite(poolEfficiency) ? poolEfficiency : 0,
      activeNodes: this.activeNodes.size,
      poolSizes: {
        oscillator: this.oscillatorPool.length,
        gain: this.gainPool.length,
        bufferSource: this.bufferSourcePool.length
      }
    };
  }

  /**
   * Reset das estatísticas
   */
  resetStats() {
    this.stats = {
      created: 0,
      reused: 0,
      poolHits: 0,
      poolMisses: 0
    };
  }
}

export default AudioPool;