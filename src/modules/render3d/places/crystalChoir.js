// Crystal Choir (docs/ROTEIRO.md "Os lugares" 5): a seam in the Ring's
// structure. Its two walls step down in terraces to a crack lit from
// inside; giant crystals grow from the terraces and the floor toward the
// light above, glowing from within: each cluster a spray of shards from one
// foot (his picks on cenario-3 and -4, 21/11: colour B, fans of shards), a
// few small violet ones on the terraces. The crack itself runs jagged along
// the floor and up onto the terraces; it gapes when the Prism Crown goes dark.

import { createSeededRandom } from '../asteroidMesh.js';
import { gradientDisc } from './kit.js';
import { SEAM_LIGHT, crack, crystal, seams, under } from './pieces.js';

// proposta 12/11: the seam's half-width at the top, each terrace's step
// across and down, its floor's depth (local units).
const SEAM = { half: 360, step: 250, drop: 270, tiers: 3, floor: -1150 };
// A cluster's fan: `shards` round its tall crystals, which stand `grow` times
// what they did, their scatter from a draw of its own (`seed`) so the rest of
// the place keeps its layout; every other shard is detail, built only when
// the quality preset asks for it (PlaceSets.setDetail: not on low). The violet clusters: `count`,
// their crystals, size and scatter `seed`. A faint `glow` at each foot.
const FAN = { shards: 12, grow: 1.2, seed: 31 };
const VIOLET = { count: 8, crystals: 4, size: 170, seed: 77 };
const FOOT_GLOW = 0.16;

export function buildCrystalChoir(THREE, kit) {
  const { tone, random } = kit;
  const rock = kit.parts();
  const glow = kit.parts();
  const crystals = kit.parts();
  const later = [];
  const walls = [
    tone('#20252b'),
    tone('#262c33'),
    tone('#1b1f24'),
    tone('#2b3239'),
  ];
  const seamGlow = tone('#8fe4ff', 0.42);
  const ice = tone('#00b4f0', 0.55);
  const violet = tone('#7a4cff', 0.6);
  const footGlow = new Map([
    [ice, tone('#5fe2ff', FOOT_GLOW)],
    [violet, tone('#a07cff', FOOT_GLOW)],
  ]);
  const halo = gradientDisc(THREE, (r) => (1 - r) ** 2, {
    rings: 3,
    sides: 16,
  });

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
  // the floor standing up into it. Each is a fan of thin shards spread round
  // its lean, the longest in the middle, then its few tall crystals.
  const shard = createSeededRandom(FAN.seed);
  const put = (parts, length0, radius, at, turn, body) =>
    kit.put(parts, crystal(THREE, length0, radius, 6, 0.08), body, at, 1, turn);
  const fan = (foot, lean, scale, body) => {
    for (let i = 0; i < FAN.shards; i += 1) {
      const t = i / FAN.shards;
      const length0 =
        scale * (0.18 + shard() ** 1.5 * 0.55) * (1 - 0.35 * Math.abs(t - 0.5));
      const radius = length0 * (0.06 + shard() * 0.05);
      const spread = (t - 0.5) * 1.9 + (shard() - 0.5) * 0.35;
      const shape = [
        length0,
        radius,
        [
          foot[0] + (shard() - 0.5) * scale * 0.22,
          foot[1],
          foot[2] + (shard() - 0.5) * scale * 0.4,
        ],
        [
          (shard() - 0.5) * 1.1 + spread * 0.5,
          (shard() - 0.5) * 0.6,
          lean + spread,
        ],
        body,
      ];
      if (i % 2) later.push(shape);
      else put(crystals, ...shape);
    }
  };
  const cluster = (foot, lean, count, scale, body = ice, draw = random) => {
    kit.put(
      glow,
      halo,
      footGlow.get(body),
      [foot[0], foot[1] + 3, foot[2]],
      [scale * 0.42, 1, scale * 0.5]
    );
    fan(foot, lean, scale * FAN.grow, body);
    for (let i = 0; i < count; i += 1) {
      const length0 = scale * (0.45 + draw() * 0.75) * FAN.grow;
      const radius = length0 * (0.07 + draw() * 0.04);
      const geometry = crystal(THREE, length0, radius, 6, 0.08);
      const at = [
        foot[0] + (draw() - 0.5) * scale * 0.35,
        foot[1],
        foot[2] + (draw() - 0.5) * scale * 0.5,
      ];
      kit.put(crystals, geometry, body, at, 1, [
        (draw() - 0.5) * 0.6,
        (draw() - 0.5) * 0.5,
        lean + (draw() - 0.5) * 0.5,
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
  // The violet clusters, small, on the terraces (placed by their index).
  const lilac = createSeededRandom(VIOLET.seed);
  for (let i = 0; i < VIOLET.count; i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const k = i % SEAM.tiers;
    const inner = SEAM.half + (SEAM.tiers - 1 - k) * SEAM.step;
    const z = (((i * 0.618) % 1) - 0.5) * length * 0.8;
    cluster(
      [side * (inner + 90 + (i % 3) * 60), -k * SEAM.drop, z],
      side * 0.5,
      VIOLET.crystals,
      VIOLET.size,
      violet,
      lilac
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
    kit.mesh(crystals, 'gem'),
    kit.mesh(glow, 'glow'),
    cracks.object
  );
  object.rotation.set(0, 0.32, 0);
  return {
    layers: [{ object, anchor: under(1000), follow: 0.4 }],
    detail() {
      const fine = kit.parts();
      later.forEach((shape) => put(fine, ...shape));
      const mesh = kit.mesh(fine, 'gem');
      object.add(mesh);
      return [mesh];
    },
    update: cracks.give,
  };
}
