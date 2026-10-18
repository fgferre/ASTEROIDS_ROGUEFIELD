import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GlowBatch } from '../../../src/modules/render3d/glowBatch.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

describe('GlowBatch', () => {
  it('instances each glow with its colour and scale, hidden when empty', () => {
    const batch = new GlowBatch(THREE, new THREE.Scene(), 2);
    const pose = new THREE.Matrix4().compose(
      new THREE.Vector3(5, 0, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(2, 2, 2)
    );
    batch.begin();
    batch.push(pose, new THREE.Color(2, 0.5, 0));
    batch.push(pose, new THREE.Color(0, 0, 1), 0.5);
    expect(batch.push(pose, new THREE.Color())).toBe(false);
    batch.end();

    const { mesh } = batch;
    expect(mesh.count).toBe(2);
    expect(mesh.visible).toBe(true);
    expect(Array.from(mesh.instanceColor.array.slice(0, 3))).toEqual([
      2, 0.5, 0,
    ]);
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(1, matrix);
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    matrix.decompose(position, new THREE.Quaternion(), scale);
    expect(position.x).toBe(5);
    expect(scale.x).toBeCloseTo(1);

    batch.clear();
    expect(mesh.count).toBe(0);
    expect(mesh.visible).toBe(false);
  });
});
