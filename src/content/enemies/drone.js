// src/content/enemies/drone.js

import { deepFreeze } from '../../utils/deepFreeze.js';

/**
 * Drone enemy configuration following canonical schema.
 *
 */

// === DRONE CONFIGURATION ===

/**
 * Immutable configuration describing the base combat stats and behavior tuning
 * for the assault drone enemy archetype.
 *
 * @deprecated Use DRONE_COMPONENTS for component-based configs
 *
 * @typedef {object} DroneConfig
 * @property {string} key
 * @property {string} displayName
 * @property {number} radius
 * @property {number} health
 * @property {number} acceleration
 * @property {number} cooldown - Time between shots (replaces fireRate)
 * @property {number} variance - Cooldown randomization (replaces fireVariance)
 * @property {number} spread - Angular spread (replaces fireSpread)
 * @property {number} projectileSpeed
 * @property {number} projectileDamage
 * @property {number} projectileLifetime
 * @property {number} targetingRange
 * @property {number} contactDamage
 */
export const DRONE_CONFIG = deepFreeze({
  key: 'drone',
  displayName: 'Mote',
  radius: 12,
  health: 30,
  acceleration: 260,
  cooldown: 2.0,
  variance: 0.35,
  spread: 0.06,
  projectileSpeed: 340,
  projectileDamage: 15,
  projectileLifetime: 2.0,
  targetingRange: 460,
  contactDamage: 12,
});

/**
 * Component configuration describing how the drone composes movement, weapon,
 * collision and health behaviors. This structure is consumed by the
 * EnemyFactory to instantiate reusable components instead of bespoke logic.
 *
 * @typedef {object} DroneComponents
 * @property {object} movement - Tracking movement tuning
 * @property {object} weapon - Predictive single-shot weapon configuration
 * @property {object} collision - Collision radius/response tuning
 * @property {object} health - Base health and scaling configuration
 */
export const DRONE_COMPONENTS = deepFreeze({
  movement: {
    strategy: 'tracking',
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

export default {
  id: 'drone',
  order: 1,
  roles: ['skirmisher'],
  config: DRONE_CONFIG,
  components: DRONE_COMPONENTS,
  rewards: DRONE_REWARDS,
  pool: { initial: 10, max: 30 },
  tags: ['enemy', 'hostile', 'ranged'],
  affixes: ['shielded', 'swift', 'volatile', 'splitter', 'warded'],
  projectileColor: 'rgba(255, 96, 64, 0.92)',
  // Its movement and weapon components fly and shoot it.
  seeded: true,
  behaviors: deepFreeze({
    'fork-streams': {},
    'spawn-on-field': { margin: 100, spread: 100 },
  }),
  // How it looks and sounds: its shot flashes and plays the plain shot cue
  // (the defaults); it dies in a spark burst, with a small explosion.
  effects: { death: 'spark-burst' },
  explosion: 'small',
  // Its 3D look, drawn by hand (src/modules/render3d/enemies/machines.js).
  view: 'mote',
  codex: {
    lore: 'The smallest of the Ring’s keepers. It wakes in swarms and never alone.',
    hint: 'Fast and fragile. Fires one shot at a time, aimed ahead of you; change course.',
    glyph: '<circle r="9"/><circle class="eye" r="3"/>',
  },
};
