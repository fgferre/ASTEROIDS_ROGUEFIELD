// src/content/enemies/husk.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Husk: slow heavy drifter that splits into Motes on death.
// Numbers: proposta 17/10 — the owner's play decides.
const HEALTH = 90; // proposta 17/10
const RADIUS = 20; // proposta 17/10
const CONTACT_DAMAGE = 15; // proposta 17/10

export default {
  id: 'husk',
  order: 4,
  config: deepFreeze({
    key: 'husk',
    displayName: 'Husk',
    radius: RADIUS,
    health: HEALTH,
    contactDamage: CONTACT_DAMAGE,
  }),
  components: deepFreeze({
    movement: {
      strategy: 'tracking',
      acceleration: 60,
      maxSpeed: 70, // proposta 17/10
      targetingRange: 2000,
    },
    collision: {
      shape: 'circle',
      radius: RADIUS,
      response: 'damage',
      contactDamage: CONTACT_DAMAGE,
    },
    health: { base: HEALTH, armor: 0, scaling: 1.0 },
  }),
  rewards: deepFreeze({
    baseOrbs: 3, // proposta 17/10
    totalXP: 45, // proposta 17/10
    healthHeartChance: 0.02, // proposta 17/10
  }),
  pool: { initial: 3, max: 12 },
  tags: ['enemy', 'hostile', 'splitter'],
  affixes: ['shielded', 'swift', 'volatile', 'warded'],
  seeded: true,
  behaviors: deepFreeze({
    'spawn-on-death': {
      type: 'drone',
      count: 3, // proposta 17/10: Motes released on death
      speed: 120, // proposta 17/10: outward px/s of each Mote
    },
  }),
};
