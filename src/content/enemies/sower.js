// src/content/enemies/sower.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Sower: a lane seeder. It runs straight lanes that pass close beside where
// the ship is, one side then the other, dropping a Tether every so often, so
// each lane is a line of mines that closes the space round you. It never
// fires.
// Numbers: proposta 20/10 — the owner's play decides.
const HEALTH = 50; // proposta 20/10
const RADIUS = 15; // proposta 20/10
const CONTACT_DAMAGE = 10; // proposta 20/10
// One of the Tethers racked on its deck, seen from above: a small octagon.
const TETHER_SEED = Array.from({ length: 8 }, (_, i) => {
  const a = ((i + 0.5) * Math.PI) / 4;
  return [Math.cos(a) * 0.15, Math.sin(a) * 0.15];
});

export default {
  id: 'sower',
  order: 15,
  roles: ['minelayer'],
  fromLayer: 4,
  config: deepFreeze({
    key: 'sower',
    displayName: 'Sower',
    radius: RADIUS,
    health: HEALTH,
    contactDamage: CONTACT_DAMAGE,
  }),
  components: deepFreeze({
    // run-lanes steers it; 'linear' only integrates vx/vy.
    movement: { strategy: 'linear', maxSpeed: 105 }, // proposta 20/10
    collision: {
      shape: 'circle',
      radius: RADIUS,
      response: 'damage',
      contactDamage: CONTACT_DAMAGE,
    },
    health: { base: HEALTH, armor: 0, scaling: 1.0 },
  }),
  rewards: deepFreeze({
    baseOrbs: 3, // proposta 20/10
    totalXP: 40, // proposta 20/10
    healthHeartChance: 0.02, // proposta 20/10
  }),
  pool: { initial: 2, max: 8 },
  tags: ['enemy', 'hostile', 'layer'],
  affixes: ['shielded', 'swift', 'warded'],
  seeded: true,
  behaviors: deepFreeze({
    'run-lanes': {
      margin: 50, // proposta 20/10: px from the edge
      offset: 120, // proposta 20/10: px beside the ship, past a Tether's reach
    },
    'lay-mines': {
      type: 'mine',
      interval: 0.9, // proposta 20/10: s between Tethers, ~95 px apart
      max: 7, // proposta 20/10: live Tethers per Sower
      glow: 0.3, // s its chute stays lit after dropping one
      event: 'weaver-tether-laid',
    },
  }),
  // A flat barge: a dark hull under a deck, a bridge block forward with its
  // eye; astern a rack of four Tethers ready to drop, the chute between them
  // that lights as one falls, and across the stern the spreader boom whose
  // tips light with it.
  visual: {
    scale: 1,
    finish: 'panel',
    parts: [
      {
        shape: 'slab',
        outline: [
          [0.9, 0.22],
          [0.64, 0.52],
          [-0.62, 0.52],
          [-0.74, 0.4],
          [-0.74, -0.4],
          [-0.62, -0.52],
          [0.64, -0.52],
          [0.9, -0.22],
        ],
        bottom: -0.14,
        top: 0,
        material: 'trim',
      },
      {
        shape: 'slab',
        outline: [
          [0.8, 0.2],
          [0.58, 0.46],
          [0.1, 0.46],
          [0.1, -0.46],
          [0.58, -0.46],
          [0.8, -0.2],
        ],
        bottom: -0.02,
        top: 0.08,
        bevel: 0.025,
      },
      {
        shape: 'slab',
        outline: [
          [0.7, 0.1],
          [0.6, 0.22],
          [0.28, 0.22],
          [0.22, 0.14],
          [0.22, -0.14],
          [0.28, -0.22],
          [0.6, -0.22],
          [0.7, -0.1],
        ],
        bottom: 0.06,
        top: 0.19,
        bevel: 0.03,
        material: 'steel',
      },
      {
        shape: 'slab',
        outline: [
          [0.06, 0.5],
          [-0.68, 0.5],
          [-0.68, 0.06],
          [0.06, 0.06],
        ],
        bottom: -0.02,
        top: 0.04,
        bevel: 0.015,
        mirror: true,
        material: 'soot',
      },
      ...[-0.11, -0.47].flatMap((x) => [
        {
          shape: 'slab',
          outline: TETHER_SEED.map(([u, v]) => [x + u, 0.28 + v]),
          bottom: 0.02,
          top: 0.12,
          bevel: 0.02,
          mirror: true,
        },
        {
          shape: 'drum',
          sides: 8,
          size: [0.075, 0.03, 0.075],
          at: [x, 0.14, 0.28],
          mirror: true,
          material: 'steel',
        },
        ...[0, 1, 2, 3].map((k) => ({
          shape: 'drum',
          axis: 'x',
          sides: 4,
          taper: 0.15,
          size: [0.06, 0.04, 0.04],
          at: [
            x + Math.cos((k * Math.PI) / 2 + Math.PI / 4) * 0.2,
            0.07,
            0.28 + Math.sin((k * Math.PI) / 2 + Math.PI / 4) * 0.2,
          ],
          rotate: [0, -(k * Math.PI) / 2 - Math.PI / 4, 0],
          mirror: true,
          material: 'steel',
        })),
      ]),
      {
        shape: 'slab',
        outline: [
          [0.0, 0.06],
          [-0.7, 0.08],
          [-0.82, 0.05],
          [-0.82, -0.05],
          [-0.7, -0.08],
          [0.0, -0.06],
        ],
        bottom: -0.04,
        top: 0.1,
        bevel: 0.02,
        material: 'trim',
      },
      {
        shape: 'drum',
        axis: 'z',
        sides: 6,
        size: [0.06, 0.06, 0.8],
        at: [-0.8, 0.06, 0],
        material: 'steel',
      },
      {
        shape: 'slab',
        outline: [
          [-0.72, 0.78],
          [-0.72, 0.62],
          [-0.88, 0.62],
          [-0.88, 0.78],
        ],
        bottom: 0.0,
        top: 0.1,
        bevel: 0.02,
        mirror: true,
        material: 'trim',
      },
    ],
    lights: [
      {
        at: [-0.84, 0.04, 0],
        dir: [-1, 0.4, 0],
        size: 0.1,
        pulse: 'layGlow',
      },
      ...[0.82, -0.82].map((z) => ({
        at: [-0.8, 0.1, z],
        dir: [0, 1, 0],
        size: 0.06,
        pulse: 'layGlow',
      })),
      { at: [0.7, 0.14, 0], dir: [1, 0.6, 0], size: 0.08 },
    ],
  },
  codex: {
    lore: 'Sowers seeded the Ring’s lanes with buoys. This one still seeds them, with Tethers, along the line you were flying.',
    hint: 'It cuts straight lanes close beside you, dropping Tethers as it goes. Break it before the lanes box you in.',
    glyph:
      '<rect x="-11" y="-8" width="20" height="16" rx="3"/><circle cx="-4" r="3.5" fill="none"/><circle class="eye" cx="7" r="2"/>',
  },
  sighting: 'Lane seeder. It plants Tethers along the way you were going.',
};
