// src/content/enemies/surveyor.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Surveyor: a marksman. It holds long range, stops, draws a red line at the
// ship that follows it and then holds still, and fires one fast shot down
// the line. Step off the line once it stops moving.
// Numbers: proposta 20/10 — the owner's play decides.
const HEALTH = 46; // proposta 20/10
const RADIUS = 15; // proposta 20/10
const CONTACT_DAMAGE = 10; // proposta 20/10

export default {
  id: 'surveyor',
  order: 14,
  roles: ['marksman'],
  fromLayer: 6,
  config: deepFreeze({
    key: 'surveyor',
    displayName: 'Surveyor',
    radius: RADIUS,
    health: HEALTH,
    contactDamage: CONTACT_DAMAGE,
  }),
  components: deepFreeze({
    // hold-range steers it; 'linear' only integrates vx/vy.
    movement: { strategy: 'linear', maxSpeed: 80 }, // proposta 20/10
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
    totalXP: 45, // proposta 20/10
    healthHeartChance: 0.02, // proposta 20/10
  }),
  pool: { initial: 2, max: 8 },
  tags: ['enemy', 'hostile', 'ranged', 'sniper'],
  affixes: ['shielded', 'swift', 'warded'],
  projectileColor: 'rgba(255, 70, 70, 0.95)',
  seeded: false,
  behaviors: deepFreeze({
    'hold-range': {
      min: 340, // proposta 20/10: backs off inside this
      max: 420, // proposta 20/10: closes in beyond this
      margin: 40, // proposta 20/10
    },
    'aim-line': {
      interval: 3.2, // proposta 20/10: s from a shot to the next line
      aim: 1.3, // proposta 20/10: s the line shows
      lock: 0.4, // proposta 20/10: its last s, held still
      length: 900, // proposta 20/10: px
      speed: 1000, // proposta 20/10: px/s
      damage: 22, // proposta 20/10
      lifetime: 0.9, // proposta 20/10: s, the line's length
      pattern: 'surveyor-line',
      telegraphEvent: 'enemy-telegraph',
    },
  }),
  // Its shot flashes bright; it dies in a shockwave.
  effects: { fire: 'burst-flash', death: 'shock-burst' },
  // A spear: a long hull, a longer dark barrel past its nose, the lens at the
  // barrel's root (lit as it aims), long swept stabilisers and a dorsal fin.
  visual: {
    scale: 1,
    parts: [
      {
        shape: 'body',
        stations: [
          [-0.92, 0.16, 0.12, 0.08],
          [-0.42, 0.3, 0.2, 0.12],
          [0.15, 0.27, 0.19, 0.11],
          [0.7, 0.14, 0.12, 0.07],
          [1.05, 0.05, 0.05, 0.04],
        ],
        round: 2.6,
        ridge: 0.22,
        sides: 14,
        rings: 12,
      },
      {
        shape: 'turned',
        profile: [
          [0.07, 0.62],
          [0.06, 0.72],
          [0.045, 0.78],
          [0.045, 1.5],
          [0.06, 1.54],
          [0.06, 1.62],
          [0.0, 1.64],
        ],
        axis: 'x',
        sides: 10,
        at: [0, 0.1, 0],
        material: 'trim',
      },
      {
        shape: 'wing',
        root: 0.5,
        tip: 0.12,
        span: 0.66,
        sweep: 0.46,
        thick: 0.06,
        dihedral: -0.08,
        sides: 8,
        at: [-0.42, 0, 0.16],
        mirror: true,
      },
      {
        shape: 'wing',
        root: 0.18,
        tip: 0.05,
        span: 0.18,
        sweep: 0.1,
        thick: 0.04,
        sides: 6,
        at: [0.55, 0.04, 0.1],
        mirror: true,
        material: 'trim',
      },
      {
        shape: 'wing',
        root: 0.36,
        tip: 0.1,
        span: 0.26,
        sweep: 0.26,
        thick: 0.05,
        dihedral: Math.PI / 2,
        under: 1,
        sides: 6,
        at: [-0.6, 0.16, 0],
        material: 'trim',
      },
      { shape: 'nozzle', at: [-0.94, 0.03, 0], size: 0.13, sides: 10 },
    ],
    lights: [
      {
        at: [0.62, 0.17, 0],
        dir: [1, 0.35, 0],
        size: 0.1,
        pulse: 'telegraphRatio',
      },
    ],
  },
  codex: {
    lore: 'Surveyors measured the Ring in straight lines. This one still draws them, and you are standing on one.',
    hint: 'A red line marks its shot. When the line stops moving, step off it.',
    glyph:
      '<polygon points="10,0 -4,-5 -12,-9 -9,0 -12,9 -4,5"/><path fill="none" stroke-width="1.5" d="M10 0 L16 0"/><circle class="eye" cx="5" r="2"/>',
  },
  sighting: 'Surveyor. It measures in straight lines. You are on one.',
};
