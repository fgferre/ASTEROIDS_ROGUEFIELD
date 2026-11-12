// Quarantine Grid (docs/ROTEIRO.md "Os lugares" 8): in the shadow of a dark
// planet. Its limb fills a corner of the view, near black, a thin crescent
// lit along its far edge; across it, at two depths, the quarantine lattice,
// its beacons pulsing amber at the nodes.

import { gradientDisc } from './kit.js';
import { lightPoint, under } from './pieces.js';

// proposta 12/11: the planet's radius and the depth of its top under the
// field; the lattices' spacing and depth; the beacons' pulse (seconds).
const PLANET = { radius: 2000, depth: 2300 };
const LATTICES = [
  { depth: 1000, spacing: 340, lines: [9, 7], follow: 0.3 },
  { depth: 1700, spacing: 520, lines: [9, 7], follow: 0.5 },
];
const PULSE = { period: 2.6, low: 0.45 };

function lattice(kit, beams, beacons, { spacing, lines: [nx, nz] }, level) {
  const { tone, random } = kit;
  const steel = tone('#2e2a26');
  const node = tone('#3a352f');
  const amber = tone('#ff9030', 1.5 - level * 0.4);
  const sx = ((nx - 1) * spacing) / 2;
  const sz = ((nz - 1) * spacing) / 2;
  for (let i = 0; i < nx; i += 1) {
    kit.box(beams, steel, [i * spacing - sx, 0, 0], [5, 5, sz * 2 + spacing]);
  }
  for (let j = 0; j < nz; j += 1) {
    kit.box(beams, steel, [0, -6, j * spacing - sz], [sx * 2 + spacing, 5, 5]);
  }
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < nz; j += 1) {
      const at = [i * spacing - sx, 0, j * spacing - sz];
      kit.box(beams, node, at, [26, 18, 26], [0, Math.PI / 4, 0]);
      kit.put(beams, kit.unit.drum(6), steel, [at[0], -40, at[2]], [5, 80, 5]);
      if ((i + j) % 2 === 0 && random() < 0.8) {
        lightPoint(kit, beacons, amber, [at[0], 12, at[2]], 4);
      }
    }
  }
}

export function buildQuarantineGrid(THREE, kit) {
  const { tone } = kit;
  const R = PLANET.radius;

  // The planet: a near-black night side with faint banding, a lighter
  // haze round its whole limb and the lit crescent along its far edge.
  const sphere = new THREE.SphereGeometry(1, 64, 36).toNonIndexed();
  const normal = sphere.getAttribute('normal');
  const shade = new Float32Array(normal.count * 3);
  const toward = new THREE.Vector3(0.62, -0.35, -0.7).normalize();
  const axis = new THREE.Vector3(0.3, 0.2, 0.93).normalize();
  const n = new THREE.Vector3();
  for (let i = 0; i < normal.count; i += 1) {
    n.fromBufferAttribute(normal, i);
    const lit = Math.max(0, n.dot(toward));
    const along = n.dot(axis);
    const band = 0.5 + 0.5 * Math.sin(along * 21 + 0.8 * Math.sin(along * 6));
    const rim = (1 - Math.max(0, n.y)) ** 4;
    const k =
      0.05 * (0.6 + 0.8 * band) +
      0.09 * rim +
      0.07 * lit ** 3 +
      0.45 * lit ** 6 * (1 - Math.abs(n.y)) ** 1.5;
    shade.set([k, k, k], i * 3);
  }
  sphere.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  sphere.userData.smooth = true;
  const planet = kit.parts();
  kit.put(planet, sphere, tone('#c89468'), [0, -R, 0], R);
  // The limb as the camera sees it: a circle raised toward it off the
  // equator (its radius `limb` × R): the crescent, and thin air all round.
  const limb = 0.95;
  const rise = R * Math.sqrt(1 - limb * limb);
  const crest = Math.atan2(-0.7, 0.62);
  const air = kit.parts();
  kit.put(
    air,
    gradientDisc(
      THREE,
      (r, a) => {
        const edge = Math.exp(-(((r - 0.99) / 0.008) ** 2));
        const lit = Math.max(0, Math.cos(a - crest)) ** 3;
        const haze = Math.exp(-(((r - 1.0) / 0.02) ** 2)) * 0.06;
        return edge * lit ** 2 + haze;
      },
      { rings: 12, sides: 120, hole: 0.94 }
    ),
    tone('#ffc080', 0.9),
    [0, -R + rise, 0],
    [R * limb * 1.04, 1, R * limb * 1.04]
  );

  // The disc draws after the space behind it (its stars and clouds, which
  // would ghost through it), still behind the lattices and the play.
  const body = kit.mesh(planet, 'lamp', 'planet');
  body.material.transparent = true;
  body.material.userData.blended = true;
  body.renderOrder = -7.5;
  const crescent = kit.mesh(air, 'glow');
  crescent.renderOrder = -7;
  const world = new THREE.Group();
  world.add(body, crescent);

  const layers = [
    { object: world, anchor: under(PLANET.depth, -600, 450), follow: 0.94 },
  ];
  LATTICES.forEach((spec, level) => {
    const beams = kit.parts();
    const beacons = kit.parts();
    lattice(kit, beams, beacons, spec, level);
    const object = new THREE.Group();
    object.add(kit.mesh(beams), kit.mesh(beacons, 'glow', 'beacons'));
    object.rotation.set(0, 0.2 + level * 0.12, 0);
    layers.push({ object, anchor: under(spec.depth), follow: spec.follow });
  });
  const beacons = kit.materials.get('beacons');
  return {
    layers,
    update(time) {
      const wave = 0.5 + 0.5 * Math.sin((time * Math.PI * 2) / PULSE.period);
      beacons.color.setScalar(PULSE.low + (1 - PULSE.low) * wave);
    },
  };
}
