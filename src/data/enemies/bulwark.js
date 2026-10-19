// src/data/enemies/bulwark.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Bulwark: slow, with a frontal shield plate that breaks for good.
// Numbers: proposta 17/10 — the owner's play decides.
export const BULWARK_SPEED = 60; // proposta 17/10
export const BULWARK_HEALTH = 120; // proposta 17/10
export const BULWARK_RADIUS = 22; // proposta 17/10
export const BULWARK_CONTACT_DAMAGE = 18; // proposta 17/10
export const BULWARK_SHIELD_HEALTH = 80; // proposta 17/10
export const BULWARK_SHIELD_HALF_ARC = Math.PI / 3; // proposta 17/10: ±60°

export const BULWARK_CONFIG = deepFreeze({
  key: 'bulwark',
  displayName: 'Bulwark',
  radius: BULWARK_RADIUS,
  health: BULWARK_HEALTH,
  contactDamage: BULWARK_CONTACT_DAMAGE,
  shieldHealth: BULWARK_SHIELD_HEALTH,
});

export const BULWARK_COMPONENTS = deepFreeze({
  movement: {
    strategy: 'tracking',
    acceleration: 50,
    maxSpeed: BULWARK_SPEED,
    targetingRange: 2000,
  },
  collision: {
    shape: 'circle',
    radius: BULWARK_RADIUS,
    response: 'damage',
    contactDamage: BULWARK_CONTACT_DAMAGE,
  },
  health: { base: BULWARK_HEALTH, armor: 0, scaling: 1.0 },
});

export const BULWARK_REWARDS = deepFreeze({
  baseOrbs: 4, // proposta 17/10
  totalXP: 60, // proposta 17/10
  healthHeartChance: 0.04, // proposta 17/10
});
