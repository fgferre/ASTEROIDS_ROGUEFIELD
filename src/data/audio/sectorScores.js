// Recorded music of a campaign sector, played by src/modules/audio/SectorScore.js
// in place of the procedural mixer. A sector without an entry here keeps the
// procedural music; more sectors are added as one entry each.
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
