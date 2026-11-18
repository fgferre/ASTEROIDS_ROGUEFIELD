import { describe, expect, it } from 'vitest';
import {
  HitSparks,
  MuzzleFlashes,
  SPARK_KIND,
} from '../../../src/modules/render3d/hitSparks.js';

describe('HitSparks', () => {
  it('sprays a cone away from the surface that was hit', () => {
    const sparks = new HitSparks();
    // bullet flying +x hits the left side of a rock centred at (110, 100)
    sparks.emit(100, 100, -10, 0, 500, 0, false);
    const live = [];
    for (let i = 0; i < sparks.life.length; i += 1) {
      if (sparks.life[i] > 0) live.push(i);
    }
    expect(live.length).toBeGreaterThanOrEqual(6);
    expect(live.length).toBeLessThanOrEqual(10);
    live.forEach((i) => expect(sparks.vx[i]).toBeLessThan(0));
  });

  it('a rock spits fewer, slower, longer-lived droplets than metal, and dust', () => {
    const live = (sparks) =>
      [...sparks.life.keys()].filter((i) => sparks.life[i] > 0);
    const metal = new HitSparks();
    metal.emit(100, 100, -10, 0, 500, 0, false, SPARK_KIND.metal);
    const rock = new HitSparks();
    rock.emit(100, 100, -10, 0, 500, 0, false, SPARK_KIND.rock);
    const fastest = (s) =>
      Math.max(...live(s).map((i) => Math.hypot(s.vx[i], s.vy[i])));
    const longest = (s) => Math.max(...live(s).map((i) => s.life[i]));
    expect(live(rock).length).toBeLessThan(live(metal).length);
    expect(fastest(rock)).toBeLessThan(fastest(metal));
    expect(longest(rock)).toBeGreaterThan(longest(metal));
    expect([...rock.dustAge].filter((a) => a === 0).length).toBeGreaterThan(0);
    expect([...metal.dustAge].filter((a) => a === 0).length).toBe(0);
  });
});

describe('MuzzleFlashes', () => {
  it('lights one flash at the nose per volley, not one per shot', () => {
    const muzzles = new MuzzleFlashes();
    const batches = { push() {}, streak() {} };
    const volley = () => {
      for (let i = -2; i <= 2; i += 1) muzzles.emit(0, 0, 1, i * 0.1);
    };
    volley(); // the Scatter Coil's five shots between two frames
    expect(muzzles.update(batches, batches, [1, 1, 1], [1, 1, 1])).toBe(1);
    volley(); // the next volley lights its own
    expect(muzzles.update(batches, batches, [1, 1, 1], [1, 1, 1])).toBe(2);
  });
});
