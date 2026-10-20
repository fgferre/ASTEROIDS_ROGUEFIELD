// The weapons' matter (docs/NORTE.md §2: mass is matte, light only where the
// energy is): the Shard Halo's blades and the seeker missiles' casings, one
// InstancedMesh each, lit by the scene like the hulls. Their light (edges,
// exhaust, trails) is drawn by weaponMirror.js into the shared batches.
// Nothing is allocated per frame.

import { PALETTE } from '../../data/constants/palette.js';
import { HALF_H, HALF_W } from './batches.js';

// proposta 20/10: bodies of each kind at once, and their metal.
export const WEAPON_BODY_CAPACITY = 48;
const BLADE_METAL = { roughness: 0.45, metalness: 0.7 };
const CASING_METAL = { roughness: 0.65, metalness: 0.45 };

// A shard: a flat diamond, long along +x (its travel), thin in y.
function bladeGeometry(THREE) {
  const geometry = new THREE.OctahedronGeometry(1, 0);
  geometry.scale(1, 0.28, 0.5);
  return geometry;
}

// A casing: a turned body with a tapered nose at +x and a flat tail, x in
// [−1, 1] (the lathe turns round y, then lies along x).
function casingGeometry(THREE) {
  const profile = [
    [0, -1],
    [0.32, -1],
    [0.36, -0.75],
    [0.36, 0.35],
    [0.24, 0.75],
    [0, 1],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const geometry = new THREE.LatheGeometry(profile, 8);
  geometry.rotateZ(-Math.PI / 2);
  return geometry;
}

export class WeaponBodies {
  constructor(THREE, scene) {
    const mesh = (geometry, metal) => {
      const instanced = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: PALETTE.hullLit,
          flatShading: true,
          ...metal,
        }),
        WEAPON_BODY_CAPACITY
      );
      instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instanced.frustumCulled = false;
      instanced.receiveShadow = true;
      instanced.count = 0;
      scene.add(instanced);
      return instanced;
    };
    this.blades = mesh(bladeGeometry(THREE), BLADE_METAL);
    this.casings = mesh(casingGeometry(THREE), CASING_METAL);
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
  }

  begin() {
    this.blades.count = 0;
    this.casings.count = 0;
  }

  // One body at logical (x, y), `h` up, pointing along `angle`; half its
  // length and width in world units.
  push(mesh, x, y, h, angle, length, width) {
    if (mesh.count >= WEAPON_BODY_CAPACITY) return;
    this.position.set(x - HALF_W, h, y - HALF_H);
    this.quaternion.setFromAxisAngle(this.up, -angle);
    this.scale.set(length, width, width);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    mesh.setMatrixAt(mesh.count, this.matrix);
    mesh.count += 1;
  }

  blade(x, y, h, angle, length, width) {
    this.push(this.blades, x, y, h, angle, length, width);
  }

  casing(x, y, h, angle, length, width) {
    this.push(this.casings, x, y, h, angle, length, width);
  }

  end() {
    this.blades.instanceMatrix.needsUpdate = true;
    this.casings.instanceMatrix.needsUpdate = true;
  }
}
