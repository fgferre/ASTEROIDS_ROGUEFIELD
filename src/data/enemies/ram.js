// src/data/enemies/ram.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Ram: closes in, stops, winds up (telegraph), charges straight, recovers.
// Numbers: proposta 17/10 — the owner's play decides.
export const RAM_APPROACH_SPEED = 110; // proposta 17/10
export const RAM_ENGAGE_DISTANCE = 220; // proposta 17/10: stops here to wind up
export const RAM_WINDUP_SECONDS = 0.7; // proposta 17/10
export const RAM_CHARGE_SPEED = 520; // proposta 17/10
export const RAM_CHARGE_SECONDS = 0.6; // proposta 17/10
export const RAM_RECOVER_SECONDS = 1.5; // proposta 17/10
export const RAM_HEALTH = 60; // proposta 17/10
export const RAM_RADIUS = 14; // proposta 17/10
export const RAM_CONTACT_DAMAGE = 28; // proposta 17/10

export const RAM_CONFIG = deepFreeze({
  key: 'ram',
  displayName: 'Ram',
  radius: RAM_RADIUS,
  health: RAM_HEALTH,
  contactDamage: RAM_CONTACT_DAMAGE,
});

export const RAM_COMPONENTS = deepFreeze({
  // The Ram steers itself (Ram.onUpdate); 'linear' only integrates vx/vy.
  movement: {
    strategy: 'linear',
    maxSpeed: RAM_APPROACH_SPEED,
    chargeSpeed: RAM_CHARGE_SPEED,
  },
  render: { strategy: 'procedural', shape: 'ram' },
  collision: {
    shape: 'circle',
    radius: RAM_RADIUS,
    response: 'damage',
    contactDamage: RAM_CONTACT_DAMAGE,
  },
  health: { base: RAM_HEALTH, armor: 0, scaling: 1.0 },
});

export const RAM_REWARDS = deepFreeze({
  baseOrbs: 3, // proposta 17/10
  totalXP: 40, // proposta 17/10
  healthHeartChance: 0.02, // proposta 17/10
});
