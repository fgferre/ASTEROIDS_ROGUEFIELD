// Prime Gate (docs/ROTEIRO.md "Os lugares" 3): right against the Ring's
// outer wall. The wall fills the view below the field, plate after plate,
// running lines along it, its rim edge across the top with space past it;
// in it a gate, its frame lit, its shaft glowing faintly.

import { gradientDisc } from './kit.js';
import { lightPoint, under } from './pieces.js';

// proposta 12/11: the wall's plates (cell size, extent, rim) and the gate
// (centre, aperture radius), in the wall's own units.
const WALL = { cell: [210, 150], x: [-2400, 2400], z: [-470, 1500] };
const GATE = { at: [520, 330], radius: 300 };

export function buildPrimeGate(THREE, kit) {
  const { tone, random } = kit;
  const wall = kit.parts();
  const lit = kit.parts();
  const plates = [
    tone('#181b1f'),
    tone('#1d2025'),
    tone('#15171a'),
    tone('#212429'),
  ];
  const recess = tone('#0c0d0f');
  const rib = tone('#24282e');
  const line = tone('#7fe6ff', 0.16);
  const gateLine = tone('#9fe8ff', 0.2);
  const lamp = tone('#ffe2b0', 0.6);

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
      wall,
      rib,
      at(1.24, 50),
      [len * r * 1.24 + 8, 100, r * 0.42],
      tangent
    );
    kit.box(wall, rib, at(1.38, 90), [len * r * 0.7, 36, r * 0.12], tangent);
    kit.box(wall, recess, at(1.03, -150), [len * r * 1.03, 300, 16], tangent);
    kit.box(lit, gateLine, at(1.06, 82), [len * r * 1.04, 3, 4], tangent);
    const corner = (i / sides) * Math.PI * 2;
    lightPoint(
      kit,
      lit,
      lamp,
      [gx + Math.cos(corner) * r * 1.42, 96, gz + Math.sin(corner) * r * 1.42],
      8
    );
    if (i % 2 === 0) {
      kit.box(wall, rib, at(1.75, 30), [r * 0.62, 50, 60], [0, -a, 0]);
    }
  }
  // The shaft's light, deep in the opening.
  kit.put(
    lit,
    gradientDisc(THREE, (k) => 0.25 + 0.75 * (1 - k) ** 2, {
      rings: 6,
      sides: 32,
    }),
    tone('#4fc8e0', 0.16),
    [gx, -260, gz],
    r
  );

  const object = new THREE.Group();
  object.add(kit.mesh(wall), kit.mesh(lit, 'glow'));
  object.rotation.set(0, 0.14, 0);
  return { layers: [{ object, anchor: under(1400), follow: 0.4 }] };
}
