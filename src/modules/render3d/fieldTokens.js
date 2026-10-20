// The field's pickups as real bodies, instanced (fieldMirrors.js,
// pickupMirror.js): an XP orb is a faceted crystal of light that turns,
// bigger and with more shards round it at a higher tier; a health heart is a
// puffy heart of light; a pickup token is a machined puck with its glyph
// raised on top, a lit rim and a hover lens underneath. One draw per batch,
// whatever the count; an empty batch is hidden.

import { PALETTE } from '../../data/constants/palette.js';
import { HALF_H, HALF_W, colorOf } from './batches.js';
import { revolve, skin, sweep } from './enemies/shapes.js';
import { mergeStatic } from './mergeStatic.js';

const TAU = Math.PI * 2;
// XP_ORB_MAX_PER_CLASS × the six orb classes
export const ORB_CAP = 600;
export const HEART_CAP = 32;

/**
 * An InstancedMesh refilled every frame: a pose and a colour per instance
 * (linear, may pass 1 to bloom). `order`: the pose's Euler order ('YXZ'
 * tips first, then turns about the field's up).
 */
export class InstanceBatch {
  constructor(THREE, geometry, material, capacity, order = 'ZXY') {
    this.capacity = capacity;
    this.count = 0;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
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
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.euler = new THREE.Euler(0, 0, 0, order);
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3();
  }

  begin() {
    this.count = 0;
  }

  /**
   * Logical (x, y) at height `h`, turned `yaw` about its own up axis, then
   * tipped by `pitch` (about x) and `roll` (about z); uniform `scale`;
   * colour `rgb` × `gain`. Its index, or −1 when the batch is full.
   */
  push(x, y, h, yaw, pitch, roll, scale, rgb, gain) {
    if (this.count >= this.capacity) return -1;
    const i = this.count;
    this.position.set(x - HALF_W, h, y - HALF_H);
    this.quaternion.setFromEuler(this.euler.set(pitch, yaw, roll));
    this.scale.setScalar(scale);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.mesh.setMatrixAt(i, this.matrix);
    const color = this.mesh.instanceColor.array;
    color[i * 3] = rgb[0] * gain;
    color[i * 3 + 1] = rgb[1] * gain;
    color[i * 3 + 2] = rgb[2] * gain;
    this.count += 1;
    return i;
  }

  /** Uploads what was pushed (`extra`: more per-instance attributes). */
  end(extra) {
    const n = this.count;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (!n) return;
    upload(this.mesh.instanceMatrix, n);
    upload(this.mesh.instanceColor, n);
    if (extra) upload(extra, n);
  }
}

function upload(attribute, n) {
  attribute.updateRange.offset = 0;
  attribute.updateRange.count = n * attribute.itemSize;
  attribute.needsUpdate = true;
}

// Light from within: each face between a deep, saturated tone (turned from
// the camera and the key light) and the full one (facing either), a bright
// fresnel edge so the volume reads against the dark field from any side,
// and a white glint where a face mirrors the key light. The tone is the
// instance colour; unlit by the scene, never tone-mapped.
// SATELLITES: a shard (aSat.w = 1..3) grows from its centre aSat.xyz as the
// instance's aRich climbs past (w − 1) / 3.
const ENERGY_VERTEX = `
#ifdef SATELLITES
attribute vec4 aSat;
attribute float aRich;
#endif
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vTone;
void main() {
  vec3 p = position;
#ifdef SATELLITES
  float grow = aSat.w < 0.5 ? 1.0 : clamp(aRich * 3.0 - aSat.w + 1.0, 0.0, 1.0);
  p = aSat.xyz + (p - aSat.xyz) * grow;
#endif
  mat4 model = modelMatrix * instanceMatrix;
  vec4 world = model * vec4(p, 1.0);
  vNormal = normalize(mat3(model) * normal);
  vView = cameraPosition - world.xyz;
  vTone = instanceColor;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const ENERGY_FRAGMENT = `
uniform vec3 uKey;
uniform float uLook[5];
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vTone;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vView);
  float facing = abs(dot(n, v));
  float key = max(dot(n, uKey), 0.0);
  float glint = pow(max(dot(reflect(-uKey, n), v), 0.0), 18.0);
  vec3 deep = vTone * vTone * 0.25;
  float lit = uLook[0] + uLook[1] * facing + uLook[2] * key;
  vec3 c = mix(deep, vTone, lit)
    + vTone * (uLook[3] * pow(1.0 - facing, 3.0))
    + vec3(uLook[4] * glint);
  gl_FragColor = vec4(c, 1.0);
}`;

// proposta 19/10: [base, toward the camera, toward the key light, fresnel
// edge, glint]
const CRYSTAL_LOOK = [0, 0.3, 0.8, 0.6, 1];
const HEART_LOOK = [0.1, 0.5, 0.45, 0.7, 0.45];

function energyMaterial(THREE, keyDir, look, satellites = false) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uKey: { value: keyDir.clone().normalize() },
      uLook: { value: look },
    },
    defines: satellites ? { SATELLITES: 1 } : {},
    vertexShader: ENERGY_VERTEX,
    fragmentShader: ENERGY_FRAGMENT,
  });
}

// --- XP orbs ------------------------------------------------------------------

// A pointed gem about `centre`: a ring of `sides` at `r` (the lower one a
// half step round, `waist` apart) between a point `top` above and one
// `bottom` below, its axis tipped by `tilt` (a quaternion). Triangles as
// Vector3 triples, wound outward.
function gem(THREE, { sides, r, top, bottom, waist = 0, centre, tilt }) {
  const up = new THREE.Vector3(0, top, 0);
  const down = new THREE.Vector3(0, bottom, 0);
  const ring = (y, turn) =>
    Array.from({ length: sides }, (_, k) => {
      const a = ((k + turn) / sides) * TAU;
      return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    });
  const high = ring(waist / 2, 0);
  const low = waist ? ring(-waist / 2, 0.5) : high;
  const tris = [];
  for (let k = 0; k < sides; k += 1) {
    const k1 = (k + 1) % sides;
    tris.push([up, high[k], high[k1]], [down, low[k], low[k1]]);
    if (waist)
      tris.push([high[k], low[k], high[k1]], [high[k1], low[k], low[k1]]);
  }
  const placed = tris.map((t) =>
    t.map((p) => p.clone().applyQuaternion(tilt).add(centre))
  );
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  placed.forEach((t) => {
    a.subVectors(t[1], t[0]).cross(b.subVectors(t[2], t[0]));
    b.addVectors(t[0], t[1]).add(t[2]).divideScalar(3).sub(centre);
    if (a.dot(b) < 0) [t[1], t[2]] = [t[2], t[1]];
  });
  return placed;
}

// proposta 19/10: the three shards round the gem, [angle, out, height].
const SHARDS = [
  [0.35, 1.0, 0.35],
  [2.45, 1.05, -0.3],
  [4.4, 0.95, 0.05],
];

/**
 * The XP crystal, long axis up (about 2.5 tall, 1.25 across): a six-sided
 * gem with a twisted waist, its upper point the longer, and three small
 * shards leaning out round it that a higher tier grows (aSat, see
 * ENERGY_VERTEX). Flat faces, 48 triangles.
 */
export function crystalGeometry(THREE) {
  const none = new THREE.Quaternion();
  const origin = new THREE.Vector3();
  const parts = [
    { n: 0, centre: origin, tris: [] },
    ...SHARDS.map(([angle, out, height], k) => ({
      n: k + 1,
      centre: new THREE.Vector3(
        Math.cos(angle) * out,
        height,
        Math.sin(angle) * out
      ),
      angle,
    })),
  ];
  parts[0].tris = gem(THREE, {
    sides: 6,
    r: 0.62,
    top: 1.45,
    bottom: -1.0,
    waist: 0.42,
    centre: origin,
    tilt: none,
  });
  for (let k = 1; k < parts.length; k += 1) {
    const part = parts[k];
    const tangent = new THREE.Vector3(
      -Math.sin(part.angle),
      0,
      Math.cos(part.angle)
    );
    part.tris = gem(THREE, {
      sides: 4,
      r: 0.17,
      top: 0.48,
      bottom: -0.34,
      centre: part.centre,
      tilt: new THREE.Quaternion().setFromAxisAngle(tangent, -0.45),
    });
  }
  const position = [];
  const normal = [];
  const sat = [];
  const n = new THREE.Vector3();
  const e = new THREE.Vector3();
  parts.forEach(({ n: shard, centre, tris }) => {
    tris.forEach(([a, b, c]) => {
      n.subVectors(b, a).cross(e.subVectors(c, a)).normalize();
      [a, b, c].forEach((p) => {
        position.push(p.x, p.y, p.z);
        normal.push(n.x, n.y, n.z);
        sat.push(centre.x, centre.y, centre.z, shard);
      });
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(position, 3)
  );
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('aSat', new THREE.Float32BufferAttribute(sat, 4));
  return geometry;
}

// proposta 19/10: crystal scale × the orb's drawn size, its turn (rad/s),
// the tilt of its axis and its bob.
const ORB_LOOK = { scale: 0.5, spin: 1.4, tilt: 0.22, bob: 0.8 };

/** The height an orb of drawn size `size` floats at (its glow's too). */
export function orbHeight(size) {
  return 2 + size * 0.65;
}

// By tier (1..6): its shards (aRich × 3: none for the first two, then one
// more per tier up to three) and how bright it burns.
const ORB_RICH = [0, 0, 0, 1 / 3, 2 / 3, 1, 1];
const ORB_GAIN = [1, 1, 1.03, 1.06, 1.1, 1.15, 1.3];

/** Every XP orb's crystal, one draw. */
export class OrbCrystals extends InstanceBatch {
  constructor(THREE, scene, keyDir, capacity = ORB_CAP) {
    const geometry = crystalGeometry(THREE);
    const rich = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity),
      1
    );
    rich.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aRich', rich);
    super(
      THREE,
      geometry,
      energyMaterial(THREE, keyDir, CRYSTAL_LOOK, true),
      capacity
    );
    this.rich = rich;
    this.seeds = new WeakMap();
    this.nextSeed = 0;
    scene.add(this.mesh);
  }

  // A steady phase per orb (its list index shifts as others are taken).
  seedOf(orb) {
    let seed = this.seeds.get(orb);
    if (seed === undefined) {
      this.nextSeed += 1;
      seed = (this.nextSeed * 2.399963) % TAU;
      this.seeds.set(orb, seed);
    }
    return seed;
  }

  /** One orb of `tier` and drawn size `size`, `age` s old, in `rgb`. */
  pushOrb(orb, tier, size, age, rgb) {
    const seed = this.seedOf(orb);
    const t = Math.min(6, Math.max(1, tier));
    const i = this.push(
      orb.x,
      orb.y,
      orbHeight(size) + ORB_LOOK.bob * Math.sin(age * 2.1 + seed),
      age * ORB_LOOK.spin + seed,
      ORB_LOOK.tilt * Math.sin(age * 0.9 + seed),
      ORB_LOOK.tilt * Math.cos(age * 0.7 + seed),
      size * ORB_LOOK.scale,
      rgb,
      ORB_GAIN[t]
    );
    if (i >= 0) this.rich.array[i] = ORB_RICH[t];
  }

  end() {
    super.end(this.rich);
  }
}

// --- health hearts ------------------------------------------------------------

/**
 * A puffy heart lying in the field plane, lobes toward −z (up the screen),
 * 2 across: the classic heart curve inflated into a dome above and a
 * flatter one below, the cleft between the lobes running down both.
 * Smooth, 392 triangles.
 */
export function heartGeometry(THREE) {
  const N = 28;
  const outline = [];
  for (let k = 0; k < N; k += 1) {
    const t = (k / N) * TAU;
    const s = Math.sin(t);
    outline.push([
      s * s * s,
      -(
        13 * Math.cos(t) -
        5 * Math.cos(2 * t) -
        2 * Math.cos(3 * t) -
        Math.cos(4 * t)
      ) / 16,
    ]);
  }
  const zs = outline.map(([, z]) => z);
  const mid = (Math.min(...zs) + Math.max(...zs)) / 2;
  // rings at these angles from the waist (deg): the outline shrinks by the
  // cosine and rises by the sine, more above than below
  const rings = [-72, -42, -12, 16, 40, 61, 80].map((deg) => {
    const a = (deg * Math.PI) / 180;
    const s = Math.cos(a);
    const y = Math.sin(a) * (a > 0 ? 0.55 : 0.32);
    return outline.map(([x, z]) => new THREE.Vector3(x * s, y, (z - mid) * s));
  });
  return skin(THREE, rings, { start: 'smooth', end: 'smooth' });
}

/** The height a heart floats at (its glow's too). */
export const HEART_HEIGHT = 7;

// proposta 19/10: heart scale × its radius, how far its face leans back
// toward the game camera (rad), its sway (rad) and beat.
const HEART_POSE = {
  scale: 0.62,
  lean: 0.45,
  sway: 0.4,
  beat: 0.07,
};

/** Every health heart, one draw. */
export class HeartTokens extends InstanceBatch {
  constructor(THREE, scene, keyDir, capacity = HEART_CAP) {
    super(
      THREE,
      heartGeometry(THREE),
      energyMaterial(THREE, keyDir, HEART_LOOK),
      capacity,
      'YXZ'
    );
    scene.add(this.mesh);
  }

  /** A heart of `radius` at its `phase` (the beat's clock), in `rgb`. */
  pushHeart(x, y, radius, phase, rgb) {
    const p = HEART_POSE;
    this.push(
      x,
      y,
      HEART_HEIGHT + 0.8 * Math.sin(phase * 0.5),
      p.sway * Math.sin(phase * 0.31),
      p.lean + 0.1 * Math.sin(phase * 0.23),
      0.12 * Math.cos(phase * 0.27),
      radius * p.scale * (1 + p.beat * Math.sin(phase)),
      rgb,
      1
    );
  }
}

// --- pickup tokens ------------------------------------------------------------

// The puck every token is built on, radius 1 (× the token's radius): a
// raised lip round a recessed top, a chamfer, a short wall and a smaller
// flat base, round for the Magnet, octagonal for the Pulse, hexagonal for
// the Overcharge, so a kind also reads by its outline from low and from the
// side. PUCK runs from the recess up over the lip and down the outside.
const PUCK = [
  0.66, 0.12, 0.69, 0.17, 0.75, 0.17, 0.88, 0.11, 0.97, 0.03, 0.97, -0.05, 0.84,
  -0.15, 0.5, -0.2,
];
const RECESS = [0.665, 0.12, 0.665, 0.1];
const SOCKET = [0.36, -0.19, 0.3, -0.24, 0.2, -0.25];
const PUCK_SIDES = { magnet: 20, pulse: 8, overcharge: 6 };
const TOP = 0.12;

// Bright parts of the light geometry, × the pickup colour.
const shade = (THREE, k) => new THREE.Color(k, k, k);

function torus(THREE, radius, tube, sides, turn, y) {
  const geometry = new THREE.TorusGeometry(radius, tube, 4, sides);
  geometry.rotateX(-Math.PI / 2);
  geometry.rotateY(turn);
  geometry.translate(0, y, 0);
  return geometry;
}

function sphere(THREE, r, y, squash = 1) {
  const geometry = new THREE.SphereGeometry(r, 12, 6);
  geometry.scale(1, squash, 1);
  geometry.translate(0, y, 0);
  return geometry;
}

// The glyph on top, in the pickup colour; each a solid shape, so it keeps
// its depth seen from low.
const GLYPHS = {
  // a horseshoe magnet, open up the screen, its pole shoes white-hot
  magnet(THREE) {
    const r = 0.34;
    const y = TOP + 0.1;
    const path = [];
    for (let z = -0.4; z < 0; z += 0.2) path.push(new THREE.Vector3(-r, y, z));
    for (let k = 0; k <= 8; k += 1) {
      const a = Math.PI - (k / 8) * Math.PI;
      path.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    for (let z = -0.2; z >= -0.4; z -= 0.2)
      path.push(new THREE.Vector3(r, y, z));
    const tube = 0.1;
    const shoe = (x) => {
      const geometry = new THREE.BoxGeometry(0.24, 0.22, 0.14);
      geometry.translate(x, y, -0.47);
      return geometry;
    };
    return [
      {
        geometry: sweep(
          THREE,
          path,
          (_, a) => [Math.cos(a) * tube, Math.sin(a) * tube],
          6,
          { capped: true }
        ),
        color: shade(THREE, 0.85),
      },
      { geometry: shoe(-r), color: shade(THREE, 1.5) },
      { geometry: shoe(r), color: shade(THREE, 1.5) },
    ];
  },
  // a core of light floating over a ring
  pulse(THREE) {
    return [
      {
        geometry: torus(THREE, 0.4, 0.065, 20, 0, TOP + 0.07),
        color: shade(THREE, 0.85),
      },
      { geometry: sphere(THREE, 0.18, TOP + 0.22), color: shade(THREE, 1.5) },
    ];
  },
  // a lightning bolt, thick enough to stand up from the top
  overcharge(THREE) {
    const s = 0.62;
    const flat = [
      0.25, -1, -0.45, 0.1, 0.05, 0.1, -0.25, 1, 0.45, -0.1, -0.05, -0.1,
    ];
    const shape = new THREE.Shape();
    for (let k = 0; k < flat.length; k += 2) {
      const x = flat[k] * s;
      const z = flat[k + 1] * s;
      if (k === 0) shape.moveTo(x, z);
      else shape.lineTo(x, z);
    }
    shape.closePath();
    const depth = 0.12;
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 1,
    });
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, TOP + depth + 0.03, 0);
    return [{ geometry, color: shade(THREE, 1.1) }];
  },
};

/**
 * A token of `kind`, radius 1: `body`, its matte parts (vertex tones, for a
 * vertex-coloured lit material) and `light`, its glowing ones (vertex
 * brightness, for an unlit material tinted per instance) — the rim on the
 * chamfer, the glyph and the hover lens underneath.
 */
export function tokenParts(THREE, kind) {
  const sides = PUCK_SIDES[kind];
  const round = sides > 8;
  // a flat side, not a corner, toward the camera
  const turn = sides === 8 ? Math.PI / 8 : 0;
  const hull = colorOf(THREE, PALETTE.hull);
  const lit = colorOf(THREE, PALETTE.hullLit);
  const turned = (profile, caps) =>
    revolve(THREE, profile, sides, { from: turn, ...caps });
  const body = mergeStatic(THREE, [
    { geometry: turned(PUCK, { end: 'flat' }), color: lit, flat: !round },
    // the recessed top the glyph stands on, darker
    { geometry: turned(RECESS, { start: 'flat' }), color: hull },
    // the socket the hover lens sits in
    { geometry: turned(SOCKET, { end: 'flat' }), color: hull, flat: !round },
  ]);
  // status slits on the wall, on every other face (four round the round one)
  const count = round ? 4 : sides / 2;
  const wall = 0.97 * (round ? 1 : Math.cos(Math.PI / sides));
  const slits = Array.from({ length: count }, (_, k) => {
    const a = turn + (round ? TAU / 8 : Math.PI / sides) + (k * TAU) / count;
    return {
      geometry: new THREE.BoxGeometry(0.03, 0.035, 0.2),
      position: [Math.cos(a) * wall, -0.01, Math.sin(a) * wall],
      rotationY: -a,
      color: shade(THREE, 0.9),
    };
  });
  const light = mergeStatic(THREE, [
    {
      geometry: torus(THREE, 0.86, 0.04, sides, turn, 0.125),
      color: shade(THREE, 0.8),
    },
    ...slits,
    // underneath: the hover lens and its emitter ring
    { geometry: sphere(THREE, 0.2, -0.25, 0.5), color: shade(THREE, 1) },
    {
      geometry: torus(THREE, 0.44, 0.022, sides, turn, -0.2),
      color: shade(THREE, 0.7),
    },
    ...GLYPHS[kind](THREE),
  ]);
  return { body, light };
}
