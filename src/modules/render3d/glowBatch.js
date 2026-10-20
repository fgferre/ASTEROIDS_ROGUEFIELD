// Every machine eye, lens and glowing node in one draw (PLAN.md R8.2): an
// unlit low-poly sphere instanced per glow, its pose from the glow's anchor
// and its colour (accent × gain, above 1 to bloom) per instance. Repacked
// every frame; no glow this frame: hidden, no draw. The file also holds the
// generic InstanceBatch the field's pickups build on.

import { HALF_H, HALF_W } from './batches.js';

export const GLOW_CAP = 256;

/**
 * An InstancedMesh refilled every frame: a pose and a colour per instance
 * (linear, may pass 1 to bloom). `order`: the pose's Euler order ('YXZ'
 * tips first, then turns about the field's up).
 */
export class InstanceBatch {
  constructor(THREE, geometry, material, capacity, order = 'ZXY') {
    this.capacity = capacity;
    this.count = 0;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // set before the first compile: the program is keyed on it
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 3),
      3
    );
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.matrix = new THREE.Matrix4();
    this.scaled = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.euler = new THREE.Euler(0, 0, 0, order);
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3();
  }

  begin() {
    this.count = 0;
  }

  /**
   * Logical (x, y) at height `h`, turned `yaw` about its own up axis, then
   * tipped by `pitch` (about x) and `roll` (about z); uniform `scale`;
   * colour `rgb` × `gain`. Its index, or −1 when the batch is full.
   */
  pushPose(x, y, h, yaw, pitch, roll, scale, rgb, gain) {
    if (this.count >= this.capacity) return -1;
    const i = this.count;
    this.position.set(x - HALF_W, h, y - HALF_H);
    this.quaternion.setFromEuler(this.euler.set(pitch, yaw, roll));
    this.scale.setScalar(scale);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.mesh.setMatrixAt(i, this.matrix);
    const color = this.mesh.instanceColor.array;
    color[i * 3] = rgb[0] * gain;
    color[i * 3 + 1] = rgb[1] * gain;
    color[i * 3 + 2] = rgb[2] * gain;
    this.count += 1;
    return i;
  }

  /**
   * One instance from a world matrix: `matrix` its anchor's, `color` linear
   * (may pass 1), `scale` shrinks it about its centre. False when the batch
   * is full.
   */
  pushMatrix(matrix, color, scale = 1) {
    if (this.count >= this.capacity) return false;
    let pose = matrix;
    if (scale !== 1) {
      pose = this.scaled.copy(matrix);
      const e = pose.elements;
      for (let i = 0; i < 11; i += 1) if (i % 4 !== 3) e[i] *= scale;
    }
    this.mesh.setMatrixAt(this.count, pose);
    color.toArray(this.mesh.instanceColor.array, this.count * 3);
    this.count += 1;
    return true;
  }

  /** Uploads what was pushed (`extra`: more per-instance attributes). */
  end(extra) {
    const n = this.count;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (!n) return;
    upload(this.mesh.instanceMatrix, n);
    upload(this.mesh.instanceColor, n);
    if (extra) upload(extra, n);
  }

  clear() {
    this.begin();
    this.end();
  }
}

function upload(attribute, n) {
  attribute.updateRange.offset = 0;
  attribute.updateRange.count = n * attribute.itemSize;
  attribute.needsUpdate = true;
}

export class GlowBatch extends InstanceBatch {
  constructor(THREE, scene, capacity = GLOW_CAP) {
    super(
      THREE,
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      capacity
    );
    scene.add(this.mesh);
  }

  /**
   * One glow: `matrix` its anchor's world matrix, `color` linear (may pass
   * 1), `scale` shrinks it about its centre (a burning view's glows). False
   * when the batch is full.
   */
  push(matrix, color, scale = 1) {
    return this.pushMatrix(matrix, color, scale);
  }
}
