// src/content/enemies/twain.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Twain: a paired builder, two hulls held by a lit core between them.
// Destroyed, it splits in two smaller, faster Twains, and those split once
// more.
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
  // Two whole hulls flying side by side with open space between them: each a
  // fat steel-decked wedge on a dark keel, its own prow eye, house and
  // nozzle. All that joins them is in the gap: a red core in a dark collar,
  // gripped by a clamp from each hull, and a thin arc of light fore and aft.
  // The core and arcs throb as it is damaged.
  visual: {
    scale: 1,
    finish: 'panel',
    parts: [
      {
        shape: 'slab',
        outline: [
          [1.04, 0.5],
          [0.7, 0.76],
          [0.2, 0.86],
          [-0.52, 0.82],
          [-0.92, 0.6],
          [-0.92, 0.36],
          [-0.62, 0.22],
          [0.56, 0.22],
          [0.8, 0.24],
        ],
        bottom: -0.22,
        top: 0.02,
        mirror: true,
        material: 'trim',
      },
      {
        shape: 'slab',
        outline: [
          [0.94, 0.5],
          [0.66, 0.7],
          [0.18, 0.79],
          [-0.48, 0.75],
          [-0.82, 0.56],
          [-0.82, 0.4],
          [-0.58, 0.28],
          [0.54, 0.28],
          [0.74, 0.3],
        ],
        bottom: -0.02,
        top: 0.2,
        bevel: 0.05,
        mirror: true,
        material: 'steel',
      },
      {
        shape: 'slab',
        outline: [
          [0.42, 0.42],
          [0.3, 0.62],
          [-0.34, 0.66],
          [-0.6, 0.54],
          [-0.56, 0.38],
          [0.3, 0.36],
        ],
        bottom: 0.18,
        top: 0.36,
        bevel: 0.05,
        mirror: true,
      },
      {
        shape: 'box',
        size: [0.26, 0.012, 0.03],
        at: [-0.1, 0.365, 0.51],
        mirror: true,
        material: 'soot',
      },
      {
        shape: 'slab',
        outline: [
          [0.12, 0.12],
          [0.16, 0.3],
          [-0.16, 0.3],
          [-0.12, 0.12],
        ],
        bottom: -0.06,
        top: 0.24,
        bevel: 0.03,
        mirror: true,
        material: 'trim',
      },
      {
        shape: 'drum',
        sides: 6,
        size: [0.3, 0.07, 0.3],
        at: [0, 0.0, 0],
        material: 'soot',
      },
      {
        shape: 'drum',
        sides: 6,
        size: [0.22, 0.06, 0.22],
        at: [0, 0.1, 0],
        material: 'glow',
      },
      ...[0.58, -0.62].map((x) => ({
        shape: 'box',
        size: [0.025, 0.025, 0.27],
        at: [x, 0.04, 0],
        material: 'glow',
      })),
      {
        shape: 'drum',
        axis: 'x',
        sides: 8,
        size: [0.07, 0.11, 0.11],
        at: [-0.9, 0.02, 0.5],
        mirror: true,
        material: 'trim',
      },
      {
        shape: 'drum',
        axis: 'x',
        sides: 8,
        size: [0.012, 0.08, 0.08],
        at: [-0.975, 0.02, 0.5],
        mirror: true,
        material: 'soot',
      },
    ],
    lights: [0.5, -0.5].map((z) => ({
      at: [0.82, 0.17, z],
      dir: [1, 0.8, 0],
      size: 0.1,
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
