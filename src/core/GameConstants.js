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
  maxMultiplier: 2.2, // Only applies up to wave 10
  // Infinite scaling formula for wave 11+:
  // multiplier = 2.2 + (wave - 10) * 0.08 (logarithmic slow growth)
  // Wave 15: 2.2 + 5*0.08 = 2.6x
  // Wave 20: 2.2 + 10*0.08 = 3.0x
  // Wave 30: 2.2 + 20*0.08 = 3.8x
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
export const PROGRESSION_INITIAL_XP_REQUIREMENT = 100;
export const PROGRESSION_LEVEL_SCALING = 1.2;
export const PROGRESSION_UPGRADE_ROLL_COUNT = 3;
export const PROGRESSION_UPGRADE_FALLBACK_COUNT = 3;
export const PROGRESSION_COMBO_TIMEOUT = 3.0;
export const PROGRESSION_COMBO_MULTIPLIER_STEP = 0.1;
export const PROGRESSION_COMBO_MULTIPLIER_CAP = 2.0;

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
        Object.freeze({ frequency: 523, delay: 0.18, duration: 0.6, gain: 0.18 }),
        Object.freeze({ frequency: 659, delay: 0.38, duration: 0.7, gain: 0.18 }),
        Object.freeze({ frequency: 784, delay: 0.58, duration: 0.75, gain: 0.2 }),
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

console.log('[GameConstants] Loaded');
