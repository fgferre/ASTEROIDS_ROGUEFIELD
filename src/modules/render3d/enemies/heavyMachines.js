// The heavy machines' looks as recipe data (recipes.js; machines.js builds
// the views and moves their parts): the Husk's wreck, the Weaver's rotor and
// the Bulwark's hull behind its plate. Units are the enemy's radius, +x the
// nose, +y up.

import { BULWARK_SHIELD_HALF_ARC } from '../../../content/enemies/bulwark.js';
import { gon, turned } from './shapes.js';

const TAU = Math.PI * 2;
// [x, z] at `r` along angle `a` (a part turned `a` about y puts its +x there)
const polar = (r, a) => [Math.cos(a) * r, -Math.sin(a) * r];
// a ring segment's outline from `a0` to `a1` between radii r0 and r1
const band = (r0, r1, a0, a1, steps = 2) => {
  const at = (k) => a0 + ((a1 - a0) * k) / steps;
  const ks = Array.from({ length: steps + 1 }, (_, k) => k);
  return [
    ...ks.map((k) => polar(r1, at(k))),
    ...ks.reverse().map((k) => polar(r0, at(k))),
  ];
};

// Husk: a dead keeper's wreck — three jagged slabs of Ring rock grown into
// a C round an open bay, two salvaged hull plates still bolted on, bare ribs
// across the bay's mouth; on the bay floor three Motes sleep, their eyes
// waking as it is damaged, and the cracks in the rock glow and throb with
// them.
const HUSK_MOTES = [
  [0.34, 0.12, 0.5],
  [0.12, -0.16, -0.9],
  [-0.06, 0.16, 2.2],
];
const HUSK_CRACKS = [
  [-0.58, 0.2, 0.44, 0.9, 0.24],
  [-0.34, 0.5, 0.44, -0.5, 0.2],
  [-0.68, -0.32, 0.3, -1.2, 0.14],
  [0.2, -0.64, 0.22, 0.25, 0.22],
  [0.5, 0.58, 0.18, -1.0, 0.16],
];
const HUSK_ROCK = { bevel: 0.07, color: 'rock' };
export const HUSK_LOOK = Object.freeze({
  parts: [
    {
      shape: 'slab',
      outline: [
        [0.62, 0.62],
        [-0.3, 0.84],
        [-0.84, 0.36],
        [-0.82, -0.4],
        [-0.2, -0.86],
        [0.56, -0.66],
      ],
      bottom: -0.32,
      top: -0.18,
      material: 'trim',
    },
    {
      shape: 'slab',
      outline: [
        [0.72, 0.3],
        [0.3, 0.42],
        [-0.26, 0.32],
        [-0.34, -0.02],
        [-0.2, -0.36],
        [0.3, -0.4],
        [0.7, -0.36],
      ],
      bottom: -0.22,
      top: -0.08,
      material: 'soot',
    },
    {
      shape: 'slab',
      outline: [
        [-0.08, 0.88],
        [-0.52, 0.78],
        [-0.86, 0.42],
        [-0.92, -0.04],
        [-0.72, -0.38],
        [-0.42, -0.3],
        [-0.3, 0.02],
        [-0.18, 0.34],
        [0.04, 0.52],
      ],
      bottom: -0.26,
      top: 0.3,
      ...HUSK_ROCK,
    },
    {
      shape: 'slab',
      outline: [
        [-0.64, -0.44],
        [-0.36, -0.84],
        [0.1, -0.92],
        [0.54, -0.72],
        [0.68, -0.46],
        [0.42, -0.4],
        [0.12, -0.46],
        [-0.22, -0.38],
      ],
      bottom: -0.24,
      top: 0.22,
      ...HUSK_ROCK,
    },
    {
      shape: 'slab',
      outline: [
        [0.08, 0.58],
        [0.36, 0.84],
        [0.68, 0.64],
        [0.76, 0.36],
        [0.5, 0.34],
        [0.26, 0.42],
      ],
      bottom: -0.22,
      top: 0.18,
      ...HUSK_ROCK,
      color: 'rockLit',
    },
    {
      shape: 'slab',
      outline: [
        [-0.24, 0.72],
        [-0.6, 0.6],
        [-0.78, 0.22],
        [-0.72, -0.2],
        [-0.52, -0.22],
        [-0.44, 0.2],
        [-0.16, 0.46],
      ],
      bottom: 0.2,
      top: 0.44,
      ...HUSK_ROCK,
      color: 'rockLit',
    },
    {
      shape: 'slab',
      outline: [
        [-0.2, -0.6],
        [0.08, -0.8],
        [0.4, -0.66],
        [0.2, -0.52],
      ],
      bottom: 0.14,
      top: 0.32,
      ...HUSK_ROCK,
    },
    ...[
      [-0.5, 0.48, 0.32, 0.12, 0.4],
      [-0.66, 0.42, -0.06, 0.1, 1.3],
      [0.44, 0.24, -0.6, 0.11, 2.1],
      [-0.08, 0.28, 0.72, 0.09, 0.8],
      [-0.84, 0.16, 0.24, 0.1, 2.6],
      [0.62, 0.18, 0.5, 0.08, 1.9],
      [-0.4, 0.2, -0.62, 0.1, 0.2],
    ].map(([x, y, z, size, turn]) => ({
      shape: 'icosahedron',
      size: [size * 1.3, size * 0.8, size],
      at: [x, y, z],
      rotate: [turn, turn * 1.7, 0.3],
      color: 'rock',
    })),
    {
      shape: 'slab',
      outline: [
        [-0.52, -0.26],
        [-0.86, -0.06],
        [-0.92, -0.3],
        [-0.66, -0.5],
      ],
      bottom: 0.14,
      top: 0.24,
      bevel: 0.02,
      rotate: [0, 0, 0.2],
    },
    {
      shape: 'slab',
      outline: [
        [0.3, -0.42],
        [0.62, -0.5],
        [0.7, -0.36],
        [0.4, -0.3],
      ],
      bottom: 0.1,
      top: 0.18,
      bevel: 0.015,
      material: 'steel',
    },
    ...[
      [0.64, 0.06, 0.46, 0.12],
      [0.48, 0.1, 0.3, -0.2],
    ].map(([x, y, span, turn]) => ({
      shape: 'box',
      size: [0.025, 0.025, span],
      at: [x, y, -0.02],
      rotate: [0, turn, 0],
      material: 'steel',
    })),
    ...HUSK_CRACKS.map(([x, z, y, turn, length]) => ({
      shape: 'box',
      size: [length / 2, 0.012, 0.014],
      at: [x, y + 0.005, z],
      rotate: [0, turn, 0],
      material: 'glow',
    })),
    ...HUSK_MOTES.map(([x, z, a]) => ({
      shape: 'slab',
      outline: turned(
        [
          [0.14, 0],
          [0.0, 0.07],
          [-0.07, 0.1],
          [-0.04, 0],
          [-0.07, -0.1],
          [0.0, -0.07],
        ],
        a
      ).map(([u, v]) => [x + u, z + v]),
      bottom: -0.1,
      top: -0.03,
      bevel: 0.012,
      material: 'steel',
    })),
  ],
  lights: HUSK_MOTES.map(([x, z, a]) => ({
    at: [x + Math.cos(a) * 0.06, -0.03, z - Math.sin(a) * 0.06],
    dir: [0, 1, 0],
    size: 0.05,
    pulse: 'damageRatio',
  })),
  animate: { pulse: 'damageRatio' },
});

// Weaver: a rotor — a stacked octagonal hub, its chute underneath, and
// three long thin arms bent back against the turn, each a dark beam under a
// steel strip with the lay light down its spine and an emitter pod at its
// tip that lights as a Tether is laid. The body turns as one.
export const WEAVER_ARMS = [0, 1, 2].map((i) => (i * TAU) / 3);
const WEAVER_ARM = [
  [0.22, 0.13],
  [0.6, 0.08],
  [0.86, -0.01],
  [0.86, -0.12],
  [0.6, -0.07],
  [0.22, -0.13],
];
const WEAVER_STRIP = [
  [0.28, 0.06],
  [0.6, 0.03],
  [0.8, -0.03],
  [0.8, -0.08],
  [0.6, -0.04],
  [0.28, -0.06],
];
export const WEAVER_TIP = [0.92, 0.08, -0.065];
export const WEAVER_LOOK = Object.freeze({
  finish: 'panel',
  parts: [
    {
      shape: 'slab',
      outline: gon(8, 0.38, Math.PI / 8),
      bottom: -0.1,
      top: 0.02,
      material: 'trim',
    },
    {
      shape: 'slab',
      outline: gon(8, 0.31),
      bottom: 0.0,
      top: 0.11,
      bevel: 0.03,
      material: 'steel',
    },
    {
      shape: 'slab',
      outline: gon(6, 0.2, Math.PI / 6),
      bottom: 0.09,
      top: 0.19,
      bevel: 0.025,
    },
    {
      shape: 'drum',
      sides: 6,
      size: [0.09, 0.02, 0.09],
      at: [0, 0.2, 0],
      material: 'soot',
    },
    {
      shape: 'drum',
      sides: 8,
      taper: 0.6,
      size: [0.16, 0.06, 0.16],
      at: [0, -0.16, 0],
      rotate: [Math.PI, 0, 0],
      material: 'trim',
    },
    ...WEAVER_ARMS.flatMap((a) => [
      {
        shape: 'slab',
        outline: turned(WEAVER_ARM, a),
        bottom: -0.05,
        top: 0.04,
        bevel: 0.02,
        material: 'trim',
      },
      {
        shape: 'slab',
        outline: turned(WEAVER_STRIP, a),
        bottom: 0.03,
        top: 0.07,
        bevel: 0.01,
        material: 'steel',
      },
      {
        shape: 'box',
        size: [0.18, 0.012, 0.014],
        at: [Math.cos(a) * 0.5, 0.075, -Math.sin(a) * 0.5],
        rotate: [0, a + 0.06, 0],
        material: 'glow',
      },
      {
        shape: 'drum',
        sides: 6,
        size: [0.13, 0.06, 0.13],
        at: [
          Math.cos(a) * WEAVER_TIP[0] + Math.sin(a) * WEAVER_TIP[2],
          0,
          -Math.sin(a) * WEAVER_TIP[0] + Math.cos(a) * WEAVER_TIP[2],
        ],
        material: 'steel',
      },
    ]),
  ],
  lights: WEAVER_ARMS.map((a) => ({
    at: [
      Math.cos(a) * WEAVER_TIP[0] + Math.sin(a) * WEAVER_TIP[2],
      WEAVER_TIP[1],
      -Math.sin(a) * WEAVER_TIP[0] + Math.cos(a) * WEAVER_TIP[2],
    ],
    dir: [0, 1, 0],
    size: 0.07,
    pulse: 'layGlow',
  })),
});

// Bulwark: a compact tracked hull that narrows behind; its whole front a
// broad mantlet — faceted armour blocks banked behind the shield plate
// (kit.frontalPlate, r 0.8–1.02 within the shield's arc: nothing here
// reaches past r 0.76 inside it), a cheek block past each end, a dark sill
// under the plate; a stepped deck, a sensor house, twin nozzles behind.
const BULWARK_ARC = BULWARK_SHIELD_HALF_ARC;
const BULWARK_FACETS = 4;
export const BULWARK_LOOK = Object.freeze({
  finish: 'panel',
  parts: [
    {
      shape: 'slab',
      outline: [
        [0.56, 0.4],
        [0.36, 0.6],
        [-0.46, 0.46],
        [-0.76, 0.28],
        [-0.82, 0.14],
        [-0.82, -0.14],
        [-0.76, -0.28],
        [-0.46, -0.46],
        [0.36, -0.6],
        [0.56, -0.4],
      ],
      bottom: -0.22,
      top: -0.02,
      material: 'trim',
    },
    ...Array.from({ length: BULWARK_FACETS }, (_, i) => {
      const step = (2 * BULWARK_ARC + 0.2) / BULWARK_FACETS;
      const a0 = -BULWARK_ARC - 0.1 + i * step;
      return {
        shape: 'slab',
        outline: band(0.5, 0.76, a0 + 0.03, a0 + step - 0.03, 1),
        bottom: -0.12,
        top: 0.22 - 0.04 * Math.abs(i - (BULWARK_FACETS - 1) / 2),
        bevel: 0.04,
        material: 'steel',
      };
    }),
    {
      shape: 'slab',
      outline: band(0.44, 0.94, BULWARK_ARC + 0.08, BULWARK_ARC + 0.5, 2),
      bottom: -0.2,
      top: 0.2,
      bevel: 0.05,
      mirror: true,
    },
    {
      shape: 'slab',
      outline: band(0.78, 1.04, -BULWARK_ARC - 0.04, BULWARK_ARC + 0.04, 6),
      bottom: -0.27,
      top: -0.19,
      bevel: 0.02,
      material: 'soot',
    },
    {
      shape: 'slab',
      outline: [
        [0.4, 0.3],
        [0.24, 0.42],
        [-0.42, 0.34],
        [-0.66, 0.2],
        [-0.66, -0.2],
        [-0.42, -0.34],
        [0.24, -0.42],
        [0.4, -0.3],
      ],
      bottom: -0.04,
      top: 0.16,
      bevel: 0.04,
    },
    {
      shape: 'slab',
      outline: [
        [0.16, 0.16],
        [0.06, 0.22],
        [-0.34, 0.2],
        [-0.42, 0.12],
        [-0.42, -0.12],
        [-0.34, -0.2],
        [0.06, -0.22],
        [0.16, -0.16],
      ],
      bottom: 0.14,
      top: 0.28,
      bevel: 0.03,
      material: 'trim',
    },
    {
      shape: 'box',
      size: [0.012, 0.025, 0.13],
      at: [0.165, 0.22, 0],
      material: 'soot',
    },
    {
      shape: 'drum',
      axis: 'x',
      sides: 8,
      size: [0.08, 0.1, 0.1],
      at: [-0.84, 0.02, 0.22],
      mirror: true,
      material: 'trim',
    },
    {
      shape: 'drum',
      axis: 'x',
      sides: 8,
      size: [0.012, 0.07, 0.07],
      at: [-0.925, 0.02, 0.22],
      mirror: true,
      material: 'soot',
    },
  ],
});
