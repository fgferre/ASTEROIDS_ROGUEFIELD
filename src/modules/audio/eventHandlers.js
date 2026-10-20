// The steps of src/data/audio/eventCues.js that carry logic (rows with `run`):
// each gets (audio, payload, eventName). Plain event → cue rows need none.
import {
  resolveDistanceMix,
  resolveExplosionSize,
  resolveStereoPan,
} from './SFXBus.js';
import {
  biomeThemeForLayer,
  chapterThemeForLayer,
  musicThemeForLayer,
} from './MusicThemes.js';

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

  // Progress + wave enemy total, the layer's theme (the Warden's on boss
  // layers) and the chapter stinger on a biome's first layer.
  waveStarted(audio, payload) {
    audio.updateWaveMusicIntensity(payload);
    const wave = Number(payload?.wave);
    if (!Number.isFinite(wave) || wave <= 0) return;
    audio.musicMixer.setTheme(musicThemeForLayer(wave));
    const chapterTheme = chapterThemeForLayer(wave);
    if (chapterTheme) {
      audio.sfxBus.playChapterStinger(chapterTheme);
    }
  },

  // Boss arc → MusicMixer (D-04): overrides the run intensity upwards.
  bossArc(audio, payload, eventName) {
    audio.musicMixer.setIntensityFromBossEvent(eventName, payload);
  },

  // After the Warden, the music hands back to the biome's theme.
  biomeTheme(audio) {
    audio.musicMixer.setTheme(
      biomeThemeForLayer(audio.musicMixer.runState.wave)
    );
  },

  // D-10: pause the adaptive music (underwater lowpass + 50% + gain/grid
  // freeze, no drift).
  pauseMusic(audio, payload) {
    audio.musicMixer.pause(!!payload?.isPaused);
  },

  // Low health warning + low-HP duck (AUDIO-03, D-11). Both fire on the
  // CROSSING into ≤25% HP only: repeated health events while already below
  // must not retrigger them; recovering (or dying) re-arms both edges.
  playerHealth(audio, payload) {
    const healthPercent = payload?.health / payload?.maxHealth;
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

  screen(audio, payload) {
    audio._handleScreenChanged(payload);
  },

  overlay(audio, payload) {
    audio._handleOverlayVisibilityChanged(payload);
  },
};
