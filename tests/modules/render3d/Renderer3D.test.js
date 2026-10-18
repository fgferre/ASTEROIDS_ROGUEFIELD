import { describe, expect, it } from 'vitest';
import Renderer3D from '../../../src/modules/render3d/Renderer3D.js';

describe('Renderer3D camera clamp', () => {
  it('keeps the dollied-out follow point inside the field', () => {
    const renderer = new Renderer3D();
    renderer.camera.snapTo(20, 20);
    const near = { ...renderer.clampToField(700, 4 / 3) };
    const far = renderer.clampToField(900, 4 / 3);
    expect(near.x).toBeGreaterThan(20);
    expect(near.y).toBeGreaterThan(20);
    // further out shows more, so the follow point sits further from the edge
    expect(far.x).toBeGreaterThan(near.x);
    expect(far.y).toBeGreaterThan(near.y);
  });
});
