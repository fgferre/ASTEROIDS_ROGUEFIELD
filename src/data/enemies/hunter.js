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
