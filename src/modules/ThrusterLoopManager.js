/**
 * Manages continuous thruster loop sounds for main, retro, and side thrusters.
 */
class ThrusterLoopManager {
  constructor() {
    this.activeLoops = new Map();
  }

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
    if (this.activeLoops.has(type)) {
      console.warn(
        `[ThrusterLoopManager] Loop already active for type: ${type}`
      );
      return this.activeLoops.get(type);
    }

    const now = context.currentTime;
    const loopState = { type, variation, intensity, startTime: now };
    const sawOsc = pool ? pool.getOscillator() : context.createOscillator();
    const squareOsc = pool ? pool.getOscillator() : context.createOscillator();
    const sawGain = pool ? pool.getGain() : context.createGain();
    const squareGain = pool ? pool.getGain() : context.createGain();

    sawOsc.type = 'sawtooth';
    squareOsc.type = 'square';

    let baseFreq;
    let freqVariation;
    let noiseDuration;
    if (type === 'main') {
      baseFreq = 55;
      freqVariation = randomScope?.range ? randomScope.range(-3, 3) : 0;
      noiseDuration =
        1.2 + (randomScope?.range ? randomScope.range(-0.2, 0.3) : 0);
    } else if (type === 'retro') {
      baseFreq = 65;
      freqVariation = randomScope?.range ? randomScope.range(-4, 4) : 0;
      noiseDuration =
        1.0 + (randomScope?.range ? randomScope.range(-0.2, 0.2) : 0);
    } else {
      baseFreq = 90;
      freqVariation = randomScope?.range ? randomScope.range(-5, 5) : 0;
      noiseDuration =
        0.8 + (randomScope?.range ? randomScope.range(-0.1, 0.2) : 0);
    }

    const freq = baseFreq + freqVariation;
    sawOsc.frequency.setValueAtTime(freq, now);
    squareOsc.frequency.setValueAtTime(freq, now);
    sawGain.gain.setValueAtTime(0.35, now);
    squareGain.gain.setValueAtTime(0.25, now);
    sawOsc.connect(sawGain);
    squareOsc.connect(squareGain);

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
    noiseSource.loop = true;

    const noiseGain = pool ? pool.getGain() : context.createGain();
    noiseGain.gain.setValueAtTime(0.25, now);
    noiseSource.connect(noiseGain);

    const bpFilter = context.createBiquadFilter();
    bpFilter.type = 'bandpass';
    bpFilter.frequency.setValueAtTime(
      type === 'main' ? 3000 : type === 'retro' ? 2500 : 3500,
      now
    );
    bpFilter.Q.setValueAtTime(1.2, now);

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
    );

    const peakHigh = context.createBiquadFilter();
    peakHigh.type = 'peaking';
    peakHigh.frequency.setValueAtTime(3000, now);
    peakHigh.Q.setValueAtTime(1.0, now);
    peakHigh.gain.setValueAtTime(
      type === 'main' ? 2 : type === 'retro' ? 1.5 : 2,
      now
    );

    const masterGain = pool ? pool.getGain() : context.createGain();
    const clampedIntensity = Math.min(intensity, 1.0) * 0.5;
    masterGain.gain.setValueAtTime(clampedIntensity, now);

    sawGain.connect(bpFilter);
    squareGain.connect(bpFilter);
    noiseGain.connect(bpFilter);
    bpFilter.connect(hpf);
    hpf.connect(peakLow);
    peakLow.connect(peakHigh);
    peakHigh.connect(masterGain);

    if (connectFn && typeof connectFn === 'function') {
      connectFn(masterGain);
    }

    sawOsc.start(now);
    squareOsc.start(now);
    noiseSource.start(now);

    loopState.oscillators = [sawOsc, squareOsc];
    loopState.gains = [sawGain, squareGain, noiseGain, masterGain];
    loopState.source = noiseSource;
    loopState.filters = [bpFilter, hpf, peakLow, peakHigh];

    this.activeLoops.set(type, loopState);
    return loopState;
  }

  updateLoop(type, intensity) {
    const loop = this.activeLoops.get(type);
    if (!loop) {
      console.warn(
        `[ThrusterLoopManager] Cannot update: no active loop for type ${type}`
      );
      return;
    }

    loop.intensity = intensity;

    if (loop.gains && loop.gains[3]) {
      const masterGain = loop.gains[3];
      const now = masterGain.context.currentTime;
      const clampedIntensity = Math.min(intensity, 1.0) * 0.5;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(clampedIntensity, now + 0.05);
    }
  }

  stopLoop(type, pool) {
    const loop = this.activeLoops.get(type);
    if (!loop) {
      return;
    }

    const now = loop.oscillators[0].context.currentTime;
    loop.oscillators.forEach((osc) => {
      try {
        osc.stop(now + 0.01);
      } catch (error) {
        // Already stopped.
      }
    });

    try {
      loop.source.stop(now + 0.01);
    } catch (error) {
      // Already stopped.
    }

    if (loop.filters && Array.isArray(loop.filters)) {
      loop.filters.forEach((filter) => {
        try {
          filter.disconnect();
        } catch (error) {
          // Already disconnected.
        }
      });
    }

    if (pool) {
      setTimeout(() => {
        loop.gains.forEach((gain) => {
          try {
            gain.disconnect();
            pool.returnGain(gain);
          } catch (error) {
            // Ignore pool cleanup failures.
          }
        });
      }, 50);
    }

    this.activeLoops.delete(type);
  }

  isActive(type) {
    return this.activeLoops.has(type);
  }

  cleanup(pool) {
    for (const [, loop] of this.activeLoops) {
      loop.oscillators.forEach((osc) => {
        try {
          osc.stop();
        } catch (error) {
          // Already stopped.
        }
      });

      try {
        loop.source.stop();
      } catch (error) {
        // Already stopped.
      }

      if (pool) {
        loop.gains.forEach((gain) => {
          try {
            gain.disconnect();
            pool.returnGain(gain);
          } catch (error) {
            // Ignore pool cleanup failures.
          }
        });
      }

      if (loop.filters && Array.isArray(loop.filters)) {
        loop.filters.forEach((filter) => {
          try {
            filter.disconnect();
          } catch (error) {
            // Ignore disconnect failures.
          }
        });
      }
    }

    this.activeLoops.clear();
  }
}

export default ThrusterLoopManager;
