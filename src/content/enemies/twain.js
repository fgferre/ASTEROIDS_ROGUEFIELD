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
  // Two mirrored half-hulls locked side by side: each a faceted wedge, its
  // own prow, eye and nozzle, notched apart at the nose and tail; between
  // them a red seam that throbs as it is damaged, held by two dark clamps
  // bolted across it.
  visual: {
    scale: 1,
    finish: 'panel',
    parts: [
      {
        shape: 'slab',
        outline: [
          [1.0, 0.32],
          [0.74, 0.6],
          [-0.3, 0.68],
          [-0.82, 0.52],
          [-0.96, 0.3],
          [-0.66, 0.12],
          [0.46, 0.12],
        ],
        bottom: -0.18,
        top: 0.02,
        mirror: true,
        material: 'trim',
      },
      {
        shape: 'slab',
        outline: [
          [0.88, 0.33],
          [0.68, 0.55],
          [-0.28, 0.62],
          [-0.74, 0.48],
          [-0.84, 0.31],
          [-0.6, 0.16],
          [0.46, 0.16],
        ],
        bottom: -0.02,
        top: 0.17,
        bevel: 0.04,
        mirror: true,
        material: 'steel',
      },
      {
        shape: 'slab',
        outline: [
          [0.62, 0.36],
          [0.42, 0.48],
          [-0.36, 0.5],
          [-0.54, 0.4],
          [-0.42, 0.26],
          [0.4, 0.26],
        ],
        bottom: 0.14,
        top: 0.3,
        bevel: 0.035,
        mirror: true,
      },
      {
        shape: 'box',
        size: [0.3, 0.012, 0.015],
        at: [-0.02, 0.305, 0.38],
        mirror: true,
        material: 'soot',
      },
      {
        shape: 'box',
        size: [0.6, 0.1, 0.07],
        at: [-0.08, 0.04, 0],
        material: 'glow',
      },
      ...[0.28, -0.34].flatMap((x) => [
        {
          shape: 'slab',
          outline: [
            [x + 0.08, 0.36],
            [x + 0.11, 0.24],
            [x + 0.11, -0.24],
            [x + 0.08, -0.36],
            [x - 0.08, -0.36],
            [x - 0.11, -0.24],
            [x - 0.11, 0.24],
            [x - 0.08, 0.36],
          ],
          bottom: 0.16,
          top: 0.32,
          bevel: 0.025,
          material: 'trim',
        },
        {
          shape: 'drum',
          sides: 6,
          size: [0.045, 0.03, 0.045],
          at: [x, 0.33, 0.26],
          mirror: true,
          material: 'steel',
        },
      ]),
      {
        shape: 'drum',
        axis: 'x',
        sides: 8,
        size: [0.06, 0.08, 0.08],
        at: [-0.84, 0.03, 0.44],
        mirror: true,
        material: 'trim',
      },
      {
        shape: 'drum',
        axis: 'x',
        sides: 8,
        size: [0.012, 0.055, 0.055],
        at: [-0.905, 0.03, 0.44],
        mirror: true,
        material: 'soot',
      },
    ],
    lights: [0.36, -0.36].map((z) => ({
      at: [0.8, 0.14, z],
      dir: [1, 0.6, 0],
      size: 0.07,
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
