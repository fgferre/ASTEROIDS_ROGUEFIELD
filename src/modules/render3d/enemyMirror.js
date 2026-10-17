// Mirrors EnemySystem entities into Three objects (docs/NORTE.md §3): Ring
// fragments as procedural rock meshes whose cracks light up amber with
// damage, and the Wardens' machines (Mote, Seeker, Tether, Warden Prime).
// Views are pooled per kind and keyed by entity id; a view not seen in a frame
// is hidden and returned to its pool.

import { PALETTE } from '../../data/constants/palette.js';
import { createAsteroidGeometry, createSeededRandom } from './asteroidMesh.js';
import { HALF_H, HALF_W } from './batches.js';

const ROCK_SHAPES = 8;
const ROCK_DETAIL = 4;
// Rock geometry is unit-radius with craters cut in; this keeps the visible
// silhouette close to the collision radius.
const ROCK_SCALE = 1.08;
// Amber stays amber up to ~1.4 (above that green clips → yellow); bloom
// starts at ~1.0 (threshold 0.75).
const CRACK_GLOW = [0, 0.8, 1.15, 1.4];
const CRACK_REVEAL = [0, 0.35, 0.65, 1];
const WARDEN_SEGMENTS = 6;
const KNOWN_KINDS = new Set(['asteroid', 'drone', 'hunter', 'mine', 'boss']);

// Variant look: tint multiplies the baked rock color; veins are the light
// inside (§3 "Fragmento do Anel").
const ROCK_VARIANTS = {
  common: { tint: [1, 1, 1] },
  iron: { tint: [0.86, 0.9, 1], metalness: 0.45, roughness: 0.6 },
  denseCore: { tint: [0.68, 0.76, 0.95] },
  gold: { tint: [1.05, 0.96, 0.82], vein: PALETTE.xp, veinGlow: 0.75 },
  volatile: {
    tint: [1, 0.9, 0.84],
    vein: PALETTE.shot,
    veinGlow: 0.95,
    pulse: 0.35,
  },
  parasite: {
    tint: [0.95, 0.84, 0.88],
    vein: PALETTE.threat,
    veinGlow: 0.8,
    pulse: 0.35,
  },
  crystal: {
    tint: [0.8, 0.95, 1.12],
    vein: '#bfe8ff',
    veinGlow: 0.55,
    roughness: 0.4,
  },
};

const ROCK_SHADER_HEAD = `
uniform float uGlow;
uniform float uReveal;
uniform float uWidth;
uniform float uFlash;
uniform vec3 uVein;
uniform vec3 uSeed;
varying vec3 vRockPos;
vec3 rockHash(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}
// F2 - F1 of a 3D cellular field: ~0 along the walls between cells (cracks).
// The nearest cell's random id decides whether its walls are revealed yet.
vec2 rockCracks(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 h = rockHash(i + g);
    vec3 r = g + h - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = h.x; }
    else if (d < d2) { d2 = d; }
  }
  return vec2(sqrt(d2) - sqrt(d1), id);
}
`;

function patchRockShader(shader) {
  const uniforms = this.userData.rockUniforms;
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vRockPos;')
    .replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvRockPos = position;'
    );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${ROCK_SHADER_HEAD}`)
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      if (uGlow > 0.001) {
        vec2 c = rockCracks(vRockPos * 2.3 + uSeed);
        float wall = 1.0 - smoothstep(uWidth * 0.4, uWidth, c.x);
        float fine = 1.0 - smoothstep(0.0, uWidth * 0.5,
          rockCracks(vRockPos * 5.1 + uSeed.zxy).x);
        float crack = max(wall, fine * 0.7 * step(0.6, uReveal))
          * step(c.y, uReveal);
        diffuseColor.rgb *= 1.0 - 0.7 * crack;
        totalEmissiveRadiance += uVein * crack * uGlow;
      }
      totalEmissiveRadiance += vec3(uFlash);`
    );
}

// Energy orb: emissive brightest where the surface faces the camera, so the
// core reads as a volume of light instead of a flat disc.
function patchHotCore(shader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
    float facing = max(dot(normal, normalize(vViewPosition)), 0.0);
    totalEmissiveRadiance *= 0.15 + 1.1 * pow(facing, 1.6);`
  );
}

function hashId(id) {
  const text = String(id);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Bakes per-vertex albedo from relief: crater floors dark, crests lighter.
function paintRock(THREE, geometry, seed) {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const low = new THREE.Color(PALETTE.rockShadow);
  const mid = new THREE.Color(PALETTE.rock);
  const high = new THREE.Color(PALETTE.rockLit);
  const color = new THREE.Color();
  const random = createSeededRandom(seed + 9);
  for (let i = 0; i < position.count; i += 1) {
    const r = Math.hypot(position.getX(i), position.getY(i), position.getZ(i));
    const t = smooth(0.72, 1.18, r);
    color.copy(low).lerp(mid, Math.min(1, t * 1.6));
    color.lerp(high, Math.max(0, t - 0.55) * 1.2);
    const grain = 0.92 + random() * 0.16;
    colors[i * 3] = color.r * grain;
    colors[i * 3 + 1] = color.g * grain;
    colors[i * 3 + 2] = color.b * grain;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export class EnemyMirror {
  constructor(THREE, scene, seeded) {
    this.THREE = THREE;
    this.scene = scene;
    this.seeded = seeded;
    this.views = new Map();
    this.pools = new Map();
    this.frame = 0;

    this.rockGeometries = [];
    for (let i = 0; i < ROCK_SHAPES; i += 1) {
      const seed = 11.3 + i * 7.77;
      const geometry = createAsteroidGeometry(THREE, seed, {
        detail: ROCK_DETAIL,
      });
      paintRock(THREE, geometry, seed);
      this.rockGeometries.push(geometry);
    }

    // Matte mass (docs/NORTE.md §2): the eye/core is the only light.
    this.hullMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.hullLit,
      metalness: 0.2,
      roughness: 0.85,
    });
    this.plateMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.hullLit,
      metalness: 0.2,
      roughness: 0.85,
      flatShading: true,
    });
    this.darkMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.hull,
      metalness: 0.3,
      roughness: 0.8,
    });
    this.rimMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(PALETTE.threat).multiplyScalar(1.1),
      toneMapped: false,
    });

    const circle = [];
    for (let i = 0; i < 48; i += 1) {
      const a = (i / 48) * Math.PI * 2;
      circle.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    this.circleRim = new THREE.BufferGeometry().setFromPoints(circle);
    this.sphere = new THREE.SphereGeometry(1, 20, 12);
    this.smallSphere = new THREE.SphereGeometry(1, 10, 8);

    const seekerShape = new THREE.Shape();
    const seekerOutline = [
      [1.35, 0],
      [0.35, 0.5],
      [-0.85, 0.42],
      [-1.1, 0],
      [-0.85, -0.42],
      [0.35, -0.5],
    ];
    seekerOutline.forEach(([x, y], i) =>
      i ? seekerShape.lineTo(x, y) : seekerShape.moveTo(x, y)
    );
    seekerShape.closePath();
    this.seekerHull = new THREE.ExtrudeGeometry(seekerShape, {
      depth: 0.42,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.06,
      bevelSegments: 1,
    });
    // ridge along the spine, so the key light breaks the top into facets
    const hull = this.seekerHull.getAttribute('position');
    for (let i = 0; i < hull.count; i += 1) {
      const z = hull.getZ(i);
      if (z > 0)
        hull.setZ(i, z * (1 - 0.6 * Math.min(1, Math.abs(hull.getY(i)) / 0.5)));
    }
    this.seekerHull.rotateX(-Math.PI / 2);
    this.seekerHull.computeVertexNormals();
    this.seekerRim = new THREE.BufferGeometry().setFromPoints(
      seekerOutline.map(([x, y]) => new THREE.Vector3(x * 1.12, 0.05, y * 1.12))
    );

    this.strut = new THREE.CylinderGeometry(0.07, 0.07, 0.6, 6);
    this.strut.rotateZ(Math.PI / 2);
    this.strut.translate(0.72, 0, 0);

    const arc = ((Math.PI * 2) / WARDEN_SEGMENTS) * 0.8;
    // diamond cross-section, flattened: machined plates, not a tube
    this.wardenSegment = new THREE.TorusGeometry(1, 0.22, 4, 10, arc);
    this.wardenSegment.rotateX(Math.PI / 2);
    this.wardenSegment.scale(1, 0.55, 1);
    this.wardenSegment.rotateY(-arc / 2);

    // telegraph pieces (flat on the field plane)
    this.lanePlane = new THREE.PlaneGeometry(1, 1);
    this.lanePlane.rotateX(-Math.PI / 2);
    this.lanePlane.translate(0.5, 0, 0);
    this.warnRing = new THREE.RingGeometry(0.94, 1, 64);
    this.warnRing.rotateX(-Math.PI / 2);
    this.fanGeometries = new Map();
  }

  // --- pooling ---------------------------------------------------------------

  acquire(kind) {
    const pool = this.pools.get(kind);
    const view =
      pool && pool.length ? pool.pop() : this.seeded(() => this.create(kind));
    view.object.visible = true;
    return view;
  }

  create(kind) {
    switch (kind) {
      case 'asteroid':
        return this.createRock();
      case 'drone':
        return this.createMote();
      case 'hunter':
        return this.createSeeker();
      case 'mine':
        return this.createTether();
      case 'boss':
        return this.createWarden();
      default:
        return this.createMote();
    }
  }

  emissive(hex, gain) {
    const material = new this.THREE.MeshBasicMaterial({ toneMapped: false });
    material.userData.base = new this.THREE.Color(hex);
    material.color.copy(material.userData.base).multiplyScalar(gain);
    return material;
  }

  setGain(material, gain) {
    material.color.copy(material.userData.base).multiplyScalar(gain);
  }

  createRock() {
    const { THREE } = this;
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.04,
    });
    material.userData.rockUniforms = {
      uGlow: { value: 0 },
      uReveal: { value: 0 },
      uWidth: { value: 0.05 },
      uFlash: { value: 0 },
      uVein: { value: new THREE.Color(PALETTE.shot) },
      uSeed: { value: new THREE.Vector3() },
    };
    material.onBeforeCompile = patchRockShader;
    const mesh = new THREE.Mesh(this.rockGeometries[0], material);
    mesh.rotation.order = 'YXZ';
    this.scene.add(mesh);
    return { kind: 'asteroid', object: mesh, material, id: null };
  }

  createMote() {
    const { THREE } = this;
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.sphere, this.hullMaterial);
    body.scale.set(1, 0.42, 1);
    const eye = new THREE.Mesh(
      this.smallSphere,
      this.emissive(PALETTE.threat, 1.4)
    );
    eye.scale.setScalar(0.22);
    eye.position.set(0.7, 0.16, 0);
    const rim = new THREE.LineLoop(this.circleRim, this.rimMaterial);
    rim.scale.setScalar(1.04);
    group.add(body, eye, rim);
    this.scene.add(group);
    return { kind: 'drone', object: group, body, id: null };
  }

  createSeeker() {
    const { THREE } = this;
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.seekerHull, this.hullMaterial);
    const lensMaterial = this.emissive(PALETTE.threat, 0.5);
    const lens = new THREE.Mesh(this.smallSphere, lensMaterial);
    lens.scale.setScalar(0.2);
    lens.position.set(1.12, 0.3, 0);
    const rim = new THREE.LineLoop(this.seekerRim, this.rimMaterial);
    group.add(body, lens, rim);
    this.scene.add(group);
    return { kind: 'hunter', object: group, lensMaterial, id: null };
  }

  createTether() {
    const { THREE } = this;
    const group = new THREE.Group();
    const spin = new THREE.Group();
    const core = new THREE.Mesh(this.sphere, this.darkMaterial);
    core.scale.setScalar(0.5);
    spin.add(core);
    const nodeMaterial = this.emissive(PALETTE.threat, 0.6);
    const tips = [];
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2;
      const strut = new THREE.Mesh(this.strut, this.hullMaterial);
      strut.rotation.y = angle;
      const node = new THREE.Mesh(this.smallSphere, nodeMaterial);
      node.scale.setScalar(0.15);
      node.position.set(Math.cos(angle) * 1.05, 0, -Math.sin(angle) * 1.05);
      tips.push(node.position.clone());
      spin.add(strut, node);
    }
    const arcMaterial = new THREE.LineBasicMaterial({ toneMapped: false });
    arcMaterial.userData.base = new THREE.Color(PALETTE.threat);
    const arc = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(tips),
      arcMaterial
    );
    spin.add(arc);
    const rim = new THREE.LineLoop(this.circleRim, this.rimMaterial);
    rim.scale.setScalar(1.2);
    group.add(spin, rim);
    this.scene.add(group);
    return {
      kind: 'mine',
      object: group,
      spin,
      nodeMaterial,
      arc,
      arcMaterial,
      id: null,
    };
  }

  createWarden() {
    const { THREE } = this;
    const group = new THREE.Group();
    const ring = new THREE.Group();
    const segments = [];
    for (let i = 0; i < WARDEN_SEGMENTS; i += 1) {
      const segment = new THREE.Mesh(this.wardenSegment, this.plateMaterial);
      segment.rotation.y = (i / WARDEN_SEGMENTS) * Math.PI * 2;
      segments.push(segment);
      ring.add(segment);
    }
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: '#120a1a',
      emissive: PALETTE.boss,
      emissiveIntensity: 1.3,
      roughness: 0.35,
      metalness: 0.2,
    });
    coreMaterial.onBeforeCompile = patchHotCore;
    const core = new THREE.Mesh(this.sphere, coreMaterial);
    core.scale.setScalar(0.45);
    const rim = new THREE.LineLoop(
      this.circleRim,
      new THREE.LineBasicMaterial({
        color: new THREE.Color(PALETTE.boss).multiplyScalar(1.2),
        toneMapped: false,
      })
    );
    rim.scale.setScalar(1.24);
    group.add(ring, core, rim);
    this.scene.add(group);

    const additive = (hex) =>
      new THREE.MeshBasicMaterial({
        color: hex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
    const telegraph = new THREE.Group();
    const lane = new THREE.Mesh(this.lanePlane, additive(PALETTE.threat));
    const line = new THREE.Mesh(this.lanePlane, additive(PALETTE.threat));
    const fan = new THREE.Mesh(this.lanePlane, additive(PALETTE.threat));
    const warn = new THREE.Mesh(this.warnRing, additive(PALETTE.threat));
    telegraph.add(lane, line, fan, warn);
    telegraph.visible = false;
    this.scene.add(telegraph);

    return {
      kind: 'boss',
      object: group,
      ring,
      segments,
      core,
      coreMaterial,
      telegraph: { group: telegraph, lane, line, fan, warn },
      id: null,
    };
  }

  // --- per frame -------------------------------------------------------------

  /** Mirrors `enemies`; returns the Warden view (for its light) or null. */
  update(enemies, time) {
    this.frame += 1;
    let warden = null;
    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      if (!enemy || enemy.destroyed) continue;
      const key = enemy.id || enemy;
      const kind = KNOWN_KINDS.has(enemy.type) ? enemy.type : 'drone';
      let view = this.views.get(key);
      if (view && view.kind !== kind) {
        this.release(key, view);
        view = null;
      }
      if (!view) {
        view = this.acquire(kind);
        view.id = key;
        view.seed = hashId(key);
        this.bind(view, enemy);
        this.views.set(key, view);
      }
      view.stamp = this.frame;
      const { object } = view;
      object.position.set(enemy.x - HALF_W, 0, enemy.y - HALF_H);
      const flash = enemy.getHitFlash();
      if (kind === 'asteroid') this.updateRock(view, enemy, time, flash);
      else if (kind === 'boss') {
        this.updateWarden(view, enemy, time);
        warden = view;
      } else {
        object.scale.setScalar(enemy.radius || 12);
        object.rotation.y = -(enemy.rotation || 0);
        if (kind === 'hunter') {
          this.setGain(
            view.lensMaterial,
            0.5 + 1.3 * (enemy.telegraphRatio || 0)
          );
        } else if (kind === 'mine') {
          const armed = Boolean(enemy.armed);
          const pulse = 0.5 + 0.5 * Math.sin(time * 9 + (view.seed % 7));
          this.setGain(view.nodeMaterial, armed ? 1.1 + 0.6 * pulse : 0.6);
          view.arc.visible = armed;
          this.setGain(view.arcMaterial, 1.1 + 0.6 * pulse);
          view.spin.rotation.y = time * (armed ? 2.4 : 0.8);
        }
      }
    }

    this.views.forEach((view, key) => {
      if (view.stamp !== this.frame) this.release(key, view);
    });
    return warden;
  }

  bind(view, enemy) {
    if (view.kind !== 'asteroid') return;
    const seed = view.seed;
    view.object.geometry = this.rockGeometries[seed % ROCK_SHAPES];
    const random = createSeededRandom((seed % 100000) + 1);
    view.spinRate = (0.25 + random() * 0.5) * (random() < 0.5 ? -1 : 1);
    view.spinPhase = random() * Math.PI * 2;
    view.lean = (random() - 0.5) * 1.2;
    const variant = ROCK_VARIANTS[enemy.variant] || ROCK_VARIANTS.common;
    view.variant = variant;
    const { material } = view;
    material.color.setRGB(variant.tint[0], variant.tint[1], variant.tint[2]);
    material.roughness = variant.roughness ?? 0.94;
    material.metalness = variant.metalness ?? 0.04;
    const uniforms = material.userData.rockUniforms;
    uniforms.uVein.value.set(variant.vein || PALETTE.shot);
    uniforms.uSeed.value.set(random() * 50, random() * 50, random() * 50);
  }

  updateRock(view, enemy, time, flash) {
    const { object, variant } = view;
    object.scale.setScalar((enemy.radius || 12) * ROCK_SCALE);
    object.rotation.y = -(enemy.rotation || 0);
    object.rotation.x = view.spinPhase + time * view.spinRate;
    object.rotation.z = view.lean;
    const stage = Math.max(0, Math.min(3, enemy.crackStage || 0));
    let glow = CRACK_GLOW[stage];
    let reveal = CRACK_REVEAL[stage];
    if (variant.vein) {
      const pulse = variant.pulse
        ? 1 + variant.pulse * Math.sin(time * 5 + view.spinPhase)
        : 1;
      glow = Math.max(glow, variant.veinGlow * pulse);
      reveal = Math.max(reveal, 0.45);
    }
    const uniforms = view.material.userData.rockUniforms;
    uniforms.uGlow.value = glow;
    uniforms.uReveal.value = reveal;
    uniforms.uWidth.value = 0.035 + stage * 0.012;
    uniforms.uFlash.value = flash * 0.45;
  }

  updateWarden(view, boss, time) {
    const radius = boss.radius || 60;
    view.object.scale.setScalar(radius);
    view.object.rotation.y = -(boss.rotation || 0);
    view.ring.rotation.y = time * 0.35;
    const phase = Math.max(0, boss.currentPhase || 0);
    const intact = Math.max(1, WARDEN_SEGMENTS - phase * 2);
    for (let i = 0; i < view.segments.length; i += 1) {
      view.segments[i].visible = i < intact;
    }
    view.core.scale.setScalar(0.45 + phase * 0.08);
    const flash = boss.getHitFlash();
    view.coreMaterial.emissiveIntensity =
      1.25 + 0.25 * Math.sin(time * 3) + phase * 0.2 + flash * 0.8;
    this.updateTelegraph(view.telegraph, boss, radius);
  }

  fanGeometry(arc) {
    const key = Math.round(arc * 100);
    let geometry = this.fanGeometries.get(key);
    if (!geometry) {
      geometry = this.seeded(
        () => new this.THREE.CircleGeometry(1, 32, -arc / 2, arc)
      );
      geometry.rotateX(-Math.PI / 2);
      this.fanGeometries.set(key, geometry);
    }
    return geometry;
  }

  // Charge lane / spread fan on the field plane, same timing as the 2D path
  // (EffectsSystem.drawTelegraphs).
  updateTelegraph(parts, boss, radius) {
    const t = boss.telegraph;
    parts.group.visible = Boolean(t);
    if (!t) return;
    const duration = t.duration > 0 ? t.duration : 1;
    const progress = Math.min(1, Math.max(0, 1 - t.timer / duration));
    const pulse = 0.5 + 0.5 * Math.sin(progress * Math.PI * 6);
    const r = Math.max(20, radius);
    parts.group.position.set(boss.x - HALF_W, 1, boss.y - HALF_H);
    parts.group.rotation.y = -(t.angle || 0);
    const charge = t.type === 'charge';
    parts.lane.visible = charge;
    parts.line.visible = charge;
    parts.fan.visible = t.type === 'fan';
    if (charge) {
      const length = Math.max(r * 2, t.length || 400);
      parts.lane.scale.set(length, 1, r * 1.8);
      parts.lane.material.opacity = 0.08 + 0.18 * progress;
      parts.line.scale.set(length, 1, 2);
      parts.line.material.opacity = 0.35 + 0.55 * progress;
    } else if (t.type === 'fan') {
      const arc = Math.max(0.1, t.arc || 0.8);
      const length = Math.max(r * 1.5, t.length || 180);
      parts.fan.geometry = this.fanGeometry(arc);
      parts.fan.scale.set(length, 1, length);
      parts.fan.material.opacity = 0.07 + 0.2 * progress;
    }
    const ring = r * (1.15 + 0.1 * pulse);
    parts.warn.scale.set(ring, 1, ring);
    parts.warn.material.opacity = (0.2 + 0.5 * progress) * (0.6 + 0.4 * pulse);
  }

  release(key, view) {
    view.object.visible = false;
    if (view.telegraph) view.telegraph.group.visible = false;
    this.views.delete(key);
    let pool = this.pools.get(view.kind);
    if (!pool) {
      pool = [];
      this.pools.set(view.kind, pool);
    }
    pool.push(view);
  }

  clear() {
    this.views.forEach((view, key) => this.release(key, view));
  }
}
