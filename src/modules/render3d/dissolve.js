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
//
// A machine breaks instead (fracture.js): its meshes take a copy of their
// geometry with each vertex tagged by its piece, and the same twins throw the
// pieces out, spin them and burn them away, slower; the noise stays on each
// piece (its rest position), so a piece burns as it tumbles.

import { brokenOf, shown } from './fracture.js';

// proposta 18/10: duration, concurrency, burn look.
export const DISSOLVE_SECONDS = 0.35;
export const DISSOLVE_CAP = 24;
const THRESHOLD_FROM = 0.18; // noise ~[0.15, 0.85]: holes from the first frame
const THRESHOLD_TO = 0.86;
const EDGE_WIDTH = 0.09; // band above the threshold, in noise units
const EDGE_GLOW = 2.4; // × accent, added after tone mapping
const NOISE_CELLS = 2.4; // noise cells per enemy radius

// proposta 17/11: a machine breaking into its own pieces.
export const BREAK_SECONDS = 1.1;
const BREAK_FROM = 0.12; // below the noise: whole pieces at first
const BREAK_EASE = 1.3; // the holes come late, then fast
const BREAK_BAND = 0.16; // a wider hot band than a burn's: the metal glows
const BREAK_EMBER = [1, 0.42, 0.1]; // the band's colour, not the accent
const BREAK_SPEED = 62; // px/s at radius 14, ± 45 %
const BREAK_DRAG = 2.4; // 1/s: they pop apart, then drift
const BREAK_LIFT = 0.35; // how much of a piece's height pushes it up
const BREAK_SCATTER = 0.9; // a piece's own sideways way, × the outward one
const SPIN_MIN = 2.5; // rad/s
const SPIN_RANGE = 6;
const SPIN_DRAG = 0.8; // 1/s
// proposta 17/11: a big machine's pieces start incandescent all over (× the
// ember colour, added after tone mapping) and cool in BREAK_HEAT_TIME s.
const BREAK_HEAT = 0.6;
const BREAK_HEAT_TIME = 0.3;

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
uniform float uDissolveBand;
uniform float uBreakHeat;
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

// A piece's turn: about its own random axis, slowing.
const BREAK_HEAD = `
attribute vec4 aPiece;
uniform float uExplode;
uniform float uExplodeSpeed;
uniform vec3 uExplodePush;
vec3 explodeTurn(vec3 v) {
  float r = aPiece.w;
  vec3 k = normalize(vec3(fract(r * 7.13), fract(r * 3.71), fract(r * 5.37)) - 0.5 + 0.001);
  float spin = (${SPIN_MIN.toFixed(2)} + ${SPIN_RANGE.toFixed(2)} * fract(r * 11.3)) * (r > 0.5 ? 1.0 : -1.0);
  float a = spin * (1.0 - exp(-${SPIN_DRAG.toFixed(2)} * uExplode)) / ${SPIN_DRAG.toFixed(2)};
  float c = cos(a);
  return v * c + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - c);
}
`;

// Out from the hull's centre (a little up) and off to its own side (a long
// hull would only break along its length), at its own speed, carried by the
// machine's momentum and the killing shot; turning about its own centre.
const BREAK_VERTEX = `
  vec3 dslvRest = transformed;
  if (uExplode > 0.0) {
    vec3 piece = aPiece.xyz;
    float r = aPiece.w;
    vec3 away = vec3(piece.x, piece.y * ${BREAK_LIFT.toFixed(2)}, piece.z);
    float far = length(away);
    float side = 6.2832 * fract(r * 31.7);
    away = normalize((far > 0.001 ? away / far : vec3(0.0))
      + ${BREAK_SCATTER.toFixed(2)} * vec3(cos(side), 0.0, sin(side)) + vec3(0.0, 0.001, 0.0));
    float drift = (1.0 - exp(-${BREAK_DRAG.toFixed(2)} * uExplode)) / ${BREAK_DRAG.toFixed(2)};
    vec3 velocity = away * uExplodeSpeed * (0.7 + 0.6 * fract(r * 17.0))
      + uExplodePush * (0.5 + fract(r * 23.0));
    transformed = piece + explodeTurn(transformed - piece) + velocity * drift;
  }`;

// Chained after the source material's own patch (rock cracks, hot core).
function patchDissolve(shader, renderer) {
  this.dissolveBase.call(this, shader, renderer);
  Object.assign(shader.uniforms, this.dissolveUniforms);
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>\nvarying vec3 vDissolvePos;\n${BREAK_HEAD}`
    )
    .replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
      if (uExplode > 0.0) objectNormal = explodeTurn(objectNormal);`
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>${BREAK_VERTEX}`
    )
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vDissolvePos = (modelMatrix * vec4(dslvRest, 1.0)).xyz;`
    );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${DISSOLVE_HEAD}`)
    .replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      vec3 dslvP = vDissolvePos * uDissolveScale + uDissolveSeed;
      float dslvN = 0.65 * dslvNoise(dslvP) + 0.35 * dslvNoise(dslvP * 2.7 + 11.0);
      if (dslvN < uDissolve) discard;
      float dslvEdge = 1.0 - smoothstep(uDissolve, uDissolve + uDissolveBand, dslvN);`
    )
    .replace(
      '#include <tonemapping_fragment>',
      `#include <tonemapping_fragment>
      gl_FragColor.rgb += uDissolveEdge * (dslvEdge * uDissolveGlow + uBreakHeat);`
    );
}

// The source's own key: a chained patch (rimLight.js) is one function over
// several bases, so its text alone would mix programs up.
function dissolveCacheKey() {
  return `dissolve:${this.dissolveKey}`;
}

export class DissolvePool {
  /** `finish(view)` takes back a view whose dissolve ended. */
  constructor(THREE, seeded, finish) {
    this.THREE = THREE;
    this.seeded = seeded;
    this.finish = finish;
    this.slots = [];
    for (let i = 0; i < DISSOLVE_CAP; i += 1) {
      this.slots.push({ view: null, age: 0, breaks: false, heat: 0 });
    }
    this.push = new THREE.Vector3();
    this.toLocal = new THREE.Matrix3();
    this.count = 0;
    this.collecting = null;
    this.collect = (node) => this.collectNode(node);
  }

  /**
   * Starts burning `view` (already out of the mirror's id map); with
   * `breakUp` ({ count, pushX, pushZ }: pieces, momentum in px/s) it breaks
   * into its own pieces as it burns.
   */
  start(view, accent, radius, breakUp = null) {
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
    u.uDissolveBand.value = EDGE_WIDTH;
    const seed = view.seed || 0;
    u.uDissolveSeed.value.set(
      (seed % 997) * 0.37,
      ((seed >>> 10) % 991) * 0.41,
      ((seed >>> 20) % 983) * 0.43
    );
    view.object.visible = true;
    u.uExplode.value = 0;
    if (breakUp) {
      u.uDissolve.value = BREAK_FROM;
      u.uDissolveBand.value = BREAK_BAND;
      u.uDissolveEdge.value.setRGB(...BREAK_EMBER);
      this.breakUp(view, radius, breakUp);
    }
    slot.view = view;
    slot.age = 0;
    slot.breaks = Boolean(breakUp);
    slot.heat = breakUp?.heat || 0;
    u.uBreakHeat.value = BREAK_HEAT * slot.heat;
    this.count += 1;
  }

  // Meshes laid at one parent's origin break together, led by the one with
  // the most vertices (the hull); any other mesh breaks on its own.
  breakUp(view, radius, { count, pushX, pushZ }) {
    const parts = view.dissolve;
    const frames = new Map();
    for (let i = 0; i < parts.meshes.length; i += 1) {
      const mesh = parts.meshes[i];
      if (!shown(mesh)) continue;
      const rest =
        mesh.position.lengthSq() === 0 &&
        mesh.quaternion.w === 1 &&
        mesh.scale.x === 1 &&
        mesh.scale.y === 1 &&
        mesh.scale.z === 1;
      const key = rest ? mesh.parent : mesh;
      if (!frames.has(key)) frames.set(key, []);
      frames.get(key).push(mesh);
    }
    let lead = null;
    frames.forEach((meshes) => {
      const hull = meshes.reduce((a, b) =>
        b.geometry.getAttribute('position').count >
        a.geometry.getAttribute('position').count
          ? b
          : a
      );
      lead ??= hull;
      for (let i = 0; i < meshes.length; i += 1) {
        const mesh = meshes[i];
        parts.geometries.push(mesh, mesh.geometry);
        // seeded: Three names each new geometry with Math.random
        mesh.geometry = this.seeded(() =>
          brokenOf(this.THREE, hull.geometry, mesh.geometry, count)
        );
      }
    });
    if (!lead) return;
    parts.broken = true;
    // speeds in the hull's own units: its world scale and turn undone
    view.object.updateMatrixWorld(true);
    const k = Math.max(0.7, Math.min(4, radius / 14));
    const u = parts.uniforms;
    u.uExplode.value = 1e-4;
    u.uExplodeSpeed.value =
      (BREAK_SPEED * Math.sqrt(k)) / lead.matrixWorld.getMaxScaleOnAxis();
    this.toLocal.setFromMatrix4(lead.matrixWorld).invert();
    u.uExplodePush.value
      .copy(this.push.set(pushX, 0, pushZ))
      .applyMatrix3(this.toLocal);
  }

  partsOf(view) {
    if (!view.dissolve) {
      const { THREE } = this;
      view.dissolve = {
        uniforms: {
          uDissolve: { value: 0 },
          uDissolveGlow: { value: 0 },
          uDissolveBand: { value: EDGE_WIDTH },
          uBreakHeat: { value: 0 },
          uDissolveScale: { value: 1 },
          uDissolveSeed: { value: new THREE.Vector3() },
          uDissolveEdge: { value: new THREE.Color() },
          uExplode: { value: 0 },
          uExplodeSpeed: { value: 0 },
          uExplodePush: { value: new THREE.Vector3() },
        },
        twins: new Map(),
        meshes: [],
        sources: [],
        lines: [],
        lineVisible: [],
        // a break's meshes and their own geometries, in pairs
        geometries: [],
        broken: false,
      };
    }
    return view.dissolve;
  }

  // Meshes take their twin (one per material of a multi-material mesh);
  // outlines just go dark for the burn.
  collectNode(node) {
    const parts = this.collecting.dissolve;
    if (node.isMesh) {
      parts.meshes.push(node);
      parts.sources.push(node.material);
      node.material = Array.isArray(node.material)
        ? node.material.map((m) => this.twinOf(parts, m))
        : this.twinOf(parts, node.material);
    } else if (node.isLine) {
      parts.lines.push(node);
      parts.lineVisible.push(node.visible);
      node.visible = false;
    }
  }

  twinOf(parts, source) {
    let twin = parts.twins.get(source);
    if (twin) {
      // the source's sky may have been rebuilt since (retakeSceneSky)
      twin.envMap = source.envMap;
      return twin;
    }
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
    twin.dissolveKey = source.customProgramCacheKey();
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
      const p = slot.age / (slot.breaks ? BREAK_SECONDS : DISSOLVE_SECONDS);
      if (p >= 1) {
        this.end(slot);
        continue;
      }
      const u = slot.view.dissolve.uniforms;
      u.uDissolve.value = slot.breaks
        ? BREAK_FROM + (THRESHOLD_TO - BREAK_FROM) * p ** BREAK_EASE
        : THRESHOLD_FROM + (THRESHOLD_TO - THRESHOLD_FROM) * p;
      u.uDissolveGlow.value = EDGE_GLOW * (1 - p * p);
      if (slot.breaks) u.uExplode.value = Math.max(1e-4, slot.age);
      if (slot.heat) {
        const cool = Math.max(0, 1 - slot.age / BREAK_HEAT_TIME);
        u.uBreakHeat.value = BREAK_HEAT * slot.heat * cool * cool;
      }
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
    const { geometries } = parts;
    for (let i = 0; i < geometries.length; i += 2) {
      geometries[i].geometry = geometries[i + 1];
    }
    geometries.length = 0;
    parts.broken = false;
    parts.uniforms.uExplode.value = 0;
    parts.uniforms.uBreakHeat.value = 0;
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
        // a machine's own pieces: torn hull plates (DebrisChunks)
        material: 'metal',
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
