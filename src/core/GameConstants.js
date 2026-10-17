// src/core/GameConstants.js

// Import from focused configuration files
import * as PhysicsConstants from '../data/constants/physics.js';
import * as GameplayConstants from '../data/constants/gameplay.js';
import * as VisualConstants from '../data/constants/visual.js';
import * as AsteroidConfigs from '../data/enemies/asteroid-configs.js';
import * as DroneConfigs from '../data/enemies/drone.js';
import * as HunterConfigs from '../data/enemies/hunter.js';
import * as MineConfigs from '../data/enemies/mine.js';
import * as BossConfigs from '../data/enemies/boss.js';

// === DIMENSÕES DO JOGO ===
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;
export const SHIP_SIZE = 15;
export const DEFAULT_SAFE_SPAWN_DISTANCE = 300;
export const PLAYER_SAFE_SPAWN_DISTANCE = 300;

// === TAMANHOS DE OBJETOS ===
export const ASTEROID_SIZES = {
  large: 35,
  medium: 22,
  small: 12,
};

export const ASTEROID_BASE_HEALTH = {
  large: 90,
  medium: 50,
  small: 30,
};

export const ASTEROID_HEALTH_SCALING = {
  perWave: 0.12,
  maxMultiplier: 2.2, // Waves 1-10: 1 + perWave * (wave - 1), clamped here (wave 10 = 2.08x); also the base at wave 11
  // Waves 11+ (infiniteScaling): multiplier = 2.2 + (wave - 11) * 0.08, linear until softCapWave
  // Wave 11: 2.2x, wave 15: 2.52x, wave 20: 2.92x, wave 30: 3.72x
  // From softCapWave on, growth is log2 (diminishing); hard cap at infiniteScaling.maxMultiplier
  infiniteScaling: {
    enabled: true,
    startWave: 11,
    perWaveIncrement: 0.08, // Slower than early game
    softCapWave: 50, // Start diminishing returns
    maxMultiplier: 10.0, // Hard cap at 10x base HP
  },
};

export const BULLET_SIZE = 3;
export const XP_ORB_SIZE = 8;
export const TRAIL_LENGTH = 6;
export const PHYSICS_CELL_SIZE = 96;

// === PROGRESSÃO ===
export const PROGRESSION_INITIAL_LEVEL = 1;
export const PROGRESSION_INITIAL_XP_REQUIREMENT = 150;
export const PROGRESSION_LEVEL_SCALING = 1.4;
// Simulation seconds between the level-up event and the pick screen opening,
// so the slow-mo + zoom pulse play first (proposta 17/10).
export const LEVEL_UP_SCREEN_DELAY_SECONDS = 0.12; // proposta 17/10: tempo de simulação; durante o slow-mo de 0.35x vale ~0.34 s reais, a tela abre a um terço do pulso
export const PROGRESSION_UPGRADE_ROLL_COUNT = 3;
export const PROGRESSION_UPGRADE_FALLBACK_COUNT = 3;
export const PROGRESSION_COMBO_TIMEOUT = 3.0;
export const PROGRESSION_COMBO_MULTIPLIER_STEP = 0.1;
export const PROGRESSION_COMBO_MULTIPLIER_CAP = 2.0;

// === BOSS DIFFICULTY SCALING (Phase 0 — FIX-04) ===
// Multiplicative scalar applied to boss base stats per cumulative upgrade-level
// sum (sum of progressionService.appliedUpgrades values). Orthogonal to the
// per-wave healthScaling. Starting values per CONTEXT D-17 — calibrated via
// tests/integration/boss-curve.test.js and may be re-tuned in Task 3.
export const UPGRADE_BOSS_HEALTH_SCALAR = 0.18;
// FIX-04 Task 4 follow-up (2026-05-13): dropped from 0.05 -> 0.00 after live
// playtest at 0.18 / 0.05 killed the 6-upgrade player. The harness stub didn't
// model player vulnerability, so the damage bump (1.30x at sum=6) wasn't
// reflected as a lethality risk. HP scaling alone meets the "boss not melted
// by 15-upgrade builds" goal; damage scaling can be re-introduced in a later
// phase if 15-upgrade builds trivialize the boss after HP scaling is in place.
export const UPGRADE_BOSS_DAMAGE_SCALAR = 0.0;

// Re-export all constants from focused files for backward compatibility
export * from '../data/constants/physics.js';
export * from '../data/constants/gameplay.js';
export * from '../data/constants/visual.js';
export * from '../data/enemies/asteroid-configs.js';
export * from '../data/enemies/drone.js';
export * from '../data/enemies/hunter.js';
export * from '../data/enemies/mine.js';

// Namespace exports for optional direct module access
export {
  PhysicsConstants,
  GameplayConstants,
  VisualConstants,
  AsteroidConfigs,
  DroneConfigs,
  HunterConfigs,
  MineConfigs,
  BossConfigs,
};

// === AUDIO PRESETS ===
export const BOSS_AUDIO_FREQUENCY_PRESETS = Object.freeze({
  roar: Object.freeze({
    duration: 1.2,
    attackGain: 0.22,
    sustainGain: 0.16,
    releaseDuration: 0.5,
    sweep: Object.freeze({ start: 80, end: 150, duration: 0.7 }),
    vibrato: Object.freeze({ depth: 8, speed: 5.5 }),
    harmonics: Object.freeze([220, 330]),
    tail: Object.freeze({ frequency: 58, duration: 0.5, gain: 0.12 }),
    filter: Object.freeze({ type: 'lowpass', frequency: 360 }),
  }),
  phaseChange: Object.freeze({
    duration: 0.6,
    sweep: Object.freeze({ start: 220, end: 820 }),
    shimmer: Object.freeze({
      frequencies: Object.freeze([660, 880, 990, 1320]),
      spacing: 0.08,
      gain: 0.1,
    }),
    swell: Object.freeze({ frequency: 180, duration: 0.8, gain: 0.12 }),
  }),
  defeated: Object.freeze({
    duration: 2.0,
    fanfare: Object.freeze({
      notes: Object.freeze([
        Object.freeze({ frequency: 392, delay: 0, duration: 0.5, gain: 0.16 }),
        Object.freeze({
          frequency: 523,
          delay: 0.18,
          duration: 0.6,
          gain: 0.18,
        }),
        Object.freeze({
          frequency: 659,
          delay: 0.38,
          duration: 0.7,
          gain: 0.18,
        }),
        Object.freeze({
          frequency: 784,
          delay: 0.58,
          duration: 0.75,
          gain: 0.2,
        }),
      ]),
      harmony: Object.freeze({
        frequencies: Object.freeze([196, 294, 392]),
        duration: 1.6,
        gain: 0.12,
      }),
    }),
    choir: Object.freeze({ frequency: 220, duration: 1.8, gain: 0.08 }),
    sparkle: Object.freeze({
      frequencies: Object.freeze([1046, 1318, 1567]),
      spacing: 0.12,
      duration: 0.5,
      gain: 0.08,
    }),
  }),
});

export const MUSIC_LAYER_CONFIG = Object.freeze({
  layers: Object.freeze({
    base: Object.freeze({
      frequency: 110,
      type: 'sine',
      modulationDepth: 0.55,
      modulationRate: 0.07,
      modulationType: 'sine',
      randomDetuneCents: 8,
      filter: Object.freeze({
        type: 'lowpass',
        frequency: 420,
        Q: 0.8,
      }),
    }),
    tension: Object.freeze({
      frequency: 220,
      type: 'triangle',
      modulationDepth: 0.4,
      modulationRate: 0.12,
      modulationType: 'sine',
      randomDetuneCents: 6,
      filter: Object.freeze({
        type: 'bandpass',
        frequency: 680,
        Q: 1.1,
      }),
    }),
    danger: Object.freeze({
      frequency: 330,
      type: 'sawtooth',
      modulationDepth: 0.32,
      modulationRate: 0.18,
      modulationType: 'triangle',
      randomDetuneCents: 5,
      filter: Object.freeze({
        type: 'bandpass',
        frequency: 940,
        Q: 1.3,
      }),
    }),
    climax: Object.freeze({
      frequency: 440,
      type: 'square',
      modulationDepth: 0.26,
      modulationRate: 0.24,
      modulationType: 'sine',
      randomDetuneCents: 4,
      filter: Object.freeze({
        type: 'highpass',
        frequency: 520,
        Q: 0.7,
      }),
    }),
  }),
  intensities: Object.freeze([
    Object.freeze({ base: 0.0, tension: 0.0, danger: 0.0, climax: 0.0 }),
    Object.freeze({ base: 0.18, tension: 0.08, danger: 0.0, climax: 0.0 }),
    Object.freeze({ base: 0.2, tension: 0.12, danger: 0.08, climax: 0.0 }),
    Object.freeze({ base: 0.22, tension: 0.16, danger: 0.12, climax: 0.08 }),
  ]),
  initialIntensity: 0,
  relaxedIntensity: 0,
  bossIntensity: 3,
  rampDurations: Object.freeze({
    rise: 1.2,
    fall: 2.0,
    bossRise: 0.6,
    bossFall: 2.8,
  }),
});

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
});

// Enemy-side cues pan by source x relative to the player.
export const AUDIO_STEREO_PAN_MAX = 0.6;

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

// enemy-destroyed → explosion size. Asteroids use their own `size`; mines have
// their own cue (mine-exploded); unknown types fall back to the default; an
// `elite` flag bumps one size up. Types not in this checkout yet are listed so
// they work when they land.
export const EXPLOSION_SIZE_BY_ENEMY_TYPE = Object.freeze({
  mote: 'small',
  drone: 'small',
  seeker: 'medium',
  hunter: 'medium',
  husk: 'medium',
  ram: 'medium',
  weaver: 'medium',
  bulwark: 'large',
  warden: 'large',
  boss: 'large',
  mine: null,
});
export const EXPLOSION_DEFAULT_SIZE = 'medium';

// Short music duck on big moments (level-up, large explosions).
export const AUDIO_BIG_MOMENT_DUCK = Object.freeze({
  depthDb: 6,
  attackMs: 30,
  holdMs: 70,
  releaseMs: 150,
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
