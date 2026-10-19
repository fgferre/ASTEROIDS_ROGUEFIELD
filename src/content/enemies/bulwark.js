// src/content/enemies/bulwark.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Bulwark: slow, with a frontal shield plate that breaks for good.
// Numbers: proposta 17/10 — the owner's play decides.
const HEALTH = 120; // proposta 17/10
const RADIUS = 22; // proposta 17/10
const CONTACT_DAMAGE = 18; // proposta 17/10
// The plate's reach; the 3D view and the Shielded affix use it too.
export const BULWARK_SHIELD_HALF_ARC = Math.PI / 3; // proposta 17/10: ±60°

export default {
  id: 'bulwark',
  order: 7,
  roles: ['tank'],
  config: deepFreeze({
    key: 'bulwark',
    displayName: 'Bulwark',
    radius: RADIUS,
    health: HEALTH,
    contactDamage: CONTACT_DAMAGE,
  }),
  components: deepFreeze({
    movement: {
      strategy: 'tracking',
      acceleration: 50,
      maxSpeed: 60, // proposta 17/10
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
    baseOrbs: 4, // proposta 17/10
    totalXP: 60, // proposta 17/10
    healthHeartChance: 0.04, // proposta 17/10
  }),
  pool: { initial: 2, max: 8 },
  tags: ['enemy', 'hostile', 'armored'],
  affixes: ['swift', 'volatile', 'splitter', 'warded'],
  seeded: true,
  behaviors: deepFreeze({
    'frontal-shield': {
      health: 80, // proposta 17/10
      halfArc: BULWARK_SHIELD_HALF_ARC,
    },
  }),
  explosion: 'large',
  codex: {
    lore: 'A wall that walks. The Ring made it to hold the line.',
    hint: 'Its front plate blocks shots. Flank it, or break the plate.',
    glyph:
      '<path d="M5 -13 A13 13 0 0 1 5 13 L1 9 A9 9 0 0 0 1 -9 Z"/><circle cx="-5" r="7"/><circle class="eye" cx="-5" r="2"/>',
  },
  sighting: 'Line keeper. Its face is a wall. Its back is not.',
};
