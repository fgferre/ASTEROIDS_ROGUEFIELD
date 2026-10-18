import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RimBatch, rimLoop } from '../../../src/modules/render3d/rimBatch.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

describe('RimBatch', () => {
  it('closes each loop into world-space segments until it is full', () => {
    const batch = new RimBatch(THREE, new THREE.Scene(), 4);
    const triangle = rimLoop([
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(-1, 0, 0),
    ]);
    const pose = new THREE.Matrix4().makeTranslation(10, 0, 0);
    batch.begin();
    expect(batch.push(triangle, pose, new THREE.Color(1, 0, 0))).toBe(true);
    expect(batch.push(triangle, pose, new THREE.Color(0, 1, 0))).toBe(false);
    batch.end();

    const p = batch.positions;
    expect(batch.count).toBe(3);
    expect([p.getX(0), p.getZ(1)]).toEqual([11, 1]); // segment 0: 0 → 1
    expect([p.getX(5), p.getZ(5)]).toEqual([11, 0]); // segment 2 ends at 0
    expect(batch.object.geometry.drawRange.count).toBe(6);
    expect(batch.object.visible).toBe(true);

    batch.clear();
    expect(batch.object.visible).toBe(false);
  });
});
