// src/modules/menu/openingScene.js
//
// The opening scene behind the title (proposta 17/11): the place the pilot
// arrives at, built from the game's own pieces — its space (nebula, stars,
// dust: render3d/spaceField.js), the broken Ring (render3d/fieldBackdrop.js)
// and its rocks with the light inside (render3d/enemies/rocks.js) — under
// the game's lights, tone and bloom, in a world of its own. The menu's own
// scene (the hull preview) draws over it, unchanged. The camera drifts
// slowly about a held shot; with reduced motion it holds still.

import { BIOMES } from '../../data/biomes.js';
import { IS_DEV } from '../../core/env.js';
import { KEY_LIGHT_DIR, PALETTE } from '../../data/constants/palette.js';
import { colorOf } from '../render3d/batches.js';
import { BiomeController } from '../render3d/biomes3d.js';
import { createRockViews } from '../render3d/enemies/rocks.js';
import { FieldBackdrop } from '../render3d/fieldBackdrop.js';
import { ringPoint } from '../render3d/ring/ringShape.js';
import { BLOOM } from '../render3d/sceneSetup.js';
import { CAMERA_FAR, SpaceField } from '../render3d/spaceField.js';

const DEG = Math.PI / 180;
const KEY_ELEVATION = 40 * DEG;

// The shots, one per direction (proposta 17/11). `biome`: whose sky, haze
// and lights (src/data/biomes.js); `aim`: a point by the Ring [s along the
// arc from the break, r out from its centre line, y up from the deck];
// `az`/`el`/`d`: the camera about it (degrees round from outside the Ring,
// degrees up, units away); `fov` degrees; `keyFrom`: the key light from the
// camera's [right, up, back] (else the field's fixed key); `drift`: the slow
// swing (degrees of az and el, share of d) over `period` seconds. `rocks`:
// `at` [u, v, depth] — across the frame (−1..1) at `depth` units in front
// of the camera — radius `r`, and `glow` [peak, share of the cracks lit,
// their width, seconds a breath] for the light inside.
const CAMERA_KEY = [-0.6, 0.6, 0.5];
const BREATH = [0.6, 0.25, 0.035, 8];
export const SHOTS = {
  // The Ring sweeping overhead down to its break, beside the title.
  anel: {
    biome: 0,
    aim: [0, 0, 170],
    az: -50,
    el: 24,
    d: 560,
    fov: 40,
    keyFrom: CAMERA_KEY,
    drift: { az: 4, el: 1.5, d: 0.04, period: 80 },
    rocks: [
      { at: [-0.86, -0.62, 240], r: 20, glow: BREATH },
      { at: [0.84, 0.6, 420], r: 16 },
      { at: [-0.62, 0.72, 520], r: 10 },
      { at: [0.7, -0.72, 330], r: 12 },
    ],
  },
  // Low over the deck, the Ring running away into the dark.
  estrada: {
    biome: 0,
    aim: [240, 0, -10],
    az: 75,
    el: 22,
    d: 900,
    fov: 34,
    keyFrom: CAMERA_KEY,
    drift: { az: 3, el: 1.5, d: 0.04, period: 80 },
    rocks: [
      { at: [-0.72, -0.5, 140], r: 26, glow: BREATH },
      { at: [0.78, 0.5, 260], r: 16 },
      { at: [0.7, -0.7, 200], r: 11 },
      { at: [-0.86, 0.66, 320], r: 9 },
    ],
  },
  // The field from above, as the player sees it, the Ring far below.
  campo: {
    biome: 0,
    aim: [300, 0, 0],
    az: 0,
    el: 70,
    d: 1100,
    fov: 38,
    drift: { az: 10, el: 2, d: 0.03, period: 90 },
    rocks: [
      { at: [-0.7, -0.5, 700], r: 30 },
      { at: [0.75, -0.4, 820], r: 22, glow: BREATH },
      { at: [-0.3, 0.65, 900], r: 18 },
      { at: [0.5, 0.6, 760], r: 26 },
      { at: [0.1, -0.8, 640], r: 14 },
      { at: [-0.9, 0.2, 980], r: 20 },
    ],
  },
};

// The game's rocks are a touch bigger than their radius (enemies/rocks.js).
const ROCK_SCALE = 1.08;
// The rocks turn this share of their game spin: slow, never busy.
const ROCK_SPIN = 0.25;

/** Prototype: the shot `?abertura=anel|estrada|campo` asks for (dev only). */
export function openingShotFromUrl() {
  if (!IS_DEV) return null;
  return new URLSearchParams(window.location.search).get('abertura');
}

// Prototype: `&tune={"az":40,...}` overrides the shot's numbers (dev only).
function tuneFromUrl() {
  if (!IS_DEV) return {};
  try {
    return JSON.parse(
      new URLSearchParams(window.location.search).get('tune') || '{}'
    );
  } catch {
    return {};
  }
}

// Linear → sRGB after the bloom, as the game's composer ends.
const OUTPUT_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
  fragmentShader: `
uniform sampler2D tDiffuse;
uniform float uVignette;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float edge = smoothstep(0.35, 1.1, length(p));
  vec3 color = texture2D(tDiffuse, vUv).rgb * (1.0 - uVignette * edge);
  gl_FragColor = LinearTosRGB(vec4(color, 1.0));
}`,
};

/**
 * The scene for the menu `{ THREE, renderer, scene, camera }`, whose own
 * scene (the hull preview) draws over it; `shotName` one of SHOTS.
 */
export function createOpeningScene(
  { THREE, renderer, scene: overlayScene, camera: overlayCamera },
  shotName = 'anel'
) {
  const shot = { ...(SHOTS[shotName] ?? SHOTS.anel), ...tuneFromUrl() };
  const world = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(shot.fov, 16 / 9, 5, CAMERA_FAR);

  // The game's lights (sceneSetup.js): warm key from the upper left, cool
  // fill, a hemisphere so the dark sides never go void.
  const key = new THREE.DirectionalLight(colorOf(THREE, '#fff1e2'), 1.6);
  const keyDir = new THREE.Vector3(
    KEY_LIGHT_DIR.x * Math.cos(KEY_ELEVATION),
    Math.sin(KEY_ELEVATION),
    KEY_LIGHT_DIR.y * Math.cos(KEY_ELEVATION)
  );
  const fill = new THREE.DirectionalLight(colorOf(THREE, '#64748b'), 0.35);
  fill.position.set(0.7, 0.3, 0.65);
  const hemi = new THREE.HemisphereLight(
    colorOf(THREE, '#2a3346'),
    colorOf(THREE, '#050608'),
    0.3
  );
  world.add(key, key.target, fill, hemi);

  const backdrop = new FieldBackdrop(THREE, world);
  const ring = backdrop.ring;
  ring.follow = 0;
  backdrop.structures.group.visible = Boolean(shot.structures);
  backdrop.setWake(shot.wake ?? 0);
  const space = new SpaceField(THREE, world);

  // The post chain: the world in linear HDR, the game's bloom, sRGB out,
  // then the menu's scene over it and the edges smoothed.
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
  });
  const composer = new THREE.EffectComposer(renderer, target);
  const worldPass = new THREE.RenderPass(world, camera);
  const renderWorld = worldPass.render.bind(worldPass);
  worldPass.render = (...args) => {
    const toneMapping = renderer.toneMapping;
    const exposure = renderer.toneMappingExposure;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = shot.exposure ?? 1;
    renderWorld(...args);
    renderer.toneMapping = toneMapping;
    renderer.toneMappingExposure = exposure;
  };
  composer.addPass(worldPass);
  const bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    BLOOM.strength,
    BLOOM.radius,
    BLOOM.threshold
  );
  [
    bloomPass.renderTargetBright,
    ...bloomPass.renderTargetsHorizontal,
    ...bloomPass.renderTargetsVertical,
  ].forEach((rt) => {
    rt.texture.type = THREE.HalfFloatType;
    rt.depthBuffer = false;
  });
  composer.addPass(bloomPass);
  const output = new THREE.ShaderPass(OUTPUT_SHADER);
  output.uniforms.uVignette.value = shot.vignette ?? 0.5;
  output.uniforms.uAspect.value = size.x / size.y;
  composer.addPass(output);
  const overlayPass = new THREE.RenderPass(overlayScene, overlayCamera);
  overlayPass.clear = false;
  overlayPass.clearDepth = true;
  composer.addPass(overlayPass);
  if (THREE.SMAAPass) composer.addPass(new THREE.SMAAPass(size.x, size.y));

  const biomes = new BiomeController(THREE, {
    key,
    fill,
    hemi,
    hemiBase: hemi.intensity,
    bloomPass,
    bloomBase: BLOOM.strength,
    backdrop,
    space,
  });
  const biome = BIOMES[shot.biome] ?? BIOMES[0];
  biomes.update({ from: biome, to: biome, mix: 1 }, 0);

  // The rocks: the game's instanced rock views, posed in front of the shot.
  const kit = {
    THREE,
    scene: world,
    mapSeed: 7.31,
    quality: { surfaceMaps: true },
    seeded: (build) => build(),
  };
  const rockViews = createRockViews(kit);
  rockViews.refreshSurfaceMaps();

  const aim = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const local = new THREE.Vector3();
  const pose = (az, el, d) => {
    const [s, r, y] = shot.aim;
    const [ax, , az0] = ringPoint(s, r, y);
    const phi = Math.atan2(az0, ax);
    const out = [Math.cos(phi), Math.sin(phi)];
    const along = [Math.sin(phi), -Math.cos(phi)];
    const flat = d * Math.cos(el * DEG);
    local.set(
      ax + flat * (Math.cos(az * DEG) * out[0] + Math.sin(az * DEG) * along[0]),
      y + d * Math.sin(el * DEG),
      az0 + flat * (Math.cos(az * DEG) * out[1] + Math.sin(az * DEG) * along[1])
    );
    ring.object.updateMatrixWorld(true);
    aim.set(ax, y, az0);
    ring.object.localToWorld(aim);
    camera.position.copy(ring.object.localToWorld(local));
    camera.up.set(0, 1, 0);
    camera.lookAt(aim);
    camera.updateMatrixWorld();
  };

  // Rocks placed once from the held shot, so the drift parallaxes them.
  pose(shot.az, shot.el, shot.d);
  camera.aspect = size.x / size.y;
  camera.updateProjectionMatrix();
  const tan = Math.tan((shot.fov * DEG) / 2);
  const amber = colorOf(THREE, PALETTE.shot);
  const rocks = shot.rocks.map((spec, i) => {
    const view = rockViews.createRock();
    view.seed = 3 + i * 5;
    rockViews.bindRock(view, { variant: 'common' });
    view.rock.vein.copy(amber);
    const [u, v, depth] = spec.at;
    local.set(u * tan * depth * (16 / 9), v * tan * depth, -depth);
    view.object.position.copy(camera.localToWorld(local));
    view.object.scale.setScalar(spec.r * ROCK_SCALE);
    view.object.rotation.z = view.lean;
    return { view, glow: spec.glow ?? null, turn: i * 1.7 };
  });

  // A rock's veins breathe between a quarter and all of `glow[0]`.
  const poseRocks = () => {
    rockViews.rocks.begin();
    rocks.forEach(({ view, glow, turn }) => {
      const { object, rock } = view;
      object.rotation.y = turn + time * ROCK_SPIN * Math.sign(view.spinRate);
      object.rotation.x = view.spinPhase + time * ROCK_SPIN * view.spinRate;
      const g = rock.glow;
      if (glow) {
        const [max, reveal, width, period] = glow;
        const wave = 0.5 - 0.5 * Math.cos((2 * Math.PI * time) / period);
        g[0] = max * (0.25 + 0.75 * wave);
        g[1] = reveal;
        g[2] = width;
      } else {
        g[0] = 0;
        g[1] = 0;
        g[2] = 0.035;
      }
      g[3] = 0;
      object.updateMatrixWorld();
      rockViews.rocks.push(view);
    });
    rockViews.rocks.end();
  };

  let time = 0;
  let overlayHidden = false;
  return {
    world,
    camera,
    composer,
    resize(width, height) {
      composer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      output.uniforms.uAspect.value = camera.aspect;
    },
    update(dt, still) {
      // Only the hull stays of the menu's own scene (its belt never spawns).
      if (!overlayHidden) {
        overlayHidden = true;
        overlayScene.children.forEach((child) => {
          if (child !== overlayCamera && !child.isLight) child.visible = false;
        });
      }
      if (!still) time += dt;
      const { az, el, d, period } = shot.drift;
      const k = (2 * Math.PI * time) / period;
      pose(
        shot.az + az * Math.sin(k),
        shot.el + el * Math.sin(k * 0.7 + 1),
        shot.d * (1 + d * Math.sin(k * 0.5))
      );
      key.target.position.copy(aim);
      key.target.updateMatrixWorld();
      if (shot.keyFrom) {
        // From the camera's side, as the game lights the Ring's own shots
        // (bootstrap/ringScene.js): the forms model from any view.
        const [x, y, z] = shot.keyFrom;
        key.position
          .set(0, 0, 0)
          .addScaledVector(axis.setFromMatrixColumn(camera.matrixWorld, 0), x)
          .addScaledVector(axis.setFromMatrixColumn(camera.matrixWorld, 1), y)
          .addScaledVector(axis.setFromMatrixColumn(camera.matrixWorld, 2), z)
          .setLength(1000)
          .add(aim);
      } else {
        key.position.copy(keyDir).multiplyScalar(1000).add(aim);
      }
      poseRocks();
      const height = composer.renderTarget1.height;
      space.update(400, 300, still ? 0 : dt, {
        ship: null,
        shipLight: 0,
        pointScale: height / (2 * Math.tan((camera.fov * DEG) / 2)),
        pixel: height / 900,
      });
    },
    render() {
      composer.render();
    },
  };
}
