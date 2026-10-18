import { describe, expect, it } from 'vitest';
import { RUN_FINAL_LAYER } from '../../src/data/constants/gameplay.js';
import {
  BIOMES,
  BIOME_FADE_SECONDS,
  BiomeTransition,
  biomeForLayer,
} from '../../src/data/biomes.js';

const HEX = /^#[0-9a-f]{6}$/i;
const RGBA =
  /^rgba\(\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*(0|1|0?\.\d+)\s*\)$/;
const COLOR_FIELDS = [
  'hazeColor',
  'veinColor',
  'floorColor',
  'floorSpecks',
  'keyColor',
  'fillColor',
];

describe('biome table', () => {
  it('has three biomes whose layer ranges tile the run with no gap', () => {
    expect(BIOMES.map((b) => b.id)).toEqual([
      'outer-ring',
      'dense-core',
      'wardens-reach',
    ]);
    let next = 1;
    BIOMES.forEach((biome) => {
      expect(biome.layers[0]).toBe(next);
      expect(biome.layers[1]).toBeGreaterThanOrEqual(biome.layers[0]);
      next = biome.layers[1] + 1;
    });
    expect(next - 1).toBe(RUN_FINAL_LAYER);
  });

  it('writes every colour as a parseable hex or rgba string', () => {
    BIOMES.forEach((biome) => {
      biome.sky.forEach((c) => expect(c).toMatch(HEX));
      COLOR_FIELDS.forEach((field) => expect(biome[field]).toMatch(HEX));
      const rgba = biome.tint.match(RGBA);
      expect(rgba).not.toBeNull();
      rgba.slice(1, 4).forEach((v) => expect(Number(v)).toBeLessThan(256));
    });
  });

  it('maps layers to biomes, past the table into the last one', () => {
    expect(biomeForLayer(1).id).toBe('outer-ring');
    expect(biomeForLayer(5).id).toBe('outer-ring');
    expect(biomeForLayer(6).id).toBe('dense-core');
    expect(biomeForLayer(10).id).toBe('dense-core');
    expect(biomeForLayer(11).id).toBe('wardens-reach');
    expect(biomeForLayer(15).id).toBe('wardens-reach');
    expect(biomeForLayer(40).id).toBe('wardens-reach');
    expect(biomeForLayer(undefined).id).toBe('outer-ring');
  });
});

describe('BiomeTransition', () => {
  it('cuts straight into the first layer after reset, then fades', () => {
    const transition = new BiomeTransition();
    transition.enterLayer(12);
    expect(transition.to.id).toBe('wardens-reach');
    expect(transition.mix).toBe(1);

    transition.reset();
    transition.enterLayer(5);
    transition.enterLayer(6);
    expect(transition.from.id).toBe('outer-ring');
    expect(transition.to.id).toBe('dense-core');
    expect(transition.mix).toBe(0);
    transition.update(BIOME_FADE_SECONDS / 2);
    expect(transition.mix).toBeCloseTo(0.5);
    transition.update(BIOME_FADE_SECONDS);
    expect(transition.mix).toBe(1);
  });
});
