// The pilot's own feedback on the protected bus (never ducks): bullet hit landed, ship hit taken, dash and brake whooshes, the low-health warning.
// Plus the Harmonic beam, the player's second weapon, on the ambient bus with reverb.
// The bodies came from SFXBus.js unchanged.
import { AUDIO_REVERB_SEND_DB } from '../../../data/audio/mix.js';

// proposta 18/10: the dash is a band-passed noise whoosh sweeping up (and
// across, toward the dash) over a soft sub thump; quieter than a shot, never
// retriggered within minInterval s (one voice at a time).
const DASH_SFX = Object.freeze({
  seconds: 0.3,
  attack: 0.03,
  peak: 0.22,
  fromHz: 500,
  toHz: 3200,
  q: 1.1,
  sweepPan: 0.35,
  thump: Object.freeze({ fromHz: 120, toHz: 45, peak: 0.12, seconds: 0.12 }),
  minInterval: 0.25,
});
// proposta 18/10: the emergency brake is a reverse-thruster burst (noise, its
// band sweeping down) and a low thud once the ship is at rest, `thud.delay`
// s in (the brake's stopTime, data/upgrades/mobility.js).
const BRAKE_SFX = Object.freeze({
  seconds: 0.3,
  attack: 0.015,
  peak: 0.2,
  fromHz: 2400,
  toHz: 350,
  q: 0.9,
  thud: Object.freeze({
    delay: 0.1,
    fromHz: 85,
    toHz: 38,
    peak: 0.16,
    seconds: 0.18,
  }),
  minInterval: 0.25,
});

/**
 * Player cues: hits landed and taken, dash, brake, low-health warning and the Harmonic beam.
 * @param {import('../SFXBus.js').SfxKit} sfx - the bus toolkit (live handles,
 *   routing and the shared synth primitives); never the bus itself.
 */
export function createPlayerCues(sfx) {
  let lastDashTime = -Infinity;
  let lastBrakeTime = -Infinity;

  function playBulletHit(killed = false) {
    sfx.safePlay(() => {
      const osc = sfx.context.createOscillator();
      const gain = sfx.context.createGain();

      osc.connect(gain);
      // Player-landed hit — protected branch (player feedback never ducks).
      sfx.connectProtected(gain);

      osc.type = 'square';

      if (killed) {
        // Kill confirm: Lower pitch, longer, more satisfying
        osc.frequency.setValueAtTime(220, sfx.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(
          90,
          sfx.context.currentTime + 0.15
        );

        gain.gain.setValueAtTime(0.15, sfx.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          sfx.context.currentTime + 0.15
        );

        osc.start();
        osc.stop(sfx.context.currentTime + 0.15);
      } else {
        // Hit confirm: Higher pitch, quick, subtle
        osc.frequency.setValueAtTime(440, sfx.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(
          220,
          sfx.context.currentTime + 0.06
        );

        gain.gain.setValueAtTime(0.08, sfx.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          sfx.context.currentTime + 0.06
        );

        osc.start();
        osc.stop(sfx.context.currentTime + 0.06);
      }
    });
  }

  function playShipHit() {
    sfx.safePlay(() => {
      const osc = sfx.context.createOscillator();
      const gain = sfx.context.createGain();

      osc.connect(gain);
      // Player damage taken — protected branch (player feedback never ducks).
      sfx.connectProtected(gain);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, sfx.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        40,
        sfx.context.currentTime + 0.3
      );

      gain.gain.setValueAtTime(0.2, sfx.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        sfx.context.currentTime + 0.3
      );

      osc.start();
      osc.stop(sfx.context.currentTime + 0.3);
    });
  }

  /**
   * Dash (DASH_SFX): the whoosh pans from `pan` toward `directionX`, the dash
   * direction's x. Player feedback → protected bus.
   */
  function playDash({ pan = 0, directionX = 0 } = {}) {
    sfx.trackPerformance('playDash');

    sfx.safePlay(() => {
      const now = sfx.context.currentTime;
      if (now - lastDashTime < DASH_SFX.minInterval) return;
      lastDashTime = now;

      const panner = sfx.protectedPanner(pan);
      panner.pan.setValueAtTime(pan, now);
      panner.pan.linearRampToValueAtTime(
        Math.max(-1, Math.min(1, pan + directionX * DASH_SFX.sweepPan)),
        now + DASH_SFX.seconds
      );
      sfx.maneuverNoise(panner, now, DASH_SFX);
      sfx.maneuverTone(panner, now, DASH_SFX.thump);
    });
  }

  /** Emergency brake (BRAKE_SFX). Player feedback → protected bus. */
  function playBrake({ pan = 0 } = {}) {
    sfx.trackPerformance('playBrake');

    sfx.safePlay(() => {
      const now = sfx.context.currentTime;
      if (now - lastBrakeTime < BRAKE_SFX.minInterval) return;
      lastBrakeTime = now;

      const panner = sfx.protectedPanner(pan);
      sfx.maneuverNoise(panner, now, BRAKE_SFX);
      sfx.maneuverTone(panner, now + BRAKE_SFX.thud.delay, BRAKE_SFX.thud);
    });
  }

  function playLowHealthWarning() {
    sfx.safePlay(() => {
      const now = sfx.context.currentTime;

      // Two-tone alarm pattern - Triangle waves for less harshness
      for (let i = 0; i < 2; i++) {
        const osc = sfx.context.createOscillator();
        const gain = sfx.context.createGain();
        const filter = sfx.context.createBiquadFilter();

        osc.connect(gain);
        gain.connect(filter);
        // Player danger warning — protected branch (must cut through, never duck).
        sfx.connectProtected(filter);

        const offset = i * 0.15; // Stagger the beeps
        const freq = i === 0 ? 880 : 660; // High-low pattern

        osc.type = 'triangle'; // Softer than square
        osc.frequency.setValueAtTime(freq, now + offset);

        // Lowpass to dampen
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, now + offset);

        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(0.12, now + offset + 0.02); // Slightly lower volume
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);

        osc.start(now + offset);
        osc.stop(now + offset + 0.12);
      }
    });
  }

  /** Harmonic beam fired: 0.18 s bright saw sweep over a sine sub body, panned, small reverb send. */
  function playHarmonicBeam({ pan = 0 } = {}) {
    sfx.trackPerformance('playHarmonicBeam');

    sfx.safePlay(() => {
      const destination = sfx.ambientInput(pan);
      if (!destination) return;

      const now = sfx.context.currentTime;
      const gain = sfx.context.createGain();
      gain.connect(destination);
      sfx.sendToReverb(gain, AUDIO_REVERB_SEND_DB.levelUp - 6);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      const saw = sfx.context.createOscillator();
      saw.type = 'sawtooth';
      saw.frequency.setValueAtTime(1800, now);
      saw.frequency.exponentialRampToValueAtTime(500, now + 0.18);
      const filter = sfx.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(5000, now);
      filter.frequency.exponentialRampToValueAtTime(1200, now + 0.18);
      saw.connect(filter);
      filter.connect(gain);

      const sub = sfx.context.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(140, now);
      sub.frequency.exponentialRampToValueAtTime(70, now + 0.18);
      sub.connect(gain);

      saw.start(now);
      sub.start(now);
      saw.stop(now + 0.2);
      sub.stop(now + 0.2);
    });
  }

  return {
    playBulletHit,
    playShipHit,
    playDash,
    playBrake,
    playLowHealthWarning,
    playHarmonicBeam,
  };
}
