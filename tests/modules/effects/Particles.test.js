import { beforeAll, describe, expect, it } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import { Particles } from '../../../src/modules/effects/Particles.js';

describe('Particles', () => {
  const particles = new Particles({
    randomRange: () => 0,
    randomCentered: () => 0,
    createMuzzleFlash: () => {},
  });

  beforeAll(() => {
    if (!GamePools.initialized) GamePools.initialize();
  });

  it('gives its live particles back to the pool on reset', () => {
    const before = GamePools.particles.inUse.size;
    for (let i = 0; i < 5; i += 1) {
      particles.particles.push(
        particles.createParticle(0, 0, 0, 0, '#fff', 2, 1, 'normal')
      );
    }
    expect(GamePools.particles.inUse.size).toBe(before + 5);
    particles.reset();
    expect(GamePools.particles.inUse.size).toBe(before);
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
