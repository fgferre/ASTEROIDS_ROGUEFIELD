import { describe, expect, it } from 'vitest';
import {
  fitWord,
  pairStrokes,
  pathPoints,
  resample,
} from '../../../src/modules/menu/openingMorph.js';

describe('opening morph geometry', () => {
  it("reads the mark's paths and spaces their points evenly", () => {
    const pts = pathPoints('M0 0L10 0L10 -10');
    expect(pts).toEqual([
      [0, 0],
      [10, 0],
      [10, -10],
    ]);
    const even = resample(pts, 5);
    expect(even).toHaveLength(5);
    expect(even[0]).toEqual([0, 0]);
    expect(even[2]).toEqual([10, 0]);
    expect(even[4]).toEqual([10, -10]);
  });

  it("lays the title's letters edge to edge over its ink box", () => {
    const box = { x0: 100, x1: 600, top: 50, cap: 50 };
    const strokes = fitWord('ROGUEFIELD', box, 8);
    const xs = strokes.flat().map(([x]) => x);
    const ys = strokes.flat().map(([, y]) => y);
    expect(Math.min(...xs)).toBeCloseTo(104, 0);
    expect(Math.max(...xs)).toBeCloseTo(596, 0);
    expect(Math.min(...ys)).toBeCloseTo(54, 0);
    expect(Math.max(...ys)).toBeCloseTo(96, 0);
  });

  it('gives every stroke on both sides a partner, left to right', () => {
    const at = (x) => [
      [x, 0],
      [x, 1],
    ];
    const pairs = pairStrokes([at(0), at(10)], [at(5), at(1), at(9)]);
    expect(pairs).toHaveLength(3);
    expect(pairs.map(([a, b]) => [a[0][0], b[0][0]])).toEqual([
      [0, 1],
      [0, 5],
      [10, 9],
    ]);
  });
});
