import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

// The vendored r128 build is UMD: evaluated with an `exports` object it
// fills that object instead of a global.
const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

const MAPS = ['normalMap', 'roughnessMap', 'aoMap'];
const sample = (maps) =>
  MAPS.map((name) => Array.from(maps[name].image.data.slice(4000, 4400)));
// A fresh module each time, so a bake is not served from the cache.
const freshBake = async (kind, seed) => {
  vi.resetModules();
  const module = await import('../../../src/modules/render3d/bakedMaps.js');
  return module[`bake${kind}Maps`](THREE, seed, 64);
};

describe('bakedMaps', () => {
  it.each(['Rock', 'Hull', 'Plate'])(
    'bakes %s maps of the requested size, the same for a seed',
    async (kind) => {
      const maps = await freshBake(kind, 1.5);
      for (const name of MAPS) {
        expect(maps[name].image.width, name).toBe(64);
        expect(maps[name].image.height, name).toBe(64);
      }
      expect(sample(await freshBake(kind, 1.5))).toEqual(sample(maps));
      expect(sample(await freshBake(kind, 2.5))).not.toEqual(sample(maps));
    }
  );
});
