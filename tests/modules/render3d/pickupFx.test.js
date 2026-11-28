import { describe, expect, it } from 'vitest';
import { PICKUP_KINDS } from '../../../src/data/pickups.js';
import { rgbOf } from '../../../src/modules/render3d/batches.js';
import { PickupFx } from '../../../src/modules/render3d/pickupFx.js';
import THREE from '../../../src/modules/render3d/three.js';

// The default hull's outline (hull units), the ship at (400, 300) facing +x.
const HULL = { minX: -11.1, maxX: 15, maxY: 9.6, extent: 15 };
const ship = { position: { x: 400, y: 300 }, angle: 0 };

// One frame of `dt` s: what was drawn into the glow and ribbon batches.
const frame = (fx, dt, still = false) => {
  const glows = [];
  const streaks = [];
  const t = {
    THREE,
    statusRgb: [0.5, 1, 0],
    player: { geometry: HULL, group: { visible: true } },
    glow: { push: (...args) => glows.push(args) },
    ribbons: { streak: (...args) => streaks.push(args) },
  };
  fx.update(dt, t, ship, 1, still);
  return { glows, streaks };
};
const run = (fx, seconds, step = 1 / 60) => {
  for (let s = 0; s < seconds; s += step) frame(fx, step);
};
// glows above the deck, on the hull (not the bits, not the glow beneath)
const onHull = (glows) => glows.filter((g) => g[1] >= 9);
const distance = (g) => Math.hypot(g[0] - 400, g[2] - 300);

describe('PickupFx', () => {
  it('breaks the token into a few bits that fly into the ship and go out on arrival', () => {
    const fx = new PickupFx();
    fx.emit('salvage', 430, 300);
    const salvage = rgbOf(THREE, PICKUP_KINDS.salvage.color);
    const bits = (glows) => glows.filter((g) => g[3] === salvage);
    const first = bits(frame(fx, 0.02).glows);
    expect(first.length).toBeGreaterThanOrEqual(4);
    expect(first.length).toBeLessThanOrEqual(6);
    run(fx, 0.1);
    const later = bits(frame(fx, 0.02).glows);
    const mean = (list) =>
      list.reduce((sum, g) => sum + distance(g), 0) / list.length;
    expect(mean(later)).toBeLessThan(mean(first));
    run(fx, 0.15);
    const { glows, streaks } = frame(fx, 0.02);
    expect(glows).toHaveLength(0);
    expect(streaks).toHaveLength(0);
  });

  it('repair lights green points over the hull that fade', () => {
    const fx = new PickupFx();
    fx.emit('repair', 430, 300);
    run(fx, 0.45);
    const lit = onHull(frame(fx, 1 / 60).glows);
    const repair = rgbOf(THREE, PICKUP_KINDS.repair.color);
    const coloured = lit.filter((g) => g[3] === repair);
    expect(coloured.length).toBeGreaterThanOrEqual(3);
    coloured.forEach((g) => expect(distance(g)).toBeLessThan(21));
    expect(repair[1]).toBeGreaterThan(Math.max(repair[0], repair[2]));
    const light = (glows) =>
      glows.reduce((sum, g) => sum + g[4] * g[5] * g[6], 0);
    run(fx, 0.3);
    expect(light(onHull(frame(fx, 1 / 60).glows))).toBeLessThan(light(lit));
    run(fx, 0.2);
    expect(frame(fx, 1 / 60).glows).toHaveLength(0);
  });

  it('stasis twinkles small crossed stars over the hull, staggered, for about 1.5 s', () => {
    const fx = new PickupFx();
    fx.emit('stasis', 430, 300);
    run(fx, 0.35);
    const { streaks } = frame(fx, 1 / 60);
    const stars = streaks.filter((s) => s[4] >= 9);
    // four arms a star, across and along the field
    expect(stars.length % 4).toBe(0);
    const stars0 = stars.length / 4;
    expect(stars0).toBeGreaterThan(0);
    expect(stars0).toBeLessThan(8); // the others not lit yet, or gone out
    stars.forEach(([tx, ty, hx, hy]) => {
      expect(tx === hx || ty === hy).toBe(true);
      expect(Math.hypot(hx - tx, hy - ty)).toBeLessThan(4);
    });
    // pale blue-white
    const [r, g, b] = stars[0][5];
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(0.5);
    run(fx, 0.8);
    expect(frame(fx, 1 / 60).streaks.length).toBeGreaterThan(0);
    run(fx, 0.5);
    expect(frame(fx, 1 / 60).streaks).toHaveLength(0);
  });

  it('overcharge runs sparks along the hull, held still under Reduced Motion', () => {
    const heads = (still) => {
      const fx = new PickupFx();
      fx.emit('overcharge', 430, 300);
      for (let s = 0; s < 0.5; s += 1 / 60) frame(fx, 1 / 60, still);
      const a = onHull(frame(fx, 1 / 60, still).glows);
      const b = onHull(frame(fx, 0.05, still).glows);
      return { a, b, streaks: frame(fx, 1 / 60, still).streaks };
    };
    const moving = heads(false);
    expect(moving.a.length).toBeGreaterThan(0);
    moving.a.forEach((g) => expect(distance(g)).toBeLessThan(21));
    expect(
      moving.a[0][0] !== moving.b[0][0] || moving.a[0][2] !== moving.b[0][2]
    ).toBe(true);
    expect(moving.streaks.length).toBeGreaterThan(0);
    const still = heads(true);
    expect(still.a[0][0]).toBe(still.b[0][0]);
    expect(still.a[0][2]).toBe(still.b[0][2]);
    expect(still.streaks).toHaveLength(0);
  });

  it('draws nothing once every take has played out, or after a clear', () => {
    const fx = new PickupFx();
    ['magnet', 'pulse', 'overcharge', 'repair', 'stasis', 'salvage'].forEach(
      (kind) => fx.emit(kind, 430, 300)
    );
    fx.emit('heart', 380, 320);
    run(fx, 1.8);
    const done = frame(fx, 1 / 60);
    expect(done.glows).toHaveLength(0);
    expect(done.streaks).toHaveLength(0);
    fx.emit('stasis', 430, 300);
    run(fx, 0.3);
    fx.clear();
    const cleared = frame(fx, 1 / 60);
    expect(cleared.glows).toHaveLength(0);
    expect(cleared.streaks).toHaveLength(0);
  });
});
