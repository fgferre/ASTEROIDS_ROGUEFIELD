// src/data/audio/samples.js
// The sample layer (SOUND.md): which cue plays which sample, and the playback
// rules. The files and each sample's mix (gain dB, priority, cap, gap ms,
// reverb send dB; a loop's loopStart and loopEnd, seconds) live in
// src/public/audio/sfx/manifest.json; a cue whose sample has no loaded files
// there plays its synthesis, as before.
// src/modules/audio/samplePlayer.js reads both.
//
// Cue fields:
//   sample      the manifest's sampleId; an object picks it by the cue's first
//               argument (the explosion's size).
//   pick        { path, samples }: the sampleId by the value at `path` in the
//               cue's first argument (the shot's weaponId); a value not
//               listed plays `sample` (none: nothing).
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
//   loop        true → it plays on between its loopStart and loopEnd, faded
//               in over SAMPLE_PLAYBACK.loopFadeSeconds, until stopped
//               (samplePlayer.js stop).

import { deepFreeze } from '../../utils/deepFreeze.js';

export const SAMPLE_CUES = deepFreeze({
  // A weapon listed here has a shot of its own (audition 14/11); a weapon not
  // listed, or one whose files are missing, plays the lance's sample.
  playLaserShot: {
    sample: 'lance-shot',
    pick: {
      path: 'weaponId',
      samples: {
        'arc-caster': 'arc-caster-shot',
        'shard-halo': 'shard-halo-cut',
        'furnace-corona': 'furnace-corona-pulse',
        'seeker-swarm': 'seeker-swarm-launch',
      },
    },
    bus: 'protected',
  },
  // The Harmonic's beam and the Scatter's bolts bursting, over the shot
  // (audition 14/11). Gains, caps and gaps in the manifest: proposta 14/11.
  playHarmonicBeam: { sample: 'harmonic-beam', bus: 'ambient', spatialArg: 0 },
  playFlakBurst: { sample: 'scatter-flak', bus: 'ambient', spatialArg: 0 },
  // The ship's aim locking onto a new target.
  playTargetLock: { sample: 'target-lock', bus: 'protected' },
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
  // The shield switched on, a warship's attack charging, a shot on the
  // Sentinel's plate (audition 17/11; gains match today's synthesis).
  playShieldActivate: { sample: 'shield-activate', bus: 'protected' },
  playEnemyTelegraph: {
    sample: 'enemy-telegraph',
    bus: 'ambient',
    spatialArg: 0,
  },
  playBulwarkPlateHit: { sample: 'plate-hit', bus: 'ambient', spatialArg: 0 },
  playXPCollect: {
    sample: 'xp-collect',
    bus: 'ambient',
    climb: { window: 0.4, max: 7 }, // proposta 20/10
  },
  playLevelUp: { sample: 'level-up', bus: 'ambient' },
  // A health heart picked up (eventCues `health-heart-collected`); gain, cap 1
  // and gap in the manifest: proposta 13/11.
  playHeartPickup: { sample: 'heart-pickup', bus: 'ambient' },
  playUpgradeSelect: { sample: 'card-pick', bus: 'ambient' },
  // By the pickup's kind (and the chest's opening); Magnet, Pulse and
  // Overcharge have no sample id yet.
  playPickupCollected: {
    sample: {
      repair: 'pickup-repair',
      stasis: 'pickup-stasis',
      salvage: 'pickup-salvage',
      chest: 'chest-open',
    },
    bus: 'ambient',
  },
  playDroneFire: { sample: 'enemy-shot', bus: 'ambient', spatialArg: 0 },
  // The Hunter's clip holds its whole burst (three shots 0.15 s apart); the
  // game fires once per shot, so the manifest's 400 ms gap keeps the first.
  playHunterBurst: { sample: 'hunter-burst', bus: 'ambient', spatialArg: 0 },
  // The Caster's mortar: charge, launch, impact (audition 14/11).
  playCasterCharge: { sample: 'caster-charge', bus: 'ambient', spatialArg: 0 },
  playCasterLaunch: { sample: 'caster-launch', bus: 'ambient', spatialArg: 0 },
  playCasterImpact: { sample: 'caster-impact', bus: 'ambient', spatialArg: 0 },
  playBossRoar: { sample: 'warden-arrival', bus: 'ambient', facade: true },
  // Every boss's phase change and defeat (audition 14/11).
  playBossPhaseChange: {
    sample: 'boss-phase-change',
    bus: 'ambient',
    facade: true,
  },
  playBossDefeated: { sample: 'boss-defeated', bus: 'ambient', facade: true },
  // A Warden's signature attack, by its kind (eventCues `boss-attack-started`,
  // and Prime's charge and the Choir's chorus from their shots; auditions
  // 13/11 and 14/11). Gains, cap 1 and gaps in the manifest: propostas.
  playBossAttack: {
    pick: {
      path: 'kind',
      samples: {
        'quarry-maw': 'quarry-maw-intake',
        gatekeeper: 'gatekeeper-barrier',
        'kiln-engine': 'kiln-engine-ignite',
        'prism-crown': 'prism-crown-beam',
        'foundry-mother': 'foundry-mother-sweep',
        interdictor: 'interdictor-cage',
        sovereign: 'sovereign-protect',
        prime: 'prime-charge',
        choir: 'choir-chorus',
        null: 'null-pull',
      },
    },
    bus: 'ambient',
    spatialArg: 0,
  },
  // The journey between sectors (eventCues `travel-moment`; audition 13/11),
  // by its moment's id (render3d/travel/moments.js); the burn is a loop.
  // Gains in the manifest: proposta 13/11.
  playTravelMoment: {
    sample: {
      ignite: 'travel-ignite',
      charge: 'travel-charge',
      leap: 'travel-leap',
      dropout: 'travel-dropout',
      flyby: 'travel-flyby',
    },
    bus: 'ambient',
  },
  playTravelBurn: { sample: 'travel-burn', bus: 'ambient', loop: true },
  // The story before the first journey (eventCues `story-moment`, by the
  // moment's id: render3d/storyScene.js): the reactors' stutter loops from
  // the first shot to the launch.
  playStoryMoment: {
    sample: {
      pulse: 'signal-pulse',
      hangar: 'hatch-open',
      launch: 'travel-ignite',
    },
    bus: 'ambient',
  },
  playStoryReactor: { sample: 'reactor-stutter', bus: 'ambient', loop: true },
  playUIHover: { sample: 'ui-hover', bus: 'ambient' },
  playUISelect: { sample: 'ui-select', bus: 'ambient' },
  playUIStartGame: { sample: 'run-start', bus: 'ambient' },
  // The press start, Launch and the remote link into a run (eventCues; the
  // owner's card, 17/11).
  playPressStart: { sample: 'title-start', bus: 'ambient' },
  playLaunchConfirm: { sample: 'launch-confirm', bus: 'ambient' },
  playRemoteLink: { sample: 'mission-call', bus: 'ambient' },
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
  loopFadeSeconds: 0.25, // a loop fades in and out this long (proposta 13/11)
  cutFadeSeconds: 0.15, // the journey's sounds fade out this fast when it ends
});
