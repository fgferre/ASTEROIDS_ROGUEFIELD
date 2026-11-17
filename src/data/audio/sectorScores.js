// Recorded music of a campaign sector, played by src/modules/audio/SectorScore.js
// in place of the procedural mixer. A sector without an entry here keeps the
// procedural music; more sectors are added as one entry each.
// `boss` is optional (a sector without it opens its stage fully on a Warden).
// `stage` and `boss` are the same length and beat-aligned: they play
// sample-synced and crossfade. `loopSeconds` is the length of the loop,
// counted from the first audible sample.

const url = (file) =>
  new URL(`../../../assets/Music/score/${file}`, import.meta.url).href;

export const SECTOR_SCORES = Object.freeze({
  'debris-wake': Object.freeze({
    stage: url('debris-wake-stage.mp3'),
    boss: url('debris-wake-boss.mp3'),
    loopSeconds: 165.814,
  }),
  'salvage-lanes': Object.freeze({
    stage: url('salvage-lanes-stage.mp3'),
    boss: url('salvage-lanes-boss.mp3'),
    loopSeconds: 162.691,
  }),
  'prime-gate': Object.freeze({
    stage: url('prime-gate-stage.mp3'),
    boss: url('prime-gate-boss.mp3'),
    loopSeconds: 172.896,
  }),
  'furnace-drift': Object.freeze({
    stage: url('furnace-drift-stage.mp3'),
    boss: url('furnace-drift-boss.mp3'),
    loopSeconds: 145.02,
  }),
  'dense-core': Object.freeze({
    stage: url('dense-core-stage.mp3'),
    boss: url('dense-core-boss.mp3'),
    loopSeconds: 138.461,
  }),
  'assembly-graveyard': Object.freeze({
    stage: url('assembly-graveyard-stage.mp3'),
    boss: url('assembly-graveyard-boss.mp3'),
    loopSeconds: 163.736,
  }),
  'quarantine-grid': Object.freeze({
    stage: url('quarantine-grid-stage.mp3'),
    boss: url('quarantine-grid-boss.mp3'),
    loopSeconds: 138.24,
  }),
  'wardens-reach': Object.freeze({
    stage: url('wardens-reach-stage.mp3'),
    boss: url('wardens-reach-boss.mp3'),
    loopSeconds: 144.173,
  }),
  'the-crucible': Object.freeze({
    stage: url('the-crucible-stage.mp3'),
    boss: url('the-crucible-boss.mp3'),
    loopSeconds: 172.78,
  }),
  'crystal-choir': Object.freeze({
    stage: url('crystal-choir-stage.mp3'),
    loopSeconds: 153.588,
  }),
});

// Short one-shots, shared by every sector with a score.
export const SECTOR_SCORE_STINGERS = Object.freeze({
  bossWarning: url('sting-boss-warning.mp3'),
  sectorCleared: url('sting-sector-cleared.mp3'),
  signalLost: url('sting-signal-lost.mp3'),
});

// Feel values (proposta): the danger (0..1, MusicMixer.runIntensity) opens
// the stage's lowpass and lifts its level; the boss and the ends crossfade.
export const SECTOR_SCORE_MIX = Object.freeze({
  startAt: 0.1, // seconds ahead of now both tracks are scheduled
  fadeInSeconds: 2.5,
  fadeOutSeconds: 1.5,
  victoryFadeSeconds: 3,
  mixerFadeSeconds: 1.5,
  bossCrossfadeSeconds: 6,
  clearedCrossfadeSeconds: 4,
  pollMs: 200,
  dangerFull: 0.8, // danger at which the stage is fully open
  lowpassCalmHz: 900,
  lowpassOpenHz: 18000,
  stageGainCalm: 0.7,
  stageGainOpen: 1,
  dangerTimeConstant: 1.2,
  pauseLowpassHz: 700,
  pauseGain: 0.5,
  pauseRampSeconds: 0.4,
});
