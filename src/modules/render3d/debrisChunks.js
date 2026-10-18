// Rock debris as real chunks: a few low-poly irregular rocks (the asteroid
// generator at the lowest detail), one InstancedMesh per variant, lit by the
// scene lights like the asteroids (docs/NORTE.md §2: matte mass). Each
// EffectsSystem 'debris' particle becomes one instance that tumbles on its
// own axis and shrinks away at the end of its life. Nothing is allocated
// per frame.

import { createAsteroidGeometry } from './asteroidMesh.js';
import { HALF_H, HALF_W } from './batches.js';

// proposta 17/10: pool, shape and motion of the chunks.
const VARIANTS = 4;
export const DEBRIS_CAPACITY = 160;
const PER_VARIANT = DEBRIS_CAPACITY / VARIANTS;
const CHUNK_RADIUS = 1.3; // × particle size
const CHUNK_HEIGHT = 2;
const SHRINK_FROM = 0.3; // last 30 % of life
const SPIN_RATE = 3.5; // × the particle's rotationSpeed (rad/s)
const MIN_SPIN = 4; // rad/s, so slow particles still tumble

// Deterministic [0, 1) from a float (no Math.random in the render loop).
function hash01(v) {
  const s = Math.sin(v * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export class DebrisChunks {
  constructor(THREE, scene) {
    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.05,
      flatShading: true,
    });
    this.meshes = [];
    this.counts = new Int32Array(VARIANTS);
    const white = new THREE.Color(1, 1, 1);
    for (let v = 0; v < VARIANTS; v += 1) {
      const geometry = createAsteroidGeometry(THREE, 31 + v * 17, {
        detail: 0,
      });
      const mesh = new THREE.InstancedMesh(
        geometry,
        this.material,
        PER_VARIANT
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // instanceColor exists from the first compile (it is created lazily)
      for (let i = 0; i < PER_VARIANT; i += 1) mesh.setColorAt(i, white);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.visible = false;
      // instances spread over the field; the mesh's own bounds mean nothing
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.meshes.push(mesh);
    }
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.axis = new THREE.Vector3();
    this.color = new THREE.Color();
  }

  begin() {
    this.counts.fill(0);
  }

  /** One debris particle `p` (EffectsSystem fields) in linear `rgb`. */
  push(p, rgb) {
    const seed = p.rotationSpeed || p.maxLife || 1;
    let v = Math.floor(hash01(seed) * VARIANTS);
    for (let tries = 0; this.counts[v] >= PER_VARIANT; tries += 1) {
      if (tries === VARIANTS - 1) return;
      v = (v + 1) % VARIANTS;
    }
    const lifeFrac = p.maxLife > 0 ? Math.max(0, p.life / p.maxLife) : 1;
    const shrink = Math.min(1, lifeFrac / SHRINK_FROM);
    const r = p.size * CHUNK_RADIUS * shrink;
    if (r <= 0.05) return;

    const age = Math.max(0, (p.maxLife || 0) - (p.life || 0));
    const rate = (p.rotationSpeed || 0) * SPIN_RATE;
    const spin =
      (p.rotation || 0) +
      age *
        (Math.abs(rate) < MIN_SPIN ? MIN_SPIN * Math.sign(rate || 1) : rate);
    this.axis
      .set(
        hash01(seed + 1) - 0.5,
        hash01(seed + 2) - 0.5,
        hash01(seed + 3) - 0.5
      )
      .normalize();
    if (!(this.axis.lengthSq() > 0)) this.axis.set(0, 1, 0);
    this.quaternion.setFromAxisAngle(this.axis, spin);
    this.position.set(p.x - HALF_W, CHUNK_HEIGHT + r, p.y - HALF_H);
    // flattened a little, like chips off a surface
    this.scale.set(r, r * (0.6 + 0.3 * hash01(seed + 4)), r);
    this.matrix.compose(this.position, this.quaternion, this.scale);

    const mesh = this.meshes[v];
    const i = this.counts[v];
    mesh.setMatrixAt(i, this.matrix);
    mesh.setColorAt(i, this.color.setRGB(rgb[0], rgb[1], rgb[2]));
    this.counts[v] = i + 1;
  }

  end() {
    for (let v = 0; v < VARIANTS; v += 1) {
      const mesh = this.meshes[v];
      const count = this.counts[v];
      mesh.count = count;
      mesh.visible = count > 0;
      if (!count) continue;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Live instances (all variants). */
  get count() {
    let total = 0;
    for (let v = 0; v < VARIANTS; v += 1) total += this.counts[v];
    return total;
  }
}
