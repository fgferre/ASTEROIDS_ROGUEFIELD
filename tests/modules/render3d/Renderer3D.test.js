import { describe, expect, it, vi } from 'vitest';
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

describe('Renderer3D shadows', () => {
  it('builds a resized shadow map inside a seeded frame', () => {
    // three r128: shadowMap.render reads the per-frame light state, which
    // only exists while renderer.render() runs.
    let inFrame = false;
    let seeded = false;
    const shadowMap = {
      enabled: false,
      render: vi.fn(() => {
        if (!inFrame) throw new TypeError("reading 'state' of null");
      }),
    };
    const fake = {
      shadowMap,
      render: vi.fn(() => {
        expect(seeded).toBe(true);
        inFrame = true;
        shadowMap.render();
        inFrame = false;
      }),
    };
    const renderer = new Renderer3D();
    renderer.seeded = (fn) => {
      seeded = true;
      const out = fn();
      seeded = false;
      return out;
    };
    const mapSize = { x: 2048, set: vi.fn((x) => (mapSize.x = x)) };
    const key = { castShadow: false, shadow: { mapSize, map: null } };
    renderer.three = { renderer: fake, key, scene: {}, camera: {} };

    expect(() => renderer.applyShadows(1024)).not.toThrow();
    expect(fake.render).toHaveBeenCalledTimes(1);
    expect(mapSize.x).toBe(1024);
    expect(key.castShadow).toBe(true);
  });
});
