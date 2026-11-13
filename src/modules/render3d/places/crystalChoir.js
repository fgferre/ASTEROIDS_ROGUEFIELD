// Crystal Choir (docs/ROTEIRO.md "Os lugares" 5): a seam in the Ring's
// structure. Its two walls step down in terraces to a crack lit from
// inside; giant crystals grow from the terraces and the floor toward the
// light above, glowing from within. The crack itself runs jagged along the
// floor and up onto the terraces; it gapes when the Prism Crown goes dark.

import { gradientDisc } from './kit.js';
import { SEAM_LIGHT, crack, crystal, seams, under } from './pieces.js';

// proposta 12/11: the seam's half-width at the top, each terrace's step
// across and down, its floor's depth (local units).
const SEAM = { half: 360, step: 250, drop: 270, tiers: 3, floor: -1150 };

export function buildCrystalChoir(THREE, kit) {
  const { tone, random } = kit;
  const rock = kit.parts();
  const glow = kit.parts();
  const crystals = kit.parts();
  const walls = [
    tone('#20252b'),
    tone('#262c33'),
    tone('#1b1f24'),
    tone('#2b3239'),
  ];
  const seamGlow = tone('#8fe4ff', 0.42);
  const ice = tone('#9fe6f6', 0.32);

  // The walls, terrace by terrace, broken into blocks along the seam.
  const length = 3600;
  const block = 320;
  [-1, 1].forEach((side) => {
    for (let k = 0; k < SEAM.tiers; k += 1) {
      const inner = SEAM.half + (SEAM.tiers - 1 - k) * SEAM.step;
      const top = -k * SEAM.drop;
      for (let z = -length / 2; z < length / 2; z += block) {
        const jut = (random() - 0.3) * 90;
        const edge = inner - jut;
        const outer = 2300;
        const height = 220 + random() * 60;
        kit.box(
          rock,
          walls[Math.floor(random() * walls.length)],
          [
            (side * (edge + outer)) / 2,
            top - height / 2 + random() * 20,
            z + block / 2,
          ],
          [outer - edge, height, block - 18]
        );
      }
    }
  });
  // The seam's floor.
  kit.box(
    rock,
    walls[2],
    [0, SEAM.floor - 40, 0],
    [SEAM.half * 2 + 200, 80, length]
  );
  // The light in the crack: soft, wide, no hard line (a thin bright line
  // would read as a beam).
  kit.put(
    glow,
    gradientDisc(THREE, (r) => (1 - r) ** 1.6, { rings: 8, sides: 40 }),
    seamGlow,
    [0, SEAM.floor + 2, 0],
    [240, 1, length * 0.55]
  );

  // Crystal clusters: on the terrace edges leaning across the seam, and on
  // the floor standing up into it.
  const cluster = (foot, lean, count, scale) => {
    for (let i = 0; i < count; i += 1) {
      const length0 = scale * (0.45 + random() * 0.75);
      const radius = length0 * (0.07 + random() * 0.04);
      const geometry = crystal(THREE, length0, radius, 6, 0.08);
      const at = [
        foot[0] + (random() - 0.5) * scale * 0.35,
        foot[1],
        foot[2] + (random() - 0.5) * scale * 0.5,
      ];
      kit.put(crystals, geometry, ice, at, 1, [
        (random() - 0.5) * 0.6,
        (random() - 0.5) * 0.5,
        lean + (random() - 0.5) * 0.5,
      ]);
    }
  };
  for (let i = 0; i < 12; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const k = Math.floor(random() * SEAM.tiers);
    const inner = SEAM.half + (SEAM.tiers - 1 - k) * SEAM.step;
    const z = (random() - 0.5) * length * 0.85;
    cluster(
      [side * (inner + 30), -k * SEAM.drop, z],
      side * 0.95,
      4 + Math.floor(random() * 3),
      420
    );
  }
  for (let i = 0; i < 5; i += 1) {
    const z = (i / 4 - 0.5) * length * 0.8 + (random() - 0.5) * 200;
    cluster(
      [(random() - 0.5) * 300, SEAM.floor, z],
      (random() - 0.5) * 0.9,
      5,
      760
    );
  }

  // proposta 12/11: the crack along the floor, and smaller ones that have
  // climbed onto the terraces. Built along x, then turned along the seam.
  const cracked = kit.parts();
  const gaping = kit.parts();
  const cold = tone(SEAM_LIGHT);
  crack(kit, cracked, gaping, cold, [0, SEAM.floor + 6, 0], {
    length: length * 0.8,
    width: 13,
    jag: 90,
    steps: 26,
    branches: 7,
  });
  for (let i = 0; i < 8; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const k = 1 + (i % 2);
    const inner = SEAM.half + (SEAM.tiers - 1 - k) * SEAM.step;
    crack(
      kit,
      cracked,
      gaping,
      cold,
      [
        (i / 7 - 0.5) * length * 0.75,
        -k * SEAM.drop + 8,
        side * (inner + 140 + random() * 160),
      ],
      { length: 380 + random() * 300, width: 6, jag: 46 }
    );
  }
  const cracks = seams(kit, cracked, gaping, 'choir-seams', {
    rest: 0.16,
    open: 1.15,
  });
  cracks.object.rotation.y = Math.PI / 2;

  const object = new THREE.Group();
  object.add(
    kit.mesh(rock),
    kit.mesh(crystals, 'lamp'),
    kit.mesh(glow, 'glow'),
    cracks.object
  );
  object.rotation.set(0, 0.32, 0);
  return {
    layers: [{ object, anchor: under(1000), follow: 0.4 }],
    update: cracks.give,
  };
}
