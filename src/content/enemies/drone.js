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
  // A small gunship: a chamfered dart in three plates (dark chassis, steel
  // deck, hull wing plates and canopy spine), swept wings carrying an
  // engine pod each, a gun slung under the nose; its red eye at the front
  // of the canopy.
  visual: {
    scale: 1.2,
    finish: 'panel',
    parts: [
      {
        shape: 'slab',
        outline: [
          [0.84, 0],
          [0.3, 0.15],
          [-0.08, 0.3],
          [-0.5, 0.64],
          [-0.64, 0.58],
          [-0.44, 0.26],
          [-0.62, 0.16],
          [-0.62, -0.16],
          [-0.44, -0.26],
          [-0.64, -0.58],
          [-0.5, -0.64],
          [-0.08, -0.3],
          [0.3, -0.15],
        ],
        bottom: -0.12,
        top: 0,
        material: 'trim',
      },
      {
        shape: 'slab',
        outline: [
          [0.74, 0],
          [0.28, 0.12],
          [-0.1, 0.2],
          [-0.5, 0.19],
          [-0.56, 0.1],
          [-0.56, -0.1],
          [-0.5, -0.19],
          [-0.1, -0.2],
          [0.28, -0.12],
        ],
        bottom: -0.02,
        top: 0.12,
        material: 'steel',
      },
      {
        shape: 'slab',
        outline: [
          [-0.06, 0.25],
          [-0.47, 0.58],
          [-0.56, 0.54],
          [-0.42, 0.26],
        ],
        bottom: -0.02,
        top: 0.04,
        bevel: 0.015,
        mirror: true,
      },
      {
        shape: 'slab',
        outline: [
          [0.46, 0],
          [0.24, 0.07],
          [-0.3, 0.09],
          [-0.4, 0.05],
          [-0.4, -0.05],
          [-0.3, -0.09],
          [0.24, -0.07],
        ],
        bottom: 0.1,
        top: 0.2,
        bevel: 0.025,
      },
      {
        shape: 'drum',
        axis: 'x',
        sides: 8,
        taper: 0.7,
        size: [0.2, 0.1, 0.1],
        at: [-0.3, 0.08, 0.42],
        mirror: true,
        material: 'steel',
      },
      {
        shape: 'drum',
        axis: 'x',
        sides: 8,
        size: [0.04, 0.11, 0.11],
        at: [-0.53, 0.08, 0.42],
        mirror: true,
        material: 'trim',
      },
      {
        shape: 'drum',
        axis: 'x',
        sides: 8,
        size: [0.015, 0.075, 0.075],
        at: [-0.58, 0.08, 0.42],
        mirror: true,
        material: 'soot',
      },
      {
        shape: 'drum',
        axis: 'x',
        sides: 8,
        size: [0.015, 0.06, 0.06],
        at: [-0.09, 0.08, 0.42],
        mirror: true,
        material: 'soot',
      },
      {
        shape: 'box',
        size: [0.14, 0.012, 0.035],
        at: [-0.36, 0.12, 0.135],
        mirror: true,
        material: 'soot',
      },
      {
        shape: 'box',
        size: [0.16, 0.045, 0.07],
        at: [0.4, -0.15, 0],
        material: 'trim',
      },
      {
        shape: 'drum',
        axis: 'x',
        sides: 6,
        size: [0.32, 0.04, 0.04],
        at: [0.7, -0.15, 0],
        material: 'steel',
      },
      {
        shape: 'drum',
        axis: 'x',
        sides: 6,
        size: [0.04, 0.055, 0.055],
        at: [0.98, -0.15, 0],
        material: 'trim',
      },
    ],
    lights: [{ at: [0.46, 0.17, 0], dir: [1, 1.2, 0], size: 0.1 }],
  },
  codex: {
    lore: 'The smallest of the Ring’s keepers. It wakes in swarms and never alone.',
    hint: 'Fast and fragile. Fires one shot at a time, aimed ahead of you; change course.',
    glyph: '<circle r="9"/><circle class="eye" r="3"/>',
  },
};
