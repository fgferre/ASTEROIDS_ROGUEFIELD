// src/modules/render3d/story/storyRocks.js
//
// The Field's edge in the story scene (storyScene.js): dark rocks adrift on
// the dust sea ahead of the Wake, round the signal. One instanced draw of a
// lumpy stone, laid out by a seeded draw.

import { createSeededRandom } from '../asteroidMesh.js';

// proposta 18/11: how many, where (a box ahead of the Wake, world units
// about it: x from..to, z half-width, y about the sea's top), how big.
export const FIELD_ROCKS = {
  count: 90,
  x: [9000, 40000],
  z: 14000,
  y: [-2100, 200],
  size: [50, 420],
  color: '#26222b',
};

/** The rocks: one InstancedMesh. */
export function buildFieldRocks(THREE) {
  const random = createSeededRandom(1811.7);
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    // A lump from three sines of the point: the same for shared corners.
    const lump =
      1 +
      0.22 * Math.sin(x * 3.1 + y * 1.7) * Math.cos(z * 2.3 - x) +
      0.1 * Math.sin(y * 5.3 + z * 4.1);
    p.setXYZ(i, x * lump, y * lump * 0.8, z * lump);
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(FIELD_ROCKS.color),
    roughness: 0.95,
    metalness: 0.05,
  });
  const { count, x, z, y, size } = FIELD_ROCKS;
  const rocks = new THREE.InstancedMesh(geometry, material, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const at = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    at.set(
      x[0] + (x[1] - x[0]) * random(),
      y[0] + (y[1] - y[0]) * random(),
      (random() * 2 - 1) * z
    );
    const r = size[0] + (size[1] - size[0]) * random() ** 2;
    s.set(r * (0.8 + 0.5 * random()), r * (0.7 + 0.4 * random()), r);
    q.setFromEuler(e.set(random() * 6.3, random() * 6.3, random() * 6.3));
    rocks.setMatrixAt(i, m.compose(at, q, s));
  }
  rocks.frustumCulled = false;
  return rocks;
}
