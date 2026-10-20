import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BrokenRing,
  RING_LOD,
  ringChunks,
} from '../../../../src/modules/render3d/ring/brokenRing.js';
import {
  MODULE_COUNT,
  RING,
  ringPoint,
} from '../../../../src/modules/render3d/ring/ringShape.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

// The gameplay camera (cameraRig.js): the follow shot on world (x, z), its
// distance × `k`, tilted `tilt`° — the field's centre, its left (the break in
// view), a corner, and the intro and epilogue's far ends.
const FOLLOW = 671;
const POSES = {
  centre: [0, 0, 1, 18],
  left: [-250, 40, 1, 18],
  corner: [-180, -150, 1, 18],
  intro: [0, -420, 3.2, 32],
  epilogue: [0, -160, 2.6, 26],
};
function gameplayCamera([x, z, k, tilt]) {
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 10, 20000);
  const a = (tilt * Math.PI) / 180;
  camera.position.set(
    x,
    FOLLOW * k * Math.cos(a),
    z + FOLLOW * k * Math.sin(a)
  );
  camera.up.set(0, 0, -1);
  camera.lookAt(x, 0, z);
  camera.updateMatrixWorld();
  return camera;
}

// A camera `d` from the Ring's centre line at `s` along it, straight out.
function closeCamera(ring, s, d) {
  ring.object.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 1, 20000);
  camera.position.copy(
    ring.object.localToWorld(new THREE.Vector3(...ringPoint(s, d, 0)))
  );
  camera.lookAt(ring.object.localToWorld(new THREE.Vector3(...ringPoint(s))));
  camera.updateMatrixWorld();
  return camera;
}

// Per screen row (NDC y), the x range the drawn Ring's vertices span.
const ROWS = [-0.4, 0, 0.4, 0.8];
function rowSpans(ring, camera) {
  const spans = ROWS.map(() => [Infinity, -Infinity]);
  const v = new THREE.Vector3();
  ring.object.children.forEach((mesh) => {
    if (!mesh.visible) return;
    const p = mesh.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i += 1) {
      v.fromBufferAttribute(p, i)
        .applyMatrix4(mesh.matrixWorld)
        .project(camera);
      ROWS.forEach((y, r) => {
        if (Math.abs(v.y - y) < 0.03) {
          spans[r][0] = Math.min(spans[r][0], v.x);
          spans[r][1] = Math.max(spans[r][1], v.x);
        }
      });
    }
  });
  return spans;
}

describe('BrokenRing', () => {
  it('splits the arc into chunks that cover every module once', () => {
    const chunks = ringChunks();
    expect(chunks[0].from).toBe(0);
    chunks.forEach((chunk, c) => {
      if (c > 0) expect(chunk.from).toBe(chunks[c - 1].to);
    });
    expect(chunks.at(-1).to).toBe(MODULE_COUNT);
  });

  it('draws the far level everywhere from the gameplay camera, building nothing finer', () => {
    const ring = new BrokenRing(THREE);
    Object.values(POSES).forEach((pose) => {
      ring.update(gameplayCamera(pose));
      ring.chunks.forEach((chunk) => {
        expect(chunk.level).toBe(0);
        expect(chunk.meshes.length).toBe(1);
      });
    });
    expect(ring.object.children.length).toBe(ring.chunks.length);
  });

  // Today's Ring (one mesh, before levels) from the same cameras.
  it('keeps the gameplay framing: the Ring spans the same screen as before', () => {
    const BEFORE = {
      centre: [
        [-0.6821, -0.4836],
        [-0.3877, -0.2012],
        [-0.168, -0.0203],
        [0.0095, 0.1378],
      ],
      left: [
        [-0.5462, -0.3328],
        [-0.2676, -0.1057],
        [-0.0564, 0.1087],
        [0.1169, 0.2369],
      ],
      epilogue: [
        [-0.3699, -0.2431],
        [-0.1131, -0.012],
        [0.0519, 0.1235],
        [0.1223, 0.1771],
      ],
    };
    const ring = new BrokenRing(THREE);
    Object.entries(BEFORE).forEach(([name, spans]) => {
      const camera = gameplayCamera(POSES[name]);
      ring.update(camera);
      rowSpans(ring, camera).forEach(([left, right], r) => {
        expect(Math.abs(left - spans[r][0])).toBeLessThan(0.003);
        expect(Math.abs(right - spans[r][1])).toBeLessThan(0.003);
      });
    });
  });

  it('gives a close camera the finer levels of the chunks near it, and drops them as it leaves', () => {
    const ring = new BrokenRing(THREE);
    ring.follow = 0;
    ring.update(closeCamera(ring, 30, RING_LOD.near * 0.5));
    expect(ring.chunks[0].level).toBe(2);
    expect(ring.chunks.at(-1).level).toBe(0);
    expect(ring.object.children.length).toBeGreaterThan(ring.chunks.length);

    ring.update(closeCamera(ring, 30, (RING_LOD.near + RING_LOD.mid) / 2));
    expect(ring.chunks[0].level).toBe(1);
    const built = ring.object.children.length;
    ring.update(closeCamera(ring, 30, RING_LOD.mid * 2));
    expect(ring.chunks[0].level).toBe(0);
    expect(ring.chunks[0].meshes.filter((m) => m.visible)).toEqual([
      ring.chunks[0].meshes[0],
    ]);
    // Finer levels are kept for the next approach.
    expect(ring.object.children.length).toBe(built);
  });

  it('forces one level everywhere when asked', () => {
    const ring = new BrokenRing(THREE);
    ring.forcedLevel = 1;
    ring.update(gameplayCamera(POSES.centre));
    expect(ring.chunks.every((chunk) => chunk.level === 1)).toBe(true);
  });

  it('follows the camera aim by a share, so it parallaxes like something deeper; not at follow 0', () => {
    const ring = new BrokenRing(THREE);
    const camera = new THREE.PerspectiveCamera(38, 16 / 9, 10, 20000);
    camera.position.set(100, 600, 250);
    camera.lookAt(100, 0, 50);
    camera.updateMatrixWorld();
    ring.update(camera);
    expect(ring.object.position.x).toBeCloseTo(
      RING.centre[0] + 100 * RING.follow
    );
    expect(ring.object.position.y).toBe(RING.centre[1]);
    expect(ring.object.position.z).toBeCloseTo(
      RING.centre[2] + 50 * RING.follow
    );
    ring.follow = 0;
    ring.update(camera);
    expect(ring.object.position.toArray()).toEqual(RING.centre);
  });

  it('patches one lit material for every chunk: tone from the piece, haze and lights after the tone map', () => {
    const ring = new BrokenRing(THREE);
    ring.forcedLevel = 2;
    ring.update(gameplayCamera(POSES.centre));
    const materials = new Set(ring.object.children.map((m) => m.material));
    expect(materials.size).toBe(1);
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    };
    ring.material.onBeforeCompile(shader);
    expect(shader.vertexShader).toContain('vRingHaze =');
    expect(shader.vertexShader).toContain('vRingTone =');
    expect(shader.fragmentShader).not.toContain('#include <color_fragment>');
    const fragment = shader.fragmentShader;
    expect(fragment.indexOf('uHaze, vRingHaze')).toBeGreaterThan(
      fragment.indexOf('#include <tonemapping_fragment>')
    );
    expect(shader.uniforms.uWake).toBe(ring.uniforms.uWake);
  });
});
