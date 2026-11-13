import { PALETTE } from '../../../../data/constants/palette.js';
import { SENTINEL_KINDS } from '../../../../data/enemies/boss.js';
import { HALF_H, HALF_W, colorOf } from '../../batches.js';
import {
  RIM,
  CORE_COLD,
  CORE_HOT,
  CORE_BEAT,
  CORE_FLASH,
  clamp01,
  hex,
  ring,
} from './kit.js';

// proposta 13/11: the fence emitter's size (field px across its node), how
// high it flies on its throw, the drawn fence's half width (px; it hurts
// within `grid.thickness / 2` of its line), and the lattice's cell (px).
const EMITTER = 28;
const THROW_HEIGHT = 46;
const FENCE_HALF = 13;
const CELL = 10;
// The cage's pieces: three sides and the doorway's two stubs.
const PIECES = 6;
// Where the mast's barrel ends, a share of its radius from its centre.
const MUZZLE = 0.47;

// The fences and the locked beam: flat strips on the field, in field px.
// aAlong: px from the strip's start; aLen: its length; aAcross: -1..1
// across it; aEnds: 1 where an end is an emitter (a doorway stub's inner
// end is not).
const STRIP_VERTEX = `
attribute float aAlong;
attribute float aLen;
attribute float aAcross;
attribute vec2 aEnds;
varying float vAlong;
varying float vLen;
varying float vAcross;
varying vec2 vEnds;
void main() {
  vAlong = aAlong;
  vLen = aLen;
  vAcross = aAcross;
  vEnds = aEnds;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// A fence: while it warns, a hair line grows from each emitter (uGrow, px
// reached); solid, a lattice field between two bright rails round a hot
// core, scan pulses running out from the emitters, bright at the emitters
// and at the doorway's jambs; collapsing (uCollapse 0..1) it pulls back
// into the emitters, flickering.
const FENCE_FRAGMENT = `
uniform vec3 uColor;
uniform float uTime;
uniform float uGrow;
uniform float uSolid;
uniform float uCollapse;
uniform float uHalf;
varying float vAlong;
varying float vLen;
varying float vAcross;
varying vec2 vEnds;
float line(float x, float w) {
  return 1.0 - smoothstep(0.0, w, abs(fract(x) - 0.5) * 2.0);
}
void main() {
  float a = abs(vAcross);
  float fromA = vEnds.x > 0.5 ? vAlong : 1e5;
  float fromB = vEnds.y > 0.5 ? vLen - vAlong : 1e5;
  float d = min(fromA, fromB);
  float jamb = min(vEnds.x > 0.5 ? 1e5 : vAlong, vEnds.y > 0.5 ? 1e5 : vLen - vAlong);
  float reach = uGrow * (1.0 - uCollapse);
  if (d > reach) discard;
  float front = exp(-(reach - d) / 6.0) * step(0.001, uCollapse + (1.0 - uSolid));
  float core = exp(-a * a * (uSolid < 0.5 ? 30.0 : 90.0));
  float glow;
  if (uSolid < 0.5) {
    // the projected line: a thread with dashes running out
    float dash = 0.6 + 0.4 * step(0.5, fract(d / 14.0 - uTime * 2.5));
    glow = core * (0.8 * dash + 1.4 * front);
  } else {
    float v = vAcross * uHalf;
    float lattice = max(line((vAlong + v) / ${CELL.toFixed(1)}, 0.18),
      line((vAlong - v) / ${CELL.toFixed(1)}, 0.18));
    float rails = smoothstep(0.72, 0.9, a) * (1.0 - smoothstep(0.92, 1.0, a));
    float scan = pow(0.5 + 0.5 * sin(d * 0.09 - uTime * 9.0), 8.0);
    float fill = 0.07 + 0.5 * lattice * (1.0 - a * 0.5);
    float ends = exp(-d / 8.0) * 1.0 + exp(-jamb / 5.0) * 1.4;
    glow = fill + 0.5 * rails + 0.8 * core + 0.25 * scan * (1.0 - a) + ends * (1.0 - a * 0.5);
    glow += 1.5 * front;
    float flicker = uCollapse > 0.0
      ? 0.6 + 0.4 * step(0.35, fract(sin(floor(uTime * 40.0) + vAlong * 0.05) * 43758.5))
      : 1.0;
    glow *= flicker;
  }
  vec3 hot = mix(uColor, vec3(1.0, 0.82, 0.78), clamp(core * 0.55 + front * 0.4, 0.0, 1.0));
  gl_FragColor = vec4(hot * glow, 1.0);
}
`;

// The locked beam (uMode 0 aim, 1 freeze, 2 burn): a flickering thread
// while it aims, a steady line once frozen, a white-hot core in a red
// sheath as it burns, the burn running out along it from the muzzle.
const BEAM_FRAGMENT = `
uniform vec3 uColor;
uniform float uTime;
uniform float uMode;
uniform float uK;
varying float vAlong;
varying float vLen;
varying float vAcross;
void main() {
  float a = abs(vAcross);
  float glow;
  vec3 tint = uColor;
  if (uMode < 0.5) {
    float tick = step(0.45, fract(vAlong / 18.0 - uTime * 3.0));
    glow = exp(-a * a * 30.0) * (0.15 + 0.35 * uK) * (0.5 + 0.5 * tick);
  } else if (uMode < 1.5) {
    glow = exp(-a * a * 30.0) * (0.8 + 0.2 * sin(uTime * 40.0));
  } else {
    float run = smoothstep(uK * 3.0 * vLen + 40.0, uK * 3.0 * vLen, vAlong);
    float sheath = exp(-a * a * 4.0) * 0.4;
    float core = exp(-a * a * 60.0);
    float ripple = 0.8 + 0.2 * sin(vAlong * 0.12 - uTime * 30.0);
    glow = (sheath * ripple + 1.0 * core) * run;
    tint = mix(uColor, vec3(1.0, 0.85, 0.8), core * 0.5);
  }
  gl_FragColor = vec4(tint * glow, 1.0);
}
`;

export function createInterdictor(sk) {
  const { THREE, kit, recipeViews, panelMaterial, hull, dark, steel, slab } =
    sk;
  const { box, drum, merge, both, soot, paint } = sk;
  // Interdictor: a six-sided watch post: a dark foot with a boundary post at
  // two corners and, at the other four, a fence emitter docked (the cage's
  // own posts: it throws them out), a deck ribbed toward each corner, two
  // vent wells either side of the mast under flaps that open with
  // boss.ventOpen (the plates under them burn hot then), and the mast,
  // which rises with boss.mastRise and carries the beam emitter: a housing
  // with a long barrel and two fins, turned to boss.aimAngle, a charge
  // gathering at its muzzle while a lock aims, its lens hot while it is
  // frozen or burning. On the field (the mirror hides `telegraph.group`):
  // the four emitters (boss.emitters), the fences strung between them
  // (boss.grid) and the locked beam (boss.lock).
  const INTERDICTOR = SENTINEL_KINDS.interdictor;
  const body = merge([
    { geometry: slab(hex(0.92, Math.PI / 6), -0.26, -0.02, 0.05), color: dark },
    { geometry: slab(hex(0.74, Math.PI / 6), -0.04, 0.14, 0.04), color: hull },
    // a boundary post at the two corners without an emitter dock, capped
    // in old paint; a dock plate at the other four
    ...ring(6, 0.84, Math.PI / 6).flatMap(([x, z], i) =>
      i === 1 || i === 4
        ? [
            {
              geometry: drum(0.07, 0.34, 8),
              color: steel,
              position: [x, 0.02, z],
            },
            {
              geometry: drum(0.08, 0.04, 8),
              color: paint,
              position: [x, 0.2, z],
            },
          ]
        : [
            {
              geometry: drum(0.13, 0.05, 8),
              color: soot,
              position: [x, -0.005, z],
            },
          ]
    ),
    // ribs across the deck toward the corners
    ...ring(6, 0.5, Math.PI / 6).map(([x, z, angle]) => ({
      geometry: box(0.36, 0.03, 0.05),
      color: dark,
      position: [x, 0.15, z],
      rotationY: -angle,
    })),
    // the vent wells either side of the mast, and the mast's collar
    ...both({
      geometry: box(0.44, 0.02, 0.24),
      color: soot,
      position: [0, 0.145, 0.2],
    }),
    { geometry: drum(0.14, 0.05, 10), color: dark, position: [0, 0.165, 0] },
  ]);
  const mast = merge([
    {
      geometry: drum(0.085, 0.5, 8, 'y', 0.75),
      color: hull,
      position: [0, 0.25, 0],
    },
    { geometry: drum(0.1, 0.03, 8), color: steel, position: [0, 0.16, 0] },
    { geometry: drum(0.085, 0.03, 8), color: steel, position: [0, 0.4, 0] },
  ]);
  // The emitter, its barrel toward +x.
  const head = merge([
    { geometry: box(0.3, 0.15, 0.2), color: dark },
    { geometry: box(0.12, 0.1, 0.24), color: hull, position: [-0.18, 0, 0] },
    { geometry: drum(0.05, 0.3, 8, 'x'), color: steel, position: [0.28, 0, 0] },
    { geometry: drum(0.07, 0.05, 8, 'x'), color: dark, position: [0.42, 0, 0] },
    ...both({
      geometry: box(0.22, 0.02, 0.1),
      color: steel,
      position: [0.02, 0.05, 0.14],
    }),
  ]);
  const flap = merge([
    { geometry: box(0.44, 0.03, 0.24), color: hull, position: [0, 0, 0.12] },
    {
      geometry: box(0.36, 0.012, 0.03),
      color: paint,
      position: [0, 0.02, 0.2],
    },
  ]);
  const hotPlate = box(0.4, 0.015, 0.2);
  // A fence emitter, a unit across: a node like the place's lattice nodes
  // (a square block turned 45°), four clamp arms out along the cage's
  // sides, a collar, and on top the projector cup (its lens apart, lit).
  const emitterBody = merge([
    { geometry: box(0.62, 0.3, 0.62), color: dark, rotationY: Math.PI / 4 },
    { geometry: box(0.46, 0.08, 0.46), color: steel, position: [0, 0.18, 0] },
    ...[0, 1, 2, 3].map((i) => ({
      geometry: box(0.5, 0.1, 0.1),
      color: hull,
      position: [
        Math.cos((i * Math.PI) / 2) * 0.42,
        0.02,
        Math.sin((i * Math.PI) / 2) * 0.42,
      ],
      rotationY: (-i * Math.PI) / 2,
    })),
    { geometry: drum(0.2, 0.16, 8), color: hull, position: [0, 0.3, 0] },
    { geometry: drum(0.22, 0.04, 8), color: paint, position: [0, 0.4, 0] },
  ]);
  const emitterLens = drum(0.14, 0.05, 8);
  emitterLens.translate(0, 0.43, 0);
  const LIGHTS = Object.freeze({
    parts: [],
    lights: [{ at: [0, 0.2, 0], dir: [0, 1, 0], size: 0.04 }],
  });
  const threat = colorOf(THREE, PALETTE.threat);

  // A strip mesh of `count` quads, rebuilt each frame on the field.
  function stripMesh(count, fragmentShader, uniforms) {
    const geometry = new THREE.BufferGeometry();
    const attribute = (size) => {
      const a = new THREE.BufferAttribute(
        new Float32Array(count * 4 * size),
        size
      );
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    geometry.setAttribute('position', attribute(3));
    geometry.setAttribute('aAlong', attribute(1));
    geometry.setAttribute('aLen', attribute(1));
    geometry.setAttribute('aAcross', attribute(1));
    geometry.setAttribute('aEnds', attribute(2));
    const index = [];
    for (let i = 0; i < count; i += 1) {
      const o = i * 4;
      index.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
    }
    geometry.setIndex(index);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: threat.clone() },
          uTime: { value: 0 },
          ...uniforms,
        },
        vertexShader: STRIP_VERTEX,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    );
    mesh.frustumCulled = false;
    return mesh;
  }

  // Quad `i` of a strip mesh along (x1, y1) → (x2, y2), `half` px each side,
  // at height `y`.
  function placeStrip(mesh, i, s, half, y, ends = [1, 1]) {
    const { attributes } = mesh.geometry;
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * half;
    const ny = (dx / len) * half;
    const corners = [
      [s.x1 + nx, s.y1 + ny, 0, 1],
      [s.x1 - nx, s.y1 - ny, 0, -1],
      [s.x2 + nx, s.y2 + ny, len, 1],
      [s.x2 - nx, s.y2 - ny, len, -1],
    ];
    corners.forEach(([x, z, along, across], j) => {
      const v = i * 4 + j;
      attributes.position.setXYZ(v, x, y, z);
      attributes.aAlong.setX(v, along);
      attributes.aLen.setX(v, len);
      attributes.aAcross.setX(v, across);
      attributes.aEnds.setXY(v, ends[0], ends[1]);
    });
  }

  function commit(mesh, count) {
    const { attributes } = mesh.geometry;
    ['position', 'aAlong', 'aLen', 'aAcross', 'aEnds'].forEach((name) => {
      attributes[name].needsUpdate = true;
    });
    mesh.geometry.setDrawRange(0, count * 6);
    mesh.visible = count > 0;
  }

  function create(kind) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(body, panelMaterial));
    const lights = recipeViews.lookOf(LIGHTS).create(kind);
    group.add(lights.object);
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, '#1a0608'),
      emissive: threat,
      emissiveIntensity: CORE_COLD,
      roughness: 0.4,
      metalness: 0.1,
    });
    const mastPivot = new THREE.Group();
    mastPivot.position.set(0, 0.14, 0);
    mastPivot.add(new THREE.Mesh(mast, panelMaterial));
    const emitter = new THREE.Group();
    emitter.position.set(0, 0.55, 0);
    emitter.add(new THREE.Mesh(head, panelMaterial));
    const eye = new THREE.Mesh(drum(0.05, 0.02, 8, 'x'), coreMaterial);
    eye.position.set(0.455, 0, 0);
    emitter.add(eye);
    // the charge gathering at the muzzle while a lock aims
    const charge = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshBasicMaterial({
        color: threat.clone(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
    );
    charge.position.set(0.5, 0, 0);
    charge.visible = false;
    emitter.add(charge);
    mastPivot.add(emitter);
    group.add(mastPivot);
    // the hot plate in each vent well, under its flap
    for (const side of [1, -1]) {
      const plate = new THREE.Mesh(hotPlate, coreMaterial);
      plate.position.set(0, 0.158, side * 0.2);
      group.add(plate);
    }
    const flaps = [1, -1].map((side) => {
      const hinge = new THREE.Group();
      hinge.position.set(0, 0.175, side * 0.08);
      if (side < 0) hinge.rotation.y = Math.PI;
      hinge.userData.side = side;
      hinge.add(new THREE.Mesh(flap, panelMaterial));
      group.add(hinge);
      return hinge;
    });
    kit.scene.add(group);
    // On the field, in field px: the emitters (bodies and lit lenses, four
    // instances each), the fences and the beam.
    const field = new THREE.Group();
    field.position.set(-HALF_W, 0, -HALF_H);
    const emitters = new THREE.InstancedMesh(emitterBody, panelMaterial, 4);
    const lensMaterial = new THREE.MeshBasicMaterial({
      color: threat.clone(),
      toneMapped: false,
    });
    const lenses = new THREE.InstancedMesh(emitterLens, lensMaterial, 4);
    [emitters, lenses].forEach((mesh) => {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
    });
    const fences = stripMesh(PIECES, FENCE_FRAGMENT, {
      uGrow: { value: 0 },
      uSolid: { value: 0 },
      uCollapse: { value: 0 },
      uHalf: { value: FENCE_HALF },
    });
    const beam = stripMesh(1, BEAM_FRAGMENT, {
      uMode: { value: 0 },
      uK: { value: 0 },
    });
    field.add(emitters, lenses, fences, beam);
    kit.scene.add(field);
    return {
      kind,
      object: group,
      mastPivot,
      emitter,
      charge,
      flaps,
      coreMaterial,
      rims: [kit.rim(group, kit.circleRim, RIM)],
      rimColor: kit.rimColors.boss,
      glows: lights.lights,
      telegraph: { group: field, emitters, lenses, lensMaterial, fences, beam },
      id: null,
    };
  }

  const matrix = new THREE.Matrix4();
  const spin = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const at = new THREE.Vector3();
  const scale = new THREE.Vector3();

  // The four emitters: docked on its foot, thrown up and out to the cage's
  // corners, home again; their lenses dim docked, hot when out.
  function updateEmitters(view, boss, time) {
    const { emitters, lenses, lensMaterial } = view.telegraph;
    const list = boss.emitters || [];
    const radius = boss.radius || INTERDICTOR.radius;
    const g = boss.grid;
    // a cage closed tight squeezes its emitters together: they draw in
    const tight = g ? 0.45 + 0.55 * clamp01(g.size / (EMITTER * 4)) : 1;
    list.forEach((e, i) => {
      const lift = clamp01(e.lift ?? 0);
      // docked it folds smaller into its dock
      const size = EMITTER * ((e.docked ? 0.7 : tight) + 0.35 * lift);
      at.set(e.x, 0.16 * radius + 4 + lift * THROW_HEIGHT, e.y);
      spin.setFromAxisAngle(up, lift * Math.PI * 1.5 + Math.PI / 4);
      scale.setScalar(size);
      matrix.compose(at, spin, scale);
      emitters.setMatrixAt(i, matrix);
      lenses.setMatrixAt(i, matrix);
    });
    emitters.count = lenses.count = list.length;
    emitters.instanceMatrix.needsUpdate = true;
    lenses.instanceMatrix.needsUpdate = true;
    const out = list.some((e) => !e.docked);
    const beat = 0.5 + 0.5 * Math.sin(time * 14);
    let heat = out ? 1.2 + 0.6 * beat : 0.25;
    if (g?.phase === 'solid') heat = 1.6 + 0.3 * beat;
    if (g?.phase === 'fade') heat = 0.4 + 1.6 * clamp01(g.solid) * beat;
    lensMaterial.color.copy(threat).multiplyScalar(heat);
  }

  // The fences: none while the emitters fly; then the thread grows from
  // each; solid, the lattice field; collapsing, pulled back into them.
  function updateFences(view, boss, time) {
    const { fences } = view.telegraph;
    const g = boss.grid;
    const u = fences.material.uniforms;
    u.uTime.value = time;
    if (!g) {
      commit(fences, 0);
      return;
    }
    const reach = g.full / 2 + 2;
    let grow = reach;
    if (g.phase === 'warn') {
      const elapsed = g.duration - g.timer;
      const k = clamp01((elapsed - (g.deploy ?? 0)) / (g.project || 1));
      grow = k * reach;
    }
    u.uGrow.value = grow;
    u.uSolid.value = g.phase === 'warn' ? 0 : 1;
    u.uCollapse.value = g.phase === 'fade' ? 1 - clamp01(g.solid) : 0;
    const list = (g.fences || []).slice(0, PIECES);
    const sides = list.length >= 5 ? 3 : list.length;
    list.forEach((f, i) => {
      // a doorway stub: its first piece starts at a corner, its second
      // ends at one
      const ends = i < sides ? [1, 1] : i === sides ? [1, 0] : [0, 1];
      const half = g.phase === 'warn' ? 4 : FENCE_HALF;
      placeStrip(fences, i, f, half, 3, ends);
    });
    commit(fences, list.length);
  }

  // The locked beam, from the muzzle to the field's edge, and the charge
  // at the muzzle that tells its rhythm.
  function updateBeam(view, boss, time) {
    const { beam } = view.telegraph;
    const l = boss.lock;
    const u = beam.material.uniforms;
    u.uTime.value = time;
    const radius = boss.radius || INTERDICTOR.radius;
    const duration = l?.duration > 0 ? l.duration : 1;
    const k = l ? clamp01(1 - l.timer / duration) : 0;
    const mode = { aim: 0, freeze: 1, burn: 2 }[l?.phase] ?? -1;
    const { charge } = view;
    charge.visible = mode >= 0;
    if (mode < 0) {
      commit(beam, 0);
      return;
    }
    const size = [
      0.03 + 0.07 * k,
      0.11 + 0.02 * Math.sin(time * 40),
      0.14 * (1 - k) + 0.04,
    ][mode];
    charge.scale.setScalar(size);
    charge.material.color
      .copy(threat)
      .multiplyScalar([0.8 + 1.4 * k, 2.4, 2.8][mode]);
    u.uMode.value = mode;
    u.uK.value = k;
    const from = {
      x: boss.x + Math.cos(l.angle) * MUZZLE * radius,
      y: boss.y + Math.sin(l.angle) * MUZZLE * radius,
    };
    const half = [3, 4, (l.width || 24) * 0.75][mode];
    placeStrip(
      beam,
      0,
      { x1: from.x, y1: from.y, x2: l.x2, y2: l.y2 },
      half,
      3
    );
    commit(beam, 1);
  }

  function update(view, boss, time) {
    const radius = boss.radius || INTERDICTOR.radius;
    view.object.scale.setScalar(radius);
    view.object.rotation.y = 0;
    view.mastPivot.scale.y = Math.max(0.05, clamp01(boss.mastRise ?? 1));
    view.emitter.rotation.y = -(boss.aimAngle ?? 0);
    const vent = clamp01(boss.ventOpen ?? 0);
    view.flaps.forEach((hinge) => {
      hinge.rotation.x = -hinge.userData.side * 1.1 * vent;
    });
    const l = boss.lock;
    const aiming =
      l?.phase === 'aim' ? clamp01(1 - l.timer / (l.duration || 1)) * 0.6 : 0;
    const locked = ['freeze', 'burn'].includes(l?.phase) ? 1 : 0;
    const heat = Math.max(vent, locked, aiming);
    view.coreMaterial.emissiveIntensity =
      CORE_COLD +
      heat * (CORE_HOT + 0.3 * Math.sin(time * CORE_BEAT)) +
      boss.getHitFlash() * CORE_FLASH * (0.2 + heat);
    view.telegraph.group.visible = true;
    updateEmitters(view, boss, time);
    updateFences(view, boss, time);
    updateBeam(view, boss, time);
  }

  return { kind: 'boss-interdictor', create, update };
}
