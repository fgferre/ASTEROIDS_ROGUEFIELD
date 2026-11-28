import { describe, expect, it, vi } from 'vitest';
import { QUALITY_PRESETS } from '../../../src/core/qualityPresets.js';
import { takeSceneSky } from '../../../src/modules/render3d/hullModel.js';
import { watchContextRestore } from '../../../src/modules/render3d/sceneSetup.js';
import {
  CAMERA_FAR,
  SpaceField,
} from '../../../src/modules/render3d/spaceField.js';
import THREE from '../../../src/modules/render3d/three.js';

describe('a restored graphics context', () => {
  it('bakes the far nebula again and rebuilds both reflection skies with one generator', () => {
    const scene = new THREE.Scene();
    const space = new SpaceField(THREE, scene);
    space.setLayers(QUALITY_PRESETS.low.spaceLayers);
    const listeners = {};
    const renderer = {
      domElement: { addEventListener: (name, fn) => (listeners[name] = fn) },
      getRenderTarget: () => null,
      setRenderTarget: vi.fn(),
      render: vi.fn(),
    };
    const dispose = vi.fn();
    // three names what it builds with Math.random: rebuilt seeded
    let inSeeded = false;
    const seeded = vi.fn((fn) => {
      inSeeded = true;
      try {
        return fn();
      } finally {
        inSeeded = false;
      }
    });
    // Called with `new`: a function, not an arrow (Vitest 4).
    const pmrem = vi.fn(function () {
      expect(inSeeded).toBe(true);
      return {
        fromScene: () => ({ texture: { fresh: true, dispose } }),
        dispose() {},
      };
    });
    const fake = Object.assign(Object.create(THREE), {
      PMREMGenerator: pmrem,
    });
    const first = { dispose: vi.fn() };
    scene.environment = first;
    const hullFirst = { dispose: vi.fn() };
    const hull = [{ envMap: hullFirst }, { envMap: hullFirst }];
    // a material that takes the scene's sky at its own strength carries it
    const steel = new THREE.MeshStandardMaterial({ envMapIntensity: 1.2 });
    const paint = new THREE.MeshStandardMaterial();
    takeSceneSky(scene, [steel, paint]);
    expect(steel.envMap).toBe(first);
    expect(paint.envMap).toBe(null);
    watchContextRestore(fake, renderer, scene, space, hull, seeded);

    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 10, CAMERA_FAR);
    camera.position.set(0, 550, 180);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    scene.onBeforeRender(renderer, scene, camera);
    const farBakes = () =>
      renderer.setRenderTarget.mock.calls.filter(
        ([target]) => target === space.farTarget
      ).length;
    expect(farBakes()).toBe(1);
    scene.onBeforeRender(renderer, scene, camera);
    expect(farBakes()).toBe(1);

    listeners.webglcontextrestored();
    expect(seeded).toHaveBeenCalledTimes(1);
    expect(scene.environment.fresh).toBe(true);
    expect(first.dispose).toHaveBeenCalled();
    expect(hull.every((m) => m.envMap.fresh)).toBe(true);
    expect(hullFirst.dispose).toHaveBeenCalled();
    expect(steel.envMap).toBe(scene.environment);
    expect(paint.envMap).toBe(null);
    // One generator for both skies: a second one after a dispose in the same
    // renderer frame drew the shared blur planes unsent, black (sceneSetup.js)
    expect(pmrem).toHaveBeenCalledTimes(1);
    scene.onBeforeRender(renderer, scene, camera);
    expect(farBakes()).toBe(2);
  });
});
