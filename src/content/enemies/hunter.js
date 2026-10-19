// src/content/enemies/hunter.js

import { deepFreeze } from '../../utils/deepFreeze.js';

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
  codex: {
    lore: 'A long-range keeper. Its lens lights the moment it has you.',
    hint: 'The lens glows before each shot. Break line of sight.',
    glyph:
      '<polygon points="15,0 0,-7 -13,0 0,7"/><circle class="eye" cx="8" r="2.2"/>',
  },
};
