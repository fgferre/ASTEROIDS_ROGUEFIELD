// Musical stingers and radio transmissions: elite spawn, surge, deep-field entry, the transmission squelch and its granular voice, the chapter stinger (the biome theme's motif) and the Warden stinger.
// World sounds on the ambient bus (ducks), each with a reverb send.
// The bodies came from SFXBus.js unchanged.
import { AUDIO_REVERB_SEND_DB } from '../../../data/audio/mix.js';
import {
  CHAPTER_STINGER,
  WARDEN_STINGER,
  TRANSMISSION_VOICE,
} from '../../../data/audio/stingers.js';
import { MUSIC_THEMES } from '../../../data/audio/music.js';
import { dbToGain, midiToHz, themeDegreeHz } from '../MusicThemes.js';

// Peak of the transmission squelch; the voice sits TRANSMISSION_VOICE.levelDb
// under it.
const TRANSMISSION_SQUELCH_PEAK = 0.09;

/**
 * Stinger cues: musical stingers and radio transmissions on the ambient bus.
 * @param {import('../SFXBus.js').SfxKit} sfx - the bus toolkit (live handles,
 *   routing and the shared synth primitives); never the bus itself.
 */
export function createStingerCues(sfx) {
  /** Elite spawned: low metallic chord (detuned squares, bandpassed), reverb. */
  function playEliteSpawned() {
    sfx.trackPerformance('playEliteSpawned');

    sfx.safePlay(() => {
      const destination = sfx.ambientDestination();
      if (!destination) return;

      const now = sfx.context.currentTime;
      const filter = sfx.context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(900, now);
      filter.Q.setValueAtTime(4, now);
      const gain = sfx.context.createGain();
      filter.connect(gain);
      gain.connect(destination);
      sfx.sendToReverb(gain, AUDIO_REVERB_SEND_DB.elite);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

      // Inharmonic ratios give the metallic ring; the fifth anchors the chord.
      [98, 147, 98 * 2.76].forEach((frequency, index) => {
        const osc = sfx.context.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(frequency, now);
        osc.detune.setValueAtTime((index - 1) * 7, now);
        osc.connect(filter);
        osc.start(now);
        osc.stop(now + 0.92);
      });
    });
  }

  /** Surge announced: rising two-note brass-like sting with a noise tail, reverb. */
  function playSurgeSting() {
    sfx.trackPerformance('playSurgeSting');

    sfx.safePlay(() => {
      const destination = sfx.ambientDestination();
      if (!destination) return;

      const now = sfx.context.currentTime;
      const filter = sfx.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(700, now);
      filter.frequency.exponentialRampToValueAtTime(2600, now + 0.35);
      const gain = sfx.context.createGain();
      filter.connect(gain);
      gain.connect(destination);
      sfx.sendToReverb(gain, AUDIO_REVERB_SEND_DB.boss);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.14, now + 0.04);
      gain.gain.setValueAtTime(0.14, now + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      [
        [165, 0],
        [247, 0.2],
      ].forEach(([frequency, offset]) => {
        const osc = sfx.context.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(frequency, now + offset);
        osc.connect(filter);
        osc.start(now + offset);
        osc.stop(now + 0.82);
      });

      // Noise tail from the seeded explosion family.
      const rate = sfx.context.sampleRate;
      const length = Math.max(1, Math.floor(rate * 0.6));
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
      const noiseFilter = sfx.context.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.setValueAtTime(2000, now);
      const noiseGain = sfx.context.createGain();
      noiseGain.gain.setValueAtTime(0.06, now + 0.2);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(destination);
      sfx.sendToReverb(noiseGain, AUDIO_REVERB_SEND_DB.boss);
      noise.start(now + 0.2);
    });
  }

  /** Endless run continued: low descending drone swell, bright ping at the end, reverb. */
  function playDeepFieldEntry() {
    sfx.trackPerformance('playDeepFieldEntry');

    sfx.safePlay(() => {
      const destination = sfx.ambientDestination();
      if (!destination) return;

      const now = sfx.context.currentTime;
      const drone = sfx.context.createOscillator();
      drone.type = 'sawtooth';
      drone.frequency.setValueAtTime(110, now);
      drone.frequency.exponentialRampToValueAtTime(45, now + 1.4);
      const filter = sfx.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, now);
      filter.frequency.exponentialRampToValueAtTime(150, now + 1.4);
      const droneGain = sfx.context.createGain();
      droneGain.gain.setValueAtTime(0.0001, now);
      droneGain.gain.exponentialRampToValueAtTime(0.16, now + 0.9);
      droneGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
      drone.connect(filter);
      filter.connect(droneGain);
      droneGain.connect(destination);
      sfx.sendToReverb(droneGain, AUDIO_REVERB_SEND_DB.deepFieldEntry);
      drone.start(now);
      drone.stop(now + 1.55);

      const ping = sfx.context.createOscillator();
      ping.type = 'sine';
      ping.frequency.setValueAtTime(1760, now + 1.2);
      const pingGain = sfx.context.createGain();
      pingGain.gain.setValueAtTime(0.0001, now + 1.2);
      pingGain.gain.exponentialRampToValueAtTime(0.1, now + 1.22);
      pingGain.gain.exponentialRampToValueAtTime(0.001, now + 2);
      ping.connect(pingGain);
      pingGain.connect(destination);
      sfx.sendToReverb(pingGain, AUDIO_REVERB_SEND_DB.deepFieldEntry);
      ping.start(now + 1.2);
      ping.stop(now + 2.05);
    });
  }

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

  /**
   * Chapter stinger: the biome theme's three-note motif in its own scale,
   * overlapping bell-like tones into the reverb (first layer of a biome).
   * @param {string} themeId - key of MUSIC_THEMES with a motif
   */
  function playChapterStinger(themeId) {
    sfx.trackPerformance('playChapterStinger');
    const theme = MUSIC_THEMES[themeId];
    if (!theme?.motif) return;

    sfx.safePlay(() => {
      const destination = sfx.ambientDestination();
      if (!destination) return;

      const config = CHAPTER_STINGER;
      const now = sfx.context.currentTime;
      theme.motif.forEach((degree, index) => {
        const at = now + index * config.spacingSeconds;
        const length =
          index === theme.motif.length - 1
            ? config.lastNoteSeconds
            : config.noteSeconds;
        const osc = sfx.context.createOscillator();
        const gain = sfx.context.createGain();
        osc.type = config.type;
        osc.frequency.setValueAtTime(
          themeDegreeHz(theme, degree, config.octave),
          at
        );
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(config.gain, at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, at + length);
        osc.connect(gain);
        gain.connect(destination);
        sfx.sendToReverb(gain, config.reverbSendDb);
        osc.start(at);
        osc.stop(at + length + 0.02);
      });
    });
  }

  /**
   * Warden stinger (boss-warning): a low detuned brass hit on the Warden root
   * whose filter closes, under a noise + sine riser that opens toward the
   * Warden layer. The boss roar stays on boss-spawned.
   */
  function playWardenStinger() {
    sfx.trackPerformance('playWardenStinger');

    sfx.safePlay(() => {
      const destination = sfx.ambientDestination();
      if (!destination) return;

      const { hit, riser, reverbSendDb } = WARDEN_STINGER;
      const now = sfx.context.currentTime;

      // Brass hit: saw stack → closing lowpass.
      const brassFilter = sfx.context.createBiquadFilter();
      brassFilter.type = 'lowpass';
      brassFilter.frequency.setValueAtTime(hit.filterStart, now);
      brassFilter.frequency.exponentialRampToValueAtTime(
        hit.filterEnd,
        now + hit.seconds
      );
      const brassGain = sfx.context.createGain();
      brassGain.gain.setValueAtTime(0.0001, now);
      brassGain.gain.exponentialRampToValueAtTime(
        hit.gain,
        now + hit.attackSeconds
      );
      brassGain.gain.exponentialRampToValueAtTime(0.001, now + hit.seconds);
      brassFilter.connect(brassGain);
      brassGain.connect(destination);
      sfx.sendToReverb(brassGain, reverbSendDb);
      hit.notes.forEach((note, index) => {
        [-1, 1].forEach((side) => {
          const osc = sfx.context.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(midiToHz(note), now);
          osc.detune.setValueAtTime(side * hit.detuneCents * (index + 1), now);
          osc.connect(brassFilter);
          osc.start(now);
          osc.stop(now + hit.seconds + 0.02);
        });
      });

      // Riser: seeded noise through an opening bandpass, plus a rising sine.
      const rate = sfx.context.sampleRate;
      const length = Math.max(1, Math.floor(rate * riser.seconds));
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
      band.frequency.setValueAtTime(riser.filterStart, now);
      band.frequency.exponentialRampToValueAtTime(
        riser.filterEnd,
        now + riser.seconds
      );
      const riserGain = sfx.context.createGain();
      riserGain.gain.setValueAtTime(0.0001, now);
      riserGain.gain.exponentialRampToValueAtTime(
        riser.gain,
        now + riser.seconds * 0.9
      );
      riserGain.gain.exponentialRampToValueAtTime(0.001, now + riser.seconds);
      noise.connect(band);
      band.connect(riserGain);
      riserGain.connect(destination);
      sfx.sendToReverb(riserGain, reverbSendDb);
      noise.start(now);

      const tone = sfx.context.createOscillator();
      const toneGain = sfx.context.createGain();
      tone.type = 'sine';
      tone.frequency.setValueAtTime(riser.toneStart, now);
      tone.frequency.exponentialRampToValueAtTime(
        riser.toneEnd,
        now + riser.seconds
      );
      toneGain.gain.setValueAtTime(0.0001, now);
      toneGain.gain.exponentialRampToValueAtTime(
        riser.toneGain,
        now + riser.seconds * 0.9
      );
      toneGain.gain.exponentialRampToValueAtTime(0.001, now + riser.seconds);
      tone.connect(toneGain);
      toneGain.connect(destination);
      tone.start(now);
      tone.stop(now + riser.seconds + 0.02);
    });
  }

  return {
    playEliteSpawned,
    playSurgeSting,
    playDeepFieldEntry,
    playTransmission,
    playTransmissionVoice,
    playChapterStinger,
    playWardenStinger,
  };
}
