// src/content/enemies/aegis.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// Aegis: a crew warden. It hangs back at mid range and wards every machine
// near it: their shots spark off its ward until the ward breaks. It never
// wards itself, so it is the one to break first.
// Numbers: proposta 20/10 — the owner's play decides.
const HEALTH = 70; // proposta 20/10
const RADIUS = 17; // proposta 20/10
const CONTACT_DAMAGE = 12; // proposta 20/10
const STEP = Math.PI / 4;
const EIGHT = [0, 1, 2, 3, 4, 5, 6, 7];
const polar = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
// A hoop plate seen from above: `half` radians either side of `a`, from
// radius `inner` to `outer`.
const arc = (a, half, inner, outer) =>
  [
    [outer, -half],
    [outer, 0],
    [outer, half],
    [inner, half],
    [inner, 0],
    [inner, -half],
  ].map(([r, da]) => [Math.cos(a + da) * r, Math.sin(a + da) * r]);

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
  // A ward wheel: an open eight-plate hoop round a hollow, a core hung in it
  // on four spokes with the ward emitter on top, and four projector pylons
  // standing out past the hoop, a lime node on each. It turns slowly; its
  // lights are bright while the ward holds and go dim when it breaks. Its
  // ward shows as the links to what it covers (render3d/overlayMirror.js).
  visual: {
    scale: 1.12,
    finish: 'panel',
    parts: [
      ...EIGHT.flatMap((k) => [
        // the hoop: dark base plates, a raised armour plate on every other one
        {
          shape: 'slab',
          outline: arc(k * STEP, 0.34, 0.54, 0.86),
          bottom: -0.1,
          top: 0.05,
          bevel: 0.03,
          material: 'trim',
        },
        k % 2
          ? {
              shape: 'slab',
              outline: arc(k * STEP, 0.27, 0.6, 0.82),
              bottom: 0.05,
              top: 0.14,
              bevel: 0.03,
            }
          : {
              // a projector pylon, worn steel, out past the hoop
              shape: 'slab',
              outline: [
                [0.6, 0.13],
                [0.92, 0.13],
                [1.1, 0.06],
                [1.1, -0.06],
                [0.92, -0.13],
                [0.6, -0.13],
              ],
              bottom: -0.05,
              top: 0.17,
              bevel: 0.035,
              rotate: [0, -k * STEP, 0],
              material: 'steel',
            },
      ]),
      // the spokes, between the pylons
      ...[1, 3, 5, 7].map((k) => ({
        shape: 'box',
        size: [0.16, 0.035, 0.035],
        at: polar(k * STEP, 0.42, 0),
        rotate: [0, -k * STEP, 0],
        material: 'steel',
      })),
      // the core: a faceted drum, a stepped cap and a dark keel
      {
        shape: 'drum',
        sides: 8,
        size: [0.3, 0.1, 0.3],
        rotate: [0, STEP / 2, 0],
      },
      {
        shape: 'drum',
        sides: 8,
        taper: 0.78,
        size: [0.25, 0.04, 0.25],
        at: [0, 0.14, 0],
        rotate: [0, STEP / 2, 0],
        material: 'steel',
      },
      {
        shape: 'drum',
        sides: 8,
        taper: 0.5,
        size: [0.24, 0.07, 0.24],
        at: [0, -0.17, 0],
        rotate: [Math.PI, STEP / 2, 0],
        material: 'trim',
      },
    ],
    lights: [
      // the ward emitter
      {
        at: [0, 0.2, 0],
        dir: [0, 1, 0],
        size: 0.09,
        color: 'status',
        pulse: 'wardRatio',
      },
      // a ward node on each pylon
      ...[0, 2, 4, 6].map((k) => ({
        at: polar(k * STEP, 0.93, 0.19),
        dir: polar(k * STEP, 0.5, 1),
        size: 0.05,
        color: 'status',
        pulse: 'wardRatio',
      })),
    ],
    animate: { spin: [0, 0.35, 0] },
  },
  codex: {
    lore: 'The Ring set wardens over its work crews. This one still keeps its crew from harm — whatever crew it finds.',
    hint: 'While its ward holds, shots on machines near it spark off. It does not ward itself: break it first.',
    glyph:
      '<circle r="8"/><path fill="none" stroke-width="2" d="M0 -13 L0 -8 M11 6.5 L7 4 M-11 6.5 L-7 4"/><circle class="eye" cx="4" r="2"/>',
  },
  sighting: 'Crew warden. It shields every machine near it. Not itself.',
};
