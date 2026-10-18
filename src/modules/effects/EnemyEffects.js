// src/modules/effects/EnemyEffects.js
//
// What the enemies and the field do, as light: drone, hunter and boss muzzle
// flashes, mine, drone, hunter and asteroid deaths, crack debris, the
// Volatile rock's trail, warning and blast, and the Caster shell landing.
// EffectsSystem owns it and its enemy listeners land here.

import { PALETTE, withAlpha } from '../../data/constants/palette.js';
import { ShakePresets } from '../../utils/ScreenShake.js';
import { ASTEROID_VARIANTS } from '../../data/enemies/asteroid-configs.js';
import { SpaceParticle } from '../EffectEntities.js';
import { BOSS_FX } from './BossTransitions.js';

// Light lingers (docs/NORTE.md §2): PROPOSAL from 17/10, judged by playing.
// A multiplier on the old lifetimes: asteroid explosion embers were
// 0.32–0.54 s (secondary 0.28–0.46 s). Stone chips are mass, not light, and
// are unchanged.
const EXPLOSION_EMBER_LIFE_SCALE = 1.3; // was 1

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

// One light per source (docs/NORTE.md §2). Machine enemies glow threat-red and
// shed matte hull chips; the boss glows violet (BOSS_FX, in BossTransitions).
// Data-file colors are ignored here on purpose: they predate the palette.
const ENEMY_FX = Object.freeze({
  spark: PALETTE.threat,
  sparkDim: withAlpha(PALETTE.threat, 0.7),
  glow: withAlpha(PALETTE.threat, 0.45),
  chip: PALETTE.hullLit,
  smoke: withAlpha(PALETTE.rock, 0.45),
});

export class EnemyEffects {
  /**
   * `particleEffects`: the effects' Particles; every particle lands in its list, and its shockwaves are used directly.
   * `createParticle(x, y, vx, vy, color, size, life, type)`: the effects' createParticle, not Particles' own, as in PlayerEffects.
   * `randomFloat(fork)`, `randomRange(min, max, fork)`: the effects' random helpers; rolls draw from 'muzzleFlash', 'boss', 'explosions' and 'volatility'.
   * `getRandomFork(name)`: the effects' random fork; a SpaceParticle built here rolls its spin from it.
   * `getScaledParticleCount(count, options)`, `getScaledProbability(probability)`: the effects' Reduced Particles scaling.
   * `particleDensity()`: the Reduced Particles density, read live; it thins the cracks a stage change shows.
   * `motionReduced()`: the Reduced Motion setting, read live; on means no crack sparks.
   * `addScreenShake(presetOrIntensity, durationOrOptions)`, `addScreenFlash(color, duration, intensity)`: the effects' screen feedback.
   * `addHitStop(kind)`: the effects' game time.
   */
  constructor({
    particleEffects,
    createParticle,
    randomFloat,
    randomRange,
    getRandomFork,
    getScaledParticleCount,
    getScaledProbability,
    particleDensity,
    motionReduced,
    addScreenShake,
    addScreenFlash,
    addHitStop,
  }) {
    this.particleEffects = particleEffects;
    this.createParticle = createParticle;
    this.randomFloat = randomFloat;
    this.randomRange = randomRange;
    this.getRandomFork = getRandomFork;
    this.getScaledParticleCount = getScaledParticleCount;
    this.getScaledProbability = getScaledProbability;
    this.particleDensity = particleDensity;
    this.motionReduced = motionReduced;
    this.addScreenShake = addScreenShake;
    this.addScreenFlash = addScreenFlash;
    this.addHitStop = addHitStop;

    // Mines whose blast already played; a mine leaving the pool again is
    // forgotten in onEnemySpawned.
    this.processedMineExplosions = new WeakSet();
  }

  // === EffectsSystem's enemy listeners land here ===

  onEnemyFired(payload = {}) {
    const type = this.resolveEnemyType(payload);
    switch (type) {
      case 'drone':
        this.createDroneMuzzleFlash(payload);
        break;
      case 'hunter':
        this.createHunterBurstEffect(payload);
        break;
      case 'boss':
        this.createBossAttackEffect(payload);
        break;
      default:
        break;
    }
  }

  onEnemySpawned(payload = {}) {
    const enemy = payload?.enemy;
    if (!enemy || !(this.processedMineExplosions instanceof WeakSet)) {
      return;
    }

    const isMine = enemy.type === 'mine' || payload.type === 'mine';
    if (!isMine) {
      return;
    }

    this.processedMineExplosions.delete(enemy);
  }

  onVolatileArmed(data) {
    if (data?.position) {
      this.addScreenFlash(withAlpha(PALETTE.shot, 0.18), 0.12, 0.08);
      this.spawnVolatileWarning(data.position);
    }
  }

  // === The bursts ===

  resolveEnemyType(payload = {}, fallbackEnemy = null) {
    if (!payload && !fallbackEnemy) {
      return null;
    }

    const typeCandidate =
      payload?.enemyType ??
      payload?.type ??
      payload?.enemy?.type ??
      payload?.source?.type ??
      fallbackEnemy?.type ??
      null;

    if (typeof typeCandidate === 'string' && typeCandidate.trim().length > 0) {
      return typeCandidate.trim().toLowerCase();
    }

    return null;
  }

  resolveEnemyProjectileOrigin(payload = {}) {
    const positionCandidate =
      payload?.position || payload?.origin || payload?.source?.position || null;
    const enemy = payload?.enemy || null;

    const x = Number.isFinite(positionCandidate?.x)
      ? positionCandidate.x
      : Number.isFinite(enemy?.x)
        ? enemy.x
        : Number.isFinite(enemy?.position?.x)
          ? enemy.position.x
          : null;
    const y = Number.isFinite(positionCandidate?.y)
      ? positionCandidate.y
      : Number.isFinite(enemy?.y)
        ? enemy.y
        : Number.isFinite(enemy?.position?.y)
          ? enemy.position.y
          : null;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    return { x, y };
  }

  resolveEnemyProjectileDirection(payload = {}) {
    const projectile = payload?.projectile || {};
    let vx = Number.isFinite(payload?.velocity?.x) ? payload.velocity.x : null;
    let vy = Number.isFinite(payload?.velocity?.y) ? payload.velocity.y : null;

    if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
      vx = Number.isFinite(projectile?.vx) ? projectile.vx : vx;
      vy = Number.isFinite(projectile?.vy) ? projectile.vy : vy;
    }

    if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
      const angle = Number.isFinite(projectile?.angle)
        ? projectile.angle
        : Number.isFinite(payload?.angle)
          ? payload.angle
          : null;

      if (Number.isFinite(angle)) {
        const speed = Number.isFinite(projectile?.speed)
          ? Math.max(0, projectile.speed)
          : 1;
        vx = Math.cos(angle) * speed;
        vy = Math.sin(angle) * speed;
      }
    }

    vx = Number.isFinite(vx) ? vx : 0;
    vy = Number.isFinite(vy) ? vy : 0;

    const speed = Math.hypot(vx, vy);
    if (speed <= 0.0001) {
      return { x: 1, y: 0, speed: 0 };
    }

    return { x: vx / speed, y: vy / speed, speed };
  }

  createDroneMuzzleFlash(payload = {}) {
    const origin = this.resolveEnemyProjectileOrigin(payload);
    if (!origin) {
      return;
    }

    const enemy = payload?.enemy || null;
    const direction = this.resolveEnemyProjectileDirection(payload);
    const radius = Number.isFinite(enemy?.radius) ? enemy.radius : 12;
    const muzzleDistance = radius + 8;
    const spawnX = origin.x + direction.x * muzzleDistance;
    const spawnY = origin.y + direction.y * muzzleDistance;

    const baseColor = ENEMY_FX.spark;
    const accentColor = ENEMY_FX.sparkDim;
    const exhaustColor = ENEMY_FX.glow;
    const flashColor = withAlpha(PALETTE.threat, 0.35);

    const particleCount = this.getScaledParticleCount(
      4 + this.randomFloat('muzzleFlash') * 3,
      {
        minimum: 2,
      }
    );

    const baseAngle = Math.atan2(direction.y, direction.x);
    for (let i = 0; i < particleCount; i += 1) {
      const spread = (this.randomFloat('muzzleFlash') - 0.5) * 0.4;
      const angle = baseAngle + spread;
      const speed = 220 + this.randomFloat('muzzleFlash') * 140;
      const size = 2.4 + this.randomFloat('muzzleFlash') * 1.8;
      const life = 0.1 + this.randomFloat('muzzleFlash') * 0.12;
      const color = i % 2 === 0 ? baseColor : accentColor;

      this.particleEffects.particles.push(
        this.createParticle(
          spawnX,
          spawnY,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          color,
          size,
          life,
          'spark'
        )
      );
    }

    const glowCount = this.getScaledParticleCount(3, { allowZero: true });
    for (let i = 0; i < glowCount; i += 1) {
      const backSpeed = 70 + this.randomFloat('muzzleFlash') * 60;
      this.particleEffects.particles.push(
        this.createParticle(
          origin.x,
          origin.y,
          -direction.x *
            backSpeed *
            (0.7 + this.randomFloat('muzzleFlash') * 0.5),
          -direction.y *
            backSpeed *
            (0.7 + this.randomFloat('muzzleFlash') * 0.5),
          exhaustColor,
          2.6 + this.randomFloat('muzzleFlash') * 2.4,
          0.16 + this.randomFloat('muzzleFlash') * 0.12,
          'normal'
        )
      );
    }

    this.addScreenFlash(flashColor, 0.08, 0.06);
    this.addScreenShake(2.2, 0.1);
  }

  createHunterBurstEffect(payload = {}) {
    const origin = this.resolveEnemyProjectileOrigin(payload);
    if (!origin) {
      return;
    }

    const enemy = payload?.enemy || null;
    const direction = this.resolveEnemyProjectileDirection(payload);
    const radius = Number.isFinite(enemy?.radius) ? enemy.radius : 16;
    const muzzleDistance = radius + 10;
    const spawnX = origin.x + direction.x * muzzleDistance;
    const spawnY = origin.y + direction.y * muzzleDistance;

    const baseColor = ENEMY_FX.spark;
    const accentColor = ENEMY_FX.sparkDim;
    const trailColor = ENEMY_FX.glow;
    const flashColor = withAlpha(PALETTE.threat, 0.38);

    const burstInfo = payload?.projectile?.burst || {};
    const shotsRemaining = Number.isFinite(burstInfo.shotsRemaining)
      ? burstInfo.shotsRemaining
      : null;
    const finalShot = shotsRemaining != null ? shotsRemaining <= 1 : false;
    const baseAngle = Math.atan2(direction.y, direction.x);

    const streakAngles = [-0.1, 0, 0.1];
    streakAngles.forEach((offset, index) => {
      const jitter = (this.randomFloat('muzzleFlash') - 0.5) * 0.12;
      const angle = baseAngle + offset + jitter;
      const speed = 260 + this.randomFloat('muzzleFlash') * 160;
      const size = 3 + this.randomFloat('muzzleFlash') * 2.2;
      const life = 0.12 + this.randomFloat('muzzleFlash') * 0.12;
      const color = index === 1 ? baseColor : accentColor;

      this.particleEffects.particles.push(
        this.createParticle(
          spawnX,
          spawnY,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          color,
          size,
          life,
          'spark'
        )
      );
    });

    const trailCount = this.getScaledParticleCount(4, { allowZero: true });
    for (let i = 0; i < trailCount; i += 1) {
      const backSpeed = 90 + this.randomFloat('muzzleFlash') * 70;
      this.particleEffects.particles.push(
        this.createParticle(
          origin.x,
          origin.y,
          -direction.x *
            backSpeed *
            (0.6 + this.randomFloat('muzzleFlash') * 0.4),
          -direction.y *
            backSpeed *
            (0.6 + this.randomFloat('muzzleFlash') * 0.4),
          trailColor,
          2.8 + this.randomFloat('muzzleFlash') * 2.6,
          0.18 + this.randomFloat('muzzleFlash') * 0.1,
          'normal'
        )
      );
    }

    const flashDuration = finalShot ? 0.12 : 0.09;
    const flashIntensity = finalShot ? 0.12 : 0.08;
    this.addScreenFlash(flashColor, flashDuration, flashIntensity);
    this.addScreenShake(finalShot ? 3.8 : 2.6, finalShot ? 0.2 : 0.14);
  }

  createBossAttackEffect(payload = {}) {
    const origin = this.resolveEnemyProjectileOrigin(payload);
    const enemy = payload?.enemy || payload?.boss || null;
    if (!origin || !enemy) {
      return;
    }

    const direction = this.resolveEnemyProjectileDirection(payload);
    const radius = Number.isFinite(enemy?.radius) ? enemy.radius : 60;
    const muzzleDistance = radius + 18;
    const spawnX = origin.x + direction.x * muzzleDistance;
    const spawnY = origin.y + direction.y * muzzleDistance;

    const coreColor = BOSS_FX.core;
    const accentColor = BOSS_FX.accent;

    const particleCount = this.getScaledParticleCount(6, { minimum: 3 });
    const baseAngle = Math.atan2(direction.y, direction.x);
    for (let i = 0; i < particleCount; i += 1) {
      const spread = (this.randomFloat('boss') - 0.5) * 0.28;
      const angle = baseAngle + spread;
      const speed = 280 + this.randomFloat('boss') * 160;
      const size = 3.2 + this.randomFloat('boss') * 2.6;
      const life = 0.14 + this.randomFloat('boss') * 0.12;
      const color = i % 2 === 0 ? coreColor : accentColor;

      this.particleEffects.particles.push(
        this.createParticle(
          spawnX,
          spawnY,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          color,
          size,
          life,
          'spark'
        )
      );
    }

    this.addScreenFlash(BOSS_FX.flash, 0.14, 0.12);
    this.addScreenShake('bossAttack');
  }

  createMineExplosion(payload = {}) {
    if (!payload) {
      return;
    }

    const enemy = payload.enemy || null;
    if (enemy && this.processedMineExplosions instanceof WeakSet) {
      if (this.processedMineExplosions.has(enemy)) {
        return;
      }
      this.processedMineExplosions.add(enemy);
    }

    const positionCandidate =
      payload.position || (enemy ? { x: enemy.x, y: enemy.y } : null);
    if (!positionCandidate) {
      return;
    }

    const posX = Number.isFinite(positionCandidate.x)
      ? positionCandidate.x
      : null;
    const posY = Number.isFinite(positionCandidate.y)
      ? positionCandidate.y
      : null;
    if (!Number.isFinite(posX) || !Number.isFinite(posY)) {
      return;
    }

    const position = { x: posX, y: posY };
    const radius = Number.isFinite(payload.radius)
      ? payload.radius
      : Number.isFinite(enemy?.explosionRadius)
        ? enemy.explosionRadius
        : 120;
    const velocity = payload.velocity || {
      x: Number.isFinite(enemy?.vx) ? enemy.vx : 0,
      y: Number.isFinite(enemy?.vy) ? enemy.vy : 0,
    };

    const radiusFactor = Math.max(1, radius / 110);
    const flashColor = withAlpha(PALETTE.threat, 0.4);
    const shockwaveColor = withAlpha(PALETTE.threat, 0.35);
    const debrisColor = ENEMY_FX.chip;
    const sparkColor = ENEMY_FX.spark;
    const smokeColor = ENEMY_FX.smoke;

    const shakePreset = ShakePresets.mineExplosion;
    const baseShakeIntensity = 6 + 110 * 0.025;
    const shakeIntensity = 6 + radius * 0.025;
    const traumaMultiplier = Math.max(
      0.6,
      Math.min(1.6, shakeIntensity / baseShakeIntensity)
    );
    const baseDuration = Number.isFinite(shakePreset?.duration)
      ? shakePreset.duration
      : 0.36;
    const targetDuration = 0.28 + radiusFactor * 0.08;
    const durationOffset = targetDuration - baseDuration;

    this.addScreenShake('mineExplosion', {
      traumaMultiplier,
      durationOffset,
      maxTrauma: 1,
      minDuration: 0.2,
      maxDuration: 1.2,
    });
    this.addScreenFlash(flashColor, 0.22, 0.2 + radiusFactor * 0.05);
    this.addHitStop('mine');

    this.particleEffects.createShockwaveEffect({
      position,
      radius: radius * 1.1,
      duration: 0.55,
      baseWidth: 20,
      maxAlpha: 0.72,
      color: shockwaveColor,
    });

    const sparkCount = this.getScaledParticleCount(24 + Math.round(radius / 4));
    for (let i = 0; i < sparkCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed =
        (140 + this.randomFloat('explosions') * 180) *
        (0.9 + radiusFactor * 0.25);
      this.particleEffects.particles.push(
        this.createParticle(
          position.x,
          position.y,
          Math.cos(angle) * speed + (velocity.x || 0) * 0.35,
          Math.sin(angle) * speed + (velocity.y || 0) * 0.35,
          sparkColor,
          2.4 + this.randomFloat('explosions') * 2.8,
          0.32 + this.randomFloat('explosions') * 0.18,
          'spark'
        )
      );
    }

    const debrisCount = this.getScaledParticleCount(
      14 + Math.round(radius / 6)
    );
    for (let i = 0; i < debrisCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 90 + this.randomFloat('explosions') * 110;
      this.particleEffects.particles.push(
        this.createParticle(
          position.x + Math.cos(angle) * radius * 0.18,
          position.y + Math.sin(angle) * radius * 0.18,
          Math.cos(angle) * speed + (velocity.x || 0) * 0.25,
          Math.sin(angle) * speed + (velocity.y || 0) * 0.25,
          debrisColor,
          3.2 + this.randomFloat('explosions') * 2.4,
          0.5 + this.randomFloat('explosions') * 0.3,
          'debris'
        )
      );
    }

    const smokeCount = this.getScaledParticleCount(
      10 + Math.round(radius / 10),
      {
        allowZero: true,
      }
    );
    for (let i = 0; i < smokeCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 40 + this.randomFloat('explosions') * 60;
      this.particleEffects.particles.push(
        this.createParticle(
          position.x,
          position.y,
          Math.cos(angle) * speed * 0.6,
          Math.sin(angle) * speed * 0.6,
          smokeColor,
          6 + this.randomFloat('explosions') * 5,
          0.7 + this.randomFloat('explosions') * 0.4,
          'smoke'
        )
      );
    }
  }

  createDroneDestructionEffect(enemy, context = {}) {
    if (!enemy) {
      return;
    }

    const position = {
      x: Number.isFinite(enemy.x)
        ? enemy.x
        : Number.isFinite(context?.position?.x)
          ? context.position.x
          : null,
      y: Number.isFinite(enemy.y)
        ? enemy.y
        : Number.isFinite(context?.position?.y)
          ? context.position.y
          : null,
    };

    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      return;
    }

    const radius = Number.isFinite(enemy.radius) ? enemy.radius : 12;
    const velocity = {
      x: Number.isFinite(enemy.vx) ? enemy.vx : 0,
      y: Number.isFinite(enemy.vy) ? enemy.vy : 0,
    };

    this.addScreenShake('droneDestroyed');
    this.addHitStop('drone');
    this.addScreenFlash(withAlpha(PALETTE.threat, 0.35), 0.12, 0.1);

    const sparkCount = this.getScaledParticleCount(14 + Math.round(radius));
    for (let i = 0; i < sparkCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 120 + this.randomFloat('explosions') * 150;
      this.particleEffects.particles.push(
        this.createParticle(
          position.x,
          position.y,
          Math.cos(angle) * speed + velocity.x * 0.3,
          Math.sin(angle) * speed + velocity.y * 0.3,
          ENEMY_FX.spark,
          2 + this.randomFloat('explosions') * 2.2,
          0.32 + this.randomFloat('explosions') * 0.18,
          'spark'
        )
      );
    }

    const coreCount = this.getScaledParticleCount(6, { allowZero: true });
    for (let i = 0; i < coreCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 70 + this.randomFloat('explosions') * 80;
      this.particleEffects.particles.push(
        this.createParticle(
          position.x,
          position.y,
          Math.cos(angle) * speed + velocity.x * 0.25,
          Math.sin(angle) * speed + velocity.y * 0.25,
          ENEMY_FX.glow,
          3 + this.randomFloat('explosions') * 2.8,
          0.4 + this.randomFloat('explosions') * 0.18,
          'normal'
        )
      );
    }

    const smokeCount = this.getScaledParticleCount(5, { allowZero: true });
    for (let i = 0; i < smokeCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 40 + this.randomFloat('explosions') * 60;
      this.particleEffects.particles.push(
        this.createParticle(
          position.x,
          position.y,
          Math.cos(angle) * speed * 0.5,
          Math.sin(angle) * speed * 0.5,
          ENEMY_FX.chip,
          4.5 + this.randomFloat('explosions') * 3.2,
          0.55 + this.randomFloat('explosions') * 0.22,
          'debris'
        )
      );
    }
  }

  createHunterDestructionEffect(enemy, context = {}) {
    if (!enemy) {
      return;
    }

    const position = {
      x: Number.isFinite(enemy.x)
        ? enemy.x
        : Number.isFinite(context?.position?.x)
          ? context.position.x
          : null,
      y: Number.isFinite(enemy.y)
        ? enemy.y
        : Number.isFinite(context?.position?.y)
          ? context.position.y
          : null,
    };

    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      return;
    }

    const radius = Number.isFinite(enemy.radius) ? enemy.radius : 16;
    const velocity = {
      x: Number.isFinite(enemy.vx) ? enemy.vx : 0,
      y: Number.isFinite(enemy.vy) ? enemy.vy : 0,
    };

    this.addScreenShake('hunterDestroyed');
    this.addHitStop('hunter');
    this.addScreenFlash(withAlpha(PALETTE.threat, 0.38), 0.14, 0.14);
    this.particleEffects.createShockwaveEffect({
      position,
      radius: radius * 2.4,
      duration: 0.42,
      baseWidth: 16,
      maxAlpha: 0.55,
      color: withAlpha(PALETTE.threat, 0.5),
    });

    const sparkCount = this.getScaledParticleCount(
      18 + Math.round(radius * 1.5)
    );
    for (let i = 0; i < sparkCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 150 + this.randomFloat('explosions') * 170;
      const color = i % 3 === 0 ? ENEMY_FX.sparkDim : ENEMY_FX.spark;
      this.particleEffects.particles.push(
        this.createParticle(
          position.x,
          position.y,
          Math.cos(angle) * speed + velocity.x * 0.35,
          Math.sin(angle) * speed + velocity.y * 0.35,
          color,
          2.6 + this.randomFloat('explosions') * 2.6,
          0.34 + this.randomFloat('explosions') * 0.2,
          'spark'
        )
      );
    }

    const plumeCount = this.getScaledParticleCount(8, { allowZero: true });
    for (let i = 0; i < plumeCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 60 + this.randomFloat('explosions') * 80;
      this.particleEffects.particles.push(
        this.createParticle(
          position.x,
          position.y,
          Math.cos(angle) * speed + velocity.x * 0.22,
          Math.sin(angle) * speed + velocity.y * 0.22,
          ENEMY_FX.glow,
          4.8 + this.randomFloat('explosions') * 3.4,
          0.46 + this.randomFloat('explosions') * 0.24,
          'normal'
        )
      );
    }

    const smokeCount = this.getScaledParticleCount(7, { allowZero: true });
    for (let i = 0; i < smokeCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 40 + this.randomFloat('explosions') * 60;
      this.particleEffects.particles.push(
        this.createParticle(
          position.x,
          position.y,
          Math.cos(angle) * speed * 0.55,
          Math.sin(angle) * speed * 0.55,
          ENEMY_FX.chip,
          5.4 + this.randomFloat('explosions') * 3.6,
          0.6 + this.randomFloat('explosions') * 0.22,
          'debris'
        )
      );
    }
  }

  createAsteroidExplosion(asteroid, context = {}) {
    if (!asteroid) {
      return;
    }

    const enemyType = this.resolveEnemyType({ enemy: asteroid });
    if (enemyType === 'drone') {
      this.createDroneDestructionEffect(asteroid, context);
      return;
    }

    if (enemyType === 'hunter') {
      this.createHunterDestructionEffect(asteroid, context);
      return;
    }

    if (enemyType === 'mine') {
      const minePayload = {
        ...context,
        enemy: asteroid,
      };
      if (!minePayload.position) {
        minePayload.position = {
          x: Number.isFinite(asteroid.x) ? asteroid.x : 0,
          y: Number.isFinite(asteroid.y) ? asteroid.y : 0,
        };
      }
      if (
        !Number.isFinite(minePayload.radius) &&
        Number.isFinite(asteroid.explosionRadius)
      ) {
        minePayload.radius = asteroid.explosionRadius;
      }
      if (!minePayload.velocity) {
        minePayload.velocity = {
          x: Number.isFinite(asteroid.vx) ? asteroid.vx : 0,
          y: Number.isFinite(asteroid.vy) ? asteroid.vy : 0,
        };
      }
      this.createMineExplosion(minePayload);
      return;
    }

    if (enemyType === 'boss') {
      // Boss explosions are handled by dedicated boss events to avoid duplicates.
      return;
    }

    const variantColors =
      typeof asteroid.getVariantColors === 'function'
        ? asteroid.getVariantColors()
        : null;
    // Matte rock chips plus embers in the variant's vein color (the crystal
    // inside the Ring stone).
    const debrisColor = variantColors?.fill || PALETTE.rock;
    const sparkColor =
      variantColors?.veins || variantColors?.cracks || PALETTE.shot;
    if (!variantColors?.glow && !variantColors?.pulse) {
      this.randomFloat('explosions'); // the old hue roll; keeps the fork in step
    }

    const baseCount = { large: 12, medium: 8, small: 5 }[asteroid.size] || 6;
    const radius = Number.isFinite(asteroid.radius)
      ? Math.max(asteroid.radius, 12)
      : 20;
    const densityFactor = Math.max(1, radius / 22);
    const particleCount = this.getScaledParticleCount(
      Math.round(baseCount * densityFactor)
    );

    const parentVx = Number.isFinite(asteroid.vx) ? asteroid.vx : 0;
    const parentVy = Number.isFinite(asteroid.vy) ? asteroid.vy : 0;
    const momentumScale = 0.35;
    const speedScale = Math.max(0.85, Math.min(1.8, radius / 24));

    if (asteroid.size === 'small') {
      this.addScreenShake(2 + radius * 0.01, 0.12);
      this.addHitStop('small');
      // Small shockwave
      this.particleEffects.createShockwaveEffect({
        position: { x: asteroid.x, y: asteroid.y },
        radius: 60,
        duration: 0.3,
        color: sparkColor,
        baseWidth: 6,
      });
    } else if (asteroid.size === 'medium') {
      this.addScreenShake(4 + radius * 0.012, 0.18);
      this.addHitStop('medium');
      // Medium shockwave
      this.particleEffects.createShockwaveEffect({
        position: { x: asteroid.x, y: asteroid.y },
        radius: 120,
        duration: 0.4,
        color: sparkColor,
        baseWidth: 10,
      });
    } else if (asteroid.size === 'large') {
      this.addScreenShake(8 + radius * 0.015, 0.28);
      this.addHitStop('large');
      this.addScreenFlash(
        variantColors?.glow || withAlpha(sparkColor, 0.6),
        0.22,
        0.12
      );
      // Massive shockwave
      this.particleEffects.createShockwaveEffect({
        position: { x: asteroid.x, y: asteroid.y },
        radius: 250,
        duration: 0.6,
        color: sparkColor,
        baseWidth: 20,
      });
    }

    for (let i = 0; i < particleCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = (40 + this.randomFloat('explosions') * 80) * speedScale;

      const offset = radius * 0.5 * (this.randomFloat('explosions') - 0.5);
      const spawnX = asteroid.x + Math.cos(angle) * offset;
      const spawnY = asteroid.y + Math.sin(angle) * offset;

      const debris = this.createParticle(
        spawnX,
        spawnY,
        Math.cos(angle) * speed + parentVx * momentumScale,
        Math.sin(angle) * speed + parentVy * momentumScale,
        debrisColor,
        2 + this.randomFloat('explosions') * 3.2,
        0.6 + this.randomFloat('explosions') * 0.45,
        'debris'
      );
      this.particleEffects.particles.push(debris);

      // every other one is a lit chip: mostly stone, a few embers
      const ember = i % 2 === 0;
      const spark = this.createParticle(
        asteroid.x,
        asteroid.y,
        Math.cos(angle) * speed * 1.25 + parentVx * momentumScale,
        Math.sin(angle) * speed * 1.25 + parentVy * momentumScale,
        ember ? sparkColor : PALETTE.rockLit,
        1.6 + this.randomFloat('explosions') * 1.6,
        (0.32 + this.randomFloat('explosions') * 0.22) *
          (ember ? EXPLOSION_EMBER_LIFE_SCALE : 1),
        ember ? 'spark' : 'debris'
      );
      this.particleEffects.particles.push(spark);

      if (this.randomFloat('explosions') < 0.35) {
        const secondary = new SpaceParticle(
          asteroid.x,
          asteroid.y,
          Math.cos(angle + Math.PI / 2) * speed * 0.6,
          Math.sin(angle + Math.PI / 2) * speed * 0.6,
          sparkColor,
          1.2 + this.randomFloat('explosions') * 1,
          (0.28 + this.randomFloat('explosions') * 0.18) *
            EXPLOSION_EMBER_LIFE_SCALE,
          'spark',
          this.getRandomFork('explosions')
        );
        this.particleEffects.particles.push(secondary);
      }
    }
  }

  resolveAsteroidColors(variant) {
    const config = ASTEROID_VARIANTS?.[variant] || ASTEROID_VARIANTS?.common;
    const colors = config?.colors || {};
    const vein = colors.veins || colors.cracks || PALETTE.shot;

    return {
      cracks: vein,
      glow: vein,
      debris: colors.fill || PALETTE.rock,
    };
  }

  createCrackDebris(event = {}) {
    if (!event || !event.position) {
      return;
    }

    const position = event.position;
    const rotation = Number.isFinite(event.rotation) ? event.rotation : 0;
    const radius = Number.isFinite(event.radius)
      ? Math.max(event.radius, 6)
      : 18;
    const variant = event.variant || 'common';

    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    const toWorldPoint = (point) => ({
      x: position.x + point.x * cos - point.y * sin,
      y: position.y + point.x * sin + point.y * cos,
    });

    const rotateVector = (vector) => ({
      x: vector.x * cos - vector.y * sin,
      y: vector.x * sin + vector.y * cos,
    });

    const colors = this.resolveAsteroidColors(variant);
    const intensity = Math.max(1, Math.round(event.intensity ?? 1));
    const baseLifetime = 0.2 + intensity * 0.08;
    const burst = event.burst || {};

    const segmentsInput = Array.isArray(event.segments) ? event.segments : [];
    const sanitizedSegments = segmentsInput
      .map((segment) => {
        if (!segment) {
          return null;
        }

        const startX = Number.isFinite(segment.start?.x)
          ? segment.start.x
          : Number.isFinite(segment.x1)
            ? segment.x1
            : 0;
        const startY = Number.isFinite(segment.start?.y)
          ? segment.start.y
          : Number.isFinite(segment.y1)
            ? segment.y1
            : 0;
        const endX = Number.isFinite(segment.end?.x)
          ? segment.end.x
          : Number.isFinite(segment.x2)
            ? segment.x2
            : 0;
        const endY = Number.isFinite(segment.end?.y)
          ? segment.end.y
          : Number.isFinite(segment.y2)
            ? segment.y2
            : 0;
        const length = Number.isFinite(segment.length)
          ? segment.length
          : Math.hypot(endX - startX, endY - startY);

        if (!Number.isFinite(length) || length <= 0.2) {
          return null;
        }

        return {
          id: segment.id || null,
          width: Number.isFinite(segment.width) ? segment.width : 1,
          length,
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
          type: segment.type || 'line',
        };
      })
      .filter(Boolean);

    const createSegmentKey = (segment) => {
      const startX = Number.isFinite(segment.start?.x) ? segment.start.x : 0;
      const startY = Number.isFinite(segment.start?.y) ? segment.start.y : 0;
      const endX = Number.isFinite(segment.end?.x) ? segment.end.x : 0;
      const endY = Number.isFinite(segment.end?.y) ? segment.end.y : 0;
      const type = segment.type || 'line';
      return [
        segment.id ?? 'no-id',
        startX.toFixed(4),
        startY.toFixed(4),
        endX.toFixed(4),
        endY.toFixed(4),
        type,
      ].join(':');
    };

    const segments = [];
    const seenSegments = new Set();

    sanitizedSegments.forEach((segment) => {
      const key = createSegmentKey(segment);
      if (seenSegments.has(key)) {
        return;
      }

      seenSegments.add(key);
      segments.push(segment);
    });

    if (!segments.length) {
      return;
    }

    segments.sort((a, b) => b.length - a.length);

    const baseCrackCount = Math.max(
      1,
      Math.round(segments.length * (0.65 + this.particleDensity() * 0.45))
    );

    const cracksToSpawn = Math.max(
      1,
      Math.min(
        segments.length,
        this.getScaledParticleCount(baseCrackCount, {
          allowZero: false,
          minimum: 1,
        })
      )
    );

    const selectedSegments = segments.slice(0, cracksToSpawn);

    selectedSegments.forEach((segment) => {
      const worldStart = toWorldPoint(segment.start);
      const worldEnd = toWorldPoint(segment.end);
      const midX = (worldStart.x + worldEnd.x) * 0.5;
      const midY = (worldStart.y + worldEnd.y) * 0.5;
      const angle = Math.atan2(
        worldEnd.y - worldStart.y,
        worldEnd.x - worldStart.x
      );
      const crackLength = Math.max(0.5, segment.length);

      const crack = new SpaceParticle(
        midX,
        midY,
        0,
        0,
        colors.cracks,
        Math.max(0.55, crackLength / 3.2),
        baseLifetime + Math.min(0.12, crackLength / (radius * 6)),
        'crack',
        this.getRandomFork('explosions')
      );
      crack.rotation = angle;
      crack.rotationSpeed = 0;
      this.particleEffects.particles.push(crack);

      if (!this.motionReduced()) {
        const sparkSpeed = 22 + this.randomFloat('explosions') * 28;
        this.particleEffects.particles.push(
          this.createParticle(
            worldEnd.x,
            worldEnd.y,
            Math.cos(angle) * sparkSpeed * 0.32,
            Math.sin(angle) * sparkSpeed * 0.32,
            colors.glow,
            0.9 + this.randomFloat('explosions') * 0.7,
            0.22 + this.randomFloat('explosions') * 0.16,
            'spark'
          )
        );
      }
    });

    const shardCount = this.getScaledParticleCount(burst.shards ?? 0, {
      allowZero: true,
    });

    if (shardCount > 0 && selectedSegments.length > 0) {
      for (let i = 0; i < shardCount; i += 1) {
        const segment = selectedSegments[i % selectedSegments.length];
        const t = this.randomFloat('explosions');
        const localPoint = {
          x: segment.start.x + (segment.end.x - segment.start.x) * t,
          y: segment.start.y + (segment.end.y - segment.start.y) * t,
        };
        const worldPoint = toWorldPoint(localPoint);
        const direction = rotateVector({
          x: segment.end.x - segment.start.x,
          y: segment.end.y - segment.start.y,
        });
        const dirLength = Math.hypot(direction.x, direction.y) || 1;
        const normalized = {
          x: direction.x / dirLength,
          y: direction.y / dirLength,
        };
        const speed = 22 + this.randomFloat('explosions') * 32;

        this.particleEffects.particles.push(
          this.createParticle(
            worldPoint.x,
            worldPoint.y,
            normalized.x * speed,
            normalized.y * speed,
            colors.debris,
            1.4 + this.randomFloat('explosions') * 1.6,
            0.38 + this.randomFloat('explosions') * 0.22,
            'debris'
          )
        );
      }
    }

    const sparkBase =
      (burst.sparks ?? intensity * 2) +
      Math.max(0, Number.isFinite(burst.cracks) ? burst.cracks * 0.3 : 0);
    const sparkCount = this.getScaledParticleCount(sparkBase, {
      allowZero: true,
    });

    for (let i = 0; i < sparkCount; i += 1) {
      const segment =
        selectedSegments.length > 0
          ? selectedSegments[
              Math.floor(
                this.randomFloat('explosions') * selectedSegments.length
              )
            ]
          : null;
      const t = this.randomFloat('explosions');
      const localOrigin = segment
        ? {
            x: segment.start.x + (segment.end.x - segment.start.x) * t,
            y: segment.start.y + (segment.end.y - segment.start.y) * t,
          }
        : { x: 0, y: 0 };
      const worldOrigin = toWorldPoint(localOrigin);

      let dirX;
      let dirY;

      if (segment) {
        const rotated = rotateVector({
          x: segment.end.x - segment.start.x,
          y: segment.end.y - segment.start.y,
        });
        const dirLength = Math.hypot(rotated.x, rotated.y) || 1;
        dirX = rotated.x / dirLength;
        dirY = rotated.y / dirLength;
      } else {
        const angle = this.randomFloat('explosions') * Math.PI * 2;
        dirX = Math.cos(angle);
        dirY = Math.sin(angle);
      }

      const speed = 35 + this.randomFloat('explosions') * 40;

      this.particleEffects.particles.push(
        this.createParticle(
          worldOrigin.x,
          worldOrigin.y,
          dirX * speed,
          dirY * speed,
          colors.glow,
          1.2 + this.randomFloat('explosions') * 0.8,
          0.24 + this.randomFloat('explosions') * 0.14,
          'spark'
        )
      );
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
