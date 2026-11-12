// Salvage Lanes (docs/ROTEIRO.md "Os lugares" 2): the cargo route, a
// graveyard of freighters. Three enormous dead hulks lie in file at three
// depths, racks of containers along their spines, a few running lights
// still dimly on; past them the Ring, larger than from the wake.

import { lightPoint, ringBand, under } from './pieces.js';

// One dead freighter along x, `length` long and `beam` across: spine,
// container racks (some gone), a stern block with its bridge tower and
// engines, a blunt bow; `breakAt` (share of the length) snaps the spine
// there, the bow half turned off its line.
function hulk(kit, hull, lights, { length: L, beam: B, breakAt = null }) {
  const { tone, random } = kit;
  const tones = [
    tone('#2a2622'),
    tone('#22262a'),
    tone('#3a2620'),
    tone('#1c1e21'),
    tone('#26303a'),
    tone('#3a3424'),
  ];
  const dark = tone('#17191c');
  const dead = tone('#8fe0d0', 0.6);
  const amber = tone('#ffb460', 1);
  const parts = { hull, lights };
  // The bow half's turn and drift when the spine is snapped.
  const bend = (x) => (breakAt !== null && x > (breakAt - 0.5) * L ? 1 : 0);
  const place = (x, y, z) => {
    if (!bend(x)) return [x, y, z];
    const pivot = (breakAt - 0.5) * L;
    const a = 0.18;
    const dx = x - pivot + B * 0.35;
    return [
      pivot + dx * Math.cos(a) - z * Math.sin(a),
      y - dx * 0.06,
      dx * Math.sin(a) + z * Math.cos(a) + B * 0.25,
    ];
  };
  const turnOf = (x) => [0, bend(x) ? -0.18 : 0, bend(x) ? 0.06 : 0];
  const box = (kind, color, x, y, z, size) =>
    kit.box(parts[kind], color, place(x, y, z), size, turnOf(x));

  // The spine, in two pieces where it snapped.
  const step = L / 24;
  for (let i = 0; i < 24; i += 1) {
    const x = (i + 0.5) * step - L / 2;
    if (breakAt !== null && Math.abs(x / L + 0.5 - breakAt) < 0.03) continue;
    box('hull', dark, x, 0, 0, [step * 1.01, B * 0.2, B * 0.22]);
    // Ribs under the spine, every other station.
    if (i % 2 === 0)
      box('hull', tones[3], x, -B * 0.12, 0, [B * 0.05, B * 0.14, B * 0.7]);
  }
  // Container racks both sides, stacked one to three high, some missing.
  const c = B * 0.42;
  for (let x = -0.36 * L; x < 0.3 * L; x += c) {
    if (breakAt !== null && Math.abs(x / L + 0.5 - breakAt) < 0.05) continue;
    [-1, 1].forEach((side) => {
      if (random() < 0.16) return;
      const high = 1 + Math.floor(random() * 3);
      const color = tones[Math.floor(random() * tones.length)];
      box('hull', color, x, -B * 0.06 + high * B * 0.07, side * B * 0.24, [
        c * 0.9,
        high * B * 0.14,
        B * 0.42,
      ]);
    });
  }
  // The bow: a blunt wedge.
  box('hull', tones[1], 0.4 * L, 0, 0, [B * 0.5, B * 0.34, B * 0.86]);
  kit.box(
    hull,
    tones[1],
    place(0.45 * L, 0, 0),
    [B * 0.5, B * 0.3, B * 0.5],
    [0, Math.PI / 4 + turnOf(0.45 * L)[1], turnOf(0.45 * L)[2]]
  );
  // The stern: block, bridge tower, mast and three engine drums.
  box('hull', tones[0], -0.43 * L, B * 0.02, 0, [B * 0.8, B * 0.5, B * 1.0]);
  box('hull', tones[3], -0.41 * L, B * 0.42, 0, [B * 0.36, B * 0.5, B * 0.7]);
  box('hull', tones[1], -0.4 * L, B * 0.72, 0, [B * 0.22, B * 0.16, B * 0.9]);
  box('hull', dark, -0.42 * L, B * 0.95, 0, [B * 0.04, B * 0.5, B * 0.04]);
  [-0.28, 0, 0.28].forEach((z) =>
    kit.put(
      hull,
      kit.unit.drum(8),
      dark,
      [-0.5 * L - B * 0.12, 0, z * B],
      [B * 0.13, B * 0.36, B * 0.13],
      [0, 0, Math.PI / 2]
    )
  );
  // Running lights: most dead, a few still dimly on; one at the bridge.
  for (let x = -0.4 * L; x < 0.42 * L; x += L * 0.07) {
    [-1, 1].forEach((side) => {
      if (random() < 0.62) return;
      lightPoint(
        kit,
        lights,
        dead,
        place(x, B * 0.12, side * B * 0.47),
        B * 0.022
      );
    });
  }
  lightPoint(kit, lights, amber, place(-0.4 * L, B * 0.82, B * 0.44), B * 0.03);
}

export function buildSalvageLanes(THREE, kit) {
  const { tone } = kit;
  // Three hulks in file along the lane, each deeper and larger.
  const hull = kit.parts();
  const lights = kit.parts();
  [
    { at: [-420, 0, 260], turn: 0.42, length: 1350, beam: 170 },
    {
      at: [380, -850, -400],
      turn: 0.36,
      length: 2000,
      beam: 250,
      breakAt: 0.58,
    },
    { at: [-500, -2200, -1500], turn: 0.4, length: 2900, beam: 360 },
  ].forEach(({ at, turn, ...shape }) => {
    const h = kit.parts();
    const l = kit.parts();
    hulk(kit, h, l, shape);
    hull.push(...kit.moved(h, at, [0.08, turn, 0.05]));
    lights.push(...kit.moved(l, at, [0.08, turn, 0.05]));
  });
  const lane = new THREE.Group();
  lane.add(kit.mesh(hull), kit.mesh(lights, 'glow'));
  const layers = [{ object: lane, anchor: under(900), follow: 0.4 }];

  // The Ring, nearer than from the wake: a broad arc past the hulks.
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
  const ring = new THREE.Group();
  ring.add(kit.mesh(band), kit.mesh(bandLights, 'glow'));
  ring.rotation.set(0.9, 0.5, 0.15, 'YXZ');
  layers.unshift({
    object: ring,
    anchor: under(2900, 1300, -300),
    follow: 0.85,
  });
  return { layers };
}
