import { describe, expect, it } from 'vitest';
import { BIOMES } from '../../src/data/biomes.js';
import { LAYERS } from '../../src/data/layers.js';
import {
  SECTORS,
  localLayer,
  nextSector,
  sectorById,
} from '../../src/data/sectors.js';

describe('sector table', () => {
  it('fits each sector inside its biome, ending on a Warden layer', () => {
    expect(SECTORS.map((s) => s.chapter)).toEqual([1, 2, 3]);
    SECTORS.forEach((sector) => {
      const biome = BIOMES.find((b) => b.id === sector.biome);
      const [first, last] = sector.layers;
      expect(first).toBeGreaterThanOrEqual(biome.layers[0]);
      expect(last).toBeLessThanOrEqual(biome.layers[1]);
      expect(first).toBeLessThanOrEqual(last);
      expect(LAYERS[last - 1].warden).toBe(true);
    });
  });

  it('keeps sector ranges apart', () => {
    SECTORS.slice(1).forEach((sector, index) => {
      expect(sector.layers[0]).toBeGreaterThan(SECTORS[index].layers[1]);
    });
  });

  it('numbers layers inside a sector and walks to the next one', () => {
    const dense = sectorById('dense-core');
    expect(localLayer(dense, 6)).toBe(1);
    expect(localLayer(dense, 10)).toBe(5);
    expect(nextSector(dense).id).toBe('wardens-reach');
    expect(nextSector(sectorById('wardens-reach'))).toBeNull();
    expect(sectorById('nowhere')).toBeNull();
  });
});
