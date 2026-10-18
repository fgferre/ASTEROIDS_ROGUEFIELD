// src/data/audio/bossCues.js
// Boss audio cue presets: roar, phase change and defeat fanfare.

export const BOSS_AUDIO_FREQUENCY_PRESETS = Object.freeze({
  roar: Object.freeze({
    duration: 1.2,
    attackGain: 0.22,
    sustainGain: 0.16,
    releaseDuration: 0.5,
    sweep: Object.freeze({ start: 80, end: 150, duration: 0.7 }),
    vibrato: Object.freeze({ depth: 8, speed: 5.5 }),
    harmonics: Object.freeze([220, 330]),
    tail: Object.freeze({ frequency: 58, duration: 0.5, gain: 0.12 }),
    filter: Object.freeze({ type: 'lowpass', frequency: 360 }),
  }),
  phaseChange: Object.freeze({
    duration: 0.6,
    sweep: Object.freeze({ start: 220, end: 820 }),
    shimmer: Object.freeze({
      frequencies: Object.freeze([660, 880, 990, 1320]),
      spacing: 0.08,
      gain: 0.1,
    }),
    swell: Object.freeze({ frequency: 180, duration: 0.8, gain: 0.12 }),
  }),
  defeated: Object.freeze({
    duration: 2.0,
    fanfare: Object.freeze({
      notes: Object.freeze([
        Object.freeze({ frequency: 392, delay: 0, duration: 0.5, gain: 0.16 }),
        Object.freeze({
          frequency: 523,
          delay: 0.18,
          duration: 0.6,
          gain: 0.18,
        }),
        Object.freeze({
          frequency: 659,
          delay: 0.38,
          duration: 0.7,
          gain: 0.18,
        }),
        Object.freeze({
          frequency: 784,
          delay: 0.58,
          duration: 0.75,
          gain: 0.2,
        }),
      ]),
      harmony: Object.freeze({
        frequencies: Object.freeze([196, 294, 392]),
        duration: 1.6,
        gain: 0.12,
      }),
    }),
    choir: Object.freeze({ frequency: 220, duration: 1.8, gain: 0.08 }),
    sparkle: Object.freeze({
      frequencies: Object.freeze([1046, 1318, 1567]),
      spacing: 0.12,
      duration: 0.5,
      gain: 0.08,
    }),
  }),
});
