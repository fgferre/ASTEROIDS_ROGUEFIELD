// src/modules/render3d/travel/wakeBridge.js
//
// The Wake's bridge (wakeStern.js): two houses stacked on the stern's deck,
// each under a walkway with handrails, stairs and lifeboats; the glazed
// bridge leaning out over them; radar, domes, masts and aerials on its roof;
// the funnel behind.

import {
  ENGINE_BLOCK as BLOCK,
  STEEL,
  STERN_DECK as DECK,
  WAKE_COLORS as C,
} from './wakeHull.js';

export function buildBridge(kit) {
  const { V, add, box, body, plate, tube, lathe, lamp, railing, paint } = kit;
  const { random } = kit;
  const steel = paint(C.steel);
  // A house: a plan with its forward corners cut, from y0 to y1.
  const house = (x0, x1, hz, cut, y0, y1, css) =>
    add(
      'hull',
      kit.slab(
        [
          [x0, -hz],
          [x1 - cut, -hz],
          [x1, -hz + cut],
          [x1, hz - cut],
          [x1 - cut, hz],
          [x0, hz],
        ],
        y0,
        y1,
        0.08
      ),
      paint(css)
    );
  // A band of small windows along a house's sides and across its front.
  const pane = () =>
    random() < 0.8
      ? paint('#8fd4ff', 0.35 + random() * 0.8)
      : paint('#ffc983', 0.5 + random() * 0.6);
  const portholes = (x0, x1, hz, y, front) => {
    add(
      'hull',
      box(x0 - 0.2, x1 + 0.2, y - 0.1, y + 0.3, hz, hz + 0.05),
      paint(C.soot),
      {
        mirror: true,
      }
    );
    [1, -1].forEach((s) => {
      for (let x = x0; x < x1; x += 0.52) {
        if (random() < 0.42) continue;
        add(
          'windows',
          box(x, x + 0.32, y, y + 0.2, (hz + 0.05) * s, (hz + 0.08) * s),
          pane(),
          { uv: false }
        );
      }
    });
    add(
      'hull',
      box(front, front + 0.05, y - 0.1, y + 0.3, -hz + 1.4, hz - 1.4),
      paint(C.soot)
    );
    for (let z = -hz + 1.6; z < hz - 1.8; z += 0.52) {
      if (random() < 0.3) continue;
      add(
        'windows',
        box(front + 0.05, front + 0.08, y, y + 0.2, z, z + 0.32),
        pane(),
        { uv: false }
      );
    }
  };
  const rails = (x0, x1, hz, y) =>
    [1, -1].forEach((s) =>
      railing('hull', [V(x0, y, hz * s), V(x1, y, hz * s)], steel, {
        height: 0.7,
        shine: STEEL,
      })
    );
  // Things bolted to a house's side: a locker, a vent, a pipe up the wall.
  const clutter = (x0, x1, hz, y0, y1) => {
    for (let x = x0; x < x1; x += 2.2 + random() * 1.6) {
      const roll = random();
      if (roll < 0.35) {
        add('hull', box(x, x + 0.9, y0, y0 + 0.8, hz, hz + 0.3), paint(C.mid), {
          mirror: true,
        });
      } else if (roll < 0.7) {
        add(
          'hull',
          box(x, x + 0.7, y1 - 0.75, y1 - 0.3, hz, hz + 0.12),
          paint(C.dark),
          {
            mirror: true,
          }
        );
      } else {
        add(
          'hull',
          tube(V(x, y0, hz + 0.1), V(x, y1, hz + 0.1), 0.07, 5, true),
          paint(C.orange),
          { mirror: true, smooth: true }
        );
      }
    }
  };

  // --- Two houses, each under a walkway ---------------------------------------
  const L1 = DECK + 2.3;
  house(-35.5, -17, 4.6, 1.2, DECK, L1, C.light);
  portholes(-34, -19.2, 4.6, DECK + 1.2, -17);
  portholes(-34, -19.2, 4.6, DECK + 0.45, -17);
  clutter(-34.6, -19, 4.6, DECK, L1);
  house(-35.8, -16.6, 5.2, 1.3, L1, L1 + 0.14, C.mid);
  rails(-35.5, -18, 5.1, L1 + 0.14);
  const L2 = L1 + 0.14 + 2.1;
  house(-34, -19, 4.0, 1.1, L1 + 0.14, L2, C.grey);
  add(
    'hull',
    box(-34, -20.2, L2 - 0.42, L2 - 0.2, 4.0, 4.07),
    paint(C.orange),
    {
      mirror: true,
    }
  );
  portholes(-33, -20.6, 4.0, L1 + 0.9, -19);
  clutter(-33.4, -21, 4.0, L1 + 0.14, L2);
  house(-34.3, -18.6, 4.6, 1.2, L2, L2 + 0.14, C.mid);
  rails(-34, -19.9, 4.5, L2 + 0.14);
  // Stairs up the sides, deck to walkway to walkway.
  [
    [-23.5, DECK, -20.6, L1 + 0.14, 4.62, 5.15],
    [-27, L1 + 0.14, -24.4, L2 + 0.14, 4.02, 4.5],
  ].forEach(([xa, ya, xb, yb, z0, z1]) =>
    add(
      'hull',
      kit.profile(
        [
          [xa, ya],
          [xa + 0.7, ya],
          [xb + 0.7, yb],
          [xb, yb],
        ],
        z0,
        z1
      ),
      paint(C.dark),
      { mirror: true }
    )
  );
  // Lifeboats slung under the first walkway.
  [-31.5, -27.4, -23.3].forEach((x) => {
    add(
      'hull',
      tube(V(x, L1 - 0.75, 5.35), V(x + 2.6, L1 - 0.75, 5.35), 0.5, 8),
      paint(C.orange),
      { mirror: true, smooth: true }
    );
    [0.5, 2.1].forEach((dx) =>
      add(
        'hull',
        box(x + dx, x + dx + 0.12, L1 - 0.3, L1, 4.6, 5.5),
        paint(C.dark),
        {
          mirror: true,
        }
      )
    );
  });

  // --- The bridge: leaning out, glazed round its front -------------------------
  const y0 = L2 + 0.14;
  const y1 = y0 + 2.0;
  const ring = (y, front, hz, back, cut) => [
    V(back, y, -hz),
    V(front - cut, y, -hz),
    V(front, y, -hz + cut),
    V(front, y, hz - cut),
    V(front - cut, y, hz),
    V(back, y, hz),
  ];
  const low = ring(y0, -19.9, 4.0, -31.6, 1.6);
  const high = ring(y1, -18.9, 4.8, -31.6, 1.9);
  add('hull', body([low, high]), paint(C.light));
  const centre = V(-25, y0 + 1, 0);
  // Panes across each glazed face (the first and last are the after parts
  // of the sides, glazed only at their forward ends).
  [
    [0, 0.58, 1, 6],
    [1, 0, 1, 3],
    [2, 0, 1, 7],
    [3, 0, 1, 3],
    [4, 0, 0.42, 6],
  ].forEach(([edge, from, to, panes]) => {
    const at = (f, t) =>
      low[edge]
        .clone()
        .lerp(low[edge + 1], f)
        .lerp(high[edge].clone().lerp(high[edge + 1], f), t);
    // A dark sill band the panes sit in.
    add(
      'hull',
      plate(
        [at(from, 0.3), at(to, 0.3), at(to, 0.92), at(from, 0.92)],
        0,
        0.02,
        0,
        centre
      ),
      paint(C.soot)
    );
    for (let p = 0; p < panes; p += 1) {
      const f0 = from + ((to - from) * p) / panes;
      const f1 = from + ((to - from) * (p + 1)) / panes;
      if (random() < 0.1) continue;
      const level = 0.7 + random() * 0.6;
      // Each pane brighter low down, where the consoles glow.
      [
        [0.36, 0.54, '#9adcff', 0.95],
        [0.54, 0.88, '#2f9cf0', 0.6],
      ].forEach(([t0, t1, css, gain]) =>
        add(
          'windows',
          plate(
            [at(f0, t0), at(f1, t0), at(f1, t1), at(f0, t1)],
            0.02,
            0.03,
            0.05,
            centre
          ),
          paint(css, gain * level),
          { uv: false }
        )
      );
    }
  });
  // The roof, its visor forward, and the wings.
  house(-32, -18.1, 5.4, 2.1, y1, y1 + 0.24, C.grey);
  add('hull', box(-31.4, -20, y1 + 0.24, y1 + 0.34, -3.9, 3.9), paint(C.mid));
  add(
    'hull',
    box(-18.3, -18.1, y1 + 0.02, y1 + 0.22, -3.3, 3.3),
    paint(C.orange)
  );
  [1, -1].forEach((s) => {
    add(
      'hull',
      box(-25.5, -21.4, y0 - 0.14, y0, 3.9 * s, 6.4 * s),
      paint(C.mid)
    );
    add(
      'hull',
      tube(
        V(-23.4, y0 - 0.14, 6.2 * s),
        V(-23.4, y0 - 1.6, 4.1 * s),
        0.07,
        4,
        true
      ),
      paint(C.dark)
    );
    railing(
      'hull',
      [V(-25.4, y0, 6.3 * s), V(-21.5, y0, 6.3 * s), V(-21.5, y0, 4.9 * s)],
      steel,
      { height: 0.7, shine: STEEL }
    );
    lamp('lamps', V(-23.4, y0 - 0.14, 6.2 * s), V(0, -1, 0), C.amber, {
      spill: 0,
    });
    lamp('floods', V(-18.5, y1, 3.7 * s), V(0, -1, 0), C.flood, {
      size: 0.12,
      gain: 1.5,
      spill: 0,
    });
  });

  // --- Roof gear: radar, domes, lockers, masts, whips ---------------------------
  const roof = y1 + 0.34;
  add(
    'hull',
    tube(V(-21.8, roof, 0), V(-21.8, roof + 1.0, 0), 0.16, 6),
    steel,
    {
      shine: STEEL,
    }
  );
  add(
    'hull',
    box(-21.95, -21.65, roof + 1.0, roof + 1.28, -1.9, 1.9),
    paint(C.white)
  );
  [1, -1].forEach((s) => {
    add(
      'hull',
      lathe(
        [
          [0.01, 1.2],
          [0.5, 1.0],
          [0.75, 0.56],
          [0.75, 0],
        ],
        10,
        V(-29.4, roof, 2.5 * s),
        V(0, 1, 0)
      ),
      paint(C.white),
      { smooth: true }
    );
    add(
      'hull',
      box(-24.4, -23.2, roof, roof + 0.55, 2.2 * s, 3.4 * s),
      paint(C.mid)
    );
    add(
      'hull',
      box(-31.2, -30.4, roof, roof + 0.7, 0.8 * s, 2.0 * s),
      paint(C.dark)
    );
    // Whip aerials.
    [
      [-20.6, 3.3, 3.8],
      [-27.2, 3.5, 5.0],
      [-30.9, 1.4, 4.4],
    ].forEach(([x, z, h]) =>
      add(
        'hull',
        tube(
          V(x, roof, z * s),
          V(x - 0.3, roof + h, (z + 0.15) * s),
          0.03,
          4,
          true
        ),
        steel,
        { shine: STEEL }
      )
    );
  });
  // The main mast: a tripod with braces, a pole, three yards.
  const mx = -26;
  const top = roof + 8.2;
  const feet = [
    [mx + 1.3, 1.1],
    [mx + 1.3, -1.1],
    [mx - 1.6, 0],
  ];
  feet.forEach(([x, z], i) => {
    add(
      'hull',
      tube(V(x, roof, z), V(mx, roof + 3.8, 0), 0.09, 5, true),
      paint(C.mid)
    );
    const [nx, nz] = feet[(i + 1) % 3];
    [0.35, 0.7].forEach((t) =>
      add(
        'hull',
        tube(
          V(x + (mx - x) * t, roof + 3.8 * t, z * (1 - t)),
          V(nx + (mx - nx) * t, roof + 3.8 * t, nz * (1 - t)),
          0.045,
          4,
          true
        ),
        paint(C.mid)
      )
    );
  });
  add('hull', tube(V(mx, roof + 3.6, 0), V(mx, top, 0), 0.1, 6), paint(C.mid));
  add(
    'hull',
    box(mx - 0.35, mx + 0.35, roof + 3.6, roof + 3.9, -0.8, 0.8),
    paint(C.dark)
  );
  [
    [2.9, 2.6],
    [5.0, 1.7],
    [6.7, 0.9],
  ].forEach(([h, half]) => {
    add(
      'hull',
      tube(V(mx, roof + h, -half), V(mx, roof + h, half), 0.05, 4),
      steel,
      {
        shine: STEEL,
      }
    );
    [1, -1].forEach((s) =>
      lamp(
        'beacons',
        V(mx, roof + h, half * s),
        V(0, 1, 0),
        h > 6 ? C.beacon : C.white,
        {
          size: 0.1,
          spill: 0,
          gain: h > 6 ? 3 : 1.5,
        }
      )
    );
  });
  add(
    'hull',
    lathe(
      [
        [0.05, 0],
        [0.7, 0.42],
      ],
      10,
      V(mx + 0.2, roof + 5.8, 0),
      V(1, 0.25, 0)
    ),
    paint(C.white),
    { smooth: true }
  );
  lamp('beacons', V(mx, top, 0), V(0, 1, 0), C.beacon, {
    size: 0.16,
    spill: 0,
    gain: 3.2,
  });
  // The after mast.
  add(
    'hull',
    tube(V(-33, L2 + 0.14, 0), V(-33, roof + 5, 0), 0.08, 6),
    paint(C.mid)
  );
  add(
    'hull',
    tube(V(-33, roof + 3.4, -1.3), V(-33, roof + 3.4, 1.3), 0.04, 4),
    steel,
    {
      shine: STEEL,
    }
  );
  lamp('beacons', V(-33, roof + 5, 0), V(0, 1, 0), C.white, {
    size: 0.1,
    spill: 0,
    gain: 1.8,
  });

  // --- The funnel behind the bridge ---------------------------------------------
  const cap = DECK + 5.4;
  house(-39.2, -35.6, 2.6, 0.5, BLOCK.yt, cap, C.mid);
  add('hull', box(-39.5, -35.4, cap, cap + 0.3, -2.9, 2.9), paint(C.orange));
  [-1.3, 0, 1.3].forEach((z) =>
    add(
      'hull',
      tube(V(-37.3, cap + 0.3, z), V(-37.8, cap + 1.7, z), 0.42, 8),
      paint(C.soot),
      { smooth: true }
    )
  );
  for (let y = DECK + 0.6; y < cap - 0.5; y += 0.4) {
    add('hull', box(-38.8, -36, y, y + 0.14, 2.6, 2.7), paint(C.dark), {
      mirror: true,
    });
    add('hull', box(-39.3, -39.2, y, y + 0.14, -1.9, 1.9), paint(C.dark));
  }
  add(
    'hull',
    box(-39.32, -39.2, DECK + 0.2, cap - 0.2, 2.0, 2.5),
    paint(C.grey),
    {
      mirror: true,
    }
  );
  return [-19.5, y0 + 1.1, 0];
}
