// src/data/audio/explosions.js
// Explosion sound profiles by size and the size of what is not an enemy item.

import { AUDIO_REVERB_SEND_DB } from './mix.js';

// Explosions in three sizes: sub thump, mid crack, filtered noise/air tail.
// Times in seconds. `minIntervalMs` throttles same-size pile-ups.
export const EXPLOSION_PROFILES = Object.freeze({
  small: Object.freeze({
    sub: Object.freeze({ start: 160, end: 60, gain: 0.4, duration: 0.16 }),
    mid: Object.freeze({ start: 520, end: 170, gain: 0.2, duration: 0.09 }),
    noise: Object.freeze({
      gain: 0.3,
      duration: 0.22,
      filterStart: 3400,
      filterEnd: 800,
    }),
    reverbSendDb: AUDIO_REVERB_SEND_DB.explosionSmall,
    minIntervalMs: 40,
  }),
  medium: Object.freeze({
    sub: Object.freeze({ start: 135, end: 42, gain: 0.7, duration: 0.36 }),
    mid: Object.freeze({ start: 330, end: 85, gain: 0.32, duration: 0.2 }),
    noise: Object.freeze({
      gain: 0.45,
      duration: 0.48,
      filterStart: 2300,
      filterEnd: 320,
    }),
    reverbSendDb: AUDIO_REVERB_SEND_DB.explosionMedium,
    minIntervalMs: 60,
  }),
  large: Object.freeze({
    sub: Object.freeze({ start: 120, end: 30, gain: 1.0, duration: 0.6 }),
    mid: Object.freeze({ start: 250, end: 60, gain: 0.4, duration: 0.3 }),
    noise: Object.freeze({
      gain: 0.6,
      duration: 0.8,
      filterStart: 1500,
      filterEnd: 200,
    }),
    reverbSendDb: AUDIO_REVERB_SEND_DB.explosionLarge,
    minIntervalMs: 100,
  }),
});

// enemy-destroyed → explosion size. Asteroids use their own `size`; an enemy
// item (src/content/enemies) its file's `explosion` (null: it has its own
// death cue, as the mine's blast), else the default; the types below are not
// enemy items; unknown types fall back to the default; an `elite` flag bumps
// one size up.
export const EXPLOSION_SIZE_BY_ENEMY_TYPE = Object.freeze({
  warden: 'large',
  boss: 'large',
});
export const EXPLOSION_DEFAULT_SIZE = 'medium';
