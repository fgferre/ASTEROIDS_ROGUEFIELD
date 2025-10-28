// src/data/enemies/drone.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// === DRONE CONFIGURATION ===

/**
 * Immutable configuration describing the base combat stats and behavior tuning
 * for the assault drone enemy archetype.
 * @typedef {object} DroneConfig
 * @property {string} key
 * @property {string} displayName
 * @property {number} radius
 * @property {number} health
 * @property {number} speed
 * @property {number} acceleration
 * @property {number} fireRate
 * @property {number} fireVariance
 * @property {number} fireSpread
 * @property {number} projectileSpeed
 * @property {number} projectileDamage
 * @property {number} projectileLifetime
 * @property {number} targetingRange
 * @property {number} contactDamage
 */
export const DRONE_CONFIG = deepFreeze({
  key: 'drone',
  displayName: 'Assault Drone',
  radius: 12,
  health: 30,
  speed: 180,
  acceleration: 260,
  fireRate: 2.0,
  fireVariance: 0.35,
  fireSpread: 0.06,
  projectileSpeed: 340,
  projectileDamage: 15,
  projectileLifetime: 2.0,
  targetingRange: 460,
  contactDamage: 12,
});

/**
 * Component configuration describing how the drone composes movement, weapon,
 * rendering, collision and health behaviors. This structure is consumed by the
 * EnemyFactory to instantiate reusable components instead of bespoke logic.
 *
 * @typedef {object} DroneComponents
 * @property {object} movement - Tracking movement tuning
 * @property {object} weapon - Predictive single-shot weapon configuration
 * @property {object} render - Procedural triangle renderer configuration
 * @property {object} collision - Collision radius/response tuning
 * @property {object} health - Base health and scaling configuration
 */
export const DRONE_COMPONENTS = deepFreeze({
  movement: {
    strategy: 'tracking',
    speed: 180,
    acceleration: 260,
    maxSpeed: 180,
    targetingRange: 460,
  },
  weapon: {
    pattern: 'single',
    damage: 15,
    speed: 340,
    lifetime: 2.0,
    cooldown: 2.0,
    variance: 0.35,
    spread: 0.06,
    predictive: true,
  },
  render: {
    strategy: 'procedural',
    shape: 'triangle',
    showThrust: true,
  },
  collision: {
    shape: 'circle',
    radius: 12,
    response: 'damage',
    contactDamage: 12,
  },
  health: {
    base: 30,
    armor: 0,
    scaling: 1.0,
  },
});

// === DRONE REWARDS ===

/**
 * Reward distribution granted when the assault drone is defeated.
 * @typedef {object} DroneRewards
 * @property {number} baseOrbs
 * @property {number} totalXP
 * @property {number} healthHeartChance
 */
export const DRONE_REWARDS = deepFreeze({
  baseOrbs: 2,
  totalXP: 30,
  healthHeartChance: 0.0,
});
