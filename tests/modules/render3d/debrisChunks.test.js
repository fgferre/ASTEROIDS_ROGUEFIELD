import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEBRIS_CAPACITY,
  DebrisChunks,
} from '../../../src/modules/render3d/debrisChunks.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

const particle = (i, life) => ({
  x: 100 + i,
  y: 200,
  size: 4,
  life,
  maxLife: 1,
  rotation: i,
  rotationSpeed: (i % 7) - 3.1,
});

const instanceScale = (chunks) => {
  const mesh = chunks.meshes.find((m) => m.count > 0);
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(0, matrix);
  return new THREE.Vector3().setFromMatrixScale(matrix).x;
};

describe('DebrisChunks', () => {
  it('caps the pool and hides empty variants', () => {
    const chunks = new DebrisChunks(THREE, new THREE.Scene());
    chunks.begin();
    for (let i = 0; i < DEBRIS_CAPACITY + 40; i += 1) {
      chunks.push(particle(i, 0.8), [0.2, 0.2, 0.2]);
    }
    chunks.end();
    expect(chunks.count).toBe(DEBRIS_CAPACITY);
    chunks.begin();
    chunks.end();
    expect(chunks.meshes.every((m) => !m.visible && m.count === 0)).toBe(true);
  });

  it('shrinks a chunk only in the last 30 % of its life', () => {
    const chunks = new DebrisChunks(THREE, new THREE.Scene());
    const scaleAt = (life) => {
      chunks.begin();
      chunks.push(particle(3, life), [0.2, 0.2, 0.2]);
      chunks.end();
      return instanceScale(chunks);
    };
    const full = scaleAt(0.9);
    expect(scaleAt(0.4)).toBeCloseTo(full, 5);
    expect(scaleAt(0.15)).toBeCloseTo(full / 2, 5);
  });

  it('opens a flat burst into a ball that holds still with its clock', () => {
    const chunks = new DebrisChunks(THREE, new THREE.Scene());
    const burst = Array.from({ length: 24 }, (_, i) => ({
      ...particle(i, 1),
      rotationSpeed: i * 0.731 - 8,
      vx: 80,
      vy: 0,
    }));
    const matrix = new THREE.Matrix4();
    const heightsAt = (life) => {
      chunks.begin();
      burst.forEach((p) => {
        p.life = life;
        chunks.push(p, [0.2, 0.2, 0.2]);
      });
      chunks.end();
      return chunks.meshes.flatMap((mesh) =>
        Array.from({ length: mesh.count }, (_, i) => {
          mesh.getMatrixAt(i, matrix);
          return new THREE.Vector3().setFromMatrixPosition(matrix).y;
        })
      );
    };
    const start = heightsAt(1);
    expect(Math.max(...start)).toBeCloseTo(Math.min(...start), 5);
    // 0.4 s at 80 px/s: some climbed, some sank, within the steepest slope
    const later = heightsAt(0.6);
    expect(Math.max(...later)).toBeGreaterThan(start[0] + 10);
    expect(Math.min(...later)).toBeLessThan(start[0] - 10);
    later.forEach((y) => expect(Math.abs(y - start[0])).toBeLessThan(32 * 1.2));
    // paused (same age): nothing moves
    expect(heightsAt(0.6)).toEqual(later);
  });
});
