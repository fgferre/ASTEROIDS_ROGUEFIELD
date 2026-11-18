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
const CRANE_BAY = 2;
const CRANE_COLUMN = 3;

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

  // --- The overhead crane, one container on the hook ---------------------------
  add(
    'hull',
    box(GANTRIES[0] - 0.5, X1 - 0.1, 6.45, 6.8, 4.3, 4.7),
    paint(C.dark),
    {
      mirror: true,
    }
  );
  const cx = (GANTRIES[CRANE_BAY] + GANTRIES[CRANE_BAY + 1]) / 2;
  const cz = (CRANE_COLUMN - 2) * BOX.pitch;
  [-0.75, 0.35].forEach((dx) =>
    add(
      'hull',
      box(cx + dx, cx + dx + 0.4, 6.8, 7.5, -5.2, 5.2),
      paint(C.yellow)
    )
  );
  add('hull', box(cx - 1.1, cx + 1.1, 6.8, 7.2, 4.1, 4.9), paint(C.dark), {
    mirror: true,
  });
  add(
    'hull',
    box(cx - 0.7, cx + 0.7, 7.5, 8.0, cz - 0.8, cz + 0.8),
    paint(C.mid)
  );
  add(
    'hull',
    box(cx - 0.45, cx + 0.45, 6.2, 6.8, cz - 0.5, cz + 0.5),
    paint(C.orange)
  );
  const hook = 2.3;
  container(cx, hook, cz, false);
  add(
    'hull',
    box(
      cx - 3.0,
      cx + 3.0,
      hook + BOX.height,
      hook + BOX.height + 0.16,
      cz - 1.1,
      cz + 1.1
    ),
    paint(C.yellow)
  );
  [-1, 1].forEach((sx) =>
    [-1, 1].forEach((sz) =>
      add(
        'hull',
        tube(
          V(cx + sx * 2.7, hook + BOX.height + 0.16, cz + sz * 0.9),
          V(cx + sx * 0.4, 6.3, cz + sz * 0.35),
          0.035,
          4,
          true
        ),
        steel,
        { shine: STEEL }
      )
    )
  );
  lamp('floods', V(cx, 6.2, cz), V(0, -1, 0), C.flood, { size: 0.2, spill: 0 });

  // --- The hangar under the spine ------------------------------------------------
  const mouth = 16;
  add('hull', box(6, mouth, -7.8, -6.4, -3.4, 3.4), paint(C.mid));
  add('hull', box(6.4, mouth - 0.6, -7.95, -7.8, -3.0, 3.0), paint(C.dark));
  add('hull', box(mouth, mouth + 0.06, -7.6, -6.65, -2.9, 2.9), paint(C.soot));
  add(
    'windows',
    box(mouth + 0.06, mouth + 0.1, -6.8, -6.7, -2.7, 2.7),
    paint(C.glass, 1.8),
    { uv: false }
  );
  add(
    'windows',
    box(mouth + 0.06, mouth + 0.1, -7.55, -7.47, -2.7, 2.7),
    paint(C.glass, 1.0),
    { uv: false }
  );
  add('hull', box(mouth, mouth + 5.5, -7.62, -7.46, -0.35, 0.35), steel, {
    shine: STEEL,
  });
  [1, -1].forEach((s) => {
    add(
      'hull',
      box(mouth - 0.1, mouth + 0.2, -7.8, -6.4, 2.9 * s, 3.4 * s),
      paint(C.orange)
    );
    lamp('lamps', V(mouth + 0.2, -6.55, 3.15 * s), V(1, 0, 0), C.amber, {
      size: 0.14,
    });
    for (let x = mouth + 1; x < mouth + 5.5; x += 1.5) {
      lamp('floods', V(x, -7.46, 0.25 * s), V(0, 1, 0), C.glass, {
        size: 0.08,
        spill: 0,
      });
    }
  });
  return { hangar: [mouth + 0.3, -7.1, 0] };
}
