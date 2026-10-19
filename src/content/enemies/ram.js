// src/content/enemies/ram.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Ram: closes in, stops, winds up (telegraph), charges straight, recovers.
// Numbers: proposta 17/10 — the owner's play decides.
const RAM_APPROACH_SPEED = 110; // proposta 17/10
const RAM_ENGAGE_DISTANCE = 220; // proposta 17/10: stops here to wind up
export const RAM_WINDUP_SECONDS = 0.7; // proposta 17/10
const RAM_CHARGE_SPEED = 520; // proposta 17/10
export const RAM_CHARGE_SECONDS = 0.6; // proposta 17/10
export const RAM_RECOVER_SECONDS = 1.5; // proposta 17/10
const RAM_HEALTH = 60; // proposta 17/10
const RAM_RADIUS = 14; // proposta 17/10
const RAM_CONTACT_DAMAGE = 28; // proposta 17/10

export const RAM_CONFIG = deepFreeze({
  key: 'ram',
  displayName: 'Ram',
  radius: RAM_RADIUS,
  health: RAM_HEALTH,
  contactDamage: RAM_CONTACT_DAMAGE,
});

export const RAM_COMPONENTS = deepFreeze({
  // Its 'charge' behavior steers it; 'linear' only integrates vx/vy.
  movement: {
    strategy: 'linear',
    maxSpeed: RAM_APPROACH_SPEED,
    chargeSpeed: RAM_CHARGE_SPEED,
  },
  collision: {
    shape: 'circle',
    radius: RAM_RADIUS,
    response: 'damage',
    contactDamage: RAM_CONTACT_DAMAGE,
  },
  health: { base: RAM_HEALTH, armor: 0, scaling: 1.0 },
});

const RAM_REWARDS = deepFreeze({
  baseOrbs: 3, // proposta 17/10
  totalXP: 40, // proposta 17/10
  healthHeartChance: 0.02, // proposta 17/10
});

export default {
  id: 'ram',
  order: 5,
  config: RAM_CONFIG,
  components: RAM_COMPONENTS,
  rewards: RAM_REWARDS,
  pool: { initial: 3, max: 12 },
  tags: ['enemy', 'hostile', 'charger'],
  affixes: ['shielded', 'swift', 'volatile', 'splitter', 'warded'],
  seeded: false,
  behaviors: deepFreeze({
    charge: {
      engage: RAM_ENGAGE_DISTANCE,
      windup: RAM_WINDUP_SECONDS,
      charge: RAM_CHARGE_SECONDS,
      recover: RAM_RECOVER_SECONDS,
      drag: 2.5, // speed lost per second while recovering (exponential)
      chargeEvent: 'ram-charged',
    },
  }),
  // It shares the Warden's telegraph event but spins up with its own cue.
  cues: { telegraph: 'playRamSpinUp' },
  codex: {
    lore: 'Built to clear debris from the Ring’s lanes. It still does.',
    hint: 'Stops, winds up, then charges straight. Step aside.',
    glyph:
      '<polygon points="14,0 -9,-11 -4,0 -9,11"/><circle class="eye" cx="7" r="2"/>',
  },
  sighting: 'Lane clearer. Its task: remove debris. It has classified you.',
};
