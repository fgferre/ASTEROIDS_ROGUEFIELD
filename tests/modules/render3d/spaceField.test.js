import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { QUALITY_PRESETS } from '../../../src/core/qualityPresets.js';
import { BIOMES, BiomeTransition } from '../../../src/data/biomes.js';
import { BiomeController } from '../../../src/modules/render3d/biomes3d.js';
import {
  BRIGHT_STARS,
  DUST_CLOUDS,
  NEBULA_FAR,
  NEBULA_GAIN,
  NEBULA_MID,
  NEBULA_NEAR,
  STAR_LAYERS,
  SpaceField,
  TWINKLE,
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

const linear = (css) => new THREE.Color(css).convertSRGBToLinear();
const frame = { ship: null, shipLight: 0, pointScale: 1000, pixel: 1 };

function heights(points) {
  const { array } = points.geometry.attributes.position;
  const ys = [];
  for (let i = 1; i < array.length; i += 3) ys.push(array[i]);
  return { min: Math.min(...ys), max: Math.max(...ys) };
}

describe('SpaceField', () => {
  it('stacks the star layers at their depths below the field, far ones behind', () => {
    const space = new SpaceField(THREE, new THREE.Scene());
    expect(STAR_LAYERS.map((l) => l.depth)).toEqual([600, 1400, 3000]);
    STAR_LAYERS.forEach((layer, i) => {
      const points = space.layers[i];
      expect(points.geometry.attributes.position.count).toBe(layer.count);
      const { min, max } = heights(points);
      expect(max).toBeLessThanOrEqual(-layer.depth);
      expect(min).toBeGreaterThan(-layer.depth * 1.1);
    });
    expect(space.bright.geometry.attributes.position.count).toBe(
      BRIGHT_STARS.count
    );
    // the nebula's three planes between the star layers, far to near
    expect(space.far.position.y).toBe(-NEBULA_FAR.depth);
    expect(-NEBULA_FAR.depth).toBeLessThan(heights(space.layers[2]).min);
    expect(space.mid.position.y).toBe(-NEBULA_MID.depth);
    expect(-NEBULA_MID.depth).toBeGreaterThan(heights(space.layers[2]).max);
    expect(-NEBULA_MID.depth).toBeLessThan(heights(space.bright).min);
    expect(space.near.position.y).toBe(-NEBULA_NEAR.depth);
    expect(-NEBULA_NEAR.depth).toBeGreaterThan(heights(space.bright).max);
    expect(-NEBULA_NEAR.depth).toBeLessThan(heights(space.layers[1]).min);
    // the clouds between the field and the near stars' deepest
    const { array } = space.clouds.geometry.attributes.position;
    expect(array.length / 12).toBe(DUST_CLOUDS.count);
    const { min, max } = heights(space.clouds);
    expect(min).toBeGreaterThanOrEqual(DUST_CLOUDS.bottom);
    expect(max).toBeLessThanOrEqual(DUST_CLOUDS.top);
  });

  it('makes deeper stars dimmer and smaller, and keeps the far layer steady', () => {
    const space = new SpaceField(THREE, new THREE.Scene());
    for (let i = 1; i < STAR_LAYERS.length; i += 1) {
      expect(STAR_LAYERS[i].gain).toBeLessThan(STAR_LAYERS[i - 1].gain);
      expect(STAR_LAYERS[i].size[1]).toBeLessThan(STAR_LAYERS[i - 1].size[1]);
    }
    const swings = space.layers.map((points) =>
      points.geometry.attributes.aTwinkle.array.filter((_, i) => i % 3 === 2)
    );
    expect(Math.max(...swings[0])).toBeLessThanOrEqual(TWINKLE.amount);
    expect(Math.min(...swings[0])).toBeGreaterThan(0);
    expect(Math.max(...swings[2])).toBe(0);
  });

  it('bakes the far nebula once, into its own target, and restores the frame target', () => {
    const scene = new THREE.Scene();
    const space = new SpaceField(THREE, scene);
    const frameTarget = {};
    const renderer = {
      getRenderTarget: () => frameTarget,
      setRenderTarget: vi.fn(),
      render: vi.fn(),
    };
    scene.onBeforeRender(renderer);
    scene.onBeforeRender(renderer);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.render.mock.calls[0][0]).toBe(space.bakeScene);
    expect(renderer.setRenderTarget.mock.calls).toEqual([
      [space.farTarget],
      [frameTarget],
    ]);
    expect(space.far.material.uniforms.uMap.value).toBe(
      space.farTarget.texture
    );
  });

  it('draws the live layers by quality: far only on low, mid from medium, all from high', () => {
    const space = new SpaceField(THREE, new THREE.Scene());
    const shown = (level) => {
      space.setLayers(QUALITY_PRESETS[level].spaceLayers);
      return [space.far, space.mid, space.near, space.clouds].map(
        (object) => object.visible
      );
    };
    expect(shown('low')).toEqual([true, false, false, false]);
    expect(shown('medium')).toEqual([true, true, false, false]);
    expect(shown('high')).toEqual([true, true, true, true]);
    expect(shown('ultra')).toEqual([true, true, true, true]);
  });

  it('keeps all of space unlit and out of the shadow map', () => {
    const scene = new THREE.Scene();
    new SpaceField(THREE, scene);
    scene.traverse((object) => {
      if (!object.material) return;
      expect(object.castShadow || object.receiveShadow).toBe(false);
      expect(object.material.lights).toBe(false);
    });
  });

  it('advances the twinkle clock every frame', () => {
    const space = new SpaceField(THREE, new THREE.Scene());
    const time = space.layers[0].material.uniforms.uTime;
    space.update(400, 300, 0.5, frame);
    space.update(400, 300, 0.25, frame);
    expect(time.value).toBeCloseTo(0.75);
    expect(space.bright.material.uniforms.uTime).toBe(time);
  });

  it('fades the nebula, the clouds and the dust onto the next biome', () => {
    const space = new SpaceField(THREE, new THREE.Scene());
    const controller = new BiomeController(THREE, {
      key: new THREE.DirectionalLight(),
      fill: new THREE.DirectionalLight(),
      hemi: new THREE.HemisphereLight(),
      hemiBase: 0.3,
      bloomPass: { strength: 0 },
      bloomBase: 1,
      backdrop: { setLook: () => {} },
      space,
    });
    const transition = new BiomeTransition();
    transition.enterLayer(10);
    transition.enterLayer(11);
    for (let t = 0; t < 2.5; t += 1 / 60) {
      transition.update(1 / 60);
      controller.update(transition);
    }
    const reach = BIOMES[2];
    const haze = linear(reach.hazeColor);
    const u = space.farUniforms;
    expect(u.uBase0.value.getHex()).toBe(linear(reach.sky[0]).getHex());
    expect(u.uHazeDensity.value).toBeCloseTo(
      reach.hazeDensity * NEBULA_GAIN.haze
    );
    // the far layer darker and greyer than the haze it comes from
    const spread = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
    expect(u.uHaze.value.b).toBeLessThan(haze.b);
    expect(spread(u.uHaze.value)).toBeLessThan(spread(haze));
    expect(space.midUniforms.uHaze.value.getHex()).toBe(haze.getHex());
    // faint near wisps, clouds in the haze and never past their alpha
    const edge = space.nearUniforms.uEdge.value;
    expect(Math.max(edge.r, edge.g, edge.b)).toBeLessThanOrEqual(
      NEBULA_NEAR.alpha
    );
    expect(space.cloudUniforms.uColor.value.getHex()).toBe(
      haze.clone().multiplyScalar(DUST_CLOUDS.lift).getHex()
    );
    expect(space.cloudUniforms.uAlpha.value).toBeGreaterThan(0);
    expect(space.cloudUniforms.uAlpha.value).toBeLessThanOrEqual(
      DUST_CLOUDS.alpha
    );
    expect(space.dustUniforms.uColor.value.getHex()).toBe(
      linear(reach.dustColor).getHex()
    );
  });
});
