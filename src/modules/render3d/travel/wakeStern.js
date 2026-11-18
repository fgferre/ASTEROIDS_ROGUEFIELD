// src/modules/render3d/travel/wakeStern.js
//
// The Wake's stern (wake.js): the tall aft block with its plating, pipe
// trenches and radiator fins, widening into the engine block; the bridge
// (wakeBridge.js) stands on its deck and the engines (wakeEngines.js) on its
// after face.

import { buildBridge } from './wakeBridge.js';
import { fittings } from './wakeDetail.js';
import { buildEngines } from './wakeEngines.js';
import {
  ENGINE_BLOCK as BLOCK,
  ENGINE_TAIL as TAIL,
  STERN_AFT as AFT,
  STERN_BASE as BASE,
  WAKE_COLORS as C,
  facet,
  octagon,
  wakeMark,
} from './wakeHull.js';

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
  armour(
    'hull',
    facet(V, BASE, AFT, 'deck'),
    cuts(6, 0.4),
    [0, 0.45, 0.82, 1],
    (i, j) => ({
      color: j === 2 ? grey() : paint(i % 2 ? C.mid : C.grey),
      thick: 0.12,
    })
  );
  armour(
    'hull',
    facet(V, AFT, BLOCK, 'deck'),
    [0.06, 0.94],
    [0, 0.5, 1],
    (i, j) => ({
      color: paint(j ? C.grey : C.mid),
      thick: 0.12,
      lift: 0.04,
    })
  );
  const bilge = facet(V, BASE, AFT, 'bilge');
  armour('hull', bilge, cuts(6, 0.5), [0, 0.5, 1], (i, j) => ({
    color: j ? paint(C.grey) : grey(),
    thick: thick(),
    skip: j === 1 && i % 3 === 2,
  }));
  fittings(kit, bilge).scatter({ density: 0.3, cell: [2.8, 1.8], lit: false });
  [0.08, 0.3, 0.52, 0.74, 0.94].forEach((fx) =>
    fittings(kit, bilge).light(fx, 0.12, 'floods', C.flood, {
      size: 0.12,
      gain: 2,
      spill: 2.6,
      spillGain: 0.3,
    })
  );
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
    for (let x = -16.6; x > -34; x -= 3.3) {
      lamp(
        'lamps',
        V(x, BASE.yl - 0.05, (BASE.hw + 0.5) * s),
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
      size: 0.12,
      gain: 1.3,
      spill: 1.3,
      spillGain: 0.3,
    })
  );
}

// Under and along the stern: an armour belt on the lower chine, ribs where
// the block widens to the engines, two hanging pods and a keel fin, vented
// and lit.
function buildUnderside(kit) {
  const { V, add, box, body, profile, lamp, paint, random } = kit;
  const steel = { roughness: 0.5, metalness: 0.6 };

  // The belt: a heavy rail on the lower chine, brackets under it.
  add(
    'hull',
    box(
      -34.6,
      -15.2,
      BASE.yl - 0.45,
      BASE.yl + 0.35,
      BASE.hw - 0.1,
      BASE.hw + 0.45
    ),
    paint(C.mid),
    { mirror: true }
  );
  add(
    'hull',
    box(
      -34.4,
      -15.4,
      BASE.yl + 0.35,
      BASE.yl + 0.5,
      BASE.hw - 0.1,
      BASE.hw + 0.3
    ),
    paint(C.orange),
    { mirror: true }
  );
  for (let x = -15.8; x > -34.6; x -= 1.65) {
    add(
      'hull',
      box(
        x - 0.3,
        x,
        BASE.yl - 1.2,
        BASE.yl - 0.45,
        BASE.hw - 0.6,
        BASE.hw + 0.3
      ),
      paint(C.dark),
      { mirror: true }
    );
  }

  // Ribs on the flare from the stern block to the engine block.
  for (let n = 0; n < 7; n += 1) {
    const t = (n + 0.5) / 7;
    const x = AFT.x + (BLOCK.x - AFT.x) * t;
    const z = AFT.hw + (BLOCK.hw - AFT.hw) * t;
    add(
      'hull',
      box(x - 0.16, x + 0.16, -2.6, 2.9, z - 0.3, z + 0.32),
      paint(n % 3 ? C.dark : C.orange),
      { mirror: true, shine: steel }
    );
  }

  // Two pods under the bilges: flat on top, their ends sloped.
  const pod = (x0, x1, zc, w, top, bottom) => {
    const ring = (x, k, wk) =>
      [
        [-0.7, 1],
        [-1, 0.7],
        [-1, 0.1],
        [-0.8, 0],
        [0.8, 0],
        [1, 0.1],
        [1, 0.7],
        [0.7, 1],
      ].map(([a, f]) => V(x, top - f * (top - bottom) * k, zc + a * w * wk));
    return body([
      ring(x0, 0.25, 0.8),
      ring(x0 - 2.2, 1, 1),
      ring(x1 + 2.6, 1, 1),
      ring(x1, 0.35, 0.85),
    ]);
  };
  add('hull', pod(-17.2, -33.6, 6.3, 1.6, -3.8, -8.5), paint(C.mid), {
    mirror: true,
    shine: steel,
  });
  // Armour plates, vents and a fin on each pod.
  const cuts = [-19.6, -23.4, -27.3, -31.2];
  cuts.forEach((x, n) => {
    add(
      'hull',
      box(x - 3.6, x - 0.12, -7.15, -5.0, 7.8, 8.02),
      paint(n === 1 ? C.orange : random() < 0.5 ? C.grey : C.light),
      { mirror: true }
    );
    add(
      'hull',
      box(x - 3.5, x - 0.2, -8.62, -8.5, 5.3, 7.3),
      paint(n % 2 ? C.dark : C.grey),
      { mirror: true }
    );
  });
  for (let x = -24.0; x > -27.0; x -= 0.32) {
    add('hull', box(x - 0.12, x, -6.9, -5.3, 8.0, 8.12), paint(C.soot), {
      mirror: true,
    });
  }
  add(
    'hull',
    profile(
      [
        [-21, -8.5],
        [-23.5, -9.6],
        [-31.5, -9.6],
        [-32.6, -8.5],
      ],
      6.15,
      6.45
    ),
    paint(C.dark),
    { mirror: true }
  );
  [-1, 1].forEach((s) => {
    [-21.2, -25.6, -30.2].forEach((x) =>
      lamp('lamps', V(x, -6.4, 8.04 * s), V(0, 0, s), C.amber, {
        size: 0.12,
        spill: 1,
      })
    );
    lamp('floods', V(-17.6, -6.6, 6.3 * s), V(1, 0, 0), C.flood, {
      size: 0.14,
      gain: 1.8,
      spill: 1.4,
      spillGain: 0.3,
    });
  });

  // The keel fin down the middle, ribbed, lamps under it.
  add(
    'hull',
    profile(
      [
        [-17.6, -6.9],
        [-20.4, -9.0],
        [-34.0, -9.0],
        [-36.6, -6.6],
      ],
      -1.0,
      1.0
    ),
    paint(C.dark),
    { shine: steel }
  );
  add('hull', box(-33.4, -21.0, -9.25, -9.0, -0.6, 0.6), paint(C.orange));
  for (let x = -21.8; x > -33.5; x -= 1.4) {
    add('hull', box(x - 0.22, x, -8.9, -7.2, -1.12, 1.12), paint(C.grey));
  }
  [-23, -28, -32.6].forEach((x) =>
    lamp('lamps', V(x, -9.25, 0), V(0, -1, 0), C.amber, {
      size: 0.14,
      spill: 1.2,
    })
  );
}

export function buildStern(kit) {
  buildBlock(kit);
  buildUnderside(kit);
  const bridge = buildBridge(kit);
  const engines = buildEngines(kit);
  return { bridge, engines };
}
