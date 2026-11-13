// Ring fragments drawn instanced (PLAN.md R6.6): one InstancedMesh per rock
// shape × material family (stone, crystal), refilled every frame with the
// live rocks' poses and looks as per-instance attributes the rock shader
// reads (enemyMirror.js). A mesh with no rock this frame is hidden, so it
// costs no draw call, in the main pass or the shadow pass. A full mesh
// doubles its buffers in place (still one draw): a live rock is never left
// undrawn, since an unseen rock still hits.

export const ROCK_INSTANCE_CAP = 64;

// Per-instance attributes → item size: base colour (linear, × the baked
// rock colour), vein colour, crack-noise seed, glow (crack glow, reveal,
// width, hit flash) and surface (roughness, metalness).
export const ROCK_ATTRIBUTES = {
  aBase: 3,
  aVein: 3,
  aSeed: 3,
  aGlow: 4,
  aSurface: 2,
};

export class RockInstances {
  /** `materials`: family → shared material; `geometries`: the rock shapes. */
  constructor(THREE, scene, geometries, materials) {
    this.THREE = THREE;
    this.meshes = {};
    this.counts = {};
    Object.entries(materials).forEach(([family, material]) => {
      this.counts[family] = geometries.map(() => 0);
      this.meshes[family] = geometries.map((shape) => {
        // shares the shape's vertex buffers; only the instance data is its own
        const geometry = new THREE.BufferGeometry();
        Object.entries(shape.attributes).forEach(([name, attribute]) =>
          geometry.setAttribute(name, attribute)
        );
        if (shape.index) geometry.setIndex(shape.index);
        Object.entries(ROCK_ATTRIBUTES).forEach(([name, size]) =>
          geometry.setAttribute(
            name,
            this.instanceBuffer(
              new Float32Array(ROCK_INSTANCE_CAP * size),
              size
            )
          )
        );
        const mesh = new THREE.InstancedMesh(
          geometry,
          material,
          ROCK_INSTANCE_CAP
        );
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // instances spread over the whole field: the mesh has no useful bounds
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.count = 0;
        mesh.visible = false;
        scene.add(mesh);
        return mesh;
      });
    });
  }

  begin() {
    Object.values(this.counts).forEach((counts) => counts.fill(0));
  }

  /**
   * One live rock this frame: `view.family`/`view.shape` pick the mesh,
   * `view.object.matrixWorld` is its pose, `view.rock` its look. A full
   * mesh grows first.
   */
  push(view) {
    const counts = this.counts[view.family];
    const n = counts[view.shape];
    const mesh = this.meshes[view.family][view.shape];
    if (n >= mesh.instanceMatrix.count) this.grow(mesh);
    mesh.setMatrixAt(n, view.object.matrixWorld);
    const { attributes } = mesh.geometry;
    const { base, vein, seed, glow, surface } = view.rock;
    base.toArray(attributes.aBase.array, n * 3);
    vein.toArray(attributes.aVein.array, n * 3);
    seed.toArray(attributes.aSeed.array, n * 3);
    attributes.aGlow.array.set(glow, n * 4);
    attributes.aSurface.array.set(surface, n * 2);
    counts[view.shape] = n + 1;
  }

  instanceBuffer(array, size) {
    const attribute = new this.THREE.InstancedBufferAttribute(array, size);
    attribute.setUsage(this.THREE.DynamicDrawUsage);
    return attribute;
  }

  // Doubles a full mesh's instance buffers, keeping what this frame already
  // packed; new buffer objects, so the renderer uploads them at their size.
  grow(mesh) {
    const bigger = (attribute) => {
      const array = new Float32Array(attribute.array.length * 2);
      array.set(attribute.array);
      return this.instanceBuffer(array, attribute.itemSize);
    };
    mesh.instanceMatrix = bigger(mesh.instanceMatrix);
    Object.keys(ROCK_ATTRIBUTES).forEach((name) =>
      mesh.geometry.setAttribute(name, bigger(mesh.geometry.attributes[name]))
    );
  }

  /** Uploads what was pushed; empty meshes are hidden. */
  end() {
    Object.entries(this.meshes).forEach(([family, meshes]) =>
      meshes.forEach((mesh, shape) => {
        const n = this.counts[family][shape];
        mesh.count = n;
        mesh.visible = n > 0;
        if (!n) return;
        mesh.instanceMatrix.needsUpdate = true;
        Object.keys(ROCK_ATTRIBUTES).forEach((name) => {
          mesh.geometry.attributes[name].needsUpdate = true;
        });
      })
    );
  }

  clear() {
    this.begin();
    this.end();
  }
}
