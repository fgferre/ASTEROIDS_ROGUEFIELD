// src/modules/render3d/travel/wakeBow.js
//
// The Wake's bow (wake.js): the faceted forward block in worn grey, layered
// plates between a raised upper belt and a heavy lower belt of amber lamps,
// the WAKE mark on both flanks; the nose drawn in to a charcoal armour cap
// with a black recessed face of amber slits over a jutting chin; a dark
// lower hull with a keel module, fins and pods; and a working deck with the
// forward house, winches, hatches, bollards and a mast.

import { pairs } from '../enemies/shapes.js';
import { fittings } from './wakeDetail.js';
import {
  STEEL,
  WAKE_COLORS as C,
  facet,
  octagon,
  shrunk,
  wakeMark,
} from './wakeHull.js';

// Darker than the palette's dark: the nose's armour and the lower hull.
const CHAR = '#2f3236';

// The bow block: a long flat-sided run, then the nose drawn in, its deck
// sloping down and its keel rising to the chin.
const BOW_BASE = {
  x: 20,
  hw: 8.2,
  tw: 5.2,
  kw: 4.4,
  yt: 6.2,
  yh: 3.2,
  yl: -2.8,
  yb: -6.4,
};
const BOW = [
  BOW_BASE,
  { ...BOW_BASE, x: 38 },
  shrunk(BOW_BASE, 44.5, 0.86, 0.25),
  shrunk(BOW_BASE, 48.2, 0.64, 0.9),
];
// The nose cap's front, where the face's frame stands.
const NOSE = 50.4;

// A station scaled by k about the height cy, moved to x.
const scaled = (s, x, k, cy) => ({
  x,
  hw: s.hw * k,
  tw: s.tw * k,
  kw: s.kw * k,
  yt: cy + (s.yt - cy) * k,
  yh: cy + (s.yh - cy) * k,
  yl: cy + (s.yl - cy) * k,
  yb: cy + (s.yb - cy) * k,
});
// A side facet with ft running up from the lower chine.
const flank = (V, s0, s1) => {
  const at = facet(V, s0, s1, 'side');
  return (fx, ft) => at(fx, 1 - ft);
};
// A station seen from ahead ([[z, y], …]), for kit.cross.
const outline = (s) =>
  pairs([
    -s.kw,
    s.yb,
    -s.hw,
    s.yl,
    -s.hw,
    s.yh,
    -s.tw,
    s.yt,
    s.tw,
    s.yt,
    s.hw,
    s.yh,
    s.hw,
    s.yl,
    s.kw,
    s.yb,
  ]);
// The keel module's section ([[z, y], …]) and its collars.
const KEEL = pairs([
  -3.6, -6.2, -3.8, -6.9, -3, -7.6, 3, -7.6, 3.8, -6.9, 3.6, -6.2,
]);

export function buildBow(kit) {
  const { V, add, box, body, tube, lamp, paint, random } = kit;
  add('hull', body(BOW.map((s) => octagon(V, s))), paint(C.dark));
  const greys = [C.light, C.light, C.grey, C.light];
  const M = { mirror: true };
  const t = {
    grey: () => paint(greys[Math.floor(random() * greys.length)]),
    thick: () => 0.14 + random() * 0.1,
    // A painted box, a lit box, a rod, a lamp.
    B: (x0, x1, y0, y1, z0, z1, css, o) =>
      add('hull', box(x0, x1, y0, y1, z0, z1), paint(css), o),
    G: (set, x0, x1, y0, y1, z0, z1, css, gain, o) =>
      add(set, box(x0, x1, y0, y1, z0, z1), paint(css, gain), {
        uv: false,
        ...o,
      }),
    R: (p, q, r, css, sides = 6, o) =>
      add('hull', tube(p, q, r, sides), paint(css), o),
    L: (set, p, n, css, size = 0.12, spill = 0.8) =>
      lamp(set, p, n, css, { size, spill }),
    M,
  };
  buildFlank(kit, t);
  buildNose(kit, t);
  buildBelly(kit, t);
  buildDeck(kit, t);
}

// Small things with their own height off a facet (fittings sit at the
// plating; these stand on plates already laid there).
function onPlates(kit, f) {
  const { paint, random } = kit;
  const at = (fx, ft, w, h, lift, thick, css, set) =>
    f.patch(fx, ft, w, h, lift, thick, css, set);
  // A louvred vent: a black well with slats.
  const vent = (fx, ft, w, h, lift) => {
    at(fx, ft, w, h, lift, 0.12, paint(C.soot));
    const n = Math.max(2, Math.floor(h / 0.17));
    for (let k = 0; k < n; k += 1) {
      const y = ft + ((k + 0.5) / n - 0.5) * ((h - 0.1) / f.height);
      at(fx, y, w - 0.12, (h / n) * 0.5, lift + 0.12, 0.04, paint(C.mid));
    }
  };
  // A cluster of small windows on a black frame.
  const glass = (fx, ft, n, lift, lit = 0.8) => {
    at(fx, ft, n * 0.5 + 0.18, 0.4, lift, 0.12, paint(C.soot));
    for (let k = 0; k < n; k += 1) {
      if (random() > lit) continue;
      const x = fx + (((k + 0.5) / n - 0.5) * n * 0.5) / f.length;
      const css = random() < 0.55 ? C.glass : C.amber;
      at(
        x,
        ft,
        0.34,
        0.2,
        lift + 0.12,
        0.025,
        paint(css, 1 + random() * 0.5),
        'windows'
      );
    }
  };
  // An access hatch: a frame, a lid, a handle.
  const hatch = (fx, ft, w, h, lift) => {
    at(fx, ft, w, h, lift, 0.1, paint(C.mid));
    at(fx, ft, w - 0.2, h - 0.2, lift + 0.1, 0.05, paint(C.light));
    at(fx, ft, 0.3, 0.08, lift + 0.15, 0.06, paint(C.dark));
  };
  // A thin dark trim line from fx0 to fx1.
  const trim = (fx0, fx1, ft, lift, h = 0.06) =>
    at(
      (fx0 + fx1) / 2,
      ft,
      (fx1 - fx0) * f.length,
      h,
      lift,
      0.05,
      paint(C.soot)
    );
  return { vent, glass, hatch, trim };
}

// --- The flank: plates in layers between the two belts -----------------------
function buildFlank(kit, { grey, thick, G, L }) {
  const { V, armour, cuts, paint, random } = kit;
  const [a, b, c, d] = BOW;
  const side = flank(V, a, b);
  // The base plates: an orange band aft, then the mark's long clean plate.
  armour('hull', side, [0, 0.022, 0.145, 0.975, 1], [0.1, 0.93], (i) => ({
    color: paint(i === 1 ? C.orange : i === 2 ? C.grey : C.mid),
    thick: i === 2 ? 0.2 : 0.16,
    cut: i === 1 ? [0, 0.3] : null,
  }));
  // Plates over plates above the mark and below it.
  const upper = [0.15, 0.27, 0.4, 0.47, 0.6, 0.74, 0.8, 0.975];
  armour('hull', side, upper, [0.8, 0.925], (i) =>
    i === 2 || i === 5
      ? { skip: true }
      : {
          color: i === 3 ? paint(C.grey) : grey(),
          thick: 0.12,
          lift: 0.2,
          cut: i % 2 ? [1, 0.35] : i === 6 ? [2, 0.5] : null,
        }
  );
  const lower = [0.15, 0.3, 0.38, 0.55, 0.63, 0.8, 0.9, 0.975];
  armour('hull', side, lower, [0.105, 0.235], (i) =>
    i === 1 || i === 4
      ? { skip: true }
      : {
          color: paint(i % 3 === 0 ? C.mid : C.grey),
          thick: 0.12,
          lift: 0.2,
          cut: i === 2 ? [3, 0.4] : null,
        }
  );
  // The orange band's own overlay, worn, with a cut corner.
  armour('hull', side, [0.03, 0.14], [0.35, 0.7], () => ({
    color: paint(C.orange),
    thick: 0.12,
    lift: 0.16,
    cut: [1, 0.4],
  }));
  const P = onPlates(kit, fittings(kit, side));
  P.glass(0.435, 0.865, 2, 0.2);
  P.glass(0.77, 0.865, 2, 0.2);
  P.glass(0.085, 0.86, 3, 0.28);
  P.vent(0.34, 0.17, 1.1, 0.55, 0.2);
  P.vent(0.59, 0.17, 1.1, 0.55, 0.2);
  P.vent(0.085, 0.2, 1.4, 0.6, 0.28);
  P.hatch(0.2, 0.86, 1.0, 0.55, 0.32);
  P.hatch(0.87, 0.17, 1.0, 0.55, 0.32);
  P.trim(0.15, 0.975, 0.79, 0.2);
  P.trim(0.15, 0.975, 0.245, 0.2);
  P.trim(0.145, 0.975, 0.935, 0.16, 0.05);

  // The belts: a raised upper belt along the chine (orange on the nose), a
  // heavy lower belt that carries the amber lamps.
  [
    [a, b, 6],
    [b, c, 2],
    [c, d, 1],
  ].forEach(([s0, s1, n], k) => {
    const at = flank(V, s0, s1);
    const xs = n > 1 ? cuts(n, 0.4) : [0, 1];
    armour('hull', at, xs, [0.93, 1], (i) => ({
      color: paint(k || i === 0 ? C.orange : C.mid),
      thick: 0.5,
      cut: k === 2 ? [2, 0.4] : null,
    }));
    armour('hull', at, xs, [0, 0.1], (i) => ({
      color: paint(i % 2 ? C.dark : CHAR),
      thick: 0.6,
      cut: k === 2 ? [1, 0.5] : null,
    }));
  });
  // The lower belt's lamps, and a light rail along its face.
  [1, -1].forEach((s) => {
    for (let x = 21.4; x < 44; x += 2.25) {
      const f = Math.min(1, Math.max(0, (x - b.x) / (c.x - b.x)));
      const hw = b.hw + (c.hw - b.hw) * f;
      const yl = b.yl + (c.yl - b.yl) * f;
      L(
        'lamps',
        V(x, yl + 0.28, (hw + 0.6) * s),
        V(0, 0, s),
        C.amber,
        0.13,
        1.1
      );
    }
    const z = (a.hw + 0.6) * s;
    G(
      'lamps',
      21,
      37.6,
      a.yl + 0.5,
      a.yl + 0.54,
      z - 0.02,
      z + 0.02,
      C.amber,
      1.4
    );
  });

  // The shoulder: a raised step, a deep pipe trench, plates beyond.
  const shoulder = facet(V, a, b, 'shoulder');
  armour(
    'hull',
    shoulder,
    cuts(6, 0.5),
    (i) => (i % 2 ? [0, 0.42, 0.56, 1] : [0, 0.42, 0.56, 0.8, 1]),
    (i, j) => ({
      skip: j === 1,
      color:
        i === 0 && j > 1
          ? paint(C.orange)
          : j === 0
            ? paint(i === 3 ? C.mid : C.grey)
            : grey(),
      thick: j === 0 ? 0.36 : thick() + 0.06,
      cut: i === 5 && j === 0 ? [1, 0.35] : null,
    })
  );
  const onShoulder = fittings(kit, shoulder);
  onShoulder.pipes(0.02, 0.98, 0.49, 3);
  onShoulder.patch(0.5, 0.49, onShoulder.length, 0.5, 0, 0.04, paint(C.soot));
  const SP = onPlates(kit, onShoulder);
  for (let k = 0; k < 6; k += 1) {
    const fx = 0.08 + k * 0.165 + random() * 0.03;
    if (k % 2) SP.vent(fx, 0.72, 1.2, 0.5, 0.24);
    else SP.hatch(fx, 0.72, 1.1, 0.6, 0.24);
  }
  [0.18, 0.5, 0.82].forEach((fx) => SP.glass(fx, 0.2, 3, 0.36, 0.7));

  // The nose's flank: a cheek plate over the base, small windows.
  const cheek = flank(V, b, c);
  armour('hull', cheek, [0, 0.55, 1], [0.1, 0.93], (i) => ({
    color: i ? paint(C.grey) : grey(),
    thick: 0.18,
    cut: i ? [2, 0.3] : null,
  }));
  armour('hull', cheek, [0.08, 0.86], [0.3, 0.78], () => ({
    color: paint(C.light),
    thick: 0.2,
    lift: 0.18,
    cut: [2, 0.4],
  }));
  const CP = onPlates(kit, fittings(kit, cheek));
  CP.glass(0.4, 0.86, 3, 0.18);
  CP.vent(0.3, 0.2, 1.4, 0.5, 0.18);
  CP.trim(0.06, 0.9, 0.27, 0.18);
  const front = flank(V, c, d);
  armour('hull', front, [0, 1], [0.1, 0.93], () => ({
    color: paint(CHAR),
    thick: 0.16,
  }));
  armour('hull', front, [0.08, 0.5, 0.92], [0.14, 0.5], (i) => ({
    color: paint(i ? C.dark : C.mid),
    thick: 0.12,
    lift: 0.16,
    cut: i ? [1, 0.45] : null,
  }));
  const FP = onPlates(kit, fittings(kit, front));
  FP.glass(0.5, 0.66, 4, 0.16, 0.9);
  FP.vent(0.28, 0.32, 0.9, 0.5, 0.28);
  FP.trim(0.04, 0.96, 0.55, 0.16);

  // The mark on both flanks.
  [1, -1].forEach((s) =>
    wakeMark(kit, V(s > 0 ? 23.2 : 36.9, -0.95, (a.hw + 0.2) * s), s, 2.3)
  );
}

// --- The nose: the charcoal cap, the black face, the chin --------------------
function buildNose(kit, { grey, B, G, L, M }) {
  const { V, add, body, cross, plate, profile, armour, paint } = kit;
  const [, b, c, d] = BOW;
  const plates = (s0, s1, name, xs, ts, style) =>
    armour('hull', facet(V, s0, s1, name), xs, ts, style);
  // The nose's upper facets: plates, then a dark visor of amber slits that
  // wraps over the forehead.
  plates(b, c, 'shoulder', [0, 0.45, 1], [0, 0.5, 1], (i, j) => ({
    color: i ? paint(j ? C.orange : C.dark) : j ? grey() : paint(C.grey),
    thick: 0.2,
    cut: i && j ? [2, 0.5] : null,
  }));
  plates(b, c, 'deck', [0, 0.5, 1], [0.3, 1], () => ({
    color: grey(),
    thick: 0.12,
  }));
  plates(c, d, 'shoulder', [0, 1], [0, 1], () => ({
    color: paint(CHAR),
    thick: 0.16,
  }));
  plates(c, d, 'deck', [0, 1], [0.3, 1], () => ({
    color: paint(C.dark),
    thick: 0.14,
  }));
  ['shoulder', 'deck'].forEach((name) => {
    const v = fittings(kit, facet(V, c, d, name));
    const deck = name === 'deck';
    const [ft, h] = deck ? [0.62, 0.7] : [0.5, 0.5];
    v.patch(0.55, ft, v.length * 0.75, v.height * h, 0.16, 0.1, paint(C.soot));
    [-0.12, 0.12].forEach((dt) =>
      v.patch(
        0.55,
        ft + dt * (deck ? 1.4 : 1),
        v.length * 0.65,
        0.07,
        0.26,
        0.02,
        paint(C.amber, 1.5),
        'windows'
      )
    );
  });
  [b, c].forEach((s0, k) =>
    ['bilge', 'keel'].forEach((name) =>
      plates(s0, k ? d : c, name, [0, 0.5, 1], [0, 1], () => ({
        color: paint(name === 'keel' || k ? CHAR : C.dark),
        thick: 0.16,
      }))
    )
  );

  // The cap: a charcoal collar proud of the hull, armoured, orange corners.
  const cy = (d.yt + d.yb) / 2;
  const g = scaled(d, 47.7, 1.07, cy);
  const f = scaled(d, NOSE - 0.5, 0.93, cy);
  add('hull', body([octagon(V, g), octagon(V, f)]), paint(CHAR));
  plates(g, f, 'side', [0, 0.5, 1], [0, 0.5, 1], (i, j) => ({
    color: paint(j ? CHAR : C.dark),
    thick: 0.14,
  }));
  plates(g, f, 'shoulder', [0, 1], [0, 1], () => ({
    color: paint(C.orange),
    thick: 0.2,
    cut: [2, 0.45],
  }));
  ['deck', 'bilge', 'keel'].forEach((name) =>
    plates(g, f, name, [0, 0.5, 1], [0, 1], () => ({
      color: paint(name === 'deck' ? C.dark : CHAR),
      thick: 0.14,
    }))
  );
  // The face's frame, and the black face set back in it.
  const rim = scaled(f, NOSE, 0.99, cy);
  const hole = scaled(f, NOSE, 0.76, cy);
  add(
    'hull',
    cross(outline(rim), NOSE - 0.6, NOSE, [outline(hole)]),
    paint(CHAR)
  );
  const face = scaled(f, NOSE, 0.78, cy);
  add('hull', cross(outline(face), NOSE - 0.65, NOSE - 0.4), paint(C.soot));
  const front = NOSE - 0.4;
  // Orange chamfered pieces on the frame's upper corners, dark on the lower.
  const toFace = V(NOSE - 3, cy, 0);
  [
    ['yt', 'tw', 'yh', 'hw', C.orange],
    ['yl', 'hw', 'yb', 'kw', C.dark],
  ].forEach(([y0, z0, y1, z1, css]) => {
    const corners = [
      V(NOSE, rim[y0], rim[z0]),
      V(NOSE, rim[y1], rim[z1]),
      V(NOSE, hole[y1], hole[z1]),
      V(NOSE, hole[y0], hole[z0]),
    ];
    add('hull', plate(corners, 0, 0.1, 0.03, toFace), paint(css), M);
  });
  // The slits: rows of amber light under dark louvres, a grille below.
  const top = face.yh - 0.25;
  const fw = face.hw - 0.3;
  for (let r = 0; r < 4; r += 1) {
    const y = top - r * 0.42;
    [-1, 0, 1].forEach((n) => {
      const z = n * 1.15;
      const gain = r === 0 ? 2 : 1.4;
      G(
        'windows',
        front,
        front + 0.04,
        y - 0.05,
        y + 0.05,
        z - 0.5,
        z + 0.5,
        C.amber,
        gain
      );
    });
    B(front, front + 0.12, y - 0.2, y - 0.14, -fw, fw, C.dark);
  }
  [-0.58, 0.58].forEach((z) =>
    B(
      front,
      front + 0.16,
      face.yb + 0.3,
      face.yt - 0.2,
      z - 0.07,
      z + 0.07,
      C.dark
    )
  );
  for (let y = face.yl + 0.2; y < top - 1.9; y += 0.26) {
    B(front, front + 0.1, y, y + 0.1, 0.6 - face.hw, face.hw - 0.6, C.mid);
  }
  [1, -1].forEach((s) => {
    const ahead = V(1, 0, 0);
    L(
      'lamps',
      V(front, face.yh - 0.05, (face.hw - 0.35) * s),
      ahead,
      C.amber,
      0.14
    );
    L(
      'lamps',
      V(NOSE, rim.yl + 0.1, (rim.hw - 0.25) * s),
      ahead,
      C.amber,
      0.12,
      0.6
    );
    L('lamps', V(NOSE + 0.04, -3.1, 2.3 * s), ahead, C.amber, 0.14, 0.7);
  });

  // The chin: a heavy jutting block under the face, a narrower jaw below,
  // orange chamfers on its front corners, a dark slot and side vents.
  const chin = [
    39.5,
    -6.8,
    46.5,
    -5.9,
    NOSE,
    -3.6,
    NOSE,
    -2.5,
    48.5,
    -2,
    44,
    -3.2,
    39.5,
    -4.8,
  ];
  add('hull', profile(pairs(chin), -3, 3), paint(CHAR));
  const jaw = [
    41,
    -7.15,
    46,
    -6.35,
    NOSE - 0.25,
    -4.1,
    NOSE - 0.25,
    -3.4,
    46,
    -5.6,
    41,
    -6.5,
  ];
  add('hull', profile(pairs(jaw), -2, 2), paint(C.dark));
  G('lamps', NOSE - 0.25, NOSE - 0.2, -3.8, -3.72, -1.6, 1.6, C.amber, 1.6);
  const chamfer = [NOSE - 1.1, -2.2, NOSE, -2.5, NOSE, -3.2, NOSE - 0.4, -3];
  add('hull', profile(pairs(chamfer), 3, 3.12), paint(C.orange), M);
  B(NOSE, NOSE + 0.04, -3.25, -2.95, -1.5, 1.5, C.soot);
  for (let k = 0; k < 4; k += 1) {
    const x = 41.6 + k * 1.05;
    B(x, x + 0.55, -5.6, -4.3, 3, 3.1, C.soot, M);
    B(x + 0.05, x + 0.5, -5.5, -4.4, 3.1, 3.14, C.mid, M);
  }
}

// --- The lower hull: dark ribbed bilge, keel module, fins, pods --------------
function buildBelly(kit, { B, L, R, M }) {
  const { V, add, body, cross, lathe, profile, armour, cuts, paint, random } =
    kit;
  const [a, b] = BOW;
  const bilge = facet(V, a, b, 'bilge');
  armour('hull', bilge, cuts(6, 0.5), [0, 0.45, 1], (i, j) => ({
    color: paint(j ? CHAR : i % 2 ? C.dark : C.mid),
    thick: j ? 0.2 : 0.16,
    skip: j === 1 && i % 3 === 1,
  }));
  armour('hull', facet(V, a, b, 'keel'), cuts(4, 0.4), [0, 0.7], () => ({
    color: paint(CHAR),
    thick: 0.2,
  }));
  // Frames across the bilge, hatches and vents between, its wash lights.
  const F = fittings(kit, bilge);
  for (let fx = 0.04; fx < 0.99; fx += 2.3 / F.length) {
    F.patch(fx, 0.5, 0.2, F.height - 0.2, 0, 0.42, paint(C.dark));
  }
  const P = onPlates(kit, F);
  [0.15, 0.4, 0.66, 0.9].forEach((fx, k) =>
    k % 2 ? P.vent(fx, 0.28, 1.2, 0.6, 0.18) : P.hatch(fx, 0.72, 1.1, 0.7, 0.2)
  );
  [0.1, 0.36, 0.62, 0.88].forEach((fx) =>
    F.light(fx, 0.12, 'floods', C.flood, {
      size: 0.12,
      gain: 2,
      spill: 2.6,
      spillGain: 0.3,
      lift: 0.45,
    })
  );
  // The nose's underside: frames, a vent, amber lamps.
  const N = fittings(kit, facet(V, b, BOW[2], 'bilge'));
  for (let fx = 0.1; fx < 0.95; fx += 1.7 / N.length) {
    N.patch(fx, 0.5, 0.2, N.height - 0.3, 0, 0.36, paint(C.dark));
  }
  onPlates(kit, N).vent(0.62, 0.45, 1.0, 0.9, 0.16);
  [0.3, 0.82].forEach((fx) =>
    N.light(fx, 0.2, 'lamps', C.amber, { size: 0.12, spill: 0.8, lift: 0.18 })
  );

  // The keel module: a long dark block hung under the run, its front rising
  // into the chin, collared every few metres.
  const section = (x, k = 1, dy = 0) =>
    KEEL.map(([z, y]) => V(x, y * (1 - (1 - k) * 0.12) + dy, z * k));
  const rings = [section(20.6, 0.85, 0.5), section(21.6), section(38.6)];
  add('hull', body([...rings, section(41, 0.75, 0.9)]), paint(CHAR));
  const collar = (k) => KEEL.map(([z, y]) => [z * k, -6.2 + (y + 6.2) * k]);
  for (let x = 22.4; x < 38.4; x += 2.6) {
    add(
      'hull',
      cross(collar(1.05), x, x + 0.35, [collar(0.98)]),
      paint(C.dark)
    );
  }
  // Rows of amber lamps along its lower edges, slots, plates underneath.
  [1, -1].forEach((s) => {
    for (let x = 23.7; x < 38; x += 2.6) {
      L('lamps', V(x, -7.28, 3.42 * s), V(0, -0.6, s), C.amber, 0.12, 0.9);
      B(x - 0.5, x + 0.5, -6.85, -6.35, 3.66 * s, 3.78 * s, C.soot);
    }
  });
  for (let x = 23.2; x < 38; x += 2.6) {
    B(x, x + 1.4, -7.68, -7.6, -1.9, 1.9, C.dark);
    if (random() < 0.5) B(x + 0.2, x + 1.2, -7.72, -7.68, -0.8, 0.8, C.mid);
  }
  // A docking port under it, ringed with lamps.
  B(29.6, 32.4, -7.75, -7.6, -1.4, 1.4, C.grey);
  B(30, 32, -7.8, -7.75, -1.0, 1.0, C.soot);
  [29.8, 32.2].forEach((x) =>
    [1.2, -1.2].forEach((z) =>
      L('lamps', V(x, -7.75, z), V(0, -1, 0), C.amber, 0.1, 0.6)
    )
  );
  // Sensor domes.
  const dome = pairs([0, 0, 0.6, 0, 0.56, 0.16, 0.4, 0.3, 0, 0.35]);
  [25.3, 35.6].forEach((x) =>
    add('hull', lathe(dome, 8, V(x, -7.6, 0), V(0, -1, 0)), paint(C.mid), {
      smooth: true,
    })
  );
  // Keel fins hung from the keel's corners, orange-tipped.
  const fin = pairs([29.5, -6.3, 37.6, -6.3, 36.4, -7.75, 32.6, -7.75]);
  add('hull', profile(fin, 4.25, 4.45), paint(C.dark), M);
  B(32.8, 36.3, -7.8, -7.7, 4.22, 4.48, C.orange, M);
  // Docking pods under the bilge, on pylons.
  const [x0, x1, y, z] = [25.5, 31.5, -5.15, 6.45];
  R(V(x0, y, z), V(x1, y, z), 0.55, C.dark, 8, M);
  const cone = pairs([0.55, 0, 0.4, 0.5, 0.12, 0.8, 0, 0.82]);
  add('hull', lathe(cone, 8, V(x1, y, z), V(1, 0, 0)), paint(C.mid), M);
  B(x0, x0 + 0.3, y - 0.6, y + 0.6, z - 0.6, z + 0.6, C.orange, M);
  B(x0 + 1, x1 - 1, y + 0.4, y + 1.0, z - 0.2, z + 0.2, CHAR, M);
  [z, -z].forEach((w) =>
    L('lamps', V(x1 + 0.82, y, w), V(1, 0, 0), C.amber, 0.12, 0)
  );
}

// --- The deck: the houses, machinery, hatches, a mast ------------------------
function buildDeck(kit, { B, G, L, R, M }) {
  const { V, add, lathe, railing, paint, random } = kit;
  const [a, b, c] = BOW;
  const top = a.yt + 0.12;
  const up = V(0, 1, 0);
  const steel = { shine: STEEL };
  // The house: a low block with a raised roof, windows all round.
  const plan = pairs([
    22.5, -3.3, 23.3, -4.1, 30.4, -4.1, 31.6, -2.9, 31.6, 2.9, 30.4, 4.1, 23.3,
    4.1, 22.5, 3.3,
  ]);
  add('hull', kit.slab(plan, top, top + 1.3, 0.12), paint(C.grey));
  B(24, 29.5, top + 1.3, top + 2.0, -2.6, 2.6, C.mid);
  B(24.4, 29.1, top + 2.0, top + 2.12, -2.9, 2.9, C.grey);
  B(29.1, 29.3, top + 1.9, top + 2.12, -2.9, 2.9, C.orange);
  B(23.3, 30.4, top + 1.12, top + 1.3, 4.04, 4.16, C.orange, M);
  B(31.58, 31.66, top + 0.48, top + 0.96, -2.7, 2.7, C.soot);
  B(23.6, 29.9, top + 0.48, top + 0.96, 4.08, 4.14, C.soot, M);
  const pane = () => (random() < 0.68 ? C.glass : C.amber);
  for (let z = -2.4; z <= 2.4; z += 0.8) {
    const [y0, y1] = [top + 0.6, top + 0.84];
    G('windows', 31.66, 31.7, y0, y1, z - 0.25, z + 0.25, pane(), 1.2);
  }
  for (let x = 24; x < 29.8; x += 0.75) {
    const [y0, y1] = [top + 0.6, top + 0.84];
    G('windows', x - 0.24, x + 0.24, y0, y1, 4.14, 4.17, pane(), 1.2, M);
  }
  // Windows on the raised roof's front, a door on each side.
  B(29.48, 29.54, top + 1.45, top + 1.85, -2.2, 2.2, C.soot);
  G('windows', 29.54, 29.57, top + 1.55, top + 1.75, -2, 2, C.glass, 1.3);
  B(30.6, 31.3, top, top + 1.05, 3.6, 4.2, C.mid, M);
  // On the roof: units with fans, vent stacks, a dish.
  [
    [24.7, 26.1, 0.9, 2.3],
    [24.7, 25.9, -2.4, -1.2],
  ].forEach(([x0, x1, z0, z1]) => {
    B(x0, x1, top + 2.12, top + 2.6, z0, z1, C.mid);
    const [x, z] = [(x0 + x1) / 2, (z0 + z1) / 2];
    R(V(x, top + 2.6, z), V(x, top + 2.66, z), 0.42, C.soot, 8);
  });
  [27.0, 27.4].forEach((x) =>
    R(V(x, top + 2.12, -1.8), V(x, top + 2.9, -1.8), 0.12, C.dark)
  );
  B(27.6, 28.4, top + 2.12, top + 2.5, -0.5, 0.5, C.white);
  const dish = pairs([0.05, 0, 0.5, 0.12, 0.7, 0.28]);
  add(
    'hull',
    lathe(dish, 8, V(28, top + 2.6, 1.6), V(0.5, 1, -0.3)),
    paint(C.white),
    {
      smooth: true,
    }
  );
  R(V(28, top + 2.12, 1.6), V(28, top + 2.6, 1.6), 0.07, C.steel, 5);
  [1, -1].forEach((s) => {
    const edge = [
      V(23.3, top + 1.3, 3.85 * s),
      V(30.3, top + 1.3, 3.85 * s),
      V(31.3, top + 1.3, 2.8 * s),
    ];
    railing('hull', edge, paint(C.steel), { ...steel, height: 0.6 });
    L('lamps', V(31.6, top + 1.15, 3.0 * s), V(1, 0, 0.4 * s), C.amber);
    L('floods', V(23.0, top + 1.32, 3.6 * s), up, C.flood, 0.1, 0);
  });

  // Cargo hatches forward of the house.
  for (let x = 32.6; x < 37; x += 2.2) {
    B(x, x + 1.8, top, top + 0.2, 1.0, 4.2, C.mid, M);
    B(x + 0.2, x + 1.6, top + 0.2, top + 0.28, 1.3, 3.9, C.light, M);
    B(x + 0.8, x + 1.0, top + 0.28, top + 0.36, 1.1, 4.1, C.dark, M);
    B(x + 0.25, x + 0.45, top + 0.28, top + 0.34, 1.6, 3.6, C.orange, M);
  }
  // A pipe run down the centre on a dark bed, with valves.
  B(32.4, 39.2, top, top + 0.12, -0.8, 0.8, C.dark);
  R(V(31.7, top + 0.32, -0.35), V(39.2, top + 0.32, -0.35), 0.11, C.mid);
  R(V(31.7, top + 0.32, 0.35), V(39.2, top + 0.32, 0.35), 0.11, C.orange);
  for (let x = 32.8; x < 39; x += 1.5) {
    B(x, x + 0.16, top + 0.12, top + 0.5, -0.6, 0.6, C.dark);
  }
  [34.4, 37.4].forEach((x) => {
    R(V(x, top + 0.32, -0.35), V(x, top + 0.8, -0.35), 0.05, C.steel, 5);
    R(
      V(x - 0.2, top + 0.8, -0.35),
      V(x + 0.2, top + 0.8, -0.35),
      0.03,
      C.orange,
      4
    );
  });

  // The forward deck, sloping to the nose: winches, bollards, a small
  // instrument house with its lights and whip aerial.
  const deckY = (x) => b.yt + ((c.yt - b.yt) * (x - b.x)) / (c.x - b.x) + 0.14;
  [1, -1].forEach((s) => {
    const y = deckY(39.6);
    B(39, 40.6, y, y + 0.3, 1.0 * s, 3.0 * s, C.mid);
    R(V(39.8, y + 0.7, 1.2 * s), V(39.8, y + 0.7, 2.8 * s), 0.38, C.dark, 8);
    [1.2, 2.8].forEach((z) =>
      R(
        V(39.8, y + 0.7, (z - 0.06) * s),
        V(39.8, y + 0.7, (z + 0.06) * s),
        0.55,
        C.orange,
        8
      )
    );
    B(39.45, 40.15, y + 0.3, y + 0.8, 3.0 * s, 3.5 * s, C.grey);
    [41.2, 42.0].forEach((x) => {
      const yb = deckY(x);
      R(V(x, yb, 3.4 * s), V(x, yb + 0.45, 3.4 * s), 0.17, C.dark);
      R(V(x, yb + 0.45, 3.4 * s), V(x, yb + 0.52, 3.4 * s), 0.24, C.dark);
    });
    L('lamps', V(43.4, deckY(43.4) + 0.05, 3.6 * s), V(0.3, 1, 0), C.amber);
  });
  const [h0, h1] = [deckY(43.4) - 0.3, deckY(41) + 1.0];
  const hut = pairs([
    41, -1.6, 41, 1.6, 42.9, 1.6, 43.6, 0.9, 43.6, -0.9, 42.9, -1.6,
  ]);
  add('hull', kit.slab(hut, h0, h1, 0.1), paint(C.dark));
  B(41.2, 43.2, h1, h1 + 0.1, -1.3, 1.3, C.mid);
  B(43.56, 43.62, h1 - 0.55, h1 - 0.25, -0.85, 0.85, C.soot);
  G('windows', 43.62, 43.65, h1 - 0.5, h1 - 0.3, -0.75, 0.75, C.amber, 1.4);
  B(41.4, 42.6, h1 - 0.6, h1 - 0.15, 1.6, 1.66, C.orange, M);
  L('lamps', V(42, h1 + 0.1, 0), up, C.glass, 0.16, 0);
  L('lamps', V(43.6, h1 - 0.05, 0.9), V(1, 0, 0.5), C.amber, 0.1, 0.5);
  L('lamps', V(43.6, h1 - 0.05, -0.9), V(1, 0, -0.5), C.amber, 0.1, 0.5);
  R(V(41.5, h1 + 0.1, -0.8), V(41.5, h1 + 2.2, -0.8), 0.03, C.steel, 4);

  // The aft deck: lockers, a stack of drums.
  B(20.6, 22, top, top + 0.9, 1.2, 4.0, C.mid, M);
  B(20.8, 21.8, top + 0.9, top + 1.0, 1.5, 3.7, C.dark, M);
  [1.6, 2.4, 3.2].forEach((z) =>
    B(20.58, 20.62, top + 0.2, top + 0.7, z - 0.3, z + 0.3, C.dark, M)
  );
  [
    [21.0, -0.45],
    [21.0, 0.45],
    [21.8, 0],
  ].forEach(([x, z], k) =>
    R(V(x, top, z), V(x, top + 0.75, z), 0.32, k === 2 ? C.orange : C.grey, 8)
  );
  // Rails, a pipe along each edge, lights on posts.
  [1, -1].forEach((s) => {
    const z = (a.tw - 0.25) * s;
    const nose = V(43.8, deckY(43.8) - 0.02, (c.tw - 0.35) * s);
    const rail = [V(20.4, top, z), V(37.6, top, z), nose];
    railing('hull', rail, paint(C.steel), steel);
    R(V(22, top + 0.2, 4.6 * s), V(37, top + 0.2, 4.6 * s), 0.12, C.mid);
    [33.5, 37.4].forEach((x) => {
      R(V(x, top, 4.4 * s), V(x, top + 1.4, 4.4 * s), 0.05, C.steel, 5);
      L('floods', V(x, top + 1.4, 4.4 * s), up, C.flood, 0.12, 0);
    });
  });
  // The forward mast: a pole, a yard, a radar bar, a whip and its lamps.
  R(V(26.5, top + 2.1, 0), V(26.5, top + 5.4, 0), 0.09, C.steel, 6, steel);
  R(V(26.5, top + 4.2, -1), V(26.5, top + 4.2, 1), 0.05, C.steel, 4, steel);
  B(26.2, 26.8, top + 3.3, top + 3.4, -0.4, 0.4, C.dark);
  B(26.35, 26.65, top + 4.6, top + 4.72, -1.1, 1.1, C.white);
  R(V(26.5, top + 2.6, 0.12), V(26.5, top + 6.2, 0.12), 0.025, C.steel, 4);
  [1, -1].forEach((s) =>
    L('lamps', V(26.5, top + 4.2, 1.0 * s), V(0, 0, s), C.amber, 0.1, 0)
  );
  L('beacons', V(26.5, top + 5.4, 0), up, C.beacon, 0.16, 0);
}
