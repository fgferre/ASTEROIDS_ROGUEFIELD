// src/content/enemies/shade.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Shade: phase flanker. Solid for a moment beside the ship (one fan of shots),
// then it fades out of the Field, slides to the ship's flank and fades back.
// Numbers: proposta 18/10 — the owner's play decides.
export const SHADE_SPEED = 150; // proposta 18/10: while solid
export const SHADE_PHASE_SPEED = 420; // proposta 18/10: top speed while phased
export const SHADE_HEALTH = 40; // proposta 18/10
export const SHADE_RADIUS = 13; // proposta 18/10
export const SHADE_CONTACT_DAMAGE = 10; // proposta 18/10
export const SHADE_VISIBLE_SECONDS = 1.6; // proposta 18/10
export const SHADE_FADE_SECONDS = 0.35; // proposta 18/10: out, and back in
export const SHADE_PHASED_SECONDS = 1.4; // proposta 18/10: intangible
export const SHADE_FLANK_DISTANCE = 180; // proposta 18/10: beside the ship
export const SHADE_FLANK_MIN_DISTANCE = 120; // proposta 18/10: a wall's clamp never brings it closer
export const SHADE_FIRE_DELAY = 0.3; // proposta 18/10: after it is solid
export const SHADE_SHOTS = 3; // proposta 18/10
export const SHADE_FAN_ARC = (24 * Math.PI) / 180; // proposta 18/10: outer to outer
export const SHADE_SHOT_SPEED = 300; // proposta 18/10
export const SHADE_SHOT_DAMAGE = 10; // proposta 18/10
export const SHADE_SHOT_LIFETIME = 2; // proposta 18/10
export const SHADE_STILL_SPEED = 20; // proposta 18/10: slower ship = no heading
export const SHADE_FIELD_MARGIN = 40; // proposta 18/10: flank point inset

export const SHADE_CONFIG = deepFreeze({
  key: 'shade',
  displayName: 'Shade',
  radius: SHADE_RADIUS,
  health: SHADE_HEALTH,
  contactDamage: SHADE_CONTACT_DAMAGE,
});

export const SHADE_COMPONENTS = deepFreeze({
  // The Shade steers itself (Shade.onUpdate); 'linear' only integrates vx/vy.
  movement: {
    strategy: 'linear',
    maxSpeed: SHADE_SPEED,
    phaseSpeed: SHADE_PHASE_SPEED,
  },
  collision: {
    shape: 'circle',
    radius: SHADE_RADIUS,
    response: 'damage',
    contactDamage: SHADE_CONTACT_DAMAGE,
  },
  health: { base: SHADE_HEALTH, armor: 0, scaling: 1.0 },
});

export const SHADE_REWARDS = deepFreeze({
  baseOrbs: 3, // proposta 18/10
  totalXP: 45, // proposta 18/10
  healthHeartChance: 0.02, // proposta 18/10
});

export default {
  id: 'shade',
  order: 9,
  config: SHADE_CONFIG,
  components: SHADE_COMPONENTS,
  rewards: SHADE_REWARDS,
};
