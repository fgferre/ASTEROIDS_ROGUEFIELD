// src/data/enemies/mine.js

import { deepFreeze } from '../../utils/deepFreeze.js';

/**
 * Mine enemy configuration following canonical schema.
 * See schema.js for complete field definitions and naming conventions.
 *
 * @typedef {import('./schema.js').EnemyConfigSchema} EnemyConfigSchema
 */

// === MINE CONFIGURATION ===

/**
 * Immutable configuration describing lifetime and explosion behavior for the
 * proximity mine enemy archetype.
 *
 * @deprecated Use MINE_COMPONENTS for component-based configs
 *
 * @typedef {object} MineConfig
 * @property {string} key
 * @property {string} displayName
 * @property {number} radius
 * @property {number} health
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
  armTime: 0.5,
  proximityRadius: 80,
  explosionRadius: 120,
  explosionDamage: 40,
  pulseSpeed: 2.6,
  pulseAmount: 0.32,
});

/**
 * Component configuration used to compose the proximity mine enemy from
 * reusable behaviors. Each component definition mirrors the existing inline
 * logic so the factory can attach the appropriate strategies at spawn time.
 *
 * @typedef {object} MineComponents
 * @property {object} movement - Proximity / drift behavior
 * @property {object} weapon - Proximity-triggered explosion behavior
 * @property {object} render - Pulsing sphere renderer tuning
 * @property {object} collision - Collision radius and trigger response
 * @property {object} health - Base health/armor configuration
 */
export const MINE_COMPONENTS = deepFreeze({
  movement: {
    strategy: 'proximity',
    driftSpeed: 0,
    lifetime: 30,
  },
  weapon: {
    pattern: 'proximity',
    damage: 40,
    explosionRadius: 120,
    proximityRadius: 80,
    armTime: 0.5,
    triggerOnProximity: true,
  },
  render: {
    strategy: 'procedural',
    shape: 'sphere',
    showPulse: true,
    pulseSpeed: 2.6,
    pulseAmount: 0.32,
  },
  collision: {
    shape: 'circle',
    radius: 18,
    response: 'trigger',
  },
  health: {
    base: 20,
    armor: 0,
    scaling: 1.0,
  },
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
