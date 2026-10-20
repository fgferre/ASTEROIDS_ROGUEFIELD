// Progression cues: run-progression and reward sounds on the ambient bus
// (world/enemy, ducks): salvage, Hangar purchase, tip chime, weapon evolution,
// card reroll/banish, Codex discovery, pickups (collected and spawned), level-up,
// orb fusion, gold spawn/jackpot and the upgrade pick. The bodies came from
// SFXBus.js unchanged.
import { AUDIO_REVERB_SEND_DB } from '../../../data/audio/mix.js';

/**
 * Progression cues: salvage, purchases, evolutions, cards, pickups and level-ups.
 * @param {import('../SFXBus.js').SfxKit} sfx - the bus toolkit (live handles,
 *   routing and the shared synth primitives); never the bus itself.
 */
export function createProgressionCues(sfx) {
  /** Run-end salvage: short metallic coin cascade, 3-5 ticks by amount, no pan. */
  function playSalvageAwarded(amount = 0) {
    sfx.trackPerformance('playSalvageAwarded');

    sfx.safePlay(() => {
      const destination = sfx.ambientDestination();
      if (!destination) return;

      const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
      const ticks = Math.min(5, 3 + Math.floor(safeAmount / 100));
      const now = sfx.context.currentTime;
      for (let i = 0; i < ticks; i += 1) {
        const start = now + i * 0.07;
        const osc = sfx.context.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1800 + i * 150, start);
        const filter = sfx.context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2800, start);
        filter.Q.setValueAtTime(4, start);
        const gain = sfx.context.createGain();
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.07, start + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.09);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(destination);
        osc.start(start);
        osc.stop(start + 0.1);
      }
    });
  }

  /** Hangar purchase: low mechanical clunk followed by a confirm tone. */
  function playHangarPurchase() {
    sfx.trackPerformance('playHangarPurchase');

    sfx.safePlay(() => {
      const destination = sfx.ambientDestination();
      if (!destination) return;

      const now = sfx.context.currentTime;
      const clunk = sfx.context.createOscillator();
      clunk.type = 'triangle';
      clunk.frequency.setValueAtTime(140, now);
      clunk.frequency.exponentialRampToValueAtTime(55, now + 0.12);
      const clunkGain = sfx.context.createGain();
      clunkGain.gain.setValueAtTime(0.0001, now);
      clunkGain.gain.exponentialRampToValueAtTime(0.25, now + 0.008);
      clunkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      clunk.connect(clunkGain);
      clunkGain.connect(destination);
      clunk.start(now);
      clunk.stop(now + 0.2);

      const tone = sfx.context.createOscillator();
      tone.type = 'sine';
      tone.frequency.setValueAtTime(660, now + 0.12);
      tone.frequency.setValueAtTime(880, now + 0.2);
      const toneGain = sfx.context.createGain();
      toneGain.gain.setValueAtTime(0.0001, now + 0.12);
      toneGain.gain.exponentialRampToValueAtTime(0.1, now + 0.14);
      toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      tone.connect(toneGain);
      toneGain.connect(destination);
      tone.start(now + 0.12);
      tone.stop(now + 0.5);
    });
  }

  /** First-run tip: very soft two-note chime (UI select gain 0.12 at -12 dB). */
  function playTipChime() {
    sfx.trackPerformance('playTipChime');

    sfx.safePlay(() => {
      const destination = sfx.ambientDestination();
      if (!destination) return;

      const now = sfx.context.currentTime;
      [
        [880, 0],
        [1320, 0.12],
      ].forEach(([frequency, offset]) => {
        const start = now + offset;
        const osc = sfx.context.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, start);
        const gain = sfx.context.createGain();
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.03, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
        osc.connect(gain);
        gain.connect(destination);
        osc.start(start);
        osc.stop(start + 0.3);
      });
    });
  }

  /** Weapon evolved: rising three-note chord with a shimmer tail, reverb. */
  function playWeaponEvolved() {
    sfx.trackPerformance('playWeaponEvolved');

    sfx.safePlay(() => {
      const destination = sfx.ambientDestination();
      if (!destination) return;

      const now = sfx.context.currentTime;
      [
        [392, 0],
        [494, 0.09],
        [587, 0.18],
      ].forEach(([frequency, offset]) => {
        const osc = sfx.context.createOscillator();
        const gain = sfx.context.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(frequency, now + offset);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.12, now + offset + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        osc.connect(gain);
        gain.connect(destination);
        sfx.sendToReverb(gain, AUDIO_REVERB_SEND_DB.levelUp);
        osc.start(now + offset);
        osc.stop(now + 0.92);
      });

      // Shimmer tail: two detuned high sines fading in late.
      [1568, 1576].forEach((frequency) => {
        const osc = sfx.context.createOscillator();
        const gain = sfx.context.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, now + 0.2);
        gain.gain.setValueAtTime(0.0001, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.04, now + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
        osc.connect(gain);
        gain.connect(destination);
        sfx.sendToReverb(gain, AUDIO_REVERB_SEND_DB.levelUp);
        osc.start(now + 0.2);
        osc.stop(now + 1.12);
      });
    });
  }

  /** Upgrade card rerolled: quick shuffle noise burst plus a tick. */
  function playCardReroll() {
    sfx.trackPerformance('playCardReroll');

    sfx.safePlay(() => {
      const destination = sfx.ambientDestination();
      if (!destination) return;

      const now = sfx.context.currentTime;
      const rate = sfx.context.sampleRate;
      const length = Math.max(1, Math.floor(rate * 0.12));
      const buffer = sfx.context.createBuffer(1, length, rate);
      const output = buffer.getChannelData(0);
      const rng = sfx.resolveRandom(
        sfx.randomScopes?.bufferFamilies?.explosion,
        sfx.randomScopes?.families?.explosion,
        sfx.randomScopes?.base
      );
      for (let i = 0; i < length; i += 1) {
        output[i] = (rng.float() * 2 - 1) * (1 - i / length);
      }
      const noise = sfx.context.createBufferSource();
      noise.buffer = buffer;
      const filter = sfx.context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(3000, now);
      filter.Q.setValueAtTime(1.2, now);
      const noiseGain = sfx.context.createGain();
      noiseGain.gain.setValueAtTime(0.1, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(destination);
      noise.start(now);

      const tick = sfx.context.createOscillator();
      const tickGain = sfx.context.createGain();
      tick.type = 'square';
      tick.frequency.setValueAtTime(1200, now + 0.1);
      tickGain.gain.setValueAtTime(0.0001, now + 0.1);
      tickGain.gain.exponentialRampToValueAtTime(0.06, now + 0.105);
      tickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      tick.connect(tickGain);
      tickGain.connect(destination);
      tick.start(now + 0.1);
      tick.stop(now + 0.17);
    });
  }

  /** Upgrade card banished: short descending tone with a low thud. */
  function playCardBanish() {
    sfx.trackPerformance('playCardBanish');

    sfx.safePlay(() => {
      const destination = sfx.ambientDestination();
      if (!destination) return;

      const now = sfx.context.currentTime;
      const tone = (type, start, end, duration, peak) => {
        const osc = sfx.context.createOscillator();
        const gain = sfx.context.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(start, now);
        osc.frequency.exponentialRampToValueAtTime(end, now + duration);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(peak, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        osc.connect(gain);
        gain.connect(destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
      };
      tone('triangle', 700, 220, 0.22, 0.1);
      tone('sine', 90, 45, 0.2, 0.25);
    });
  }

  /** Codex entry discovered: soft two-note chime, unpanned. */
  function playCodexDiscovered() {
    sfx.trackPerformance('playCodexDiscovered');

    sfx.safePlay(() => {
      const destination = sfx.ambientDestination();
      if (!destination) return;

      const now = sfx.context.currentTime;
      [
        [880, 0],
        [1319, 0.12],
      ].forEach(([frequency, offset]) => {
        const osc = sfx.context.createOscillator();
        const gain = sfx.context.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, now + offset);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.07, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.5);
        osc.connect(gain);
        gain.connect(destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.52);
      });
    });
  }

  /**
   * Pickup collected: per-kind cue (magnet arpeggio, pulse thump, overcharge
   * zap, repair rising chord, stasis glassy fall, salvage clinks, the chest's
   * opening low swell and chime).
   * @param {'magnet'|'pulse'|'overcharge'|'repair'|'stasis'|'salvage'|'chest'} kind
   */
  function playPickupCollected(kind) {
    sfx.trackPerformance('playPickupCollected');

    sfx.safePlay(() => {
      const destination = sfx.ambientDestination();
      if (!destination) return;

      const now = sfx.context.currentTime;
      const tone = (type, start, end, at, duration, peak) => {
        const osc = sfx.context.createOscillator();
        const gain = sfx.context.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(start, now + at);
        if (end !== start) {
          osc.frequency.exponentialRampToValueAtTime(end, now + at + duration);
        }
        gain.gain.setValueAtTime(0.0001, now + at);
        gain.gain.exponentialRampToValueAtTime(peak, now + at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, now + at + duration);
        osc.connect(gain);
        gain.connect(destination);
        osc.start(now + at);
        osc.stop(now + at + duration + 0.02);
        return gain;
      };

      if (kind === 'magnet') {
        [440, 554, 659, 880].forEach((frequency, index) => {
          tone('triangle', frequency, frequency, index * 0.05, 0.12, 0.1);
        });
      } else if (kind === 'pulse') {
        const thump = tone('sine', 120, 40, 0, 0.35, 0.3);
        tone('triangle', 200, 900, 0.02, 0.3, 0.08);
        sfx.sendToReverb(thump, AUDIO_REVERB_SEND_DB.explosionMedium);
      } else if (kind === 'overcharge') {
        tone('sawtooth', 400, 1800, 0, 0.22, 0.09);
        tone('square', 800, 2400, 0.04, 0.18, 0.05);
      } else if (kind === 'repair') {
        [392, 494, 587].forEach((frequency, index) => {
          tone('sine', frequency, frequency * 1.5, index * 0.06, 0.3, 0.09);
        });
      } else if (kind === 'stasis') {
        tone('triangle', 2200, 660, 0, 0.5, 0.08);
        tone('sine', 1760, 1320, 0.03, 0.6, 0.06);
      } else if (kind === 'salvage') {
        [1200, 1500, 1350].forEach((frequency, index) => {
          tone('square', frequency, frequency, index * 0.07, 0.06, 0.04);
        });
      } else if (kind === 'chest') {
        const swell = tone('sine', 90, 180, 0, 0.6, 0.25);
        tone('triangle', 660, 1320, 0.12, 0.5, 0.08);
        sfx.sendToReverb(swell, AUDIO_REVERB_SEND_DB.explosionMedium);
      }
    });
  }

  /**
   * Pickup appeared: soft chime, panned.
   * @param {{pan?: number}} [options]
   */
  function playPickupSpawned({ pan = 0 } = {}) {
    sfx.trackPerformance('playPickupSpawned');

    sfx.safePlay(() => {
      const destination = sfx.ambientInput(pan);
      if (!destination) return;

      const now = sfx.context.currentTime;
      [880, 1320].forEach((frequency, index) => {
        const osc = sfx.context.createOscillator();
        const gain = sfx.context.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.05 / (index + 1), now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(destination);
        osc.start(now);
        osc.stop(now + 0.42);
      });
    });
  }

  function playLevelUp() {
    sfx.safePlay(() => {
      const frequencies = [440, 554, 659, 880, 1108];
      frequencies.forEach((freq, index) => {
        const osc = sfx.context.createOscillator();
        const gain = sfx.context.createGain();

        osc.connect(gain);
        sfx.connectAmbient(gain);
        sfx.sendToReverb(gain, AUDIO_REVERB_SEND_DB.levelUp);

        const startTime = sfx.context.currentTime + index * 0.06;
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.1, startTime + 0.04);
        gain.gain.linearRampToValueAtTime(0, startTime + 0.18);

        osc.start(startTime);
        osc.stop(startTime + 0.18);
      });
    });
  }

  function playOrbFusion(toClass) {
    // Beautiful ascending fusion sound based on tier
    sfx.safePlay(() => {
      // Map tier classes to base frequencies
      const tierFrequencies = {
        green: 523, // C5 (tier 2)
        yellow: 659, // E5 (tier 3)
        purple: 784, // G5 (tier 4)
        red: 988, // B5 (tier 5)
        crystal: 1175, // D6 (tier 6)
      };

      const baseFreq = tierFrequencies[toClass] || 440;

      // Sparkle effect: quick ascending notes
      const sparkleNotes = [baseFreq * 0.75, baseFreq, baseFreq * 1.25];
      sparkleNotes.forEach((freq, index) => {
        const osc = sfx.context.createOscillator();
        const gain = sfx.context.createGain();

        osc.connect(gain);
        sfx.connectAmbient(gain);

        osc.type = 'sine';
        const startTime = sfx.context.currentTime + index * 0.04;
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.08, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

        osc.start(startTime);
        osc.stop(startTime + 0.2);
      });

      // Bell-like "ding" for completion
      const bell = sfx.context.createOscillator();
      const bellGain = sfx.context.createGain();
      bell.connect(bellGain);
      sfx.connectAmbient(bellGain);

      bell.type = 'sine';
      const bellTime = sfx.context.currentTime + 0.12;
      bell.frequency.setValueAtTime(baseFreq * 2, bellTime);

      bellGain.gain.setValueAtTime(0, bellTime);
      bellGain.gain.linearRampToValueAtTime(0.12, bellTime + 0.01);
      bellGain.gain.exponentialRampToValueAtTime(0.001, bellTime + 0.4);

      bell.start(bellTime);
      bell.stop(bellTime + 0.4);
    });
  }

  function playGoldSpawn() {
    // Magical "bling!" sound when Gold asteroid spawns
    sfx.safePlay(() => {
      const frequencies = [880, 1108, 1318, 1760]; // A5-A6 arpeggio
      frequencies.forEach((freq, index) => {
        const osc = sfx.context.createOscillator();
        const gain = sfx.context.createGain();

        osc.connect(gain);
        sfx.connectAmbient(gain);

        osc.type = 'triangle';
        const startTime = sfx.context.currentTime + index * 0.05;
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.15, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

        osc.start(startTime);
        osc.stop(startTime + 0.3);
      });
    });
  }

  function playGoldJackpot() {
    // Epic jackpot sound when Gold asteroid is destroyed
    sfx.safePlay(() => {
      // First "ka" (percussive)
      const noise = sfx.context.createOscillator();
      const noiseGain = sfx.context.createGain();
      noise.connect(noiseGain);
      sfx.connectAmbient(noiseGain);

      noise.type = 'square';
      noise.frequency.setValueAtTime(100, sfx.context.currentTime);

      noiseGain.gain.setValueAtTime(0.2, sfx.context.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(
        0.001,
        sfx.context.currentTime + 0.05
      );

      noise.start();
      noise.stop(sfx.context.currentTime + 0.05);

      // Then "ching!" (bright bell)
      const frequencies = [1318, 1760, 2217]; // E6-A6-C#7
      frequencies.forEach((freq, index) => {
        const osc = sfx.context.createOscillator();
        const gain = sfx.context.createGain();

        osc.connect(gain);
        sfx.connectAmbient(gain);

        osc.type = 'sine';
        const startTime = sfx.context.currentTime + 0.05 + index * 0.02;
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.18, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);

        osc.start(startTime);
        osc.stop(startTime + 0.5);
      });
    });
  }

  function playUpgradeSelect(rarity = 'common') {
    const frequencies = {
      common: 440, // A4
      uncommon: 554, // C#5
      rare: 659, // E5
      epic: 784, // G5
    };

    const freq = frequencies[rarity] || 440;

    sfx.safePlay(() => {
      const osc = sfx.pool
        ? sfx.pool.getOscillator()
        : sfx.context.createOscillator();
      const gain = sfx.pool ? sfx.pool.getGain() : sfx.context.createGain();
      const filter = sfx.context.createBiquadFilter();

      // Chain: Osc -> Gain -> Filter -> Out
      osc.connect(gain);
      gain.connect(filter);
      sfx.connectAmbient(filter);

      const now = sfx.context.currentTime;

      // Filter for smoothness
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(2000, now + 0.15); // Open up

      osc.type = 'triangle'; // Richer than sine
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.2);

      // Envelope
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.start(now);
      osc.stop(now + 0.2);

      if (sfx.pool) {
        setTimeout(() => {
          sfx.pool.returnGain(gain);
          // Auto cleanup for osc
        }, 250);
      }
    });
  }

  return {
    playSalvageAwarded,
    playHangarPurchase,
    playTipChime,
    playWeaponEvolved,
    playCardReroll,
    playCardBanish,
    playCodexDiscovered,
    playPickupCollected,
    playPickupSpawned,
    playLevelUp,
    playOrbFusion,
    playGoldSpawn,
    playGoldJackpot,
    playUpgradeSelect,
  };
}
