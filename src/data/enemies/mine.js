// src/data/enemies/mine.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// === MINE CONFIGURATION ===

/**
 * Immutable configuration describing lifetime and explosion behavior for the
 * proximity mine enemy archetype.
 * @typedef {object} MineConfig
 * @property {string} key
 * @property {string} displayName
 * @property {number} radius
 * @property {number} health
 * @property {number} lifetime
 * @property {number} armTime
 * @property {number} proximityRadius
 * @property {number} explosionRadius
 * @property {number} explosionDamage
 * @property {number} pulseSpeed
 * @property {number} pulseAmount
 */
export const MINE_CONFIG = deepFreeze({
  key: 'mine',
  displayName: 'Proximity Mine',
  radius: 18,
  health: 20,
  lifetime: 30,
  armTime: 0.5,
  proximityRadius: 80,
  explosionRadius: 120,
  explosionDamage: 40,
  pulseSpeed: 2.6,
  pulseAmount: 0.32,
});

// === MINE REWARDS ===

/**
 * Reward distribution granted when the proximity mine is neutralized.
 * @typedef {object} MineRewards
 * @property {number} baseOrbsMin
 * @property {number} baseOrbsMax
 * @property {number} totalXP
 * @property {number} healthHeartChance
 */
export const MINE_REWARDS = deepFreeze({
  baseOrbsMin: 1,
  baseOrbsMax: 2,
  totalXP: 25,
  healthHeartChance: 0.0,
});
