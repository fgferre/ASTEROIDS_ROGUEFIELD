// src/content/enemies/twain.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Twain: a paired builder, two halves held at a lit seam. Destroyed, it
// splits in two smaller, faster Twains, and those split once more.
// Numbers: proposta 20/10 — the owner's play decides.
const HEALTH = 64; // proposta 20/10: the halves 0.68 ×, then 0.46 ×
const RADIUS = 19; // proposta 20/10
const CONTACT_DAMAGE = 14; // proposta 20/10

export default {
  id: 'twain',
  order: 13,
  roles: ['carrier'],
  fromLayer: 11,
  config: deepFreeze({
    key: 'twain',
    displayName: 'Twain',
    radius: RADIUS,
    health: HEALTH,
    contactDamage: CONTACT_DAMAGE,
  }),
  components: deepFreeze({
    movement: {
      strategy: 'tracking',
      acceleration: 90,
      maxSpeed: 80, // proposta 20/10: the halves 1.3 ×, then 1.69 ×
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
    baseOrbs: 1, // proposta 20/10: each of the seven pieces
    totalXP: 18, // proposta 20/10: each of the seven pieces
    healthHeartChance: 0.01, // proposta 20/10
  }),
  pool: { initial: 7, max: 28 },
  tags: ['enemy', 'hostile', 'splitter'],
  affixes: ['swift', 'warded'],
  seeded: true,
  behaviors: deepFreeze({
    split: {
      count: 2, // proposta 20/10
      generations: 2, // proposta 20/10: one Twain, two halves, four quarters
      scale: 0.68, // proposta 20/10: radius and health per split
      haste: 1.3, // proposta 20/10: speed per split
      speed: 140, // proposta 20/10: px/s apart
    },
  }),
  effects: { death: 'debris' },
  explosion: 'small',
  // Two half-hulls side by side, held by two dark clamps across a red seam
  // that throbs as it is damaged; an eye and a nozzle on each half, a fin
  // on each flank.
  visual: {
    scale: 1,
    parts: [
      {
        shape: 'body',
        stations: [
          [-0.84, 0.16, 0.12, 0.08],
          [-0.45, 0.32, 0.24, 0.14],
          [0.05, 0.38, 0.28, 0.16],
          [0.5, 0.3, 0.22, 0.13],
          [0.9, 0.08, 0.08, 0.05],
        ],
        round: 2.6,
        ridge: 0.18,
        sides: 14,
        rings: 12,
        at: [0, 0, 0.4],
        mirror: true,
      },
      {
        shape: 'body',
        stations: [
          [-0.7, 0.1, 0.05, 0.1],
          [0, 0.16, 0.08, 0.16],
          [0.7, 0.08, 0.05, 0.08],
        ],
        sides: 10,
        rings: 8,
        at: [0, -0.02, 0],
        material: 'trim',
      },
      {
        shape: 'tube',
        points: [
          [-0.66, 0.16, 0],
          [0, 0.24, 0],
          [0.7, 0.14, 0],
        ],
        radius: 0.035,
        sides: 6,
        material: 'glow',
      },
      ...[0.3, -0.36].map((x) => ({
        shape: 'tube',
        points: [
          [x, 0.16, -0.66],
          [x, 0.36, 0],
          [x, 0.16, 0.66],
        ],
        radius: 0.05,
        sides: 6,
        rings: 7,
        material: 'trim',
      })),
      {
        shape: 'wing',
        root: 0.42,
        tip: 0.14,
        span: 0.24,
        sweep: 0.26,
        thick: 0.06,
        dihedral: -0.2,
        sides: 6,
        at: [-0.25, 0, 0.74],
        mirror: true,
        material: 'trim',
      },
      {
        shape: 'nozzle',
        at: [-0.84, 0.03, 0.4],
        size: 0.1,
        sides: 10,
        mirror: true,
      },
    ],
    lights: [0.4, -0.4].map((z) => ({
      at: [0.74, 0.13, z],
      dir: [1, 0.5, 0],
      size: 0.08,
    })),
    animate: { pulse: 'damageRatio' },
  },
  codex: {
    lore: 'Ring builders worked in pairs, joined at the seam. Break one and you have two.',
    hint: 'Splits in two when destroyed, and the halves split again, faster each time. Leave room.',
    glyph:
      '<ellipse cx="0" cy="-5" rx="12" ry="5"/><ellipse cx="0" cy="5" rx="12" ry="5"/><circle class="eye" cx="9" cy="-5" r="1.6"/><circle class="eye" cx="9" cy="5" r="1.6"/>',
  },
  sighting: 'Paired builder. Breaking it is how it multiplies.',
};
