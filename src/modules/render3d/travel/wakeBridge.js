// src/modules/render3d/travel/wakeBridge.js
//
// The Wake's bridge (wakeStern.js): three houses stacked on the stern's
// deck, stepping in, each under a walkway with handrails, brackets and deck
// lamps, stairs between them, lifeboats on the lowest; the glazed wheelhouse
// leaning out over them under a visor, its wings out to the sides; on its
// roof a small upper house, radar, domes, a dish and a forest of masts; the
// funnel behind.

import {
  ENGINE_BLOCK as BLOCK,
  STEEL,
  STERN_DECK as DECK,
  WAKE_COLORS as C,
} from './wakeHull.js';

const GLASS = ['#8fd4ff', '#6cc4ff', '#a8e2ff'];
const WARM = '#ffc983';
const DARK_PANE = '#101b26';
const DOOR = '#2a2d31';

export function buildBridge(kit) {
  const { THREE, V, add, box, body, plate, tube, lathe, lamp, railing } = kit;
  const { paint, random } = kit;
  const steel = paint(C.steel);
  const UP = V(0, 1, 0);
  const DOWN = V(0, -1, 0);
  const hb = (css, ...b) => add('hull', box(...b), paint(css));
  const hm = (css, ...b) =>
    add('hull', box(...b), paint(css), { mirror: true });

  // A plan with its forward corners cut.
  const plan = (x0, x1, hz, cut) => [
    [x0, -hz],
    [x1 - cut, -hz],
    [x1, -hz + cut],
    [x1, hz - cut],
    [x1 - cut, hz],
    [x0, hz],
  ];
  const house = (x0, x1, hz, cut, y0, y1, css) =>
    add('hull', kit.slab(plan(x0, x1, hz, cut), y0, y1, 0.08), paint(css));
  // The same plan as a path at height y, aft port round the front to aft
  // starboard.
  const loop = (x0, x1, hz, cut, y) =>
    plan(x0, x1, hz, cut).map(([x, z]) => V(x, y, z));
  const rod = (a, b, r, css, sides = 4) =>
    add('hull', tube(a, b, r, sides, true), paint(css));
  const pane = (gain = 1) =>
    random() < 0.78
      ? paint(GLASS[Math.floor(random() * 3)], (0.45 + random() * 0.8) * gain)
      : paint(WARM, (0.5 + random() * 0.6) * gain);

  // A wall to dress: `box(a0, a1, y0, y1, d0, d1)` spans a0..a1 along it and
  // d0..d1 out of it; `pt(a, y, d)` is a point on it; `n` its outward normal.
  const sideWall = (hz, s) => ({
    box: (a0, a1, y0, y1, d0, d1) =>
      box(a0, a1, y0, y1, (hz + d0) * s, (hz + d1) * s),
    pt: (a, y, d) => V(a, y, (hz + d) * s),
    n: V(0, 0, s),
    front: false,
  });
  const frontWall = (x) => ({
    box: (a0, a1, y0, y1, d0, d1) => box(x + d0, x + d1, y0, y1, a0, a1),
    pt: (a, y, d) => V(x + d, y, a),
    n: V(1, 0, 0),
    front: true,
  });

  // Fittings along a wall from a0 to a1, between y0 and y1: small windows in
  // framed groups, portholes, doors with a lamp over them, lockers, vents,
  // life rings, pipes and pilasters.
  const facade = (wall, a0, a1, y0, y1, doors = true) => {
    const put = (geometry, css, gain) =>
      add('hull', geometry, paint(css, gain));
    const tall = y1 - y0;
    put(wall.box(a0, a1, y0, y0 + 0.16, 0, 0.07), C.dark);
    put(wall.box(a0, a1, y1 - 0.12, y1, 0, 0.05), C.grey);
    if (random() < 0.6)
      add(
        'hull',
        tube(wall.pt(a0, y1 - 0.34, 0.1), wall.pt(a1, y1 - 0.34, 0.1), 0.05, 5),
        paint(random() < 0.3 ? C.orange : C.dark)
      );
    let a = a0 + 0.3 + random() * 0.5;
    while (a < a1 - 0.6) {
      const r = random();
      if (r < 0.3) {
        // Two to four small windows in a dark frame under a hood.
        const n = 2 + Math.floor(random() * 3);
        const w = 0.26 + random() * 0.14;
        const h = 0.2 + random() * 0.14;
        const yw = y0 + tall * 0.5 + random() * 0.2;
        const span = n * (w + 0.1) + 0.1;
        if (a + span > a1 - 0.3) break;
        put(wall.box(a, a + span, yw - 0.07, yw + h + 0.07, 0, 0.05), C.soot);
        put(
          wall.box(
            a - 0.05,
            a + span + 0.05,
            yw + h + 0.07,
            yw + h + 0.13,
            0,
            0.16
          ),
          C.mid
        );
        for (let k = 0; k < n; k += 1) {
          const c = a + 0.1 + k * (w + 0.1);
          const g = wall.box(c, c + w, yw, yw + h, 0.05, 0.075);
          if (random() < 0.18) add('hull', g, paint(DARK_PANE));
          else add('windows', g, pane(), { uv: false });
        }
        a += span + 0.35 + random() * 0.4;
      } else if (r < 0.42) {
        // A pair of portholes.
        const yp = y0 + tall * 0.55;
        [0, 0.55].forEach((da) => {
          put(
            tube(wall.pt(a + da, yp, 0), wall.pt(a + da, yp, 0.06), 0.16, 8),
            C.dark
          );
          const g = tube(
            wall.pt(a + da, yp, 0.06),
            wall.pt(a + da, yp, 0.075),
            0.11,
            8
          );
          if (random() < 0.25) add('hull', g, paint(DARK_PANE));
          else add('windows', g, pane(0.9), { uv: false });
        });
        a += 1.2;
      } else if (r < 0.52 && doors) {
        // A door: frame, leaf, a sign plate and a lamp over it.
        put(wall.box(a, a + 0.9, y0 + 0.16, y0 + 1.62, 0, 0.06), C.dark);
        put(
          wall.box(a + 0.08, a + 0.82, y0 + 0.2, y0 + 1.54, 0.06, 0.08),
          DOOR
        );
        put(
          wall.box(a + 0.6, a + 0.74, y0 + 0.8, y0 + 0.9, 0.08, 0.12),
          C.steel
        );
        put(
          wall.box(a + 0.15, a + 0.75, y0 + 1.3, y0 + 1.45, 0.08, 0.09),
          C.white
        );
        put(wall.box(a, a + 0.9, y0 + 1.64, y0 + 1.7, 0, 0.22), C.mid);
        lamp('lamps', wall.pt(a + 0.45, y0 + 1.64, 0.14), DOWN, C.amber, {
          size: 0.09,
          gain: 2.4,
          spill: 0,
        });
        a += 1.4 + random() * 0.5;
      } else if (r < 0.64) {
        // A locker, its lid line and a handle.
        const h = 0.6 + random() * 0.4;
        put(
          wall.box(a, a + 0.9, y0 + 0.16, y0 + 0.16 + h, 0, 0.3),
          random() < 0.5 ? C.mid : C.grey
        );
        put(
          wall.box(a + 0.04, a + 0.86, y0 + h - 0.02, y0 + h + 0.02, 0.3, 0.32),
          C.soot
        );
        if (random() < 0.3)
          put(
            wall.box(a, a + 0.9, y0 + 0.16 + h, y0 + 0.24 + h, 0, 0.32),
            C.orange
          );
        a += 1.15;
      } else if (r < 0.75) {
        // A louvred vent.
        const top = y1 - 0.45;
        put(wall.box(a, a + 0.75, top - 0.5, top, 0, 0.08), C.soot);
        for (let k = 0; k < 4; k += 1) {
          const yk = top - 0.44 + k * 0.12;
          put(wall.box(a + 0.04, a + 0.71, yk, yk + 0.05, 0.08, 0.16), C.grey);
        }
        a += 1.05;
      } else if (r < 0.83) {
        // A life ring in its bracket.
        const buoy = new THREE.TorusGeometry(0.22, 0.06, 4, 10);
        if (wall.front) buoy.rotateY(Math.PI / 2);
        const p = wall.pt(a + 0.25, y0 + tall * 0.55, 0.08);
        buoy.translate(p.x, p.y, p.z);
        add('hull', buoy, paint(C.orange), { smooth: true });
        put(
          wall.box(
            a + 0.2,
            a + 0.3,
            y0 + tall * 0.55 + 0.16,
            y0 + tall * 0.55 + 0.3,
            0,
            0.12
          ),
          C.dark
        );
        a += 0.8;
      } else if (r < 0.92) {
        // Pipes up the wall, with clamps.
        [0, 0.2].forEach((da, k) => {
          const css = k && random() < 0.5 ? C.orange : C.dark;
          add(
            'hull',
            tube(
              wall.pt(a + da, y0, 0.12),
              wall.pt(a + da, y1, 0.12),
              0.055,
              5,
              true
            ),
            paint(css)
          );
        });
        for (let y = y0 + 0.5; y < y1 - 0.2; y += 0.7)
          put(wall.box(a - 0.08, a + 0.28, y, y + 0.06, 0, 0.2), C.mid);
        a += 0.65;
      } else {
        put(wall.box(a, a + 0.18, y0, y1, 0, 0.09), C.grey);
        a += 0.5;
      }
    }
  };

  // A house's two sides and its front dressed.
  const dress = (x0, x1, hz, cut, y0, y1, doors = true) => {
    [1, -1].forEach((s) =>
      facade(sideWall(hz, s), x0 + 0.3, x1 - cut - 0.2, y0, y1, doors)
    );
    facade(frontWall(x1), -hz + cut + 0.3, hz - cut - 0.3, y0, y1, false);
  };

  // A walkway: its plate, a fascia, brackets under it out to the plate's
  // edge from the wall, a handrail round its edge, deck lamps underneath.
  const walkway = (x0, x1, hz, cut, y, wall, rail) => {
    house(x0, x1, hz, cut, y, y + 0.14, C.mid);
    hm(C.dark, x0, x1 - cut, y - 0.1, y, hz - 0.1, hz);
    for (let x = x0 + 0.7; x < x1 - cut - 0.2; x += 1.7)
      add(
        'hull',
        kit.cross(
          [
            [wall, y],
            [hz - 0.12, y],
            [wall, y - 0.5],
          ],
          x,
          x + 0.1
        ),
        paint(C.dark),
        { mirror: true }
      );
    if (rail)
      railing(
        'hull',
        loop(x0 + 0.15, x1 - 0.06, hz - 0.06, cut, y + 0.14),
        rail,
        {
          height: 0.72,
          step: 0.95,
          shine: STEEL,
        }
      );
    [1, -1].forEach((s) => {
      for (
        let x = x0 + 1.4 + random();
        x < x1 - cut - 1;
        x += 3.2 + random() * 1.5
      )
        lamp('lamps', V(x, y - 0.02, (wall + 0.25) * s), DOWN, C.amber, {
          size: 0.1,
          gain: 2.2,
          spill: 0,
        });
    });
  };

  // Stairs from (xa, ya) up to (xb, yb), from z0 to z1, both sides.
  const stairs = (xa, ya, xb, yb, z0, z1) => {
    const opt = { mirror: true };
    [z0, z1].forEach((z) =>
      add(
        'hull',
        tube(V(xa, ya, z), V(xb, yb, z), 0.045, 4, true),
        paint(C.dark),
        opt
      )
    );
    add(
      'hull',
      tube(V(xa, ya + 0.8, z1), V(xb, yb + 0.8, z1), 0.03, 4, true),
      steel,
      { ...opt, shine: STEEL }
    );
    add(
      'hull',
      tube(V(xa, ya, z1), V(xa, ya + 0.8, z1), 0.03, 4, true),
      steel,
      opt
    );
    const n = Math.round((yb - ya) / 0.24);
    for (let i = 0; i < n; i += 1) {
      const t = (i + 0.5) / n;
      const x = xa + (xb - xa) * t;
      const y = ya + (yb - ya) * t;
      add(
        'hull',
        box(x - 0.13, x + 0.13, y - 0.03, y + 0.02, z0, z1),
        paint(C.mid),
        opt
      );
    }
  };
  // A ladder on an aft face at x, centred on z, from ya to yb.
  const ladder = (x, z, ya, yb) => {
    [-0.22, 0.22].forEach((dz) =>
      rod(V(x - 0.12, ya, z + dz), V(x - 0.12, yb + 0.6, z + dz), 0.035, C.dark)
    );
    for (let y = ya + 0.25; y < yb; y += 0.3)
      rod(V(x - 0.12, y, z - 0.22), V(x - 0.12, y, z + 0.22), 0.02, C.steel);
  };

  // --- Three houses stepping in, each under a walkway --------------------------
  const L1 = DECK + 2.1;
  house(-35.6, -16.4, 5.0, 1.4, DECK, L1, C.light);
  dress(-35.6, -16.4, 5.0, 1.4, DECK, L1);
  walkway(-36, -15.7, 5.5, 1.7, L1, 5.0, paint(C.yellow));

  const W1 = L1 + 0.14;
  const L2 = W1 + 1.96;
  house(-35, -17.4, 4.5, 1.3, W1, L2, C.grey);
  dress(-35, -17.4, 4.5, 1.3, W1, L2);
  hm(C.orange, -35, -18.7, L2 - 0.42, L2 - 0.26, 4.5, 4.56);
  walkway(-35.4, -16.8, 5.05, 1.6, L2, 4.5, steel);

  const W2 = L2 + 0.14;
  const L3 = W2 + 1.86;
  house(-34.2, -18.6, 4.0, 1.2, W2, L3, C.light);
  dress(-34.2, -18.6, 4.0, 1.2, W2, L3);
  walkway(-34.6, -18, 4.6, 1.5, L3, 4.0, null);
  [1, -1].forEach((s) =>
    railing(
      'hull',
      [
        V(-25.6, L3 + 0.14, 4.54 * s),
        V(-34.45, L3 + 0.14, 4.54 * s),
        V(-34.45, L3 + 0.14, 0),
      ],
      steel,
      {
        height: 0.72,
        shine: STEEL,
      }
    )
  );

  const W3 = L3 + 0.14;
  stairs(-23.2, DECK, -20.6, W1, 5.55, 5.95);
  stairs(-31, W1, -28.4, W2, 5.08, 5.46);
  stairs(-32.2, W2, -29.8, W3, 4.62, 4.98);
  ladder(-35.6, 1.6, DECK, L1);
  ladder(-35, -1.2, W1, L2);
  ladder(-34.2, 2.0, W2, L3);

  // Lifeboats on the lowest walkway, in davits from the one above.
  [-31.6, -26.8].forEach((x) => {
    add(
      'hull',
      lathe(
        [
          [0.01, 0],
          [0.28, 0.12],
          [0.44, 0.55],
          [0.46, 1.4],
          [0.44, 2.25],
          [0.28, 2.66],
          [0.01, 2.8],
        ],
        10,
        V(x, W1 + 0.55, 5.1),
        V(1, 0, 0)
      ),
      paint(C.orange),
      { mirror: true, smooth: true }
    );
    add(
      'hull',
      tube(
        V(x + 0.4, W1 + 0.5, 5.1),
        V(x + 2.4, W1 + 0.5, 5.1),
        0.47,
        10,
        true
      ),
      paint(C.white),
      { mirror: true }
    );
    hm(C.dark, x + 0.9, x + 1.9, W1 + 0.92, W1 + 1.06, 4.85, 5.35);
    [0.45, 2.35].forEach((dx) => {
      add(
        'hull',
        tube(V(x + dx, L2, 4.62), V(x + dx, L2 - 0.15, 5.25), 0.05, 4, true),
        paint(C.dark),
        { mirror: true }
      );
      add(
        'hull',
        tube(
          V(x + dx, L2 - 0.15, 5.1),
          V(x + dx, W1 + 1.0, 5.1),
          0.015,
          4,
          true
        ),
        steel,
        { mirror: true }
      );
      hm(C.dark, x + dx - 0.06, x + dx + 0.06, W1, W1 + 0.2, 4.7, 5.45);
    });
  });

  // --- The wheelhouse: leaning out, glazed round its front, a visor over -------
  const y0 = W3;
  const y1 = y0 + 2.75;
  const ring = (y, front, hz, back, cut) => [
    V(back, y, -hz),
    V(front - cut, y, -hz),
    V(front, y, -hz + cut),
    V(front, y, hz - cut),
    V(front - cut, y, hz),
    V(back, y, hz),
  ];
  const low = ring(y0, -19.4, 4.3, -32, 1.7);
  const high = ring(y1, -18.2, 5.2, -32, 2.0);
  add('hull', body([low, high]), paint(C.light));
  const centre = V(-25, y0 + 1, 0);
  // Each face's outward normal (level).
  const normal = (e) => {
    const d = low[e + 1].clone().sub(low[e]);
    const n = V(-d.z, 0, d.x).normalize();
    const mid = low[e]
      .clone()
      .add(low[e + 1])
      .multiplyScalar(0.5)
      .sub(centre);
    return n.dot(mid) < 0 ? n.negate() : n;
  };
  // Panes across each glazed face (the first and last are the after parts
  // of the sides, glazed only at their forward ends), set in a dark band,
  // with mullions, a sill, a head, a transom and wipers on the front ones.
  [
    [0, 0.52, 1, 5],
    [1, 0, 1, 3],
    [2, 0, 1, 7],
    [3, 0, 1, 3],
    [4, 0, 0.48, 5],
  ].forEach(([edge, from, to, panes]) => {
    const n = normal(edge);
    const at = (f, t) =>
      low[edge]
        .clone()
        .lerp(low[edge + 1], f)
        .lerp(high[edge].clone().lerp(high[edge + 1], f), t);
    const off = (p, d) => p.addScaledVector(n, d);
    add(
      'hull',
      plate(
        [at(from, 0.36), at(to, 0.36), at(to, 0.94), at(from, 0.94)],
        0,
        0.02,
        0,
        centre
      ),
      paint(C.soot)
    );
    // Plating under the glass: a raised panel and an orange sill line.
    add(
      'hull',
      plate(
        [at(from, 0.04), at(to, 0.04), at(to, 0.3), at(from, 0.3)],
        0,
        0.07,
        0.1,
        centre
      ),
      paint(edge === 2 ? C.white : C.light)
    );
    rod(off(at(from, 0.33), 0.03), off(at(to, 0.33), 0.03), 0.04, C.orange);
    // The sides' after parts: a framed band of small windows.
    if (edge === 0 || edge === 4) {
      const [b0, b1] = edge ? [0.53, 0.76] : [0.24, 0.47];
      const side = (f0, f1, t0, t1) => [
        at(f0, t0),
        at(f1, t0),
        at(f1, t1),
        at(f0, t1),
      ];
      add(
        'hull',
        plate(side(b0, b1, 0.5, 0.78), 0, 0.03, 0, centre),
        paint(C.soot)
      );
      for (let f = b0 + 0.02; f < b1 - 0.04; f += 0.065) {
        if (random() < 0.3) continue;
        add(
          'windows',
          plate(side(f, f + 0.045, 0.55, 0.73), 0.03, 0.02, 0, centre),
          pane(),
          {
            uv: false,
          }
        );
      }
    }
    for (let p = 0; p < panes; p += 1) {
      const f0 = from + ((to - from) * p) / panes;
      const f1 = from + ((to - from) * (p + 1)) / panes;
      const quad = (t0, t1) => [at(f0, t0), at(f1, t0), at(f1, t1), at(f0, t1)];
      if (random() < 0.1) {
        add(
          'hull',
          plate(quad(0.4, 0.9), 0.02, 0.03, 0.05, centre),
          paint(DARK_PANE)
        );
      } else {
        // Consoles glow low down; the glass goes deep blue above them.
        const level = 0.5 + random() * 0.8;
        const css = GLASS[Math.floor(random() * 3)];
        [
          [0.4, 0.52, css, 1.2],
          [0.52, 0.7, '#2f9cf0', 0.6],
          [0.7, 0.9, '#1a4f86', 0.45],
        ].forEach(([t0, t1, c, gain]) =>
          add(
            'windows',
            plate(quad(t0, t1), 0.02, 0.03, 0.05, centre),
            paint(c, gain * level),
            { uv: false }
          )
        );
      }
      if (edge > 0 && edge < 4 && random() < 0.3) {
        const fm = (f0 + f1) / 2;
        rod(
          off(at(fm - (f1 - f0) * 0.1, 0.42), 0.07),
          off(at(fm + (f1 - f0) * 0.2, 0.62), 0.07),
          0.022,
          C.soot
        );
      }
    }
    for (let p = 0; p <= panes; p += 1) {
      const f = from + ((to - from) * p) / panes;
      rod(off(at(f, 0.36), 0.04), off(at(f, 0.94), 0.04), 0.055, C.dark);
    }
    [
      [0.36, 0.08],
      [0.63, 0.03],
      [0.94, 0.07],
    ].forEach(([t, r]) =>
      rod(off(at(from, t), 0.04), off(at(to, t), 0.04), r, C.dark)
    );
  });
  // The visor: a skirt sloping out and down over the glazed faces, its edge
  // orange, lamps under it.
  const skirt = [
    [
      low[0].clone().lerp(low[1], 0.5),
      high[0].clone().lerp(high[1], 0.5),
      0,
      0.25,
    ],
    [low[1], high[1], 0, 1],
    [low[2], high[2], 1, 2],
    [low[3], high[3], 2, 3],
    [low[4], high[4], 3, 4],
    [
      low[4].clone().lerp(low[5], 0.5),
      high[4].clone().lerp(high[5], 0.5),
      4,
      0.25,
    ],
  ].map(([, h, a, b]) => {
    const n =
      b < 1
        ? normal(a).multiplyScalar(b * 3)
        : normal(a).add(normal(b)).normalize().multiplyScalar(1.05);
    return [
      h,
      h
        .clone()
        .addScaledVector(n, 0.75)
        .add(V(0, -0.24, 0)),
    ];
  });
  for (let i = 0; i + 1 < skirt.length; i += 1) {
    const [a, b] = [skirt[i], skirt[i + 1]];
    add(
      'hull',
      plate([a[0], b[0], b[1], a[1]], 0, 0.18, 0, V(-25, y1 - 6, 0)),
      paint(C.grey)
    );
    rod(a[1], b[1], 0.06, C.orange);
    if (i > 0 && i < 4)
      [0.3, 0.7].forEach((t) =>
        lamp(
          'lamps',
          a[0]
            .clone()
            .lerp(a[1], 0.55)
            .lerp(b[0].clone().lerp(b[1], 0.55), t)
            .add(V(0, -0.16, 0)),
          DOWN,
          '#ffe2b0',
          { size: 0.09, gain: 2.4, spill: 0 }
        )
      );
  }
  // The roof, its rail, the side pods at the wheelhouse's after corners.
  house(-32.4, -18.2, 5.3, 2.0, y1, y1 + 0.34, C.grey);
  const roof = y1 + 0.34;
  railing('hull', loop(-32.2, -18.6, 5.1, 1.9, roof), steel, {
    height: 0.6,
    step: 1.1,
    shine: STEEL,
  });
  [1, -1].forEach((s) => {
    hb(C.mid, -31.6, -29.2, y0, y1 - 0.1, 4.3 * s, 4.9 * s);
    hb(C.orange, -31.6, -29.2, y1 - 0.5, y1 - 0.36, 4.9 * s, 4.95 * s);
    lamp('lamps', V(-29.3, y1 - 0.1, 4.7 * s), V(0.6, -0.3, 0.6 * s), C.amber, {
      size: 0.12,
      spill: 0,
      gain: 2.6,
    });
  });

  // --- The bridge wings, out to the sides at the wheelhouse's foot ------------
  [1, -1].forEach((s) => {
    hb(C.mid, -25.6, -19.4, L3, W3, 4.4 * s, 7.0 * s);
    hb(C.orange, -25.6, -19.4, L3 - 0.1, L3, 6.9 * s, 7.0 * s);
    [-24.8, -20.2].forEach((x) =>
      rod(V(x, L3, 6.7 * s), V(x, L3 - 1.1, 4.05 * s), 0.07, C.dark)
    );
    railing(
      'hull',
      [V(-25.5, W3, 6.92 * s), V(-19.5, W3, 6.92 * s), V(-19.5, W3, 5.2 * s)],
      steel,
      { height: 0.72, shine: STEEL }
    );
    // A wing cab at the wing's end: glazed forward and outboard, an orange
    // side panel, a searchlight on its roof.
    const cab = [-21.9, -19.5, W3, W3 + 1.5, 5.5 * s, 6.95 * s];
    hb(C.light, ...cab);
    hb(C.mid, -22, -19.4, W3 + 1.5, W3 + 1.62, 5.4 * s, 7.05 * s);
    hb(C.orange, -21.9, -20.9, W3 + 0.1, W3 + 1.4, 6.95 * s, 7.0 * s);
    hb(C.soot, -19.5, -19.46, W3 + 0.75, W3 + 1.38, 5.6 * s, 6.85 * s);
    hb(C.soot, -20.8, -19.6, W3 + 0.75, W3 + 1.38, 6.95 * s, 6.99 * s);
    [5.65, 6.07, 6.49].forEach((z) =>
      add(
        'windows',
        box(-19.46, -19.43, W3 + 0.8, W3 + 1.33, z * s, (z + 0.34) * s),
        pane(1.2),
        {
          uv: false,
        }
      )
    );
    [-20.75, -20.2].forEach((x) =>
      add(
        'windows',
        box(x, x + 0.48, W3 + 0.8, W3 + 1.33, 6.99 * s, 7.02 * s),
        pane(1.2),
        {
          uv: false,
        }
      )
    );
    rod(
      V(-20.4, W3 + 1.62, 6.2 * s),
      V(-20.4, W3 + 1.9, 6.2 * s),
      0.05,
      C.dark
    );
    add(
      'hull',
      lathe(
        [
          [0.16, 0],
          [0.22, 0.12],
          [0.22, 0.42],
          [0.25, 0.46],
        ],
        8,
        V(-20.6, W3 + 2.05, 6.2 * s),
        V(1, 0, 0)
      ),
      paint(C.dark),
      { smooth: true }
    );
    lamp('floods', V(-20.16, W3 + 2.05, 6.2 * s), V(1, 0, 0), C.flood, {
      size: 0.14,
      gain: 1.8,
      spill: 0,
    });
    lamp(
      'beacons',
      V(-21.4, W3 + 1.25, 7.0 * s),
      V(0, 0, s),
      s < 0 ? C.beacon : C.white,
      {
        size: 0.12,
        gain: 2.6,
        spill: 0,
      }
    );
    lamp('lamps', V(-22.5, L3 - 0.12, 6.2 * s), DOWN, C.amber, {
      spill: 0,
      size: 0.12,
    });
    lamp('floods', V(-18.6, roof, 4.3 * s), V(0.5, 1, 0), C.flood, {
      size: 0.12,
      gain: 1.5,
      spill: 0,
    });
  });

  // --- On the roof: an upper house, radar, domes, a dish, lockers --------------
  const F = roof + 1.2;
  house(-29.6, -21.8, 2.5, 0.6, roof, F, C.light);
  hb(C.mid, -29.8, -21.5, F, F + 0.12, -2.7, 2.7);
  hb(C.orange, -21.85, -21.8, F - 0.36, F - 0.24, -1.9, 1.9);
  railing('hull', loop(-29.6, -21.6, 2.6, 0.5, F + 0.12), steel, {
    height: 0.55,
    step: 1.2,
    shine: STEEL,
  });
  hb(C.soot, -21.8, -21.76, roof + 0.5, roof + 0.86, -1.5, 1.5);
  for (let z = -1.4; z < 1.3; z += 0.48)
    add(
      'windows',
      box(-21.76, -21.73, roof + 0.55, roof + 0.81, z, z + 0.38),
      pane(1.1),
      {
        uv: false,
      }
    );
  [1, -1].forEach((s) => {
    for (let x = -28.8; x < -22.8; x += 0.9 + random() * 0.8) {
      if (random() < 0.35) continue;
      add(
        'windows',
        box(x, x + 0.3, roof + 0.58, roof + 0.8, 2.5 * s, 2.53 * s),
        pane(),
        {
          uv: false,
        }
      );
    }
    // Domes on pedestals, aft.
    rod(V(-30.8, roof, 3.3 * s), V(-30.8, roof + 0.5, 3.3 * s), 0.2, C.dark, 6);
    add(
      'hull',
      lathe(
        [
          [0.01, 1.2],
          [0.45, 1.05],
          [0.66, 0.7],
          [0.7, 0.5],
          [0.62, 0.42],
        ],
        12,
        V(-30.8, roof, 3.3 * s),
        UP
      ),
      paint(C.white),
      { smooth: true }
    );
    // Lockers, air units.
    hb(C.mid, -24.6, -23.2, roof, roof + 0.6, 3.0 * s, 4.1 * s);
    hb(C.soot, -24.5, -23.3, roof + 0.6, roof + 0.66, 3.1 * s, 4.0 * s);
    hb(C.dark, -31.6, -30.8, roof, roof + 0.75, 0.6 * s, 1.8 * s);
    for (let k = 0; k < 4; k += 1)
      hb(
        C.grey,
        -31.65,
        -31.6,
        roof + 0.12 + k * 0.15,
        roof + 0.2 + k * 0.15,
        0.7 * s,
        1.7 * s
      );
    // Whip aerials.
    [
      [-19.6, 3.6, 4.2],
      [-27.4, 4.6, 5.6],
      [-32, 2.6, 4.6],
      [-22.4, 2.2, 3.2],
    ].forEach(([x, z, h]) => {
      rod(V(x, roof, z * s), V(x, roof + 0.3, z * s), 0.07, C.dark);
      add(
        'hull',
        tube(
          V(x, roof + 0.3, z * s),
          V(x - 0.35, roof + h, (z + 0.2) * s),
          0.025,
          4,
          true
        ),
        steel,
        { shine: STEEL }
      );
    });
  });
  // The forward radar on its pedestal.
  rod(V(-20.4, roof, 0), V(-20.4, roof + 0.9, 0), 0.16, C.dark, 6);
  hb(C.mid, -20.7, -20.1, roof + 0.9, roof + 1.15, -0.3, 0.3);
  hb(C.white, -20.55, -20.25, roof + 1.15, roof + 1.38, -1.8, 1.8);
  // A dish, tilted up to port.
  rod(V(-23.4, F + 0.12, -1.6), V(-23.4, F + 0.7, -1.6), 0.08, C.dark);
  add(
    'hull',
    lathe(
      [
        [0.04, 0],
        [0.35, 0.06],
        [0.62, 0.22],
        [0.66, 0.26],
      ],
      12,
      V(-23.4, F + 0.75, -1.6),
      V(0.3, 0.8, -0.5)
    ),
    paint(C.white),
    { smooth: true }
  );
  // The searchlight up front of the upper house.
  add(
    'hull',
    lathe(
      [
        [0.22, 0],
        [0.3, 0.15],
        [0.3, 0.55],
        [0.34, 0.6],
      ],
      10,
      V(-22.6, F + 0.55, 1.4),
      V(1, 0, 0)
    ),
    paint(C.dark),
    { smooth: true }
  );
  rod(V(-22.3, F + 0.12, 1.4), V(-22.3, F + 0.32, 1.4), 0.08, C.dark);
  lamp('floods', V(-22.0, F + 0.55, 1.4), V(1, 0, 0), '#fff1d6', {
    size: 0.2,
    gain: 2.4,
    spill: 0,
  });

  // --- The main mast: a lattice tower, yards, a radar platform, a pole ---------
  const mx = -25.4;
  const foot = F + 0.12;
  const head = foot + 6.6;
  const corner = (t, sx, sz) => {
    const half = 0.85 - 0.45 * t;
    return V(mx + half * sx, foot + (head - foot) * t, half * sz);
  };
  const levels = [0, 0.28, 0.52, 0.76, 1];
  const quads = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ];
  quads.forEach(([sx, sz], i) => {
    const [nx, nz] = quads[(i + 1) % 4];
    rod(corner(0, sx, sz), corner(1, sx, sz), 0.07, C.mid);
    levels.forEach((t, k) => {
      rod(corner(t, sx, sz), corner(t, nx, nz), 0.04, C.mid);
      if (k) rod(corner(levels[k - 1], sx, sz), corner(t, nx, nz), 0.03, C.mid);
    });
  });
  // Yards with their lights.
  [
    [0.4, 2.7, C.white],
    [0.72, 1.8, C.beacon],
  ].forEach(([t, half, css]) => {
    const y = foot + (head - foot) * t;
    add(
      'hull',
      box(mx - 0.08, mx + 0.08, y - 0.06, y + 0.06, -half, half),
      steel,
      {
        shine: STEEL,
      }
    );
    [1, -1].forEach((s) => {
      rod(V(mx, y, half * s), V(mx, y + 0.3, half * s), 0.03, C.dark);
      lamp('beacons', V(mx, y + 0.3, half * s), UP, css, {
        size: 0.1,
        spill: 0,
        gain: css === C.white ? 1.8 : 3,
      });
    });
  });
  // The radar platform on top, with a long scanner.
  house(mx - 0.95, mx + 0.95, 0.95, 0.3, head, head + 0.12, C.mid);
  railing('hull', loop(mx - 0.9, mx + 0.92, 0.9, 0.28, head + 0.12), steel, {
    height: 0.4,
    step: 0.9,
  });
  rod(V(mx + 0.4, head + 0.12, 0), V(mx + 0.4, head + 0.6, 0), 0.1, C.dark, 6);
  hb(C.mid, mx + 0.2, mx + 0.6, head + 0.6, head + 0.8, -0.25, 0.25);
  hb(C.white, mx + 0.28, mx + 0.52, head + 0.8, head + 1.0, -2.0, 2.0);
  // The pole above, with collars, a small yard and the top light.
  add(
    'hull',
    lathe(
      [
        [0.16, 0],
        [0.14, 1.2],
        [0.32, 1.3],
        [0.32, 1.42],
        [0.11, 1.5],
        [0.1, 2.9],
        [0.24, 3.0],
        [0.24, 3.1],
        [0.08, 3.2],
        [0.04, 5.4],
      ],
      6,
      V(mx - 0.4, head + 0.12, 0),
      UP
    ),
    paint(C.mid)
  );
  add(
    'hull',
    box(mx - 0.46, mx - 0.34, head + 2.3, head + 2.38, -1.1, 1.1),
    steel
  );
  [1, -1].forEach((s) =>
    lamp('beacons', V(mx - 0.4, head + 2.38, 1.05 * s), UP, C.beacon, {
      size: 0.09,
      spill: 0,
      gain: 3,
    })
  );
  lamp('beacons', V(mx - 0.25, head + 1.9, 0), V(1, 0, 0), C.white, {
    size: 0.11,
    spill: 0,
    gain: 2.2,
  });
  lamp('beacons', V(mx - 0.4, head + 0.12 + 5.4, 0), UP, C.beacon, {
    size: 0.16,
    spill: 0,
    gain: 3.4,
  });

  // --- The after spires: turned poles with collars, a yard, lights ------------
  [
    [-30.2, 0, roof, 9.6, 1.5],
    [-33.6, 0, W3, 9.2, 1.1],
    [-22.4, -2.0, F + 0.12, 4.2, 0],
  ].forEach(([x, z, base, h, yard]) => {
    add(
      'hull',
      lathe(
        [
          [0.3, 0],
          [0.26, h * 0.12],
          [0.16, h * 0.15],
          [0.15, h * 0.3],
          [0.36, h * 0.32],
          [0.36, h * 0.35],
          [0.12, h * 0.37],
          [0.11, h * 0.55],
          [0.26, h * 0.57],
          [0.26, h * 0.6],
          [0.08, h * 0.62],
          [0.03, h],
        ],
        6,
        V(x, base, z),
        UP
      ),
      paint(C.mid)
    );
    if (yard) {
      const y = base + h * 0.47;
      add(
        'hull',
        box(x - 0.06, x + 0.06, y - 0.05, y + 0.05, z - yard, z + yard),
        steel
      );
      [1, -1].forEach((s) =>
        lamp('beacons', V(x, y + 0.05, z + yard * s), UP, C.white, {
          size: 0.08,
          spill: 0,
          gain: 1.6,
        })
      );
    }
    lamp('beacons', V(x, base + h, z), UP, yard ? C.white : C.beacon, {
      size: 0.1,
      spill: 0,
      gain: 2.2,
    });
  });
  // A horn and a locker on the after deck at the wheelhouse's foot.
  hb(C.grey, -34.2, -33.0, W3, W3 + 0.7, 1.4, 3.2);
  hb(C.orange, -34.1, -33.1, W3 + 0.7, W3 + 0.76, 1.5, 3.1);

  // --- The funnel behind the bridge ---------------------------------------------
  const cap = DECK + 5.2;
  house(-39.4, -35.6, 2.7, 0.5, BLOCK.yt, cap, C.mid);
  hb(C.orange, -39.7, -35.4, cap, cap + 0.32, -3.0, 3.0);
  hb(C.dark, -39.6, -35.5, cap + 0.32, cap + 0.5, -2.8, 2.8);
  [-1.3, 0, 1.3].forEach((z, k) => {
    const h = 2.4 - Math.abs(z) * 0.3;
    const a = V(-37.4, cap + 0.5, z);
    const b = V(-37.9, cap + 0.5 + h, z);
    add('hull', tube(a, b, 0.42, 8), paint(C.soot), { smooth: true });
    add(
      'hull',
      tube(a.clone().lerp(b, 0.62), a.clone().lerp(b, 0.74), 0.45, 8),
      paint(C.orange),
      {
        smooth: true,
      }
    );
    add(
      'hull',
      tube(
        b.clone().add(V(0, -0.12, 0)),
        b.clone().add(V(0, 0.04, 0)),
        0.47,
        8
      ),
      paint(C.dark),
      {
        smooth: true,
      }
    );
    if (k !== 1)
      rod(
        V(-36.6, cap + 0.5, z * 1.25),
        V(-36.7, cap + 0.5 + h * 0.8, z * 1.25),
        0.1,
        C.dark,
        5
      );
  });
  for (let y = DECK + 0.4; y < cap - 0.5; y += 0.38) {
    hm(C.dark, -39.0, -36.0, y, y + 0.13, 2.7, 2.8);
    hb(C.dark, -39.5, -39.4, y, y + 0.13, -1.9, 1.9);
  }
  hm(C.grey, -39.52, -39.4, DECK + 0.2, cap - 0.2, 2.0, 2.6);
  hm(C.orange, -39.1, -35.9, cap - 0.9, cap - 0.75, 2.7, 2.86);
  [1, -1].forEach((s) => {
    [-38.6, -36.6].forEach((x) =>
      rod(V(x, BLOCK.yt, 2.95 * s), V(x, cap, 2.95 * s), 0.08, C.soot, 5)
    );
    rod(
      V(-38.6, cap - 1.4, 2.95 * s),
      V(-35.6, cap - 1.4, 2.95 * s),
      0.08,
      C.soot,
      5
    );
    lamp('lamps', V(-37.5, cap - 0.02, 3.0 * s), DOWN, C.amber, {
      size: 0.1,
      spill: 0,
    });
  });
  ladder(-39.4, 0, DECK, cap);
  return [-18.4, y0 + 1.3, 0];
}
