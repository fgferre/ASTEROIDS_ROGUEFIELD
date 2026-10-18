import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BIOMES,
  BIOME_FADE_SECONDS,
  BiomeTransition,
} from '../../../src/data/biomes.js';
import { BiomeController } from '../../../src/modules/render3d/biomes3d.js';

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

describe('BiomeController', () => {
  it('fades lights, bloom and the look onto the next biome in 2 s', () => {
    const looks = [];
    const targets = {
      key: new THREE.DirectionalLight(),
      fill: new THREE.DirectionalLight(),
      bloomPass: { strength: 0 },
      bloomBase: 0.9,
      backdrop: { setLook: (look) => looks.push({ ...look }) },
      floor: { setLook: () => {} },
    };
    const controller = new BiomeController(THREE, targets);
    const transition = new BiomeTransition();
    transition.enterLayer(5);
    transition.enterLayer(6);

    controller.update(transition);
    const [outer, core] = BIOMES;
    expect(targets.key.intensity).toBeCloseTo(outer.keyIntensity);

    for (let t = 0; t < BIOME_FADE_SECONDS + 0.1; t += 1 / 60) {
      transition.update(1 / 60);
      controller.update(transition);
    }
    expect(targets.key.intensity).toBeCloseTo(core.keyIntensity);
    expect(targets.key.color.getHex()).toBe(linear(core.keyColor).getHex());
    expect(targets.fill.intensity).toBeCloseTo(core.fillIntensity);
    expect(targets.bloomPass.strength).toBeCloseTo(0.9 * core.bloomScale);
    const last = looks[looks.length - 1];
    expect(last.mix).toBe(1);
    expect(last.veinDensity).toBeCloseTo(core.veinDensity);

    // Settled: nothing is re-applied.
    const count = looks.length;
    controller.update(transition);
    expect(looks).toHaveLength(count);
  });
});
