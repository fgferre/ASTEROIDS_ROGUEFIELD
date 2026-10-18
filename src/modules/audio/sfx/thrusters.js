// Thruster cues: start burst, sustained loop (owned by the bus's ThrusterLoopManager, reached as sfx.thrusterLoops) and stop release.
// World sounds on the ambient bus (ducks); manual loops wait out their start burst in a pending map so one press starts once.
// The bodies came from SFXBus.js unchanged.
import { requireRandom } from '../../../utils/randomHelpers.js';

/**
 * Thruster cues: player propulsion loops on the ambient bus.
 * @param {import('../SFXBus.js').SfxKit} sfx - the bus toolkit (live handles,
 *   routing and the shared synth primitives); never the bus itself.
 */
export function createThrusterCues(sfx) {
  // Manual thruster loops waiting out their start burst: type → {timer,
  // intensity}. A pending type counts as active, so one press starts once.
  const pendingThrusterStarts = new Map();

  /**
   * Start a thruster loop (and burst for manual thrusters).
   * @param {string} type
   * @param {number} intensity
   * @param {boolean} isAutomatic
   */
  function startThrusterLoop(type, intensity, isAutomatic = false) {
    sfx.trackPerformance(`_startThrusterSound:${type}`);
    if (isThrusterActive(type)) return null;

    if (isAutomatic) {
      const randomScope = getThrusterRandomScope(type);
      const variation = Math.floor(
        requireRandom(randomScope, 'audio.sfx.thruster').range(0, 3)
      );

      // Reduce intensity for automatic thrusters (softer spray sound)
      const autoIntensity = intensity * 0.4; // 60% reduction for subtle auto-damping

      sfx.thrusterLoops.startLoop(
        type,
        variation,
        autoIntensity,
        sfx.context,
        sfx.pool,
        sfx.cache,
        randomScope,
        (node) => sfx.connectAmbient(node)
      );
      return null;
    }

    // Manual thrusters: play burst then loop after a short delay. The type is
    // pending meanwhile, so the frames in between update it instead of
    // queueing more starts.
    playThrusterStartBurst(type);

    const pending = { timer: null, intensity };
    pending.timer = setTimeout(
      () => {
        pendingThrusterStarts.delete(type);
        if (!sfx.context) return;

        const randomScope = getThrusterRandomScope(type);
        const variation = Math.floor(
          requireRandom(randomScope, 'audio.sfx.thruster').range(0, 3)
        );

        sfx.thrusterLoops.startLoop(
          type,
          variation,
          pending.intensity,
          sfx.context,
          sfx.pool,
          sfx.cache,
          randomScope,
          (node) => sfx.connectAmbient(node)
        );
      },
      type === 'side' ? 80 : type === 'retro' ? 140 : 160
    ); // Delay ajustado para burst mais longo
    pendingThrusterStarts.set(type, pending);
    return pending.timer;
  }

  function updateThrusterLoop(type, intensity) {
    const pending = pendingThrusterStarts.get(type);
    if (pending) {
      pending.intensity = intensity;
      return;
    }
    sfx.thrusterLoops.updateLoop(type, intensity);
  }

  /** Cancel the delayed loop starts still waiting out their burst. @private */
  function cancelPendingThrusterStarts(type = null) {
    for (const [key, pending] of pendingThrusterStarts) {
      if (type !== null && key !== type) continue;
      clearTimeout(pending.timer);
      pendingThrusterStarts.delete(key);
    }
  }

  function stopThrusterLoop(type, skipRelease = false) {
    sfx.trackPerformance(`_stopThrusterSound:${type}`);

    // Stop loop first (or the start still waiting out its burst)
    cancelPendingThrusterStarts(type);
    sfx.thrusterLoops.stopLoop(type, sfx.pool);

    // Play stop release sound only for manual thrusters
    if (!skipRelease) {
      playThrusterStopRelease(type);
    }
  }

  function isThrusterActive(type) {
    return pendingThrusterStarts.has(type) || sfx.thrusterLoops.isActive(type);
  }

  function playThrusterStartBurst(type) {
    sfx.safePlay(() => {
      const randomScope = getThrusterRandomScope(type);
      const now = sfx.context.currentTime;

      // Duration varies by thruster type
      // Ajustado para sons graves, suaves e realistas de ignição (como release)
      let duration, pitchStart, pitchEnd, gainPeak;
      if (type === 'main') {
        duration =
          0.24 + (randomScope?.range ? randomScope.range(-0.02, 0.06) : 0);
        pitchStart = 90; // MUITO mais grave (era 140)
        pitchEnd = 120; // Ramp suave e grave (era 170)
        gainPeak = 0.15; // Mais suave ainda (-16dB, era -9dB)
      } else if (type === 'retro') {
        duration =
          0.2 + (randomScope?.range ? randomScope.range(-0.02, 0.05) : 0);
        pitchStart = 100; // Muito mais grave (era 180)
        pitchEnd = 130; // Descending suave (era 150)
        gainPeak = 0.12; // Mais suave (-18dB, era -10dB)
      } else {
        // side
        duration =
          0.14 + (randomScope?.range ? randomScope.range(-0.01, 0.04) : 0);
        pitchStart =
          140 + (randomScope?.range ? randomScope.range(-10, 10) : 0); // Mais grave (era 220)
        pitchEnd = 110; // Muito mais grave (era 180)
        gainPeak = 0.1; // Mais suave (-20dB, era -12dB)
      }

      // Create oscillator - Triangle wave para suavidade (meio termo entre sine e sawtooth)
      const osc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const oscGain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();

      osc.type = 'triangle'; // Triangle é mais suave que sawtooth/square mas com mais corpo que sine
      osc.frequency.setValueAtTime(pitchStart, now);
      osc.frequency.linearRampToValueAtTime(pitchEnd, now + duration);

      osc.connect(oscGain);

      // Create noise burst
      let noiseBuffer;
      const familyName =
        type === 'main'
          ? 'thrusterMain'
          : type === 'retro'
            ? 'thrusterRetro'
            : 'thrusterSide';

      if (sfx.cache) {
        noiseBuffer = sfx.cache.getNoiseBuffer(duration * 0.8, true, 'linear', {
          family: familyName,
          random: randomScope,
        });
      } else {
        const bufferSize = Math.floor(sfx.context.sampleRate * duration * 0.8);
        noiseBuffer = sfx.context.createBuffer(
          1,
          bufferSize,
          sfx.context.sampleRate
        );
        const output = noiseBuffer.getChannelData(0);
        const noiseRandom = requireRandom(randomScope, 'audio.sfx.thruster');
        for (let i = 0; i < bufferSize; i++) {
          const progress = i / bufferSize;
          output[i] = noiseRandom.range(-1, 1) * (1 - progress);
        }
      }

      const noise = sfx.pool
        ? sfx.pool.getBufferSource()
        : sfx.context.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = sfx.pool
        ? sfx.pool.getGain()
        : sfx.context.createGain();
      noise.connect(noiseGain);

      // Apply EQ filter chain (muito suave, grave e warm)
      const hpf = sfx.context.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.setValueAtTime(70, now); // Deixa passar graves (era 80)

      const peaking1 = sfx.context.createBiquadFilter();
      peaking1.type = 'peaking';
      peaking1.frequency.setValueAtTime(150, now); // Mais grave/warmth (era 200)
      peaking1.Q.setValueAtTime(0.6, now); // Q menor = mais suave (era 0.8)
      peaking1.gain.setValueAtTime(1.5, now); // +1.5dB bump suave (era 2)

      const peaking2 = sfx.context.createBiquadFilter();
      peaking2.type = 'peaking';
      peaking2.frequency.setValueAtTime(1800, now); // Bem menos harsh (era 2500)
      peaking2.Q.setValueAtTime(0.5, now); // Q menor = mais suave (era 0.7)
      peaking2.gain.setValueAtTime(0.5, now); // +0.5dB presence mínima (era 1)

      // Lowpass agressivo para remover todas as frequências altas
      const lpf = sfx.context.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.setValueAtTime(2800, now); // Remove muito mais altas (era 5000)
      lpf.Q.setValueAtTime(0.5, now);

      // Connect filter chain
      oscGain.connect(hpf);
      noiseGain.connect(hpf);
      hpf.connect(peaking1);
      peaking1.connect(peaking2);
      peaking2.connect(lpf);
      sfx.connectAmbient(lpf);

      // Envelope (attack ainda mais longo para ignição muito suave)
      const attackTime =
        type === 'side'
          ? 0.025
          : 0.08 + (randomScope?.range ? randomScope.range(0, 0.03) : 0);

      // Balance osc/noise: ainda menos noise, mais oscillator para som tonal e suave
      oscGain.gain.setValueAtTime(0, now);
      oscGain.gain.linearRampToValueAtTime(gainPeak * 0.75, now + attackTime); // 75% osc (era 70%)
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noiseGain.gain.setValueAtTime(0, now);
      noiseGain.gain.linearRampToValueAtTime(gainPeak * 0.25, now + attackTime); // 25% noise (era 30%)
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      // Start and stop
      osc.start(now);
      osc.stop(now + duration);
      noise.start(now);
      noise.stop(now + duration);

      // Return gains to pool
      if (sfx.pool) {
        setTimeout(
          () => {
            sfx.pool.returnGain(oscGain);
            sfx.pool.returnGain(noiseGain);
          },
          duration * 1000 + 50
        );
      }
    });
  }

  function playThrusterStopRelease(type) {
    sfx.safePlay(() => {
      const randomScope = getThrusterRandomScope(type);
      const now = sfx.context.currentTime;

      // Duration varies by thruster type - mais longo para fade suave
      let duration, pitchStart, pitchEnd, gainPeak;
      if (type === 'main') {
        duration = 0.2 + (randomScope?.range ? randomScope.range(0, 0.08) : 0);
        pitchStart = 110; // Muito mais grave (era 180)
        pitchEnd = 70; // Drop suave e grave (era 150)
        gainPeak = 0.12; // MUITO mais suave (era 0.707 = -3dB, agora ~-18dB)
      } else if (type === 'retro') {
        duration = 0.18 + (randomScope?.range ? randomScope.range(0, 0.06) : 0);
        pitchStart = 120;
        pitchEnd = 75;
        gainPeak = 0.1; // Muito mais suave (era 0.63, agora ~-20dB)
      } else {
        // side
        duration = 0.15 + (randomScope?.range ? randomScope.range(0, 0.04) : 0);
        pitchStart = 140;
        pitchEnd = 85;
        gainPeak = 0.08; // Muito mais suave (era 0.5, agora ~-22dB)
      }

      // Create oscillator - SINE wave para suavidade máxima
      const osc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const gain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();

      osc.type = 'sine'; // Sine é muito mais suave que sawtooth/square
      osc.frequency.setValueAtTime(pitchStart, now);
      osc.frequency.exponentialRampToValueAtTime(pitchEnd, now + duration);

      osc.connect(gain);

      // Apply lowpass filter agressivo - remove todas as frequências altas
      const lpf = sfx.context.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.setValueAtTime(1200, now); // Começa já bem baixo (era 4000)
      lpf.frequency.exponentialRampToValueAtTime(400, now + duration); // Termina muito baixo (era 800)
      lpf.Q.setValueAtTime(0.5, now); // Q baixo = rolloff suave

      gain.connect(lpf);
      sfx.connectAmbient(lpf);

      // Gentle release envelope - fade out muito gradual
      gain.gain.setValueAtTime(gainPeak, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.start(now);
      osc.stop(now + duration);

      // Return gain to pool
      if (sfx.pool) {
        setTimeout(
          () => {
            sfx.pool.returnGain(gain);
          },
          duration * 1000 + 50
        );
      }
    });
  }

  function getThrusterRandomScope(type) {
    const scopes = sfx.randomScopes;
    if (type === 'main') {
      return (
        scopes?.families?.thrusterMain ||
        scopes?.families?.thruster ||
        scopes?.base
      );
    } else if (type === 'retro') {
      return (
        scopes?.families?.thrusterRetro ||
        scopes?.families?.thruster ||
        scopes?.base
      );
    } else {
      // side
      return (
        scopes?.families?.thrusterSide ||
        scopes?.families?.thruster ||
        scopes?.base
      );
    }
  }

  return {
    startThrusterLoop,
    updateThrusterLoop,
    stopThrusterLoop,
    isThrusterActive,
    cancelPendingThrusterStarts,
  };
}
