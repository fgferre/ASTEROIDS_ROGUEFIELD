// src/content/enemies/anvil.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Anvil: an armoured hauler. Slow, it comes about toward the ship at a
// crawl; shots off its prow and flanks barely scratch it, and its glowing
// core at the back takes them in full. Get behind it.
// Numbers: proposta 20/10 — the owner's play decides.
const HEALTH = 220; // proposta 20/10
const RADIUS = 26; // proposta 20/10
const CONTACT_DAMAGE = 26; // proposta 20/10

export default {
  id: 'anvil',
  order: 16,
  roles: ['tank'],
  fromLayer: 12,
  config: deepFreeze({
    key: 'anvil',
    displayName: 'Anvil',
    radius: RADIUS,
    health: HEALTH,
    contactDamage: CONTACT_DAMAGE,
  }),
  components: deepFreeze({
    // turn-toward steers it; 'linear' only integrates vx/vy.
    movement: { strategy: 'linear', maxSpeed: 42 }, // proposta 20/10
    collision: {
      shape: 'circle',
      radius: RADIUS,
      response: 'damage',
      contactDamage: CONTACT_DAMAGE,
    },
    health: { base: HEALTH, armor: 0, scaling: 1.0 },
  }),
  rewards: deepFreeze({
    baseOrbs: 6, // proposta 20/10
    totalXP: 90, // proposta 20/10
    healthHeartChance: 0.06, // proposta 20/10
  }),
  pool: { initial: 1, max: 6 },
  tags: ['enemy', 'hostile', 'armored'],
  // Never Volatile: its armour would cut the fuse's own lethal blow.
  affixes: ['swift', 'warded'],
  seeded: false,
  behaviors: deepFreeze({
    'turn-toward': { turn: 0.55 }, // proposta 20/10: rad/s, ~5.7 s to come about
    'rear-weak-point': {
      front: 0.15, // proposta 20/10: × damage off the prow and flanks
      rear: 1.6, // proposta 20/10: × damage on the core
      rearArc: 0.75, // proposta 20/10: ±43° round its tail
    },
  }),
  effects: { death: 'debris' },
  explosion: 'large',
  // A blunt armoured block: a dark hull on two track skirts, three stepped
  // armour plates rising to a command block, a chevron ram over the prow;
  // red sensor slits behind the ram; at the tail, the bare amber core in a
  // dark bay between two exhausts.
  visual: {
    scale: 1,
    finish: 'panel',
    parts: [
      {
        shape: 'slab',
        outline: [
          [0.74, 0.56],
          [0.56, 0.72],
          [-0.72, 0.72],
          [-0.86, 0.56],
          [-0.86, -0.56],
          [-0.72, -0.72],
          [0.56, -0.72],
          [0.74, -0.56],
        ],
        bottom: -0.22,
        top: -0.02,
        material: 'trim',
      },
      {
        shape: 'slab',
        outline: [
          [0.5, 0.68],
          [0.4, 0.92],
          [-0.76, 0.92],
          [-0.88, 0.7],
        ],
        bottom: -0.26,
        top: 0.02,
        bevel: 0.03,
        mirror: true,
        material: 'trim',
      },
      ...[
        [0.38, 0.02],
        [-0.02, -0.36],
        [-0.4, -0.74],
      ].map(([front, back]) => ({
        shape: 'slab',
        outline: [
          [front, 0.7],
          [front - 0.04, 0.9],
          [back, 0.9],
          [back, 0.7],
        ],
        bottom: 0,
        top: 0.08,
        bevel: 0.02,
        mirror: true,
        material: 'steel',
      })),
      {
        shape: 'slab',
        outline: [
          [0.54, 0.44],
          [0.38, 0.64],
          [-0.6, 0.64],
          [-0.76, 0.46],
          [-0.76, -0.46],
          [-0.6, -0.64],
          [0.38, -0.64],
          [0.54, -0.44],
        ],
        bottom: -0.04,
        top: 0.18,
        bevel: 0.04,
      },
      {
        shape: 'slab',
        outline: [
          [0.36, 0.34],
          [0.22, 0.48],
          [-0.5, 0.48],
          [-0.62, 0.34],
          [-0.62, -0.34],
          [-0.5, -0.48],
          [0.22, -0.48],
          [0.36, -0.34],
        ],
        bottom: 0.14,
        top: 0.29,
        bevel: 0.035,
        material: 'trim',
      },
      ...[0.1, -0.2].map((x) => ({
        shape: 'box',
        size: [0.025, 0.012, 0.44],
        at: [x, 0.295, 0],
        material: 'soot',
      })),
      {
        shape: 'slab',
        outline: [
          [0.02, 0.2],
          [-0.08, 0.28],
          [-0.42, 0.28],
          [-0.5, 0.2],
          [-0.5, -0.2],
          [-0.42, -0.28],
          [-0.08, -0.28],
          [0.02, -0.2],
        ],
        bottom: 0.26,
        top: 0.4,
        bevel: 0.03,
        material: 'steel',
      },
      {
        shape: 'box',
        size: [0.012, 0.025, 0.16],
        at: [0.02, 0.36, 0],
        material: 'soot',
      },
      {
        shape: 'slab',
        outline: [
          [1.12, 0.12],
          [1.12, -0.12],
          [0.56, -0.76],
          [0.42, -0.76],
          [0.42, 0.76],
          [0.56, 0.76],
        ],
        bottom: -0.25,
        top: 0.04,
        bevel: 0.04,
        material: 'steel',
      },
      {
        shape: 'slab',
        outline: [
          [1.06, 0.05],
          [1.06, -0.05],
          [0.62, -0.52],
          [0.5, -0.52],
          [0.58, 0],
          [0.5, 0.52],
          [0.62, 0.52],
        ],
        bottom: 0.02,
        top: 0.11,
        bevel: 0.025,
        material: 'trim',
      },
      {
        shape: 'slab',
        outline: [
          [-0.7, 0.3],
          [-0.94, 0.24],
          [-0.94, -0.24],
          [-0.7, -0.3],
        ],
        bottom: -0.12,
        top: 0.16,
        bevel: 0.02,
        material: 'soot',
      },
      {
        shape: 'sphere',
        size: [0.08, 0.1, 0.2],
        at: [-0.9, 0.03, 0],
        material: 'glow',
        color: 'shot',
      },
      {
        shape: 'drum',
        axis: 'x',
        sides: 8,
        size: [0.1, 0.12, 0.12],
        at: [-0.86, 0.04, 0.5],
        mirror: true,
        material: 'trim',
      },
      {
        shape: 'drum',
        axis: 'x',
        sides: 8,
        size: [0.012, 0.085, 0.085],
        at: [-0.965, 0.04, 0.5],
        mirror: true,
        material: 'soot',
      },
    ],
    lights: [
      ...[0.3, -0.3].map((z) => ({
        at: [0.53, 0.12, z],
        dir: [1, 0.4, 0],
        size: 0.07,
      })),
      {
        at: [-0.95, 0.04, 0],
        dir: [-1, 0.2, 0],
        size: 0.18,
        color: 'shot',
      },
    ],
  },
  codex: {
    lore: 'A Ring hauler, armoured at the prow for the debris lanes. Its core was never shielded from behind: nothing ever got behind it.',
    hint: 'Shots off its front barely scratch it. It turns slowly: get behind it and hit the glowing core.',
    glyph:
      '<polygon points="15,-9 15,9 -11,11 -14,0 -11,-11"/><circle cx="-12" r="3" fill="none"/><circle class="eye" cx="12" cy="-4" r="1.5"/><circle class="eye" cx="12" cy="4" r="1.5"/>',
  },
  sighting: 'Prow-armoured hauler. Slow to turn. Its core faces away from you.',
};
