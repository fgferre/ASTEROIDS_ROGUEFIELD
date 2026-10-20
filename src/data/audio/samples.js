// src/data/audio/samples.js
// The sample layer (SOUND.md): which cue plays which sample, and the playback
// rules. The files and each sample's mix (gain dB, priority, cap, gap ms,
// reverb send dB) live in src/public/audio/sfx/manifest.json; a cue whose
// sample has no loaded files there plays its synthesis, as before.
// src/modules/audio/samplePlayer.js reads both.
//
// Cue fields:
//   sample      the manifest's sampleId; an object picks it by the cue's first
//               argument (the explosion's size).
//   bus         the bus the cue's synthesis uses: 'protected' (player
//               feedback, never ducks) or 'ambient' (the world, ducks).
//   spatialArg  the argument carrying { pan, distance } (pan by x, distance
//               lowpass), read the way the synthesis reads it; none → centred.
//   facade      true → the facade's own boss voice (AudioSystem), not an
//               SFXBus cue.
//   climb       { window, max }: a run climbs in pitch (SOUND.md). A play
//               within `window` s of the last one sounds a semitone above it,
//               up to `max` semitones; a longer pause starts over. Its pitch
//               is the climb's, without the per-play spread.

import { deepFreeze } from '../../utils/deepFreeze.js';

export const SAMPLE_CUES = deepFreeze({
  playLaserShot: { sample: 'lance-shot', bus: 'protected' },
  playBulletHit: { sample: 'bullet-hit', bus: 'protected' },
  playAsteroidBreak: { sample: 'rock-break', bus: 'ambient' },
  playExplosion: {
    sample: {
      small: 'explosion-small',
      medium: 'explosion-medium',
      large: 'explosion-large',
    },
    bus: 'ambient',
    spatialArg: 1,
  },
  playShipHit: { sample: 'ship-hit', bus: 'protected' },
  playShieldImpact: { sample: 'shield-impact', bus: 'protected' },
  playShieldBreak: { sample: 'shield-break', bus: 'protected' },
  playDash: { sample: 'dash', bus: 'protected', spatialArg: 0 },
  playXPCollect: {
    sample: 'xp-collect',
    bus: 'ambient',
    climb: { window: 0.4, max: 7 }, // proposta 20/10
  },
  playLevelUp: { sample: 'level-up', bus: 'ambient' },
  playUpgradeSelect: { sample: 'card-pick', bus: 'ambient' },
  playDroneFire: { sample: 'enemy-shot', bus: 'ambient', spatialArg: 0 },
  playBossRoar: { sample: 'warden-arrival', bus: 'ambient', facade: true },
  playUIHover: { sample: 'ui-hover', bus: 'ambient' },
  playUISelect: { sample: 'ui-select', bus: 'ambient' },
  playPauseOpen: { sample: 'pause-open', bus: 'ambient' },
  playPauseClose: { sample: 'pause-close', bus: 'ambient' },
});

// Voice priority, SOUND.md's order: the manifest's `priority` is one of these
// numbers. When all voices are busy, a new voice stops the oldest one of the
// lowest priority below its own; none lower → the new one is dropped.
export const SAMPLE_PRIORITY = deepFreeze({
  warden: 6,
  playerDamage: 5,
  playerShot: 4,
  explosion: 3,
  hit: 2,
  reward: 1,
  interface: 0,
});

export const SAMPLE_PLAYBACK = deepFreeze({
  pitchSpread: 0.04, // playbackRate 1 ± 4 % per play
  gainSpreadDb: 1.5, // ± dB per play, over the manifest gain
  maxVoices: 24, // sample voices at once, all samples together
  stealFadeSeconds: 0.01, // a stopped voice fades this fast (no click)
});
