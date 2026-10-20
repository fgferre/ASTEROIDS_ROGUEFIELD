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
  // A wide armoured wedge on two dark treads: a raised prow plate, a low
  // hump, ribs across its back; red sensor slits at the prow; at the tail,
  // the bare amber core between two exhausts.
  visual: {
    scale: 1,
    parts: [
      {
        shape: 'body',
        stations: [
          [-0.86, 0.56, 0.22, 0.12, 3],
          [-0.5, 0.7, 0.3, 0.16, 3],
          [0.05, 0.8, 0.34, 0.18, 3.4],
          [0.6, 0.74, 0.28, 0.16, 4],
          [0.98, 0.5, 0.16, 0.12, 4],
        ],
        ridge: 0.12,
        sides: 18,
        rings: 14,
      },
      {
        shape: 'body',
        stations: [
          [0.42, 0.82, 0.3, 0.02, 5],
          [0.78, 0.8, 0.24, 0.04, 5],
          [1.08, 0.58, 0.1, 0.06, 5],
        ],
        sides: 16,
        rings: 8,
        at: [0, 0.06, 0],
      },
      {
        shape: 'body',
        stations: [
          [-0.84, 0.13, 0.1, 0.14, 4],
          [0, 0.17, 0.12, 0.17, 4],
          [0.86, 0.13, 0.1, 0.14, 4],
        ],
        sides: 12,
        rings: 8,
        at: [0, -0.06, 0.82],
        mirror: true,
        material: 'trim',
      },
      {
        shape: 'turned',
        profile: [
          [0.38, 0.0],
          [0.36, 0.1],
          [0.26, 0.18],
          [0.0, 0.2],
        ],
        sides: 18,
        at: [-0.12, 0.3, 0],
      },
      ...[-0.55, -0.3].map((x) => ({
        shape: 'tube',
        points: [
          [x, 0.2, -0.62],
          [x, 0.34, 0],
          [x, 0.2, 0.62],
        ],
        radius: 0.035,
        sides: 6,
        rings: 7,
        material: 'trim',
      })),
      {
        shape: 'sphere',
        size: [0.1, 0.18, 0.26],
        at: [-0.9, 0.12, 0],
        material: 'glow',
        color: 'shot',
      },
      {
        shape: 'nozzle',
        at: [-0.86, 0.1, 0.5],
        size: 0.11,
        sides: 10,
        mirror: true,
      },
    ],
    lights: [
      ...[0.32, -0.32].map((z) => ({
        at: [1.02, 0.14, z],
        dir: [1, 0.3, 0],
        size: 0.08,
      })),
      {
        at: [-0.94, 0.13, 0],
        dir: [-1, 0.25, 0],
        size: 0.2,
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
