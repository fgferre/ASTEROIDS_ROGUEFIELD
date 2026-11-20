// Ring fragments drawn instanced (PLAN.md R6.6): one InstancedMesh per rock
// shape × material family (stone, crystal), refilled every frame with the
// live rocks' poses and looks as per-instance attributes the rock shader
// reads (enemyMirror.js). A mesh with no rock this frame is hidden, so it
// costs no draw call, in the main pass or the shadow pass. A full mesh
// doubles its buffers in place (still one draw): a live rock is never left
// undrawn, since an unseen rock still hits.

export const ROCK_INSTANCE_CAP = 64;

// Per-instance attributes → item size, packed to stay within a GPU's
// attribute slots: base colour (linear, × the baked rock colour) and
// roughness, vein colour and metalness, crack-noise seed and the colour a
// cut face glows in (rocks.js CUT_TINTS), glow (crack glow,
// reveal, width, hit flash), the first struck point the cracks grow from
// (rock-space direction, reach; reach 0 = cracks everywhere), the last one
// and the heat of a cut face (rockCut.js).
export const ROCK_ATTRIBUTES = {
  aBase: 4,
  aVein: 4,
  aSeed: 4,
  aGlow: 4,
  aHit: 4,
  aHit2: 4,
};

export class RockInstances {
  /** `materials`: family → shared material; `geometries`: the rock shapes. */
  constructor(THREE, scene, geometries, materials) {
    this.THREE = THREE;
    this.scene = scene;
    this.materials = materials;
    this.meshes = {};
    this.counts = {};
    // shape slots past the fixed shapes: a cut rock's own geometry
    this.fixed = geometries.length;
    this.free = [];
    // what else holds slots (rockBreak.js): gives them back on clear
    this.onClear = () => {};
    Object.entries(materials).forEach(([family, material]) => {
      this.counts[family] = geometries.map(() => 0);
      this.meshes[family] = geometries.map((shape) =>
        this.createMesh(shape, material, ROCK_INSTANCE_CAP)
      );
    });
  }

  createMesh(shape, material, cap) {
    const { THREE } = this;
    const mesh = new THREE.InstancedMesh(
      this.shareShape(shape, null, cap),
      material,
      cap
    );
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // instances spread over the whole field: the mesh has no useful bounds
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.visible = false;
    this.scene.add(mesh);
    return mesh;
  }

  // A geometry that shares the shape's vertex buffers and has its own (or
  // `from`'s) instance data.
  shareShape(shape, from, cap) {
    const geometry = new this.THREE.BufferGeometry();
    Object.entries(shape.attributes).forEach(([name, attribute]) =>
      geometry.setAttribute(name, attribute)
    );
    if (shape.index) geometry.setIndex(shape.index);
    Object.entries(ROCK_ATTRIBUTES).forEach(([name, size]) =>
      geometry.setAttribute(
        name,
        from?.attributes[name] ||
          this.instanceBuffer(new Float32Array(cap * size), size)
      )
    );
    return geometry;
  }

  /**
   * A shape of its own for one cut rock (live or a falling piece); returns
   * its slot for `view.shape`. Slots are reused: freeShape gives one back.
   */
  addShape(shape) {
    const slot = this.free.pop();
    Object.entries(this.materials).forEach(([family, material]) => {
      const meshes = this.meshes[family];
      if (slot === undefined) {
        meshes.push(this.createMesh(shape, material, 2));
        this.counts[family].push(0);
        return;
      }
      const mesh = meshes[slot];
      const old = mesh.geometry;
      mesh.geometry = this.shareShape(shape, old, 0);
      old.dispose();
    });
    return slot ?? this.meshes.stone.length - 1;
  }

  /** The cut shape in `slot` is done: its GPU buffers are freed. */
  freeShape(slot) {
    if (slot < this.fixed) return;
    Object.values(this.meshes).forEach((meshes) =>
      meshes[slot].geometry.dispose()
    );
    this.free.push(slot);
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
    const { base, vein, seed, glow, surface, hit, heat } = view.rock;
    base.toArray(attributes.aBase.array, n * 4);
    attributes.aBase.array[n * 4 + 3] = surface[0];
    vein.toArray(attributes.aVein.array, n * 4);
    attributes.aVein.array[n * 4 + 3] = surface[1];
    seed.toArray(attributes.aSeed.array, n * 4);
    attributes.aSeed.array[n * 4 + 3] = view.rock.tint;
    attributes.aGlow.array.set(glow, n * 4);
    attributes.aHit.array.set(hit[0], n * 4);
    attributes.aHit2.array.set(hit[1], n * 4);
    attributes.aHit2.array[n * 4 + 3] = heat;
    counts[view.shape] = n + 1;
  }

  instanceBuffer(array, size) {
    const attribute = new this.THREE.InstancedBufferAttribute(array, size);
    attribute.setUsage(this.THREE.DynamicDrawUsage);
    return attribute;
  }

  // Doubles a full mesh's instance buffers, keeping what this frame already
  // packed; new buffer objects, so the renderer uploads them at their size.
  // The old GL buffers are freed first (mesh and geometry dispose; the
  // renderer re-creates whatever is still in use on the next draw).
  grow(mesh) {
    const bigger = (attribute) => {
      const array = new Float32Array(attribute.array.length * 2);
      array.set(attribute.array);
      return this.instanceBuffer(array, attribute.itemSize);
    };
    mesh.dispose();
    mesh.geometry.dispose();
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
    this.onClear();
  }
}
