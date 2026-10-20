// src/core/GameConstants.js

// Import from focused configuration files
import * as PhysicsConstants from '../data/constants/physics.js';
import * as GameplayConstants from '../data/constants/gameplay.js';
import * as VisualConstants from '../data/constants/visual.js';
import * as AsteroidConfigs from '../data/enemies/asteroid-configs.js';
import * as BossConfigs from '../data/enemies/boss.js';

// === DIMENSÕES DO JOGO ===
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;
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
// The step to pilot level n costs INITIAL + STEP × (n − 2)^POWER XP: level 2
// costs 120 and each later step a little more (ProgressionSystem.levelCost).
export const PROGRESSION_INITIAL_XP_REQUIREMENT = 120; // proposta 20/10
export const PROGRESSION_LEVEL_COST_STEP = 40; // proposta 20/10
export const PROGRESSION_LEVEL_COST_POWER = 1.7; // proposta 20/10
// Simulation seconds between the level-up event and the pick screen opening,
// so the slow-mo + zoom pulse play first (proposta 17/10).
export const LEVEL_UP_SCREEN_DELAY_SECONDS = 0.12; // proposta 17/10: tempo de simulação; durante o slow-mo de 0.35x vale ~0.34 s reais, a tela abre a um terço do pulso
export const PROGRESSION_UPGRADE_ROLL_COUNT = 3;
export const PROGRESSION_UPGRADE_FALLBACK_COUNT = 3;
// Level-up card rarity: each eligible card's draw weight is its rarity's
// weight at pilot level 1, plus what each level above 1 adds to rare/epic, up
// to their caps (a tier with more cards comes up more often).
export const UPGRADE_RARITIES = Object.freeze(['common', 'rare', 'epic']);
export const UPGRADE_RARITY_BASE_WEIGHTS = Object.freeze({
  common: 1.0, // proposta 20/10
  rare: 0.55, // proposta 20/10
  epic: 0.25, // proposta 20/10
});
export const UPGRADE_RARITY_WEIGHT_PER_LEVEL = Object.freeze({
  rare: 0.01, // proposta 20/10
  epic: 0.02, // proposta 20/10
});
export const UPGRADE_RARITY_WEIGHT_CAPS = Object.freeze({
  rare: 0.75, // proposta 20/10
  epic: 0.6, // proposta 20/10
});
// A card of a family the run holds k distinct cards of, from one up to one
// short of its Apex, weighs × (1 + this × k): offers lean toward the build.
export const UPGRADE_FAMILY_STEER_PER_CARD = 0.5; // proposta 20/10
// Pilot levels whose offer holds a weapon card while the run has none: the
// second is the second chance if the first was turned down.
export const UPGRADE_WEAPON_OFFER_LEVELS = Object.freeze([3, 7]); // proposta 20/10
// Per-run level-up rerolls and banishes (proposta 18/10).
export const PROGRESSION_UPGRADE_REROLLS_PER_RUN = 1;
export const PROGRESSION_UPGRADE_BANISHES_PER_RUN = 1;
export const PROGRESSION_COMBO_TIMEOUT = 3.0;
export const PROGRESSION_COMBO_MULTIPLIER_STEP = 0.1;
export const PROGRESSION_COMBO_MULTIPLIER_CAP = 2.0;

// === BOSS DIFFICULTY SCALING (Phase 0 — FIX-04) ===
// Boss damage scalar per cumulative upgrade-level sum (sum of
// progressionService.appliedUpgrades values). Warden health no longer scales
// with cards: each Warden has its own `healthFactor` (src/content/bosses/).
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

// Namespace exports for optional direct module access
export {
  PhysicsConstants,
  GameplayConstants,
  VisualConstants,
  AsteroidConfigs,
  BossConfigs,
};
