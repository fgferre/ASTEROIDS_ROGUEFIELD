import { describe, expect, it } from 'vitest';
import { Particles } from '../../../src/modules/effects/Particles.js';

describe('Particles', () => {
  const particles = new Particles({
    randomRange: () => 0,
    randomCentered: () => 0,
    createMuzzleFlash: () => {},
    damageNumbersEnabled: () => true,
  });

  it('drops a shockwave once it outlives its duration', () => {
    particles.createShockwaveEffect({
      position: { x: 0, y: 0 },
      duration: 0.3,
    });
    particles.updateShockwaves(0.2);
    expect(particles.shockwaves).toHaveLength(1);
    particles.updateShockwaves(0.2);
    expect(particles.shockwaves).toHaveLength(0);
  });
});
