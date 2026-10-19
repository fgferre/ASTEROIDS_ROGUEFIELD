// src/data/enemies/husk.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Husk: slow heavy drifter that splits into Motes on death.
// Numbers: proposta 17/10 — the owner's play decides.
export const HUSK_SPEED = 70; // proposta 17/10
export const HUSK_HEALTH = 90; // proposta 17/10
export const HUSK_RADIUS = 20; // proposta 17/10
export const HUSK_CONTACT_DAMAGE = 15; // proposta 17/10
export const HUSK_SPLIT_COUNT = 3; // proposta 17/10: Motes released on death
export const HUSK_SPLIT_SPEED = 120; // proposta 17/10: outward px/s of each Mote

export const HUSK_CONFIG = deepFreeze({
  key: 'husk',
  displayName: 'Husk',
  radius: HUSK_RADIUS,
  health: HUSK_HEALTH,
  contactDamage: HUSK_CONTACT_DAMAGE,
});

export const HUSK_COMPONENTS = deepFreeze({
  movement: {
    strategy: 'tracking',
    acceleration: 60,
    maxSpeed: HUSK_SPEED,
    targetingRange: 2000,
  },
  collision: {
    shape: 'circle',
    radius: HUSK_RADIUS,
    response: 'damage',
    contactDamage: HUSK_CONTACT_DAMAGE,
  },
  health: { base: HUSK_HEALTH, armor: 0, scaling: 1.0 },
});

export const HUSK_REWARDS = deepFreeze({
  baseOrbs: 3, // proposta 17/10
  totalXP: 45, // proposta 17/10
  healthHeartChance: 0.02, // proposta 17/10
});
