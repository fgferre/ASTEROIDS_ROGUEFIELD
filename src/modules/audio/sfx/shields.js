// Shield cues on the protected bus (player feedback, never ducks): activate, impact, break, recharged, fail, the shockwave, and the boss shield deflecting the player's shot.
// The bodies came from SFXBus.js unchanged.
import { AUDIO_REVERB_SEND_DB } from '../../../data/audio/mix.js';

/**
 * Shield cues: the player's shield on the protected bus.
 * @param {import('../SFXBus.js').SfxKit} sfx - the bus toolkit (live handles,
 *   routing and the shared synth primitives); never the bus itself.
 */
export function createShieldCues(sfx) {
  function playShieldActivate() {
    sfx.safePlay(() => {
      const osc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const gain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();

      osc.connect(gain);
      sfx.connectProtected(gain);
      sfx.sendToReverb(gain, AUDIO_REVERB_SEND_DB.shield);

      const now = sfx.context.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(540, now + 0.18);

      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.start(now);
      osc.stop(now + 0.18);

      if (sfx.pool) {
        setTimeout(() => {
          sfx.pool.returnGain(gain);
        }, 200);
      }
    });
  }

  function playShieldImpact() {
    sfx.safePlay(() => {
      // [NEO-ARCADE AUDIO] Punchy Blaster Shot
      const osc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const gain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();

      osc.connect(gain);
      sfx.connectProtected(gain);
      sfx.sendToReverb(gain, AUDIO_REVERB_SEND_DB.shield);

      const now = sfx.context.currentTime;
      const params = {}; // Assuming params might be passed or defined elsewhere, defaulting to empty for now
      // const pitchMult = 1.0; // Fixed base, modulated by params

      // Square wave for retro 'pixel' crunch
      osc.type = 'square';

      // Rapid pitch drop (Blaster effect)
      // Start high (880Hz) and drop quickly to low (110Hz)
      const startFreq = 880 * (params.pitchMultiplier || 1);
      const endFreq = 110;

      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.15);

      // Tight amplitude envelope
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.start(now);
      osc.stop(now + 0.16);

      // Return to pool using timeout
      if (sfx.pool) {
        setTimeout(() => {
          sfx.pool.returnGain(gain);
        }, 180);
      }
    });
  }

  function playBossShieldDeflect() {
    sfx.safePlay(() => {
      const osc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const gain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();

      osc.connect(gain);
      sfx.connectProtected(gain);

      const now = sfx.context.currentTime;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.08);

      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.start(now);
      osc.stop(now + 0.1);

      if (sfx.pool) {
        setTimeout(() => {
          sfx.pool.returnGain(gain);
        }, 120);
      }
    });
  }

  function playShieldBreak() {
    sfx.safePlay(() => {
      const osc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const gain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();

      osc.connect(gain);
      sfx.connectProtected(gain);
      sfx.sendToReverb(gain, AUDIO_REVERB_SEND_DB.shield);

      const now = sfx.context.currentTime;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.25);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.start(now);
      osc.stop(now + 0.25);

      if (sfx.pool) {
        setTimeout(() => {
          sfx.pool.returnGain(gain);
        }, 300);
      }
    });
  }

  function playShieldRecharged() {
    sfx.safePlay(() => {
      const osc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const gain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();

      osc.connect(gain);
      sfx.connectProtected(gain);
      sfx.sendToReverb(gain, AUDIO_REVERB_SEND_DB.shield);

      const now = sfx.context.currentTime;
      osc.type = 'square';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.setValueAtTime(540, now + 0.06);
      osc.frequency.setValueAtTime(660, now + 0.12);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.start(now);
      osc.stop(now + 0.18);

      if (sfx.pool) {
        setTimeout(() => {
          sfx.pool.returnGain(gain);
        }, 220);
      }
    });
  }

  function playShieldFail() {
    sfx.safePlay(() => {
      const osc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const gain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();

      osc.connect(gain);
      sfx.connectProtected(gain);
      sfx.sendToReverb(gain, AUDIO_REVERB_SEND_DB.shield);

      const now = sfx.context.currentTime;
      osc.type = 'square';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.12);

      gain.gain.setValueAtTime(0.1, now);
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

  function playShieldShockwave() {
    sfx.trackPerformance('playShieldShockwave');

    sfx.safePlay(() => {
      // Use cached noise buffer if available
      let noiseBuffer;
      if (sfx.cache) {
        noiseBuffer = sfx.cache.getNoiseBuffer(0.4, true, 'linear', {
          family: 'shield',
          random: sfx.randomScopes.bufferFamilies.shield,
        });
      } else {
        // Fallback to creating buffer
        noiseBuffer = sfx.context.createBuffer(
          1,
          sfx.context.sampleRate * 0.4,
          sfx.context.sampleRate
        );
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseBuffer.length; i++) {
          const bufferRandom =
            sfx.randomScopes.bufferFamilies.shield ||
            sfx.randomScopes.families.shield ||
            sfx.randomScopes.base ||
            null;
          const rng = sfx.resolveRandom(bufferRandom, sfx.randomScopes.base);
          const noiseSample =
            typeof rng.range === 'function'
              ? rng.range(-1, 1)
              : rng.float() * 2 - 1;
          output[i] = noiseSample * (1 - i / noiseBuffer.length);
        }
      }

      const noise = sfx.pool
        ? sfx.pool.getBufferSource()
        : sfx.context.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = sfx.pool
        ? sfx.pool.getGain()
        : sfx.context.createGain();

      const osc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const oscGain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();

      noise.connect(noiseGain);
      sfx.connectProtected(noiseGain);
      sfx.sendToReverb(noiseGain, AUDIO_REVERB_SEND_DB.shield);

      osc.connect(oscGain);
      sfx.connectProtected(oscGain);
      sfx.sendToReverb(oscGain, AUDIO_REVERB_SEND_DB.shield);

      const now = sfx.context.currentTime;
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
      if (sfx.pool) {
        setTimeout(() => {
          sfx.pool.returnGain(noiseGain);
          sfx.pool.returnGain(oscGain);
        }, 410);
      }
    });
  }

  return {
    playShieldActivate,
    playShieldImpact,
    playBossShieldDeflect,
    playShieldBreak,
    playShieldRecharged,
    playShieldFail,
    playShieldShockwave,
  };
}
