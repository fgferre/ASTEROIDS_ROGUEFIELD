// The steps of src/data/audio/eventCues.js that carry logic (rows with `run`):
// each gets (audio, payload, eventName). Plain event → cue rows need none.
import {
  resolveDistanceMix,
  resolveExplosionSize,
  resolveStereoPan,
} from './SFXBus.js';
import {
  SECTOR_SCORE_MIX as MIX,
  chapterScoreForLayer,
} from '../../data/audio/sectorScores.js';
import { STORY_MUSIC } from '../../data/audio/music.js';
import { STORY_SHOT_MS } from '../../core/cinematics.js';
import { sectorById } from '../../data/sectors.js';
import { ENDING_SECTOR } from '../../data/story.js';
import { FILE_TRACK_IDS } from './FileTrackManager.js';

/**
 * Pan + distance mix of an enemy-side cue from its source position; no
 * distance mix when the position is unknown.
 */
export function sourceSpatial(audio, data) {
  const position = data?.position || data?.enemy || null;
  const known = Number.isFinite(position?.x) && Number.isFinite(position?.y);
  return {
    pan: resolveStereoPan(position?.x, audio.listenerX),
    distance: known
      ? resolveDistanceMix(
          position.x - audio.listenerX,
          position.y - audio.listenerY
        )
      : null,
  };
}

// The wave's enemies alive or still to spawn (the music's density proxy):
// wave-started totalEnemies + enemy-spawned + fragments − enemy-destroyed.
function setRunEnemyCount(audio, count) {
  audio.runEnemyCount = Math.max(0, count);
  audio.musicMixer.setRunState({ enemyCount: audio.runEnemyCount });
}

export const AUDIO_EVENT_HANDLERS = {
  volume(audio, payload) {
    if (payload?.values) {
      audio.updateVolumeState(payload.values);
    }
  },

  // A story line (audio/voiceLines.js): readied as it is queued, played as
  // it shows (a line without a recording gets the synthesized voice; a
  // recorded one with the voices off stays silent), its voice stopped when a
  // banner cuts it and released once it is done or dropped.
  voiceQueued(audio, payload) {
    if (payload) audio.voiceLines.queue(payload);
  },
  // Lines about to be queued (a run offered or started: its journey and its
  // fight's lines) are readied ahead, in place of the ones readied before.
  voiceComing(audio, payload) {
    audio.voiceLines.expect(payload?.entries);
  },
  voiceShown(audio, payload) {
    if (!audio.voiceLines.play(payload ?? {})) {
      audio.sfxBus.playTransmissionVoice(payload?.speaker);
    }
  },
  voiceStopped(audio, payload, eventName) {
    if (!payload) return;
    if (eventName === 'transmission-cut') audio.voiceLines.stop(payload);
    else audio.voiceLines.release(payload);
  },

  // The player's position: the pan and distance reference of every cue.
  listener(audio, payload) {
    const position = payload?.position;
    if (Number.isFinite(position?.x)) {
      audio.listenerX = position.x;
    }
    if (Number.isFinite(position?.y)) {
      audio.listenerY = position.y;
    }
  },

  // Rocks by size, enemies by type (resolveExplosionSize); large ones duck.
  explosion(audio, payload) {
    if (!payload) return;
    const size = resolveExplosionSize(payload);
    if (size) {
      audio.sfxBus.playExplosion(size, sourceSpatial(audio, payload));
      if (size === 'large') {
        audio._duckBigMoment();
      }
    }
  },

  bulletHit(audio, payload) {
    const effectiveDamage = Number.isFinite(payload?.effectiveDamage)
      ? payload.effectiveDamage
      : Number.isFinite(payload?.damage)
        ? payload.damage
        : 0;

    if (payload?.blocked && payload?.invulnerable) {
      audio.sfxBus.playBossShieldDeflect();
    } else if (effectiveDamage > 0 || payload?.killed) {
      audio.sfxBus.playBulletHit(payload?.killed || false);
    }
  },

  enemySpawned(audio) {
    setRunEnemyCount(audio, audio.runEnemyCount + 1);
  },

  enemyDestroyed(audio, payload) {
    if (!payload) return;
    const fragments = Array.isArray(payload.fragments)
      ? payload.fragments.length
      : 0;
    setRunEnemyCount(audio, audio.runEnemyCount - 1 + fragments);
  },

  // Progress + wave enemy total, and the chapter's score.
  waveStarted(audio, payload) {
    audio.updateWaveMusicIntensity(payload);
    const wave = Number(payload?.wave);
    if (!Number.isFinite(wave) || wave <= 0) return;
    audio.sectorScore.playChapter(chapterScoreForLayer(wave));
  },

  // Boss arc → the recorded score's stinger and crossfade.
  bossArc(audio, payload, eventName) {
    audio.sectorScore.onBossEvent(eventName);
  },

  // Recorded musical one-shots (./musicStings.js), in any run.
  eliteSting(audio) {
    audio.musicStings.play('elite');
  },
  surgeSting(audio) {
    audio.musicStings.play('surge');
  },
  deepFieldSting(audio) {
    audio.musicStings.play('deepField');
  },

  // A sector with a recorded score plays it.
  sectorScoreStart(audio, payload) {
    audio.sectorScore.start(payload?.sector);
    audio.musicStings.prefetch();
  },

  // A sector is picked (the map, the result screen): its music and its
  // journey's cue are fetched.
  sectorScorePrefetch(audio, payload) {
    audio.sectorScore.prefetch(payload?.sector);
    audio.journeyCue.prefetch(sectorById(payload?.sector)?.chapter);
  },

  // The campaign's last sector won: its score fades out, the victory plays.
  runWon(audio, payload) {
    if (payload?.sector !== ENDING_SECTOR) return;
    audio.sectorScore.stop({ seconds: MIX.victoryFadeSeconds });
    audio.playFileTrack(FILE_TRACK_IDS.VICTORY_FINAL);
  },

  // The journey's score (./journeyCue.js), the recording of the destination
  // sector's chapter (the run's sector, set as it started), plays alone, the
  // layers held down; at its end (or a skip) the sector's music comes in.
  journeyPlanned(audio, payload) {
    // The story's music (STORY_MUSIC 'journey') already plays it on.
    if (audio.storyScored) return;
    const chapter = sectorById(audio.sectorScore.sectorId)?.chapter;
    if (audio.journeyCue.play({ ...payload, chapter })) {
      audio.sectorScore.holdForJourney(true);
    }
  },
  journeyEnded(audio) {
    audio.journeyCue.end();
    audio.sectorScore.holdForJourney(false);
    audio.storyIgnited = false;
    audio.storyScored = false;
  },
  // Each journey moment's sample; the story's launch just played the
  // ignition (storyIgnited), so the journey after it starts without its own.
  travelMoment(audio, { id } = {}) {
    if (id === 'ignite' && audio.storyIgnited) return;
    audio.sfxBus.playTravelMoment(id);
  },
  storyIgnited(audio) {
    audio.storyIgnited = true;
  },
  storyEngines(audio, payload) {
    audio.sfxBus.engine.followStory(payload ?? {});
  },
  storyEnginesEnd(audio) {
    audio.sfxBus.engine.stopStory();
  },
  holdScore(audio) {
    if (STORY_MUSIC === 'sector') return;
    audio.sectorScore.holdForJourney(true);
  },
  // STORY_MUSIC 'journey': the journey's recording from the hangar shot, its
  // hit on the launch (the next shot), on through the journey after.
  storyScore(audio) {
    if (STORY_MUSIC !== 'journey') return;
    const chapter = sectorById(audio.sectorScore.sectorId)?.chapter;
    const toLaunch = STORY_SHOT_MS[STORY_SHOT_MS.length - 2] / 1000;
    const moments = [{ id: 'leap', at: toLaunch }];
    // Its end is the journey's, unknown here: it always fades gently.
    if (audio.journeyCue.play({ moments, duration: 0, chapter })) {
      audio.sectorScore.holdForJourney(true);
      audio.storyScored = true;
    }
  },
  releaseScore(audio) {
    audio.sectorScore.holdForJourney(false);
  },

  // Pause: the danger holds still and the score goes underwater.
  pauseMusic(audio, payload) {
    audio.musicMixer.pause(!!payload?.isPaused);
    audio.sectorScore.pause(!!payload?.isPaused);
  },

  // Low health warning + low-HP duck (AUDIO-03, D-11). Both fire on the
  // CROSSING into ≤25% HP only: repeated health events while already below
  // must not retrigger them; recovering (or dying) re-arms both edges.
  playerHealth(audio, payload) {
    // The ship sends { current, max } (PlayerSystem), on a hurt and a heal.
    const healthPercent = payload?.current / payload?.max;
    audio.musicMixer.setRunState({ healthRatio: healthPercent });

    if (healthPercent <= 0.25 && healthPercent > 0) {
      if (!audio.lowHealthWarning) {
        audio.sfxBus.playLowHealthWarning();
        audio.lowHealthWarning = true;
      }
      if (!audio.lowHealthDuckArmed) {
        audio.duckingController?.duck({ bus: 'music' });
        audio.lowHealthDuckArmed = true;
      }
    } else {
      audio.lowHealthWarning = false;
      audio.lowHealthDuckArmed = false;
    }
  },

  thruster(audio, payload) {
    audio.handleThrusterEffect(payload || {});
  },

  // The ship engine (./shipEngine.js): each step's flight, the player's own
  // shot, and at rest on a pause.
  engineStep(audio, payload) {
    audio.sfxBus.engine.flightStep(payload);
  },

  engineShot(audio) {
    audio.sfxBus.engine.shot();
  },

  engineStop(audio) {
    audio.sfxBus.engine.stop();
  },

  // Back on the menu (from the map, a victory, a run): lines readied for a
  // journey not taken are let go.
  screen(audio, payload) {
    if (payload?.screen === 'menu') audio.voiceLines.expect([]);
    const score = audio.sectorScore;
    if (payload?.screen === 'menu') score.stop();
    else if (payload?.screen === 'gameover') score.stop();
    else if (payload?.screen === 'victory') {
      score.stop({ seconds: MIX.victoryFadeSeconds });
    } else if (payload?.source === 'retry-complete' && !score.active) {
      if (score.sectorId) score.start(score.sectorId);
      else if (score.wantedChapter) score.playChapter(score.wantedChapter);
    }
    audio._handleScreenChanged(payload);
  },

  overlay(audio, payload) {
    audio._handleOverlayVisibilityChanged(payload);
  },
};
