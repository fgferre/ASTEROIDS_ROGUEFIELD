// src/data/enemies/leech.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Leech: a scavenger. Hunts loose XP orbs and pickups, eats them and grows;
// once full it flees the ship and slowly digests what it holds. Killing it
// gives everything back, with a bonus.
// Numbers: proposta 18/10 — the owner's play decides.
export const LEECH_SPEED = 60; // proposta 18/10: hunting, px/s
export const LEECH_DRIFT_SPEED = 35; // proposta 18/10: nothing to eat, toward the ship
export const LEECH_FLEE_SPEED = 90; // proposta 18/10: full, away from the ship
export const LEECH_HEALTH = 70; // proposta 18/10
export const LEECH_RADIUS = 16; // proposta 18/10
export const LEECH_CONTACT_DAMAGE = 10; // proposta 18/10
export const LEECH_SENSE_RADIUS = 420; // proposta 18/10: px it sees food from
export const LEECH_BITE_REACH = 6; // proposta 18/10: px past its radius
export const LEECH_GROWTH_PER_ORB = 0.6; // proposta 18/10: px of radius
export const LEECH_MAX_GROWTH = 10; // proposta 18/10: px of radius
export const LEECH_HEALTH_PER_ORB = 4; // proposta 18/10
export const LEECH_MAX_HEALTH_GAIN = 60; // proposta 18/10
export const LEECH_PICKUP_ORBS = 3; // proposta 18/10: a pickup counts as this many orbs
export const LEECH_FULL_XP = 60; // proposta 18/10: eaten XP that makes it full
export const LEECH_DIGEST_INTERVAL = 6; // proposta 18/10: s per orb lost while full
export const LEECH_BURST_BONUS = 0.25; // proposta 18/10: × eaten XP, back on death
export const LEECH_FIELD_MARGIN = 30; // proposta 18/10: never flees off-field

export const LEECH_CONFIG = deepFreeze({
  key: 'leech',
  displayName: 'Leech',
  radius: LEECH_RADIUS,
  health: LEECH_HEALTH,
  contactDamage: LEECH_CONTACT_DAMAGE,
});

export const LEECH_COMPONENTS = deepFreeze({
  // The Leech steers itself (Leech.onUpdate); 'linear' only integrates vx/vy.
  movement: { strategy: 'linear', maxSpeed: LEECH_SPEED },
  collision: {
    shape: 'circle',
    radius: LEECH_RADIUS,
    response: 'damage',
    contactDamage: LEECH_CONTACT_DAMAGE,
  },
  health: { base: LEECH_HEALTH, armor: 0, scaling: 1.0 },
});

export const LEECH_REWARDS = deepFreeze({
  baseOrbs: 3, // proposta 18/10
  totalXP: 45, // proposta 18/10: Weaver tier; the hoard comes on top
  healthHeartChance: 0.02, // proposta 18/10
});
