// src/data/audio/music.js
// Procedural music data: layers, scales, themes, percussion gate, theme crossfade, run intensity.

// The four intensity layers. Pitch, timbre and filters come from the active
// MUSIC_THEMES entry; here only the slow amplitude LFO each layer shares
// across themes (its rate is per theme).
export const MUSIC_LAYER_CONFIG = Object.freeze({
  layers: Object.freeze({
    base: Object.freeze({ modulationDepth: 0.55, modulationType: 'sine' }),
    tension: Object.freeze({ modulationDepth: 0.4, modulationType: 'sine' }),
    danger: Object.freeze({
      modulationDepth: 0.32,
      modulationType: 'triangle',
    }),
    climax: Object.freeze({ modulationDepth: 0.26, modulationType: 'sine' }),
  }),
  intensities: Object.freeze([
    Object.freeze({ base: 0.0, tension: 0.0, danger: 0.0, climax: 0.0 }),
    Object.freeze({ base: 0.18, tension: 0.08, danger: 0.0, climax: 0.0 }),
    Object.freeze({ base: 0.2, tension: 0.12, danger: 0.08, climax: 0.0 }),
    Object.freeze({ base: 0.22, tension: 0.16, danger: 0.12, climax: 0.08 }),
  ]),
  initialIntensity: 0,
});

// Musical scales as semitones above the root (one octave).
const MUSIC_SCALES = Object.freeze({
  dorian: Object.freeze([0, 2, 3, 5, 7, 9, 10]),
  phrygian: Object.freeze([0, 1, 3, 5, 7, 8, 10]),
  lydian: Object.freeze([0, 2, 4, 6, 7, 9, 11]),
  aeolian: Object.freeze([0, 2, 3, 5, 7, 8, 10]),
});

// Procedural music themes (proposta 18/10 — the owner's ear decides). Each
// theme voices the same four intensity layers, so the run intensity keeps
// working unchanged; a theme change only swaps what each layer plays.
//   root: MIDI note of the theme's tonic (45 = A2, 110 Hz).
//   scale: semitone steps; pulse.pattern and motif are scale DEGREES
//     (7 = the root an octave up).
//   barSeconds: pulse grid spacing (the theme's tempo).
//   layers.<key>: type, notes (semitones above root, stacked oscillators),
//     detuneCents (spread across the stack), randomDetuneCents (seeded),
//     filter, modulationRate (LFO Hz), level (trim).
//   pulse: the danger/climax rhythmic blip — type, octave above root, pattern,
//     gain.
//   motif: the chapter stinger's three notes (biome themes only).
//   percussion: the fifth layer (MUSIC_PERCUSSION gates it by intensity) — a
//     loop of `steps` steps, `subdivision` steps per barSeconds; each hit lists
//     its steps and is either a 'tone' (pitch drop startHz → endHz, optional
//     sub tail) or 'noise' (filtered seeded noise), gain and seconds.
export const MUSIC_THEMES = Object.freeze({
  // Open, travelling: A dorian, the bright sixth over a calm fifth.
  'outer-ring': Object.freeze({
    root: 45,
    scale: MUSIC_SCALES.dorian,
    barSeconds: 0.5,
    layers: Object.freeze({
      base: Object.freeze({
        type: 'sine',
        notes: Object.freeze([0, 7]),
        randomDetuneCents: 8,
        filter: Object.freeze({ type: 'lowpass', frequency: 420, Q: 0.8 }),
        modulationRate: 0.07,
      }),
      tension: Object.freeze({
        type: 'triangle',
        notes: Object.freeze([12, 21]),
        randomDetuneCents: 6,
        filter: Object.freeze({ type: 'bandpass', frequency: 680, Q: 1.1 }),
        modulationRate: 0.12,
      }),
      danger: Object.freeze({
        type: 'sawtooth',
        notes: Object.freeze([19, 24]),
        randomDetuneCents: 5,
        filter: Object.freeze({ type: 'bandpass', frequency: 940, Q: 1.3 }),
        modulationRate: 0.18,
      }),
      climax: Object.freeze({
        type: 'square',
        notes: Object.freeze([24, 31]),
        randomDetuneCents: 4,
        filter: Object.freeze({ type: 'highpass', frequency: 520, Q: 0.7 }),
        modulationRate: 0.24,
      }),
    }),
    pulse: Object.freeze({
      type: 'square',
      octave: 1,
      pattern: Object.freeze([0, 0, 4, 2]),
      gain: 0.12,
    }),
    // Soft noise hats on the eighths, a low thump on 1.
    percussion: Object.freeze({
      subdivision: 2,
      steps: 8,
      hits: Object.freeze([
        Object.freeze({
          kind: 'tone',
          steps: Object.freeze([0]),
          type: 'sine',
          startHz: 120,
          endHz: 48,
          seconds: 0.22,
          gain: 0.5,
        }),
        Object.freeze({
          kind: 'noise',
          steps: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7]),
          filter: Object.freeze({ type: 'highpass', frequency: 7000, Q: 0.7 }),
          seconds: 0.035,
          gain: 0.12,
        }),
      ]),
    }),
    motif: Object.freeze([0, 4, 5]),
  }),
  // Heavy, close: F phrygian a fourth lower, sub octave, minor-second rub,
  // darker filters, slower pulse.
  'dense-core': Object.freeze({
    root: 41,
    scale: MUSIC_SCALES.phrygian,
    barSeconds: 0.667,
    layers: Object.freeze({
      base: Object.freeze({
        type: 'sine',
        notes: Object.freeze([-12, 0, 7]),
        randomDetuneCents: 6,
        filter: Object.freeze({ type: 'lowpass', frequency: 300, Q: 0.9 }),
        modulationRate: 0.05,
      }),
      tension: Object.freeze({
        type: 'triangle',
        notes: Object.freeze([12, 13]),
        randomDetuneCents: 5,
        filter: Object.freeze({ type: 'bandpass', frequency: 520, Q: 1.2 }),
        modulationRate: 0.09,
      }),
      danger: Object.freeze({
        type: 'sawtooth',
        notes: Object.freeze([15, 19]),
        randomDetuneCents: 5,
        filter: Object.freeze({ type: 'lowpass', frequency: 700, Q: 2 }),
        modulationRate: 0.14,
      }),
      climax: Object.freeze({
        type: 'square',
        notes: Object.freeze([24, 32]),
        randomDetuneCents: 4,
        filter: Object.freeze({ type: 'bandpass', frequency: 1200, Q: 1 }),
        modulationRate: 0.2,
      }),
    }),
    pulse: Object.freeze({
      type: 'triangle',
      octave: 1,
      pattern: Object.freeze([0, 1, 0, 4]),
      gain: 0.13,
    }),
    // Slow tom-like sine thumps with a sub tail (half-note feel).
    percussion: Object.freeze({
      subdivision: 1,
      steps: 4,
      hits: Object.freeze([
        Object.freeze({
          kind: 'tone',
          steps: Object.freeze([0, 2]),
          type: 'sine',
          startHz: 150,
          endHz: 72,
          seconds: 0.32,
          gain: 0.45,
          subHz: 43.65, // F1
          subSeconds: 0.55,
          subGain: 0.35,
        }),
        Object.freeze({
          kind: 'tone',
          steps: Object.freeze([3]),
          type: 'sine',
          startHz: 115,
          endHz: 58,
          seconds: 0.26,
          gain: 0.3,
        }),
      ]),
    }),
    motif: Object.freeze([0, 1, 4]),
  }),
  // Cold, vast: E lydian, the raised fourth in high sine partials, slow
  // shimmering LFOs.
  'wardens-reach': Object.freeze({
    root: 40,
    scale: MUSIC_SCALES.lydian,
    barSeconds: 0.5,
    layers: Object.freeze({
      base: Object.freeze({
        type: 'sine',
        notes: Object.freeze([0, 7, 18]),
        randomDetuneCents: 6,
        filter: Object.freeze({ type: 'lowpass', frequency: 600, Q: 0.7 }),
        modulationRate: 0.04,
      }),
      tension: Object.freeze({
        type: 'triangle',
        notes: Object.freeze([24, 30]),
        randomDetuneCents: 5,
        filter: Object.freeze({ type: 'bandpass', frequency: 1100, Q: 0.9 }),
        modulationRate: 0.06,
      }),
      danger: Object.freeze({
        type: 'triangle',
        notes: Object.freeze([19, 23, 28]),
        randomDetuneCents: 5,
        filter: Object.freeze({ type: 'bandpass', frequency: 1400, Q: 1 }),
        modulationRate: 0.1,
      }),
      climax: Object.freeze({
        type: 'sine',
        notes: Object.freeze([36, 42, 47]),
        randomDetuneCents: 7,
        filter: Object.freeze({ type: 'highpass', frequency: 900, Q: 0.7 }),
        modulationRate: 0.15,
      }),
    }),
    pulse: Object.freeze({
      type: 'sine',
      octave: 2,
      pattern: Object.freeze([0, 4, 3, 6]),
      gain: 0.1,
    }),
    // Sparse metallic clicks (very short resonant noise) on a sixteenth grid.
    percussion: Object.freeze({
      subdivision: 4,
      steps: 16,
      hits: Object.freeze([
        Object.freeze({
          kind: 'noise',
          steps: Object.freeze([0, 7, 10]),
          filter: Object.freeze({ type: 'bandpass', frequency: 5200, Q: 9 }),
          seconds: 0.025,
          gain: 0.3,
        }),
        Object.freeze({
          kind: 'noise',
          steps: Object.freeze([13]),
          filter: Object.freeze({ type: 'bandpass', frequency: 3100, Q: 11 }),
          seconds: 0.03,
          gain: 0.25,
        }),
      ]),
    }),
    motif: Object.freeze([0, 3, 4]),
  }),
  // The Warden: C minor over a root + tritone drone, a detuned saw stack like
  // brass, an insistent eighth-note pulse.
  warden: Object.freeze({
    root: 36,
    scale: MUSIC_SCALES.aeolian,
    barSeconds: 0.25,
    layers: Object.freeze({
      base: Object.freeze({
        type: 'triangle',
        notes: Object.freeze([0, 6]),
        randomDetuneCents: 4,
        filter: Object.freeze({ type: 'lowpass', frequency: 380, Q: 1 }),
        modulationRate: 0.09,
      }),
      tension: Object.freeze({
        type: 'sawtooth',
        notes: Object.freeze([12, 15]),
        randomDetuneCents: 5,
        filter: Object.freeze({ type: 'lowpass', frequency: 800, Q: 1.4 }),
        modulationRate: 0.16,
      }),
      danger: Object.freeze({
        type: 'sawtooth',
        notes: Object.freeze([19, 24, 27]),
        detuneCents: 9,
        randomDetuneCents: 3,
        filter: Object.freeze({ type: 'lowpass', frequency: 1500, Q: 1.8 }),
        modulationRate: 0.2,
      }),
      climax: Object.freeze({
        type: 'square',
        notes: Object.freeze([30, 36]),
        randomDetuneCents: 4,
        filter: Object.freeze({ type: 'bandpass', frequency: 1800, Q: 1.2 }),
        modulationRate: 0.28,
      }),
    }),
    pulse: Object.freeze({
      type: 'sawtooth',
      octave: 1,
      pattern: Object.freeze([0, 0, 0, 4, 0, 0, 2, 1]),
      gain: 0.14,
    }),
    // Insistent kick (every beat plus a pickup), snare noise on 2 and 4. One
    // step = barSeconds (an eighth here).
    percussion: Object.freeze({
      subdivision: 1,
      steps: 8,
      hits: Object.freeze([
        Object.freeze({
          kind: 'tone',
          steps: Object.freeze([0, 2, 4, 6, 7]),
          type: 'sine',
          startHz: 140,
          endHz: 42,
          seconds: 0.16,
          gain: 0.6,
        }),
        Object.freeze({
          kind: 'noise',
          steps: Object.freeze([2, 6]),
          filter: Object.freeze({ type: 'bandpass', frequency: 1900, Q: 0.8 }),
          seconds: 0.14,
          gain: 0.3,
        }),
      ]),
    }),
  }),
});

// Percussion layer gate (proposta 18/10): silent below enterIntensity, full
// at fullIntensity (smoothed run intensity; a boss floor counts as its level
// threshold), `gain` trim on the layer, seeded noise from its own stream.
export const MUSIC_PERCUSSION = Object.freeze({
  enterIntensity: 0.45,
  fullIntensity: 0.8,
  gain: 0.6,
  noiseSeconds: 0.25,
  noiseSeed: 'audio:music:percussion-noise',
});

export const MUSIC_DEFAULT_THEME = 'outer-ring';
export const MUSIC_WARDEN_THEME = 'warden';

// Theme change: equal-power crossfade between the outgoing and incoming
// voices (piecewise-linear over `segments` steps), proposta 18/10.
export const MUSIC_THEME_CROSSFADE = Object.freeze({
  seconds: 2.5,
  segments: 8,
});

// The journey's score (modules/audio/journeyCue.js), proposta 13/11: the
// treatment the owner chose by ear ("B", a journey motif). Notes are scale
// degrees of `theme` (root A2, A dorian; 7 = the root an octave up) or
// semitones above its root (`notes` of a held chord); times in seconds;
// gains as rendered on the audition. A soft pad, and the chapter motif
// plucked through a delay echo: on the ignite, left hanging; a quiet echo on
// a hop's first fly-by; on a jump a run that climbs and quickens from the
// charge into the leap, a chord that swells into the drop-out and the motif
// low after it; again on the brake; the top A and an open chord at the end,
// where the sector's own layers come in (MusicMixer.holdForJourney).
export const MUSIC_JOURNEY = Object.freeze({
  theme: 'outer-ring',
  // The audition sat the cue 6.2 dB under its render beside the voices at
  // full; the music slider's default (0.6, −4.4 dB) makes up the rest.
  levelDb: -1.7,
  // Seeded oscillator detune, ± cents (the cue's own stream).
  detuneCents: 7,
  seed: 'audio:music:journey',
  pad: Object.freeze({
    type: 'sine',
    notes: Object.freeze([0, 7]),
    filter: Object.freeze({ type: 'lowpass', frequency: 380, Q: 0.8 }),
    lfo: Object.freeze({ rate: 0.06, depth: 0.25 }),
    gain: 0.12,
    riseTau: 0.8, // from the journey's start
    fallTau: 0.4, // from its end
  }),
  // A plucked note: a triangle plus a sine an octave up, a short rise, then
  // an exponential fall of `decay` seconds (τ = decay / 4).
  pluck: Object.freeze({
    partials: Object.freeze([
      Object.freeze({ type: 'triangle', ratio: 1, gain: 1 }),
      Object.freeze({ type: 'sine', ratio: 2, gain: 0.35 }),
    ]),
    attack: 0.04,
    fallFrom: 0.06,
    decay: 1.4,
    lastDecay: 2.4, // the motif's last note
  }),
  // The plucks' lowpass, then dry plus a feedback delay.
  echo: Object.freeze({
    lowpass: 1800,
    delay: 0.375,
    feedback: 0.35,
    wet: 0.3,
  }),
  // The motif (the theme's own three degrees unless `notes`) at a moment.
  motifs: Object.freeze({
    ignite: Object.freeze({ octave: 1, gain: 0.22, step: 0.45 }),
    flyby: Object.freeze({
      octave: 2,
      gain: 0.08,
      step: 0.35,
      notes: Object.freeze([4, 5]),
    }),
    dropout: Object.freeze({ after: 2.6, octave: 0, gain: 0.16, step: 0.6 }),
    brake: Object.freeze({ octave: 1, gain: 0.2, step: 0.45 }),
  }),
  // A jump's charge: the run, an octave up every `octaveEvery` notes, each
  // step `quicken` × the last (down to `minStep`), louder toward the leap.
  climb: Object.freeze({
    notes: Object.freeze([0, 4, 5, 7]),
    octave: 1,
    octaveEvery: 8,
    step: 0.32,
    quicken: 0.9,
    minStep: 0.11,
    gainFrom: 0.08,
    gainTo: 0.2,
    decay: 0.6,
    stopsBefore: 0.05, // no note this close to the leap
  }),
  // The leap → drop-out: a held chord swelling from the leap to `peak` just
  // after the drop-out, then fading.
  bloom: Object.freeze({
    type: 'triangle',
    notes: Object.freeze([12, 19, 21, 24]),
    filter: Object.freeze({ type: 'lowpass', frequency: 2200, Q: 0.8 }),
    peak: 0.2,
    peakAfter: 0.1,
    fallAfter: 0.4,
    fallTau: 1.6,
  }),
  // The end: the figure's top A, plucked, over an open chord.
  resolve: Object.freeze({
    degree: 7,
    octave: 1,
    gain: 0.24,
    decay: 3,
    type: 'sine',
    notes: Object.freeze([0, 7, 12, 19, 33]),
    filter: Object.freeze({ type: 'lowpass', frequency: 1600, Q: 0.8 }),
    peak: 0.18,
    riseFrom: -0.05,
    peakAfter: 0.15,
    fallAfter: 0.6,
    fallTau: 1.2,
  }),
  // A journey cut short (a skip): `end` this much before its plan stops the
  // score over `stopSeconds`.
  early: 0.25,
  stopSeconds: 0.15,
  // The sector's layers: down over `holdSeconds` as the journey starts; at
  // its end in at `arrivalLevel` over the theme crossfade, held there until
  // the run's own level reaches it.
  holdSeconds: 1.5,
  arrivalLevel: 1,
});

// Run-following music intensity (0..1). Weighted sum of run progress (wave /
// RUN_FINAL_LAYER), enemy density and a low-HP bump, smoothed with separate
// attack/release time constants; each level fades in when the smoothed value
// crosses its threshold (levels index MUSIC_LAYER_CONFIG.intensities). Boss
// arc levels still override upwards.
export const MUSIC_RUN_INTENSITY = Object.freeze({
  waveWeight: 0.5,
  densityWeight: 0.35,
  densityFullCount: 20, // enemies alive/pending in the wave for full weight
  lowHealthRatio: 0.3,
  lowHealthBonus: 0.2,
  attackSeconds: 1.5,
  releaseSeconds: 4,
  // [level 1 (base+tension), level 2 (+danger), level 3 (+climax)]
  levelThresholds: Object.freeze([0.1, 0.45, 0.8]),
  layerFadeSeconds: 2.5,
  tickMs: 200,
});
