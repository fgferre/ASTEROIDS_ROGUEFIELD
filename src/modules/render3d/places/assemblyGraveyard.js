// Assembly Graveyard (docs/ROTEIRO.md "Os lugares" 7): the shipyards.
// Skeletons of giant ships never finished — a keel, its frames, a few
// stringers, the bow half plated — held in gantries with their cranes, the
// work lights still on here and there.

import { lightPoint, under } from './pieces.js';

// One skeleton along x, `length` long and `beam` across: frames at
// `frames` stations (the hull's half-width tapering to a point at the bow,
// blunt at the stern), stringers, the bow `plated` share plated on one
// side, gantries at `gantries` (shares of the length).
function skeleton(
  kit,
  frame,
  lights,
  { length: L, beam: B, frames = 18, plated = 0.3, gantries }
) {
  const { tone, random } = kit;
  const steel = [tone('#5a5d54'), tone('#64675c'), tone('#50534b')];
  const plate = tone('#44473f');
  const dark = tone('#3a3c37');
  const work = tone('#ffb860', 1.5);
  const half = (s) =>
    (B / 2) * Math.min(1, 1.6 * Math.sin(Math.PI * (0.08 + 0.9 * s)) ** 0.7);
  const depth = (s) =>
    B * 0.55 * (0.55 + 0.45 * Math.sin(Math.PI * (0.05 + 0.9 * s)));
  const xOf = (s) => (s - 0.5) * L;
  // The keel, end to end.
  kit.box(frame, dark, [0, -B * 0.55, 0], [L * 0.96, B * 0.14, B * 0.17]);
  kit.box(frame, steel[1], [0, -B * 0.47, 0], [L * 0.9, B * 0.04, B * 0.26]);
  const hoop = 9;
  for (let f = 0; f < frames; f += 1) {
    const s = (f + 0.5) / frames;
    const x = xOf(s);
    const w = half(s);
    const h = depth(s);
    // A U-frame from one deck edge down round the keel to the other.
    for (let k = 0; k < hoop; k += 1) {
      const p0 = Math.PI * (1 + k / hoop);
      const p1 = Math.PI * (1 + (k + 1) / hoop);
      const z0 = Math.cos(p0) * w;
      const y0 = Math.sin(p0) * h;
      const z1 = Math.cos(p1) * w;
      const y1 = Math.sin(p1) * h;
      const len = Math.hypot(z1 - z0, y1 - y0);
      const tilt = Math.atan2(-(y1 - y0), z1 - z0);
      kit.box(
        frame,
        steel[f % 3],
        [x, (y0 + y1) / 2, (z0 + z1) / 2],
        [B * 0.075, B * 0.09, len * 1.04],
        [tilt, 0, 0]
      );
      // The bow plated on its near side, and a run of plating along the
      // bilge amidships, both sides.
      const bow = s > 1 - plated && z0 < 0;
      const bilge = s > 0.3 && s < 0.62 && k >= 2 && k <= 6;
      if ((bow || bilge) && random() < 0.85) {
        kit.box(
          frame,
          plate,
          [
            x + L / frames / 2,
            (y0 + y1) / 2 - Math.sign(y0 + y1) * 4,
            (z0 + z1) / 2 - 6,
          ],
          [(L / frames) * 0.98, B * 0.025, len],
          [tilt, 0, 0]
        );
      }
    }
  }
  // Stringers along the deck edges and the bilge, station to station.
  [
    [1, 0],
    [-1, 0],
    [1, -0.7],
    [-1, -0.7],
  ].forEach(([side, k]) => {
    for (let f = 0; f < frames - 1; f += 1) {
      const sa = (f + 0.5) / frames;
      const sb = (f + 1.5) / frames;
      const za = side * half(sa) * (k ? 0.72 : 1);
      const zb = side * half(sb) * (k ? 0.72 : 1);
      const ya = k * depth(sa);
      const yb = k * depth(sb);
      const dx = xOf(sb) - xOf(sa);
      kit.box(
        frame,
        steel[1],
        [(xOf(sa) + xOf(sb)) / 2, (ya + yb) / 2, (za + zb) / 2],
        [Math.hypot(dx, zb - za), B * 0.055, B * 0.055],
        [0, Math.atan2(-(zb - za), dx), 0]
      );
    }
  });
  // Gantries: two towers either side, a bridge across, a crane boom out.
  gantries.forEach((s, g) => {
    const x = xOf(s);
    const reach = half(s) + B * 0.3;
    [-1, 1].forEach((side) => {
      kit.box(
        frame,
        steel[2],
        [x, -B * 0.15, side * reach],
        [B * 0.13, B * 1.3, B * 0.13]
      );
      kit.box(
        frame,
        steel[0],
        [x, -B * 0.15, side * reach],
        [B * 0.3, B * 0.05, B * 0.05],
        [0, 0, 0.9]
      );
      // Arms from the tower holding the hull at its deck edge.
      const span = reach - half(s);
      kit.box(
        frame,
        steel[1],
        [x, 0, side * (reach - span / 2)],
        [B * 0.07, B * 0.07, span]
      );
      kit.box(
        frame,
        steel[1],
        [x, -B * 0.4, side * (reach - span * 0.6)],
        [B * 0.06, B * 0.06, span * 1.2]
      );
      lightPoint(kit, lights, work, [x, B * 0.52, side * reach], B * 0.02);
    });
    kit.box(
      frame,
      steel[0],
      [x, B * 0.5, 0],
      [B * 0.12, B * 0.1, reach * 2 + B * 0.1]
    );
    const boom = B * (0.9 + random() * 0.5);
    const side = g % 2 === 0 ? 1 : -1;
    kit.box(
      frame,
      steel[1],
      [x + boom * 0.3, B * 0.56, side * reach * 0.6],
      [boom, B * 0.07, B * 0.07],
      [0, side * 0.5, 0]
    );
  });
}

export function buildAssemblyGraveyard(THREE, kit) {
  const frame = kit.parts();
  const lights = kit.parts();
  [
    {
      at: [-260, 250, 220],
      turn: 0.38,
      length: 1500,
      beam: 340,
      gantries: [0.2, 0.45, 0.7],
    },
    {
      at: [620, -1700, -1250],
      turn: -0.22,
      length: 2600,
      beam: 560,
      frames: 22,
      plated: 0.45,
      gantries: [0.3, 0.6],
    },
  ].forEach(({ at, turn, ...shape }) => {
    const f = kit.parts();
    const l = kit.parts();
    skeleton(kit, f, l, shape);
    frame.push(...kit.moved(f, at, [0.1, turn, 0.04]));
    lights.push(...kit.moved(l, at, [0.1, turn, 0.04]));
  });
  // Loose plates stacked and floating about the yard.
  const { tone, random } = kit;
  for (let i = 0; i < 16; i += 1) {
    kit.box(
      frame,
      tone(i % 2 ? '#2e302d' : '#252725'),
      [(random() - 0.5) * 2600, -200 - random() * 900, (random() - 0.5) * 1800],
      [80 + random() * 120, 6, 40 + random() * 60],
      [random() * 0.6, random() * 6, random() * 0.6]
    );
  }
  const object = new THREE.Group();
  object.add(kit.mesh(frame), kit.mesh(lights, 'glow'));
  return { layers: [{ object, anchor: under(1300), follow: 0.45 }] };
}
