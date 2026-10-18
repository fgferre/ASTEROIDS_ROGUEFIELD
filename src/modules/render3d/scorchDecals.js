// Scorch marks where shots hit a rock: a small dark burn with an ember that
// cools in half a second, fading out over a few seconds. One InstancedMesh
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
const EMBER_TIME = 0.5; // s
const CHAR_ALPHA = 0.8;
const EMBER = [2.2, 0.75, 0.22]; // linear, hot enough to bloom a little

const DECAL_VERTEX = `
attribute float aFade;
attribute float aHeat;
attribute float aSeed;
varying vec2 vUv;
varying float vFade;
varying float vHeat;
varying float vSeed;
void main() {
  vUv = uv * 2.0 - 1.0;
  vFade = aFade;
  vHeat = aHeat;
  vSeed = aSeed;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

// Premultiplied: rgb darkens what is behind by alpha and adds the ember.
const DECAL_FRAGMENT = `
uniform vec3 uEmber;
uniform float uChar;
varying vec2 vUv;
varying float vFade;
varying float vHeat;
varying float vSeed;
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
  float a = shape * uChar * vFade;
  float core = 1.0 - smoothstep(0.0, 0.55, r + (n - 0.5) * 0.3);
  vec3 ember = uEmber * core * vHeat * vHeat;
  gl_FragColor = vec4(vec3(0.004, 0.003, 0.002) * a + ember, a);
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
        local: new THREE.Matrix4(),
      });
    }
    this.next = 0;
    this.count = 0;
    this.enabled = true;
    this.roll = 0;

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
    [this.fade, this.heat, this.seed].forEach((attribute) =>
      attribute.setUsage(THREE.DynamicDrawUsage)
    );
    geometry.setAttribute('aFade', this.fade);
    geometry.setAttribute('aHeat', this.heat);
    geometry.setAttribute('aSeed', this.seed);
    this.mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: {
          uEmber: { value: new THREE.Vector3(...EMBER) },
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
   * A shot hit the rock `view` (an EnemyMirror asteroid view): `nx, ny` the
   * logical direction from its centre to the hit. False when the ray finds
   * no surface (the rock is gone or the call came before its first frame).
   */
  hit(view, nx, ny) {
    if (!this.enabled || !view?.object?.visible) return false;
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
    object.raycast(this.raycaster, this.hits);
    if (!this.hits.length) return false;
    let best = this.hits[0];
    for (let i = 1; i < this.hits.length; i += 1) {
      if (this.hits[i].distance < best.distance) best = this.hits[i];
    }
    this.normal.copy(best.face.normal).transformDirection(object.matrixWorld);

    const size = Math.max(
      DECAL_MIN,
      Math.min(DECAL_MAX, (radius / 1.08) * DECAL_SIZE)
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
      this.heat.array[n] = Math.max(0, 1 - slot.age / EMBER_TIME);
      this.seed.array[n] = slot.seed;
      n += 1;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.fade.needsUpdate = true;
    this.heat.needsUpdate = true;
    this.seed.needsUpdate = true;
    return n;
  }

  clear() {
    for (let i = 0; i < DECAL_CAP; i += 1) this.slots[i].view = null;
    this.count = 0;
    this.mesh.count = 0;
  }
}
