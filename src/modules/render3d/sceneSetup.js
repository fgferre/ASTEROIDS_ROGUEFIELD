// The WebGL side of Renderer3D, built on its first render(): the renderer,
// the scene and its lights, the composer (bloom, impact, sRGB out, SMAA),
// the overlay scene, every mirror and batch, the shockwave pool and the DOM
// flashes, returned as one kit (Renderer3D's `three`).

import { KEY_LIGHT_DIR, PALETTE } from '../../data/constants/palette.js';
import {
  CapsuleBatch,
  PointBatch,
  RibbonBatch,
  colorOf,
  rgbOf,
} from './batches.js';
import { BiomeController } from './biomes3d.js';
import { DebrisChunks } from './debrisChunks.js';
import { DeathBursts } from './dissolve.js';
import { EnemyMirror } from './enemyMirror.js';
import { FieldBackdrop } from './fieldBackdrop.js';
import { FlashLights } from './flashLights.js';
import { SCENE_READ, createImpactPass } from './impactPass.js';
import { PickupMirror } from './pickupMirror.js';
import { PlayerMirror } from './playerMirror.js';
import { ScorchDecals } from './scorchDecals.js';
import { ShieldMirror } from './shieldMirror.js';
import { CAMERA_FAR, SpaceField } from './spaceField.js';
import { TextSprites } from './textSprites.js';

export const FOV = 38;
const KEY_ELEVATION = (40 * Math.PI) / 180;
export const BLOOM = { strength: 0.9, radius: 0.6, threshold: 0.75 };
// proposta 17/10: ACES on lit surfaces, sRGB on the way out (emissives are
// toneMapped:false, so they stay hot enough to bloom).
const EXPOSURE = 1;
const WARDEN_LIGHT_DISTANCE = 420;
const MAX_SHOCKWAVES = 25;
const MAX_DAMAGE_TEXTS = 16;
// proposta 18/10: the key light's shadow box follows the camera target: the
// light sits KEY_SHADOW.distance away along its direction, the box spans the
// shot (`span` × the camera range, clamped) and the biases keep rocks from
// shadowing themselves in stripes.
export const KEY_SHADOW = {
  distance: 1000,
  depth: 500,
  span: 0.62,
  min: 380,
  max: 1400,
  bias: -0.0006,
  normalBias: 0.6,
};

// Last linear → sRGB step of the composer (the passes work in linear; the
// renderer's outputEncoding only applies when drawing to the screen), on
// frames the impact pass, which ends in the same step, does not run.
const OUTPUT_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null },
    uBloom: { value: 0 },
  },
  vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
  fragmentShader: `
${SCENE_READ}
varying vec2 vUv;
void main() {
  gl_FragColor = LinearTosRGB(vec4(sceneAt(vUv), 1.0));
}`,
};

const SHOCKWAVE_VERTEX = `
varying vec2 vPos;
void main() {
  vPos = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// A sharp ring of uWidth world units plus a soft halo, premultiplied color.
const SHOCKWAVE_FRAGMENT = `
uniform float uRadius;
uniform float uWidth;
uniform float uExtent;
uniform vec3 uColor;
varying vec2 vPos;
void main() {
  float d = abs(length(vPos) * uExtent - uRadius);
  float core = 1.0 - smoothstep(uWidth * 0.5, uWidth * 0.5 + 1.0, d);
  float halo = (1.0 - smoothstep(0.0, uWidth * 3.0, d)) * 0.3;
  gl_FragColor = vec4(uColor * (core + halo), 1.0);
}`;

// `?bloom=0` turns the pass off; `?bloom=<n>` (0..3) scales its strength and
// replaces the Bloom Intensity setting (`set`) — the same flag the 2D
// bloomLayer reads.
function bloomFromUrl() {
  const unset = { enabled: true, scale: 1, set: false };
  try {
    const raw = new URLSearchParams(window.location.search).get('bloom');
    if (raw === null) return unset;
    const value = Number(raw);
    if (!Number.isFinite(value)) return unset;
    return {
      enabled: value > 0,
      scale: Math.min(3, Math.max(0, value)),
      set: true,
    };
  } catch {
    return unset;
  }
}

// A point light that adds nothing at a pixel (the idle flash pool and the
// Warden light sit at 0; past its range it fades to 0) skips the lit
// materials' BRDF there: the same sum for less work on every lit pixel, and
// a horde of machines is a lot of lit pixels (PLAN.md 0a.8). Before any
// program compiles.
function skipDarkPointLights(THREE) {
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  const start = chunk.indexOf('NUM_POINT_LIGHTS > 0');
  const end = chunk.indexOf('#pragma unroll_loop_end', start);
  THREE.ShaderChunk.lights_fragment_begin =
    chunk.slice(0, start) +
    chunk
      .slice(start, end)
      .replace('RE_Direct(', 'if ( directLight.visible ) RE_Direct(') +
    chunk.slice(end);
}

// The bloom's last step, its half-res result blended over the whole scene
// target, moves into the read of the pass after it (impactPass.js
// SCENE_READ): one full-screen read and write less per frame at native
// resolution, where a horde of lit machines already fills the GPU (PLAN.md
// 0a.8). The bloom's copy draw is hidden; `passes` add its result on frames
// it ran.
function foldBloom(bloomPass, passes) {
  bloomPass.materialCopy.visible = false;
  passes.forEach(({ uniforms }) => {
    uniforms.tBloom.value = bloomPass.renderTargetsHorizontal[0].texture;
    Object.defineProperty(uniforms.uBloom, 'value', {
      get: () => (bloomPass.enabled ? 1 : 0),
    });
  });
}

// `seeded` runs object creation inside the menu's seeded Math.random swap
// (Three.js draws UUIDs from it).
export function setupThree(seeded) {
  const THREE = window.THREE;
  skipDarkPointLights(THREE);
  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(1);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  renderer.setClearColor(colorOf(THREE, PALETTE.background), 1);
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  // Far enough for the nebula from the high and the low shots (spaceField).
  const camera = new THREE.PerspectiveCamera(FOV, 4 / 3, 10, CAMERA_FAR);

  // Key: warm white from upper-left (KEY_LIGHT_DIR), fixed in direction;
  // on high/ultra it casts shadows between the 3D objects (applyShadows),
  // its target following the camera (updateCamera). The fill and the
  // environment keep the unlit sides readable.
  const key = new THREE.DirectionalLight(colorOf(THREE, '#fff1e2'), 1.6);
  const keyDir = new THREE.Vector3(
    KEY_LIGHT_DIR.x * Math.cos(KEY_ELEVATION),
    Math.sin(KEY_ELEVATION),
    KEY_LIGHT_DIR.y * Math.cos(KEY_ELEVATION)
  );
  key.position.copy(keyDir).multiplyScalar(KEY_SHADOW.distance);
  key.shadow.bias = KEY_SHADOW.bias;
  key.shadow.normalBias = KEY_SHADOW.normalBias;
  key.shadow.camera.near = KEY_SHADOW.distance - KEY_SHADOW.depth;
  key.shadow.camera.far = KEY_SHADOW.distance + KEY_SHADOW.depth;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Fill: cool, from below-right; hemisphere keeps shadows from going void.
  const fill = new THREE.DirectionalLight(
    colorOf(THREE, PALETTE.neutral),
    0.35
  );
  fill.position.set(0.7, 0.3, 0.65);
  const hemi = new THREE.HemisphereLight(
    colorOf(THREE, '#2a3346'),
    colorOf(THREE, '#050608'),
    0.3
  );
  const wardenLight = new THREE.PointLight(
    colorOf(THREE, PALETTE.boss),
    0,
    WARDEN_LIGHT_DISTANCE,
    2
  );
  scene.add(key, key.target, fill, hemi, wardenLight);
  scene.environment = buildEnvironment(THREE, renderer);

  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
  });
  const composer = new THREE.EffectComposer(renderer, target);
  composer.addPass(new THREE.RenderPass(scene, camera));
  const bloomUrl = bloomFromUrl();
  const bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(width, height),
    BLOOM.strength * bloomUrl.scale,
    BLOOM.radius,
    BLOOM.threshold
  );
  // The bloom chain defaults to 8-bit targets: in linear, its faint tail
  // quantizes into steps that the sRGB encode turns into visible blocks.
  [
    bloomPass.renderTargetBright,
    ...bloomPass.renderTargetsHorizontal,
    ...bloomPass.renderTargetsVertical,
  ].forEach((rt) => {
    rt.texture.type = THREE.HalfFloatType;
  });
  bloomPass.blackMip = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  bloomPass.blackMip.needsUpdate = true;
  composer.addPass(bloomPass);
  const impactPass = createImpactPass(THREE);
  composer.addPass(impactPass);
  // the impact pass ends in the sRGB step: one of the two runs, never both
  const outputPass = new THREE.ShaderPass(OUTPUT_SHADER);
  Object.defineProperty(outputPass, 'enabled', {
    get: () => !impactPass.enabled,
  });
  composer.addPass(outputPass);
  foldBloom(bloomPass, [impactPass, outputPass]);
  const smaaPass = new THREE.SMAAPass(width, height);
  composer.addPass(smaaPass);

  // Drawn after the composer: text stays crisp, never bloomed.
  const overlay = new THREE.Scene();
  const texts = new TextSprites(THREE, overlay, seeded, MAX_DAMAGE_TEXTS);

  const backdrop = new FieldBackdrop(THREE, scene);
  const space = new SpaceField(THREE, scene);
  const biomes = new BiomeController(THREE, {
    key,
    fill,
    hemi,
    hemiBase: hemi.intensity,
    bloomPass,
    bloomBase: BLOOM.strength * bloomUrl.scale,
    backdrop,
    space,
  });
  const flashes = new FlashLights(THREE, scene);
  const debris = new DebrisChunks(THREE, scene);
  const bursts = new DeathBursts(debris, flashes);
  const enemies = new EnemyMirror(THREE, scene, seeded, bursts);
  const player = new PlayerMirror(THREE, scene, seeded);
  const pickups = new PickupMirror(THREE, scene);
  const decals = new ScorchDecals(THREE, scene);
  const shield = new ShieldMirror(
    THREE,
    scene,
    rgbOf(THREE, PALETTE.player).map((c) => c * 1.4)
  );

  const ribbons = new RibbonBatch(THREE, 4000);
  const lances = new CapsuleBatch(THREE, 240);
  const glow = new PointBatch(THREE, 900);
  const matte = new PointBatch(THREE, 500, { shape: 'disc' });
  const smoke = new PointBatch(THREE, 300, { shape: 'puff' });
  scene.add(
    ribbons.object,
    lances.mesh,
    glow.object,
    matte.object,
    smoke.object
  );

  // Shockwaves: a flat quad whose shader draws a ring of constant width
  // in world units at any radius (a scaled RingGeometry would thicken).
  const quad = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const shockwaves = [];
  for (let i = 0; i < MAX_SHOCKWAVES; i += 1) {
    const mesh = new THREE.Mesh(
      quad,
      new THREE.ShaderMaterial({
        uniforms: {
          uRadius: { value: 1 },
          uWidth: { value: 1 },
          uExtent: { value: 1 },
          uColor: { value: new THREE.Color() },
        },
        vertexShader: SHOCKWAVE_VERTEX,
        fragmentShader: SHOCKWAVE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    mesh.visible = false;
    scene.add(mesh);
    shockwaves.push(mesh);
  }

  // Red damage flash stays in the DOM, over the canvas.
  const flash = document.createElement('div');
  flash.style.cssText =
    'position:absolute;inset:0;pointer-events:none;opacity:0;z-index:6;border-radius:inherit;';
  canvas.after(flash);
  // Boss phase transitions: tinted border + wash, like drawBossTransitions.
  const bossFlash = flash.cloneNode();
  canvas.after(bossFlash);

  return {
    THREE,
    canvas,
    renderer,
    scene,
    camera,
    composer,
    bloomPass,
    impactPass,
    smaaPass,
    bloomUrl: bloomUrl.enabled,
    bloomScale: bloomUrl.scale,
    bloomSet: bloomUrl.set,
    overlay,
    texts,
    bossFlash,
    bossFlashKey: '',
    key,
    keyDir,
    wardenLight,
    backdrop,
    space,
    biomes,
    flashes,
    enemies,
    player,
    pickups,
    decals,
    shield,
    ribbons,
    lances,
    glow,
    matte,
    smoke,
    debris,
    bursts,
    shockwaves,
    flash,
    flashAlpha: 0,
    width: 0,
    height: 0,
    canvasWidth: 0,
    canvasHeight: 0,
    scale: 1,
    shotRgb: rgbOf(THREE, PALETTE.shot),
    threatRgb: rgbOf(THREE, PALETTE.threat),
    xpRgb: rgbOf(THREE, PALETTE.xp),
    statusRgb: rgbOf(THREE, PALETTE.status),
    accentRgb: rgbOf(THREE, PALETTE.player),
    textRgb: rgbOf(THREE, PALETTE.text),
  };
}

// A dim reflection environment so metal reads as metal: black below, a
// cool sky, one warm patch where the key light is.
function buildEnvironment(THREE, renderer) {
  const sky = new THREE.SphereGeometry(100, 32, 16);
  const position = sky.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const keyDir = new THREE.Vector3(
    KEY_LIGHT_DIR.x * Math.cos(KEY_ELEVATION),
    Math.sin(KEY_ELEVATION),
    KEY_LIGHT_DIR.y * Math.cos(KEY_ELEVATION)
  );
  const dir = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    dir.fromBufferAttribute(position, i).normalize();
    const up = Math.max(0, dir.y);
    const warm = Math.pow(Math.max(0, dir.dot(keyDir)), 24);
    colors[i * 3] = 0.03 * up + 0.3 * warm;
    colors[i * 3 + 1] = 0.045 * up + 0.27 * warm;
    colors[i * 3 + 2] = 0.07 * up + 0.24 * warm;
  }
  sky.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const envScene = new THREE.Scene();
  envScene.add(
    new THREE.Mesh(
      sky,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.BackSide,
      })
    )
  );
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(envScene, 0.02).texture;
  pmrem.dispose();
  return texture;
}
