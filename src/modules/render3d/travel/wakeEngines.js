// src/modules/render3d/travel/wakeEngines.js
//
// The Wake's engines (wakeStern.js): an armoured housing on the engine
// block's after face, three deep octagonal sockets in it, and in each a big
// round engine — a barrel of segmented armour petals between clamped ring
// bands, hydraulic struts from the housing, a heavy lip, and the fire down
// a deep throat (each engine its own light set, so the scene can make one
// fail; the throat's rings and vanes are plating, so a dead engine still
// reads as a machine).

import { ENGINE_TAIL as TAIL, WAKE_COLORS as C } from './wakeHull.js';

// z: the axis across; r: the throat's mouth; R: the barrel; L: how far the
// lip stands aft of the block's face.
const ENGINES = [
  { z: -7.2, r: 2.32, R: 3.02, L: 5.3 },
  { z: 0, r: 2.62, R: 3.4, L: 5.75 },
  { z: 7.2, r: 2.32, R: 3.02, L: 5.3 },
];
const ENGINE_Y = -0.6;
// The housing: its depth aft of the face, its stern-view outline ([z, y]).
const DEPTH = 1.8;
const OUTLINE = [
  [-6.6, -7.0],
  [6.6, -7.0],
  [11.0, -4.4],
  [11.5, -0.6],
  [11.0, 3.4],
  [8.2, 5.6],
  [-8.2, 5.6],
  [-11.0, 3.4],
  [-11.5, -0.6],
  [-11.0, -4.4],
];
const SOOT = '#1b1d21';
const OCT = Math.cos(Math.PI / 8);

export function buildEngines(kit) {
  const { V, add, box, cross, lathe, plate, tube, lamp, pool, paint, random } =
    kit;
  const face = TAIL.x;
  const back = face - DEPTH;
  const aft = V(-1, 0, 0);
  const steel = { roughness: 0.5, metalness: 0.6 };

  // A socket's apothem (the gap round the barrel), and its octagon.
  const apothem = (R) => R + 0.2;
  const octagon = (z, A) =>
    Array.from({ length: 8 }, (_, k) => {
      const t = Math.PI / 8 + (k * Math.PI) / 4;
      return [z + (Math.cos(t) * A) / OCT, ENGINE_Y + (Math.sin(t) * A) / OCT];
    });
  // A plate on an aft-facing plane at x, from stern-view corners ([z, y]).
  const onFace = (x, corners, thick, color, inset = 0.04, lift = 0) =>
    add(
      'hull',
      plate(
        corners.map(([z, y]) => V(x, y, z)),
        lift,
        thick,
        inset,
        V(x + 5, 0, 0)
      ),
      color
    );

  // The housing, its sockets cut through.
  add(
    'hull',
    cross(
      OUTLINE,
      back,
      face + 0.05,
      ENGINES.map(({ z, R }) => octagon(z, apothem(R)))
    ),
    paint(C.mid)
  );
  // Each socket's floor: a dark ring plate round the barrel's root.
  ENGINES.forEach(({ z, R }) =>
    onFace(face + 0.04, octagon(z, apothem(R)), 0.06, paint(SOOT), 0)
  );

  ENGINES.forEach(({ z, r, R, L }, i) => {
    const out = Math.sign(z);
    const at = V(face, ENGINE_Y, z);
    const axis = (d) => V(at.x - d, at.y, at.z);
    const rim = (d, k, a) =>
      V(at.x - d, at.y + Math.sin(a) * k, at.z + Math.cos(a) * k);
    // A panel on the barrel, standing `thick` off the radius k0..k1.
    const petal = (d0, d1, a0, a1, k0, k1, thick, color, inset = 0.05) =>
      add(
        'hull',
        plate(
          [rim(d0, k0, a0), rim(d1, k1, a0), rim(d1, k1, a1), rim(d0, k0, a1)],
          0,
          thick,
          inset,
          axis((d0 + d1) / 2)
        ),
        color,
        { shine: steel }
      );
    // The barrel bulges a little toward its middle.
    const barrel = (d) => R * (0.955 + 0.045 * Math.sin((Math.PI * d) / L));

    // The socket's frame: eight chamfered pieces round the octagon, orange
    // on the outboard corners of the wing engines.
    const A = apothem(R) + 0.04;
    for (let k = 0; k < 8; k += 1) {
      const [t0, t1] = [
        Math.PI / 8 + ((k - 1) * Math.PI) / 4,
        Math.PI / 8 + (k * Math.PI) / 4,
      ];
      const mid = (t0 + t1) / 2;
      const facing = Math.cos(mid) * (out || 1);
      // No frame across the narrow webs between sockets.
      if (Math.abs(Math.sin(mid)) < 0.1 && (!out || facing < 0)) continue;
      const w = k % 2 ? 0.42 : 0.62;
      const point = (t, a) => [
        z + (Math.cos(t) * a) / OCT,
        ENGINE_Y + (Math.sin(t) * a) / OCT,
      ];
      const orange = out && facing > 0.5 && k % 2 === 1;
      onFace(
        back,
        [point(t0, A), point(t1, A), point(t1, A + w), point(t0, A + w)],
        orange ? 0.62 : k % 2 ? 0.5 : 0.36,
        paint(orange ? C.orange : k % 2 ? C.dark : C.grey),
        0.05
      );
    }

    // The barrel: a dark drum, two rows of armour petals, ring bands with
    // clamps, and the heavy lip.
    add(
      'hull',
      lathe(
        [
          [R * 0.93, -0.05],
          [R * 0.93, L - 0.6],
        ],
        16,
        at,
        aft
      ),
      paint(SOOT)
    );
    const N = 20;
    const rows = [
      [DEPTH - 0.4, DEPTH + 0.15],
      [DEPTH + 0.35, (DEPTH + L) / 2 - 0.15],
      [(DEPTH + L) / 2 + 0.15, L - 0.78],
    ];
    rows.forEach(([d0, d1], row) => {
      for (let n = 0; n < N; n += 1) {
        const a0 = ((n + 0.04) / N) * Math.PI * 2;
        const a1 = ((n + 0.96) / N) * Math.PI * 2;
        const roll = random();
        const css =
          row === 0
            ? C.dark
            : roll < 0.1 && row === 1
              ? C.orange
              : roll < 0.3
                ? C.grey
                : roll < 0.62
                  ? C.mid
                  : C.dark;
        const t = row === 0 ? 0.14 : 0.2 + random() * 0.05;
        petal(d0, d1, a0, a1, barrel(d0) - t, barrel(d1) - t, t, paint(css));
        // A smaller plate riveted over some petals.
        if (row && n % 2 === row - 1) {
          const [e0, e1] = [d0 + 0.25, d1 - 0.25];
          const b0 = a0 + 0.06;
          const b1 = a1 - 0.06;
          petal(
            e0,
            e1,
            b0,
            b1,
            barrel(e0),
            barrel(e1),
            0.07,
            paint(css === C.orange ? C.orange : C.mid),
            0.03
          );
        }
      }
    });
    // Ring bands between the rows, clamps on them.
    [DEPTH + 0.15, (DEPTH + L) / 2 - 0.15].forEach((d, band) => {
      const k = R * 1.04;
      add(
        'hull',
        lathe(
          [
            [R * 0.94, d],
            [k, d + 0.03],
            [k, d + 0.17],
            [R * 0.94, d + 0.2],
          ],
          32,
          at,
          aft
        ),
        paint(band ? C.grey : C.mid),
        { shine: steel }
      );
      for (let n = 0; n < 8; n += 1) {
        const a = ((n + 0.5) / 8) * Math.PI * 2 + band * 0.2;
        petal(
          d - 0.12,
          d + 0.32,
          a - 0.09,
          a + 0.09,
          k,
          k,
          0.2,
          paint(C.dark),
          0.02
        );
      }
    });
    // The lip: thick, rounded into the throat, segmented on its face.
    add(
      'hull',
      lathe(
        [
          [R * 0.95, L - 0.8],
          [R * 1.05, L - 0.7],
          [R * 1.05, L - 0.16],
          [R * 1.0, L],
          [r + 0.42, L],
          [r + 0.38, L - 0.14],
          [r + 0.06, L - 0.14],
          [r, L - 0.32],
          [r * 0.98, L - 0.75],
        ],
        32,
        at,
        aft
      ),
      paint(C.mid),
      { shine: steel }
    );
    for (let n = 0; n < 16; n += 2) {
      const a0 = ((n + 0.1) / 16) * Math.PI * 2;
      const a1 = ((n + 0.9) / 16) * Math.PI * 2;
      add(
        'hull',
        plate(
          [
            rim(L, r + 0.48, a0),
            rim(L, R * 0.98, a0),
            rim(L, R * 0.98, a1),
            rim(L, r + 0.48, a1),
          ],
          0,
          0.1,
          0.03,
          axis(L - 2)
        ),
        paint(C.dark)
      );
    }

    // Struts from the housing to the rear band, on the diagonals.
    [1, 3, 5, 7].forEach((n) => {
      const a = (n / 8) * Math.PI * 2;
      const base = rim(DEPTH + 0.2, R + 0.75, a);
      const end = rim((DEPTH + L) / 2 + 0.05, R * 1.08, a);
      const knee = base.clone().lerp(end, 0.55);
      add('hull', tube(base, knee, 0.17, 6), paint(C.dark), { shine: steel });
      add('hull', tube(knee, end, 0.085, 6), paint(C.light), {
        shine: { roughness: 0.3, metalness: 0.9 },
      });
      const foot = rim(DEPTH, R + 0.75, a);
      add(
        'hull',
        box(
          foot.x - 0.3,
          foot.x,
          foot.y - 0.28,
          foot.y + 0.28,
          foot.z - 0.28,
          foot.z + 0.28
        ),
        paint(C.grey)
      );
    });

    // The fire: the throat's wall glowing hotter toward its bottom, a white
    // core.
    const set = `engine${i}`;
    const steps = 24;
    const k = (t) => (0.97 - 0.6 * t) * r;
    const deep = (t) => L - 0.7 - (L - 1.7) * t;
    for (let n = 0; n < steps; n += 1) {
      const [t0, t1] = [n / steps, (n + 1) / steps];
      add(
        set,
        lathe(
          [
            [k(t0), deep(t0)],
            [k(t1), deep(t1)],
          ],
          24,
          at,
          aft
        ),
        paint('#2f8fff', 0.04 * 70 ** ((n + 0.5) / steps)),
        { uv: false, smooth: true }
      );
    }
    add(
      set,
      lathe(
        [
          [0, deep(1)],
          [k(1), deep(1)],
        ],
        24,
        at,
        aft
      ),
      paint('#e6f4ff', 2.2),
      { uv: false }
    );
    // The throat's structure, plating that stands in the fire: stator rings,
    // vanes, a hub ring round the core.
    [0.18, 0.42, 0.66].forEach((t) => {
      const d = deep(t);
      add(
        'hull',
        lathe(
          [
            [k(t) - 0.02, d - 0.1],
            [k(t) - 0.02, d + 0.04],
            [k(t) - 0.2 - t * 0.1, d],
            [k(t) - 0.02, d - 0.1],
          ],
          32,
          at,
          aft
        ),
        paint(SOOT),
        { shine: steel }
      );
    });
    for (let n = 0; n < 12; n += 1) {
      const a = (n / 12) * Math.PI * 2;
      const v = (t, inset) => rim(deep(t), k(t) - inset, a);
      add(
        'hull',
        plate(
          [v(0.04, 0.02), v(0.04, 0.2), v(0.62, 0.12), v(0.62, 0.02)],
          -0.03,
          0.06,
          0,
          axis(0)
        ),
        paint(SOOT)
      );
    }
    add(
      'hull',
      lathe(
        [
          [k(1) + 0.02, deep(1) + 0.1],
          [k(1) + 0.02, deep(1) + 0.45],
          [k(1) - 0.12, deep(1) + 0.3],
          [k(1) + 0.02, deep(1) + 0.1],
        ],
        24,
        at,
        aft
      ),
      paint(SOOT)
    );
    add(
      `${set}Pools`,
      pool(axis(deep(1) + 0.2), aft, r * 0.42),
      paint('#dcefff', 1.3),
      {
        uv: false,
      }
    );
    add(
      `${set}Pools`,
      pool(axis(L - 1.6), aft, r * 0.95),
      paint(C.engine, 0.45),
      {
        uv: false,
      }
    );
    add(
      `${set}Pools`,
      pool(axis(L + 0.4), aft, r * 1.7),
      paint(C.engine, 0.22),
      {
        uv: false,
      }
    );
  });

  // Pipe runs in the valleys between the barrels, clamped.
  [-1, 1].forEach((s) => {
    [2.5, -2.5].forEach((dy) => {
      const zc = 3.95 * s;
      const pipes = [
        [zc - 0.3 * s, dy, 0.15, C.mid],
        [zc + 0.1 * s, dy + 0.1 * Math.sign(dy), 0.12, C.orange],
        [zc - 0.05 * s, dy - 0.32 * Math.sign(dy), 0.1, C.grey],
      ];
      pipes.forEach(([pz, py, pr, css]) =>
        add(
          'hull',
          tube(
            V(back, ENGINE_Y + py, pz),
            V(face - 4.6, ENGINE_Y + py, pz),
            pr,
            6
          ),
          paint(css),
          { smooth: true }
        )
      );
      for (let x = back - 0.5; x > face - 4.6; x -= 1.1) {
        add(
          'hull',
          box(
            x - 0.14,
            x,
            ENGINE_Y + dy - 0.55,
            ENGINE_Y + dy + 0.4,
            zc - 0.55,
            zc + 0.4
          ),
          paint(C.dark)
        );
      }
    });
  });

  // The housing's after face: radiators and a lit panel over the centre
  // engine, vents over the wings, orange buttresses and lamp bars below.
  onFace(
    back,
    [
      [-3.1, 3.75],
      [3.1, 3.75],
      [3.1, 5.3],
      [-3.1, 5.3],
    ],
    0.08,
    paint(SOOT)
  );
  for (let zf = -2.85; zf <= 2.86; zf += 0.3) {
    add(
      'hull',
      box(back - 0.42, back, 3.85, 5.2, zf - 0.05, zf + 0.05),
      paint(C.grey)
    );
  }
  add('hull', box(back - 0.5, back, 4.4, 4.65, -3.1, 3.1), paint(C.dark));
  [-1, 1].forEach((s) => {
    // Vents above the wings.
    onFace(
      back,
      [
        [4.2 * s, 3.3],
        [8.0 * s, 3.3],
        [8.2 * s, 4.9],
        [4.2 * s, 4.9],
      ],
      0.12,
      paint(C.dark)
    );
    for (let y = 3.5; y < 4.8; y += 0.26) {
      add(
        'hull',
        box(
          back - 0.24,
          back,
          y,
          y + 0.1,
          Math.min(4.4 * s, 7.8 * s),
          Math.max(4.4 * s, 7.8 * s)
        ),
        paint(C.mid)
      );
    }
    // An orange corner piece up top, a lit panel beside it.
    onFace(
      back,
      [
        [8.4 * s, 3.2],
        [10.8 * s, 3.2],
        [8.2 * s, 5.4],
        [8.2 * s, 4.6],
      ],
      0.3,
      paint(C.orange)
    );
    lamp('lamps', V(back - 0.2, 5.05, 3.6 * s), aft, C.engine, {
      size: 0.14,
      gain: 2.2,
      spill: 0.6,
    });
    // Under the webs: orange buttresses with a slot.
    onFace(
      back,
      [
        [3.25 * s, -6.9],
        [4.55 * s, -6.9],
        [4.55 * s, -4.3],
        [3.25 * s, -4.0],
      ],
      0.42,
      paint(C.orange)
    );
    add(
      'hull',
      box(back - 0.5, back, -6.2, -4.8, 3.75 * s - 0.15, 3.75 * s + 0.15),
      paint(SOOT)
    );
    // Outboard: an orange edge plate with dark slots.
    onFace(
      back,
      [
        [10.6 * s, -4.2],
        [11.3 * s, -0.6],
        [10.85 * s, 3.2],
        [10.2 * s, 3.0],
        [10.4 * s, -3.9],
      ],
      0.3,
      paint(C.orange)
    );
    [-2.6, -1.4, 1.6].forEach((y) =>
      add(
        'hull',
        box(back - 0.42, back, y, y + 0.7, 10.55 * s - 0.12, 10.55 * s + 0.12),
        paint(SOOT)
      )
    );
    // Lower wing panels and an amber lamp bar.
    onFace(
      back,
      [
        [5.0 * s, -6.8],
        [6.9 * s, -6.8],
        [10.6 * s, -4.5],
        [5.0 * s, -4.5],
      ],
      0.16,
      paint(C.grey)
    );
    add(
      'lamps',
      box(back - 0.32, back - 0.16, -6.05, -5.9, 6.0 * s - 0.9, 6.0 * s + 0.9),
      paint(C.amber, 2.4),
      { uv: false }
    );
    add(
      'lampsPools',
      pool(V(back - 0.05, -5.98, 6.0 * s), aft, 1.6),
      paint(C.amber, 0.4),
      {
        uv: false,
      }
    );
    lamp('lamps', V(back - 0.3, ENGINE_Y + 0.6, 3.78 * s), aft, C.amber, {
      size: 0.14,
      spill: 0.5,
    });
  });
  // The centre's lower plate and lamp bar.
  onFace(
    back,
    [
      [-3.0, -6.9],
      [3.0, -6.9],
      [3.0, -4.6],
      [-3.0, -4.6],
    ],
    0.16,
    paint(C.grey)
  );
  add('hull', box(back - 0.4, back, -6.0, -5.2, -2.4, 2.4), paint(SOOT));
  add(
    'lamps',
    box(back - 0.42, back - 0.26, -5.68, -5.52, -1.6, 1.6),
    paint(C.amber, 2.4),
    {
      uv: false,
    }
  );
  add(
    'lampsPools',
    pool(V(back - 0.05, -5.6, 0), aft, 2),
    paint(C.amber, 0.4),
    {
      uv: false,
    }
  );

  // The housing's flanks: orange chamfers top and bottom, grey sides with
  // a vent, amber lamps.
  const flank = (p, q) => (fx, ft) =>
    V(face - fx * DEPTH, p[1] + (q[1] - p[1]) * ft, p[0] + (q[0] - p[0]) * ft);
  const looks = [
    [OUTLINE[4], OUTLINE[5], C.orange],
    [OUTLINE[3], OUTLINE[4], C.grey],
    [OUTLINE[2], OUTLINE[3], C.mid],
    [OUTLINE[1], OUTLINE[2], C.orange],
  ];
  looks.forEach(([p, q, css]) =>
    kit.armour(
      'hull',
      flank(p, q),
      [0.03, 0.97],
      [0.03, 0.5, 0.97],
      (fx, ft) => ({
        color: paint(ft && css === C.grey ? C.light : css),
        thick: 0.16,
        cut: css === C.orange ? [ft ? 2 : 1, 0.35] : null,
      })
    )
  );
  [-1, 1].forEach((s) => {
    lamp('lamps', V(face - 0.9, 1.4, 11.45 * s), V(0, 0, s), C.amber, {
      size: 0.15,
      spill: 1.2,
    });
    lamp('lamps', V(face - 0.9, -2.6, 11.5 * s), V(0, 0, s), C.amber, {
      size: 0.12,
      spill: 1,
    });
  });

  return ENGINES.map(({ z, L }) => [face - L + 0.3, ENGINE_Y, z]);
}
