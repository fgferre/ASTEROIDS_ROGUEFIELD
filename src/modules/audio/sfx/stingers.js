// Radio transmissions: the transmission squelch and its granular voice.
// World sounds on the ambient bus (ducks), each with a reverb send.
// The bodies came from SFXBus.js unchanged.
import { AUDIO_REVERB_SEND_DB } from '../../../data/audio/mix.js';
import { TRANSMISSION_VOICE } from '../../../data/audio/stingers.js';
import { dbToGain, midiToHz } from '../MusicThemes.js';

// Peak of the transmission squelch; the voice sits TRANSMISSION_VOICE.levelDb
// under it.
const TRANSMISSION_SQUELCH_PEAK = 0.09;

/**
 * Radio transmissions on the ambient bus.
 * @param {import('../SFXBus.js').SfxKit} sfx - the bus toolkit (live handles,
 *   routing and the shared synth primitives); never the bus itself.
 */
export function createStingerCues(sfx) {
  /** Warden transmission opens: band-limited radio squelch, then a soft cold tone. */
  function playTransmission() {
    sfx.trackPerformance('playTransmission');

    sfx.safePlay(() => {
      const destination = sfx.ambientDestination();
      if (!destination) return;

      const now = sfx.context.currentTime;
      // Squelch: a short burst of seeded noise through a narrow radio band.
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
        output[i] = rng.float() * 2 - 1;
      }
      const noise = sfx.context.createBufferSource();
      noise.buffer = buffer;
      const band = sfx.context.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.setValueAtTime(1800, now);
      band.Q.setValueAtTime(4, now);
      const noiseGain = sfx.context.createGain();
      noiseGain.gain.setValueAtTime(0.0001, now);
      noiseGain.gain.exponentialRampToValueAtTime(
        TRANSMISSION_SQUELCH_PEAK,
        now + 0.01
      );
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      noise.connect(band);
      band.connect(noiseGain);
      noiseGain.connect(destination);
      noise.start(now);

      // Carrier tone settling in after the squelch.
      const osc = sfx.context.createOscillator();
      const gain = sfx.context.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now + 0.1);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.5);
      gain.gain.setValueAtTime(0.0001, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.05, now + 0.16);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.connect(gain);
      gain.connect(destination);
      sfx.sendToReverb(gain, AUDIO_REVERB_SEND_DB.levelUp);
      osc.start(now + 0.1);
      osc.stop(now + 0.62);
    });
  }

  /**
   * Warden transmission voice: TRANSMISSION_VOICE.seconds of short grains
   * (low oscillator through the speaker's formant bandpass; WARDEN NULL
   * alternates its sub with highpassed whisper noise) starting as the squelch
   * closes, levelDb (plus the voice's gainDb) under the squelch peak, with a
   * reverb send. HERALD OF DUST alternates its tone with noise through the
   * formant (grit). Seeded onset jitter and detune.
   * @param {string} [speaker] - transmission speaker (STORY.speaker value)
   */
  function playTransmissionVoice(speaker) {
    sfx.trackPerformance('playTransmissionVoice');

    sfx.safePlay(() => {
      const destination = sfx.ambientDestination();
      if (!destination) return;

      const config = TRANSMISSION_VOICE;
      const voice =
        config.speakers[speaker] || config.speakers[config.defaultSpeaker];
      const context = sfx.context;
      const now = context.currentTime;
      const rng = sfx.resolveRandom(
        sfx.randomScopes?.families?.explosion,
        sfx.randomScopes?.base
      );

      const output = context.createGain();
      output.gain.value =
        TRANSMISSION_SQUELCH_PEAK *
        dbToGain(config.levelDb + (voice.gainDb ?? 0));
      output.connect(destination);
      sfx.sendToReverb(output, config.reverbSendDb);

      const formant = context.createBiquadFilter();
      formant.type = 'bandpass';
      formant.frequency.setValueAtTime(voice.formantHz, now);
      formant.Q.setValueAtTime(voice.formantQ, now);
      formant.connect(output);

      // Noise grains: highpassed whisper, or grit through the formant.
      let noiseTarget = formant;
      let noiseBuffer = null;
      if (voice.whisper || voice.grit) {
        if (voice.whisper) {
          noiseTarget = context.createBiquadFilter();
          noiseTarget.type = 'highpass';
          noiseTarget.frequency.setValueAtTime(config.whisperFilterHz, now);
          noiseTarget.connect(output);
        }
        const rate = context.sampleRate;
        const length = Math.max(1, Math.floor(rate * config.grainSeconds));
        noiseBuffer = context.createBuffer(1, length, rate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < length; i += 1) {
          data[i] = rng.float() * 2 - 1;
        }
      }

      const grain = config.grainSeconds;
      const span = config.seconds - grain - config.jitterSeconds;
      for (let i = 0; i < voice.grains; i += 1) {
        const start =
          now +
          config.delaySeconds +
          (span * i) / Math.max(1, voice.grains - 1) +
          rng.float() * config.jitterSeconds;
        const end = start + grain;
        const envelope = context.createGain();
        envelope.gain.setValueAtTime(0.0001, start);
        envelope.gain.linearRampToValueAtTime(1, start + grain / 2);
        envelope.gain.linearRampToValueAtTime(0.0001, end);

        let source;
        if (noiseBuffer && i % 2 === 1) {
          source = context.createBufferSource();
          source.buffer = noiseBuffer;
          envelope.connect(noiseTarget);
        } else {
          source = context.createOscillator();
          source.type = voice.type;
          source.frequency.setValueAtTime(
            midiToHz(voice.notes[i % voice.notes.length]),
            start
          );
          source.detune.setValueAtTime(
            (rng.float() - 0.5) * config.detuneCents,
            start
          );
          envelope.connect(formant);
        }
        source.connect(envelope);
        source.start(start);
        source.stop(end + 0.01);
      }
    });
  }

  return {
    playTransmission,
    playTransmissionVoice,
  };
}
