// src/modules/menu/openingScene.js
//
// The opening scene behind the title (proposta 17/11): the place the pilot
// arrives at, built from the game's own pieces — its space (nebula, stars,
// dust: render3d/spaceField.js), the broken Ring (render3d/fieldBackdrop.js)
// and its rocks with the light inside (render3d/enemies/rocks.js) — under
// the game's lights, tone and bloom, in a world of its own. The menu's own
// scene (the hull preview) draws over it, unchanged. Each time the game
// opens it draws one of three shots, and the camera drifts slowly about it;
// rocks of every size drift there and now and then one is hurled into
// another (openingRocks.js). With reduced motion it all holds still.

import { BIOMES } from '../../data/biomes.js';
import { IS_DEV } from '../../core/env.js';
import { KEY_LIGHT_DIR } from '../../data/constants/palette.js';
import { colorOf } from '../render3d/batches.js';
import { BiomeController } from '../render3d/biomes3d.js';
import { createRockViews } from '../render3d/enemies/rocks.js';
import { createOpeningRocks } from './openingRocks.js';
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
// swing (degrees of az and el, share of d) over `period` seconds; `field`:
// the rocks' box, `near`..`far` units ahead of the camera, how many drift
// there and their size (openingRocks.js).
const CAMERA_KEY = [-0.6, 0.6, 0.5];
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
    field: { near: 180, far: 700, count: 7 },
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
    field: { near: 120, far: 520, count: 6 },
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
    field: { near: 600, far: 1050, count: 10, scale: 1.5 },
  },
};

/** `?abertura=anel|estrada|campo` holds one shot (dev captures). */
export function openingShotFromUrl() {
  if (!IS_DEV) return null;
  return new URLSearchParams(window.location.search).get('abertura');
}

// How much the frame's edges darken (the game's soft vignette, NORTE §2).
const VIGNETTE = 0.5;

// Three's ACES and linear → sRGB after the bloom, as the game's composer ends.
const OUTPUT_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0 },
    uAspect: { value: 1 },
    toneMappingExposure: { value: 1 },
  },
  vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
  fragmentShader: `
#include <tonemapping_pars_fragment>
uniform sampler2D tDiffuse;
uniform float uVignette;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float edge = smoothstep(0.35, 1.1, length(p));
  vec3 color = ACESFilmicToneMapping(texture2D(tDiffuse, vUv).rgb)
    * (1.0 - uVignette * edge);
  gl_FragColor = sRGBTransferOETF(vec4(color, 1.0));
}`,
};

/**
 * The scene for the menu (its THREE, renderer, scene, camera), whose own
 * scene (the hull preview) draws over it; `random` a seeded () => [0, 1).
 * One of SHOTS, drawn each time the game opens (the owner, 17/11: "vamos
 * sempre sortear qq um dos 3"), or `shotName`.
 */
export function createOpeningScene(menu, random, shotName = null) {
  const { THREE, renderer, scene: overlayScene, camera: overlayCamera } = menu;
  // Three draws its UUIDs from Math.random: new rocks and the Ring's levels
  // of detail are built from the menu's seeded stream.
  const seeded = (fn) => menu.withSeededMathRandom(fn);
  const names = Object.keys(SHOTS);
  const name = SHOTS[shotName]
    ? shotName
    : names[Math.floor(random() * names.length)];
  const shot = SHOTS[name];
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
  // The broken Ring only: the intact one belongs to the deepest place.
  backdrop.structures.group.visible = false;
  const space = new SpaceField(THREE, world);
  // A lost graphics context that comes back finds the nebula's maps empty.
  renderer.domElement.addEventListener('webglcontextrestored', () =>
    space.invalidateBakes()
  );

  // The post chain: the world in linear HDR, the game's bloom, three's ACES
  // and sRGB out, then the menu's scene over it and the edges smoothed.
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
  });
  const composer = new THREE.EffectComposer(renderer, target);
  // Sized in drawing-buffer pixels (setSize below), so at ratio 1: it takes
  // the renderer's, the device's, and would draw the chain at twice the
  // screen's width and height.
  composer.setPixelRatio(1);
  composer.addPass(new THREE.RenderPass(world, camera));
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
  output.uniforms.uVignette.value = VIGNETTE;
  output.uniforms.uAspect.value = size.x / size.y;
  // The world's exposure is the menu renderer's (it tone-maps nothing itself).
  Object.defineProperty(output.uniforms.toneMappingExposure, 'value', {
    get: () => renderer.toneMappingExposure,
  });
  composer.addPass(output);
  const overlayPass = new THREE.RenderPass(overlayScene, overlayCamera);
  overlayPass.clear = false;
  overlayPass.clearDepth = true;
  composer.addPass(overlayPass);
  // The last pass draws to the screen: it stays on at every quality (the
  // menu's own pass alone would draw only the hull).
  if (THREE.SMAAPass) composer.addPass(new THREE.SMAAPass());

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

  // The rocks' box hangs in the held shot, so the drift parallaxes it.
  pose(shot.az, shot.el, shot.d);
  camera.aspect = size.x / size.y;
  camera.updateProjectionMatrix();
  const rocks = createOpeningRocks({
    THREE,
    world,
    frame: camera.matrixWorld,
    fov: shot.fov,
    aspect: camera.aspect,
    field: shot.field,
    rockViews,
    random,
    debris: backdrop.debris,
  });
  const shake = new THREE.Vector3();

  let time = 0;
  let overlayHidden = false;
  return {
    name,
    // Its rocks, for captures (rocks.burstAt).
    rocks,
    world,
    camera,
    composer,
    // The menu's adaptive quality (menu/adaptiveQuality.js, 0 low .. 3
    // ultra): low drops the bloom.
    setQuality(level) {
      bloomPass.enabled = level > 0;
    },
    // The composer's own pixel ratio is 1: it takes the drawing buffer's
    // size, not CSS pixels, or the menu would render at a fraction of them.
    resize(width, height) {
      const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
      composer.setSize(buffer.x, buffer.y);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      output.uniforms.uAspect.value = camera.aspect;
    },
    // While the menu is stopped (in play) its big targets shrink to 1x1;
    // resize() brings them back, with no object rebuilt.
    release() {
      composer.setSize(1, 1);
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
      const height = composer.renderTarget1.height;
      const pointScale = height / (2 * Math.tan((camera.fov * DEG) / 2));
      seeded(() => rocks.update(dt, time, still, pointScale));
      // A hard hit shakes the camera a little.
      const amount = rocks.shake.amount;
      if (amount > 0.01) {
        shake.set(Math.sin(time * 61), Math.sin(time * 47 + 1), 0);
        shake.multiplyScalar(amount).applyQuaternion(camera.quaternion);
        camera.position.add(shake);
        camera.updateMatrixWorld();
      }
      space.update(400, 300, still ? 0 : dt, {
        ship: null,
        shipLight: 0,
        pointScale,
        pixel: height / 900,
      });
    },
    render() {
      seeded(() => composer.render());
    },
  };
}
