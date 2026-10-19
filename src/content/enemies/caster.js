// src/content/enemies/caster.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Caster: artillery. Holds its range, marks where the ship is going, then lobs
// a shell there that lands on a shrinking ring.
// Numbers: proposta 18/10 — the owner's play decides.
export const CASTER_HOLD_MIN = 300; // proposta 18/10: backs off inside this
export const CASTER_HOLD_MAX = 360; // proposta 18/10: closes in beyond this
export const CASTER_SPEED = 95; // proposta 18/10
export const CASTER_HEALTH = 55; // proposta 18/10
export const CASTER_RADIUS = 15; // proposta 18/10
export const CASTER_CONTACT_DAMAGE = 12; // proposta 18/10
export const CASTER_FIRE_INTERVAL = 3.2; // proposta 18/10: seconds per shell
export const CASTER_TELEGRAPH_SECONDS = 0.5; // proposta 18/10: lens + ring
export const CASTER_LEAD_SECONDS = 0.6; // proposta 18/10: aims ahead of the ship
export const CASTER_SHELL_FLIGHT = 1.1; // proposta 18/10: seconds in the air
export const CASTER_SHELL_RADIUS = 110; // proposta 18/10: blast radius, px
export const CASTER_SHELL_DAMAGE = 24; // proposta 18/10
export const CASTER_SHELL_APEX = 90; // proposta 18/10: px of rise mid-flight
export const CASTER_FIELD_MARGIN = 30; // proposta 18/10: never backs off-field

export const CASTER_CONFIG = deepFreeze({
  key: 'caster',
  displayName: 'Caster',
  radius: CASTER_RADIUS,
  health: CASTER_HEALTH,
  contactDamage: CASTER_CONTACT_DAMAGE,
});

export const CASTER_COMPONENTS = deepFreeze({
  // The Caster steers itself (Caster.onUpdate); 'linear' only integrates vx/vy.
  movement: { strategy: 'linear', maxSpeed: CASTER_SPEED },
  collision: {
    shape: 'circle',
    radius: CASTER_RADIUS,
    response: 'damage',
    contactDamage: CASTER_CONTACT_DAMAGE,
  },
  health: { base: CASTER_HEALTH, armor: 0, scaling: 1.0 },
});

export const CASTER_REWARDS = deepFreeze({
  baseOrbs: 3, // proposta 18/10
  totalXP: 45, // proposta 18/10
  healthHeartChance: 0.02, // proposta 18/10
});

export default {
  id: 'caster',
  order: 8,
  config: CASTER_CONFIG,
  components: CASTER_COMPONENTS,
  rewards: CASTER_REWARDS,
  pool: { initial: 2, max: 8 },
  tags: ['enemy', 'hostile', 'ranged', 'artillery'],
  affixes: ['shielded', 'swift', 'warded'],
};
