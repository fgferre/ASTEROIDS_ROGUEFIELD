/**
 * `?scene=ring` (dev only, app.js): the broken Ring alone in the game's 3D
 * scene (its lights, bloom, space and haze), a camera orbiting it from close
 * to far, so it can be judged from every side (modules/render3d/ring/).
 * `&at=` stump | gap | hull | end picks what it orbits; `&az=&el=&d=`
 * (degrees round it, degrees up, Ring units away) holds one pose instead of
 * the orbit; `&lod=0..2` forces one level of detail; `&wake=1` lights it.
 * Drag to turn, the wheel to come closer, 1–4 to switch target, Space to
 * resume the orbit. No game runs.
 */

import { BIOMES } from '../data/biomes.js';
import { FOV, setupThree } from '../modules/render3d/sceneSetup.js';
import {
  MODULE_COUNT,
  RING,
  moduleStart,
  ringPoint,
} from '../modules/render3d/ring/ringShape.js';

const DEG = Math.PI / 180;
// What the camera orbits: a point `s` along the arc, `y` up from the deck.
const TARGETS = {
  stump: { s: 24, y: -12 },
  gap: {
    s: (moduleStart(RING.gap[0]) + moduleStart(RING.gap.at(-1) + 1)) / 2,
    y: -12,
  },
  hull: { s: moduleStart(RING.ribEvery * 4) - RING.seam / 2, y: -10 },
  end: { s: moduleStart(MODULE_COUNT - 1) + 36, y: -12 },
};
// The orbit: a turn every ORBIT.turn s, the height swinging between
// `el` degrees, the distance between `near` and `far` every `breathe` s.
const ORBIT = { turn: 48, el: [-40, 35], near: 90, far: 1500, breathe: 36 };
// The key light comes from the camera's upper left, well off to the side so
// it models the forms, whichever side the camera looks from (the field's
// light comes from above; a journey scene lights the Ring its own way):
// across, up and back from the camera.
const KEY_FROM = [-0.6, 0.6, 0.5];

/** The `?scene=ring` options, or null without the flag. */
export function readRingScene(search) {
  const params = new URLSearchParams(search);
  if (params.get('scene') !== 'ring') return null;
  const number = (name) => {
    const value = Number(params.get(name));
    return params.has(name) && Number.isFinite(value) ? value : null;
  };
  const lod = number('lod');
  return {
    at: TARGETS[params.get('at')] ? params.get('at') : 'stump',
    az: number('az'),
    el: number('el'),
    d: number('d'),
    lod: lod === null ? null : Math.max(0, Math.min(2, Math.round(lod))),
    wake: number('wake') ?? 0,
  };
}

/**
 * Ring-local camera position orbiting `target` at azimuth `az` (0: outside
 * the Ring, 90: along the arc away from the break), elevation `el`
 * (radians) and distance `d`.
 */
export function orbitPoint(target, az, el, d) {
  const [x, , z] = ringPoint(target.s);
  const phi = RING.stump - target.s / RING.radius;
  const out = [Math.cos(phi), Math.sin(phi)];
  const along = [Math.sin(phi), -Math.cos(phi)];
  const flat = d * Math.cos(el);
  return [
    x + flat * (Math.cos(az) * out[0] + Math.sin(az) * along[0]),
    target.y + d * Math.sin(el),
    z + flat * (Math.cos(az) * out[1] + Math.sin(az) * along[1]),
  ];
}

export function startRingScene(
  options = readRingScene(window.location.search)
) {
  const t = setupThree((build) => build());
  const { THREE, canvas, renderer, camera, composer } = t;
  document.body.replaceChildren(canvas);
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
  const info = document.createElement('div');
  info.style.cssText =
    'position:fixed;left:12px;top:10px;z-index:10;font:12px/1.5 monospace;color:#9aa4b8;pointer-events:none;white-space:pre';
  document.body.append(info);

  const ring = t.backdrop.ring;
  ring.follow = 0;
  ring.forcedLevel = options.lod;
  t.backdrop.setWake(options.wake);
  t.biomes.update({ from: BIOMES[0], to: BIOMES[0], mix: 1 }, 0);
  // Only the broken Ring: not the arena's veil nor the intact Ring.
  t.veil.group.visible = false;
  t.backdrop.structures.group.visible = false;
  t.impactPass.enabled = false;
  const view = {
    at: options.at,
    az: (options.az ?? 30) * DEG,
    el: (options.el ?? 15) * DEG,
    d: options.d ?? 260,
    orbiting: options.az === null,
  };
  const keys = Object.keys(TARGETS);
  window.addEventListener('keydown', (event) => {
    const n = Number(event.key);
    if (n >= 1 && n <= keys.length) view.at = keys[n - 1];
    if (event.key === ' ') view.orbiting = true;
  });
  let drag = null;
  canvas.addEventListener('pointerdown', (event) => {
    drag = { x: event.clientX, y: event.clientY };
    view.orbiting = false;
  });
  window.addEventListener('pointerup', () => {
    drag = null;
  });
  window.addEventListener('pointermove', (event) => {
    if (!drag) return;
    view.az -= (event.clientX - drag.x) * 0.006;
    view.el = Math.max(
      -85 * DEG,
      Math.min(85 * DEG, view.el + (event.clientY - drag.y) * 0.006)
    );
    drag = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      view.orbiting = false;
      view.d = Math.max(
        30,
        Math.min(4000, view.d * Math.exp(event.deltaY * 0.001))
      );
    },
    { passive: false }
  );

  const local = new THREE.Vector3();
  const up = new THREE.Vector3();
  const right = new THREE.Vector3();
  const back = new THREE.Vector3();
  let width = 0;
  let height = 0;
  let last = performance.now();
  let clock = 0;
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (canvas.width !== innerWidth || canvas.height !== innerHeight) {
      canvas.width = innerWidth;
      canvas.height = innerHeight;
    }
    if (width !== canvas.width || height !== canvas.height) {
      width = canvas.width;
      height = canvas.height;
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    if (view.orbiting) {
      clock += dt;
      view.az += (2 * Math.PI * dt) / ORBIT.turn;
      const [low, high] = ORBIT.el;
      view.el =
        (low + (high - low) * (0.5 + 0.5 * Math.sin(clock * 0.31))) * DEG;
      const swing = 0.5 - 0.5 * Math.cos((2 * Math.PI * clock) / ORBIT.breathe);
      view.d = ORBIT.near * (ORBIT.far / ORBIT.near) ** swing;
    }
    const target = TARGETS[view.at];
    ring.object.updateMatrixWorld(true);
    const aim = ring.object.localToWorld(
      new THREE.Vector3(...ringPoint(target.s, 0, target.y))
    );
    camera.position.copy(
      ring.object.localToWorld(
        local.fromArray(orbitPoint(target, view.az, view.el, view.d))
      )
    );
    camera.up.set(0, 1, 0).transformDirection(ring.object.matrixWorld);
    camera.lookAt(aim);
    camera.near = Math.max(0.5, view.d * 0.02);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    t.key.target.position.copy(aim);
    t.key.target.updateMatrixWorld();
    t.key.position
      .set(0, 0, 0)
      .addScaledVector(
        right.setFromMatrixColumn(camera.matrixWorld, 0),
        KEY_FROM[0]
      )
      .addScaledVector(
        up.setFromMatrixColumn(camera.matrixWorld, 1),
        KEY_FROM[1]
      )
      .addScaledVector(
        back.setFromMatrixColumn(camera.matrixWorld, 2),
        KEY_FROM[2]
      )
      .setLength(1000)
      .add(aim);

    t.space.update(400, 300, dt, {
      ship: null,
      shipLight: 0,
      pointScale: height / (2 * Math.tan((FOV * Math.PI) / 360)),
      pixel: height / 900,
    });
    renderer.info.reset();
    composer.render(dt);

    const levels = [0, 0, 0];
    ring.chunks.forEach((chunk) => {
      levels[chunk.level] += 1;
    });
    info.textContent = [
      `Ring · ${view.at} · ${Math.round(view.d)} units · ${view.orbiting ? 'orbit' : 'held'}`,
      `chunks far ${levels[0]} · mid ${levels[1]} · near ${levels[2]}${ring.forcedLevel === null ? '' : ' (forced)'}`,
      `${renderer.info.render.triangles.toLocaleString()} tris · ${renderer.info.render.calls} draws`,
      "key light from the camera's left · drag turn · wheel zoom · 1-4 stump/gap/hull/end · space orbit",
    ].join('\n');
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // The scene's kit for the console and capture scripts.
  window.ringScene = t;
  return t;
}
