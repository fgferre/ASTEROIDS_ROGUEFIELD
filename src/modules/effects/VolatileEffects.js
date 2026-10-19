// src/modules/effects/VolatileEffects.js
//
// The Volatile rock's trail, warning and blast, and the Caster shell landing
// (which borrowed the Volatile blast and still rolls from its fork).
// EnemyEffects owns it and its volatile and shell listeners land here.

import { PALETTE, withAlpha } from '../../data/constants/palette.js';
import { SpaceParticle } from '../EffectEntities.js';

// A Caster shell landing: lighter than the Volatile rock's blast it used to
// borrow (shake 7 + radius × 0.025 for 0.32 s, a full-screen flash, ~110
// particles), since 2-4 Casters land one every 3.2 s each. No flash, the same
// shockwave, about half the particles, all amber like the shot.
const SHELL_IMPACT = Object.freeze({
  shake: 4, // proposta 18/10
  shakeSeconds: 0.25, // proposta 18/10
  shockwaveScale: 1.05, // proposta 18/10: × the blast radius
  sparks: 36, // proposta 18/10
  sparkSpeedMin: 70, // proposta 18/10: px/s
  sparkSpeedMax: 210, // proposta 18/10
  sparkAlphaMin: 0.7, // proposta 18/10
  sparkAlphaMax: 0.9, // proposta 18/10
  sparkSizeMin: 2, // proposta 18/10
  sparkSizeMax: 3.6, // proposta 18/10
  sparkLifeMin: 0.3, // proposta 18/10: s
  sparkLifeMax: 0.5, // proposta 18/10
  embers: 18, // proposta 18/10: slower, they linger
  emberSpeedMax: 45, // proposta 18/10: px/s
  emberAlpha: 0.5, // proposta 18/10
  emberSizeMin: 1.2, // proposta 18/10
  emberSizeMax: 2.2, // proposta 18/10
  emberLifeMin: 0.6, // proposta 18/10: s
  emberLifeMax: 1, // proposta 18/10
  emberReach: 0.45, // proposta 18/10: × the blast radius
  glowScale: 0.2, // proposta 18/10: × the blast radius
  glowAlpha: 0.45, // proposta 18/10
  glowLife: 0.35, // proposta 18/10: s
});

export class VolatileEffects {
  /**
   * `particleEffects`: the effects' Particles; every particle lands in its list, and its shockwaves are used directly.
   * `createParticle(x, y, vx, vy, color, size, life, type)`: the effects' createParticle, not Particles' own, as in PlayerEffects.
   * `randomFloat(fork)`, `randomRange(min, max, fork)`: the effects' random helpers; rolls draw from 'volatility'.
   * `getRandomFork(name)`: the effects' random fork; a SpaceParticle built here rolls its spin from it.
   * `getScaledParticleCount(count, options)`, `getScaledProbability(probability)`: the effects' Reduced Particles scaling.
   * `addScreenShake(presetOrIntensity, durationOrOptions)`, `addScreenFlash(color, duration, intensity)`: the effects' screen feedback.
   */
  constructor({
    particleEffects,
    createParticle,
    randomFloat,
    randomRange,
    getRandomFork,
    getScaledParticleCount,
    getScaledProbability,
    addScreenShake,
    addScreenFlash,
  }) {
    this.particleEffects = particleEffects;
    this.createParticle = createParticle;
    this.randomFloat = randomFloat;
    this.randomRange = randomRange;
    this.getRandomFork = getRandomFork;
    this.getScaledParticleCount = getScaledParticleCount;
    this.getScaledProbability = getScaledProbability;
    this.addScreenShake = addScreenShake;
    this.addScreenFlash = addScreenFlash;
  }

  onVolatileArmed(data) {
    if (data?.position) {
      this.addScreenFlash(withAlpha(PALETTE.shot, 0.18), 0.12, 0.08);
      this.spawnVolatileWarning(data.position);
    }
  }

  spawnVolatileTrail(data = {}) {
    if (!data || !data.position) {
      return;
    }

    const config = data.config || {};
    const position = data.position;
    const velocity = data.velocity || { x: 0, y: 0 };
    const hasVelocity =
      Number.isFinite(velocity.x) &&
      Number.isFinite(velocity.y) &&
      (velocity.x !== 0 || velocity.y !== 0);
    const baseAngle = hasVelocity
      ? Math.atan2(velocity.y, velocity.x) + Math.PI
      : this.randomFloat('volatility') * Math.PI * 2;

    const coreColor = withAlpha(PALETTE.shot, 0.9);
    const emberColor = withAlpha(PALETTE.shot, 0.85);
    const smokeColor = withAlpha(PALETTE.rock, 0.35);

    const resolveRange = (value, fallback) => {
      if (Array.isArray(value)) {
        const min = Number.isFinite(value[0]) ? value[0] : fallback[0];
        const max = Number.isFinite(value[1]) ? value[1] : fallback[1];
        return [min, max];
      }
      if (Number.isFinite(value)) {
        return [value, value];
      }
      return fallback;
    };

    const intensityInput = Number.isFinite(data.intensity)
      ? data.intensity
      : Number.isFinite(data.fuseProgress)
        ? data.fuseProgress
        : 0;
    const intensity = Math.max(0, Math.min(1, intensityInput));
    const armedBonus = data.armed ? 0.15 : 0;
    const totalIntensity = Math.min(1.2, intensity + armedBonus);

    const countRange = config.countRange || [2, 4];
    const countMin = Array.isArray(countRange)
      ? countRange[0] ?? 2
      : countRange;
    const countMax = Array.isArray(countRange)
      ? countRange[1] ?? countMin
      : countMin;
    const spawnCount = this.getScaledParticleCount(
      this.randomRange(countMin, countMax + totalIntensity * 1.2, 'volatility')
    );

    const spread = Number.isFinite(config.spread) ? config.spread : Math.PI / 4;
    const speedRange = resolveRange(config.speedRange, [28, 90]);
    const sizeRange = resolveRange(config.sizeRange, [2.2, 3.6]);
    const lifeRange = resolveRange(config.lifeRange, [0.26, 0.46]);
    const jitter = Number.isFinite(config.emberJitter) ? config.emberJitter : 5;

    const speedMagnitude = Math.hypot(velocity.x || 0, velocity.y || 0);
    const speedScale =
      0.7 + Math.min(1.2, speedMagnitude / 140) * 0.4 + totalIntensity * 0.3;

    for (let i = 0; i < spawnCount; i += 1) {
      const angleOffset = (this.randomFloat('volatility') - 0.5) * spread;
      const angle = baseAngle + angleOffset;
      const offsetMag = this.randomRange(0, jitter, 'volatility');
      const spawnX = position.x + Math.cos(angle + Math.PI) * offsetMag;
      const spawnY = position.y + Math.sin(angle + Math.PI) * offsetMag;

      const emberSpeed =
        this.randomRange(speedRange[0], speedRange[1], 'volatility') *
        speedScale;
      const emberLife =
        this.randomRange(lifeRange[0], lifeRange[1], 'volatility') *
        (0.7 + totalIntensity * 0.5);
      const emberSize =
        this.randomRange(sizeRange[0], sizeRange[1], 'volatility') *
        (0.75 + totalIntensity * 0.45);

      const spark = this.createParticle(
        spawnX,
        spawnY,
        Math.cos(angle) * emberSpeed,
        Math.sin(angle) * emberSpeed,
        emberColor,
        emberSize * 0.6,
        emberLife * 0.75,
        'spark'
      );
      this.particleEffects.particles.push(spark);

      const core = new SpaceParticle(
        spawnX,
        spawnY,
        Math.cos(angle) * emberSpeed * 0.45,
        Math.sin(angle) * emberSpeed * 0.45,
        coreColor,
        emberSize,
        emberLife,
        'normal',
        this.getRandomFork('volatility')
      );
      this.particleEffects.particles.push(core);

      if (this.randomFloat('volatility') < this.getScaledProbability(0.55)) {
        const smoke = new SpaceParticle(
          spawnX,
          spawnY,
          Math.cos(angle) * emberSpeed * 0.25,
          Math.sin(angle) * emberSpeed * 0.25,
          smokeColor,
          emberSize * (1.2 + this.randomFloat('volatility') * 0.6),
          emberLife * (1.3 + this.randomFloat('volatility') * 0.4),
          'smoke',
          this.getRandomFork('volatility')
        );
        this.particleEffects.particles.push(smoke);
      }

      if (this.randomFloat('volatility') < this.getScaledProbability(0.3)) {
        const glint = new SpaceParticle(
          spawnX,
          spawnY,
          Math.cos(angle) * emberSpeed * 0.2,
          Math.sin(angle) * emberSpeed * 0.2,
          withAlpha(PALETTE.text, 0.7),
          emberSize * 0.5,
          emberLife * 0.5,
          'normal',
          this.getRandomFork('volatility')
        );
        this.particleEffects.particles.push(glint);
      }
    }
  }

  spawnVolatileWarning(position) {
    const particles = this.getScaledParticleCount(6);
    for (let i = 0; i < particles; i += 1) {
      const angle = (i / particles) * Math.PI * 2;
      const speed = 20 + this.randomFloat('volatility') * 15;
      const particle = this.createParticle(
        position.x,
        position.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        withAlpha(PALETTE.shot, 0.45),
        1.8 + this.randomFloat('volatility') * 0.6,
        0.35 + this.randomFloat('volatility') * 0.15,
        'spark'
      );
      this.particleEffects.particles.push(particle);
    }
  }

  createVolatileExplosionEffect(data) {
    if (!data || !data.position) {
      return;
    }

    const radius = data.radius ?? 70;
    const position = data.position;
    const intensity = Math.min(1.2, radius / 90);

    this.addScreenShake(7 + radius * 0.025, 0.32);
    this.addScreenFlash(withAlpha(PALETTE.shot, 0.55), 0.26, 0.24);

    this.particleEffects.createExplosionShockwave({
      position,
      radius: radius * 1.05,
    });

    const particleTotal = this.getScaledParticleCount(
      22 + Math.floor(radius / 5)
    );
    for (let i = 0; i < particleTotal; i += 1) {
      const angle = this.randomFloat('volatility') * Math.PI * 2;
      const speed =
        (70 + this.randomFloat('volatility') * 150) * (0.8 + intensity * 0.4);

      // two unused rolls were the old green/blue jitter; kept for the fork
      this.randomFloat('volatility');
      this.randomFloat('volatility');
      const flameAlpha = 0.7 + this.randomFloat('volatility') * 0.2;
      const flame = new SpaceParticle(
        position.x,
        position.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        withAlpha(PALETTE.shot, flameAlpha),
        2.4 + this.randomFloat('volatility') * 1.8,
        0.38 + this.randomFloat('volatility') * 0.24,
        'spark',
        this.getRandomFork('volatility')
      );
      this.particleEffects.particles.push(flame);

      const debris = this.createParticle(
        position.x + (this.randomFloat('volatility') - 0.5) * radius * 0.4,
        position.y + (this.randomFloat('volatility') - 0.5) * radius * 0.4,
        Math.cos(angle) * speed * 0.6,
        Math.sin(angle) * speed * 0.6,
        PALETTE.rock,
        2 + this.randomFloat('volatility') * 2,
        0.6 + this.randomFloat('volatility') * 0.2,
        'debris'
      );
      this.particleEffects.particles.push(debris);
    }

    const smokeCount = this.getScaledParticleCount(10 + Math.floor(radius / 8));
    for (let i = 0; i < smokeCount; i += 1) {
      const angle = this.randomFloat('volatility') * Math.PI * 2;
      const distance = this.randomFloat('volatility') * radius * 0.55;
      const speed = 20 + this.randomFloat('volatility') * 50;
      const smoke = new SpaceParticle(
        position.x + Math.cos(angle) * distance,
        position.y + Math.sin(angle) * distance,
        Math.cos(angle) * speed * 0.35,
        Math.sin(angle) * speed * 0.35,
        withAlpha(PALETTE.rock, 0.25 + this.randomFloat('volatility') * 0.18),
        3.5 + this.randomFloat('volatility') * 3.5,
        0.85 + this.randomFloat('volatility') * 0.5,
        'smoke',
        this.getRandomFork('volatility')
      );
      this.particleEffects.particles.push(smoke);
    }

    this.particleEffects.particles.push(
      new SpaceParticle(
        position.x,
        position.y,
        0,
        0,
        withAlpha(PALETTE.shot, 0.5),
        radius * 0.24,
        0.45 + this.randomFloat('volatility') * 0.2,
        'normal',
        this.getRandomFork('volatility')
      )
    );
  }

  // SHELL_IMPACT; rolls from the 'volatility' fork, which the shell's
  // borrowed Volatile blast drew from before.
  createShellImpactEffect({ position, radius }) {
    const fx = SHELL_IMPACT;
    const { x, y } = position;
    const roll = (min, max) =>
      min + this.randomFloat('volatility') * (max - min);

    this.addScreenShake(fx.shake, fx.shakeSeconds);
    this.particleEffects.createExplosionShockwave({
      position,
      radius: radius * fx.shockwaveScale,
    });

    const sparks = this.getScaledParticleCount(fx.sparks);
    for (let i = 0; i < sparks; i += 1) {
      const angle = roll(0, Math.PI * 2);
      const speed = roll(fx.sparkSpeedMin, fx.sparkSpeedMax);
      this.particleEffects.particles.push(
        new SpaceParticle(
          x,
          y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          withAlpha(PALETTE.shot, roll(fx.sparkAlphaMin, fx.sparkAlphaMax)),
          roll(fx.sparkSizeMin, fx.sparkSizeMax),
          roll(fx.sparkLifeMin, fx.sparkLifeMax),
          'spark',
          this.getRandomFork('volatility')
        )
      );
    }

    const embers = this.getScaledParticleCount(fx.embers);
    for (let i = 0; i < embers; i += 1) {
      const angle = roll(0, Math.PI * 2);
      const distance = roll(0, radius * fx.emberReach);
      const speed = roll(0, fx.emberSpeedMax);
      this.particleEffects.particles.push(
        new SpaceParticle(
          x + Math.cos(angle) * distance,
          y + Math.sin(angle) * distance,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          withAlpha(PALETTE.shot, fx.emberAlpha),
          roll(fx.emberSizeMin, fx.emberSizeMax),
          roll(fx.emberLifeMin, fx.emberLifeMax),
          'normal',
          this.getRandomFork('volatility')
        )
      );
    }

    this.particleEffects.particles.push(
      new SpaceParticle(
        x,
        y,
        0,
        0,
        withAlpha(PALETTE.shot, fx.glowAlpha),
        radius * fx.glowScale,
        fx.glowLife,
        'normal',
        this.getRandomFork('volatility')
      )
    );
  }
}
