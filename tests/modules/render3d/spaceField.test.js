import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BIOMES, BiomeTransition } from '../../../src/data/biomes.js';
import { BiomeController } from '../../../src/modules/render3d/biomes3d.js';
import {
  BRIGHT_STARS,
  NEBULA_DEPTH,
  NEBULA_GAIN,
  STAR_LAYERS,
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
    expect(space.nebula.position.y).toBe(-NEBULA_DEPTH);
    expect(-NEBULA_DEPTH).toBeLessThan(heights(space.layers[2]).min);
  });

  it('advances the twinkle clock every frame', () => {
    const space = new SpaceField(THREE, new THREE.Scene());
    const time = space.layers[0].material.uniforms.uTime;
    space.update(400, 300, 0.5, frame);
    space.update(400, 300, 0.25, frame);
    expect(time.value).toBeCloseTo(0.75);
    expect(space.bright.material.uniforms.uTime).toBe(time);
  });

  it('fades the nebula and the dust onto the next biome', () => {
    const space = new SpaceField(THREE, new THREE.Scene());
    const controller = new BiomeController(THREE, {
      key: new THREE.DirectionalLight(),
      fill: new THREE.DirectionalLight(),
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
    const u = space.nebulaUniforms;
    expect(u.uHaze.value.getHex()).toBe(linear(reach.hazeColor).getHex());
    expect(u.uBase0.value.getHex()).toBe(linear(reach.sky[0]).getHex());
    expect(u.uHazeDensity.value).toBeCloseTo(
      reach.hazeDensity * NEBULA_GAIN.haze
    );
    expect(space.dustUniforms.uColor.value.getHex()).toBe(
      linear(reach.dustColor).getHex()
    );
  });
});
