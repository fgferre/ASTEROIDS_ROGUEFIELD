// Mirrors EnemySystem entities into Three objects (docs/NORTE.md §3): Ring
// fragments as procedural rock meshes whose cracks light up amber with
// damage, and the Wardens' machines (Mote, Seeker, Tether, Husk, Ram, Weaver,
// Bulwark), the three Wardens (Prime, Choir, Null; one view kind each,
// picked by `bossKind`) and the three Heralds (Dust, Heat, Silence, picked by
// `heraldKind`). Views are pooled per kind and keyed by entity id; a
// view not seen in a frame is hidden and returned to its pool, unless its
// enemy was killed (`markDead`): then it burns away first (dissolve.js).

import { IS_DEV } from '../../core/env.js';
import { PALETTE } from '../../data/constants/palette.js';
import { BULWARK_SHIELD_HALF_ARC } from '../../data/enemies/bulwark.js';
import { WARDEN_KINDS } from '../../data/enemies/boss.js';
import { HERALD_KINDS } from '../../data/enemies/herald.js';
import { createAsteroidGeometry, createSeededRandom } from './asteroidMesh.js';
import { bakePlateMaps, bakeRockMaps } from './bakedMaps.js';
import { HALF_H, HALF_W, colorOf } from './batches.js';
import { DissolvePool } from './dissolve.js';
import { addRimLight } from './rimLight.js';

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
// Choir and Null views are drawn in field pixels (their bodies come from the
// boss: `cores`, `plates`); Prime is a unit model scaled by the radius.
const CHOIR_CORE_PX = 28;
const CHOIR_SHARDS = 5;
const NULL_CLOSED_PX = 70;
const BREAK_SECONDS = 1.6;
const WEAVER_ARMS = 3;
const ELITE_DASHES = 6;
const TAU = Math.PI * 2;
// proposta 18/10: chunks a death throws (machines by radius; final Warden).
const BURST_MIN = 6;
const BURST_MAX = 12;
const WARDEN_BURST = 24;
// Heralds: dust motes around the Dust slab; the Silence blink ring starts
// this many radii wide and closes to one.
const DUST_MOTES = 10;
const BLINK_RING_START = 2.2;
export const KNOWN_KINDS = new Set([
  'asteroid',
  'drone',
  'hunter',
  'mine',
  'husk',
  'ram',
  'weaver',
  'bulwark',
  'boss',
]);
// Every view kind create() builds: a Warden's `bossKind` splits 'boss' in
// three; a Herald's `heraldKind` names its view.
export const HERALD_VIEW_KINDS = Object.keys(HERALD_KINDS).map(
  (kind) => `herald-${kind}`
);
export const VIEW_KINDS = [
  ...KNOWN_KINDS,
  'boss-choir',
  'boss-null',
  ...HERALD_VIEW_KINDS,
];

// Variant looks (§3 "Fragmento do Anel"): `base` (sRGB) multiplies the baked
// rock color; veins are the light inside, glowing between `floor` and
// `veinGlow` at `rate` Hz. A Volatile's veins race at `armedRate` once its
// fuse arms; a Parasite's quicken toward `nearRate` as it closes on the player.
// `reveal`/`width` set how much of the crack network the veins light.
// Crystal swaps to a glossy faceted material with a cold rim (`rim`).
export const VARIANT_LOOKS = {
  common: { base: '#ffffff', roughness: 0.94, metalness: 0.04 },
  iron: { base: '#f4f7ff', roughness: 0.42, metalness: 0.3 },
  denseCore: { base: '#a4b6dc', roughness: 0.7, metalness: 0.12 },
  gold: {
    base: '#ffe6b8',
    roughness: 0.5,
    metalness: 0.3,
    vein: PALETTE.xp,
    veinGlow: 0.9,
    reveal: 1,
    width: 0.03,
  },
  volatile: {
    base: '#f0d2bc',
    roughness: 0.94,
    metalness: 0.04,
    vein: PALETTE.shot,
    veinGlow: 1.3,
    floor: 0.35,
    rate: 0.9,
    armedRate: 4,
    reveal: 0.5,
    width: 0.065,
  },
  parasite: {
    base: '#dcbcc4',
    roughness: 0.9,
    metalness: 0.06,
    vein: PALETTE.threat,
    veinGlow: 1.2,
    floor: 0.25,
    rate: 0.7,
    nearRate: 2.6,
    reveal: 0.5,
    width: 0.05,
  },
  crystal: {
    base: '#86b8e8',
    roughness: 0.2,
    metalness: 0.05,
    vein: '#bfe8ff',
    veinGlow: 0.45,
    reveal: 0.3,
    width: 0.03,
    rim: 0.5,
    crystal: true,
  },
};
// A Parasite's pulse is at its fastest within this many logical pixels.
const PARASITE_NEAR = 80;
const PARASITE_FAR = 360;
const CRYSTAL_RIM = '#9fdcff';
// Baked surface maps (bakedMaps.js): rock maps tile every 1/ROCK_TILE rock
// radii, sampled triplanar; crystal facets take only a faint normal.
// proposta 18/10: strengths.
const ROCK_TILE = 0.8;
const ROCK_NORMAL_SCALE = 0.9;
const CRYSTAL_NORMAL_SCALE = 0.25;
const ROCK_AO = 0.8;
const PLATE_NORMAL_SCALE = 0.7;
const PLATE_AO = 0.8;
const MAP_SEED = 4242.7;

const ROCK_SHADER_HEAD = `
uniform float uGlow;
uniform float uReveal;
uniform float uWidth;
uniform float uFlash;
uniform vec3 uVein;
uniform vec3 uSeed;
uniform float uRim;
uniform vec3 uRimColor;
varying vec3 vRockPos;
#ifdef ROCK_NORMAL
uniform sampler2D uRockNormalMap;
uniform float uRockNormalScale;
uniform float uRockTile;
varying vec3 vRockNormal;
varying vec3 vRockViewX;
varying vec3 vRockViewY;
varying vec3 vRockViewZ;
#endif
#ifdef ROCK_SURFACE
uniform sampler2D uRockRoughnessMap;
uniform sampler2D uRockAoMap;
uniform float uRockAoIntensity;
#endif
// Triplanar sample of a grey map, planes blended by the object normal.
float rockTriplanar(sampler2D map, vec3 p, vec3 w) {
  return texture2D(map, p.zy).g * w.x + texture2D(map, p.xz).g * w.y
    + texture2D(map, p.xy).g * w.z;
}
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
  const { rockUniforms, rockMaps } = this.userData;
  Object.assign(shader.uniforms, rockUniforms, rockMaps);
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
      varying vec3 vRockPos;
      #ifdef ROCK_NORMAL
      varying vec3 vRockNormal;
      varying vec3 vRockViewX;
      varying vec3 vRockViewY;
      varying vec3 vRockViewZ;
      #endif`
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vRockPos = position;
      #ifdef ROCK_NORMAL
      vRockNormal = objectNormal;
      vRockViewX = normalMatrix[0];
      vRockViewY = normalMatrix[1];
      vRockViewZ = normalMatrix[2];
      #endif`
    );
  // Baked maps (rock geometry has no UVs): triplanar in object space, the
  // detail normal added to the shaded normal (flat crystal facets keep their
  // facets), roughness and AO multiplied into what the material sets.
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${ROCK_SHADER_HEAD}`)
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      #ifdef ROCK_NORMAL
      vec3 rockN = normalize(vRockNormal);
      vec3 rockP = vRockPos * uRockTile;
      vec3 rockW = pow(abs(rockN), vec3(4.0));
      rockW /= rockW.x + rockW.y + rockW.z;
      #endif
      #ifdef ROCK_SURFACE
      roughnessFactor *= rockTriplanar(uRockRoughnessMap, rockP, rockW);
      float rockAo = rockTriplanar(uRockAoMap, rockP, rockW);
      #endif`
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      #ifdef ROCK_NORMAL
      {
        vec3 tx = texture2D(uRockNormalMap, rockP.zy).xyz * 2.0 - 1.0;
        vec3 ty = texture2D(uRockNormalMap, rockP.xz).xyz * 2.0 - 1.0;
        vec3 tz = texture2D(uRockNormalMap, rockP.xy).xyz * 2.0 - 1.0;
        tx.xy *= uRockNormalScale;
        ty.xy *= uRockNormalScale;
        tz.xy *= uRockNormalScale;
        // whiteout blend per plane, swizzled back to object axes
        vec3 nx = vec3(tx.xy + rockN.zy, abs(tx.z) * rockN.x);
        vec3 ny = vec3(ty.xy + rockN.xz, abs(ty.z) * rockN.y);
        vec3 nz = vec3(tz.xy + rockN.xy, abs(tz.z) * rockN.z);
        vec3 detail = normalize(nx.zyx * rockW.x + ny.xzy * rockW.y + nz * rockW.z);
        mat3 toView = mat3(vRockViewX, vRockViewY, vRockViewZ);
        normal = normalize(normal + normalize(toView * detail)
          - normalize(toView * rockN));
      }
      #endif`
    )
    .replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
      #ifdef ROCK_SURFACE
      float rockOcclusion = mix(1.0, rockAo, uRockAoIntensity);
      reflectedLight.indirectDiffuse *= rockOcclusion;
      reflectedLight.directDiffuse *= mix(1.0, rockOcclusion, 0.5);
      #endif`
    )
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
      if (uRim > 0.001) {
        float edge = 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0);
        totalEmissiveRadiance += uRimColor * uRim * pow(edge, 2.2);
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

const clamp01 = (x) => Math.max(0, Math.min(1, x));

function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Bakes per-vertex albedo from relief: crater floors dark, crests lighter.
function paintRock(THREE, geometry, seed) {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const low = colorOf(THREE, PALETTE.rockShadow);
  const mid = colorOf(THREE, PALETTE.rock);
  const high = colorOf(THREE, PALETTE.rockLit);
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
  /** `bursts`: DeathBursts (dissolve.js) for the chunks a death throws. */
  constructor(THREE, scene, seeded, bursts) {
    this.THREE = THREE;
    this.scene = scene;
    this.seeded = seeded;
    this.bursts = bursts;
    this.views = new Map();
    this.pools = new Map();
    this.frame = 0;
    // ids killed since the last frame; their views dissolve instead of
    // vanishing, and stay out of `views` (a reused id gets a fresh view)
    this.dead = new Set();
    this.dissolve = new DissolvePool(THREE, seeded, (view) => this.pool(view));
    this.pruneDead = (key) => {
      if (!this.views.has(key)) this.dead.delete(key);
    };

    this.rockGeometries = [];
    for (let i = 0; i < ROCK_SHAPES; i += 1) {
      const seed = 11.3 + i * 7.77;
      const geometry = createAsteroidGeometry(THREE, seed, {
        detail: ROCK_DETAIL,
      });
      paintRock(THREE, geometry, seed);
      this.rockGeometries.push(geometry);
    }
    const rockMaps = bakeRockMaps(THREE, MAP_SEED);
    const rockNormal = {
      uRockNormalMap: { value: rockMaps.normalMap },
      uRockTile: { value: ROCK_TILE },
    };
    this.stoneMaps = {
      ...rockNormal,
      uRockNormalScale: { value: ROCK_NORMAL_SCALE },
      uRockRoughnessMap: { value: rockMaps.roughnessMap },
      uRockAoMap: { value: rockMaps.aoMap },
      uRockAoIntensity: { value: ROCK_AO },
    };
    this.crystalMaps = {
      ...rockNormal,
      uRockNormalScale: { value: CRYSTAL_NORMAL_SCALE },
    };

    // Matte mass (docs/NORTE.md §2): the eye/core is the only light; a
    // faint key-coloured rim (rimLight.js) keeps machine silhouettes apart
    // from the field. Rocks get none.
    this.hullMaterial = addRimLight(
      new THREE.MeshStandardMaterial({
        color: colorOf(THREE, PALETTE.hullLit),
        metalness: 0.2,
        roughness: 0.85,
      })
    );
    this.plateMaterial = addRimLight(
      new THREE.MeshStandardMaterial({
        color: colorOf(THREE, PALETTE.hullLit),
        metalness: 0.2,
        roughness: 0.85,
        flatShading: true,
      })
    );
    // The Wardens' segments, arms and plates: the plate look plus grooved
    // surface maps on their UVs.
    const plateMaps = bakePlateMaps(THREE, MAP_SEED);
    this.plateMaps = plateMaps;
    // Quality preset: every material that samples baked maps, to toggle.
    this.surfaceMaps = true;
    this.rockMaterials = [];
    // clone() drops the rim patch (and userData functions): add it again
    this.wardenPlateMaterial = addRimLight(this.plateMaterial.clone());
    Object.assign(this.wardenPlateMaterial, plateMaps, {
      normalScale: new THREE.Vector2(PLATE_NORMAL_SCALE, PLATE_NORMAL_SCALE),
      aoMapIntensity: PLATE_AO,
    });
    this.darkMaterial = addRimLight(
      new THREE.MeshStandardMaterial({
        color: colorOf(THREE, PALETTE.hull),
        metalness: 0.3,
        roughness: 0.8,
      })
    );
    this.rimMaterial = new THREE.LineBasicMaterial({
      color: colorOf(THREE, PALETTE.threat).multiplyScalar(1.1),
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
    // Choir: a machined arm from the hub to a core; shards for its break.
    this.choirArm = new THREE.BoxGeometry(1, 0.5, 1);
    this.choirArm.translate(0.5, 0, 0);
    // the arm is drawn ~7× longer than wide: repeat the plate maps along it
    const armUv = this.choirArm.getAttribute('uv');
    for (let i = 0; i < armUv.count; i += 1) armUv.setX(i, armUv.getX(i) * 2);
    this.shard = new THREE.TetrahedronGeometry(1, 0);
    // Null: one curved plate of the shell, centred on its own origin.
    const plateArc = (TAU / 8) * 0.82;
    this.nullPlate = new THREE.TorusGeometry(1, 0.3, 4, 6, plateArc);
    this.nullPlate.rotateX(Math.PI / 2);
    this.nullPlate.scale(1, 0.8, 1);
    this.nullPlate.rotateY(-plateArc / 2);
    this.nullPlate.translate(-1, 0, 0);
    // aoMap reads uv2
    [this.wardenSegment, this.choirArm, this.shard, this.nullPlate].forEach(
      (geometry) => geometry.setAttribute('uv2', geometry.getAttribute('uv'))
    );

    // telegraph pieces (flat on the field plane)
    this.lanePlane = new THREE.PlaneGeometry(1, 1);
    this.lanePlane.rotateX(-Math.PI / 2);
    this.lanePlane.translate(0.5, 0, 0);
    this.warnRing = new THREE.RingGeometry(0.94, 1, 64);
    this.warnRing.rotateX(-Math.PI / 2);
    this.fanGeometries = new Map();

    // Accent energy: threat red, gold on an Elite (RenderComponent accentOf).
    this.threatColor = colorOf(THREE, PALETTE.threat);
    this.bossColor = colorOf(THREE, PALETTE.boss);
    this.bossRimMaterial = new THREE.LineBasicMaterial({
      color: colorOf(THREE, PALETTE.boss).multiplyScalar(1.2),
      toneMapped: false,
    });
    this.goldColor = colorOf(THREE, PALETTE.xp);
    this.eliteRimMaterial = new THREE.LineBasicMaterial({
      color: colorOf(THREE, PALETTE.xp).multiplyScalar(1.1),
      toneMapped: false,
    });
    // dashed, so the slow turn of the Elite ring reads
    this.eliteDash = new THREE.RingGeometry(
      1.22,
      1.27,
      8,
      1,
      0,
      (TAU / ELITE_DASHES) * 0.62
    );
    this.eliteDash.rotateX(-Math.PI / 2);
    this.eliteDashMaterial = new THREE.MeshBasicMaterial({
      color: colorOf(THREE, PALETTE.xp).multiplyScalar(0.9),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    // Husk: faceted carapace, dented so the facets catch the key light
    // unevenly; the dent is a function of position, so the duplicated
    // vertices of the non-indexed polyhedron stay welded.
    this.huskShell = new THREE.IcosahedronGeometry(1, 1);
    const shell = this.huskShell.getAttribute('position');
    for (let i = 0; i < shell.count; i += 1) {
      const x = shell.getX(i);
      const y = shell.getY(i);
      const z = shell.getZ(i);
      const k =
        0.95 + 0.07 * Math.sin(x * 7.1 + z * 3.3) * Math.cos(y * 5.7 + x * 2.1);
      shell.setXYZ(i, x * k, y * k * 0.55, z * k);
    }
    this.huskShell.computeVertexNormals();

    // Ram: arrowhead hull with a raised spine, like the Seeker's.
    const ramOutline = [
      [1.1, 0],
      [-0.8, 0.75],
      [-0.42, 0],
      [-0.8, -0.75],
    ];
    const ramShape = new THREE.Shape();
    ramOutline.forEach(([x, y], i) =>
      i ? ramShape.lineTo(x, y) : ramShape.moveTo(x, y)
    );
    ramShape.closePath();
    this.ramHull = new THREE.ExtrudeGeometry(ramShape, {
      depth: 0.34,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.05,
      bevelSegments: 1,
    });
    const ram = this.ramHull.getAttribute('position');
    for (let i = 0; i < ram.count; i += 1) {
      const z = ram.getZ(i);
      if (z > 0)
        ram.setZ(i, z * (1 - 0.6 * Math.min(1, Math.abs(ram.getY(i)) / 0.75)));
    }
    this.ramHull.rotateX(-Math.PI / 2);
    this.ramHull.computeVertexNormals();
    this.ramRim = new THREE.BufferGeometry().setFromPoints(
      ramOutline.map(([x, y]) => new THREE.Vector3(x * 1.08, 0.05, y * 1.08))
    );

    // Weaver: one arm, trailing the spin (RenderComponent weaverArm).
    const armPoint = (angle, r) =>
      new THREE.Vector3(Math.cos(angle) * r, 0.06, Math.sin(angle) * r);
    this.weaverArm = new THREE.TubeGeometry(
      new THREE.QuadraticBezierCurve3(
        armPoint(0, 0.3),
        armPoint(-0.275, 0.75),
        armPoint(-0.55, 1)
      ),
      10,
      0.07,
      5,
      false
    );
    this.weaverTip = armPoint(-0.55, 1);

    // Bulwark: wide frontal plate (±BULWARK_SHIELD_HALF_ARC) and its rim.
    const half = BULWARK_SHIELD_HALF_ARC;
    const plate = new THREE.Shape();
    plate.absarc(0, 0, 1.02, -half, half, false);
    plate.absarc(0, 0, 0.8, half, -half, true);
    this.bulwarkPlate = new THREE.ExtrudeGeometry(plate, {
      depth: 0.42,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.04,
      bevelSegments: 1,
      curveSegments: 16,
    });
    this.bulwarkPlate.rotateX(-Math.PI / 2);
    this.bulwarkPlate.translate(0, -0.12, 0);
    this.bulwarkEdge = new THREE.RingGeometry(
      0.99,
      1.08,
      16,
      1,
      -half,
      half * 2
    );
    this.bulwarkEdge.rotateX(-Math.PI / 2);
    this.bulwarkEdge.translate(0, 0.37, 0);

    // Heralds. Dust: a chamfered slab, broadside to the ship (local +x),
    // three slits along its face.
    const outline = (points) => {
      const shape = new THREE.Shape();
      points.forEach(([x, y], i) =>
        i ? shape.lineTo(x, y) : shape.moveTo(x, y)
      );
      shape.closePath();
      return shape;
    };
    const slabC = 0.19;
    const slabOutline = [
      [-0.55 + slabC, -1],
      [0.55 - slabC, -1],
      [0.55, -1 + slabC],
      [0.55, 1 - slabC],
      [0.55 - slabC, 1],
      [-0.55 + slabC, 1],
      [-0.55, 1 - slabC],
      [-0.55, -1 + slabC],
    ];
    this.dustSlab = new THREE.ExtrudeGeometry(outline(slabOutline), {
      depth: 0.36,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 1,
    });
    this.dustSlab.rotateX(-Math.PI / 2);
    this.dustSlab.translate(0, -0.18, 0);
    this.dustRim = new THREE.BufferGeometry().setFromPoints(
      slabOutline.map(([x, y]) => new THREE.Vector3(x * 1.06, 0.24, -y * 1.04))
    );
    this.dustSlit = new THREE.BoxGeometry(0.1, 0.04, 0.36);
    // Silence: a tall thin prism with a raised spine (the 2D outline).
    const prismOutline = [
      [0, -1.25],
      [0.36, -0.44],
      [0.36, 0.75],
      [0, 1.25],
      [-0.36, 0.75],
      [-0.36, -0.44],
    ];
    this.silencePrism = new THREE.ExtrudeGeometry(outline(prismOutline), {
      depth: 0.3,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.04,
      bevelSegments: 1,
    });
    const prism = this.silencePrism.getAttribute('position');
    for (let i = 0; i < prism.count; i += 1) {
      const z = prism.getZ(i);
      if (z > 0)
        prism.setZ(
          i,
          z * (1.6 - 1.2 * Math.min(1, Math.abs(prism.getX(i)) / 0.36))
        );
    }
    this.silencePrism.rotateX(-Math.PI / 2);
    this.silencePrism.computeVertexNormals();
    this.silenceRim = new THREE.BufferGeometry().setFromPoints(
      prismOutline.map(([x, y]) => new THREE.Vector3(x * 1.08, 0.02, -y * 1.04))
    );
    // Heat: a matte ring around a dark core, the seam between them.
    this.heatShell = new THREE.TorusGeometry(0.74, 0.22, 8, 40);
    this.heatShell.rotateX(Math.PI / 2);
    this.heatShell.scale(1, 0.7, 1);
    this.heatSeam = new THREE.TorusGeometry(0.5, 0.05, 6, 48);
    this.heatSeam.rotateX(Math.PI / 2);

    // A kind with no look yet: visible, obviously unfinished.
    this.unknownShape = new THREE.OctahedronGeometry(1, 0);
    this.unknownWarned = new Set();
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
      case 'husk':
        return this.createHusk();
      case 'ram':
        return this.createRam();
      case 'weaver':
        return this.createWeaver();
      case 'bulwark':
        return this.createBulwark();
      case 'boss':
      case 'boss-choir':
      case 'boss-null':
        return this.createWarden(kind);
      case 'herald-dust':
        return this.createDust();
      case 'herald-heat':
        return this.createHeat();
      case 'herald-silence':
        return this.createSilence();
      default:
        return this.createUnknown();
    }
  }

  /**
   * Loading-screen warm-up (Renderer3D.warmUp): views of `kind` in every look
   * a run gives it (each rock variant, machines plain and Elite); `compile`
   * runs over them as drawn, then burning (dissolve twins in), and the burn's
   * end pools them, ready for the first spawns.
   */
  warm(kind, compile) {
    const looks =
      kind === 'asteroid'
        ? Object.keys(VARIANT_LOOKS)
        : kind.startsWith('boss') || kind.startsWith('herald')
          ? [false]
          : [false, true];
    const views = looks.map((look, i) => {
      const view = this.acquire(kind);
      view.seed = i;
      this.bind(view, { variant: look });
      if (look === true) this.applyElite(view, true);
      return view;
    });
    compile();
    views.forEach((view) =>
      this.dissolve.start(view, this.accentOf(view), view.radius || 12)
    );
    compile();
    this.dissolve.clear();
    return views;
  }

  kindOf(type, bossKind, heraldKind) {
    if (type === 'boss' && (bossKind === 'choir' || bossKind === 'null')) {
      return `boss-${bossKind}`;
    }
    if (type === 'herald') {
      return `herald-${HERALD_KINDS[heraldKind] ? heraldKind : 'dust'}`;
    }
    if (KNOWN_KINDS.has(type)) return type;
    if (IS_DEV && !this.unknownWarned.has(type)) {
      this.unknownWarned.add(type);
      console.warn(
        `[EnemyMirror] No 3D look for enemy type "${type}"; drawing a placeholder.`
      );
    }
    return 'unknown';
  }

  // Machine views: `accents` are the materials whose base color is the
  // threat/elite accent, `rims` the threat outlines.
  view(kind, object, parts) {
    return {
      kind,
      object,
      id: null,
      elite: false,
      eliteRing: null,
      accents: [],
      rims: [],
      ...parts,
    };
  }

  emissive(hex, gain) {
    const material = new this.THREE.MeshBasicMaterial({ toneMapped: false });
    material.userData.base = colorOf(this.THREE, hex);
    this.setGain(material, gain);
    return material;
  }

  setGain(material, gain) {
    material.userData.gain = gain;
    material.color.copy(material.userData.base).multiplyScalar(gain);
  }

  // Crack-shader uniforms; a rock's stone and crystal materials share them.
  rockUniforms(vein) {
    const { THREE } = this;
    return {
      uGlow: { value: 0 },
      uReveal: { value: 0 },
      uWidth: { value: 0.05 },
      uFlash: { value: 0 },
      uVein: { value: vein },
      uSeed: { value: new THREE.Vector3() },
      uRim: { value: 0 },
      uRimColor: { value: colorOf(THREE, CRYSTAL_RIM) },
    };
  }

  createRock() {
    const { THREE } = this;
    const material = new THREE.MeshStandardMaterial({ vertexColors: true });
    material.userData.rockUniforms = this.rockUniforms(
      colorOf(THREE, PALETTE.shot)
    );
    material.userData.rockMaps = this.stoneMaps;
    material.onBeforeCompile = patchRockShader;
    this.trackSurfaceMaps(material);
    const mesh = new THREE.Mesh(this.rockGeometries[0], material);
    mesh.rotation.order = 'YXZ';
    this.scene.add(mesh);
    return {
      kind: 'asteroid',
      object: mesh,
      material,
      stone: material,
      crystal: null,
      id: null,
    };
  }

  // Crystal: same rock geometry, flat-shaded glossy facets, clear coat.
  createCrystal(view) {
    const material = new this.THREE.MeshPhysicalMaterial({
      vertexColors: true,
      flatShading: true,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    });
    material.userData.rockUniforms = view.stone.userData.rockUniforms;
    material.userData.rockMaps = this.crystalMaps;
    material.onBeforeCompile = patchRockShader;
    this.trackSurfaceMaps(material);
    return material;
  }

  /** Quality preset: baked surface maps on or off (one recompile each). */
  setSurfaceMaps(enabled) {
    if (enabled === this.surfaceMaps) return;
    this.surfaceMaps = enabled;
    this.rockMaterials.forEach((material) => this.applySurfaceMaps(material));
    const plate = this.wardenPlateMaterial;
    Object.keys(this.plateMaps).forEach((name) => {
      plate[name] = enabled ? this.plateMaps[name] : null;
    });
    plate.needsUpdate = true;
  }

  trackSurfaceMaps(material) {
    this.rockMaterials.push(material);
    this.applySurfaceMaps(material);
  }

  // Stone takes normal + roughness/AO; crystal only the faint normal.
  applySurfaceMaps(material) {
    const { defines } = material;
    delete defines.ROCK_NORMAL;
    delete defines.ROCK_SURFACE;
    if (this.surfaceMaps) {
      defines.ROCK_NORMAL = '';
      if (material.userData.rockMaps === this.stoneMaps) {
        defines.ROCK_SURFACE = '';
      }
    }
    material.needsUpdate = true;
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
    return this.view('drone', group, {
      body,
      accents: [eye.material],
      rims: [rim],
    });
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
    return this.view('hunter', group, {
      lensMaterial,
      accents: [lensMaterial],
      rims: [rim],
    });
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
    arcMaterial.userData.base = colorOf(THREE, PALETTE.threat);
    const arc = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(tips),
      arcMaterial
    );
    spin.add(arc);
    const rim = new THREE.LineLoop(this.circleRim, this.rimMaterial);
    rim.scale.setScalar(1.2);
    group.add(spin, rim);
    this.scene.add(group);
    return this.view('mine', group, {
      spin,
      nodeMaterial,
      arc,
      arcMaterial,
      accents: [nodeMaterial, arcMaterial],
      rims: [rim],
    });
  }

  createHusk() {
    const { THREE } = this;
    const group = new THREE.Group();
    // the Ring rock's crack shader on a hull plate: seams instead of veins
    const material = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, PALETTE.hullLit),
      metalness: 0.2,
      roughness: 0.88,
      flatShading: true,
    });
    material.userData.rockUniforms = this.rockUniforms(
      this.threatColor.clone()
    );
    material.onBeforeCompile = patchRockShader;
    addRimLight(material);
    const shell = new THREE.Mesh(this.huskShell, material);
    shell.scale.setScalar(0.95);
    const rim = new THREE.LineLoop(this.circleRim, this.rimMaterial);
    rim.scale.setScalar(0.98);
    group.add(shell, rim);
    this.scene.add(group);
    return this.view('husk', group, { shell, material, rims: [rim] });
  }

  createRam() {
    const { THREE } = this;
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.ramHull, this.hullMaterial);
    const socket = new THREE.Mesh(this.smallSphere, this.darkMaterial);
    socket.scale.set(0.2, 0.06, 0.2);
    socket.position.set(0.45, 0.38, 0);
    const lensMaterial = this.emissive(PALETTE.threat, 0.4);
    const lens = new THREE.Mesh(this.smallSphere, lensMaterial);
    lens.scale.setScalar(0.12);
    lens.position.set(0.45, 0.4, 0);
    const coreMaterial = this.emissive(PALETTE.text, 0);
    const core = new THREE.Mesh(this.smallSphere, coreMaterial);
    core.scale.setScalar(0.07);
    core.position.set(0.45, 0.48, 0);
    const rim = new THREE.LineLoop(this.ramRim, this.rimMaterial);
    group.add(body, socket, lens, core, rim);
    this.scene.add(group);
    return this.view('ram', group, {
      lens,
      lensMaterial,
      core,
      coreMaterial,
      telegraph: this.createTelegraph(),
      accents: [lensMaterial],
      rims: [rim],
    });
  }

  createWeaver() {
    const { THREE } = this;
    const group = new THREE.Group();
    const hub = new THREE.Mesh(this.sphere, this.hullMaterial);
    hub.scale.set(0.34, 0.24, 0.34);
    const socket = new THREE.Mesh(this.smallSphere, this.darkMaterial);
    socket.scale.set(0.14, 0.06, 0.14);
    socket.position.y = 0.2;
    // matte arms that flush with the accent while laying; the emissive
    // color itself is the accent base the Elite swap rewrites
    const armMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, PALETTE.hullLit),
      metalness: 0.3,
      roughness: 0.7,
      emissive: this.threatColor.clone(),
      emissiveIntensity: 0,
    });
    armMaterial.userData.base = armMaterial.emissive;
    addRimLight(armMaterial);
    const tipMaterial = this.emissive(PALETTE.threat, 0.5);
    const spin = new THREE.Group();
    const tips = [];
    for (let i = 0; i < WEAVER_ARMS; i += 1) {
      const arm = new THREE.Group();
      arm.rotation.y = -(i * TAU) / WEAVER_ARMS;
      const tip = new THREE.Mesh(this.smallSphere, tipMaterial);
      tip.position.copy(this.weaverTip);
      arm.add(new THREE.Mesh(this.weaverArm, armMaterial), tip);
      tips.push(tip);
      spin.add(arm);
    }
    const rim = new THREE.LineLoop(this.circleRim, this.rimMaterial);
    rim.scale.setScalar(0.36);
    group.add(hub, socket, spin, rim);
    this.scene.add(group);
    return this.view('weaver', group, {
      spin,
      armMaterial,
      tipMaterial,
      tips,
      accents: [armMaterial, tipMaterial],
      rims: [rim],
    });
  }

  createBulwark() {
    const { THREE } = this;
    const group = new THREE.Group();
    const hull = new THREE.Mesh(this.sphere, this.hullMaterial);
    hull.scale.set(0.72, 0.4, 0.72);
    const cap = new THREE.Mesh(this.smallSphere, this.darkMaterial);
    cap.scale.set(0.4, 0.08, 0.4);
    cap.position.y = 0.34;
    const plate = new THREE.Group();
    const plateMesh = new THREE.Mesh(this.bulwarkPlate, this.plateMaterial);
    const edgeMaterial = this.emissive(PALETTE.threat, 1.2);
    const edge = new THREE.Mesh(this.bulwarkEdge, edgeMaterial);
    plate.add(plateMesh, edge);
    const rim = new THREE.LineLoop(this.circleRim, this.rimMaterial);
    rim.scale.setScalar(0.74);
    group.add(hull, cap, plate, rim);
    this.scene.add(group);
    return this.view('bulwark', group, {
      plate,
      plateMesh,
      edge,
      edgeMaterial,
      accents: [edgeMaterial],
      rims: [rim],
    });
  }

  // --- Heralds ----------------------------------------------------------------

  // Herald rims glow violet: officials of the Ring, not Wardens.
  heraldRim(geometry) {
    return new this.THREE.LineLoop(geometry, this.bossRimMaterial);
  }

  createDust() {
    const { THREE } = this;
    const group = new THREE.Group();
    const slab = new THREE.Mesh(this.dustSlab, this.darkMaterial);
    const slitMaterial = this.emissive(PALETTE.shot, 0.3);
    const slits = [-0.55, 0, 0.55].map((z) => {
      const slit = new THREE.Mesh(this.dustSlit, slitMaterial);
      slit.position.set(0.24, 0.27, z);
      return slit;
    });
    const rim = this.heraldRim(this.dustRim);
    // the haze: a slow ring of faint dust motes, never in the bloom
    const haze = new THREE.Group();
    const hazeMaterial = new THREE.MeshBasicMaterial({
      color: colorOf(THREE, PALETTE.rockLit),
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    });
    const random = createSeededRandom(31.7);
    for (let i = 0; i < DUST_MOTES; i += 1) {
      const mote = new THREE.Mesh(this.smallSphere, hazeMaterial);
      const angle = (i / DUST_MOTES) * TAU + random() * 0.5;
      const reach = 1.0 + random() * 0.5;
      mote.position.set(
        Math.cos(angle) * reach,
        -0.1 + random() * 0.3,
        Math.sin(angle) * reach
      );
      const size = 0.12 + random() * 0.16;
      mote.scale.set(size, size * 0.5, size);
      haze.add(mote);
    }
    group.add(slab, ...slits, rim, haze);
    this.scene.add(group);
    return this.view('herald-dust', group, {
      slitMaterial,
      hazeMaterial,
      haze,
      accents: [slitMaterial],
    });
  }

  createHeat() {
    const { THREE } = this;
    const group = new THREE.Group();
    const shell = new THREE.Mesh(this.heatShell, this.plateMaterial);
    const core = new THREE.Mesh(this.sphere, this.darkMaterial);
    core.scale.set(0.5, 0.3, 0.5);
    const seamMaterial = this.emissive(PALETTE.shot, 0.8);
    const seam = new THREE.Mesh(this.heatSeam, seamMaterial);
    seam.position.y = 0.08;
    const warnMaterial = new THREE.MeshBasicMaterial({
      color: colorOf(THREE, PALETTE.shot),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const warn = new THREE.Mesh(this.warnRing, warnMaterial);
    warn.visible = false;
    const rim = this.heraldRim(this.circleRim);
    group.add(shell, core, seam, warn, rim);
    this.scene.add(group);
    return this.view('herald-heat', group, {
      seam,
      seamMaterial,
      warn,
      accents: [seamMaterial],
    });
  }

  createSilence() {
    const { THREE } = this;
    const group = new THREE.Group();
    const prismMaterial = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, '#120a1a'),
      emissive: colorOf(THREE, PALETTE.boss),
      emissiveIntensity: 0.06,
      metalness: 0.5,
      roughness: 0.38,
      flatShading: true,
    });
    addRimLight(prismMaterial);
    const prism = new THREE.Mesh(this.silencePrism, prismMaterial);
    const eyeMaterial = this.emissive(PALETTE.text, 1.6);
    const eye = new THREE.Mesh(this.smallSphere, eyeMaterial);
    eye.scale.setScalar(0.12);
    eye.position.set(0, 0.58, -0.2);
    const rim = this.heraldRim(this.silenceRim);
    group.add(prism, eye, rim);
    this.scene.add(group);
    // the blink rings live in field pixels, outside the scaled body
    const ring = () =>
      new THREE.Mesh(
        this.warnRing,
        new THREE.MeshBasicMaterial({
          color: colorOf(THREE, PALETTE.boss).multiplyScalar(1.4),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          toneMapped: false,
        })
      );
    const telegraph = {
      group: new THREE.Group(),
      target: ring(),
      self: ring(),
    };
    telegraph.group.add(telegraph.target, telegraph.self);
    telegraph.group.visible = false;
    this.scene.add(telegraph.group);
    return this.view('herald-silence', group, {
      eye,
      eyeMaterial,
      prismMaterial,
      telegraph,
      accents: [eyeMaterial],
    });
  }

  // `telegraphRatio` lights what acts: the Dust slits, the Heat seam (and a
  // ring), the Silence eye with the blink rings.
  updateHerald(view, herald, time, flash) {
    const { object } = view;
    const radius = herald.radius || 30;
    const charge = clamp01(herald.telegraphRatio || 0);
    object.scale.setScalar(radius);
    if (view.kind === 'herald-dust') {
      object.rotation.y = -(herald.rotation || 0);
      this.setGain(view.slitMaterial, 0.2 + 1.4 * charge + flash * 0.6);
      view.haze.rotation.y = time * 0.15 + (herald.rotation || 0);
      view.hazeMaterial.opacity = 0.08 + 0.1 * charge;
    } else if (view.kind === 'herald-heat') {
      object.rotation.y = 0;
      const breathe = 0.5 + 0.5 * Math.sin(time * 2.2);
      this.setGain(
        view.seamMaterial,
        0.7 + 0.25 * breathe + 2.2 * charge + flash * 0.6
      );
      view.warn.visible = charge > 0;
      const ring = 1.25 + 0.2 * (1 - charge);
      view.warn.scale.set(ring, 1, ring);
      view.warn.material.opacity = 0.6 * charge;
    } else {
      object.rotation.y = 0;
      view.eye.scale.setScalar(0.12 + 0.05 * charge);
      this.setGain(
        view.eyeMaterial,
        1.4 + 0.25 * Math.sin(time * 3) + flash * 0.8 + charge
      );
      const t = view.telegraph;
      const to = herald.blinkTarget;
      t.group.visible = Boolean(to);
      if (to) {
        t.group.position.set(herald.x - HALF_W, 1, herald.y - HALF_H);
        t.target.position.set(to.x - herald.x, 0, to.y - herald.y);
        const r = radius * (BLINK_RING_START - (BLINK_RING_START - 1) * charge);
        t.target.scale.set(r, 1, r);
        t.target.material.opacity = 0.3 + 0.6 * charge;
        const s = radius * (1.3 + 0.4 * charge);
        t.self.scale.set(s, 1, s);
        t.self.material.opacity = 0.3 * charge;
      }
    }
  }

  createUnknown() {
    const mesh = new this.THREE.Mesh(this.unknownShape, this.darkMaterial);
    this.scene.add(mesh);
    return this.view('unknown', mesh);
  }

  // One view kind per Warden: the boss's `bossKind` picks the body.
  createWarden(kind) {
    if (kind === 'boss-choir') return this.createChoir();
    if (kind === 'boss-null') return this.createNull();
    return this.createPrime();
  }

  wardenCoreMaterial(intensity) {
    const { THREE } = this;
    const material = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, '#120a1a'),
      emissive: colorOf(THREE, PALETTE.boss),
      emissiveIntensity: intensity,
      roughness: 0.35,
      metalness: 0.2,
    });
    material.onBeforeCompile = patchHotCore;
    return material;
  }

  createPrime() {
    const { THREE } = this;
    const group = new THREE.Group();
    const ring = new THREE.Group();
    const segments = [];
    for (let i = 0; i < WARDEN_SEGMENTS; i += 1) {
      const segment = new THREE.Mesh(
        this.wardenSegment,
        this.wardenPlateMaterial
      );
      segment.rotation.y = (i / WARDEN_SEGMENTS) * Math.PI * 2;
      segments.push(segment);
      ring.add(segment);
    }
    const coreMaterial = this.wardenCoreMaterial(1.3);
    const core = new THREE.Mesh(this.sphere, coreMaterial);
    core.scale.setScalar(0.45);
    const rim = new THREE.LineLoop(
      this.circleRim,
      new THREE.LineBasicMaterial({
        color: colorOf(THREE, PALETTE.boss).multiplyScalar(1.2),
        toneMapped: false,
      })
    );
    rim.scale.setScalar(1.24);
    group.add(ring, core, rim);
    this.scene.add(group);

    return {
      kind: 'boss',
      object: group,
      ring,
      segments,
      core,
      coreMaterial,
      telegraph: this.createTelegraph(),
      id: null,
    };
  }

  // Three cores on arms around a dark hub; each core owns its material so it
  // can sing (lit) or stay dim, and its arm and shards for the break.
  createChoir() {
    const { THREE } = this;
    const group = new THREE.Group();
    const hub = new THREE.Mesh(this.sphere, this.darkMaterial);
    hub.scale.set(22, 14, 22);
    const hubRim = new THREE.LineLoop(this.circleRim, this.bossRimMaterial);
    hubRim.scale.setScalar(30);
    group.add(hub, hubRim);
    const cores = [];
    for (let i = 0; i < 3; i += 1) {
      const pivot = new THREE.Group();
      const arm = new THREE.Mesh(this.choirArm, this.wardenPlateMaterial);
      arm.scale.set(90 - CHOIR_CORE_PX, 6, 9);
      const coreMaterial = this.wardenCoreMaterial(0.2);
      const core = new THREE.Mesh(this.sphere, coreMaterial);
      core.position.x = 90;
      core.scale.setScalar(CHOIR_CORE_PX);
      const haloMaterial = new THREE.LineBasicMaterial({
        color: colorOf(THREE, PALETTE.boss).multiplyScalar(1.3),
        transparent: true,
        toneMapped: false,
      });
      const halo = new THREE.LineLoop(this.circleRim, haloMaterial);
      halo.position.x = 90;
      const shards = [];
      for (let k = 0; k < CHOIR_SHARDS; k += 1) {
        const shard = new THREE.Mesh(this.shard, this.wardenPlateMaterial);
        shard.visible = false;
        shards.push(shard);
        pivot.add(shard);
      }
      pivot.add(arm, core, halo);
      group.add(pivot);
      cores.push({
        pivot,
        arm,
        core,
        coreMaterial,
        halo,
        haloMaterial,
        shards,
      });
    }
    this.scene.add(group);
    return {
      kind: 'boss-choir',
      object: group,
      cores,
      telegraph: this.createTelegraph(3),
      id: null,
    };
  }

  // A dark core inside eight plates; the plates open into an orbit, then are
  // shed. Two rings announce and show the inverted XP pull.
  createNull() {
    const { THREE } = this;
    const group = new THREE.Group();
    const coreMaterial = this.wardenCoreMaterial(0.5);
    coreMaterial.color.copy(colorOf(THREE, '#05030a'));
    const core = new THREE.Mesh(this.sphere, coreMaterial);
    const rim = new THREE.LineLoop(this.circleRim, this.bossRimMaterial);
    const plates = [];
    for (let i = 0; i < 8; i += 1) {
      const mesh = new THREE.Mesh(this.nullPlate, this.wardenPlateMaterial);
      mesh.scale.setScalar(NULL_CLOSED_PX);
      plates.push({ mesh, shed: null });
      group.add(mesh);
    }
    const pullRings = [0, 1].map(() => {
      const ring = new THREE.Mesh(
        this.warnRing,
        new THREE.MeshBasicMaterial({
          color: colorOf(THREE, PALETTE.xp),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          toneMapped: false,
        })
      );
      ring.position.y = 1;
      ring.visible = false;
      group.add(ring);
      return ring;
    });
    group.add(core, rim);
    this.scene.add(group);
    return {
      kind: 'boss-null',
      object: group,
      core,
      coreMaterial,
      rim,
      plates,
      pullRings,
      shedAt: null,
      telegraph: this.createTelegraph(),
      id: null,
    };
  }

  // Charge lane / fan / warning ring on the field plane (Wardens and Ram);
  // `beams` lines for the Choir's converging volley.
  createTelegraph(beams = 0) {
    const { THREE } = this;
    const additive = (hex) =>
      new THREE.MeshBasicMaterial({
        color: colorOf(THREE, hex),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
    const group = new THREE.Group();
    const lane = new THREE.Mesh(this.lanePlane, additive(PALETTE.threat));
    const line = new THREE.Mesh(this.lanePlane, additive(PALETTE.threat));
    const fan = new THREE.Mesh(this.lanePlane, additive(PALETTE.threat));
    const warn = new THREE.Mesh(this.warnRing, additive(PALETTE.threat));
    // the Null's lane: a dark band between two violet edges
    const dark = new THREE.Mesh(
      this.lanePlane,
      new THREE.MeshBasicMaterial({
        color: colorOf(THREE, '#030106'),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    const edges = [0, 1].map(
      () => new THREE.Mesh(this.lanePlane, additive(PALETTE.boss))
    );
    const beamList = [];
    for (let i = 0; i < beams; i += 1) {
      beamList.push(new THREE.Mesh(this.lanePlane, additive(PALETTE.threat)));
    }
    group.add(lane, line, fan, warn, dark, ...edges, ...beamList);
    group.visible = false;
    this.scene.add(group);
    return { group, lane, line, fan, warn, dark, edges, beams: beamList };
  }

  // --- per frame -------------------------------------------------------------

  /** Mirrors `enemies`; returns the Warden view (for its light) or null. */
  update(enemies, time, dt = 0) {
    this.frame += 1;
    this.dissolve.update(dt);
    let warden = null;
    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      if (!enemy || enemy.destroyed) continue;
      const key = enemy.id || enemy;
      const kind = this.kindOf(enemy.type, enemy.bossKind, enemy.heraldKind);
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
      view.radius = enemy.radius || 12;
      const { object } = view;
      object.position.set(enemy.x - HALF_W, 0, enemy.y - HALF_H);
      const flash = enemy.getHitFlash();
      if (kind === 'asteroid') this.updateRock(view, enemy, time, flash);
      else if (kind.startsWith('boss')) {
        this.updateWarden(view, enemy, time);
        warden = view;
      } else if (kind.startsWith('herald')) {
        this.updateHerald(view, enemy, time, flash);
      } else this.updateMachine(view, enemy, kind, time, flash);
    }

    this.views.forEach((view, key) => {
      if (view.stamp !== this.frame) {
        if (this.dead.delete(key)) this.die(key, view);
        else this.release(key, view);
      }
    });
    if (this.dead.size) this.dead.forEach(this.pruneDead);
    return warden;
  }

  /** The simulation killed `enemy` (asteroid splits excluded). */
  markDead(enemy) {
    this.dead.add(enemy.id || enemy);
  }

  // The view burns in place; a burst of accent chunks flies out (rocks
  // already shed stone debris through EffectsSystem). The Warden's phase
  // breaks have their own pieces: only its final death bursts, bigger, lit.
  die(key, view) {
    this.views.delete(key);
    if (view.telegraph) view.telegraph.group.visible = false;
    const accent = this.accentOf(view);
    this.dissolve.start(view, accent, view.radius);
    if (view.kind === 'asteroid') return;
    const x = view.object.position.x + HALF_W;
    const y = view.object.position.z + HALF_H;
    if (view.kind.startsWith('boss')) {
      this.bursts.spawn(x, y, view.radius, accent, WARDEN_BURST);
      this.bursts.flash(x, y, accent);
    } else {
      const count = Math.round(view.radius / 2);
      this.bursts.spawn(
        x,
        y,
        view.radius,
        accent,
        Math.max(BURST_MIN, Math.min(BURST_MAX, count))
      );
    }
  }

  accentOf(view) {
    if (view.kind.startsWith('boss') || view.kind === 'herald-silence') {
      return this.bossColor;
    }
    if (view.accents?.length) return view.accents[0].userData.base;
    if (view.material) return view.material.userData.rockUniforms.uVein.value;
    return this.threatColor;
  }

  updateMachine(view, enemy, kind, time, flash) {
    const { object } = view;
    object.scale.setScalar(enemy.radius || 12);
    object.rotation.y = -(enemy.rotation || 0);
    this.applyElite(view, enemy.elite === true);
    if (view.eliteRing) view.eliteRing.rotation.y = time * 0.5;
    if (kind === 'hunter') {
      this.setGain(view.lensMaterial, 0.5 + 1.3 * (enemy.telegraphRatio || 0));
    } else if (kind === 'mine') {
      const armed = Boolean(enemy.armed);
      const pulse = 0.5 + 0.5 * Math.sin(time * 9 + (view.seed % 7));
      this.setGain(view.nodeMaterial, armed ? 1.1 + 0.6 * pulse : 0.6);
      view.arc.visible = armed;
      this.setGain(view.arcMaterial, 1.1 + 0.6 * pulse);
      view.spin.rotation.y = time * (armed ? 2.4 : 0.8);
    } else if (kind === 'husk') {
      object.rotation.y = 0;
      const heat = clamp01(enemy.damageRatio || 0);
      const uniforms = view.material.userData.rockUniforms;
      // reveal stays under 0.6: the fine crack layer is the Ring rock's look
      uniforms.uGlow.value = 0.15 + 1.2 * heat;
      uniforms.uReveal.value = 0.35 + 0.2 * heat;
      uniforms.uWidth.value = 0.04 + 0.025 * heat;
      uniforms.uFlash.value = flash * 0.45;
    } else if (kind === 'ram') {
      const charge = clamp01(enemy.telegraphRatio || 0);
      this.setGain(view.lensMaterial, 0.4 + 1.8 * charge);
      view.lens.scale.setScalar(0.12 * (1 + 0.8 * charge));
      view.core.visible = charge > 0.5;
      this.setGain(view.coreMaterial, (charge - 0.5) * 2.4);
      this.updateTelegraph(view.telegraph, enemy, enemy.radius || 14);
    } else if (kind === 'weaver') {
      object.rotation.y = 0;
      view.spin.rotation.y = -(enemy.spin || 0);
      const lay = clamp01(enemy.layGlow || 0);
      view.armMaterial.emissiveIntensity = 2.2 * lay;
      this.setGain(view.tipMaterial, 0.5 + 1.6 * lay);
      for (let i = 0; i < view.tips.length; i += 1) {
        view.tips[i].scale.setScalar(0.09 + 0.07 * lay);
      }
    } else if (kind === 'bulwark') {
      object.rotation.y = 0;
      view.plate.rotation.y = -(enemy.facing || 0);
      const broken = Boolean(enemy.shieldBroken);
      view.plateMesh.material = broken ? this.darkMaterial : this.plateMaterial;
      view.edge.visible = !broken;
      const shield =
        enemy.maxShieldHealth > 0
          ? enemy.shieldHealth / enemy.maxShieldHealth
          : 1;
      this.setGain(view.edgeMaterial, 0.5 + 0.9 * clamp01(shield));
    }
  }

  // Elite: accent energy burns gold and a thin dashed gold ring turns around
  // the silhouette. Pooled views can come back with either flag.
  applyElite(view, elite) {
    if (view.elite === elite) return;
    view.elite = elite;
    const accent = elite ? this.goldColor : this.threatColor;
    for (let i = 0; i < view.accents.length; i += 1) {
      const material = view.accents[i];
      material.userData.base.copy(accent);
      if (material.userData.gain !== undefined)
        this.setGain(material, material.userData.gain);
    }
    if (view.material)
      view.material.userData.rockUniforms.uVein.value.copy(accent);
    const rim = elite ? this.eliteRimMaterial : this.rimMaterial;
    for (let i = 0; i < view.rims.length; i += 1) view.rims[i].material = rim;
    if (elite && !view.eliteRing) {
      view.eliteRing = this.seeded(() => {
        const ring = new this.THREE.Group();
        for (let i = 0; i < ELITE_DASHES; i += 1) {
          const dash = new this.THREE.Mesh(
            this.eliteDash,
            this.eliteDashMaterial
          );
          dash.rotation.y = (i * TAU) / ELITE_DASHES;
          ring.add(dash);
        }
        return ring;
      });
      view.object.add(view.eliteRing);
    }
    if (view.eliteRing) view.eliteRing.visible = elite;
  }

  bind(view, enemy) {
    if (view.kind === 'boss-choir') {
      view.cores.forEach((core) => {
        core.broken = null;
        core.pivot.visible = true;
        core.pivot.position.set(0, 0, 0);
        core.pivot.rotation.set(0, 0, 0);
        core.shards.forEach((shard) => (shard.visible = false));
      });
      return;
    }
    if (view.kind === 'boss-null') {
      view.shedAt = null;
      view.plates.forEach((plate) => {
        plate.shed = null;
        plate.mesh.visible = true;
        plate.mesh.rotation.set(0, 0, 0);
        plate.mesh.scale.setScalar(NULL_CLOSED_PX);
      });
      return;
    }
    if (view.kind === 'husk') {
      const random = createSeededRandom((view.seed % 100000) + 1);
      view.material.userData.rockUniforms.uSeed.value.set(
        random() * 50,
        random() * 50,
        random() * 50
      );
      view.shell.rotation.y = random() * TAU;
      return;
    }
    if (view.kind !== 'asteroid') return;
    const seed = view.seed;
    view.object.geometry = this.rockGeometries[seed % ROCK_SHAPES];
    const random = createSeededRandom((seed % 100000) + 1);
    view.spinRate = (0.25 + random() * 0.5) * (random() < 0.5 ? -1 : 1);
    view.spinPhase = random() * Math.PI * 2;
    view.lean = (random() - 0.5) * 1.2;
    const look = VARIANT_LOOKS[enemy.variant] || VARIANT_LOOKS.common;
    view.look = look;
    view.pulse = view.spinPhase;
    view.lastTime = null;
    if (look.crystal && !view.crystal)
      view.crystal = this.seeded(() => this.createCrystal(view));
    const material = look.crystal ? view.crystal : view.stone;
    view.material = material;
    view.object.material = material;
    material.color.copy(colorOf(this.THREE, look.base));
    material.roughness = look.roughness;
    material.metalness = look.metalness;
    const uniforms = material.userData.rockUniforms;
    uniforms.uVein.value.copy(colorOf(this.THREE, look.vein || PALETTE.shot));
    uniforms.uRim.value = look.rim || 0;
    uniforms.uSeed.value.set(random() * 50, random() * 50, random() * 50);
  }

  // Vein pulse rate (Hz) from the live variant state.
  pulseRate(look, enemy) {
    if (look.armedRate && enemy.variantState?.armed) return look.armedRate;
    if (look.nearRate) {
      const target = enemy.system?.getCachedPlayer?.()?.position;
      if (target) {
        const distance = Math.hypot(target.x - enemy.x, target.y - enemy.y);
        const near = clamp01(
          (PARASITE_FAR - distance) / (PARASITE_FAR - PARASITE_NEAR)
        );
        return look.rate + (look.nearRate - look.rate) * near;
      }
    }
    return look.rate || 0;
  }

  updateRock(view, enemy, time, flash) {
    // a rock can change variant alive (the Herald of Heat ignites it)
    if (view.look !== (VARIANT_LOOKS[enemy.variant] || VARIANT_LOOKS.common)) {
      this.bind(view, enemy);
    }
    const { object, look } = view;
    object.scale.setScalar((enemy.radius || 12) * ROCK_SCALE);
    object.rotation.y = -(enemy.rotation || 0);
    object.rotation.x = view.spinPhase + time * view.spinRate;
    object.rotation.z = view.lean;
    const stage = Math.max(0, Math.min(3, enemy.crackStage || 0));
    let glow = CRACK_GLOW[stage];
    let reveal = CRACK_REVEAL[stage];
    if (look.vein) {
      const dt = view.lastTime === null ? 0 : Math.max(0, time - view.lastTime);
      view.pulse += dt * TAU * this.pulseRate(look, enemy);
      let veins = look.veinGlow;
      if (look.floor !== undefined) {
        const wave = 0.5 + 0.5 * Math.sin(view.pulse);
        veins = look.floor + (look.veinGlow - look.floor) * wave;
      }
      glow = Math.max(glow, veins);
      reveal = Math.max(reveal, look.reveal);
    }
    view.lastTime = time;
    const uniforms = view.material.userData.rockUniforms;
    uniforms.uGlow.value = glow;
    uniforms.uReveal.value = reveal;
    uniforms.uWidth.value = Math.max(0.035 + stage * 0.012, look.width || 0);
    uniforms.uFlash.value = flash * 0.45;
  }

  updateWarden(view, boss, time) {
    if (view.kind === 'boss-choir') this.updateChoir(view, boss, time);
    else if (view.kind === 'boss-null') this.updateNull(view, boss, time);
    else this.updatePrime(view, boss, time);
  }

  updatePrime(view, boss, time) {
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

  // The singing core is lit and haloed, the others dim. A broken core keeps
  // its last angle and drifts out with its arm, tumbling and going dark,
  // while shards fly from it.
  updateChoir(view, boss, time) {
    const flash = boss.getHitFlash();
    const states = boss.cores || [];
    for (let i = 0; i < view.cores.length; i += 1) {
      const c = view.cores[i];
      const state = states[i];
      if (!state) {
        c.pivot.visible = false;
        continue;
      }
      if (state.alive) {
        const angle = Math.atan2(state.y - boss.y, state.x - boss.x);
        c.pivot.rotation.y = -angle;
        const singing = boss.singingIndex === i;
        const beat = Math.sin(time * 5 + i);
        c.coreMaterial.emissiveIntensity = singing
          ? 1.7 + 0.35 * beat + flash * 0.8
          : 0.16 + flash * 0.25;
        c.core.scale.setScalar(
          CHOIR_CORE_PX * (singing ? 1.06 + 0.04 * beat : 0.9)
        );
        c.halo.visible = singing;
        c.halo.scale.setScalar(CHOIR_CORE_PX * (1.3 + 0.08 * beat));
        c.haloMaterial.opacity = 0.6 + 0.3 * beat;
        continue;
      }
      if (!c.broken) {
        c.broken = { start: time };
        c.halo.visible = false;
      }
      const age = time - c.broken.start;
      if (age > BREAK_SECONDS) {
        c.pivot.visible = false;
        continue;
      }
      const u = age / BREAK_SECONDS;
      // out along the arm, sinking and tipping as it goes
      c.pivot.position.set(0, -40 * u * u, 0);
      c.arm.position.x = 70 * u;
      c.core.position.x = 90 + 120 * u;
      c.arm.rotation.z = -1.2 * u;
      c.arm.rotation.x = 2.5 * u;
      c.core.rotation.y = 6 * u;
      c.coreMaterial.emissiveIntensity =
        (1 - u) * (1.2 + 1.2 * Math.abs(Math.sin(age * 31)));
      c.core.scale.setScalar(CHOIR_CORE_PX * (1 - 0.45 * u));
      const spray = 90 * Math.sqrt(u);
      c.shards.forEach((shard, k) => {
        const a = (k / CHOIR_SHARDS) * TAU + i;
        shard.visible = true;
        shard.position.set(
          90 + Math.cos(a) * spray + 60 * u,
          Math.sin(a * 2) * spray * 0.4 - 30 * u * u,
          Math.sin(a) * spray
        );
        shard.rotation.set(age * (3 + k), age * 2, age * (1 + k));
        shard.scale.setScalar(9 * (1 - u) + 2);
      });
    }
    const t = boss.telegraph;
    this.updateTelegraph(
      view.telegraph,
      boss,
      t?.type === 'fan' ? CHOIR_CORE_PX * 1.3 : boss.radius || 118
    );
  }

  // Plates follow the boss's own positions (closed shell, then open orbit);
  // once shed they fly out, tumbling and shrinking. The core brightens when
  // exposed. The pull rings close in during the windup and ripple outward
  // while the XP pull is inverted.
  updateNull(view, boss, time) {
    const flash = boss.getHitFlash();
    const phase = Math.max(0, boss.currentPhase || 0);
    const exposed = phase >= 2;
    const radius = boss.radius || NULL_CLOSED_PX;
    view.core.scale.setScalar(radius * (exposed ? 0.62 : 0.52));
    view.coreMaterial.emissiveIntensity = exposed
      ? 2.2 + 0.5 * Math.sin(time * 6) + flash * 0.8
      : 0.25 + 0.1 * Math.sin(time * 2) + flash * 0.6;
    view.rim.scale.setScalar(radius * (exposed ? 0.8 : 1.25));
    view.rim.visible = exposed || (boss.shellOpen || 0) > 0.2;

    const states = boss.plates || [];
    if (boss.shellShed && view.shedAt === null) view.shedAt = time;
    const shedAge = view.shedAt === null ? 0 : time - view.shedAt;
    for (let i = 0; i < view.plates.length; i += 1) {
      const plate = view.plates[i];
      const state = states[i];
      const { mesh } = plate;
      if (!state) {
        mesh.visible = false;
        continue;
      }
      const dx = state.x - boss.x;
      const dy = state.y - boss.y;
      const angle = Math.atan2(dy, dx);
      if (view.shedAt === null) {
        mesh.visible = true;
        mesh.position.set(dx, 0, dy);
        mesh.rotation.set(0, -angle, 0);
        // an open plate tilts up, so it reads as loose
        mesh.rotation.z = (boss.shellOpen || 0) * 0.5;
        continue;
      }
      if (!plate.shed) plate.shed = { x: dx, y: dy, angle };
      if (shedAge > BREAK_SECONDS) {
        mesh.visible = false;
        continue;
      }
      const u = shedAge / BREAK_SECONDS;
      const out = 260 * u;
      const a = plate.shed.angle;
      mesh.position.set(
        plate.shed.x + Math.cos(a) * out,
        30 * Math.sin(u * Math.PI) - 20 * u,
        plate.shed.y + Math.sin(a) * out
      );
      mesh.rotation.set(shedAge * (2 + (i % 3)), -a + shedAge, shedAge * 3);
      mesh.scale.setScalar(NULL_CLOSED_PX * (1 - 0.7 * u));
    }

    const state = boss.pullState;
    view.pullRings.forEach((ring, k) => {
      ring.visible = state === 'windup' || state === 'inverting';
      if (!ring.visible) return;
      let r;
      let opacity;
      if (state === 'windup') {
        const p = clamp01(
          1 - (boss.pullStateTimer || 0) / WARDEN_KINDS.null.pullWindup
        );
        r = 260 - 170 * p + k * 30;
        opacity = 0.2 + 0.6 * p;
      } else {
        const w = (time * 1.4 + k * 0.5) % 1;
        r = 90 + 300 * w;
        opacity = 0.75 * (1 - w);
      }
      ring.scale.set(r, 1, r);
      ring.material.opacity = opacity;
    });

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
    const ox = Number.isFinite(t.x) ? t.x : boss.x;
    const oy = Number.isFinite(t.y) ? t.y : boss.y;
    parts.group.position.set(ox - HALF_W, 1, oy - HALF_H);
    const chorus = t.type === 'chorus';
    parts.group.rotation.y = chorus ? 0 : -(t.angle || 0);
    const charge = t.type === 'charge';
    const dark = charge && t.tone === 'dark';
    parts.lane.visible = charge && !dark;
    parts.dark.visible = dark;
    parts.edges.forEach((edge) => (edge.visible = dark));
    parts.line.visible = charge;
    parts.fan.visible = t.type === 'fan';
    parts.beams.forEach((beam, i) => {
      const line = chorus ? t.lines?.[i] : null;
      beam.visible = Boolean(line);
      if (!line) return;
      beam.position.set(line.x - ox, 0, line.y - oy);
      beam.rotation.y = -line.angle;
      beam.scale.set(Math.max(1, line.length), 1, 2 + 4 * progress);
      beam.material.opacity = (0.3 + 0.6 * progress) * (0.7 + 0.3 * pulse);
    });
    if (charge) {
      const length = Math.max(r * 2, t.length || 400);
      parts.line.material.color.copy(dark ? this.bossColor : this.threatColor);
      parts.line.scale.set(length, 1, 2);
      parts.line.material.opacity = 0.35 + 0.55 * progress;
      if (dark) {
        parts.dark.scale.set(length, 1, r * 1.8);
        parts.dark.material.opacity = 0.35 + 0.4 * progress;
        parts.edges.forEach((edge, i) => {
          edge.position.z = (i ? 1 : -1) * r * 0.9;
          edge.scale.set(length, 1, 3);
          edge.material.opacity = 0.3 + 0.6 * progress;
        });
      } else {
        parts.lane.scale.set(length, 1, r * 1.8);
        parts.lane.material.opacity = 0.08 + 0.18 * progress;
      }
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
    this.pool(view);
  }

  pool(view) {
    let pool = this.pools.get(view.kind);
    if (!pool) {
      pool = [];
      this.pools.set(view.kind, pool);
    }
    pool.push(view);
  }

  clear() {
    this.views.forEach((view, key) => this.release(key, view));
    this.dissolve.clear();
    this.dead.clear();
  }
}
