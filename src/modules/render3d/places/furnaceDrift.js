// Furnace Drift (docs/ROTEIRO.md "Os lugares" 4): inside the Ring, on the
// star's side. The star huge and close, its disc partly out of frame in its
// corona; the Ring's inner face a dark band across it, vents glowing along
// it; nearer, heat vents rising out of the dark. Hairline cracks of cold
// light run along the face: they open when the Kiln goes cold (the
// chapter's turn: the heat was holding them shut).

import { gradientDisc } from './kit.js';
import { SEAM_LIGHT, crack, seams, starGlow, under } from './pieces.js';

export function buildFurnaceDrift(THREE, kit) {
  const { tone, random } = kit;

  // The star: a limb-darkened disc and its corona, one glow.
  const star = kit.parts();
  kit.put(
    star,
    starGlow(THREE, {
      limb: 0.45,
      falloff: 6,
      tail: 0.05,
      rings: 30,
      sides: 72,
    }),
    tone('#ff9a50', 0.6),
    [0, 0, 0],
    4400
  );

  // The Ring's inner face: a long dark band of plates and ribs crossing in
  // front of the star, its vents in short grilles along it.
  const band = kit.parts();
  const vents = kit.parts();
  const plates = [tone('#120e0c'), tone('#16110e'), tone('#0f0c0a')];
  const rib = tone('#1c1511');
  const heat = tone('#ff7a28', 0.55);
  const seg = 260;
  for (let x = -4000; x < 4000; x += seg) {
    const n = Math.round(x / seg);
    kit.box(
      band,
      plates[Math.floor(random() * 3)],
      [x, 0, 0],
      [seg - 10, 50, 420]
    );
    if (n % 3 === 0) {
      kit.box(band, rib, [x - seg / 2, 50, 0], [40, 110, 520]);
      kit.box(band, rib, [x - seg / 2, -90, 0], [70, 140, 200]);
    }
    if (n % 3 === 1 && random() < 0.75) {
      for (let k = 0; k < 4; k += 1) {
        kit.box(vents, heat, [x - 54 + k * 36, 27, 0], [12, 3, 150]);
      }
    }
  }
  [-215, 215].forEach((z) => kit.box(band, rib, [0, 26, z], [8000, 60, 30]));
  // proposta 12/11: the cracks along the face, between its rails.
  const cracked = kit.parts();
  const gaping = kit.parts();
  const cold = tone(SEAM_LIGHT);
  for (let i = 0; i < 9; i += 1) {
    crack(
      kit,
      cracked,
      gaping,
      cold,
      [-2800 + i * 700 + (random() - 0.5) * 300, 27, (random() - 0.5) * 240],
      { length: 420 + random() * 380, width: 6, jag: 38 }
    );
  }
  const cracks = seams(kit, cracked, gaping, 'furnace-seams', {
    rest: 0.14,
    open: 1.6,
  });

  // Heat vents rising from below: dark stacks, their mouths a dull glow
  // behind a grille.
  const stacks = kit.parts();
  const mouths = kit.parts();
  const stack = [tone('#1a1411'), tone('#15100d')];
  [
    [-760, 0, 280, 80],
    [-900, -120, -300, 100],
    [820, -60, 420, 90],
    [980, -160, -220, 70],
  ].forEach(([x, y, z, r], i) => {
    kit.put(
      stacks,
      kit.unit.drum(8),
      stack[i % 2],
      [x, y - 400, z],
      [r, 800, r]
    );
    kit.put(
      stacks,
      kit.unit.drum(8),
      stack[(i + 1) % 2],
      [x, y - 10, z],
      [r * 1.3, 40, r * 1.3]
    );
    [-0.5, 0, 0.5].forEach((k) =>
      kit.box(stacks, stack[0], [x + k * r, y + 14, z], [r * 0.12, 10, r * 1.8])
    );
    kit.put(
      mouths,
      gradientDisc(THREE, (k) => (k < 0.7 ? 0.8 : 0.8 - (k - 0.7) * 2.6), {
        rings: 4,
        sides: 16,
      }),
      heat,
      [x, y + 6, z],
      r * 0.95
    );
  });

  const face = new THREE.Group();
  face.add(kit.mesh(band), kit.mesh(vents, 'glow'), cracks.object);
  face.rotation.set(0, -0.32, 0.04);
  const near = new THREE.Group();
  near.add(kit.mesh(stacks), kit.mesh(mouths, 'glow'));
  return {
    layers: [
      {
        object: kit.mesh(star, 'glow'),
        anchor: under(4200, 2150, 1000),
        follow: 0.97,
      },
      { object: face, anchor: under(2400, 0, -300), follow: 0.7 },
      { object: near, anchor: under(1100), follow: 0.35 },
    ],
    update: cracks.give,
  };
}
