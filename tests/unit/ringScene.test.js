import { describe, expect, it } from 'vitest';
import { orbitPoint, readRingScene } from '../../src/bootstrap/ringScene.js';
import { RING, ringPoint } from '../../src/modules/render3d/ring/ringShape.js';

describe('ringScene', () => {
  it('reads ?scene=ring: the target, a held pose, a forced level, the wake', () => {
    expect(readRingScene('?scene=hero')).toBe(null);
    expect(readRingScene('?scene=ring')).toEqual({
      at: 'stump',
      az: null,
      el: null,
      d: null,
      lod: null,
      wake: 0,
    });
    expect(
      readRingScene('?scene=ring&at=gap&az=30&el=-20&d=180&lod=7&wake=1')
    ).toEqual({ at: 'gap', az: 30, el: -20, d: 180, lod: 2, wake: 1 });
    expect(readRingScene('?scene=ring&at=nowhere').at).toBe('stump');
  });

  it('orbits a point on the Ring at the asked distance, outside it at azimuth 0', () => {
    const target = { s: 300, y: -10 };
    const [x, , z] = ringPoint(target.s);
    const around = orbitPoint(target, 1.1, -0.6, 150);
    expect(
      Math.hypot(around[0] - x, around[1] - target.y, around[2] - z)
    ).toBeCloseTo(150);
    const out = orbitPoint(target, 0, 0, 150);
    expect(Math.hypot(out[0], out[2])).toBeCloseTo(RING.radius + 150);
    expect(out[1]).toBe(target.y);
  });
});
