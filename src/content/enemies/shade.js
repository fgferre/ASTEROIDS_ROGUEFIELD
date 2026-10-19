// src/content/enemies/shade.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Shade: phase flanker. Solid for a moment beside the ship (one fan of shots),
// then it fades out of the Field, slides to the ship's flank and fades back.
// Numbers: proposta 18/10 — the owner's play decides.
const HEALTH = 40; // proposta 18/10
const RADIUS = 13; // proposta 18/10
const CONTACT_DAMAGE = 10; // proposta 18/10

export default {
  id: 'shade',
  order: 9,
  config: deepFreeze({
    key: 'shade',
    displayName: 'Shade',
    radius: RADIUS,
    health: HEALTH,
    contactDamage: CONTACT_DAMAGE,
  }),
  components: deepFreeze({
    // phase steers it; 'linear' only integrates vx/vy.
    movement: {
      strategy: 'linear',
      maxSpeed: 150, // proposta 18/10: while solid
      phaseSpeed: 420, // proposta 18/10: top speed while phased
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
    baseOrbs: 3, // proposta 18/10
    totalXP: 45, // proposta 18/10
    healthHeartChance: 0.02, // proposta 18/10
  }),
  pool: { initial: 2, max: 8 },
  tags: ['enemy', 'hostile', 'phasing'],
  affixes: ['swift', 'volatile'],
  seeded: true,
  behaviors: deepFreeze({
    phase: {
      fade: 0.35, // proposta 18/10: out, and back in
      visible: 1.6, // proposta 18/10
      phased: 1.4, // proposta 18/10: intangible
      flank: 180, // proposta 18/10: beside the ship
      flankMin: 120, // proposta 18/10: a wall's clamp never brings it closer
      still: 20, // proposta 18/10: slower ship = no heading
      margin: 40, // proposta 18/10: flank point inset
      outEvent: 'shade-phased-out',
      inEvent: 'shade-phased-in',
    },
    'fan-shot': {
      delay: 0.3, // proposta 18/10: after it is solid
      shots: 3, // proposta 18/10
      arc: (24 * Math.PI) / 180, // proposta 18/10: outer to outer
      speed: 300, // proposta 18/10
      damage: 10, // proposta 18/10
      lifetime: 2, // proposta 18/10
      pattern: 'shade-fan',
    },
  }),
};
