// src/data/audio/stingers.js
// One-shot musical stingers (chapter, Warden) and the Warden transmission voice.

// Chapter stinger: the biome theme's three-note motif, on its first layer.
export const CHAPTER_STINGER = Object.freeze({
  octave: 2, // above the theme root
  type: 'triangle',
  spacingSeconds: 0.22,
  noteSeconds: 0.9,
  lastNoteSeconds: 1.8,
  gain: 0.09,
  reverbSendDb: -8,
});

// Warden stinger (boss-warning, one layer before the Warden): a low brass
// hit on the Warden root plus a rising noise/sine riser into the next layer.
export const WARDEN_STINGER = Object.freeze({
  hit: Object.freeze({
    notes: Object.freeze([36, 43, 48]), // C2, G2, C3 (MIDI)
    detuneCents: 8,
    gain: 0.16,
    attackSeconds: 0.02,
    seconds: 1.4,
    filterStart: 2200,
    filterEnd: 260,
  }),
  riser: Object.freeze({
    seconds: 1.6,
    gain: 0.07,
    filterStart: 400,
    filterEnd: 4800,
    toneStart: 130.8, // C3
    toneEnd: 523.3, // C5
    toneGain: 0.04,
  }),
  reverbSendDb: -9,
});

// Warden transmission "voice" (proposta 18/10): a short granular burst under
// the squelch — `grains` short grains spread over `seconds`, each a low
// oscillator (or whisper noise) through a formant bandpass, levelDb under the
// squelch peak, with a reverb send. Keyed by the transmission speaker name
// (STORY.speaker values); unknown speakers use THE RING's neutral voice.
//   notes: MIDI notes the grains cycle through (a triad for THE CHOIR).
//   whisper: odd grains are highpassed noise instead of a tone (WARDEN NULL).
//   grit: odd grains are noise through the formant instead (HERALD OF DUST).
//   gainDb: offset from levelDb (HERALD OF SILENCE sits near silent).
export const TRANSMISSION_VOICE = Object.freeze({
  delaySeconds: 0.1, // the voice starts as the squelch closes
  seconds: 0.6,
  grainSeconds: 0.07,
  jitterSeconds: 0.012, // seeded onset jitter per grain
  detuneCents: 18, // seeded detune span per grain
  levelDb: -14,
  reverbSendDb: -10,
  whisperFilterHz: 3200,
  defaultSpeaker: 'THE RING',
  speakers: Object.freeze({
    'WARDEN PRIME': Object.freeze({
      grains: 10,
      type: 'sawtooth',
      notes: Object.freeze([31]), // G1
      formantHz: 520,
      formantQ: 4,
    }),
    'THE CHOIR': Object.freeze({
      grains: 12,
      type: 'sawtooth',
      notes: Object.freeze([48, 51, 55]), // C3 Eb3 G3
      formantHz: 1100,
      formantQ: 5,
    }),
    'WARDEN NULL': Object.freeze({
      grains: 8,
      type: 'sine',
      notes: Object.freeze([24]), // C1 sub
      formantHz: 240,
      formantQ: 2,
      whisper: true,
    }),
    'THE RING': Object.freeze({
      grains: 9,
      type: 'sawtooth',
      notes: Object.freeze([45]), // A2
      formantHz: 800,
      formantQ: 4,
    }),
    'HERALD OF DUST': Object.freeze({
      grains: 10,
      type: 'square',
      notes: Object.freeze([28]), // E1
      formantHz: 340,
      formantQ: 3,
      grit: true,
    }),
    'HERALD OF HEAT': Object.freeze({
      grains: 12,
      type: 'sawtooth',
      notes: Object.freeze([57, 58]), // A3 Bb3, a crackling semitone
      formantHz: 1500,
      formantQ: 7,
    }),
    'HERALD OF SILENCE': Object.freeze({
      grains: 8,
      type: 'sine',
      notes: Object.freeze([84]), // C6
      formantHz: 2600,
      formantQ: 3,
      whisper: true,
      gainDb: -10,
    }),
  }),
});
