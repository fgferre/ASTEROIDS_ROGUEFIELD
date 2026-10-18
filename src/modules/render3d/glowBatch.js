// Every machine eye, lens and glowing node in one draw (PLAN.md R8.2): an
// unlit low-poly sphere instanced per glow, its pose from the glow's anchor
// and its colour (accent × gain, above 1 to bloom) per instance. Repacked
// every frame; no glow this frame: hidden, no draw.

export const GLOW_CAP = 256;

export class GlowBatch {
  constructor(THREE, scene, capacity = GLOW_CAP) {
    this.capacity = capacity;
    this.count = 0;
    this.mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      capacity
    );
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
    this.scaled = new THREE.Matrix4();
    scene.add(this.mesh);
  }

  begin() {
    this.count = 0;
  }

  /**
   * One glow: `matrix` its anchor's world matrix, `color` linear (may pass
   * 1), `scale` shrinks it about its centre (a burning view's glows). False
   * when the batch is full.
   */
  push(matrix, color, scale = 1) {
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

  /** Uploads what was pushed; hidden when empty. */
  end() {
    const n = this.count;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (!n) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.begin();
    this.end();
  }
}
