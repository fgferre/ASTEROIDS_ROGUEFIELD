import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  OrbCrystals,
  crystalGeometry,
} from '../../../src/modules/render3d/fieldTokens.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

const GOLD = [1, 0.68, 0];

describe('OrbCrystals', () => {
  it('draws every orb in one batch, a higher tier bigger and with its shards', () => {
    const crystals = new OrbCrystals(
      THREE,
      new THREE.Scene(),
      new THREE.Vector3(0, 1, 0)
    );
    crystals.begin();
    crystals.pushOrb({ x: 100, y: 100 }, 1, 8, 0, GOLD);
    crystals.pushOrb({ x: 200, y: 100 }, 6, 16, 0, GOLD);
    crystals.end();

    const { mesh } = crystals;
    expect(mesh.count).toBe(2);
    expect(mesh.visible).toBe(true);
    const scaleOf = (i) => {
      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(i, matrix);
      const scale = new THREE.Vector3();
      matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      return scale.x;
    };
    expect(scaleOf(1)).toBeGreaterThan(scaleOf(0));
    expect(crystals.rich.array[0]).toBe(0);
    expect(crystals.rich.array[1]).toBe(1);

    crystals.begin();
    crystals.end();
    expect(mesh.visible).toBe(false);
  });

  it('keeps the crystal to tens of triangles (there can be hundreds)', () => {
    const triangles = crystalGeometry(THREE).getAttribute('position').count / 3;
    expect(triangles).toBeLessThanOrEqual(48);
  });
});
