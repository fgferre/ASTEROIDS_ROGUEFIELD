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
