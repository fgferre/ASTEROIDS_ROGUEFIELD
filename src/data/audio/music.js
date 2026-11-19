// src/data/audio/music.js
// What is left of the music data: the journey's fade times (journeyCue.js) and
// the run danger the recorded scores follow (modules/audio/MusicMixer.js).

// The journey's score (modules/audio/journeyCue.js) is a recording per
// destination chapter (data/audio/sectorScores.js). A journey cut short (a
// skip: `end` more than `earlySeconds` before its plan) fades it over
// `skipFadeSeconds`, else it fades over `fadeSeconds`.
// proposta 19/11, for the owner to hear (card som-cena-1): the music under
// the story (render3d/storyScene.js). 'none': the sector's held silent, as
// before; 'sector': the sector's plays under it; 'journey': the journey's
// recording comes in as the hangar opens, its hit on the launch, and plays
// on through the journey that follows.
export const STORY_MUSIC = 'none';

export const MUSIC_JOURNEY = Object.freeze({
  earlySeconds: 0.25,
  skipFadeSeconds: 0.15,
  fadeSeconds: 1,
});

// Run danger (0..1): weighted sum of run progress (wave / RUN_FINAL_LAYER),
// enemy density and a low-HP bump, smoothed with separate attack/release time
// constants.
export const MUSIC_RUN_INTENSITY = Object.freeze({
  waveWeight: 0.5,
  densityWeight: 0.35,
  densityFullCount: 20, // enemies alive/pending in the wave for full weight
  lowHealthRatio: 0.3,
  lowHealthBonus: 0.2,
  attackSeconds: 1.5,
  releaseSeconds: 4,
  tickMs: 200,
});
