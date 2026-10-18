import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergeStatic } from '../../../src/modules/render3d/mergeStatic.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

describe('mergeStatic', () => {
  it('places each part, bakes its colour per vertex and keeps shared uvs', () => {
    const box = new THREE.BoxGeometry(1, 1, 1); // indexed: 36 corners
    const sphere = new THREE.SphereGeometry(1, 6, 4);
    const red = new THREE.Color(1, 0, 0);
    const blue = new THREE.Color(0, 0, 1);
    const merged = mergeStatic(THREE, [
      { geometry: box, color: red, position: [10, 0, 0], scale: 2 },
      { geometry: sphere, color: blue, rotationY: Math.PI / 2 },
    ]);
    const boxCount = box.toNonIndexed().getAttribute('position').count;
    const sphereCount = sphere.toNonIndexed().getAttribute('position').count;
    const total = boxCount + sphereCount;

    expect(merged.index).toBe(null);
    ['position', 'normal', 'color', 'uv'].forEach((name) =>
      expect(merged.getAttribute(name).count, name).toBe(total)
    );
    expect(merged.getAttribute('uv2')).toBeUndefined();
    const position = merged.getAttribute('position');
    const color = merged.getAttribute('color');
    for (let i = 0; i < boxCount; i += 1) {
      expect(Math.abs(position.getX(i) - 10)).toBeCloseTo(1);
      expect(color.getX(i)).toBe(1);
      expect(color.getZ(i)).toBe(0);
    }
    expect(color.getZ(boxCount)).toBe(1);
    expect(color.getX(total - 1)).toBe(0);
  });

  it('gives flat parts one face normal per triangle', () => {
    const merged = mergeStatic(THREE, [
      { geometry: new THREE.SphereGeometry(1, 8, 6), flat: true },
    ]);
    const normal = merged.getAttribute('normal');
    for (let i = 0; i < normal.count; i += 3) {
      expect(normal.getX(i + 1)).toBeCloseTo(normal.getX(i));
      expect(normal.getY(i + 2)).toBeCloseTo(normal.getY(i));
    }
    expect(merged.getAttribute('color')).toBeUndefined();
  });
});
