// src/modules/render3d/travel/wakeCargo.js
//
// The Wake's neck (wake.js): a deep spine girder between the stern and the
// bow, trussed on its flanks, tanks slung along it and the keel under it; a
// cargo floor walled by orange armoured end frames and crossed by yellow
// portal gantries; the containers stacked in cells between them; walkways
// with railings and lights along both deck edges, a catwalk and stairs
// below; an overhead bridge crane on rails; the boom crane on the forward
// end frame lifting a container; and the hangar under the spine the drones
// leave from.

import { STEEL, WAKE_COLORS as C } from './wakeHull.js';

// The neck runs from the stern block's face to the bow block's.
const X0 = -14;
const X1 = 20;
const F = -2.6; // the cargo floor
const SPINE = 5.6;
// The cross frames: armoured end frames against the stern and the bow (half
// thickness END), yellow gantries between (half thickness FRAME).
const END = 0.75;
const ENDS = [X0 + END, X1 - END];
const GANTRIES = [-4.9, 3.2, 11.3];
const FRAME = 0.57;
// The bays between the frames' faces.
const BAYS = [
  [X0 + 2 * END, GANTRIES[0] - FRAME],
  [GANTRIES[0] + FRAME, GANTRIES[1] - FRAME],
  [GANTRIES[1] + FRAME, GANTRIES[2] - FRAME],
  [GANTRIES[2] + FRAME, X1 - 2 * END],
];
// A container: the short and the long one, height, width; five columns.
const BOX = { short: 3.05, long: 6.1, h: 2.5, w: 2.3, pitch: 2.45 };
const LEVEL = BOX.h + 0.04;
const BASE = F + 0.08;
// Tiers per bay (aft → fore) and column (port → starboard); 0: an open cell.
const TIERS = [
  [2, 3, 2, 3, 2],
  [1, 2, 3, 0, 2],
  [2, 1, 3, 2, 2],
  [2, 2, 3, 2, 1],
];
// The odd loads ([bay, column]): a tank in its frame, a tarped machine.
const TANK_AT = [1, 0];
const TARP_AT = [3, 1];
// The bay and column the boom crane's container hangs over.
const CRANE_AT = [2, 1];
// Across (z): the walkway's outer edge, the edge beam's face, the legs.
const WALK = 7.4;
const EDGE = 8.1;
const LEG = [7.0, 7.9];
// The gantries' beam: its underside and its top.
const TOP = 5.6;
const CROWN = 6.6;
// The catwalk on the spine's flank, the stairs down to it ([top x, foot x])
// and their span across.
const CATWALK = -4.9;
const STAIRS = [
  [-6.1, -9.3],
  [12.5, 15.7],
];
const STAIR_Z = [6.25, 7.0];
// The hangar: its aft wall, its mouth (x) and the opening.
const AFT = 4.5;
const MOUTH = 16;
const BAY_Z = 3.15;
const BAY_Y = [-7.9, -6.75];
// Local colours: tarp canvas, a tank's paint, lit glass.
const TARP = '#6c6a4c';
const TANK = '#c8c5bb';
const GLASS = '#8fd4ff';

export function buildCargoDeck(kit) {
  const { THREE, V, add, box, prism, cross, plate, crate, tube, lathe } = kit;
  const { pool, lamp, railing, paint, random } = kit;
  const metal = { shine: STEEL };
  const steel = paint(C.steel);
  const yellow = paint(C.yellow);
  const orange = paint(C.orange);
  const dark = paint(C.dark);
  const mid = paint(C.mid);
  const grey = paint(C.grey);
  const soot = paint(C.soot);
  const X = V(1, 0, 0);
  const Y = V(0, 1, 0);
  const both = { mirror: true };
  const shiny = { ...metal, mirror: true };

  // --- Helpers ----------------------------------------------------------------
  const hull = (g, color, options) => add('hull', g, color, options);
  // A painted box: x, y and z ranges, colour, options.
  const B = (x0, x1, y0, y1, z0, z1, color, options) =>
    hull(box(x0, x1, y0, y1, z0, z1), color, options);
  // A thin open rod.
  const rod = (a, b, r, color, options) =>
    hull(tube(a, b, r, 4, true), color, options);
  const glow = (set, g, color, options) =>
    add(set, g, color, { uv: false, ...options });
  // A polygon ([[a, b], …]) cut to lo ≤ a ≤ hi.
  const clip = (points, lo, hi) =>
    [
      [lo, 1],
      [hi, -1],
    ].reduce((poly, [edge, sign]) => {
      const out = [];
      const inside = (p) => sign * (p[0] - edge) >= -1e-6;
      poly.forEach((p, i) => {
        const q = poly[(i + 1) % poly.length];
        if (inside(p)) out.push(p);
        if (inside(p) !== inside(q)) {
          const t = (edge - p[0]) / (q[0] - p[0]);
          out.push([edge, p[1] + (q[1] - p[1]) * t]);
        }
      });
      return out;
    }, points);
  const rect = (z0, z1, y0, y1) => [
    [z0, y0],
    [z1, y0],
    [z1, y1],
    [z0, y1],
  ];
  // Hazard stripes: slanted soot bars over a yellow band `length` × `h` on
  // the plane through `at` spanned by u (along) and v (up), standing out
  // along u × v.
  const hazard = (at, u, v, length, h, options) => {
    const n = new THREE.Vector3().crossVectors(u, v);
    hull(prism(at, u, v, rect(0, length, 0, h), 0.04), yellow, options);
    const on = at.clone().addScaledVector(n, 0.04);
    const step = Math.max(0.3, h * 0.9);
    for (let a = -h * 0.7; a < length; a += step) {
      const bar = clip(
        [
          [a, 0],
          [a + step / 2, 0],
          [a + step / 2 + h * 0.7, h],
          [a + h * 0.7, h],
        ],
        0,
        length
      );
      if (bar.length > 2) hull(prism(on, u, v, bar, 0.012), soot, options);
    }
  };
  // A box on its own axes (ax, ay unit and square to each other).
  const obox = (centre, ax, ay, sx, sy, sz, color, set = 'hull') => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    const az = new THREE.Vector3().crossVectors(ax, ay).normalize();
    const m = new THREE.Matrix4().makeBasis(ax, ay, az).setPosition(centre);
    add(set, g.applyMatrix4(m), color, set === 'hull' ? {} : { uv: false });
  };
  // A bolt head on a face across x (axis 'x') or across z, standing `out`.
  const stud = (x, y, z, axis, out, options) => {
    const s = 0.045;
    if (axis === 'x') B(x, x + out, y - s, y + s, z - s, z + s, steel, options);
    else B(x - s, x + s, y - s, y + s, z, z + out, steel, options);
  };
  // A portal frame seen from the stern: legs from zi to zo, its beam from yi
  // to yo, the inner corners braced by `knee`, the outer ones cut by `cut`.
  const portal = (zi, zo, yb, yi, yo, knee, cut) => [
    [-zo, yb],
    [-zi, yb],
    [-zi, yi - knee],
    [-zi + knee, yi],
    [zi - knee, yi],
    [zi, yi - knee],
    [zi, yb],
    [zo, yb],
    [zo, yo - cut],
    [zo - cut, yo],
    [-zo + cut, yo],
    [-zo, yo - cut],
  ];
  // A frame built as a dark core between two painted faces with `holes`.
  const frameAt = (x, half, outline, holes, color) => {
    hull(cross(outline, x - half + 0.14, x + half - 0.14), dark);
    [-1, 1].forEach((s) =>
      hull(cross(outline, x + s * (half - 0.14), x + s * half, holes), color)
    );
  };
  // A turned tank along x: `length` long, radius r, domed ends.
  const tank = (x0, y, z, length, r, color, options) => {
    const ends = [
      [0, 0],
      [r * 0.55, 0.08 * r],
      [r * 0.88, 0.3 * r],
      [r, 0.65 * r],
    ];
    const points = [
      ...ends,
      ...ends.map(([a, b]) => [a, length - b]).reverse(),
    ];
    hull(lathe(points, 10, V(x0, y, z), X), color, {
      smooth: true,
      ...options,
    });
  };
  const inStair = (x0, x1) =>
    STAIRS.some(([t, f]) => x1 > Math.min(t, f) && x0 < Math.max(t, f));

  // --- The spine --------------------------------------------------------------
  hull(
    cross(
      [
        [-SPINE, F],
        [SPINE, F],
        [SPINE, -4.8],
        [3.8, -6.4],
        [-3.8, -6.4],
        [-SPINE, -4.8],
      ],
      X0,
      X1
    ),
    dark
  );
  // The flank: a Warren truss over recessed web panels between two chords;
  // the lower slope plated.
  B(X0, X1, -3.02, -2.85, SPINE, SPINE + 0.32, mid, both);
  B(X0, X1, -4.8, -4.62, SPINE, SPINE + 0.32, mid, both);
  for (let x = X0 + 0.2, i = 0; x < X1 - 0.6; x += 2, i += 1) {
    const x1 = Math.min(x + 2, X1 - 0.2);
    B(x, x + 0.22, -4.62, -3.02, SPINE, SPINE + 0.3, mid, both);
    const web = paint(random() < 0.4 ? C.grey : C.soot);
    B(x + 0.4, x1 - 0.18, -4.45, -3.2, SPINE, SPINE + 0.05, web, both);
    const [ya, yb] = i % 2 ? [-4.55, -3.1] : [-3.1, -4.55];
    const z = SPINE + 0.2;
    hull(tube(V(x + 0.11, ya, z), V(x1 + 0.11, yb, z), 0.075, 4), grey, both);
    const len = Math.min(2, X1 - x);
    const corners = [
      V(x, -4.8, SPINE),
      V(x + len, -4.8, SPINE),
      V(x + len, -6.4, 3.8),
      V(x, -6.4, 3.8),
    ];
    const tone = paint(random() < 0.3 ? C.grey : C.mid);
    hull(plate(corners, 0, 0.12 + random() * 0.08, 0.06), tone, both);
  }
  // Pipes along the flanks in front of the truss, clamped.
  [
    [-3.3, 0.12, C.mid],
    [-3.62, 0.09, C.orange],
    [-4.3, 0.14, C.dark],
  ].forEach(([y, r, css]) => {
    const [a, b] = [V(X0, y, SPINE + 0.48), V(X1, y, SPINE + 0.48)];
    hull(tube(a, b, r, 6, true), paint(css), { ...both, smooth: true });
  });
  for (let x = X0 + 1.2; x < X1 - 0.5; x += 4) {
    B(x, x + 0.14, -4.48, -3.12, SPINE + 0.3, SPINE + 0.68, dark, both);
  }
  // A cable tray low on the flank, its cables in it.
  B(X0 + 0.5, X1 - 0.5, -4.62, -4.57, SPINE + 0.32, SPINE + 0.62, steel, shiny);
  B(X0 + 0.5, X1 - 0.5, -4.62, -4.47, SPINE + 0.6, SPINE + 0.64, steel, shiny);
  [C.orange, C.soot].forEach((css, k) => {
    const z = SPINE + 0.4 + k * 0.1;
    rod(V(X0 + 0.5, -4.52, z), V(X1 - 0.5, -4.52, z), 0.045, paint(css), both);
  });
  // Tanks slung on the lower slopes, banded to saddles, piped up.
  const ty = -6.14;
  const tz = 5.18;
  [
    [-12.6, 4.3, TANK],
    [-7.9, 4.3, C.orange],
    [-3.1, 4.0, TANK],
    [8.0, 3.8, C.grey],
  ].forEach(([x0, length, css]) => {
    tank(x0, ty, tz, length, 0.6, paint(css), both);
    [0.7, length - 0.85].forEach((dx) => {
      const [a, b] = [V(x0 + dx, ty, tz), V(x0 + dx + 0.16, ty, tz)];
      hull(tube(a, b, 0.64, 10), dark, both);
      B(x0 + dx - 0.05, x0 + dx + 0.21, ty - 0.1, -5.0, 4.7, 5.0, mid, both);
    });
    const xm = x0 + length / 2;
    rod(V(xm, ty + 0.5, tz), V(xm, -4.65, tz - 0.15), 0.06, steel, shiny);
  });
  // The keel aft of the hangar: a beam with inverted-T frames across it.
  B(X0, AFT, -6.9, -6.4, -1.3, 1.3, dark);
  for (let x = X0 + 0.8; x < AFT - 0.3; x += 1.7) {
    B(x, x + 0.24, -7.3, -6.4, -1.7, 1.7, mid);
    B(x - 0.1, x + 0.34, -7.4, -7.3, -1.9, 1.9, dark);
  }
  hull(tube(V(X0, -7.05, 1), V(AFT, -7.05, 1), 0.1, 6, true), orange, {
    ...both,
    smooth: true,
  });

  // --- Cargo floor --------------------------------------------------------------
  BAYS.forEach(([b0, b1]) => {
    B(b0, b1, F, F + 0.08, -6.3, 6.3, mid);
    for (let k = -2.5; k <= 2.5; k += 1) {
      const z = k * BOX.pitch;
      B(b0, b1, F + 0.08, F + 0.1, z - 0.06, z + 0.06, soot);
    }
  });

  // --- Walkways, edge beams, the catwalk and stairs below -------------------
  // The walkway, open where a stair goes down through it; tread plates.
  const [s0, s1] = STAIR_Z;
  B(X0, X1, F - 0.25, F, SPINE, s0, mid, both);
  B(X0, X1, F - 0.25, F, s1, WALK, mid, both);
  const ends = [X0, ...STAIRS.flatMap(([t, f]) => [f, t]), X1];
  ends.sort((a, b) => a - b);
  for (let i = 0; i < ends.length; i += 2) {
    B(ends[i], ends[i + 1], F - 0.25, F, s0, s1, mid, both);
  }
  for (let x = X0 + 0.2; x < X1 - 1.6; x += 1.7) {
    const z1 = inStair(x, x + 1.55) ? s0 - 0.05 : WALK - 0.1;
    const tone = paint(random() < 0.5 ? C.grey : C.mid);
    B(x, x + 1.55, F, F + 0.025, SPINE + 0.1, z1, tone, both);
  }
  // The edge beam: dark, ribbed, a yellow toe board on top, light housings
  // with blue-white lenses on its face.
  B(X0, X1, F - 1.3, F + 0.1, WALK, EDGE, dark, both);
  B(X0, X1, F + 0.1, F + 0.22, EDGE - 0.1, EDGE, yellow, both);
  B(X0, X1, F - 1.3, F - 1.18, EDGE, EDGE + 0.08, mid, both);
  for (let x = X0 + 1.6; x < X1 - 1; x += 2) {
    B(x, x + 0.16, F - 1.18, F + 0.1, EDGE, EDGE + 0.07, mid, both);
  }
  BAYS.forEach(([b0, b1]) =>
    [0.27, 0.73].forEach((f) => {
      const x = b0 + (b1 - b0) * f;
      B(x - 0.42, x + 0.42, F - 0.86, F - 0.62, EDGE, EDGE + 0.1, mid, both);
      const lens = box(
        x - 0.32,
        x + 0.32,
        F - 0.8,
        F - 0.68,
        EDGE,
        EDGE + 0.13
      );
      glow('floods', lens, paint(C.flood, 1.8), both);
      const at = V(x, F - 0.74, EDGE + 0.18);
      glow(
        'floodsPools',
        pool(at, V(0, 0, 1), 0.7),
        paint(C.flood, 0.22),
        both
      );
    })
  );
  // Brackets under the walkway, not where a stair passes.
  const bracket = [
    [SPINE, F - 0.25],
    [WALK, F - 0.25],
    [WALK, F - 1.3],
    [SPINE, F - 1.6],
  ];
  for (let x = X0 + 1.2; x < X1; x += 2) {
    if (!inStair(x - 0.2, x + 0.4))
      hull(cross(bracket, x, x + 0.16), dark, both);
  }
  // Railings between the frames, a lamp post in every bay; work lights
  // under the walkway washing the spine.
  [1, -1].forEach((s) => {
    const z = (EDGE - 0.06) * s;
    BAYS.forEach(([b0, b1]) => {
      const rail = [V(b0 + 0.05, F + 0.22, z), V(b1 - 0.05, F + 0.22, z)];
      railing('hull', rail, yellow, { height: 0.85, step: 1.15 });
      const xm = (b0 + b1) / 2;
      hull(tube(V(xm, F + 0.22, z), V(xm, F + 1.55, z), 0.05, 6), dark);
      B(xm - 0.12, xm + 0.12, F + 1.45, F + 1.6, z - 0.45 * s, z, dark);
      lamp('lamps', V(xm, F + 1.45, z - 0.35 * s), V(0, -1, 0), C.amber, {
        size: 0.11,
        spill: 0.9,
        spillGain: 0.45,
      });
    });
    for (let x = X0 + 2.2; x < X1; x += 4.05) {
      lamp('floods', V(x, F - 0.75, (SPINE + 0.33) * s), V(0, 0, s), C.flood, {
        size: 0.2,
        gain: 2.8,
        spill: 2.3,
        spillGain: 0.42,
      });
    }
  });
  // The catwalk on the flank, on brackets off the slope, with its rail.
  B(X0 + 0.8, X1 - 0.8, CATWALK - 0.08, CATWALK, SPINE - 0.1, 7.25, mid, both);
  const knee = [
    [5.45, CATWALK - 0.08],
    [7.0, CATWALK - 0.08],
    [4.9, -5.42],
  ];
  for (let x = X0 + 1.4; x < X1 - 1; x += 2) {
    hull(cross(knee, x, x + 0.14), dark, both);
  }
  [1, -1].forEach((s) => {
    const rail = [V(X0 + 1, CATWALK, 7.18 * s), V(X1 - 1, CATWALK, 7.18 * s)];
    railing('hull', rail, steel, { height: 0.7, step: 1.4, shine: STEEL });
  });
  // The stairs: treads, stringers, a handrail.
  STAIRS.forEach(([top, foot]) => {
    const steps = 8;
    const rise = (F - 0.25 - CATWALK) / steps;
    const run = (top - foot) / steps;
    for (let k = 0; k < steps; k += 1) {
      const x = top - run * (k + 0.5);
      const y = F - 0.25 - rise * (k + 1);
      const h = Math.abs(run) / 2;
      B(x - h, x + h, y - 0.05, y, s0 + 0.05, s1 - 0.05, grey, both);
    }
    [s0 + 0.03, s1 - 0.03].forEach((z) =>
      hull(tube(V(top, F - 0.3, z), V(foot, CATWALK, z), 0.07, 4), dark, both)
    );
    const [a, b] = [V(top, F + 0.55, s1), V(foot, CATWALK + 0.8, s1)];
    rod(a, b, 0.035, yellow, both);
  });

  // --- The armoured end frames ----------------------------------------------------
  const endOutline = portal(6.9, 8.25, F - 1.3, TOP, 7.4, 1.5, 1.25);
  const endHoles = [1, -1].flatMap((s) => [
    rect(7.42 * s, 7.72 * s, -0.4, 3.6),
    rect(1.0 * s, 4.9 * s, 6.05, 6.75),
  ]);
  ENDS.forEach((ex) => {
    const out = Math.sign(ex);
    const face = ex - out * END;
    frameAt(ex, END, endOutline, endHoles, orange);
    // Armour on each leg's outer face, cut by a dark channel.
    [
      [F - 1.25, 1.2],
      [1.35, 5.4],
    ].forEach(([y0, y1]) => {
      const [a, b] = [ex - END + 0.08, ex + END - 0.08];
      const corners = [V(a, y0, 8.25), V(b, y0, 8.25), V(b, y1, 8.25)];
      hull(plate([...corners, V(a, y1, 8.25)], 0, 0.14, 0.04), orange, both);
    });
    B(ex - 0.08, ex + 0.08, F - 1.1, 5.2, 8.25, 8.35, soot, both);
    hazard(V(ex - END, F + 0.23, 8.39), X, Y, 2 * END, 0.4, both);
    // A raised armour cap on the beam; lamps; bolts on the bay face.
    B(ex - END + 0.1, ex + END - 0.1, 7.4, 7.6, -6.9, 6.9, orange);
    const light = (set, y, css, size, spill) =>
      lamp(set, V(face, y, 7.6), V(-out, 0, 0), css, { size, spill });
    light('lamps', 6.9, C.amber, 0.15, 1);
    light('floods', F + 0.5, C.glass, 0.14, 0.9);
    for (let y = -0.2; y < 4; y += 0.85) {
      stud(face, y, 7.2, 'x', -out * 0.05, both);
      stud(face, y, 7.95, 'x', -out * 0.05, both);
    }
  });
  // The other side's lamps (the light sets do not mirror).
  ENDS.forEach((ex) => {
    const face = ex - Math.sign(ex) * END;
    const n = V(-Math.sign(ex), 0, 0);
    lamp('lamps', V(face, 6.9, -7.6), n, C.amber, { size: 0.15, spill: 1 });
    lamp('floods', V(face, F + 0.5, -7.6), n, C.glass, {
      size: 0.14,
      spill: 0.9,
    });
  });

  // --- The gantries -------------------------------------------------------------
  const outline = portal(LEG[0], LEG[1], F, TOP, CROWN, 1.3, 0.45);
  const holes = [1, -1].flatMap((s) => [
    rect(7.17 * s, 7.73 * s, F + 0.85, F + 2.25),
    rect(7.17 * s, 7.73 * s, F + 2.5, 3.6),
    rect(0.15 * s, 2.6 * s, 5.8, 6.4),
    rect(2.85 * s, 5.4 * s, 5.8, 6.4),
  ]);
  GANTRIES.forEach((gx) => {
    const [g0, g1] = [gx - FRAME, gx + FRAME];
    frameAt(gx, FRAME, outline, holes, yellow);
    // Vent grilles in the lower leg panels.
    for (let y = F + 1.0; y < F + 2.15; y += 0.2) {
      B(g0 + 0.1, g1 - 0.1, y, y + 0.07, 7.17, 7.73, soot, both);
    }
    // The foot: a dark plinth with hazard stripes, bolted down.
    B(gx - 0.8, gx + 0.8, F, F + 0.55, 6.85, 8.05, dark, both);
    hazard(V(gx - 0.8, F + 0.05, 8.05), X, Y, 1.6, 0.42, both);
    hazard(V(gx + 0.8, F + 0.05, 8.05), V(0, 0, -1), Y, 1.2, 0.42, both);
    [-0.6, 0.6].forEach((dx) => stud(gx + dx, F + 0.58, 7.45, 'z', 0.05, both));
    // Bolted knee joints and the beam's splice, on both faces.
    [g0, g1].forEach((fx) => {
      const out = Math.sign(fx - gx) * 0.05;
      for (let t = 0.1; t < 1; t += 0.27) {
        stud(fx, 4.56 + 1.3 * t, LEG[0] + 0.26 - 1.3 * t, 'x', out, both);
      }
      [5.85, 6.1, 6.35].forEach((y) => stud(fx, y, 0, 'x', out));
    });
    // A cable run up the forward face, clamped.
    rod(
      V(g1 + 0.07, F + 0.55, 7.78),
      V(g1 + 0.07, 4.4, 7.78),
      0.05,
      soot,
      both
    );
    for (let y = F + 1.0; y < 4.4; y += 0.9) {
      B(g1, g1 + 0.13, y, y + 0.1, 7.7, 7.86, mid, both);
    }
    // A ladder up the leg's outer face to the platform.
    [-0.22, 0.22].forEach((dx) => {
      const [a, b] = [
        V(gx + dx, F + 0.55, 8.02),
        V(gx + dx, CROWN + 0.75, 8.02),
      ];
      rod(a, b, 0.03, steel, shiny);
    });
    for (let y = F + 0.9; y < CROWN + 0.1; y += 0.38) {
      B(gx - 0.22, gx + 0.22, y, y + 0.045, 7.98, 8.05, steel, shiny);
    }
    // The walk platform on top with its railings.
    B(gx - 1.0, gx + 1.0, CROWN, CROWN + 0.08, -LEG[1], LEG[1], mid);
    [-0.95, 0.95].forEach((dx) => {
      const rail = [
        V(gx + dx, CROWN + 0.08, -7.7),
        V(gx + dx, CROWN + 0.08, 7.7),
      ];
      railing('hull', rail, yellow, { height: 0.7, step: 1.3 });
    });
    // Amber on the shoulders and feet, floods under the beam on the cargo.
    [1, -1].forEach((s) => {
      const at = (x, y, z) => V(x, y, z * s);
      lamp('lamps', at(g1, CROWN - 0.25, 7.6), X, C.amber, {
        size: 0.15,
        spill: 1.1,
      });
      lamp('lamps', at(g1, F + 0.75, 7.45), X, C.amber, {
        size: 0.1,
        spill: 0.6,
      });
      lamp('floods', at(gx, TOP, 3.0), V(0, -1, 0), C.flood, {
        size: 0.18,
        spill: 1.5,
        spillGain: 0.35,
      });
    });
  });

  // --- Containers in their cells --------------------------------------------------
  const tint = () => {
    const css = C.cargo[Math.floor(random() * C.cargo.length)];
    return paint(css, 0.8 + Math.floor(random() * 4) * 0.08);
  };
  const container = (x0, x1, y, z, short) => {
    const [z0, z1] = [z - BOX.w / 2, z + BOX.w / 2];
    const g = crate(x0, x1, y, y + BOX.h, z0, z1, random() < 0.5, short);
    add(random() < 0.5 ? 'cargo' : 'cargoB', g, tint(), { uv: false });
    // Corner castings on the boxes that face outboard.
    if (Math.abs(z) < 4) return;
    const s = Math.sign(z);
    const zf = z + (s * BOX.w) / 2;
    [x0 + 0.12, x1 - 0.12].forEach((x) =>
      [y + 0.1, y + BOX.h - 0.1].forEach((yc) =>
        B(x - 0.11, x + 0.11, yc - 0.1, yc + 0.1, zf, zf + 0.04 * s, dark)
      )
    );
  };
  BAYS.forEach(([b0, b1], bay) => {
    // The cell guides at the bay's ends, tied across at the top.
    [b0 + 0.09, b1 - 0.09].forEach((x) => {
      for (let k = -2.5; k <= 2.5; k += 1) {
        const z = k * BOX.pitch;
        B(x - 0.08, x + 0.08, F + 0.08, 5.3, z - 0.08, z + 0.08, grey);
      }
      B(x - 0.08, x + 0.08, 5.3, 5.45, -6.2, 6.2, dark);
    });
    const [i0, i1] = [b0 + 0.2, b1 - 0.2];
    const xm = (i0 + i1) / 2;
    TIERS[bay].forEach((levels, column) => {
      const z = (column - 2) * BOX.pitch;
      for (let level = 0; level < levels; level += 1) {
        const y = BASE + level * LEVEL;
        if (random() < 0.28) {
          container(xm - BOX.long / 2, xm + BOX.long / 2, y, z, false);
        } else {
          const gap = 0.06 + random() * 0.1;
          container(i0 + 0.02, xm - gap, y, z, true);
          container(xm + gap, i1 - 0.02, y, z, true);
        }
        // Lashing rods crossed on the stack's ends, low tiers only.
        if (level > 1) continue;
        [i0 - 0.04, i1 + 0.04].forEach((x) =>
          [-1, 1].forEach((d) => {
            const a = V(x, y + 0.15, z - d * 0.95);
            rod(a, V(x, y + BOX.h - 0.1, z + d * 0.95), 0.025, steel, metal);
          })
        );
      }
    });
  });
  // Where an odd load stands: its middle, its floor, its column's z.
  const slot = ([bay, column]) => {
    const [b0, b1] = BAYS[bay];
    const z = (column - 2) * BOX.pitch;
    return [(b0 + b1) / 2, BASE + TIERS[bay][column] * LEVEL, z];
  };
  {
    // A tank in an orange frame.
    const [xm, y, z] = slot(TANK_AT);
    const [x0, x1] = [xm - 1.6, xm + 1.6];
    const [z0, z1] = [z - BOX.w / 2, z + BOX.w / 2];
    const e = 0.07;
    [y + e, y + BOX.h - e].forEach((yy) => {
      [z0 + e, z1 - e].forEach((zz) =>
        B(x0, x1, yy - e, yy + e, zz - e, zz + e, orange)
      );
      [x0 + e, x1 - e].forEach((xx) =>
        B(xx - e, xx + e, yy - e, yy + e, z0, z1, orange)
      );
    });
    [x0 + e, x1 - e].forEach((xx) =>
      [z0 + e, z1 - e].forEach((zz) =>
        B(xx - e, xx + e, y, y + BOX.h, zz - e, zz + e, orange)
      )
    );
    tank(x0 + 0.15, y + BOX.h / 2, z, x1 - x0 - 0.3, 1.05, paint(TANK));
    B(
      x0 + 0.6,
      x1 - 0.6,
      y + BOX.h - 0.14,
      y + BOX.h - 0.06,
      z - 0.5,
      z + 0.5,
      grey
    );
    hull(tube(V(xm, y + 2.25, z), V(xm, y + 2.42, z), 0.22, 8), dark);
  }
  {
    // A machine under a tarp, strapped down on a skid.
    const [xm, y, z] = slot(TARP_AT);
    B(xm - 2.2, xm + 2.2, y, y + 0.16, z - 1.1, z + 1.1, dark);
    const hump = [
      [-1.05, 0],
      [1.05, 0],
      [1.05, 1.05],
      [0.75, 1.55],
      [-0.5, 1.7],
      [-1.05, 1.2],
    ].map(([a, b]) => [z + a, y + 0.16 + b]);
    hull(cross(hump, xm - 1.95, xm + 1.95), paint(TARP));
    B(
      xm + 1.95,
      xm + 2.1,
      y + 0.16,
      y + 1.1,
      z - 0.8,
      z + 0.8,
      paint(TARP, 0.85)
    );
    [-1.3, 0, 1.3].forEach((dx) => {
      for (let k = 1; k < hump.length; k += 1) {
        const [a, b] = [hump[k], hump[(k + 1) % hump.length]];
        const p = (q) =>
          V(xm + dx, y + (q[1] - y) * 1.02, z + (q[0] - z) * 1.03);
        rod(p(a), p(b), 0.035, yellow);
      }
    });
  }

  // --- The overhead bridge crane on rails along the gantry tops, parked ----------
  const [r0, r1] = [BAYS[0][0], BAYS[3][1]];
  B(r0, r1, CROWN + 0.08, CROWN + 0.5, 4.3, 4.75, dark, both);
  B(r0, r1, CROWN + 0.5, CROWN + 0.58, 4.4, 4.65, steel, shiny);
  const px = (BAYS[1][0] + BAYS[1][1]) / 2;
  [-0.85, 0.45].forEach((dx) => {
    B(px + dx, px + dx + 0.4, CROWN + 0.95, CROWN + 1.6, -4.9, 4.9, yellow);
  });
  hazard(V(px + 0.85, CROWN + 1.0, 4.9), V(0, 0, -1), Y, 9.8, 0.5);
  B(px - 1.2, px + 1.2, CROWN + 0.58, CROWN + 1.1, 4.1, 5.0, dark, both);
  [1, -1].forEach((s) =>
    lamp('beacons', V(px + 1.2, CROWN + 0.9, 4.55 * s), X, C.amber, {
      size: 0.1,
      spill: 0,
    })
  );
  B(px - 0.8, px + 0.8, CROWN + 1.6, CROWN + 2.15, 1.0, 2.9, mid);
  B(px - 0.55, px + 0.55, CROWN + 0.5, CROWN + 0.95, 1.4, 2.5, orange);
  B(px - 0.3, px + 0.3, CROWN + 0.15, CROWN + 0.5, 1.7, 2.2, dark);
  lamp('floods', V(px, CROWN + 0.15, 1.95), V(0, -1, 0), C.flood, {
    size: 0.16,
    spill: 0,
  });

  // --- The boom crane on the forward end frame, a container on its hook -------
  const [loadX, , loadZ] = slot(CRANE_AT);
  const P = V(18.0, 7.6, -5.45);
  // The foundation: a bracket off the end frame's beam, the pedestal.
  B(16.9, ENDS[1], TOP, 7.6, -6.9, -4.8, dark);
  const bracketFace = [V(16.9, TOP, -6.9), V(16.9, TOP, -4.8)];
  bracketFace.push(V(16.9, 7.6, -4.8), V(16.9, 7.6, -6.9));
  hull(plate(bracketFace, 0, 0.1, 0.08, V(20, 6.6, -5.8)), orange);
  hull(tube(V(P.x, 7.6, P.z), V(P.x, 8.3, P.z), 0.75, 12), mid, {
    smooth: true,
  });
  hull(tube(V(P.x, 8.3, P.z), V(P.x, 8.45, P.z), 0.95, 12), dark, {
    smooth: true,
  });
  // The boom's heading on the deck and its own axes.
  const head = V(loadX - P.x, 0, loadZ - P.z).normalize();
  const side = new THREE.Vector3().crossVectors(head, Y).normalize();
  const port = side.z < 0 ? side.clone() : side.clone().negate();
  const from = (c, a, b = 0, c2 = 0, y = null) => {
    const p = c.clone().addScaledVector(head, a).addScaledVector(side, b);
    p.addScaledVector(port, c2);
    if (y !== null) p.setY(y);
    return p;
  };
  // The machinery house, the counterweight behind, the cab at port front.
  const house = from(P, -0.25, 0, 0, 9.15);
  obox(house, head, Y, 2.8, 1.4, 1.8, yellow);
  obox(from(house, 0, 0, 0, 9.9), head, Y, 2.5, 0.1, 1.6, dark);
  for (let k = 0; k < 4; k += 1) {
    obox(from(house, -0.9 + k * 0.5, 0.91), head, Y, 0.3, 0.9, 0.04, soot);
  }
  const weight = from(P, -1.75, 0, 0, 9.0);
  obox(weight, head, Y, 0.7, 1.15, 2.1, dark);
  for (let k = 0; k < 5; k += 1) {
    const stripe = from(weight, -0.36, -0.84 + k * 0.42);
    obox(stripe, head, Y, 0.03, 1.0, 0.2, k % 2 ? soot : yellow);
  }
  const cab = from(P, 0.75, 0, 1.35, 9.05);
  obox(cab, head, Y, 1.25, 1.2, 0.95, yellow);
  obox(from(cab, 0, 0, 0, 9.69), head, Y, 1.35, 0.08, 1.05, dark);
  const pane = paint(GLASS, 1.1);
  obox(from(cab, 0.63, 0, 0, 9.17), head, Y, 0.03, 0.6, 0.8, pane, 'windows');
  obox(from(cab, 0, 0, 0.48, 9.17), head, Y, 0.95, 0.5, 0.03, pane, 'windows');
  lamp('lamps', from(cab, 0, 0, 0, 9.73), Y, C.amber, { size: 0.1, spill: 0 });
  // The lattice boom: four chords tapering from heel to head, laced.
  const heel = from(P, 1.15, 0, 0, 9.35);
  const sheave = V(loadX, 12.1, loadZ);
  const reach = sheave.clone().addScaledVector(head, -0.3).sub(heel);
  const length = reach.length();
  const along = reach.normalize();
  const bs = new THREE.Vector3().crossVectors(along, Y).normalize();
  const bu = new THREE.Vector3().crossVectors(bs, along).normalize();
  const at = (t, a, b) => {
    const w = 0.5 * (1 - t) + 0.22 * t;
    const p = heel.clone().addScaledVector(along, length * t);
    return p.addScaledVector(bs, a * w).addScaledVector(bu, b * w);
  };
  const chords = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];
  chords.forEach(([a, b]) =>
    hull(tube(at(0, a, b), at(1, a, b), 0.085, 6), yellow)
  );
  const n = 10;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    chords.forEach(([a, b], k) => {
      const [c, d] = chords[(k + 1) % 4];
      rod(at(t, a, b), at(t, c, d), 0.035, yellow);
      if (i === n) return;
      const [p, q] =
        (i + k) % 2
          ? [at(t, a, b), at(t + 1 / n, c, d)]
          : [at(t, c, d), at(t + 1 / n, a, b)];
      rod(p, q, 0.03, yellow);
    });
  }
  // Heel pins, the head and its sheaves.
  [-1, 1].forEach((k) =>
    obox(at(0, k * 1.15, -0.6), along, bu, 0.5, 0.5, 0.2, dark)
  );
  const tip = at(1, 0, 0).addScaledVector(along, 0.15);
  obox(tip, along, bu, 0.55, 0.55, 0.5, yellow);
  [-0.12, 0.12].forEach((o) => {
    const c = sheave.clone().addScaledVector(bs, o);
    const [a, b] = [
      c.clone().addScaledVector(bs, -0.04),
      c.clone().addScaledVector(bs, 0.04),
    ];
    hull(tube(a, b, 0.34, 12), dark, { smooth: true });
  });
  const tipLight = at(1, 0, -1.2).addScaledVector(along, 0.2);
  lamp('floods', tipLight, V(0, -1, 0), C.flood, { size: 0.16, spill: 0 });
  // The A-frame on the house and the luffing ropes to the boom.
  const apex = from(P, -0.6, 0, 0, 11.6);
  [-0.75, 0.75].forEach((o) => {
    const top = from(apex, 0, o * 0.4);
    hull(tube(from(house, 0.7, o, 0, 9.85), top, 0.08, 4), yellow);
    hull(tube(from(house, -1.2, o, 0, 9.85), top, 0.06, 4), yellow);
    rod(from(apex, 0, o * 0.3), at(0.62, Math.sign(o), 1), 0.025, steel, metal);
  });
  hull(tube(from(apex, 0, -0.4), from(apex, 0, 0.4), 0.12, 6), dark);
  lamp('beacons', from(apex, 0, 0, 0, 11.72), Y, C.beacon, {
    size: 0.1,
    spill: 0,
  });
  // The falls, the hook block, the slings and the spreader on the load.
  const bottom = 6.9;
  const lid = bottom + BOX.h;
  const block = lid + 0.85;
  const [sx, sz] = [sheave.x, sheave.z];
  [-0.12, 0.12].forEach((o) => {
    const a = sheave
      .clone()
      .addScaledVector(bs, o)
      .add(V(0, -0.3, 0));
    const b = V(sx, block + 0.55, sz).addScaledVector(bs, o);
    rod(a, b, 0.025, steel, metal);
  });
  B(sx - 0.25, sx + 0.25, block, block + 0.6, sz - 0.18, sz + 0.18, yellow);
  B(sx - 0.27, sx + 0.27, block + 0.15, block + 0.3, sz - 0.2, sz + 0.2, soot);
  B(sx - 0.06, sx + 0.06, block - 0.25, block, sz - 0.06, sz + 0.06, dark);
  const [lx0, lx1] = [sx - BOX.short / 2, sx + BOX.short / 2];
  container(lx0, lx1, bottom, sz, true);
  B(lx0 + 0.05, lx1 - 0.05, lid, lid + 0.14, sz - 1.05, sz + 1.05, yellow);
  B(lx0 + 0.6, lx1 - 0.6, lid + 0.14, lid + 0.24, sz - 0.3, sz + 0.3, dark);
  [-1, 1].forEach((dx) =>
    [-1, 1].forEach((dz) => {
      const a = V(sx + dx * 1.35, lid + 0.14, sz + dz * 0.9);
      rod(a, V(sx, block - 0.22, sz), 0.022, steel, metal);
    })
  );

  // --- The hangar under the spine: the drones leave by its forward mouth -------
  const shell = [
    [-3.9, -6.4],
    [3.9, -6.4],
    [3.9, -7.6],
    [3.25, -8.2],
    [-3.25, -8.2],
    [-3.9, -7.6],
  ];
  const opening = rect(-BAY_Z, BAY_Z, BAY_Y[0], BAY_Y[1]);
  hull(cross(shell, AFT, MOUTH, [opening]), grey);
  hull(cross(shell, AFT - 0.3, AFT), dark);
  // Ribs round the shell, windows between them on the flanks.
  const rib = shell.map(([z, y]) => [z * 1.03, y < -7 ? y - 0.04 : y]);
  for (let x = AFT + 0.4; x < MOUTH - 0.6; x += 1.5) {
    hull(cross(rib, x, x + 0.18, [opening]), mid);
  }
  for (let x = AFT + 0.8; x < 11.5; x += 1.5) {
    B(x + 0.1, x + 0.9, -7.1, -6.85, 3.9, 3.95, soot, both);
    const pane = box(x + 0.18, x + 0.82, -7.06, -6.89, 3.95, 3.97);
    glow('windows', pane, paint(GLASS, 0.4 + random() * 0.5), both);
  }
  // Inside: the back wall lit, wall frames, a dark floor with guide lights
  // running out to the mouth, light strips overhead.
  const [floor, roof] = BAY_Y;
  const back = 7.2;
  B(back - 0.2, back, floor, roof, -BAY_Z, BAY_Z, mid);
  const wall = box(back, back + 0.03, -7.25, -7.0, -2.2, 2.2);
  glow('windows', wall, paint(GLASS, 0.9));
  B(back, MOUTH, floor, floor + 0.03, -BAY_Z, BAY_Z, soot);
  for (let x = back + 0.6; x < MOUTH - 0.3; x += 1.1) {
    B(x, x + 0.16, floor, roof, BAY_Z - 0.14, BAY_Z, dark, both);
    B(x, x + 0.16, roof - 0.12, roof, -BAY_Z, BAY_Z, dark);
    const guide = box(
      x + 0.2,
      x + 0.34,
      floor + 0.03,
      floor + 0.06,
      1.85,
      1.95
    );
    glow('lamps', guide, paint(C.glass, 2.0), both);
  }
  const strip = box(back + 0.3, MOUTH - 0.3, roof - 0.02, roof, 1.02, 1.18);
  glow('windows', strip, paint(C.flood, 1.3), both);
  // The mouth: a dark frame, hazard-striped jambs and sill, a lit lintel,
  // the door tracks, the doors run back against the jambs.
  const frame = [
    [-3.95, -6.4],
    [3.95, -6.4],
    [3.95, -7.65],
    [3.3, -8.2],
    [-3.3, -8.2],
    [-3.95, -7.65],
  ];
  // Its opening reaches a hair up into the orange block over the mouth, so
  // the block's underside alone draws the opening's top.
  const hole = rect(-BAY_Z, BAY_Z, floor, roof + 0.01);
  hull(cross(frame, MOUTH, MOUTH + 0.3, [hole]), dark);
  const front = MOUTH + 0.3;
  const back3 = V(0, 0, -1);
  hazard(V(front, floor, 3.9), back3, Y, 3.9 - BAY_Z, roof - floor);
  hazard(V(front, floor, -BAY_Z), back3, Y, 3.9 - BAY_Z, roof - floor);
  hazard(V(front, -8.15, 3.3), back3, Y, 6.6, floor + 8.15);
  B(MOUTH, front + 0.06, roof, -6.4, -3.95, 3.95, orange);
  const lintel = box(
    front + 0.06,
    front + 0.09,
    roof + 0.1,
    roof + 0.22,
    -2.9,
    2.9
  );
  glow('windows', lintel, paint(C.glass, 1.6));
  [roof - 0.06, floor + 0.06].forEach((y) =>
    B(MOUTH - 0.08, MOUTH + 0.02, y - 0.04, y + 0.04, -3.6, 3.6, steel, metal)
  );
  const [d0, d1] = [BAY_Z - 0.55, BAY_Z - 0.02];
  B(MOUTH - 0.12, MOUTH - 0.02, floor, roof, d0, d1, mid, both);
  for (let y = floor + 0.25; y < roof; y += 0.35) {
    B(
      MOUTH - 0.14,
      MOUTH - 0.12,
      y,
      y + 0.04,
      d0 + 0.05,
      d1 - 0.05,
      dark,
      both
    );
  }
  [1, -1].forEach((s) => {
    lamp('lamps', V(front + 0.06, -6.55, 3.6 * s), X, C.amber, {
      size: 0.14,
      spill: 0.8,
    });
    lamp('lamps', V(front, floor + 0.35, 3.55 * s), X, C.beacon, {
      size: 0.09,
      spill: 0,
    });
    // The guide rail's lights run out under the bow's foot.
    for (let x = front + 0.5; x < X1; x += 1.0) {
      lamp('floods', V(x, -7.8, 0.3 * s), Y, C.glass, { size: 0.07, spill: 0 });
    }
  });
  B(front, X1, -7.95, -7.8, -0.4, 0.4, steel, metal);
  B(front, X1, -8.2, -7.95, -1.2, 1.2, mid);
  // The control cabin on the port flank, glazed forward and outboard.
  const [c0, c1] = [12.2, 15.4];
  const cabin = [
    [-3.9, -6.45],
    [-4.45, -6.45],
    [-4.85, -6.85],
    [-4.85, -7.35],
    [-4.45, -7.75],
    [-3.9, -7.75],
  ];
  hull(cross(cabin, c0, c1), paint(C.light));
  const glazing = [V(c0 + 0.2, -6.5, -4.47), V(c1 - 0.2, -6.5, -4.47)];
  glazing.push(V(c1 - 0.2, -6.82, -4.8), V(c0 + 0.2, -6.82, -4.8));
  const inside = V((c0 + c1) / 2, -6.0, -3.5);
  glow('windows', plate(glazing, 0.01, 0.02, 0, inside), paint(GLASS, 1.2));
  for (let x = c0 + 0.7; x < c1 - 0.3; x += 0.75) {
    B(x, x + 0.07, -6.85, -6.47, -4.83, -4.45, dark);
  }
  glow('windows', box(c1, c1 + 0.03, -7.2, -6.8, -4.6, -4.0), paint(GLASS));
  B(c0 + 0.3, c1 - 0.3, -7.85, -7.75, -4.6, -3.95, dark);
  lamp('beacons', V(c1 - 0.3, -7.85, -4.3), V(0, -1, 0), C.beacon, {
    size: 0.08,
    spill: 0,
  });
  rod(V(c0 + 0.5, -7.35, -4.85), V(c0 + 0.5, -7.35, -5.4), 0.03, steel, metal);
  return { hangar: [MOUTH + 0.3, -7.2, 0] };
}
