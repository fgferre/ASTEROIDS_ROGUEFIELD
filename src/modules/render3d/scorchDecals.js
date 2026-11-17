// Where a shot hits, the surface heats. On a rock a patch turns to lava: a
// white-hot core that cools through orange to a dull red, its molten veins
// glowing longest, then a dark burn that fades over a few seconds. On a
// machine's metal a smaller spot glows white-hot and dies in under half a
// second, leaving a dark dent. One InstancedMesh
// (one draw call) of quads; each mark keeps its pose in its rock's local
// space, so it turns and drifts with the rock and dies with its view. The
// mark sits where a ray from above the hit side meets the real (displaced)
// rock surface, leaning toward the camera so the burn reads from above.

// proposta 18/10: pool, life, size (× rock radius, clamped) and the burn.
export const DECAL_CAP = 64;
export const DECAL_LIFE = 6; // s
const DECAL_SIZE = 0.45;
const DECAL_MIN = 5;
const DECAL_MAX = 14;
const DECAL_LIFT = 0.35; // world units off the surface
const DECAL_LEAN = 0.8; // how far the mark climbs toward the rock's top
// proposta 17/11 (efeito/impacto, was a 0.5 s ember on rock only): the
// heat of each material and how much of its spot it covers.
export const DECAL_KIND = Object.freeze({ rock: 0, metal: 1 });
const EMBER_TIME = [1.8, 0.7]; // s, rock / metal
const ROCK_SIZE = 1.6; // × the 18/10 mark
const METAL_SIZE = [7, 16, 0.75]; // a machine's mark: min, max, × its radius
const KIND_CHAR = [0.8, 0.45]; // how dark the burn
const CHAR_ALPHA = 1;
// at most this many new marks a frame: each one casts a ray at its target
const HITS_PER_FRAME = 6;

const DECAL_VERTEX = `
attribute float aFade;
attribute float aHeat;
attribute float aSeed;
attribute float aKind;
varying vec2 vUv;
varying float vFade;
varying float vHeat;
varying float vSeed;
varying float vKind;
void main() {
  vUv = uv * 2.0 - 1.0;
  vFade = aFade;
  vHeat = aHeat;
  vSeed = aSeed;
  vKind = aKind;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

// Premultiplied: rgb darkens what is behind by alpha and adds the heat.
// Heat colour by temperature: white-hot, orange, dull red.
const DECAL_FRAGMENT = `
uniform float uChar;
varying vec2 vUv;
varying float vFade;
varying float vHeat;
varying float vSeed;
varying float vKind;
float decalHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + vSeed * 43.7) * 43758.5453);
}
float decalNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(decalHash(i), decalHash(i + vec2(1.0, 0.0)), f.x),
    mix(decalHash(i + vec2(0.0, 1.0)), decalHash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
void main() {
  float r = length(vUv);
  float n = decalNoise(vUv * 3.0 + vSeed * 7.0) * 0.6 + decalNoise(vUv * 7.0) * 0.4;
  float shape = 1.0 - smoothstep(0.25, 1.0, r + (n - 0.5) * 0.55);
  if (shape <= 0.0) discard;
  float metal = step(0.5, vKind);
  float a = shape * uChar * vFade * mix(${KIND_CHAR[0].toFixed(2)}, ${KIND_CHAR[1].toFixed(2)}, metal);
  float h = vHeat;
  vec3 heat = mix(vec3(0.5, 0.035, 0.0), vec3(2.3, 0.72, 0.15), smoothstep(0.0, 0.55, h));
  heat = mix(heat, vec3(2.9, 2.35, 1.5), smoothstep(0.72, 1.0, h));
  float core = 1.0 - smoothstep(0.0, mix(0.62, 0.7, metal), r + (n - 0.5) * 0.3);
  // molten veins through the patch: they stay lit after the crust darkens
  float veins = 1.0 - smoothstep(0.0, 0.16, abs(decalNoise(vUv * 4.5 + vSeed * 3.0) - 0.5));
  float molten = mix(veins * 0.9, 0.55 + 0.6 * veins, smoothstep(0.35, 0.85, h));
  float lit = core * mix(molten * pow(h, 0.7), 1.4 * pow(h, 1.2), metal);
  // 0.8: marks stacked by a stream of hits saturate a little later
  gl_FragColor = vec4(vec3(0.004, 0.003, 0.002) * a + heat * lit * 0.8, a);
}`;

export class ScorchDecals {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.slots = [];
    for (let i = 0; i < DECAL_CAP; i += 1) {
      this.slots.push({
        view: null,
        age: 0,
        seed: 0,
        kind: 0,
        local: new THREE.Matrix4(),
      });
    }
    this.next = 0;
    this.count = 0;
    this.enabled = true;
    this.roll = 0;
    this.budget = HITS_PER_FRAME;

    const geometry = new THREE.PlaneGeometry(1, 1);
    this.fade = new THREE.InstancedBufferAttribute(
      new Float32Array(DECAL_CAP),
      1
    );
    this.heat = new THREE.InstancedBufferAttribute(
      new Float32Array(DECAL_CAP),
      1
    );
    this.seed = new THREE.InstancedBufferAttribute(
      new Float32Array(DECAL_CAP),
      1
    );
    this.kind = new THREE.InstancedBufferAttribute(
      new Float32Array(DECAL_CAP),
      1
    );
    [this.fade, this.heat, this.seed, this.kind].forEach((attribute) =>
      attribute.setUsage(THREE.DynamicDrawUsage)
    );
    geometry.setAttribute('aFade', this.fade);
    geometry.setAttribute('aHeat', this.heat);
    geometry.setAttribute('aSeed', this.seed);
    geometry.setAttribute('aKind', this.kind);
    this.mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: {
          uChar: { value: CHAR_ALPHA },
        },
        vertexShader: DECAL_VERTEX,
        fragmentShader: DECAL_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4,
      }),
      DECAL_CAP
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);

    this.raycaster = new THREE.Raycaster();
    this.hits = [];
    this.origin = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.normal = new THREE.Vector3();
    this.zAxis = new THREE.Vector3(0, 0, 1);
    this.quaternion = new THREE.Quaternion();
    this.spin = new THREE.Quaternion();
    this.scale = new THREE.Vector3();
    this.world = new THREE.Matrix4();
    this.inverse = new THREE.Matrix4();
  }

  /** Quality preset: off clears the marks and hides the mesh. */
  setEnabled(enabled) {
    this.enabled = enabled;
    this.mesh.visible = enabled;
    if (!enabled) this.clear();
  }

  // Deterministic jitter (Math.random is off-limits in the render path).
  rand() {
    this.roll += 1;
    const x = Math.sin(this.roll * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  /**
   * A shot hit `view` (an EnemyMirror view) made of `kind` (DECAL_KIND):
   * `nx, ny` the logical direction from its centre to the hit. False when
   * the ray finds no surface (the target is gone or the call came before
   * its first frame) or this frame's marks are spent.
   */
  hit(view, nx, ny, kind = DECAL_KIND.rock) {
    if (!this.enabled || !view?.object?.visible || this.budget <= 0)
      return false;
    this.budget -= 1;
    const { object } = view;
    const len = Math.hypot(nx, ny) || 1;
    const radius = object.scale.x || 1;
    this.dir
      .set(
        (nx / len) * (1 - DECAL_LEAN * 0.5),
        DECAL_LEAN,
        (ny / len) * (1 - DECAL_LEAN * 0.5)
      )
      .normalize();
    object.updateMatrixWorld();
    this.origin.copy(object.position).addScaledVector(this.dir, radius * 3);
    this.raycaster.set(this.origin, this.dir.negate());
    this.hits.length = 0;
    // a rock is one mesh; a machine is a group of parts
    if (kind === DECAL_KIND.rock) object.raycast(this.raycaster, this.hits);
    else this.raycaster.intersectObject(object, true, this.hits);
    let best = null;
    for (let i = 0; i < this.hits.length; i += 1) {
      const h = this.hits[i];
      if (!h.face || !h.object.visible || h.object.material?.transparent)
        continue;
      if (!best || h.distance < best.distance) best = h;
    }
    if (!best) return false;
    this.normal
      .copy(best.face.normal)
      .transformDirection(best.object.matrixWorld);

    // a machine's group is scaled by its radius; a rock's mesh by ~1.08 ×
    const size =
      kind === DECAL_KIND.rock
        ? Math.max(
            DECAL_MIN,
            Math.min(DECAL_MAX, (radius / 1.08) * DECAL_SIZE)
          ) * ROCK_SIZE
        : Math.max(
            METAL_SIZE[0],
            Math.min(METAL_SIZE[1], radius * METAL_SIZE[2])
          );
    this.quaternion.setFromUnitVectors(this.zAxis, this.normal);
    this.spin.setFromAxisAngle(this.zAxis, this.rand() * Math.PI * 2);
    this.quaternion.multiply(this.spin);
    this.scale.set(size, size, size);
    this.origin.copy(best.point).addScaledVector(this.normal, DECAL_LIFT);
    this.world.compose(this.origin, this.quaternion, this.scale);

    // the oldest mark gives way when the pool is full
    const slot = this.slots[this.next];
    this.next = (this.next + 1) % DECAL_CAP;
    if (!slot.view) this.count += 1;
    slot.view = view;
    slot.id = view.id;
    slot.age = 0;
    slot.seed = this.rand();
    slot.kind = kind;
    slot.local
      .copy(this.inverse.copy(object.matrixWorld).invert())
      .multiply(this.world);
    return true;
  }

  /**
   * Ages the marks and poses them on their rocks; `views` is the mirror's
   * id → view map (a mark whose rock left it is dropped). Call after the
   * rocks moved this frame.
   */
  update(dt, views) {
    this.budget = HITS_PER_FRAME;
    let n = 0;
    for (let i = 0; i < DECAL_CAP; i += 1) {
      const slot = this.slots[i];
      if (!slot.view) continue;
      slot.age += dt;
      if (slot.age >= DECAL_LIFE || views.get(slot.id) !== slot.view) {
        slot.view = null;
        this.count -= 1;
        continue;
      }
      const { object } = slot.view;
      object.updateMatrixWorld();
      this.world.multiplyMatrices(object.matrixWorld, slot.local);
      this.mesh.setMatrixAt(n, this.world);
      const t = slot.age / DECAL_LIFE;
      this.fade.array[n] = 1 - t * t;
      this.heat.array[n] = Math.max(0, 1 - slot.age / EMBER_TIME[slot.kind]);
      this.seed.array[n] = slot.seed;
      this.kind.array[n] = slot.kind;
      n += 1;
    }
    this.mesh.count = n;
    if (n === 0) return n;
    const attributes = [
      this.mesh.instanceMatrix,
      this.fade,
      this.heat,
      this.seed,
      this.kind,
    ];
    for (const attribute of attributes) {
      attribute.updateRange.offset = 0;
      attribute.updateRange.count = n * attribute.itemSize;
      attribute.needsUpdate = true;
    }
    return n;
  }

  clear() {
    for (let i = 0; i < DECAL_CAP; i += 1) this.slots[i].view = null;
    this.count = 0;
    this.mesh.count = 0;
  }
}
