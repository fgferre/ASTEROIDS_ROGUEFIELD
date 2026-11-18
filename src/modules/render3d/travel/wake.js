// src/modules/render3d/travel/wake.js
//
// The Wake: the old freighter the pilot's people live on (data/story.js),
// seen in the story scene before the first journey (the owner's card, 17/11:
// huge, heavy, rich in hull detail). A long faceted hull, tapering into a
// split prow whose cargo maw stands a little open; armour plates along the
// flanks with cargo showing in the gaps (and a stretch torn away to the
// ribs); sloped shoulder plates; a ventral hangar the interceptors launch
// from; at the stern the reactor, the bridge tower, folded radiators and
// four square engine bells, one of them dead.
// Faceted hard-surface parts (shapes.js skin with flat facets, slab) merged
// into one panelled hull (bakeHullMaps), plus three merged meshes of light
// the scene can dim or flicker: `windows` (windows, maw, hangar and running
// lights), `reactor` (its failing seams) and `engines`.
// Built in authoring units (the hull about 100 long: +x the bow, y up, z
// across) and scaled to WAKE_LENGTH.

import { PALETTE } from '../../../data/constants/palette.js';
import { createSeededRandom } from '../asteroidMesh.js';
import { bakeHullMaps } from '../bakedMaps.js';
import { colorOf } from '../batches.js';
import { skin, slab } from '../enemies/shapes.js';
import { SHINE, shiny } from '../hullModel.js';
import { mergeStatic } from '../mergeStatic.js';
import { addRimLight } from '../rimLight.js';

export const WAKE_LENGTH = 3200;
const SEED = 0x3a4e;
// Hull panels' tiling per authoring unit (bakeHullMaps: four panel columns).
const PANEL_TILE = 0.45;
// Light strengths (× their colour; above 1 they reach the bloom).
const GLOW = { window: 1.5, running: 2.2, reactor: 1.8, engine: 3.0 };

// The main hull's stations, stern to bow: x; half widths at the chines (hw),
// keel (kw) and deck (tw); heights of the keel, lower and upper chines and
// deck.
const HULL = [
  { x: -44, hw: 8.0, kw: 4.6, tw: 5.6, yb: -6.6, yl: -3.0, yh: 2.6, yt: 5.6 },
  { x: -28, hw: 8.4, kw: 4.6, tw: 5.8, yb: -6.6, yl: -3.0, yh: 2.6, yt: 5.6 },
  { x: -22, hw: 5.4, kw: 3.2, tw: 3.8, yb: -5.2, yl: -2.6, yh: 1.6, yt: 3.4 },
  { x: 8, hw: 5.2, kw: 3.0, tw: 3.6, yb: -5.0, yl: -2.5, yh: 1.5, yt: 3.3 },
  { x: 14, hw: 7.6, kw: 4.0, tw: 5.0, yb: -6.0, yl: -2.8, yh: 2.2, yt: 5.0 },
  { x: 30, hw: 7.2, kw: 3.4, tw: 4.8, yb: -5.6, yl: -2.6, yh: 2.2, yt: 5.0 },
  { x: 34, hw: 6.6, kw: 2.8, tw: 4.4, yb: -5.3, yl: -2.4, yh: 2.0, yt: 4.9 },
];
// The slender cargo neck between the stern and the forward hull.
const NECK = [-22, 8];
// The prow's two jaws and the dark maw between them.
const UPPER_JAW = [
  { x: 30, hw: 6.9, kw: 6.2, tw: 4.6, yb: -0.4, yl: -0.1, yh: 2.2, yt: 5.0 },
  { x: 44, hw: 5.0, kw: 4.4, tw: 3.0, yb: -0.4, yl: -0.1, yh: 1.6, yt: 4.0 },
  { x: 52, hw: 1.6, kw: 1.2, tw: 0.8, yb: -0.3, yl: 0, yh: 0.6, yt: 1.8 },
];
const LOWER_JAW = [
  { x: 31, hw: 6.4, kw: 2.6, tw: 5.8, yb: -5.3, yl: -2.4, yh: -2.1, yt: -1.9 },
  { x: 44, hw: 4.2, kw: 1.4, tw: 3.8, yb: -4.3, yl: -2.2, yh: -2.1, yt: -1.9 },
  {
    x: 50,
    hw: 1.5,
    kw: 0.5,
    tw: 1.3,
    yb: -3.1,
    yl: -2.15,
    yh: -2.05,
    yt: -1.9,
  },
];
// The forward dorsal hump, rising to the prow's head.
const BROW = [
  { x: 13, hw: 2.2, kw: 2.2, tw: 1.4, yb: 4.9, yl: 5.0, yh: 5.4, yt: 5.8 },
  { x: 18, hw: 4.0, kw: 4.0, tw: 2.6, yb: 4.8, yl: 4.9, yh: 5.9, yt: 6.8 },
  { x: 28, hw: 4.0, kw: 4.0, tw: 2.6, yb: 4.8, yl: 4.9, yh: 5.9, yt: 6.8 },
  { x: 32, hw: 4.6, kw: 4.6, tw: 2.9, yb: 4.6, yl: 4.7, yh: 5.6, yt: 6.2 },
];

const lerp = (a, b, t) => a + (b - a) * t;
const rect = (x0, x1, z0, z1) => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];
// A station's value of `key` at `x` (linear between stations).
function along(stations, x, key) {
  const next = stations.findIndex((s) => s.x > x);
  const i = Math.max(
    0,
    Math.min(stations.length - 2, (next < 0 ? stations.length : next) - 1)
  );
  const [a, b] = [stations[i], stations[i + 1]];
  return lerp(
    a[key],
    b[key],
    Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)))
  );
}
const at = (stations, x) =>
  Object.fromEntries(
    ['hw', 'kw', 'tw', 'yb', 'yl', 'yh', 'yt'].map((k) => [
      k,
      along(stations, x, k),
    ])
  );

/** The Wake: { group, windows, reactor, engines } (group holds them all). */
export function buildWake(THREE) {
  const random = createSeededRandom(SEED);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const base = colorOf(THREE, PALETTE.hullLit);
  const tone = (k) => base.clone().multiplyScalar(k);
  const T = {
    hull: tone(1),
    light: tone(1.3),
    pale: tone(1.65),
    dark: tone(0.6),
    soot: tone(0.28),
    steel: tone(1.9),
  };
  const cargo = ['#4a3424', '#1d3538', '#56482a', '#3c4047', '#5a2a22'].map(
    (css) => colorOf(THREE, css)
  );
  const rust = colorOf(THREE, '#3f342c');
  // Old plating: mostly the light grey, some bare, some newer, some stained.
  const plateTone = () => {
    const roll = random();
    if (roll < 0.5) return T.light;
    if (roll < 0.78) return T.hull;
    if (roll < 0.9) return rust;
    return T.pale;
  };
  const hull = [];
  const lights = { windows: [], reactor: [], engines: [] };
  const add = (geometry, color) => hull.push({ geometry, color });
  const part = (outline, y0, y1, color = T.hull, bevel = 0.08) =>
    add(slab(THREE, outline, y0, y1, bevel), color);
  const glow = (kind, outline, y0, y1, css, gain) =>
    lights[kind].push({
      geometry: slab(THREE, outline, y0, y1, 0),
      color: colorOf(THREE, css).multiplyScalar(gain),
    });
  const lamp = (x, y, z, css, gain = GLOW.running, size = 0.18) =>
    glow(
      'windows',
      rect(x - size, x + size, z - size, z + size),
      y - size,
      y + size,
      css,
      gain
    );
  // A faceted body through `rings` (each a closed loop of Vector3s).
  const body = (rings, color, options = {}) =>
    add(
      skin(THREE, rings, { start: 'flat', end: 'flat', uv: true, ...options }),
      color
    );
  // The eight-sided cross-section of a station at its x.
  const section = (s) => [
    V(s.x, s.yb, -s.kw),
    V(s.x, s.yl, -s.hw),
    V(s.x, s.yh, -s.hw),
    V(s.x, s.yt, -s.tw),
    V(s.x, s.yt, s.tw),
    V(s.x, s.yh, s.hw),
    V(s.x, s.yl, s.hw),
    V(s.x, s.yb, s.kw),
  ];

  // --- The hull and the prow ---------------------------------------------------
  body(HULL.map(section), T.dark);
  body(UPPER_JAW.map(section), T.hull);
  body(LOWER_JAW.map(section), T.hull);
  body(BROW.map(section), T.hull);
  // A keel ridge under the middle of the hull.
  body(
    [-32, -10, 18].map((x) => {
      const y = along(HULL, x, 'yb');
      return section({
        x,
        hw: 1.6,
        kw: 0.8,
        tw: 2.4,
        yb: y - 1.5,
        yl: y - 0.7,
        yh: y,
        yt: y + 0.5,
      });
    }),
    T.hull
  );
  part(
    [
      [31, -5.6],
      [47, -2.4],
      [47, 2.4],
      [31, 5.6],
    ],
    -1.95,
    -0.35,
    T.soot,
    0.04
  );
  // Lights deep in the maw, and the bow's sensor slit and shoulder lamps.
  [-1.6, -0.5, 0.7, 1.7].forEach((z, i) =>
    lamp(40 - i * 1.3, -1.15, z, i % 2 ? '#ffc77a' : '#7fe9f2', 1.1, 0.12)
  );
  glow('windows', rect(51.3, 51.4, -0.5, 0.5), 0.55, 0.75, '#7fe9f2', 1.2);
  [1.9, -1.9].forEach((z) => lamp(49.6, -1.0, z, '#62e6f0'));

  // --- Sloped armour on the shoulders (and some on the bilges) ---------------
  // A plate on a station run's slope between chine `from` and edge `to`
  // (keys of the station), covering t0..t1 of it, `h` thick.
  const slopePlate = (stations, x0, x1, side, from, to, t0, t1, h, color) => {
    const ring = (x) => {
      const s = at(stations, x);
      const [ya, za] = [s[from[0]], s[from[1]]];
      const [yb, zb] = [s[to[0]], s[to[1]]];
      const [dy, dz] = [yb - ya, zb - za];
      const len = Math.hypot(dy, dz) || 1;
      // Outward: away from the hull's middle (y≈0) and its centre line.
      let [ny, nz] = [-dz / len, dy / len];
      if (nz < 0) [ny, nz] = [-ny, -nz];
      const p = (t, o) =>
        V(x, lerp(ya, yb, t) + ny * o, (lerp(za, zb, t) + nz * o) * side);
      return [p(t0, 0), p(t1, 0), p(t1, h), p(t0, h)];
    };
    body([ring(x0), ring(x1)], color);
  };
  [1, -1].forEach((side) => {
    for (let x = -40; x < 31; ) {
      const len = 3 + random() * 5;
      const x1 = Math.min(32, x + len);
      // The neck carries racks, not armour.
      if (x1 > NECK[0] - 6 && x < NECK[1] + 6) {
        x = NECK[1] + 6;
        continue;
      }
      const t0 = random() * 0.15;
      const t1 = 0.55 + random() * 0.4;
      const color = plateTone();
      slopePlate(
        HULL,
        x,
        x1,
        side,
        ['yh', 'hw'],
        ['yt', 'tw'],
        t0,
        t1,
        0.22,
        color
      );
      if (random() < 0.5) {
        slopePlate(
          HULL,
          x,
          x1,
          side,
          ['yl', 'hw'],
          ['yb', 'kw'],
          0.05,
          0.5,
          0.18,
          T.hull
        );
      }
      x = x1 + 0.35 + random() * 0.6;
    }
    // The jaws' cheek armour.
    slopePlate(
      UPPER_JAW,
      33.5,
      45,
      side,
      ['yh', 'hw'],
      ['yt', 'tw'],
      0.05,
      0.8,
      0.2,
      T.light
    );
    slopePlate(
      LOWER_JAW,
      33.5,
      44,
      side,
      ['yl', 'hw'],
      ['yb', 'kw'],
      0.05,
      0.7,
      0.2,
      T.light
    );
  });

  // --- Flank armour, cargo in the gaps, a torn stretch to the ribs ------------
  [1, -1].forEach((side) => {
    for (let x = -41; x < 32; ) {
      if (x >= NECK[0] - 6.5 && x < NECK[1] + 6.5) {
        x = NECK[1] + 6.5;
        continue;
      }
      const len = 2.6 + random() * 3.2;
      const x1 = Math.min(x < NECK[0] ? NECK[0] - 6.5 : 33, x + len);
      const s0 = at(HULL, x);
      const s1 = at(HULL, x1);
      const torn = side < 0 && x1 > 17 && x < 23;
      const y0 = Math.max(s0.yl, s1.yl) + 0.25;
      const y1 = Math.min(s0.yh, s1.yh) - 0.2;
      const outline = (o0, o1) => [
        [x, (s0.hw + o0) * side],
        [x1, (s1.hw + o0) * side],
        [x1, (s1.hw + o1) * side],
        [x, (s0.hw + o1) * side],
      ];
      if (torn) {
        for (let r = x + 0.3; r < x1; r += 0.9) {
          part(
            rect(r, r + 0.22, (s0.hw - 0.1) * side, (s0.hw + 0.25) * side),
            y0,
            y1,
            T.soot,
            0.02
          );
        }
      } else {
        part(outline(-0.05, 0.32), y0, y1, plateTone(), 0.07);
        // A seam band and a clamp across the plate.
        part(
          outline(0.3, 0.38),
          lerp(y0, y1, 0.62),
          lerp(y0, y1, 0.68),
          T.dark,
          0.01
        );
      }
      const gap = 0.9 + random() * 1.6;
      const g1 = Math.min(33.5, x1 + gap);
      if (!torn && gap > 1.6) {
        // Container ends stacked in the gap.
        const sg = at(HULL, x1 + gap / 2);
        for (let y = y0 + 0.15; y + 1.4 < y1; y += 1.55) {
          if (random() < 0.2) continue;
          const color = cargo[Math.floor(random() * cargo.length)];
          part(
            rect(
              x1 + 0.15,
              g1 - 0.15,
              (sg.hw - 0.05) * side,
              (sg.hw + 0.12) * side
            ),
            y,
            y + 1.4,
            color,
            0.04
          );
        }
      }
      x = g1;
    }
  });

  // A faded company stripe along the forward and stern flanks.
  const stripe = colorOf(THREE, '#5e2219');
  [
    [15, 29],
    [-42, -30],
  ].forEach(([x0, x1]) =>
    [1, -1].forEach((side) => {
      const [s0, s1] = [at(HULL, x0), at(HULL, x1)];
      const y = Math.min(s0.yh, s1.yh) - 0.75;
      const z = (s, o) => (s.hw + o) * side;
      part(
        [
          [x0, z(s0, 0.34)],
          [x1, z(s1, 0.34)],
          [x1, z(s1, 0.4)],
          [x0, z(s0, 0.4)],
        ],
        y,
        y + 0.4,
        stripe,
        0.01
      );
    })
  );

  // --- The cargo neck: containers racked along it in squared gantries --------
  for (let x = -20.7; x < 6; x += 4.2) {
    [1, -1].forEach((side) =>
      [
        [-4.4, -2.1],
        [-1.9, 0.4],
        [0.6, 2.9],
      ].forEach(([y0, y1]) => {
        if (random() < 0.18) return;
        const color = cargo[Math.floor(random() * cargo.length)];
        part(rect(x, x + 3.6, 5.5 * side, 8.1 * side), y0, y1, color, 0.1);
        part(
          rect(x + 3.55, x + 3.65, 5.7 * side, 7.9 * side),
          y0 + 0.2,
          y1 - 0.2,
          T.dark,
          0.02
        );
      })
    );
  }
  for (let x = -21; x <= 8; x += 4.2) {
    const [x0, x1] = [x - 0.25, x + 0.25];
    part(rect(x0, x1, -8.8, 8.8), 3.4, 4.0, T.light, 0.06);
    part(rect(x0, x1, -8.8, 8.8), -5.2, -4.6, T.hull, 0.06);
    [1, -1].forEach((side) =>
      part(rect(x0, x1, 8.2 * side, 8.8 * side), -5.2, 4.0, T.hull, 0.06)
    );
    lamp(x, 4.15, 0, '#62e6f0', GLOW.running * 0.7, 0.1);
  }

  // --- Deck: hatches and raised plates ----------------------------------------
  const deckY = (x) => along(HULL, x, 'yt');
  for (let i = 0; i < 90; i += 1) {
    const x = -24 + random() * 54;
    const tw = along(HULL, x, 'tw') - 0.3;
    const w = 0.5 + random() * 2.4;
    const d = 0.3 + random() * 1.4;
    const z =
      (1.7 + random() * Math.max(0.2, tw - 1.7 - d)) *
      (random() < 0.5 ? 1 : -1);
    const y = Math.min(deckY(x), deckY(x + w));
    const roll = random();
    const color = roll < 0.2 ? T.soot : roll < 0.65 ? T.hull : T.pale;
    part(
      rect(x, x + w, z, z + d * Math.sign(z)),
      y,
      y + (color === T.soot ? 0.04 : 0.16),
      color,
      0.03
    );
  }

  // --- Ventral hangar and its launch rail --------------------------------------
  part(rect(-13, 4, -3.8, 3.8), -7.8, -4.9, T.hull, 0.16);
  part(rect(3.95, 4.1, -2.9, 2.9), -7.4, -6.3, T.soot, 0.02);
  for (let z = -2.6; z <= 2.6; z += 0.65)
    lamp(4.12, -6.2, z, '#62e6f0', 1.4, 0.07);
  glow('windows', rect(4.1, 4.15, -2.6, 2.6), -7.25, -6.45, '#1f6f78', 0.6);
  part(rect(4, 15, -0.5, 0.5), -7.5, -7.2, T.steel, 0.04);
  [7, 10, 13].forEach((x) => lamp(x, -7.6, 0, '#62e6f0', GLOW.running, 0.09));

  // --- Stern: reactor, bridge tower, radiators ----------------------------------
  part(rect(-43.5, -37.5, -3.6, 3.6), 5.6, 8.0, T.dark, 0.12);
  for (let x = -43.1; x < -37.8; x += 1.1) {
    part(rect(x, x + 0.4, -3.2, 3.2), 8.0, 8.8, T.steel, 0.04);
  }
  [1, -1].forEach((side) =>
    [
      [6.2, 6.45, 1],
      [7.1, 7.25, 0.55],
    ].forEach(([y0, y1, gain]) =>
      glow(
        'reactor',
        rect(-43.1, -37.9, 3.6 * side, 3.68 * side),
        y0,
        y1,
        '#ffb347',
        GLOW.reactor * gain
      )
    )
  );
  // The tower: chamfered rings rising, the bridge overhanging forward.
  const level = (y, x0, x1, hz, c = 0.6) => [
    V(x0, y, -hz + c),
    V(x0 + c, y, -hz),
    V(x1 - c, y, -hz),
    V(x1, y, -hz + c),
    V(x1, y, hz - c),
    V(x1 - c, y, hz),
    V(x0 + c, y, hz),
    V(x0, y, hz - c),
  ];
  body(
    [
      level(5.4, -37, -25.5, 3.4, 0.9),
      level(8.6, -35.8, -27.2, 2.5),
      level(9.0, -35.6, -24.6, 3.1),
      level(10.5, -35.2, -24.4, 3.2),
      level(11.3, -34.2, -25.6, 2.4),
    ],
    T.hull
  );
  for (let z = -2.5; z < 2.5; z += 0.55) {
    if (random() < 0.3) continue;
    glow(
      'windows',
      rect(-24.45, -24.3, z, z + 0.4),
      9.55,
      9.85,
      random() < 0.75 ? '#9ff3f8' : '#ffc77a',
      GLOW.window
    );
  }
  [1, -1].forEach((side) => {
    for (let x = -34.5; x < -27.5; x += 0.7) {
      if (random() < 0.5) continue;
      glow(
        'windows',
        rect(x, x + 0.45, 2.75 * side, 2.85 * side),
        7.4,
        7.6,
        random() < 0.7 ? '#9ff3f8' : '#ffc77a',
        GLOW.window * 0.8
      );
    }
  });
  part(rect(-31.2, -30.9, -0.15, 0.15), 11.3, 15.2, T.steel, 0.03);
  part(rect(-29.4, -29.2, 1.0, 1.2), 11.3, 13.2, T.steel, 0.03);
  part(rect(-32, -30.1, -0.08, 0.08), 13.6, 13.8, T.steel, 0.02);
  lamp(-31.05, 15.4, 0, '#ff5a3c', GLOW.running, 0.16);
  // Radiators folded down along the stern flanks, ribbed.
  [1, -1].forEach((side) => {
    const s = at(HULL, -36);
    const panel = (y0, z0, y1, z1, color, h = 0.16) => {
      const ring = (x) => {
        const [dy, dz] = [y1 - y0, z1 - z0];
        const len = Math.hypot(dy, dz);
        const [ny, nz] = [dz / len, -dy / len];
        return [
          V(x, y0, z0 * side),
          V(x, y1, z1 * side),
          V(x, y1 + ny * h, (z1 + nz * h) * side),
          V(x, y0 + ny * h, (z0 + nz * h) * side),
        ];
      };
      return [ring, color];
    };
    const [ring, color] = panel(
      s.yh - 0.3,
      s.hw + 0.2,
      s.yl + 0.4,
      s.hw + 5.2,
      T.light
    );
    body([ring(-41), ring(-31)], color);
    for (let x = -40.6; x < -31.2; x += 1.15) {
      const [rib] = panel(
        s.yh - 0.5,
        s.hw + 0.5,
        s.yl + 0.55,
        s.hw + 5.0,
        T.dark,
        0.3
      );
      body([rib(x), rib(x + 0.25)], T.dark);
    }
    lamp(
      -36,
      s.yl + 0.3,
      (s.hw + 5.4) * side,
      '#ffb347',
      GLOW.running * 0.6,
      0.13
    );
  });

  // --- Engines: a block and four square bells, the upper port one dead --------
  const stern = HULL[0];
  body(
    [
      section(stern),
      section({
        ...stern,
        x: -48,
        hw: 9.0,
        kw: 5.4,
        tw: 6.4,
        yb: -8.0,
        yl: -3.6,
        yh: 3.0,
        yt: 7.0,
      }),
    ],
    T.dark
  );
  // A dorsal fin over the engines.
  const fin = (x, y0, y1, w) => [
    V(x, y0, -w),
    V(x, y1, -w * 0.7),
    V(x, y1, w * 0.7),
    V(x, y0, w),
  ];
  body(
    [
      fin(-47.5, 6.8, 11.6, 0.4),
      fin(-42, 6.2, 9.6, 0.35),
      fin(-35, 5.6, 6.2, 0.3),
    ],
    T.hull
  );
  lamp(-47.4, 11.8, 0, '#ff5a3c', GLOW.running, 0.16);
  const square = (x, yc, zc, h) => [
    V(x, yc - h, zc - h),
    V(x, yc + h, zc - h),
    V(x, yc + h, zc + h),
    V(x, yc - h, zc + h),
  ];
  [3.9, -3.9].forEach((zc) =>
    [-4.0, 1.4].forEach((yc) => {
      body([square(-47.8, yc, zc, 2.2), square(-52.8, yc, zc, 2.6)], T.steel, {
        end: undefined,
      });
      body([square(-48, yc, zc, 1.9), square(-52.9, yc, zc, 2.3)], T.soot, {
        end: undefined,
        flip: true,
        orient: false,
      });
      const dead = zc > 0 && yc > 0;
      const plate = rect(-49.8, -49.7, zc - 1.85, zc + 1.85);
      if (dead) part(plate, yc - 1.85, yc + 1.85, T.soot, 0);
      else glow('engines', plate, yc - 1.85, yc + 1.85, '#5fd8ff', GLOW.engine);
    })
  );
  [8.2, -8.2].forEach((z) => lamp(-48.2, 6.4, z, '#ffb347'));

  // --- Materials and meshes ------------------------------------------------------
  const maps = bakeHullMaps(THREE, SEED);
  Object.values(maps).forEach((map) => map.repeat.set(PANEL_TILE, PANEL_TILE));
  const hullMaterial = addRimLight(
    shiny(
      new THREE.MeshStandardMaterial({
        ...SHINE.paint,
        flatShading: true,
        vertexColors: true,
      })
    )
  );
  Object.assign(hullMaterial, maps, {
    normalScale: new THREE.Vector2(0.8, 0.8),
    aoMapIntensity: 0.8,
  });
  const hullGeometry = mergeStatic(
    THREE,
    hull.map((p) => ({ ...p, flat: true }))
  );
  hullGeometry.setAttribute('uv2', hullGeometry.getAttribute('uv'));
  const group = new THREE.Group();
  group.name = 'wake';
  group.add(new THREE.Mesh(hullGeometry, hullMaterial));
  const glowMesh = (parts) => {
    const mesh = new THREE.Mesh(
      mergeStatic(THREE, parts),
      new THREE.MeshBasicMaterial({ vertexColors: true })
    );
    group.add(mesh);
    return mesh;
  };
  const meshes = {
    windows: glowMesh(lights.windows),
    reactor: glowMesh(lights.reactor),
    engines: glowMesh(lights.engines),
  };
  group.scale.setScalar(WAKE_LENGTH / 100);
  return { group, ...meshes };
}
