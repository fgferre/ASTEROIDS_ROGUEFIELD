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
  // A flat, boxy carrier: a drum hopper on its back holding three seeds, a
  // dark pod on each flank with its nozzle, a chute behind that lights as a
  // Tether drops, one eye.
  visual: {
    scale: 1,
    parts: [
      {
        shape: 'body',
        stations: [
          [-0.72, 0.48, 0.14, 0.09],
          [-0.2, 0.6, 0.17, 0.11],
          [0.38, 0.5, 0.15, 0.09],
          [0.86, 0.18, 0.09, 0.05],
        ],
        round: 3.4,
        ridge: 0.1,
        sides: 16,
        rings: 12,
      },
      {
        shape: 'body',
        stations: [
          [-0.6, 0.08, 0.07, 0.06],
          [-0.1, 0.13, 0.1, 0.08],
          [0.35, 0.08, 0.07, 0.05],
        ],
        sides: 10,
        rings: 8,
        at: [0, -0.01, 0.6],
        mirror: true,
        material: 'trim',
      },
      {
        shape: 'turned',
        profile: [
          [0.0, 0.3],
          [0.26, 0.3],
          [0.33, 0.24],
          [0.33, 0.14],
          [0.28, 0.1],
        ],
        sides: 20,
        at: [-0.22, 0, 0],
        material: 'trim',
      },
      ...[0, 1, 2].map((i) => ({
        shape: 'icosahedron',
        size: 0.09,
        at: [
          -0.22 + Math.cos((i * Math.PI * 2) / 3) * 0.16,
          0.36,
          Math.sin((i * Math.PI * 2) / 3) * 0.16,
        ],
      })),
      {
        shape: 'nozzle',
        at: [-0.62, 0.02, 0.6],
        size: 0.08,
        sides: 10,
        mirror: true,
      },
    ],
    lights: [
      {
        at: [-0.74, 0.07, 0],
        dir: [-1, 0.3, 0],
        size: 0.1,
        pulse: 'layGlow',
      },
      { at: [0.8, 0.11, 0], dir: [1, 0.5, 0], size: 0.09 },
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
