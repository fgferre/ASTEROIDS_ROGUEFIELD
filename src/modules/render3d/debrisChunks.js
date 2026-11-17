// Debris as real chunks: a few low-poly irregular rocks (the asteroid
// generator at the lowest detail) and, for a machine that breaks up, a few
// torn hull plates (thin, angular, with a metal glint); one InstancedMesh per
// variant, lit by the scene lights (docs/NORTE.md §2: matte mass). Each
// EffectsSystem 'debris' particle becomes one instance that tumbles on its
// own axis and shrinks away at the end of its life. The simulation throws
// them flat across the field; each also climbs or sinks at its own slope as
// it flies, so a burst opens into a ball of chunks seen from the side or
// from below. Nothing is allocated per frame.

import { createAsteroidGeometry } from './asteroidMesh.js';
import { HALF_H, HALF_W } from './batches.js';
import { SHINE } from './hullModel.js';

// proposta 17/10: pool, shape and motion of the chunks.
const VARIANTS = 4;
export const DEBRIS_CAPACITY = 160;
const PER_VARIANT = DEBRIS_CAPACITY / VARIANTS;
// proposta 17/11 (efeito/impacto): hull plates for machines.
const PLATE_VARIANTS = 3;
const PER_PLATE = 32;
const PLATE_RADIUS = 1.5; // × particle size
const PLATE_THICKNESS = 0.18; // × the plate's radius
const PLATE_SHINE = { metalness: 0.5, roughness: 0.34, envMapIntensity: 1.3 };
const PLATE_GREY = [0.32, 0.33, 0.36];
const PLATE_PAINTED = 0.35; // share of plates that keep the machine's paint
const CHUNK_RADIUS = 1.3; // × particle size
const CHUNK_HEIGHT = 2;
const SHRINK_FROM = 0.3; // last 30 % of life
const SPIN_RATE = 3.5; // × the particle's rotationSpeed (rad/s)
const MIN_SPIN = 4; // rad/s, so slow particles still tumble
// Steepest climb: the sine of the largest angle off the plane (~49°); slopes
// spread evenly in sine, so a burst fills a ball rather than a cone.
const LIFT_SINE = 0.75;

// Deterministic [0, 1) from a float (no Math.random in the render loop).
function hash01(v) {
  const s = Math.sin(v * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// A torn plate: an irregular five-sided slab, centred, radius ~1.
function plateGeometry(THREE, seed) {
  const shape = new THREE.Shape();
  for (let k = 0; k < 5; k += 1) {
    const a = ((k + (hash01(seed + k) - 0.5) * 0.6) / 5) * Math.PI * 2;
    const r = 0.55 + 0.45 * hash01(seed + 10 + k);
    if (k === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: PLATE_THICKNESS,
    bevelEnabled: false,
  });
  geometry.center();
  return geometry;
}

export class DebrisChunks {
  constructor(THREE, scene) {
    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      ...SHINE.rock,
      flatShading: true,
    });
    this.meshes = [];
    this.counts = new Int32Array(VARIANTS);
    // quality preset: live chunks at most (≤ DEBRIS_CAPACITY)
    this.limit = DEBRIS_CAPACITY;
    this.total = 0;
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
    this.plateMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      ...PLATE_SHINE,
      flatShading: true,
    });
    this.plates = [];
    this.plateCounts = new Int32Array(PLATE_VARIANTS);
    for (let v = 0; v < PLATE_VARIANTS; v += 1) {
      const mesh = new THREE.InstancedMesh(
        plateGeometry(THREE, 7 + v * 13),
        this.plateMaterial,
        PER_PLATE
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < PER_PLATE; i += 1) mesh.setColorAt(i, white);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.plates.push(mesh);
    }
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.axis = new THREE.Vector3();
    this.color = new THREE.Color();
    // particle (pooled, so reused across lives) → { life, age, height, seed }
    this.lifts = new WeakMap();
    // counts lives, to seed a slope for particles that carry no seed of their
    // own (never Math.random: the simulation may own its stream)
    this.lives = 0;
  }

  /**
   * How far particle `p` has climbed (+) or sunk (−) off the plane: its
   * planar speed × its slope, summed over its own clock (its age), so it
   * holds still while the simulation is paused or slowed. Without a `seed`
   * each life gets its own.
   */
  lift(p, seed, age) {
    let state = this.lifts.get(p);
    if (!state) {
      state = { life: 0, age: 0, height: 0 };
      this.lifts.set(p, state);
    }
    if (p.maxLife !== state.life || age < state.age) {
      // a new life
      state.life = p.maxLife;
      state.age = 0;
      state.height = 0;
      this.lives += 1;
      state.seed = this.lives * 0.618034;
    }
    const sine = (hash01((seed ?? state.seed) + 5) * 2 - 1) * LIFT_SINE;
    const slope = sine / Math.sqrt(1 - sine * sine);
    state.height +=
      Math.hypot(p.vx || 0, p.vy || 0) * slope * (age - state.age);
    state.age = age;
    return state.height;
  }

  begin() {
    this.counts.fill(0);
    this.plateCounts.fill(0);
    this.total = 0;
  }

  /** One debris particle `p` (EffectsSystem fields) in linear `rgb`. */
  push(p, rgb) {
    if (this.total >= this.limit) return;
    const seed = p.rotationSpeed || p.maxLife || 1;
    const metal = p.material === 'metal';
    const kinds = metal ? PLATE_VARIANTS : VARIANTS;
    const cap = metal ? PER_PLATE : PER_VARIANT;
    const counts = metal ? this.plateCounts : this.counts;
    let v = Math.floor(hash01(seed) * kinds);
    for (let tries = 0; counts[v] >= cap; tries += 1) {
      if (tries === kinds - 1) return;
      v = (v + 1) % kinds;
    }
    const lifeFrac = p.maxLife > 0 ? Math.max(0, p.life / p.maxLife) : 1;
    const shrink = Math.min(1, lifeFrac / SHRINK_FROM);
    const r = p.size * (metal ? PLATE_RADIUS : CHUNK_RADIUS) * shrink;
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
    const height = this.lift(p, seed, age);
    this.position.set(p.x - HALF_W, CHUNK_HEIGHT + r + height, p.y - HALF_H);
    // a rock chip flattened a little, like a chip off a surface; a plate is
    // already thin
    if (metal) this.scale.set(r, r, r);
    else this.scale.set(r, r * (0.6 + 0.3 * hash01(seed + 4)), r);
    this.matrix.compose(this.position, this.quaternion, this.scale);

    const mesh = metal ? this.plates[v] : this.meshes[v];
    const i = counts[v];
    mesh.setMatrixAt(i, this.matrix);
    if (metal && hash01(seed + 6) >= PLATE_PAINTED) {
      const k = 0.8 + 0.4 * hash01(seed + 7);
      this.color.setRGB(
        PLATE_GREY[0] * k,
        PLATE_GREY[1] * k,
        PLATE_GREY[2] * k
      );
    } else this.color.setRGB(rgb[0], rgb[1], rgb[2]);
    mesh.setColorAt(i, this.color);
    counts[v] = i + 1;
    this.total += 1;
  }

  end() {
    const close = (mesh, count) => {
      mesh.count = count;
      mesh.visible = count > 0;
      if (!count) return;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    };
    for (let v = 0; v < VARIANTS; v += 1) close(this.meshes[v], this.counts[v]);
    for (let v = 0; v < PLATE_VARIANTS; v += 1) {
      close(this.plates[v], this.plateCounts[v]);
    }
  }

  /** Live instances (all variants). */
  get count() {
    return this.total;
  }
}
