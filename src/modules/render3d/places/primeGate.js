// Prime Gate (docs/ROTEIRO.md "Os lugares" 3): right against the Ring's
// outer wall. The wall fills the view below the field, plate after plate,
// running lines along it, its rim edge across the top with space past it;
// in it a gate with power after a thousand years: its frame lined with
// light and lamps, guide lights leading to it, its shaft lit from inside.
// When Warden Prime yields the gate lets one hull through: its frame turns
// like a lock coming undone and the shaft and the guides flare.

import { gradientDisc } from './kit.js';
import { lightPoint, under } from './pieces.js';

// proposta 12/11: the wall's plates (cell size, extent, rim) and the gate
// (centre, aperture radius), in the wall's own units.
const WALL = { cell: [210, 150], x: [-2400, 2400], z: [-470, 1500] };
const GATE = { at: [520, 330], radius: 300 };
// proposta 12/11: the open gate — the frame's turn (radians: half a side),
// the shaft and guides `flare` times brighter, the turn done by `turned`
// of the wake and the flare starting at `from`.
const OPEN = { turn: Math.PI / 8, flare: 2.6, turned: 0.7, from: 0.25 };

export function buildPrimeGate(THREE, kit) {
  const { tone, random } = kit;
  const wall = kit.parts();
  const lit = kit.parts();
  // proposta 12/11: plates a shade darker so rocks and the ship read.
  const plates = [
    tone('#121418'),
    tone('#16191d'),
    tone('#0f1114'),
    tone('#1a1d21'),
  ];
  const recess = tone('#08090b');
  const rib = tone('#1e2227');
  const line = tone('#7fe6ff', 0.16);
  // proposta 12/11: the gate's light — frame, lamps, shaft, guides.
  const gateLine = tone('#a8f0ff', 0.5);
  const lamp = tone('#eaf8ff', 1.2);
  const shaft = tone('#5fd8f0', 0.5);
  const guide = tone('#9fe8ff', 0.6);

  const [cw, cz] = WALL.cell;
  const nearGate = (x, z) =>
    Math.hypot(x - GATE.at[0], z - GATE.at[1]) < GATE.radius * 1.55;
  for (let x = WALL.x[0]; x < WALL.x[1]; x += cw) {
    for (let z = WALL.z[0] + 60; z < WALL.z[1]; z += cz) {
      const cx = x + cw / 2;
      const cz0 = z + cz / 2;
      if (nearGate(cx, cz0)) continue;
      const deep = random() < 0.1;
      const h = deep ? 10 : 18 + random() * 22;
      kit.box(
        wall,
        deep ? recess : plates[Math.floor(random() * plates.length)],
        [cx, h / 2 - (deep ? 14 : 0), cz0],
        [cw - 12, h, cz - 12]
      );
    }
  }
  // Ribs across the plates every few columns, and the rim edge.
  for (let x = WALL.x[0]; x <= WALL.x[1]; x += cw * 4) {
    kit.box(
      wall,
      rib,
      [x, 34, (WALL.z[0] + WALL.z[1]) / 2],
      [28, 40, WALL.z[1] - WALL.z[0]]
    );
  }
  const span = WALL.x[1] - WALL.x[0];
  kit.box(wall, rib, [0, 50, WALL.z[0] + 20], [span, 110, 60]);
  kit.box(wall, plates[2], [0, -10, WALL.z[0] - 25], [span, 70, 70]);
  // Running lines along the wall, dashed.
  [140, 560, 1080].forEach((z, n) => {
    for (let x = WALL.x[0]; x < WALL.x[1]; x += 340) {
      if (random() < 0.15) continue;
      if (
        Math.abs(z - GATE.at[1]) < GATE.radius * 1.6 &&
        Math.abs(x - GATE.at[0]) < GATE.radius * 1.7
      )
        continue;
      kit.box(lit, line, [x + 150, 46, z + n * 3], [290, 3, 5]);
    }
  });

  // The gate: an octagonal frame raised off the wall, clamps round it, the
  // shaft walls down into the dark, lamps at its corners and a lit edge.
  // The frame and its lights turn as one (`frame`, `frameLit`); the shaft
  // and the guides flare (`open`).
  const frame = kit.parts();
  const frameLit = kit.parts();
  const open = kit.parts();
  const [gx, gz] = GATE.at;
  const r = GATE.radius;
  const sides = 8;
  for (let i = 0; i < sides; i += 1) {
    const a = ((i + 0.5) / sides) * Math.PI * 2;
    const tangent = [0, -(a + Math.PI / 2), 0];
    const len = 2 * Math.tan(Math.PI / sides);
    const at = (k, y) => [
      gx + Math.cos(a) * r * k,
      y,
      gz + Math.sin(a) * r * k,
    ];
    kit.box(
      frame,
      rib,
      at(1.24, 50),
      [len * r * 1.24 + 8, 100, r * 0.42],
      tangent
    );
    kit.box(frame, rib, at(1.38, 90), [len * r * 0.7, 36, r * 0.12], tangent);
    kit.box(wall, recess, at(1.03, -150), [len * r * 1.03, 300, 16], tangent);
    // The lit lip on top of the frame, and a fainter one round its rim.
    kit.box(frameLit, gateLine, at(1.07, 102), [len * r * 1.07, 3, 6], tangent);
    kit.box(
      frameLit,
      gateLine.clone().multiplyScalar(0.4),
      at(1.44, 102),
      [len * r * 1.44, 3, 5],
      tangent
    );
    // Rings of light down the shaft, brighter the deeper: lit from inside.
    [-50, -120, -190].forEach((y, d) =>
      kit.box(
        open,
        shaft.clone().multiplyScalar(0.35 + d * 0.3),
        at(1.0, y),
        [len * r, 4, 8],
        tangent
      )
    );
    const corner = (i / sides) * Math.PI * 2;
    lightPoint(
      kit,
      frameLit,
      lamp,
      [gx + Math.cos(corner) * r * 1.42, 128, gz + Math.sin(corner) * r * 1.42],
      12
    );
    if (i % 2 === 0) {
      kit.box(frame, rib, at(1.75, 30), [r * 0.62, 50, 60], [0, -a, 0]);
    }
  }
  // The shaft's light, deep in the opening, and its spill on the wall.
  kit.put(
    open,
    gradientDisc(THREE, (k) => 0.12 + 0.88 * (1 - k) ** 3, {
      rings: 8,
      sides: 32,
    }),
    shaft,
    [gx, -260, gz],
    r
  );
  kit.put(
    open,
    gradientDisc(THREE, (k) => 0.12 * (1 - k) ** 2, {
      rings: 8,
      sides: 40,
      hole: 0.55,
    }),
    shaft,
    [gx, 120, gz],
    r * 2.4
  );
  // Guide lights along the wall leading in to the gate, brightening.
  for (let x = gx - r * 1.9, n = 0; n < 9; x -= 150, n += 1) {
    [-1, 1].forEach((s) =>
      kit.box(
        open,
        guide.clone().multiplyScalar(1 - n * 0.09),
        [x, 60, gz + s * r * 0.45],
        [40, 3, 9]
      )
    );
  }

  // The frame turns about the gate's centre.
  const lock = new THREE.Group();
  lock.position.set(gx, 0, gz);
  lock.add(
    kit.mesh(kit.moved(frame, [-gx, 0, -gz])),
    kit.mesh(kit.moved(frameLit, [-gx, 0, -gz]), 'glow')
  );
  const object = new THREE.Group();
  object.add(
    kit.mesh(wall),
    kit.mesh(lit, 'glow'),
    kit.mesh(open, 'glow', 'gate-open'),
    lock
  );
  object.rotation.set(0, 0.14, 0);
  const flare = kit.materials.get('gate-open');
  return {
    layers: [{ object, anchor: under(1400), follow: 0.4 }],
    update(time, wake) {
      const k = Math.min(1, wake);
      const turn = Math.min(1, k / OPEN.turned);
      lock.rotation.y = OPEN.turn * turn * turn * (3 - 2 * turn);
      const up = Math.max(0, (k - OPEN.from) / (1 - OPEN.from));
      flare.color.setScalar(1 + (OPEN.flare - 1) * up);
    },
  };
}
