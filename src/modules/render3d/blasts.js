// An explosion as fire and smoke (docs/NORTE.md: every hit is physical), in
// place of the flash and ring a burst had: a fireball that boils out of a
// white-hot core and cools through yellow and orange to a dull red, its rim
// torn by noise that flows outward, then the soot it leaves rolling on and
// thinning away. One InstancedMesh (one draw call) of camera-facing quads;
// the shape and the heat are all in the fragment shader, from the blast's age
// and seed. The sparks and the incandescent fragments are HitSparks'
// (SPARK_KIND.blast); the light it throws on the hulls round it, FlashLights'.

import { HALF_H, HALF_W } from './batches.js';

// proposta 17/11 (efeito/impacto, lote 4): pool, height, and per look the
// quad's half size (× the burst radius), the fire's time, the whole life
// (s) and how much soot it leaves.
export const BLAST_CAP = 24;
const BLAST_HEIGHT = 7;
export const BLAST_LOOK = Object.freeze({
  // the Scatter Coil's flak: a sharp, small fireball and a little soot
  flak: { size: 0.42, fire: 0.15, life: 0.45, smoke: 0.4 },
  // a Seeker Swarm missile: a full fireball rolling into smoke
  seeker: { size: 1.5, fire: 0.4, life: 1.1, smoke: 0.8 },
  // proposta vfx-6: a missile spent at the end of its range on nothing, its
  // motor cut: a small pop of fire and a puff of smoke
  spent: { size: 0.55, fire: 0.2, life: 0.75, smoke: 0.7 },
  // proposta vfx-6: a Caster's shell landing, a fireball well inside its
  // warning circle, rolling into smoke
  shell: { size: 0.55, fire: 0.3, life: 0.95, smoke: 0.85 },
});

const BLAST_VERTEX = `
attribute float aAge;
attribute float aSeed;
attribute float aFire;
attribute float aSmoke;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
varying float vFire;
varying float vSmoke;
void main() {
  vUv = uv * 2.0 - 1.0;
  vAge = aAge;
  vSeed = aSeed;
  vFire = aFire;
  vSmoke = aSmoke;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

// Premultiplied: the soot darkens what is behind by alpha, the fire adds
// light. `vAge` runs 0 → 1 over the blast's life, `vFire` is the share of it
// that burns. uFlash: Reduce Flashing dims the white-hot start, not the fire.
const BLAST_FRAGMENT = `
uniform float uFlash;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
varying float vFire;
varying float vSmoke;
float blastHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + vSeed * 43.7) * 43758.5453);
}
float blastNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(blastHash(i), blastHash(i + vec2(1.0, 0.0)), f.x),
    mix(blastHash(i + vec2(0.0, 1.0)), blastHash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
float blastFbm(vec2 p) {
  return blastNoise(p) * 0.55 + blastNoise(p * 2.1 + 3.7) * 0.3 + blastNoise(p * 4.3 + 7.1) * 0.15;
}
// dull red → orange → yellow → white, by temperature
vec3 blastHeat(float h) {
  vec3 c = mix(vec3(0.0), vec3(0.45, 0.04, 0.0), smoothstep(0.0, 0.25, h));
  c = mix(c, vec3(1.3, 0.38, 0.06), smoothstep(0.2, 0.5, h));
  c = mix(c, vec3(1.65, 0.95, 0.28), smoothstep(0.5, 0.8, h));
  return mix(c, vec3(1.9, 1.7, 1.35), smoothstep(0.85, 1.15, h));
}
void main() {
  float r = length(vUv);
  if (r >= 1.0) discard;
  float t = vAge;
  float fire = clamp(1.0 - t / vFire, 0.0, 1.0);
  // the ball boils out fast, then the soot keeps rolling slowly
  float grow = 1.0 - pow(1.0 - clamp(t / (vFire * 1.3), 0.0, 1.0), 3.0);
  float reach = mix(0.28, 0.8, grow) + 0.14 * t;
  vec2 dir = vUv / max(r, 1e-3);
  float n = blastFbm(vUv * 2.6 - dir * 1.2 * t + vSeed * 9.0);
  float edge = reach * (0.7 + 0.5 * n);
  float body = 1.0 - smoothstep(edge * 0.7, edge, r);
  if (body <= 0.0) discard;
  float depth = 1.0 - r / edge;
  float boil = blastFbm(vUv * 5.5 - dir * 2.0 * t + vSeed * 3.0);
  // white only in the core, and only at first
  float core = depth * sqrt(depth);
  float heat = fire * (0.3 + 0.9 * core) + (boil - 0.5) * 0.5 * fire;
  heat += fire * fire * fire * fire * 0.3 * core;
  vec3 light = blastHeat(heat) * body * mix(1.0, uFlash, fire * fire);
  float smoke = body * vSmoke * (1.0 - fire * fire) * (1.0 - smoothstep(0.45, 1.0, t)) * (0.55 + 0.6 * n);
  vec3 soot = vec3(0.035, 0.03, 0.028) * (0.6 + 0.8 * boil);
  // the fireball itself hides a little of what is behind it
  float a = clamp(smoke + body * fire * 0.35, 0.0, 1.0);
  gl_FragColor = vec4(soot * smoke + light, a);
}`;

export class Blasts {
  constructor(THREE, scene) {
    this.slots = [];
    for (let i = 0; i < BLAST_CAP; i += 1) {
      this.slots.push({ x: 0, y: 0, size: 0, age: 0, look: null, seed: 0 });
    }
    this.next = 0;
    this.roll = 0;
    this.flash = 1;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const attribute = () => {
      const a = new THREE.InstancedBufferAttribute(
        new Float32Array(BLAST_CAP),
        1
      );
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.age = attribute();
    this.seed = attribute();
    this.fire = attribute();
    this.smoke = attribute();
    geometry.setAttribute('aAge', this.age);
    geometry.setAttribute('aSeed', this.seed);
    geometry.setAttribute('aFire', this.fire);
    geometry.setAttribute('aSmoke', this.smoke);
    this.uniforms = { uFlash: { value: 1 } };
    this.mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: BLAST_VERTEX,
        fragmentShader: BLAST_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }),
      BLAST_CAP
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.matrix = new THREE.Matrix4();
  }

  // Deterministic seed (Math.random is off-limits in the render path).
  rand() {
    this.roll += 1;
    const x = Math.sin(this.roll * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  /** A burst of `radius` (logical) at (x, y); `look` a BLAST_LOOK entry. */
  emit(x, y, radius, look = BLAST_LOOK.flak) {
    const slot = this.slots[this.next];
    this.next = (this.next + 1) % BLAST_CAP;
    slot.x = x;
    slot.y = y;
    slot.size = radius * look.size;
    slot.age = 0;
    slot.look = look;
    slot.seed = this.rand();
  }

  /** Ages the blasts and turns them to `camera`; `flash` Reduce Flashing's dimmer. */
  update(dt, camera, flash = 1) {
    this.uniforms.uFlash.value = flash;
    let n = 0;
    for (let i = 0; i < BLAST_CAP; i += 1) {
      const slot = this.slots[i];
      if (!slot.look) continue;
      slot.age += dt;
      const { life, fire, smoke } = slot.look;
      if (slot.age >= life) {
        slot.look = null;
        continue;
      }
      this.position.set(slot.x - HALF_W, BLAST_HEIGHT, slot.y - HALF_H);
      this.scale.set(slot.size, slot.size, slot.size);
      this.matrix.compose(this.position, camera.quaternion, this.scale);
      this.mesh.setMatrixAt(n, this.matrix);
      this.age.array[n] = slot.age / life;
      this.seed.array[n] = slot.seed;
      this.fire.array[n] = fire / life;
      this.smoke.array[n] = smoke;
      n += 1;
    }
    this.mesh.count = n;
    if (n === 0) return n;
    const attributes = [
      this.mesh.instanceMatrix,
      this.age,
      this.seed,
      this.fire,
      this.smoke,
    ];
    for (const attribute of attributes) {
      attribute.updateRange.offset = 0;
      attribute.updateRange.count = n * attribute.itemSize;
      attribute.needsUpdate = true;
    }
    return n;
  }

  clear() {
    for (let i = 0; i < BLAST_CAP; i += 1) this.slots[i].look = null;
    this.mesh.count = 0;
  }
}
