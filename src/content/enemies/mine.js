// src/content/enemies/mine.js

import { deepFreeze } from '../../utils/deepFreeze.js';

/**
 * Mine enemy configuration.
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
 */
export const MINE_CONFIG = deepFreeze({
  key: 'mine',
  displayName: 'Tether',
  radius: 18,
  health: 20,
  armTime: 0.5,
  proximityRadius: 80,
  explosionRadius: 120,
  explosionDamage: 40,
});

/**
 * Component configuration used to compose the proximity mine enemy from
 * reusable behaviors. Each component definition mirrors the existing inline
 * logic so the factory can attach the appropriate strategies at spawn time.
 *
 * @typedef {object} MineComponents
 * @property {object} movement - Proximity / drift behavior
 * @property {object} weapon - Proximity-triggered explosion behavior
 * @property {object} collision - Collision radius and trigger response
 * @property {object} health - Base health/armor configuration
 */
export const MINE_COMPONENTS = deepFreeze({
  movement: {
    strategy: 'proximity',
    driftSpeed: 0,
  },
  weapon: {
    pattern: 'proximity',
    damage: 40,
    explosionRadius: 120,
    proximityRadius: 80,
    armTime: 0.5,
    triggerOnProximity: true,
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

export default {
  id: 'mine',
  order: 2,
  config: MINE_CONFIG,
  components: MINE_COMPONENTS,
  rewards: MINE_REWARDS,
  pool: { initial: 5, max: 15 },
  tags: ['enemy', 'explosive', 'area-of-effect'],
  affixes: ['shielded', 'splitter', 'warded'],
  explodesOnDeath: true,
  projectileColor: 'rgba(255, 204, 102, 0.9)',
  // Its proximity movement draws its drift; its weapon component and its
  // fuse both set it off.
  seeded: true,
  behaviors: deepFreeze({
    'proximity-fuse': {
      armTime: MINE_CONFIG.armTime,
      lifetime: 30, // seconds before it blows on its own
      proximityRadius: MINE_CONFIG.proximityRadius,
      explosionRadius: MINE_CONFIG.explosionRadius,
      explosionDamage: MINE_CONFIG.explosionDamage,
    },
  }),
};
