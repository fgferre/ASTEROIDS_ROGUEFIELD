// src/content/enemies/aegis.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Aegis: a crew warden. It hangs back at mid range and wards every machine
// near it: their shots spark off its ward until the ward breaks. It never
// wards itself, so it is the one to break first.
// Numbers: proposta 20/10 — the owner's play decides.
const HEALTH = 70; // proposta 20/10
const RADIUS = 17; // proposta 20/10
const CONTACT_DAMAGE = 12; // proposta 20/10
const TURN = (Math.PI * 2) / 3;
const around = (i, r, y) => [Math.cos(i * TURN) * r, y, Math.sin(i * TURN) * r];

export default {
  id: 'aegis',
  order: 12,
  roles: ['support'],
  fromLayer: 7,
  config: deepFreeze({
    key: 'aegis',
    displayName: 'Aegis',
    radius: RADIUS,
    health: HEALTH,
    contactDamage: CONTACT_DAMAGE,
  }),
  components: deepFreeze({
    // hold-range steers it; 'linear' only integrates vx/vy.
    movement: { strategy: 'linear', maxSpeed: 70 }, // proposta 20/10
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
    healthHeartChance: 0.03, // proposta 20/10
  }),
  pool: { initial: 2, max: 8 },
  tags: ['enemy', 'hostile', 'support'],
  affixes: ['swift', 'warded'],
  seeded: false,
  behaviors: deepFreeze({
    'hold-range': {
      min: 170, // proposta 20/10: in among the fight, behind it
      max: 240, // proposta 20/10
      margin: 40, // proposta 20/10
    },
    ward: {
      radius: 150, // proposta 20/10: px it wards around it
      health: 60, // proposta 20/10: damage its ward takes before it breaks
      recharge: 5, // proposta 20/10: s until a broken ward is back
    },
  }),
  // A squat lantern: a turned hull with a dark band, a mast with a thin lime
  // halo, three vanes with a lime ward node each and one red eye. Its ward
  // shows as the links to what it covers (render3d/overlayMirror.js).
  visual: {
    scale: 1,
    parts: [
      {
        shape: 'turned',
        profile: [
          [0.12, 0.3],
          [0.42, 0.27],
          [0.66, 0.16],
          [0.74, 0.04],
          [0.7, -0.08],
          [0.48, -0.18],
          [0.12, -0.22],
        ],
        sides: 24,
      },
      {
        shape: 'turned',
        profile: [
          [0.72, 0.07],
          [0.79, 0.03],
          [0.78, -0.05],
          [0.7, -0.03],
          [0.72, 0.07],
        ],
        sides: 24,
        material: 'trim',
      },
      {
        shape: 'turned',
        profile: [
          [0.16, 0.29],
          [0.11, 0.44],
          [0.07, 0.56],
          [0.0, 0.58],
        ],
        sides: 12,
        material: 'trim',
      },
      {
        shape: 'torus',
        size: [0.2, 0.16, 0.2],
        at: [0, 0.6, 0],
        material: 'glow',
        color: 'status',
      },
      { shape: 'nozzle', at: [0, -0.22, 0], dir: [0, -1, 0], size: 0.16 },
      ...[0, 1, 2].flatMap((i) => [
        {
          shape: 'wing',
          root: 0.34,
          tip: 0.14,
          span: 0.46,
          sweep: 0.06,
          thick: 0.08,
          dihedral: 0.22,
          sides: 8,
          at: around(i + 0.5, 0.62, 0.04),
          rotate: [0, Math.PI / 2 - (i + 0.5) * TURN, 0],
        },
        {
          shape: 'turned',
          profile: [
            [0.02, 0.1],
            [0.08, 0.07],
            [0.1, -0.02],
            [0.06, -0.08],
          ],
          sides: 10,
          at: around(i + 0.5, 1.08, 0.14),
          material: 'trim',
        },
      ]),
    ],
    lights: [
      ...[0, 1, 2].map((i) => ({
        at: around(i + 0.5, 1.08, 0.22),
        dir: around(i + 0.5, 0.6, 1),
        size: 0.07,
        color: 'status',
      })),
      { at: [0.68, 0.12, 0], dir: [1, 0.4, 0], size: 0.1 },
    ],
    animate: { bob: 0.04 },
  },
  codex: {
    lore: 'The Ring set wardens over its work crews. This one still keeps its crew from harm — whatever crew it finds.',
    hint: 'While its ward holds, shots on machines near it spark off. It does not ward itself: break it first.',
    glyph:
      '<circle r="8"/><path fill="none" stroke-width="2" d="M0 -13 L0 -8 M11 6.5 L7 4 M-11 6.5 L-7 4"/><circle class="eye" cx="4" r="2"/>',
  },
  sighting: 'Crew warden. It shields every machine near it. Not itself.',
};
