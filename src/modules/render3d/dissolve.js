// The death moment (PLAN.md R3.6): a killed enemy's view is not hidden on the
// frame the simulation drops it; it burns away for DISSOLVE_SECONDS (a noise
// threshold discards the surface, an emissive band in the accent colour runs
// just ahead of the holes), while chunks in the same colour fly outward.
//
// Per-instance progress: Three r128 re-uploads a non-ShaderMaterial's
// uniforms only when the material changes between draws, so one shared
// material cannot carry a different uDissolve per object. Each view gets,
// once in its life, a dissolve twin of every material it draws with (shared
// hull/plate materials included), all bound to that view's own uniforms; a
// death swaps the twins in and the end swaps the originals back. Twins of one
// source share one program, so no material is cloned per death.

// proposta 18/10: duration, concurrency, burn look.
export const DISSOLVE_SECONDS = 0.35;
export const DISSOLVE_CAP = 24;
const THRESHOLD_FROM = 0.18; // noise ~[0.15, 0.85]: holes from the first frame
const THRESHOLD_TO = 0.86;
const EDGE_WIDTH = 0.09; // band above the threshold, in noise units
const EDGE_GLOW = 2.4; // × accent, added after tone mapping
const NOISE_CELLS = 2.4; // noise cells per enemy radius

// proposta 18/10: chunk burst.
export const BURST_CAPACITY = 96;
const BURST_SPEED = 70; // px/s at radius 14
const BURST_DRAG = 2.2; // 1/s
const BURST_LIFE = 0.7; // s, ± 30 %
const BURST_SIZE = 1.9; // particle size at radius 14
const WARDEN_FLASH = 4;

const DISSOLVE_HEAD = `
uniform float uDissolve;
uniform float uDissolveGlow;
uniform float uDissolveScale;
uniform vec3 uDissolveSeed;
uniform vec3 uDissolveEdge;
varying vec3 vDissolvePos;
float dslvHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float dslvNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(dslvHash(i), dslvHash(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(dslvHash(i + vec3(0.0, 1.0, 0.0)), dslvHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(dslvHash(i + vec3(0.0, 0.0, 1.0)), dslvHash(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(dslvHash(i + vec3(0.0, 1.0, 1.0)), dslvHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
`;

// Chained after the source material's own patch (rock cracks, hot core).
function patchDissolve(shader, renderer) {
  this.dissolveBase.call(this, shader, renderer);
  Object.assign(shader.uniforms, this.dissolveUniforms);
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      '#include <common>\nvarying vec3 vDissolvePos;'
    )
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vDissolvePos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
    );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${DISSOLVE_HEAD}`)
    .replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      vec3 dslvP = vDissolvePos * uDissolveScale + uDissolveSeed;
      float dslvN = 0.65 * dslvNoise(dslvP) + 0.35 * dslvNoise(dslvP * 2.7 + 11.0);
      if (dslvN < uDissolve) discard;
      float dslvEdge = 1.0 - smoothstep(uDissolve, uDissolve + ${EDGE_WIDTH.toFixed(3)}, dslvN);`
    )
    .replace(
      '#include <tonemapping_fragment>',
      `#include <tonemapping_fragment>
      gl_FragColor.rgb += uDissolveEdge * dslvEdge * uDissolveGlow;`
    );
}

function dissolveCacheKey() {
  return `dissolve:${this.dissolveBase.toString()}`;
}

export class DissolvePool {
  /** `finish(view)` takes back a view whose dissolve ended. */
  constructor(THREE, seeded, finish) {
    this.THREE = THREE;
    this.seeded = seeded;
    this.finish = finish;
    this.slots = [];
    for (let i = 0; i < DISSOLVE_CAP; i += 1) {
      this.slots.push({ view: null, age: 0 });
    }
    this.count = 0;
    this.collecting = null;
    this.collect = (node) => this.collectNode(node);
  }

  /** Starts burning `view` (already out of the mirror's id map). */
  start(view, accent, radius) {
    // a free slot, else the oldest burn ends now
    let slot = this.slots[0];
    for (let i = 0; i < this.slots.length && slot.view; i += 1) {
      const s = this.slots[i];
      if (!s.view || s.age > slot.age) slot = s;
    }
    if (slot.view) this.end(slot);
    const parts = this.partsOf(view);
    parts.meshes.length = 0;
    parts.sources.length = 0;
    parts.lines.length = 0;
    parts.lineVisible.length = 0;
    this.collecting = view;
    view.object.traverse(this.collect);
    this.collecting = null;
    const u = parts.uniforms;
    u.uDissolve.value = THRESHOLD_FROM;
    u.uDissolveGlow.value = EDGE_GLOW;
    u.uDissolveScale.value = NOISE_CELLS / Math.max(4, radius);
    u.uDissolveEdge.value.copy(accent);
    const seed = view.seed || 0;
    u.uDissolveSeed.value.set(
      (seed % 997) * 0.37,
      ((seed >>> 10) % 991) * 0.41,
      ((seed >>> 20) % 983) * 0.43
    );
    view.object.visible = true;
    slot.view = view;
    slot.age = 0;
    this.count += 1;
  }

  partsOf(view) {
    if (!view.dissolve) {
      const { THREE } = this;
      view.dissolve = {
        uniforms: {
          uDissolve: { value: 0 },
          uDissolveGlow: { value: 0 },
          uDissolveScale: { value: 1 },
          uDissolveSeed: { value: new THREE.Vector3() },
          uDissolveEdge: { value: new THREE.Color() },
        },
        twins: new Map(),
        meshes: [],
        sources: [],
        lines: [],
        lineVisible: [],
      };
    }
    return view.dissolve;
  }

  // Meshes take their twin; outlines just go dark for the burn.
  collectNode(node) {
    const parts = this.collecting.dissolve;
    if (node.isMesh) {
      parts.meshes.push(node);
      parts.sources.push(node.material);
      node.material = this.twinOf(parts, node.material);
    } else if (node.isLine) {
      parts.lines.push(node);
      parts.lineVisible.push(node.visible);
      node.visible = false;
    }
  }

  twinOf(parts, source) {
    let twin = parts.twins.get(source);
    if (twin) return twin;
    // userData stays shared (the rock patch reads live uniforms from it, and
    // Material.copy would JSON-serialise its textures)
    const data = source.userData;
    source.userData = {};
    twin = this.seeded(() => source.clone());
    source.userData = data;
    twin.userData = data;
    // Standard/Physical copy() resets defines (rock ROCK_* flags); Basic has none
    if (source.defines) Object.assign(twin.defines, source.defines);
    twin.dissolveBase = source.onBeforeCompile;
    twin.dissolveUniforms = parts.uniforms;
    twin.onBeforeCompile = patchDissolve;
    twin.customProgramCacheKey = dissolveCacheKey;
    parts.twins.set(source, twin);
    return twin;
  }

  update(dt) {
    for (let i = 0; i < this.slots.length; i += 1) {
      const slot = this.slots[i];
      if (!slot.view) continue;
      slot.age += dt;
      const p = slot.age / DISSOLVE_SECONDS;
      if (p >= 1) {
        this.end(slot);
        continue;
      }
      const u = slot.view.dissolve.uniforms;
      u.uDissolve.value = THRESHOLD_FROM + (THRESHOLD_TO - THRESHOLD_FROM) * p;
      u.uDissolveGlow.value = EDGE_GLOW * (1 - p * p);
    }
  }

  end(slot) {
    const { view } = slot;
    const parts = view.dissolve;
    for (let i = 0; i < parts.meshes.length; i += 1) {
      parts.meshes[i].material = parts.sources[i];
    }
    for (let i = 0; i < parts.lines.length; i += 1) {
      parts.lines[i].visible = parts.lineVisible[i];
    }
    view.object.visible = false;
    slot.view = null;
    this.count -= 1;
    this.finish(view);
  }

  clear() {
    for (let i = 0; i < this.slots.length; i += 1) {
      if (this.slots[i].view) this.end(this.slots[i]);
    }
  }
}

// Deterministic [0, 1) from a float (no Math.random in the render loop).
function hash01(v) {
  const s = Math.sin(v * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Accent-coloured chunks thrown outward by a death, drawn through the
 * debris InstancedMesh (`DebrisChunks.push`, between its begin and end);
 * the Warden's final death also lights a flash.
 */
export class DeathBursts {
  constructor(debris, flashes) {
    this.debris = debris;
    this.flashes = flashes;
    this.chunks = [];
    for (let i = 0; i < BURST_CAPACITY; i += 1) {
      this.chunks.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 0,
        life: 0,
        maxLife: 1,
        rotation: 0,
        rotationSpeed: 0,
        rgb: [0, 0, 0],
      });
    }
    this.next = 0;
    this.serial = 0;
  }

  /** `count` chunks from (x, y) logical, `radius` scales speed and size. */
  spawn(x, y, radius, color, count) {
    const k = Math.max(0.7, Math.min(4, radius / 14));
    for (let i = 0; i < count; i += 1) {
      this.serial += 1;
      const s = this.serial * 1.618;
      const c = this.chunks[this.next];
      this.next = (this.next + 1) % this.chunks.length;
      const angle = ((i + hash01(s)) / count) * Math.PI * 2;
      const speed = BURST_SPEED * Math.sqrt(k) * (0.6 + 0.8 * hash01(s + 1));
      const offset = radius * 0.4 * hash01(s + 2);
      c.x = x + Math.cos(angle) * offset;
      c.y = y + Math.sin(angle) * offset;
      c.vx = Math.cos(angle) * speed;
      c.vy = Math.sin(angle) * speed;
      c.size = BURST_SIZE * k * (0.6 + 0.8 * hash01(s + 3));
      c.maxLife = BURST_LIFE * (0.7 + 0.6 * hash01(s + 4));
      c.life = c.maxLife;
      c.rotation = hash01(s + 5) * Math.PI * 2;
      c.rotationSpeed = (hash01(s + 6) - 0.5) * 6 || 1;
      c.rgb[0] = color.r;
      c.rgb[1] = color.g;
      c.rgb[2] = color.b;
    }
  }

  flash(x, y, color) {
    this.flashes.light(x, y, color.r, color.g, color.b, WARDEN_FLASH);
  }

  update(dt) {
    const drag = Math.exp(-dt * BURST_DRAG);
    for (let i = 0; i < this.chunks.length; i += 1) {
      const c = this.chunks[i];
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) continue;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vx *= drag;
      c.vy *= drag;
      this.debris.push(c, c.rgb);
    }
  }

  clear() {
    for (let i = 0; i < this.chunks.length; i += 1) this.chunks[i].life = 0;
  }
}
