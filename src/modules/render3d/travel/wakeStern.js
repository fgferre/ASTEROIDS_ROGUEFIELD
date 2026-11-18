// src/modules/render3d/travel/wakeStern.js
//
// The Wake's stern (wake.js): the tall aft block with its plating and
// radiator fins, the bridge stacked on its deck (two houses, the glazed
// bridge leaning out over them, masts and antennas on the roof, a funnel
// behind) and the wide engine block with three round engines, the middle
// one bigger, each lit apart.

import { fittings } from './wakeDetail.js';
import {
  STEEL,
  WAKE_COLORS as C,
  facet,
  octagon,
  wakeMark,
} from './wakeHull.js';

const BASE = {
  x: -14,
  hw: 8.9,
  tw: 5.8,
  kw: 4.8,
  yt: 6.8,
  yh: 3.5,
  yl: -3.1,
  yb: -7.2,
};
const AFT = { ...BASE, x: -35 };
// The engine block: wider and flatter, to carry three engines abreast.
const BLOCK = {
  x: -39,
  hw: 10.4,
  tw: 7.0,
  kw: 6.4,
  yt: 5.4,
  yh: 3.4,
  yl: -3.8,
  yb: -6.6,
};
const TAIL = { ...BLOCK, x: -45.5 };
const ENGINES = [
  { z: -6.75, r: 3.05 },
  { z: 0, r: 3.4 },
  { z: 6.75, r: 3.05 },
];
const ENGINE_Y = -0.6;
const DECK = BASE.yt;

function buildBlock(kit) {
  const { V, add, box, body, armour, cuts, lamp, paint, random } = kit;
  add(
    'hull',
    body([BASE, AFT, BLOCK, TAIL].map((s) => octagon(V, s))),
    paint(C.dark)
  );
  const greys = [C.light, C.light, C.grey];
  const grey = () => paint(greys[Math.floor(random() * greys.length)]);
  const thick = () => 0.14 + random() * 0.1;

  // The side band: an orange band forward, plates with a pipe trench, the
  // plate with the small mark, then the radiator.
  const side = facet(V, BASE, AFT, 'side');
  armour(
    'hull',
    side,
    [0, 0.03, 0.14, 0.36, 0.6, 0.66, 0.96, 1],
    (i) => (i === 2 || i === 4 ? [0, 0.42, 0.54, 1] : [0, 1]),
    (i, j) => ({
      skip: j === 1,
      color:
        i === 1
          ? paint(C.orange)
          : i === 0 || i === 6
            ? paint(C.mid)
            : i === 5
              ? paint(C.dark)
              : i === 3
                ? paint(C.grey)
                : grey(),
      thick: i === 5 ? 0.08 : thick(),
      cut: i === 1 ? [3, 0.3] : null,
    })
  );
  const onSide = fittings(kit, side);
  onSide.pipes(0.145, 0.355, 0.48, 2);
  onSide.pipes(0.605, 0.655, 0.48, 2);
  onSide.windows(0.25, 0.12, 3.4, 0.6);
  onSide.vent(0.2, 0.86, 1.6, 0.6);
  onSide.hatch(0.31, 0.84, 1.2, 0.9);
  onSide.windows(0.48, 0.1, 4, 0.5);
  // The radiator: fins standing off a dark plate, framed.
  for (let fx = 0.672; fx < 0.955; fx += 0.0195) {
    onSide.patch(fx, 0.5, 0.14, onSide.height - 1.1, 0.08, 0.45, paint(C.grey));
  }
  [0.06, 0.94].forEach((ft) =>
    onSide.strip(
      0.662,
      0.958,
      ft,
      0.3,
      paint(ft < 0.5 ? C.mid : C.orange),
      0.08,
      0.55
    )
  );
  onSide.strip(0.662, 0.958, 0.5, 0.2, paint(C.mid), 0.08, 0.5);

  const shoulder = facet(V, BASE, AFT, 'shoulder');
  armour(
    'hull',
    shoulder,
    cuts(7, 0.5),
    (i) => (i % 2 ? [0, 0.42, 0.56, 0.78, 1] : [0, 0.42, 0.56, 1]),
    (i, j) => ({
      skip: j === 1,
      color:
        i === 0 ? paint(C.orange) : j === 0 && i === 4 ? paint(C.mid) : grey(),
      thick: thick(),
      cut: i === 0 && j === 0 ? [3, 0.3] : null,
    })
  );
  const onShoulder = fittings(kit, shoulder);
  onShoulder.pipes(0.02, 0.98, 0.49, 3);
  onShoulder.scatter({
    density: 0.5,
    cell: [2.4, 1.3],
    keep: (fx, ft) => ft < 0.36 || ft > 0.62,
  });
  armour('hull', facet(V, BASE, AFT, 'deck'), cuts(5, 0.4), [0.82, 1], () => ({
    color: grey(),
    thick: 0.12,
  }));
  const bilge = facet(V, BASE, AFT, 'bilge');
  armour('hull', bilge, cuts(6, 0.5), [0, 0.5, 1], (i, j) => ({
    color: j ? paint(C.grey) : grey(),
    thick: thick(),
    skip: j === 1 && i % 3 === 2,
  }));
  fittings(kit, bilge).scatter({ density: 0.3, cell: [2.8, 1.8], lit: false });
  armour('hull', facet(V, BASE, AFT, 'keel'), cuts(5, 0.4), [0, 0.7], () => ({
    color: paint(C.mid),
    thick: 0.2,
  }));

  // The engine block: grey with orange cowling, vents on its deck.
  const blockSide = facet(V, BLOCK, TAIL, 'side');
  armour('hull', blockSide, [0, 0.45, 1], [0, 1], (i) => ({
    color: i ? paint(C.orange) : grey(),
    thick: 0.2,
    cut: i ? [1, 0.25] : null,
  }));
  const onBlock = fittings(kit, blockSide);
  onBlock.vent(0.22, 0.3, 1.8, 1.6);
  onBlock.hatch(0.24, 0.76, 1.6, 1.2);
  onBlock.vent(0.74, 0.5, 2.2, 0.9);
  armour(
    'hull',
    facet(V, BLOCK, TAIL, 'shoulder'),
    [0, 0.5, 1],
    [0, 0.55, 1],
    (i, j) => ({
      color: i && j ? paint(C.orange) : grey(),
      thick: thick(),
    })
  );
  const blockDeck = facet(V, BLOCK, TAIL, 'deck');
  armour('hull', blockDeck, [0, 0.5, 1], [0, 0.45, 1], (i, j) => ({
    color: j ? grey() : paint(C.mid),
    thick: 0.14,
  }));
  const onBlockDeck = fittings(kit, blockDeck);
  [0.25, 0.75].forEach((fx) => {
    onBlockDeck.vent(fx, 0.24, 2.2, 2.4);
    onBlockDeck.vent(fx, 0.72, 2.2, 2.4);
  });
  armour('hull', facet(V, BLOCK, TAIL, 'bilge'), [0, 0.5, 1], [0, 1], (i) => ({
    color: i ? paint(C.grey) : grey(),
    thick: 0.2,
  }));
  ['side', 'shoulder', 'bilge'].forEach((name) =>
    armour('hull', facet(V, AFT, BLOCK, name), [0.08, 0.92], [0, 1], () => ({
      color: paint(name === 'side' ? C.grey : C.mid),
      thick: 0.14,
      lift: 0.06,
    }))
  );

  // The small mark, and lamps along the chines.
  [1, -1].forEach((s) => {
    wakeMark(
      kit,
      V(s > 0 ? -25.6 : -22.6, -0.9, (BASE.hw + 0.26) * s),
      s,
      1.9,
      false
    );
    for (let x = -16; x > -34; x -= 3.3) {
      lamp(
        'lamps',
        V(x, BASE.yl + 0.25, (BASE.hw + 0.24) * s),
        V(0, 0, s),
        C.amber,
        { size: 0.13, spill: 1.3 }
      );
    }
    for (let x = -40; x > -45.5; x -= 2.4) {
      lamp(
        'lamps',
        V(x, BLOCK.yh - 0.3, (BLOCK.hw + 0.2) * s),
        V(0, 0, s),
        C.amber,
        { size: 0.13, spill: 1.2 }
      );
    }
  });

  // The forward face, over the cargo: crew windows and work lights.
  for (let z = -4.8; z <= 4.8; z += 0.8) {
    if (random() < 0.25) continue;
    add(
      'windows',
      box(BASE.x, BASE.x + 0.05, 5.8, 6.02, z - 0.2, z + 0.2),
      paint(random() < 0.6 ? C.glass : C.amber, 1.2),
      { uv: false }
    );
  }
  [-3.4, 0, 3.4].forEach((z) =>
    lamp('floods', V(BASE.x + 0.02, 6.5, z), V(1, 0, 0), C.flood, {
      size: 0.22,
      gain: 3,
      spill: 1.6,
    })
  );
}

function buildBridge(kit) {
  const { V, add, box, body, plate, tube, lathe, lamp, railing, paint } = kit;
  const { random } = kit;
  const steel = paint(C.steel);
  const lit = () =>
    paint(random() < 0.72 ? C.glass : C.amber, 0.8 + random() * 0.6);
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
  // Portholes along a house's sides and across its front.
  const portholes = (x0, x1, hz, y, front) => {
    [1, -1].forEach((s) => {
      for (let x = x0; x < x1; x += 0.9) {
        if (random() < 0.5) continue;
        add(
          'windows',
          box(x, x + 0.34, y, y + 0.2, hz * s, (hz + 0.04) * s),
          lit(),
          { uv: false }
        );
      }
    });
    for (let z = -hz + 1.5; z < hz - 1.6; z += 0.8) {
      if (random() < 0.3) continue;
      add('windows', box(front, front + 0.04, y, y + 0.2, z, z + 0.34), lit(), {
        uv: false,
      });
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
        [0.36, 0.54, '#9adcff', 1.2],
        [0.54, 0.88, '#2f9cf0', 0.75],
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
      size: 0.16,
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
  house(-39.2, -35.6, 2.6, 0.5, BLOCK.yt, cap, C.dark);
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
    add('hull', box(-38.8, -36, y, y + 0.14, 2.6, 2.7), paint(C.mid), {
      mirror: true,
    });
  }
  return [-19.5, y0 + 1.1, 0];
}

function buildEngines(kit) {
  const { V, add, box, lathe, lamp, pool, paint } = kit;
  const face = TAIL.x;
  const aft = V(-1, 0, 0);
  ENGINES.forEach(({ z, r }, i) => {
    const at = V(face + 0.2, ENGINE_Y, z);
    const along = (d) => V(at.x - d, at.y, at.z);
    // An eight-sided cowl, then the ribbed bell.
    add(
      'hull',
      lathe(
        [
          [r * 1.17, 0],
          [r * 1.17, 1.1],
          [r * 1.06, 1.6],
        ],
        8,
        at,
        aft
      ),
      paint(i === 1 ? C.grey : C.orange)
    );
    add(
      'hull',
      lathe(
        [
          [0.72, 0],
          [0.86, 0.7],
          [0.92, 0.7],
          [0.92, 1.2],
          [0.86, 1.2],
          [0.9, 1.8],
          [0.97, 1.8],
          [0.97, 2.4],
          [0.9, 2.4],
          [0.95, 3.2],
          [1.0, 3.2],
          [1.0, 4.1],
          [0.94, 4.3],
        ].map(([k, d]) => [k * r, d]),
        24,
        at,
        aft
      ),
      paint(C.dark),
      { smooth: true, shine: { roughness: 0.5, metalness: 0.6 } }
    );
    // The fire inside: the bell's wall glowing hotter toward the throat,
    // dark rings standing in it, a white core.
    const set = `engine${i}`;
    const steps = 10;
    for (let n = 0; n < steps; n += 1) {
      const [t0, t1] = [n / steps, (n + 1) / steps];
      const k = (t) => 0.93 - 0.63 * t;
      const d = (t) => 4.2 - 3.3 * t;
      add(
        set,
        lathe(
          [
            [k(t0) * r, d(t0)],
            [k(t1) * r, d(t1)],
          ],
          24,
          at,
          aft
        ),
        paint(C.engine, 0.1 * 28 ** ((n + 0.5) / steps)),
        { uv: false, smooth: true }
      );
    }
    [
      [0.8, 3.45],
      [0.63, 2.55],
      [0.46, 1.65],
    ].forEach(([k, d]) =>
      add(
        set,
        lathe(
          [
            [(k - 0.035) * r, d + 0.02],
            [(k + 0.035) * r, d],
          ],
          24,
          at,
          aft
        ),
        paint('#020a12'),
        { uv: false, smooth: true }
      )
    );
    add(`${set}Pools`, pool(along(0.95), aft, r * 0.5), paint('#dcefff', 2.6), {
      uv: false,
    });
    add(`${set}Pools`, pool(along(2.6), aft, r * 0.95), paint(C.engine, 0.7), {
      uv: false,
    });
    add(`${set}Pools`, pool(along(4.5), aft, r * 1.7), paint(C.engine, 0.22), {
      uv: false,
    });
  });
  // Fins between the engines, a brow over them and a lip under.
  [3.55, -3.55].forEach((z) => {
    add(
      'hull',
      box(face - 2.2, face, -3.6, 2.6, z - 0.12, z + 0.12),
      paint(C.grey)
    );
    lamp('lamps', V(face - 2.2, ENGINE_Y, z), aft, C.amber, {
      size: 0.14,
      spill: 0,
    });
  });
  add('hull', box(face - 0.9, face, 3.2, 3.7, -9.6, 9.6), paint(C.grey));
  add('hull', box(face - 0.5, face, -4.6, -4.2, -9.2, 9.2), paint(C.grey));
  [1, -1].forEach((s) => {
    lamp('lamps', V(face - 0.9, 3.45, 8.8 * s), aft, C.amber, {
      size: 0.16,
      spill: 0,
    });
    lamp('lamps', V(face - 0.9, 3.45, 2.6 * s), aft, C.amber, {
      size: 0.12,
      spill: 0,
    });
  });
  return ENGINES.map(({ z }) => [face - 4.2, ENGINE_Y, z]);
}

export function buildStern(kit) {
  buildBlock(kit);
  const bridge = buildBridge(kit);
  const engines = buildEngines(kit);
  return { bridge, engines };
}
