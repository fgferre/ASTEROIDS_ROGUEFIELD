// src/content/enemies/hunter.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// A top-view outline from its right half ([x, z], nose first), mirrored.
const sym = (right) => [
  ...right,
  ...right
    .filter(([, z]) => z !== 0)
    .reverse()
    .map(([x, z]) => [x, -z]),
];
// A plate across the spine: x from `back` to `front`, `half` wide each side.
const band = (back, front, half) => [
  [front, half],
  [back, half],
  [back, -half],
  [front, -half],
];

/**
 * Hunter enemy configuration following canonical schema.
 *
 */

// === HUNTER CONFIGURATION ===

/**
 * Immutable configuration describing stats and firing behavior for the hunter
 * frigate enemy archetype.
 *
 * @deprecated Use HUNTER_COMPONENTS for component-based configs
 *
 * @typedef {object} HunterConfig
 * @property {string} key
 * @property {string} displayName
 * @property {number} radius
 * @property {number} health
 * @property {number} acceleration
 * @property {number} preferredDistance
 * @property {number} projectileSpeed
 * @property {number} projectileDamage
 * @property {number} projectileLifetime
 * @property {number} fireRange
 * @property {number} burstCount
 * @property {number} cooldown - Time between bursts (replaces burstInterval)
 * @property {number} burstDelay
 * @property {number} spread - Angular spread (replaces fireSpread)
 */
export const HUNTER_CONFIG = deepFreeze({
  key: 'hunter',
  displayName: 'Seeker',
  radius: 16,
  health: 48,
  acceleration: 220,
  preferredDistance: 175,
  projectileSpeed: 420,
  projectileDamage: 12,
  projectileLifetime: 1.5,
  fireRange: 520,
  burstCount: 3,
  cooldown: 3.5,
  burstDelay: 0.15,
  spread: 0.045,
});

/**
 * Component configuration providing reusable behaviors for the hunter frigate
 * enemy. These definitions are consumed by the EnemyFactory when constructing
 * the hunter to attach the appropriate movement, weapon, collision and
 * health components.
 *
 * @typedef {object} HunterComponents
 * @property {object} movement - Orbit movement tuning
 * @property {object} weapon - Burst weapon behavior
 * @property {object} collision - Collision radius/response tuning
 * @property {object} health - Base health and scaling modifiers
 */
export const HUNTER_COMPONENTS = deepFreeze({
  movement: {
    strategy: 'orbit',
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
    cooldown: 3.5,
    spread: 0.045,
    fireRange: 520,
    predictive: true,
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

export default {
  id: 'hunter',
  order: 3,
  roles: ['sniper'],
  config: HUNTER_CONFIG,
  components: HUNTER_COMPONENTS,
  rewards: HUNTER_REWARDS,
  pool: { initial: 5, max: 12 },
  tags: ['enemy', 'hostile', 'ranged', 'elite'],
  affixes: ['shielded', 'swift', 'volatile', 'splitter', 'warded'],
  projectileColor: 'rgba(80, 220, 255, 0.9)',
  // Its movement and weapon components fly and shoot it.
  seeded: true,
  behaviors: deepFreeze({
    'fork-streams': {},
    'orbit-side': { stream: 'maneuverRandom' },
    // The lens brightens over this window before a burst (docs/NORTE.md §3).
    'weapon-telegraph': { telegraph: 0.4 },
  }),
  // Its burst flashes and plays as one burst; it dies in a shockwave.
  effects: { fire: 'burst-flash', death: 'shock-burst' },
  cues: { fired: 'playHunterBurst' },
  // A long gun that flies: a kite-shaped armoured receiver with capacitor
  // cells on its flanks and radiator fins at its tail, a twin rail running
  // far past its nose, and a scope on its spine whose lens lights before
  // each burst.
  visual: {
    scale: 1.15,
    finish: 'panel',
    parts: [
      // the receiver: a dark keel plate and a keel fin under it, a hull
      // plate, two dorsal plates
      {
        shape: 'slab',
        outline: sym([
          [0.64, 0],
          [0.5, 0.12],
          [-0.1, 0.26],
          [-0.45, 0.33],
          [-0.8, 0.25],
          [-0.98, 0.13],
        ]),
        bottom: -0.13,
        top: 0,
        bevel: 0.03,
        material: 'trim',
      },
      {
        shape: 'wing',
        root: 0.9,
        tip: 0.45,
        span: 0.12,
        sweep: 0.3,
        thick: 0.07,
        dihedral: -Math.PI / 2,
        under: 1,
        sides: 6,
        at: [-0.25, -0.1, 0],
        material: 'trim',
      },
      {
        shape: 'slab',
        outline: sym([
          [0.58, 0],
          [0.45, 0.1],
          [-0.1, 0.22],
          [-0.45, 0.28],
          [-0.76, 0.21],
          [-0.92, 0.1],
        ]),
        bottom: -0.03,
        top: 0.09,
        bevel: 0.03,
      },
      {
        shape: 'slab',
        outline: sym([
          [0.46, 0],
          [0.34, 0.08],
          [-0.12, 0.17],
        ]),
        bottom: 0.06,
        top: 0.15,
        bevel: 0.03,
      },
      {
        shape: 'slab',
        outline: sym([
          [-0.19, 0.18],
          [-0.48, 0.22],
          [-0.8, 0.13],
        ]),
        bottom: 0.06,
        top: 0.14,
        bevel: 0.03,
      },
      // radiator fins across the tail
      ...[-0.6, -0.67, -0.74].map((x) => ({
        shape: 'slab',
        outline: band(x - 0.018, x + 0.018, 0.15),
        bottom: 0.1,
        top: 0.2,
        bevel: 0.008,
        material: 'trim',
      })),
      // capacitor cells on the flanks
      {
        shape: 'drum',
        sides: 6,
        axis: 'x',
        size: [0.24, 0.065, 0.065],
        at: [-0.42, 0.03, 0.29],
        mirror: true,
        material: 'steel',
      },
      { shape: 'nozzle', at: [-0.97, -0.02, 0], size: 0.08 },
      // the barrel shroud, the twin rail and the dark spine under it
      {
        shape: 'slab',
        outline: sym([
          [0.9, 0.07],
          [0.86, 0.11],
          [0.44, 0.15],
        ]),
        bottom: -0.07,
        top: 0.1,
        bevel: 0.025,
      },
      {
        shape: 'slab',
        outline: [
          [1.62, 0.04],
          [1.58, 0.085],
          [0.4, 0.085],
          [0.4, 0.04],
        ],
        bottom: -0.01,
        top: 0.075,
        bevel: 0.012,
        mirror: true,
        material: 'steel',
      },
      {
        shape: 'slab',
        outline: band(0.4, 1.48, 0.03),
        bottom: -0.06,
        top: 0.02,
        bevel: 0.01,
        material: 'soot',
      },
      // a clamp across the rail and the muzzle block
      {
        shape: 'slab',
        outline: band(1.08, 1.16, 0.11),
        bottom: -0.07,
        top: 0.1,
        bevel: 0.02,
        material: 'trim',
      },
      {
        shape: 'slab',
        outline: band(1.44, 1.54, 0.12),
        bottom: -0.06,
        top: 0.11,
        bevel: 0.025,
      },
      // the scope on two mounts along the spine, its lens in a bezel at
      // the front
      ...[-0.22, 0.08].map((x) => ({
        shape: 'slab',
        outline: band(x - 0.03, x + 0.03, 0.045),
        bottom: 0.12,
        top: 0.22,
        bevel: 0.01,
        material: 'trim',
      })),
      {
        shape: 'turned',
        profile: [
          [0.04, -0.42],
          [0.065, -0.38],
          [0.065, 0.06],
          [0.1, 0.13],
          [0.11, 0.24],
          [0.11, 0.27],
          [0.08, 0.28],
        ],
        axis: 'x',
        sides: 12,
        at: [0.05, 0.25, 0],
        material: 'trim',
      },
    ],
    lights: [
      {
        at: [0.33, 0.25, 0],
        size: 0.1,
        pulse: 'telegraphRatio',
        housing: false,
      },
    ],
  },
  codex: {
    lore: 'A long-range keeper. Its lens lights the moment it has you.',
    hint: 'The lens glows before each shot. Break line of sight.',
    glyph:
      '<polygon points="15,0 0,-7 -13,0 0,7"/><circle class="eye" cx="8" r="2.2"/>',
  },
};
