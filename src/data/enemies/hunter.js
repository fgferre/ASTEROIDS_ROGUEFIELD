// src/data/enemies/hunter.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// === HUNTER CONFIGURATION ===

/**
 * Immutable configuration describing stats and firing behavior for the hunter
 * frigate enemy archetype.
 * @typedef {object} HunterConfig
 * @property {string} key
 * @property {string} displayName
 * @property {number} radius
 * @property {number} health
 * @property {number} speed
 * @property {number} acceleration
 * @property {number} preferredDistance
 * @property {number} projectileSpeed
 * @property {number} projectileDamage
 * @property {number} projectileLifetime
 * @property {number} fireRange
 * @property {number} burstCount
 * @property {number} burstInterval
 * @property {number} burstDelay
 * @property {number} fireSpread
 */
export const HUNTER_CONFIG = deepFreeze({
  key: 'hunter',
  displayName: 'Hunter Frigate',
  radius: 16,
  health: 48,
  speed: 120,
  acceleration: 220,
  preferredDistance: 175,
  projectileSpeed: 420,
  projectileDamage: 12,
  projectileLifetime: 1.5,
  fireRange: 520,
  burstCount: 3,
  burstInterval: 3.5,
  burstDelay: 0.15,
  fireSpread: 0.045,
});

/**
 * Component configuration providing reusable behaviors for the hunter frigate
 * enemy. These definitions are consumed by the EnemyFactory when constructing
 * the hunter to attach the appropriate movement, weapon, render, collision and
 * health components.
 *
 * @typedef {object} HunterComponents
 * @property {object} movement - Orbit movement tuning
 * @property {object} weapon - Burst weapon behavior
 * @property {object} render - Procedural diamond renderer configuration
 * @property {object} collision - Collision radius/response tuning
 * @property {object} health - Base health and scaling modifiers
 */
export const HUNTER_COMPONENTS = deepFreeze({
  movement: {
    strategy: 'orbit',
    speed: 120,
    acceleration: 220,
    maxSpeed: 120,
    preferredDistance: 175,
    orbitDirection: 1,
  },
  weapon: {
    pattern: 'burst',
    damage: 12,
    speed: 420,
    lifetime: 1.5,
    burstCount: 3,
    burstDelay: 0.15,
    burstInterval: 3.5,
    spread: 0.045,
    fireRange: 520,
    predictive: true,
  },
  render: {
    strategy: 'procedural-diamond',
    showTurret: true,
  },
  collision: {
    shape: 'circle',
    radius: 16,
    response: 'damage',
  },
  health: {
    base: 48,
    armor: 0,
    scaling: 1.0,
  },
});

// === HUNTER REWARDS ===

/**
 * Reward distribution granted when the hunter frigate is destroyed.
 * @typedef {object} HunterRewards
 * @property {number} baseOrbs
 * @property {number} totalXP
 * @property {number} healthHeartChance
 */
export const HUNTER_REWARDS = deepFreeze({
  baseOrbs: 3,
  totalXP: 50,
  healthHeartChance: 0.03,
});
