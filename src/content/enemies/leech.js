// src/content/enemies/leech.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Leech: a scavenger. Hunts loose XP orbs and pickups, eats them and grows;
// once full it flees the ship and slowly digests what it holds. Killing it
// gives everything back, with a bonus.
// Numbers: proposta 18/10 — the owner's play decides.
const SPEED = 60; // proposta 18/10: hunting, px/s
const HEALTH = 70; // proposta 18/10
const RADIUS = 16; // proposta 18/10
const CONTACT_DAMAGE = 10; // proposta 18/10

export default {
  id: 'leech',
  order: 10,
  config: deepFreeze({
    key: 'leech',
    displayName: 'Leech',
    radius: RADIUS,
    health: HEALTH,
    contactDamage: CONTACT_DAMAGE,
  }),
  components: deepFreeze({
    // forage steers it; 'linear' only integrates vx/vy.
    movement: { strategy: 'linear', maxSpeed: SPEED },
    collision: {
      shape: 'circle',
      radius: RADIUS,
      response: 'damage',
      contactDamage: CONTACT_DAMAGE,
    },
    health: { base: HEALTH, armor: 0, scaling: 1.0 },
  }),
  rewards: deepFreeze({
    baseOrbs: 3, // proposta 18/10
    totalXP: 45, // proposta 18/10: Weaver tier; the hoard comes on top
    healthHeartChance: 0.02, // proposta 18/10
  }),
  pool: { initial: 2, max: 8 },
  tags: ['enemy', 'hostile', 'scavenger'],
  affixes: ['shielded', 'swift'],
  seeded: false,
  behaviors: deepFreeze({
    forage: {
      sense: 420, // proposta 18/10: px it sees food from
      bite: 6, // proposta 18/10: px past its radius
      hunt: SPEED,
      drift: 35, // proposta 18/10: nothing to eat, toward the ship
      flee: 90, // proposta 18/10: full, away from the ship
      growth: 0.6, // proposta 18/10: px of radius per orb
      maxGrowth: 10, // proposta 18/10: px of radius
      healthPerOrb: 4, // proposta 18/10
      maxHealthGain: 60, // proposta 18/10
      pickupOrbs: 3, // proposta 18/10: a pickup counts as this many orbs
      fullXP: 60, // proposta 18/10: eaten XP that makes it full
      digest: 6, // proposta 18/10: s per orb lost while full
      bonus: 0.25, // proposta 18/10: × eaten XP, back on death
      margin: 30, // proposta 18/10: never flees off-field
      ateEvent: 'leech-ate',
      burstEvent: 'leech-burst',
    },
  }),
};
