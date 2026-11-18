import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createAsteroidGeometry,
  createSeededRandom,
} from '../../../src/modules/render3d/asteroidMesh.js';
import { cutRock } from '../../../src/modules/render3d/enemies/rockCut.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

const rock = createAsteroidGeometry(THREE, 11.3, { detail: 4 });
const triangles =
  (rock.index ? rock.index.count : rock.attributes.position.count) / 3;
const dirs = [0, 1, 2].map((i) => {
  const a = (i / 3) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
});
const cut = () =>
  cutRock(
    THREE,
    rock,
    new THREE.Vector3(3, 7, 11),
    dirs,
    createSeededRandom(5)
  );

describe('cutRock', () => {
  it('gives one piece per direction and keeps every surface triangle once', () => {
    const pieces = cut();
    expect(pieces).toHaveLength(3);
    const surface = pieces.reduce((n, { geometry }) => {
      const heat = geometry.getAttribute('cut').array;
      let s = 0;
      for (let i = 0; i < heat.length; i += 3) if (heat[i] === 0) s += 1;
      return n + s;
    }, 0);
    expect(surface).toBe(triangles);
  });

  it('closes each piece with a hot cut face, as massive as the whole rock', () => {
    const pieces = cut();
    pieces.forEach(({ geometry, size }) => {
      const heat = Array.from(geometry.getAttribute('cut').array);
      expect(Math.max(...heat)).toBe(1);
      expect(size).toBeGreaterThan(0.5);
      expect(size).toBeLessThan(0.9);
      geometry.computeBoundingSphere();
      expect(geometry.boundingSphere.radius).toBeGreaterThan(0.9);
    });
    // three pieces hold most of the rock
    const sum = pieces.reduce((n, { size }) => n + size ** 3, 0);
    expect(sum).toBeGreaterThan(0.7);
    expect(sum).toBeLessThan(1.05);
  });

  it('cuts the same rock the same way every time', () => {
    const a = cut()[0].geometry.getAttribute('position').array;
    const b = cut()[0].geometry.getAttribute('position').array;
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
