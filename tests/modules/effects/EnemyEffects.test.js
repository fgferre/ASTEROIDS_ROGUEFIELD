import { describe, expect, it } from 'vitest';
import { EnemyEffects } from '../../../src/modules/effects/EnemyEffects.js';

const createEnemyEffects = (
  density = 1,
  hitStops = [],
  randomFloat = () => 0.5
) => {
  const particleEffects = {
    particles: [],
    createShockwaveEffect: () => {},
    createExplosionShockwave: () => {},
  };
  const effects = new EnemyEffects({
    particleEffects,
    createParticle: (x, y, vx, vy, color, size, life, type) => ({
      x,
      y,
      vx,
      vy,
      size,
      type,
    }),
    randomFloat,
    randomRange: (min) => min,
    getRandomFork: () => null,
    getScaledParticleCount: (count) => Math.round(count * density),
    getScaledProbability: (probability) => probability * density,
    particleDensity: () => density,
    motionReduced: () => false,
    addScreenShake: () => {},
    addScreenFlash: () => {},
    addHitStop: (kind) => hitStops.push(kind),
  });
  return { effects, particleEffects };
};

describe('EnemyEffects', () => {
  it('lands a Caster shell as a shake only: no rings, sparks or glow (its fire is 3D)', () => {
    const { effects, particleEffects } = createEnemyEffects();
    let rings = 0;
    particleEffects.createExplosionShockwave = () => (rings += 1);

    effects.createShellImpactEffect({
      position: { x: 100, y: 100 },
      radius: 90,
    });

    expect(rings).toBe(0);
    expect(particleEffects.particles).toHaveLength(0);
  });

  it('plays a mine blast once even when the mine explodes twice', () => {
    const { effects, particleEffects } = createEnemyEffects();
    const mine = { type: 'mine', x: 100, y: 100 };

    effects.createMineExplosion({ enemy: mine, radius: 110 });
    const afterFirst = particleEffects.particles.length;
    expect(afterFirst).toBeGreaterThan(0);

    effects.createMineExplosion({ enemy: mine, radius: 110 });
    expect(particleEffects.particles).toHaveLength(afterFirst);
  });

  it('plays the death each enemy file names; one that names none dies as debris', () => {
    const hitStops = [];
    const { effects, particleEffects } = createEnemyEffects(1, hitStops);
    ['drone', 'hunter', 'mine'].forEach((type) =>
      effects.createAsteroidExplosion({ type, x: 10, y: 10 })
    );
    expect(hitStops).toEqual(['spark-burst', 'shock-burst', 'blast']);

    particleEffects.particles.length = 0;
    effects.createAsteroidExplosion({ type: 'husk', x: 10, y: 10, radius: 20 });
    // six chips, each with a lit chip beside it, and no hit-stop
    expect(particleEffects.particles).toHaveLength(12);
    expect(hitStops).toHaveLength(3);
  });

  it('marks the pieces a machine breaks into as metal, a rock’s as not', () => {
    const { effects, particleEffects } = createEnemyEffects();
    effects.createAsteroidExplosion({ type: 'husk', x: 10, y: 10, radius: 20 });
    const machine = particleEffects.particles.filter(
      (p) => p.type === 'debris'
    );
    expect(machine.length).toBeGreaterThan(0);
    machine.forEach((p) => expect(p.material).toBe('metal'));

    particleEffects.particles.length = 0;
    effects.createAsteroidExplosion({
      type: 'asteroid',
      size: 'small',
      x: 10,
      y: 10,
      radius: 12,
    });
    particleEffects.particles
      .filter((p) => p.type === 'debris')
      .forEach((p) => expect(p.material).toBeUndefined());
  });

  it('gives a big machine’s fall a heavy stop; a small machine and a rock keep theirs', () => {
    const hitStops = [];
    const { effects } = createEnemyEffects(1, hitStops);
    effects.createAsteroidExplosion({
      type: 'anvil',
      x: 10,
      y: 10,
      radius: 26,
    });
    expect(hitStops).toEqual(['heavy']);

    hitStops.length = 0;
    effects.createAsteroidExplosion({ type: 'husk', x: 10, y: 10, radius: 20 });
    effects.createAsteroidExplosion({
      type: 'asteroid',
      size: 'large',
      x: 10,
      y: 10,
      radius: 40,
    });
    expect(hitStops).toEqual(['large']);
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

  it('throws a broken plate’s pieces of metal out of its front, toward the shot', () => {
    let roll = 0;
    const cycle = () => ((roll += 1) * 0.37) % 1;
    const { effects, particleEffects } = createEnemyEffects(1, [], cycle);
    const facing = Math.PI / 2; // the plate faces +y
    effects.createPlateBreak({
      enemy: { x: 100, y: 100, vx: 0, vy: 0, radius: 22, facing },
    });

    const pieces = particleEffects.particles.filter((p) => p.type === 'debris');
    expect(pieces.length).toBeGreaterThanOrEqual(6);
    expect(pieces.length).toBeLessThanOrEqual(9);
    particleEffects.particles.forEach((p) => {
      if (p.type === 'debris') expect(p.material).toBe('metal');
      expect(p.y).toBeGreaterThan(110); // off the face, ahead of the hull
      const off = Math.abs(Math.atan2(p.vy, p.vx) - facing);
      expect(off).toBeLessThanOrEqual(0.6 + 1e-9); // out of the face
    });
  });
});
