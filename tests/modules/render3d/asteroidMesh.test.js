import { describe, expect, it } from 'vitest';
import { createAsteroidGeometry } from '../../../src/modules/render3d/asteroidMesh.js';
import THREE from '../../../src/modules/render3d/three.js';

const positions = (seed) =>
  Array.from(
    createAsteroidGeometry(THREE, seed, { detail: 2 }).getAttribute('position')
      .array
  );

describe('createAsteroidGeometry', () => {
  it('builds the same vertex buffer for the same seed', () => {
    expect(positions(17.5)).toEqual(positions(17.5));
  });

  it('builds a different rock for a different seed', () => {
    expect(positions(17.5)).not.toEqual(positions(42.25));
  });
});
