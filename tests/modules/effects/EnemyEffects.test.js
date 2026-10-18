import { describe, expect, it } from 'vitest';
import { EnemyEffects } from '../../../src/modules/effects/EnemyEffects.js';

const createEnemyEffects = (density = 1) => {
  const particleEffects = {
    particles: [],
    createShockwaveEffect: () => {},
    createExplosionShockwave: () => {},
  };
  const effects = new EnemyEffects({
    particleEffects,
    createParticle: (x, y, vx, vy, color, size, life, type) => ({ type }),
    randomFloat: () => 0.5,
    randomRange: (min) => min,
    getRandomFork: () => null,
    getScaledParticleCount: (count) => Math.round(count * density),
    getScaledProbability: (probability) => probability * density,
    particleDensity: () => density,
    motionReduced: () => false,
    addScreenShake: () => {},
    addScreenFlash: () => {},
    addHitStop: () => {},
  });
  return { effects, particleEffects };
};

describe('EnemyEffects', () => {
  it('plays a mine blast once even when the mine explodes twice', () => {
    const { effects, particleEffects } = createEnemyEffects();
    const mine = { type: 'mine', x: 100, y: 100 };

    effects.createMineExplosion({ enemy: mine, radius: 110 });
    const afterFirst = particleEffects.particles.length;
    expect(afterFirst).toBeGreaterThan(0);

    effects.createMineExplosion({ enemy: mine, radius: 110 });
    expect(particleEffects.particles).toHaveLength(afterFirst);
  });

  it('scales an asteroid burst by the particle density it is given', () => {
    const asteroid = { size: 'medium', radius: 22, x: 50, y: 50 };
    const full = createEnemyEffects(1);
    const reduced = createEnemyEffects(0.5);

    full.effects.createAsteroidExplosion(asteroid);
    reduced.effects.createAsteroidExplosion(asteroid);

    // a medium rock: 8 chips at full density, each with a lit chip beside it
    expect(full.particleEffects.particles).toHaveLength(16);
    expect(reduced.particleEffects.particles).toHaveLength(8);
  });
});
