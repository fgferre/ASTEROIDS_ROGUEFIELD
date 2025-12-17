// src/data/enemies/boss.js

import { deepFreeze } from '../../utils/deepFreeze.js';

/**
 * Boss enemy configuration following canonical schema.
 * See schema.js for complete field definitions and naming conventions.
 *
 * @typedef {import('./schema.js').EnemyConfigSchema} EnemyConfigSchema
 */

// === BOSS CONFIGURATION ===

/**
 * Immutable configuration describing the boss enemy's combat phases,
 * behaviors, and scaling parameters.
 *
 * @deprecated Use BOSS_COMPONENTS for component-based configs
 *
 * @typedef {object} BossConfig
 * @property {string} key
 * @property {string} displayName
 * @property {number} radius
 * @property {number} safeDistance
 * @property {number} entryPadding
 * @property {number} entryDriftSpeed
 * @property {number} health
 * @property {number} healthScaling
 * @property {number} acceleration
 * @property {number} contactDamage
 * @property {number} projectileDamage
 * @property {number} spreadProjectileCount
 * @property {number} spreadProjectileSpeed
 * @property {number} spreadCooldown - Spread pattern cooldown (replaces spreadInterval)
 * @property {number} spreadVariance
 * @property {number} spreadArc
 * @property {number} spreadAngleVariance
 * @property {number} volleyBurstSize
 * @property {number} volleyShotDelay
 * @property {number} volleyCooldown - Volley pattern cooldown (replaces volleyInterval)
 * @property {number} volleyVariance
 * @property {number} volleyProjectileSpeed
 * @property {number} volleySpread
 * @property {string[]} minionTypes
 * @property {number} spawnCooldown - Minion spawn cooldown (replaces spawnInterval)
 * @property {number} spawnVariance
 * @property {number} chargeCooldown
 * @property {number} chargeDuration
 * @property {number} chargeRecovery
 * @property {number} chargeSpeedMultiplier
 * @property {number} chargeProjectileCount
 * @property {number} chargeProjectileSpeed
 * @property {number} chargeProjectileVariance
 * @property {number} chargeAimVariance
 * @property {number[]} phaseThresholds
 * @property {number} phaseCount
 * @property {number} invulnerabilityDuration
 * @property {number} [spreadInterval] - @deprecated Use spreadCooldown instead
 * @property {number} [volleyInterval] - @deprecated Use volleyCooldown instead
 * @property {number} [spawnInterval] - @deprecated Use spawnCooldown instead
 */
const _bossConfigBase = {
  key: 'boss',
  displayName: 'Apex Overlord',
  radius: 60,
  safeDistance: 240,
  entryPadding: 24,
  entryDriftSpeed: 85,
  health: 1500,
  healthScaling: 1.2,
  acceleration: 120,
  contactDamage: 45,
  projectileDamage: 35,
  spreadProjectileCount: 7,
  spreadProjectileSpeed: 260,
  spreadCooldown: 2.4,
  spreadVariance: 0.45,
  spreadArc: 0.85,
  spreadAngleVariance: 0.12,
  volleyBurstSize: 5,
  volleyShotDelay: 0.16,
  volleyCooldown: 1.35,
  volleyVariance: 0.2,
  volleyProjectileSpeed: 320,
  volleySpread: 0.12,
  minionTypes: ['drone', 'hunter'],
  spawnCooldown: 6.5,
  spawnVariance: 1.1,
  chargeCooldown: 6.2,
  chargeDuration: 1.1,
  chargeRecovery: 1.4,
  chargeSpeedMultiplier: 3.1,
  chargeProjectileCount: 10,
  chargeProjectileSpeed: 420,
  chargeProjectileVariance: 0.08,
  chargeAimVariance: 0.18,
  phaseThresholds: [0.66, 0.33],
  phaseCount: 3,
  invulnerabilityDuration: 2.0,
  rewards: Object.freeze({
    xp: 500,
    lootTable: Object.freeze(['core-upgrade', 'weapon-blueprint']),
  }),
  phaseColors: Object.freeze(['#ff6b6b', '#f9c74f', '#4d96ff']),
};

// Add deprecated aliases for backward compatibility
// TODO: Remove these aliases after dependent code migrates to new field names
_bossConfigBase.spreadInterval = _bossConfigBase.spreadCooldown;
_bossConfigBase.volleyInterval = _bossConfigBase.volleyCooldown;
_bossConfigBase.spawnInterval = _bossConfigBase.spawnCooldown;

export const BOSS_CONFIG = deepFreeze(_bossConfigBase);

/**
 * Component configuration that assembles the boss enemy from modular behaviors.
 * Movement, weapon patterns, rendering, collision and health management are
 * delegated to reusable components defined here so the boss class can focus on
 * phase orchestration and minion control.
 *
 * @typedef {object} BossComponents
 * @property {object} movement - Seeking movement strategy configuration
 * @property {object} weapon - Multi-pattern weapon configuration
 * @property {object} render - Procedural boss renderer tuning
 * @property {object} collision - Collision radius/response parameters
 * @property {object} health - Health/armor/phase configuration
 */
export const BOSS_COMPONENTS = deepFreeze({
  movement: {
    strategy: 'seeking',
    acceleration: 120,
    maxSpeed: 60,
    safeDistance: 240,
    damping: 0.95,
  },
  weapon: {
    patterns: ['spread', 'volley'],
    spread: {
      projectileCount: 7,
      speed: 260,
      cooldown: 2.4,
      variance: 0.45,
      arc: 0.85,
      angleVariance: 0.12,
    },
    volley: {
      burstSize: 5,
      shotDelay: 0.16,
      cooldown: 1.35,
      variance: 0.2,
      speed: 320,
      spread: 0.12,
    },
    damage: 35,
  },
  render: {
    strategy: 'procedural',
    shape: 'boss',
    showAura: true,
    showPhaseColor: true,
  },
  collision: {
    shape: 'circle',
    radius: 60,
    response: 'damage',
    contactDamage: 45,
  },
  health: {
    base: 1500,
    armor: 0,
    scaling: 1.2,
    phaseThresholds: [0.66, 0.33],
    invulnerabilityDuration: 2.0,
  },
});

// === BOSS PHYSICS ===

/**
 * Physics tuning and damage values for boss interactions.
 * @typedef {object} BossPhysicsConfig
 * @property {number} spatialPadding
 * @property {number} collisionPadding
 * @property {number} contactKnockback
 * @property {number} contactCooldownMs
 * @property {number} chargeKnockback
 * @property {number} chargeBossSlow
 * @property {number} chargeDamageBonus
 * @property {number} chargeCooldownMs
 * @property {number} areaDamage
 * @property {number} areaForce
 * @property {number} areaRadiusMultiplier
 */
export const BOSS_PHYSICS_CONFIG = deepFreeze({
  spatialPadding: 24,
  collisionPadding: 18,
  contactKnockback: 140,
  contactCooldownMs: 140,
  chargeKnockback: 520,
  chargeBossSlow: 320,
  chargeDamageBonus: 18,
  chargeCooldownMs: 260,
  areaDamage: 48,
  areaForce: 360,
  areaRadiusMultiplier: 2.35,
  contactShake: Object.freeze({ intensity: 10, duration: 0.35 }),
  chargeShake: Object.freeze({ intensity: 16, duration: 0.6 }),
  areaShake: Object.freeze({ intensity: 12, duration: 0.45 }),
});

// === BOSS EFFECTS PRESETS ===
// NOTE: These presets are purely visual and remain colocated with the boss data for
// easier balancing. visual.js re-exports them to preserve existing visual imports.

/**
 * Visual effect presets applied during key boss events (entrance, phase
 * transitions, defeat sequences).
 */
export const BOSS_EFFECTS_PRESETS = deepFreeze({
  entrance: Object.freeze({
    swirl: Object.freeze({
      count: 48,
      innerRadius: 42,
      outerRadius: 120,
      speed: Object.freeze({ min: 80, max: 150 }),
      size: Object.freeze({ min: 2.2, max: 3.4 }),
      life: Object.freeze({ min: 0.5, max: 0.8 }),
    }),
    burst: Object.freeze({
      rings: 2,
      particlesPerRing: 22,
      radiusStep: 44,
      speed: Object.freeze({ min: 140, max: 220 }),
      size: Object.freeze({ min: 2.8, max: 4.2 }),
      life: Object.freeze({ min: 0.45, max: 0.75 }),
    }),
    dust: Object.freeze({
      count: 28,
      speed: Object.freeze({ min: 40, max: 90 }),
      size: Object.freeze({ min: 3.2, max: 5.2 }),
      life: Object.freeze({ min: 0.8, max: 1.4 }),
    }),
    colors: Object.freeze({
      core: '#ff6b9c',
      accent: '#ffe066',
      trail: '#ff9f1c',
      smoke: 'rgba(255, 255, 255, 0.24)',
      flash: 'rgba(255, 160, 220, 0.45)',
    }),
    shockwave: Object.freeze({
      radius: 420,
      duration: 0.75,
      baseWidth: 34,
      maxAlpha: 0.7,
      shadowColor: 'rgba(255, 120, 200, 0.45)',
      shadowBlur: 45,
      fillColor: 'rgba(255, 120, 200, 0.12)',
      widthFade: 0.7,
      easingPower: 1.3,
    }),
    screenFlash: Object.freeze({
      color: 'rgba(255, 140, 220, 0.4)',
      duration: 0.45,
      intensity: 0.32,
    }),
    freezeFrame: Object.freeze({ duration: 0.18, fade: 0.2 }),
    slowMotion: Object.freeze({ scale: 0.55, hold: 0.18, duration: 0.65 }),
  }),
  phaseTransition: Object.freeze({
    burst: Object.freeze({
      count: 48,
      speed: Object.freeze({ min: 160, max: 280 }),
      size: Object.freeze({ min: 2.2, max: 3.4 }),
      life: Object.freeze({ min: 0.35, max: 0.65 }),
    }),
    petals: Object.freeze({
      count: 16,
      radius: 110,
      angularJitter: 0.3,
      speed: Object.freeze({ min: 60, max: 120 }),
      size: Object.freeze({ min: 2.6, max: 3.6 }),
      life: Object.freeze({ min: 0.4, max: 0.75 }),
    }),
    embers: Object.freeze({
      count: 24,
      speed: Object.freeze({ min: 35, max: 70 }),
      size: Object.freeze({ min: 2.4, max: 3.4 }),
      life: Object.freeze({ min: 1.1, max: 1.6 }),
    }),
    colors: Object.freeze({
      core: '#ffd166',
      accent: '#5cc8ff',
      smoke: 'rgba(255, 255, 255, 0.28)',
      flash: 'rgba(255, 255, 255, 0.6)',
    }),
    shockwave: Object.freeze({
      radius: 360,
      duration: 0.6,
      baseWidth: 26,
      maxAlpha: 0.65,
      shadowColor: 'rgba(255, 255, 255, 0.45)',
      shadowBlur: 35,
      fillColor: 'rgba(255, 255, 255, 0.12)',
      widthFade: 0.65,
      easingPower: 1.4,
    }),
    screenFlash: Object.freeze({
      color: 'rgba(255, 255, 255, 0.55)',
      duration: 0.36,
      intensity: 0.28,
    }),
    freezeFrame: Object.freeze({ duration: 0.3, fade: 0.25 }),
    slowMotion: Object.freeze({ scale: 0.6, hold: 0.16, duration: 0.6 }),
  }),
  defeated: Object.freeze({
    debris: Object.freeze({
      count: 60,
      speed: Object.freeze({ min: 180, max: 320 }),
      size: Object.freeze({ min: 2.8, max: 4.6 }),
      life: Object.freeze({ min: 0.9, max: 1.4 }),
    }),
    sparks: Object.freeze({
      count: 90,
      speed: Object.freeze({ min: 260, max: 400 }),
      size: Object.freeze({ min: 2.4, max: 3.8 }),
      life: Object.freeze({ min: 0.5, max: 0.85 }),
    }),
    embers: Object.freeze({
      count: 32,
      speed: Object.freeze({ min: 30, max: 60 }),
      size: Object.freeze({ min: 3.2, max: 4.4 }),
      life: Object.freeze({ min: 1.5, max: 2.2 }),
    }),
    smoke: Object.freeze({
      count: 26,
      speed: Object.freeze({ min: 20, max: 55 }),
      size: Object.freeze({ min: 18, max: 26 }),
      life: Object.freeze({ min: 1.6, max: 2.8 }),
    }),
    colors: Object.freeze({
      core: '#ff6b9c',
      accent: '#ffe066',
      flash: '#ffffff',
      smoke: 'rgba(240, 240, 255, 0.25)',
    }),
    shockwave: Object.freeze({
      radius: 520,
      duration: 0.95,
      baseWidth: 42,
      maxAlpha: 0.8,
      shadowColor: 'rgba(255, 255, 255, 0.5)',
      shadowBlur: 50,
      fillColor: 'rgba(255, 255, 255, 0.18)',
      widthFade: 0.7,
      easingPower: 1.2,
    }),
    secondaryShockwave: Object.freeze({
      radius: 360,
      duration: 0.7,
      baseWidth: 22,
      maxAlpha: 0.55,
      fillColor: 'rgba(255, 170, 220, 0.18)',
      widthFade: 0.6,
      easingPower: 1.6,
    }),
    screenFlash: Object.freeze({
      color: 'rgba(255, 255, 255, 0.7)',
      duration: 0.6,
      intensity: 0.5,
    }),
    freezeFrame: Object.freeze({ duration: 0.5, fade: 0.35 }),
    slowMotion: Object.freeze({ scale: 0.38, hold: 0.32, duration: 1.1 }),
  }),
});

// === BOSS SCREEN SHAKES ===
// NOTE: Screen shake presets stay alongside the boss configuration while being
// re-exported by visual.js for backwards compatibility with rendering systems.

/**
 * Screen shake presets triggered by boss events.
 */
export const BOSS_SCREEN_SHAKES = deepFreeze({
  spawn: Object.freeze({ intensity: 18, duration: 0.65, preset: 'bossSpawn' }),
  phaseChange: Object.freeze({
    intensity: 14,
    duration: 0.5,
    preset: 'bossPhaseChange',
  }),
  defeated: Object.freeze({
    intensity: 24,
    duration: 0.85,
    preset: 'bossDefeated',
  }),
});

// === BOSS REWARDS ===

/**
 * Reward distribution granted when the boss is defeated.
 * @typedef {object} BossRewards
 * @property {number} baseOrbs
 * @property {number} totalXP
 * @property {number} healthHeartChance
 */
export const BOSS_REWARDS = deepFreeze({
  baseOrbs: 10,
  totalXP: 500,
  healthHeartChance: 0.25,
});
