// Salvage Lanes (docs/ROTEIRO.md "Os lugares" 2): the cargo route, a
// graveyard of freighters. Three enormous dead freighters lie in file at
// three depths — each a clear hull from above: a long plated body, a pointed
// bow, a bridge tower and an engine block at the stern — dark, a few running
// lights still dimly on; past them the Ring, larger than from the wake.

import { slab } from '../enemies/shapes.js';
import { lightPoint, ringBand, under } from './pieces.js';

// One dead freighter along x (bow at +x), `length` long and `beam` across.
// `torn` (shares of the length) strips the plating off a stretch amidships,
// its frames bare.
function freighter(kit, hull, lights, { length: L, beam: B, torn = null }) {
  const { THREE, tone, random } = kit;
  const steel = [tone('#25282c'), tone('#222529'), tone('#282b2f')];
  const dark = tone('#17191c');
  const deck = tone('#2c2f33');
  const dead = tone('#8fe0d0', 0.55);
  const amber = tone('#ffb460', 0.9);
  const half = B / 2;
  // The hull from above: a flat stern, straight sides, a long taper to a
  // blunt point.
  const plan = [
    [-L / 2, -half],
    [0.22 * L, -half],
    [0.44 * L, -half * 0.45],
    [L / 2, -half * 0.1],
    [L / 2, half * 0.1],
    [0.44 * L, half * 0.45],
    [0.22 * L, half],
    [-L / 2, half],
  ];
  const tornAt = (x) => torn && x / L + 0.5 > torn[0] && x / L + 0.5 < torn[1];
  // The keel body, under everything.
  kit.put(
    hull,
    slab(THREE, plan, -B * 0.42, -B * 0.06, B * 0.05),
    dark,
    [0, 0, 0]
  );
  // The deck plating in long plates, seams between; bare frames where torn.
  const plates = 7;
  for (let i = 0; i < plates; i += 1) {
    const x0 = -L / 2 + (i / plates) * L * 0.94;
    const x1 = -L / 2 + ((i + 1) / plates) * L * 0.94 - L * 0.008;
    const mid = (x0 + x1) / 2;
    const w =
      mid > 0.22 * L
        ? half * (1 - ((mid - 0.22 * L) / (0.28 * L)) * 0.7)
        : half;
    if (tornAt(mid)) {
      for (let x = x0; x < x1; x += B * 0.18) {
        kit.box(
          hull,
          steel[0],
          [x, -B * 0.02, 0],
          [B * 0.05, B * 0.06, w * 1.9]
        );
      }
      kit.box(hull, dark, [mid, -B * 0.03, 0], [x1 - x0, B * 0.05, B * 0.1]);
      continue;
    }
    kit.box(
      hull,
      steel[i % 3],
      [mid, -B * 0.02, 0],
      [x1 - x0, B * 0.08, w * 1.86]
    );
  }
  // A raised spine and two long covered cargo bays either side of it.
  kit.box(hull, deck, [-0.02 * L, B * 0.05, 0], [L * 0.62, B * 0.07, B * 0.12]);
  [-1, 1].forEach((side) => {
    for (let x = -0.28 * L; x < 0.2 * L; x += 0.17 * L) {
      if (tornAt(x + 0.08 * L)) continue;
      kit.box(
        hull,
        steel[1],
        [x + 0.08 * L, B * 0.06, side * half * 0.5],
        [0.15 * L, B * 0.1, half * 0.62]
      );
    }
  });
  // The bridge: a stepped tower over the stern, a mast on top.
  kit.box(
    hull,
    steel[2],
    [-0.37 * L, B * 0.18, 0],
    [0.09 * L, B * 0.36, B * 0.78]
  );
  kit.box(hull, deck, [-0.38 * L, B * 0.42, 0], [0.06 * L, B * 0.16, B * 0.56]);
  kit.box(hull, dark, [-0.385 * L, B * 0.62, 0], [B * 0.04, B * 0.3, B * 0.04]);
  // The engine block past the stern, four nozzles out of it.
  kit.box(
    hull,
    steel[0],
    [-0.52 * L, -B * 0.1, 0],
    [0.06 * L, B * 0.44, B * 0.94]
  );
  [-0.33, -0.11, 0.11, 0.33].forEach((z) =>
    kit.put(
      hull,
      kit.unit.drum(8),
      dark,
      [-0.56 * L, -B * 0.1, z * B],
      [B * 0.1, 0.05 * L, B * 0.1],
      [0, 0, Math.PI / 2]
    )
  );
  // Running lights: a handful still dimly on along the sides; the bridge's.
  for (let x = -0.3 * L; x < 0.4 * L; x += L * 0.14) {
    if (random() < 0.5) continue;
    const side = random() < 0.5 ? -1 : 1;
    lightPoint(kit, lights, dead, [x, B * 0.04, side * half * 0.98], B * 0.02);
  }
  lightPoint(kit, lights, amber, [-0.385 * L, B * 0.78, 0], B * 0.025);
}

// A freighter's parts and lights, placed in a layer.
function placed(kit, hull, lights, at, turn, shape) {
  const h = kit.parts();
  const l = kit.parts();
  freighter(kit, h, l, shape);
  hull.push(...kit.moved(h, at, [0.06, turn, 0.04]));
  lights.push(...kit.moved(l, at, [0.06, turn, 0.04]));
}

export function buildSalvageLanes(THREE, kit) {
  const { tone } = kit;
  const layer = (depth, follow, fill) => {
    const hull = kit.parts();
    const lights = kit.parts();
    fill(hull, lights);
    const object = new THREE.Group();
    object.add(kit.mesh(hull), kit.mesh(lights, 'glow'));
    return { object, anchor: under(depth), follow };
  };
  return {
    layers: [
      // The farthest freighter and, past it, the Ring: nearer than from
      // the wake, a broad arc.
      layer(3000, 0.75, (hull, lights) => {
        placed(kit, hull, lights, [-700, 0, -500], 0.4, {
          length: 2900,
          beam: 380,
        });
        const band = kit.parts();
        const bandLights = kit.parts();
        ringBand(kit, band, bandLights, {
          radius: 1700,
          count: 140,
          width: 120,
          thick: 28,
          gap: [2.0, 2.3],
          tones: [tone('#2a3038'), tone('#323a44'), tone('#272c33')],
          light: tone('#ffc27a', 1.2),
          lightEvery: 13,
        });
        hull.push(...kit.moved(band, [1300, 100, 600], [0.9, 0.5, 0.15]));
        lights.push(
          ...kit.moved(bandLights, [1300, 100, 600], [0.9, 0.5, 0.15])
        );
      }),
      layer(1800, 0.5, (hull, lights) =>
        placed(kit, hull, lights, [450, 0, -150], 0.36, {
          length: 2100,
          beam: 280,
          torn: [0.42, 0.6],
        })
      ),
      layer(1000, 0.3, (hull, lights) =>
        placed(kit, hull, lights, [-420, 0, 330], 0.44, {
          length: 1400,
          beam: 190,
        })
      ),
    ],
  };
}
