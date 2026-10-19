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
