import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { QUALITY_PRESETS } from '../../../src/core/qualityPresets.js';
import { watchContextRestore } from '../../../src/modules/render3d/sceneSetup.js';
import {
  CAMERA_FAR,
  SpaceField,
} from '../../../src/modules/render3d/spaceField.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

describe('a restored graphics context', () => {
  it('bakes the far nebula again and rebuilds the reflection map', () => {
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
    const pmrem = vi.fn(() => ({
      fromScene: () => ({ texture: { fresh: true, dispose } }),
      dispose() {},
    }));
    const fake = Object.assign(Object.create(THREE), {
      PMREMGenerator: pmrem,
    });
    const first = { dispose: vi.fn() };
    scene.environment = first;
    watchContextRestore(fake, renderer, scene, space);

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
    expect(scene.environment.fresh).toBe(true);
    expect(first.dispose).toHaveBeenCalled();
    scene.onBeforeRender(renderer, scene, camera);
    expect(farBakes()).toBe(2);
  });
});
