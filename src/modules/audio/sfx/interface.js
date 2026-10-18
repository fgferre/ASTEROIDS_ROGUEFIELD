// Interface cues: menu and HUD sounds on the ambient bus (world/enemy, ducks):
// pause open/close, menu transition, hover, select and the start-game swell.
// The bodies came from SFXBus.js unchanged.

/**
 * Interface cues: pause, menu transition, hover, select and start-game.
 * @param {import('../SFXBus.js').SfxKit} sfx - the bus toolkit (live handles,
 *   routing and the shared synth primitives); never the bus itself.
 */
export function createInterfaceCues(sfx) {
  function playPauseOpen() {
    sfx.safePlay(() => {
      const osc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const gain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();
      const filter = sfx.context.createBiquadFilter();

      osc.connect(gain);
      gain.connect(filter);
      sfx.connectAmbient(filter);

      const now = sfx.context.currentTime;

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

      if (sfx.pool) {
        setTimeout(() => {
          sfx.pool.returnGain(gain);
        }, 200);
      }
    });
  }

  function playPauseClose() {
    sfx.safePlay(() => {
      const osc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const gain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();

      osc.connect(gain);
      sfx.connectAmbient(gain);

      const now = sfx.context.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(450, now + 0.12);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.start(now);
      osc.stop(now + 0.12);

      if (sfx.pool) {
        setTimeout(() => {
          sfx.pool.returnGain(gain);
        }, 150);
      }
    });
  }

  function playMenuTransition() {
    sfx.safePlay(() => {
      const osc = sfx.context.createOscillator();
      const gain = sfx.context.createGain();
      const filter = sfx.context.createBiquadFilter();

      // Chain: Osc -> Gain -> Filter -> Out
      osc.connect(gain);
      gain.connect(filter);
      sfx.connectAmbient(filter);

      const now = sfx.context.currentTime;

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

  function playUIHover() {
    // No tracking needed for such freq event
    sfx.safePlay(() => {
      const now = sfx.context.currentTime;

      // Use a single oscillator for a clean "thip"
      const osc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const gain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();

      // Filter to remove sharp edges
      const filter = sfx.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1200; // Cut off harsh high sheen

      osc.connect(gain);
      gain.connect(filter);

      const destination = sfx.ambientDestination();
      if (destination) {
        filter.connect(destination);
      } else {
        sfx.connectAmbient(filter);
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
      if (sfx.pool) {
        setTimeout(() => {
          sfx.pool.returnGain(gain);
          // Oscillators are disposable and automatically cleaned up by AudioPool hook
        }, 50);
      }
    });
  }

  function playUISelect() {
    sfx.trackPerformance('playUISelect');
    sfx.safePlay(() => {
      const now = sfx.context.currentTime;

      const osc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const gain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();

      // Filter for glass texture
      const filter = sfx.context.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 400;

      osc.connect(gain);
      gain.connect(filter);

      const destination = sfx.ambientDestination();
      if (destination) {
        filter.connect(destination);
      } else {
        sfx.connectAmbient(filter);
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

      if (sfx.pool) {
        setTimeout(() => {
          sfx.pool.returnGain(gain);
          // Oscillators are disposable
        }, 150);
      }
    });
  }

  function playUIStartGame() {
    sfx.trackPerformance('playUIStartGame');
    sfx.safePlay(() => {
      const randomScope = sfx.randomScopes.families.uiStartGame;
      if (!randomScope) {
        console.warn(
          '[SFXBus] playUIStartGame: uiStartGame random scope not available'
        );
        return;
      }

      const now = sfx.context.currentTime;
      const variation = Math.floor(randomScope.range(0, 2));
      const duration = randomScope.range(0.3, 0.45);

      // === PING COMPONENT ===
      const osc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const oscGain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();

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
      const noiseBuffer = sfx.cache.getNoiseBuffer(
        duration * 0.6,
        0.05,
        'white',
        { family: 'uiStartGame', random: randomScope }
      );
      const noise = sfx.pool
        ? sfx.pool.getBufferSource()
        : sfx.context.createBufferSource();
      const noiseGain = sfx.pool
        ? sfx.pool.getGain()
        : sfx.context.createGain();
      noise.buffer = noiseBuffer;

      noise.connect(noiseGain);

      // Band-pass filter for whoosh (1-6kHz)
      const bpf = sfx.context.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.setValueAtTime(3500, now); // Center of 1-6kHz range
      bpf.Q.setValueAtTime(1.0, now);

      noiseGain.connect(bpf);

      // === DELAY-BASED REVERB (simplified approach) ===
      const delay = sfx.context.createDelay();
      const delayGain = sfx.pool
        ? sfx.pool.getGain()
        : sfx.context.createGain();
      const feedbackGain = sfx.pool
        ? sfx.pool.getGain()
        : sfx.context.createGain();

      delay.delayTime.setValueAtTime(0.08, now); // 80ms delay
      feedbackGain.gain.setValueAtTime(0.3, now); // 30% feedback for tail
      delayGain.gain.setValueAtTime(0.25, now); // -12dB wet signal

      // Delay feedback loop
      delay.connect(feedbackGain);
      feedbackGain.connect(delay); // Create feedback loop
      delay.connect(delayGain);
      sfx.connectAmbient(delayGain);

      // Send both ping and whoosh to delay
      oscGain.connect(delay);
      bpf.connect(delay);

      // === MASTER GAIN ===
      const masterGain = sfx.pool
        ? sfx.pool.getGain()
        : sfx.context.createGain();
      masterGain.gain.setValueAtTime(0.5, now); // -6dB peak

      // Connect dry signals to master
      oscGain.connect(masterGain);
      bpf.connect(masterGain);
      sfx.connectAmbient(masterGain);

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
            if (sfx.pool) {
              sfx.pool.returnGain(oscGain);
              sfx.pool.returnGain(noiseGain);
              sfx.pool.returnGain(delayGain);
              sfx.pool.returnGain(feedbackGain);
              sfx.pool.returnGain(masterGain);
            }
          } catch (e) {
            console.warn('[SFXBus] Cleanup error in playUIStartGame:', e);
          }
        },
        duration * 1000 + 200
      );
    });
  }

  return {
    playPauseOpen,
    playPauseClose,
    playMenuTransition,
    playUIHover,
    playUISelect,
    playUIStartGame,
  };
}
