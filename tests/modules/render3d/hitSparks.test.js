import { describe, expect, it } from 'vitest';
import {
  HitSparks,
  MuzzleFlashes,
  SPARK_KIND,
  ShotWisps,
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

describe('HitSparks gold', () => {
  it("flings an Elite's six gold blades out all round", () => {
    const sparks = new HitSparks();
    sparks.emit(100, 100, 1, 0, 0, 0, true, SPARK_KIND.gold);
    const live = [...sparks.life.keys()].filter((i) => sparks.life[i] > 0);
    expect(live).toHaveLength(6);
    const left = live.filter((i) => sparks.vx[i] < 0).length;
    expect(left).toBeGreaterThan(0); // all round, not one way
    expect(left).toBeLessThan(6);
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

  it('puts a volley of parallel lanes in the middle, facing forward', () => {
    const muzzles = new MuzzleFlashes();
    const streaks = [];
    const glow = { push() {} };
    const ribbons = { streak: (...args) => streaks.push(args) };
    // Multishot's three lanes, 10 px apart across the ship's heading (+x)
    [-10, 0, 10].forEach((y) => muzzles.emit(0, 300 + y, 1, 0));
    muzzles.update(glow, ribbons, [1, 1, 1], [1, 1, 1]);

    const [x0, y0, x1, y1] = streaks[0];
    expect(y0).toBeCloseTo(300, 5);
    expect(y1).toBeCloseTo(300, 5);
    expect(x1).toBeGreaterThan(x0);
  });
});

describe('ShotWisps', () => {
  it('frays a burned-out shot into wisps of its colour that run on and fade', () => {
    const wisps = new ShotWisps();
    const red = [1, 0, 0];
    wisps.emit(100, 100, 300, 0, 4, red);
    const drawn = [];
    wisps.update(0.2, { streak: (...args) => drawn.push(args) });

    expect(drawn.length).toBeGreaterThan(2);
    drawn.forEach(([x0, , x1, , , rgb]) => {
      expect(rgb).toBe(red);
      expect(x1).toBeGreaterThan(100); // on along its path
      expect(x1).toBeGreaterThan(x0);
    });

    for (let step = 0; step < 7; step += 1) {
      wisps.update(0.05, { streak() {} });
    }
    const late = [];
    wisps.update(0.05, { streak: (...args) => late.push(args) });
    expect(late).toHaveLength(0);
  });
});
