import { describe, expect, it } from 'vitest';
import { HitSparks } from '../../../src/modules/render3d/hitSparks.js';

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
});
