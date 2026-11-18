// src/modules/render3d/travel/wakeHull.js
//
// What the Wake's sections share (wake.js, wakeCargo.js, wakeStern.js): the
// concept's palette, the hull's eight-sided stations and their flat faces,
// and the company mark.

// The concept's palette (sRGB).
export const WAKE_COLORS = Object.freeze({
  light: '#a6a9aa',
  grey: '#83878b',
  mid: '#5f6368',
  dark: '#44474c',
  soot: '#17191c',
  orange: '#d9591b',
  yellow: '#dfa53a',
  steel: '#7d8187',
  white: '#e6e6e0',
  cargo: ['#2f63a3', '#a63b30', '#d6a13a', '#b59f7e', '#2f63a3', '#3f6f69'],
  amber: '#ffb347',
  flood: '#bfe3ff',
  glass: '#58c8ff',
  engine: '#4fb4ff',
  beacon: '#ff4a32',
});
export const STEEL = Object.freeze({ roughness: 0.45, metalness: 0.9 });

const lerp = (a, b, t) => a + (b - a) * t;

// A hull station: an eight-sided cross-section at x — half widths at the
// chines (hw), the deck (tw) and the keel (kw); heights of the deck (yt),
// the upper and lower chines (yh, yl) and the keel (yb).
export const octagon = (V, s) => [
  V(s.x, s.yb, -s.kw),
  V(s.x, s.yl, -s.hw),
  V(s.x, s.yh, -s.hw),
  V(s.x, s.yt, -s.tw),
  V(s.x, s.yt, s.tw),
  V(s.x, s.yh, s.hw),
  V(s.x, s.yl, s.hw),
  V(s.x, s.yb, s.kw),
];
// The station `base` shrunk by k about the axis and raised by `lift` at x:
// its faces to `base` stay flat.
export const shrunk = (base, x, k, lift) => ({
  x,
  hw: base.hw * k,
  tw: base.tw * k,
  kw: base.kw * k,
  yt: base.yt * k + lift,
  yh: base.yh * k + lift,
  yl: base.yl * k + lift,
  yb: base.yb * k + lift,
});
// The flat faces between two stations, on the +z side: [y key, z key] of
// each edge (z key 0: the centre line).
const FACETS = {
  deck: [
    ['yt', 0],
    ['yt', 'tw'],
  ],
  shoulder: [
    ['yt', 'tw'],
    ['yh', 'hw'],
  ],
  side: [
    ['yh', 'hw'],
    ['yl', 'hw'],
  ],
  bilge: [
    ['yl', 'hw'],
    ['yb', 'kw'],
  ],
  keel: [
    ['yb', 'kw'],
    ['yb', 0],
  ],
};
/** A facet's points: at(fx, ft), 0..1 from station a to b and across. */
export function facet(V, a, b, name) {
  const [[y0, z0], [y1, z1]] = FACETS[name];
  const z = (s, key) => (key ? s[key] : 0);
  return (fx, ft) =>
    V(
      lerp(a.x, b.x, fx),
      lerp(lerp(a[y0], b[y0], fx), lerp(a[y1], b[y1], fx), ft),
      lerp(lerp(z(a, z0), z(b, z0), fx), lerp(z(a, z1), z(b, z1), fx), ft)
    );
}

// The mark's letters in a unit-high box ([outline, holes], their width).
const LETTERS = {
  W: [
    [
      [0, 1],
      [0.22, 1],
      [0.33, 0.36],
      [0.45, 1],
      [0.62, 1],
      [0.74, 0.36],
      [0.85, 1],
      [1.07, 1],
      [0.86, 0],
      [0.63, 0],
      [0.535, 0.52],
      [0.44, 0],
      [0.21, 0],
    ],
    [],
    1.07,
  ],
  A: [
    [
      [0, 0],
      [0.24, 0],
      [0.31, 0.2],
      [0.69, 0.2],
      [0.76, 0],
      [1, 0],
      [0.63, 1],
      [0.37, 1],
    ],
    [
      [
        [0.38, 0.4],
        [0.62, 0.4],
        [0.5, 0.74],
      ],
    ],
    1,
  ],
  K: [
    [
      [0, 0],
      [0.25, 0],
      [0.25, 0.38],
      [0.55, 0],
      [0.85, 0],
      [0.42, 0.52],
      [0.82, 1],
      [0.52, 1],
      [0.25, 0.64],
      [0.25, 1],
      [0, 1],
    ],
    [],
    0.85,
  ],
  E: [
    [
      [0, 0],
      [0.7, 0],
      [0.7, 0.2],
      [0.25, 0.2],
      [0.25, 0.4],
      [0.6, 0.4],
      [0.6, 0.6],
      [0.25, 0.6],
      [0.25, 0.8],
      [0.7, 0.8],
      [0.7, 1],
      [0, 1],
    ],
    [],
    0.7,
  ],
};
const SLANT = 0.22;

/**
 * The company mark painted on a flat side: three slanted bars and, with
 * `word`, WAKE after them. `origin` is its lower corner at the reader's
 * left, `side` (±1) the flank it is on (it reads from the outside),
 * `height` the letters' height.
 */
export function wakeMark(kit, origin, side, height, word = true) {
  const { V, add, prism, paint } = kit;
  const white = paint(WAKE_COLORS.white);
  const [u, v] = [V(side, 0, 0), V(0, 1, 0)];
  const at = (shape, x0) =>
    shape.map(([x, y]) => [(x0 + x + y * SLANT) * height, y * height]);
  const put = (outline, holes, x0) =>
    add(
      'hull',
      prism(
        origin,
        u,
        v,
        at(outline, x0),
        0.04,
        holes.map((hole) => at(hole, x0))
      ),
      white
    );
  // Three bars, each a step shorter.
  [0, 0.42, 0.84].forEach((x0, i) => {
    const top = 1.25 - i * 0.28;
    put(
      [
        [0, -0.15],
        [0.3, -0.15],
        [0.3, top],
        [0, top],
      ],
      [],
      x0
    );
  });
  if (!word) return;
  let x0 = 1.75;
  [...'WAKE'].forEach((letter) => {
    const [outline, holes, width] = LETTERS[letter];
    put(outline, holes, x0);
    x0 += width + 0.16;
  });
}
