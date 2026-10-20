// src/content/enemies/mite.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Mite: a hull-scrubber that hunts in packs. Faster than the ship, gone in
// one hit, no gun: it rams. It comes in formations (swarms and rings).
// Numbers: proposta 20/10 — the owner's play decides.
const HEALTH = 14; // proposta 20/10
const RADIUS = 9; // proposta 20/10
const CONTACT_DAMAGE = 9; // proposta 20/10

export default {
  id: 'mite',
  order: 11,
  roles: ['swarmer'],
  fromLayer: 2,
  config: deepFreeze({
    key: 'mite',
    displayName: 'Mite',
    radius: RADIUS,
    health: HEALTH,
    contactDamage: CONTACT_DAMAGE,
  }),
  components: deepFreeze({
    movement: {
      strategy: 'tracking',
      acceleration: 420, // proposta 20/10: overshoots and loops back
      maxSpeed: 230, // proposta 20/10: the ship tops out at 220
      targetingRange: 2000,
      variance: 160, // proposta 20/10: the jitter of a pack
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
    baseOrbs: 1, // proposta 20/10
    totalXP: 10, // proposta 20/10
    healthHeartChance: 0, // proposta 20/10
  }),
  pool: { initial: 12, max: 48 },
  tags: ['enemy', 'hostile', 'swarm'],
  affixes: ['swift', 'volatile'],
  // Its tracking draws its jitter from its own stream.
  seeded: true,
  behaviors: deepFreeze({
    'spawn-on-field': { margin: 100, spread: 100 },
  }),
  effects: { death: 'spark-burst' },
  explosion: 'small',
  // A pincer: a flat delta hull on a dark belly, two scrubber prongs out
  // past its nose, short swept blades, twin nozzles, one eye between the
  // prongs.
  visual: {
    scale: 1,
    parts: [
      {
        shape: 'body',
        stations: [
          [-0.62, 0.42, 0.1, 0.05],
          [-0.2, 0.44, 0.15, 0.07],
          [0.25, 0.28, 0.13, 0.06],
          [0.62, 0.08, 0.06, 0.03],
        ],
        round: 3,
        ridge: 0.45,
        sides: 12,
        rings: 10,
      },
      {
        shape: 'body',
        stations: [
          [-0.5, 0.26, 0, 0.08],
          [0, 0.3, 0, 0.11],
          [0.45, 0.12, 0, 0.05],
        ],
        sides: 8,
        rings: 8,
        at: [0, -0.04, 0],
        material: 'trim',
      },
      {
        shape: 'tube',
        points: [
          [0.0, 0.01, 0.3],
          [0.55, 0.02, 0.34],
          [1.02, -0.01, 0.17],
        ],
        radius: [0.075, 0.025],
        sides: 7,
        rings: 8,
        mirror: true,
        material: 'trim',
      },
      {
        shape: 'wing',
        root: 0.46,
        tip: 0.1,
        span: 0.4,
        sweep: 0.42,
        thick: 0.07,
        dihedral: -0.1,
        sides: 8,
        at: [-0.3, -0.01, 0.38],
        mirror: true,
      },
      {
        shape: 'nozzle',
        at: [-0.64, 0.02, 0.2],
        size: 0.09,
        sides: 10,
        mirror: true,
      },
    ],
    lights: [{ at: [0.55, 0.08, 0], dir: [1, 0.5, 0], size: 0.08 }],
    animate: { bob: 0.04 },
  },
  codex: {
    lore: 'The Ring’s hull-scrubbers. One is nothing. They are never one.',
    hint: 'Fast and fragile, with no gun: they ram, in packs. Keep moving and sweep them up.',
    glyph:
      '<polygon points="8,0 -8,-9 -6,0 -8,9"/><path fill="none" stroke-width="2" d="M0 -5 L13 -3 M0 5 L13 3"/><circle class="eye" cx="5" r="1.8"/>',
  },
  sighting: 'Hull scrubbers. A pack, already turning. They clean by impact.',
};
