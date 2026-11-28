import { debugLog } from '../core/debugLogging.js';

/**
 * AudioPool - Sistema de pooling para AudioNodes reutilizáveis
 * Reduz a criação excessiva de objetos de áudio
 */
class AudioPool {
  constructor(audioContext, maxPoolSize = 50) {
    this.context = audioContext;
    this.maxPoolSize = maxPoolSize;

    // Pools separados por tipo de node
    this.gainPool = [];
    this.biquadFilterPool = [];

    // Tracking de nodes ativos
    this.activeNodes = new Set();

    // Performance metrics
    this.stats = {
      created: 0,
      reused: 0,
      poolHits: 0,
      poolMisses: 0,
    };

    debugLog('[AudioPool] Initialized with max pool size:', maxPoolSize);
  }

  /**
   * Cria um OscillatorNode (descartável por especificação, não há pool)
   */
  getOscillator() {
    const oscillator = this.context.createOscillator();
    this.stats.created++;
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
      // Drop automation left by the previous user, then reset the value
      gain.gain.cancelScheduledValues(0);
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
   * Cria um AudioBufferSourceNode (descartável por especificação, não há pool)
   */
  getBufferSource() {
    const source = this.context.createBufferSource();
    this.stats.created++;
    this.activeNodes.add(source);
    this._setupBufferSourceCleanup(source);
    return source;
  }

  /**
   * Obtém um BiquadFilterNode do pool ou cria um novo
   */
  getBiquadFilter() {
    let filter;

    if (this.biquadFilterPool.length > 0) {
      filter = this.biquadFilterPool.pop();
      // Drop automation left by the previous user, back to Web Audio defaults
      for (const param of ['frequency', 'Q', 'gain', 'detune']) {
        filter[param].cancelScheduledValues(0);
      }
      filter.type = 'lowpass';
      filter.frequency.value = 350;
      filter.Q.value = 1;
      filter.gain.value = 0;
      filter.detune.value = 0;
      this.stats.reused++;
      this.stats.poolHits++;
    } else {
      filter = this.context.createBiquadFilter();
      this.stats.created++;
      this.stats.poolMisses++;
    }

    this.activeNodes.add(filter);
    return filter;
  }

  // Alias for legacy support/easier refactoring
  getFilter() {
    return this.getBiquadFilter();
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
   * Retorna um BiquadFilterNode para o pool
   */
  returnBiquadFilter(filter) {
    if (!filter || !this.activeNodes.has(filter)) return;

    this.activeNodes.delete(filter);

    // Disconnect all connections
    try {
      filter.disconnect();
    } catch (e) {
      // Node might already be disconnected
    }

    // Make sure to reset params if needed, or caller handles it
    // For filters, we usually reset heavily on get/use, so simple return is fine.

    if (this.biquadFilterPool.length < this.maxPoolSize) {
      this.biquadFilterPool.push(filter);
    }
  }

  // Alias
  returnFilter(filter) {
    return this.returnBiquadFilter(filter);
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
      setTimeout(
        () => {
          this.activeNodes.delete(oscillator);
          try {
            oscillator.disconnect();
          } catch (e) {
            // Node might already be disconnected
          }
          // Oscillators não podem ser reutilizados após stop()
        },
        (cleanupTime - this.context.currentTime) * 1000 + 10
      );
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
      setTimeout(
        () => {
          this.activeNodes.delete(source);
          try {
            source.disconnect();
          } catch (e) {
            // Node might already be disconnected
          }
          // BufferSources não podem ser reutilizados após stop()
        },
        (cleanupTime - this.context.currentTime) * 1000 + 10
      );
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
    this.gainPool = [];
    this.biquadFilterPool = [];
  }

  /**
   * Obtém estatísticas de performance do pool
   */
  getStats() {
    const poolEfficiency =
      (this.stats.poolHits / (this.stats.poolHits + this.stats.poolMisses)) *
      100;

    return {
      ...this.stats,
      poolEfficiency: isFinite(poolEfficiency) ? poolEfficiency : 0,
      activeNodes: this.activeNodes.size,
      poolSizes: {
        gain: this.gainPool.length,
        biquadFilter: this.biquadFilterPool.length,
      },
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
      poolMisses: 0,
    };
  }
}

export default AudioPool;
