import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CapsuleBatch,
  RibbonBatch,
  SHOT_SHAPES,
} from '../../../src/modules/render3d/batches.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

const WHITE = [1, 1, 1];

describe('RibbonBatch', () => {
  it('turns light about its own line and keeps floor marks flat', () => {
    const ribbons = new RibbonBatch(THREE, 8);
    ribbons.begin();
    ribbons.tube(0, 0, 10, 0, 3, WHITE, 2, 1);
    ribbons.segment(0, 0, 10, 0, 3, WHITE, 2, 1);
    ribbons.end();

    // the tube: half widths for the shader, along its tangent (+x)
    expect([...ribbons.sides.slice(0, 4)]).toEqual([1, -1, 1, -1]);
    expect([...ribbons.axes.slice(0, 2)]).toEqual([1, 0]);
    // the floor mark: already spread on the field plane, no half width
    expect([...ribbons.sides.slice(4, 8)]).toEqual([0, 0, 0, 0]);
    expect(ribbons.geometry.drawRange.count).toBe(12);
  });

  it('shares each corner tangent between the two segments of a trail', () => {
    const ribbons = new RibbonBatch(THREE, 8);
    ribbons.begin();
    ribbons.px.set([0, 10, 10]);
    ribbons.py.set([0, 0, 10]);
    ribbons.polyline(3, 2, WHITE, 4, 1);
    ribbons.end();

    const { axes, sides } = ribbons;
    // segment 0 ends and segment 1 starts on the same tangent: no seam
    expect([axes[4], axes[5]]).toEqual([axes[8], axes[9]]);
    expect(Math.hypot(axes[4], axes[5])).toBeCloseTo(1);
    // the tail is a point, the head full width
    expect(sides[0]).toBe(0);
    expect(sides[6]).toBe(2);
  });
});

describe('CapsuleBatch', () => {
  it('gives every shot kind its own shape of tens of triangles', () => {
    const shots = new CapsuleBatch(THREE, 4);
    const parts = shots.mesh.geometry.attributes.aPart.array;
    Object.values(SHOT_SHAPES).forEach((kind) => {
      const triangles = parts.filter((part) => part === kind).length / 3;
      expect(triangles, String(kind)).toBeGreaterThanOrEqual(8);
      expect(triangles, String(kind)).toBeLessThanOrEqual(40);
    });

    shots.begin();
    shots.push(400, 300, 3, 0, 4, 2, [1, 0.5, 0], 2, SHOT_SHAPES.dart);
    shots.end();
    expect([...shots.tints.slice(0, 4)]).toEqual([2, 1, 0, SHOT_SHAPES.dart]);
    expect(shots.mesh.count).toBe(1);
  });
});
