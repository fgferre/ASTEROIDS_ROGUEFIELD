// src/data/audio/mix.js
// Master chain and spatial mix: limiter, reverb, send levels, pan, distance, big-moment duck.

// === MASTER CHAIN ("studio" bus) ===
// Soft limiter on the summed music + effects buses, right before masterGain.
export const AUDIO_MASTER_LIMITER = Object.freeze({
  thresholdDb: -6,
  kneeDb: 12,
  ratio: 8,
  attackSeconds: 0.003,
  releaseSeconds: 0.15,
});

// Shared reverb send: procedural stereo IR (exponentially decaying noise,
// darkened over time by a one-pole lowpass), generated once at init.
export const AUDIO_REVERB = Object.freeze({
  durationSeconds: 1.6,
  preDelaySeconds: 0.012,
  decayDb: 60, // level drop across durationSeconds (RT60-style)
  dampingCoefficient: 0.35, // one-pole lowpass on the IR noise (0 = bright)
  returnGain: 1,
  seed: 'audio:reverb-ir',
});

// Send levels (dB) per cue family. UI, thrusters and the laser never send.
export const AUDIO_REVERB_SEND_DB = Object.freeze({
  explosionSmall: -14,
  explosionMedium: -12,
  explosionLarge: -10,
  mine: -12,
  shield: -13,
  levelUp: -12,
  boss: -10,
  elite: -11,
  deepFieldEntry: -10,
});

// Enemy-side cues pan by source x relative to the player.
export const AUDIO_STEREO_PAN_MAX = 0.6;

// ... and fade and darken with distance from the player (proposta 18/10):
// full level and an open lowpass within nearPx, down to farGain and
// farCutoffHz at farPx (clamped beyond). Gain follows an inverse-style curve
// 1 / (1 + k·t), the cutoff moves exponentially (even steps to the ear).
export const AUDIO_DISTANCE_MIX = Object.freeze({
  nearPx: 120,
  farPx: 900,
  farGain: 0.35,
  nearCutoffHz: 18000,
  farCutoffHz: 2200,
  Q: 0.7071,
});

// Short music duck on big moments (level-up, large explosions).
export const AUDIO_BIG_MOMENT_DUCK = Object.freeze({
  depthDb: 6,
  attackMs: 30,
  holdMs: 70,
  releaseMs: 150,
});
