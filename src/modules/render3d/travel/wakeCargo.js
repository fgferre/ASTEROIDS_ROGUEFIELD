// src/modules/render3d/travel/wakeCargo.js
//
// The Wake's neck (wake.js): a dark spine girder between the stern and the
// bow, a cargo floor with walkways and handrails along its sides, yellow
// double-frame gantries across it, the containers stacked in the bays
// between them, an overhead crane with one container on the hook, and the
// hangar under the spine the drones leave from.

import { STEEL, WAKE_COLORS as C } from './wakeHull.js';

// The neck runs from the stern block's face to the bow block's.
const X0 = -14;
const X1 = 20;
const FLOOR = -2.6;
const SPINE = 5.6;
// Gantries and the middles of the bays between them.
const GANTRIES = [-13, -4.9, 3.2, 11.3, 19.4];
const FRAME = 0.57;
// A container: length, height, width; five columns across.
const BOX = { length: 6.1, height: 2.5, width: 2.3, pitch: 2.45 };
// The bay and the column the deck crane's container hangs over.
const CRANE_BAY = 2;
const CRANE_COLUMN = 1;

export function buildCargoDeck(kit) {
  const {
    V,
    add,
    box,
    cross,
    plate,
    crate,
    tube,
    lamp,
    railing,
    paint,
    random,
  } = kit;
  const steel = paint(C.steel);

  // --- The spine --------------------------------------------------------------
  add(
    'hull',
    cross(
      [
        [-SPINE, FLOOR],
        [SPINE, FLOOR],
        [SPINE, -4.8],
        [3.8, -6.4],
        [-3.8, -6.4],
        [-SPINE, -4.8],
      ],
      X0,
      X1
    ),
    paint(C.dark)
  );
  for (let x = X0 + 0.3; x < X1 - 1; x += 2) {
    // A rib, and between ribs a brace or a recessed panel.
    add(
      'hull',
      box(x, x + 0.3, -4.8, FLOOR - 0.25, SPINE, SPINE + 0.28),
      paint(C.mid),
      {
        mirror: true,
      }
    );
    if (random() < 0.55) {
      add(
        'hull',
        tube(
          V(x + 0.3, -4.7, SPINE + 0.12),
          V(x + 2, -3.0, SPINE + 0.12),
          0.08,
          4
        ),
        paint(C.mid),
        { mirror: true }
      );
    } else {
      add(
        'hull',
        box(x + 0.55, x + 1.75, -4.5, -3.2, SPINE, SPINE + 0.1),
        paint(C.grey),
        {
          mirror: true,
        }
      );
    }
    const len = Math.min(2, X1 - x);
    add(
      'hull',
      plate(
        [
          V(x, -4.8, SPINE),
          V(x + len, -4.8, SPINE),
          V(x + len, -6.4, 3.8),
          V(x, -6.4, 3.8),
        ],
        0,
        0.12 + random() * 0.08,
        0.06
      ),
      paint(random() < 0.3 ? C.grey : C.mid),
      { mirror: true }
    );
  }
  // Pipes along the spine's flanks, clamped every few ribs.
  [
    [-3.25, 0.12, C.mid],
    [-3.6, 0.09, C.orange],
    [-4.35, 0.14, C.dark],
  ].forEach(([y, r, css]) =>
    add(
      'hull',
      tube(V(X0, y, SPINE + 0.4), V(X1, y, SPINE + 0.4), r, 6, true),
      paint(css),
      { mirror: true, smooth: true }
    )
  );
  // The keel beam.
  add('hull', box(X0, X1, -6.9, -6.4, -1.3, 1.3), paint(C.dark));
  for (let x = X0 + 1; x < X1 - 2; x += 3.4) {
    add('hull', box(x, x + 2.6, -7.05, -6.9, -1.0, 1.0), paint(C.mid));
  }

  // --- Cargo floor, walkways, handrails ---------------------------------------
  for (let i = 0; i + 1 < GANTRIES.length; i += 1) {
    add(
      'hull',
      box(
        GANTRIES[i] + FRAME,
        GANTRIES[i + 1] - FRAME,
        FLOOR,
        FLOOR + 0.08,
        -6.2,
        6.2
      ),
      paint(C.mid)
    );
  }
  add('hull', box(X0, X1, FLOOR - 0.25, FLOOR, SPINE, 7.95), paint(C.mid), {
    mirror: true,
  });
  add(
    'hull',
    box(X0, X1, FLOOR - 0.45, FLOOR - 0.25, 7.75, 7.95),
    paint(C.orange),
    {
      mirror: true,
    }
  );
  for (let x = X0 + 1.2; x < X1; x += 2) {
    add(
      'hull',
      cross(
        [
          [SPINE, FLOOR - 0.25],
          [7.7, FLOOR - 0.25],
          [SPINE, FLOOR - 1.5],
        ],
        x,
        x + 0.16
      ),
      paint(C.dark),
      { mirror: true }
    );
  }
  [1, -1].forEach((s) => {
    railing(
      'hull',
      [V(X0 + 0.4, FLOOR, 7.85 * s), V(X1 - 0.4, FLOOR, 7.85 * s)],
      steel,
      {
        shine: STEEL,
      }
    );
    // Work lights under the walkway, washing the spine.
    for (let x = X0 + 2.2; x < X1; x += 4.05) {
      lamp(
        'floods',
        V(x, FLOOR - 0.75, (SPINE + 0.29) * s),
        V(0, 0, s),
        C.flood,
        {
          size: 0.2,
          gain: 2.8,
          spill: 2.3,
          spillGain: 0.42,
        }
      );
    }
  });

  // --- Gantries -----------------------------------------------------------------
  const portal = [
    [-7.45, FLOOR],
    [-6.55, FLOOR],
    [-6.55, 4.6],
    [-5.6, 5.55],
    [5.6, 5.55],
    [6.55, 4.6],
    [6.55, FLOOR],
    [7.45, FLOOR],
    [7.45, 5.4],
    [6.4, 6.45],
    [-6.4, 6.45],
    [-7.45, 5.4],
  ];
  GANTRIES.forEach((gx) => {
    [-1, 1].forEach((side) =>
      add(
        'hull',
        cross(portal, gx + side * FRAME, gx + side * (FRAME - 0.3)),
        paint(C.yellow)
      )
    );
    // Spacers between the two frames, dark feet, a lamp on each shoulder.
    [-1.4, 0.6, 2.6, 4.2].forEach((y) =>
      add(
        'hull',
        box(gx - 0.27, gx + 0.27, y, y + 0.5, 6.68, 7.32),
        paint(C.dark),
        {
          mirror: true,
        }
      )
    );
    [-4.2, -2.1, 0, 2.1, 4.2].forEach((z) =>
      add(
        'hull',
        box(gx - 0.27, gx + 0.27, 5.7, 6.3, z - 0.3, z + 0.3),
        paint(C.dark)
      )
    );
    add(
      'hull',
      box(gx - 0.68, gx + 0.68, FLOOR, FLOOR + 0.8, 6.42, 7.58),
      paint(C.dark),
      {
        mirror: true,
      }
    );
    [1, -1].forEach((s) => {
      lamp('lamps', V(gx, 5.95, 7.0 * s), V(0, 0.7, 0.7 * s), C.amber, {
        size: 0.16,
      });
      lamp('lamps', V(gx, FLOOR + 0.45, 7.58 * s), V(0, 0, s), C.amber, {
        size: 0.12,
        spill: 1,
      });
      // A ladder up the outer face of the leg.
      for (let y = FLOOR + 1.1; y < 5; y += 0.42) {
        add(
          'hull',
          box(gx - 0.2, gx + 0.2, y, y + 0.05, 7.45 * s, 7.53 * s),
          steel,
          {
            shine: STEEL,
          }
        );
      }
    });
  });

  // --- Containers ---------------------------------------------------------------
  const tint = () => {
    const css = C.cargo[Math.floor(random() * C.cargo.length)];
    return paint(css, 0.8 + Math.floor(random() * 4) * 0.08);
  };
  const stack = (bay, column) => {
    if (bay === CRANE_BAY && column === CRANE_COLUMN) return 1;
    const outer = column === 0 || column === 4;
    const roll = random();
    if (outer) return roll < 0.12 ? 1 : 2;
    return roll < 0.1 ? 1 : roll < 0.62 ? 2 : 3;
  };
  const container = (x, y, z, short) => {
    const half = BOX.length / 2;
    const [z0, z1] = [z - BOX.width / 2, z + BOX.width / 2];
    const spans = short
      ? [
          [x - half, x - 0.1],
          [x + 0.1, x + half],
        ]
      : [[x - half, x + half]];
    spans.forEach(([x0, x1]) =>
      add(
        random() < 0.5 ? 'cargo' : 'cargoB',
        crate(x0, x1, y, y + BOX.height, z0, z1, random() < 0.5, short),
        tint(),
        { uv: false }
      )
    );
  };
  for (let bay = 0; bay + 1 < GANTRIES.length; bay += 1) {
    const x = (GANTRIES[bay] + GANTRIES[bay + 1]) / 2;
    for (let column = 0; column < 5; column += 1) {
      const z = (column - 2) * BOX.pitch;
      const levels = stack(bay, column);
      for (let level = 0; level < levels; level += 1) {
        container(
          x,
          FLOOR + 0.08 + level * (BOX.height + 0.04),
          z,
          random() < 0.22
        );
      }
    }
  }

  // --- The overhead crane, parked ------------------------------------------------
  add(
    'hull',
    box(GANTRIES[0] - 0.5, X1 - 0.1, 6.45, 6.8, 4.3, 4.7),
    paint(C.dark),
    { mirror: true }
  );
  const px = (GANTRIES[1] + GANTRIES[2]) / 2;
  [-0.75, 0.35].forEach((dx) =>
    add(
      'hull',
      box(px + dx, px + dx + 0.4, 6.8, 7.5, -5.2, 5.2),
      paint(C.yellow)
    )
  );
  add('hull', box(px - 1.1, px + 1.1, 6.8, 7.2, 4.1, 4.9), paint(C.dark), {
    mirror: true,
  });
  add('hull', box(px - 0.7, px + 0.7, 7.5, 8.0, 1.2, 2.8), paint(C.mid));
  add('hull', box(px - 0.45, px + 0.45, 6.2, 6.8, 1.5, 2.5), paint(C.orange));
  lamp('floods', V(px, 6.2, 2), V(0, -1, 0), C.flood, { size: 0.16, spill: 0 });

  // --- The deck crane on the port side, a container on its hook ----------------
  const cx = (GANTRIES[CRANE_BAY] + GANTRIES[CRANE_BAY + 1]) / 2;
  const cz = (CRANE_COLUMN - 2) * BOX.pitch;
  const gx = GANTRIES[CRANE_BAY];
  add(
    'hull',
    tube(V(gx, 6.45, -6.9), V(gx, 7.3, -6.9), 0.75, 10),
    paint(C.dark),
    {
      smooth: true,
    }
  );
  add('hull', box(gx - 0.7, gx + 0.8, 7.3, 8.6, -7.6, -6.2), paint(C.yellow));
  add('hull', box(gx - 2.0, gx - 0.7, 7.3, 8.2, -7.5, -6.3), paint(C.dark));
  add('hull', box(gx - 0.8, gx + 0.9, 8.6, 8.72, -7.7, -6.1), paint(C.mid));
  add(
    'windows',
    box(gx + 0.8, gx + 0.83, 7.85, 8.4, -7.4, -6.4),
    paint('#8fd4ff', 0.9),
    { uv: false }
  );
  const foot = V(gx + 0.6, 8.3, -6.9);
  const tip = V(cx, 11.3, cz);
  const dir = tip.clone().sub(foot);
  const across = dir
    .clone()
    .cross(V(0, 1, 0))
    .normalize();
  const chord = (side, rise, t) =>
    foot
      .clone()
      .addScaledVector(dir, t)
      .addScaledVector(across, side * (0.4 - 0.3 * t))
      .add(V(0, rise * (0.75 - 0.6 * t), 0));
  [
    [1, 0],
    [-1, 0],
    [0, 1],
  ].forEach(([side, rise]) =>
    add(
      'hull',
      tube(chord(side, rise, 0), chord(side, rise, 1), 0.1, 4, true),
      paint(C.yellow)
    )
  );
  for (let n = 0; n < 7; n += 1) {
    const [t0, t1] = [n / 7, (n + 0.5) / 7];
    [1, -1].forEach((side) => {
      add(
        'hull',
        tube(chord(side, 0, t0), chord(0, 1, t1), 0.05, 4, true),
        paint(C.yellow)
      );
      add(
        'hull',
        tube(chord(0, 1, t1), chord(side, 0, t0 + 1 / 7), 0.05, 4, true),
        paint(C.yellow)
      );
    });
    add(
      'hull',
      tube(chord(1, 0, t0), chord(-1, 0, t0), 0.05, 4, true),
      paint(C.yellow)
    );
  }
  // The mast and the stays that hold the boom up.
  const mast = V(gx - 0.4, 10.6, -6.9);
  [0.5, -0.5].forEach((z) => {
    add(
      'hull',
      tube(V(gx - 0.5, 8.7, -6.9 + z), mast, 0.07, 4, true),
      paint(C.yellow)
    );
    add('hull', tube(mast, chord(z * 2, 0, 0.92), 0.03, 4, true), steel, {
      shine: STEEL,
    });
  });
  add('hull', tube(mast, V(gx - 1.8, 8.2, -6.9), 0.03, 4, true), steel, {
    shine: STEEL,
  });
  const hook = 3.3;
  const lid = hook + BOX.height;
  container(cx, hook, cz, false);
  add(
    'hull',
    box(cx - 3.0, cx + 3.0, lid, lid + 0.16, cz - 1.1, cz + 1.1),
    paint(C.yellow)
  );
  add(
    'hull',
    box(cx - 0.3, cx + 0.3, lid + 0.9, lid + 1.3, cz - 0.3, cz + 0.3),
    paint(C.dark)
  );
  [-1, 1].forEach((sx) =>
    [-1, 1].forEach((sz) =>
      add(
        'hull',
        tube(
          V(cx + sx * 2.7, lid + 0.16, cz + sz * 0.9),
          V(cx + sx * 0.2, lid + 0.95, cz + sz * 0.2),
          0.035,
          4,
          true
        ),
        steel,
        { shine: STEEL }
      )
    )
  );
  add('hull', tube(V(cx, lid + 1.3, cz), tip, 0.035, 4, true), steel, {
    shine: STEEL,
  });
  lamp('floods', tip.clone().add(V(0, -0.15, 0)), V(0, -1, 0), C.flood, {
    size: 0.18,
    spill: 0,
  });
  lamp('beacons', mast, V(0, 1, 0), C.beacon, { size: 0.1, spill: 0 });

  // --- The hangar under the spine: the drones leave by its forward mouth -------
  const mouth = 16;
  add(
    'hull',
    cross(
      [
        [-3.6, -6.4],
        [3.6, -6.4],
        [3.6, -7.4],
        [3.0, -8.0],
        [-3.0, -8.0],
        [-3.6, -7.4],
      ],
      4.5,
      mouth
    ),
    paint(C.grey)
  );
  for (let x = 5; x < mouth - 1; x += 2.1) {
    add('hull', box(x, x + 1.8, -7.3, -6.6, 3.6, 3.72), paint(C.light), {
      mirror: true,
    });
    add('hull', box(x + 0.5, x + 1.3, -7.1, -6.85, 3.72, 3.76), paint(C.soot), {
      mirror: true,
    });
    add(
      'windows',
      box(x + 0.6, x + 1.2, -7.05, -6.9, 3.76, 3.79),
      paint('#8fd4ff', 0.5 + random() * 0.6),
      { uv: false, mirror: true }
    );
  }
  // The mouth: a dark bay, hazard-striped jambs, a lit lintel and sill.
  add('hull', box(mouth, mouth + 0.05, -7.75, -6.6, -3.0, 3.0), paint(C.soot));
  add(
    'hull',
    box(mouth - 0.1, mouth + 0.3, -6.6, -6.4, -3.6, 3.6),
    paint(C.orange)
  );
  for (let n = 0; n < 6; n += 1) {
    const y = -7.9 + n * 0.22;
    add(
      'hull',
      box(mouth - 0.1, mouth + 0.3, y, y + 0.22, 3.0, 3.6),
      paint(n % 2 ? C.yellow : C.soot),
      { mirror: true }
    );
  }
  add(
    'windows',
    box(mouth + 0.05, mouth + 0.09, -6.78, -6.68, -2.8, 2.8),
    paint(C.glass, 1.6),
    { uv: false }
  );
  for (let z = -2.4; z <= 2.4; z += 0.8) {
    add(
      'windows',
      box(mouth + 0.05, mouth + 0.09, -7.5, -6.95, z - 0.05, z + 0.05),
      paint(C.glass, 0.5),
      { uv: false }
    );
  }
  add('hull', box(mouth, mouth + 5.5, -7.92, -7.76, -0.4, 0.4), steel, {
    shine: STEEL,
  });
  add('hull', box(mouth, mouth + 0.6, -8.0, -7.75, -3.0, 3.0), paint(C.mid));
  [1, -1].forEach((s) => {
    lamp('lamps', V(mouth + 0.3, -6.5, 3.3 * s), V(1, 0, 0), C.amber, {
      size: 0.14,
      spill: 0,
    });
    for (let x = mouth + 0.8; x < mouth + 5.5; x += 1.1) {
      lamp('floods', V(x, -7.76, 0.3 * s), V(0, 1, 0), C.glass, {
        size: 0.07,
        spill: 0,
      });
    }
  });
  return { hangar: [mouth + 0.3, -7.2, 0] };
}
