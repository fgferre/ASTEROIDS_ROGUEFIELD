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

// Husk: a dead keeper's wreck, cracked open — four jagged shards of Ring
// rock standing in a broken ring round a wide dark hold, its mouth torn out
// to the front and the keeper's bare ribs still reaching across it, a hull
// plate bolted to the shell. In the hold three Motes sleep, their eyes up:
// they wake as it is damaged, and the cracks between the shards glow and
// throb with them.
const HUSK_MOTES = [
  [0.27, 0.1],
  [-0.22, 0.2],
  [-0.05, -0.28],
];
// a shard of the shell from angle a0 to a1: its inner and outer radii
const shard = (a0, a1, inner, outer) => {
  const at = (list, k) => a0 + ((a1 - a0) * k) / (list.length - 1);
  return [
    ...outer.map((r, k) => polar(r, at(outer, k))),
    ...inner.map((r, k) => polar(r, at(inner, k))).reverse(),
  ];
};
// [a0, a1, outer radii, top of the low inner step, top of the ledge]
const HUSK_SHARDS = [
  [0.72, 1.9, [0.84, 1.0, 0.88, 0.98], 0.12, 0.3],
  [2.02, 3.08, [0.96, 0.86, 1.0, 0.9], 0.2, 0.44],
  [3.2, 4.3, [0.9, 1.0, 0.84, 0.94], 0.1, 0.26],
  [4.42, 5.56, [0.98, 0.88, 1.0, 0.82], 0.16, 0.38],
];
const HUSK_CRACKS = [1.96, 3.14, 4.36];
const HUSK_RIBS = [
  [0.52, 0.31, 0.2],
  [0.68, 0.4, 0.25],
  [0.84, 0.48, 0.2],
];
export const HUSK_LOOK = Object.freeze({
  parts: [
    {
      shape: 'slab',
      outline: [
        [0.86, 0.5],
        [0.3, 0.8],
        [-0.36, 0.78],
        [-0.82, 0.3],
        [-0.8, -0.34],
        [-0.3, -0.8],
        [0.34, -0.78],
        [0.86, -0.46],
      ],
      bottom: -0.32,
      top: -0.16,
      material: 'trim',
    },
    {
      shape: 'slab',
      outline: gon(9, 0.62, 0.2),
      bottom: -0.2,
      top: -0.1,
      material: 'soot',
    },
    ...HUSK_SHARDS.flatMap(([a0, a1, outer, step, top], i) => [
      {
        shape: 'slab',
        outline: shard(a0, a1, [0.56, 0.62, 0.54, 0.6], outer),
        bottom: -0.28,
        top: step,
        bevel: 0.07,
        color: 'rock',
      },
      {
        shape: 'slab',
        outline: shard(
          a0 + 0.05,
          a1 - 0.05,
          [0.72, 0.68, 0.74, 0.7],
          outer.map((r) => r - 0.03)
        ),
        bottom: step - 0.04,
        top,
        bevel: 0.07,
        color: i % 2 ? 'rockLit' : 'rock',
      },
    ]),
    ...[
      [0.5, 1.3, 0.32, 0.1],
      [2.4, 2.9, 0.46, 0.12],
      [5.2, 0.8, 0.4, 0.11],
    ].map(([a, turn, y, size]) => ({
      shape: 'icosahedron',
      size: [size * 1.3, size * 0.8, size],
      at: [Math.cos(a) * 0.84, y, -Math.sin(a) * 0.84],
      rotate: [turn, turn * 1.7, 0.3],
      color: 'rockLit',
    })),
    {
      shape: 'slab',
      outline: shard(3.34, 4.1, [0.7, 0.72], [0.9, 0.86]),
      bottom: 0.24,
      top: 0.3,
      bevel: 0.015,
      material: 'steel',
    },
    ...HUSK_RIBS.flatMap(([x, z, half]) =>
      [-1, 1].map((side) => ({
        shape: 'box',
        size: [0.03, 0.03, half],
        at: [x, 0.06, side * z],
        material: 'steel',
      }))
    ),
    ...HUSK_CRACKS.map((a) => ({
      shape: 'box',
      size: [0.17, 0.02, 0.022],
      at: [Math.cos(a) * 0.76, -0.14, -Math.sin(a) * 0.76],
      rotate: [0, a, 0],
      material: 'glow',
    })),
    ...HUSK_MOTES.map(([x, z], i) => ({
      shape: 'slab',
      outline: gon(6, 0.19, i).map(([u, v]) => [x + u, z + v]),
      bottom: -0.12,
      top: 0.0,
      bevel: 0.035,
      material: 'steel',
    })),
  ],
  lights: HUSK_MOTES.map(([x, z]) => ({
    at: [x, 0.0, z],
    dir: [0, 1, 0],
    size: 0.11,
    pulse: 'damageRatio',
  })),
  animate: { pulse: 'damageRatio' },
});

// Weaver: a rotor with mass — a stacked hub with its chute through the
// middle and three broad cleaver blades swept back against the turn, each a
// dark beam under a steel plate, the lay light along its leading edge and a
// big emitter pod in its tip that lights as a Tether is laid. The body
// turns as one.
export const WEAVER_ARMS = [0, 1, 2].map((i) => (i * TAU) / 3);
const WEAVER_ARM = [
  [0.16, 0.17],
  [0.6, 0.15],
  [0.96, 0.07],
  [1.02, -0.16],
  [0.8, -0.47],
  [0.5, -0.4],
  [0.3, -0.2],
  [0.16, -0.17],
];
const WEAVER_PLATE = [
  [0.26, 0.1],
  [0.6, 0.09],
  [0.9, 0.02],
  [0.95, -0.15],
  [0.78, -0.38],
  [0.54, -0.32],
  [0.36, -0.14],
  [0.26, -0.1],
];
export const WEAVER_TIP = [0.76, 0.13, -0.15];
const weaverAt = ([x, y, z], a) => {
  const [[u, v]] = turned([[x, z]], a);
  return [u, y, v];
};
export const WEAVER_LOOK = Object.freeze({
  finish: 'panel',
  parts: [
    {
      shape: 'slab',
      outline: gon(8, 0.36, Math.PI / 8),
      bottom: -0.12,
      top: 0.04,
      material: 'trim',
    },
    {
      shape: 'slab',
      outline: gon(6, 0.28),
      bottom: 0.02,
      top: 0.18,
      bevel: 0.04,
    },
    {
      shape: 'drum',
      sides: 6,
      size: [0.13, 0.02, 0.13],
      at: [0, 0.185, 0],
      material: 'soot',
    },
    {
      shape: 'drum',
      sides: 8,
      taper: 0.6,
      size: [0.18, 0.06, 0.18],
      at: [0, -0.18, 0],
      rotate: [Math.PI, 0, 0],
      material: 'trim',
    },
    ...WEAVER_ARMS.flatMap((a) => [
      {
        shape: 'slab',
        outline: turned(WEAVER_ARM, a),
        bottom: -0.08,
        top: 0.05,
        bevel: 0.03,
        material: 'trim',
      },
      {
        shape: 'slab',
        outline: turned(WEAVER_PLATE, a),
        bottom: 0.03,
        top: 0.1,
        bevel: 0.02,
        material: 'steel',
      },
      {
        shape: 'box',
        size: [0.27, 0.014, 0.028],
        at: weaverAt([0.6, 0.105, 0.115], a),
        rotate: [0, a + 0.08, 0],
        material: 'glow',
      },
      {
        shape: 'drum',
        sides: 6,
        size: [0.16, 0.035, 0.16],
        at: weaverAt([WEAVER_TIP[0], 0.1, WEAVER_TIP[2]], a),
        material: 'soot',
      },
    ]),
  ],
  lights: WEAVER_ARMS.map((a) => ({
    at: weaverAt(WEAVER_TIP, a),
    dir: [0, 1, 0],
    size: 0.12,
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
