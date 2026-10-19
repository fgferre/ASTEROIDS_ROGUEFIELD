// src/modules/effects/EnemyFireEffects.js
//
// What the enemies' guns do, as light: the drone, hunter and boss muzzle
// flashes. EnemyEffects owns it and picks the flash by the shooter's kind.

import { PALETTE, withAlpha } from '../../data/constants/palette.js';
import { BOSS_FX } from './BossTransitions.js';
import { ENEMY_FX } from './EnemyFx.js';

export class EnemyFireEffects {
  /**
   * `particleEffects`: the effects' Particles; every particle lands in its list.
   * `createParticle(x, y, vx, vy, color, size, life, type)`: the effects' createParticle, not Particles' own, as in PlayerEffects.
   * `randomFloat(fork)`: the effects' random helper; rolls draw from 'muzzleFlash' and 'boss'.
   * `getScaledParticleCount(count, options)`: the effects' Reduced Particles scaling.
   * `addScreenShake(presetOrIntensity, durationOrOptions)`, `addScreenFlash(color, duration, intensity)`: the effects' screen feedback.
   */
  constructor({
    particleEffects,
    createParticle,
    randomFloat,
    getScaledParticleCount,
    addScreenShake,
    addScreenFlash,
  }) {
    this.particleEffects = particleEffects;
    this.createParticle = createParticle;
    this.randomFloat = randomFloat;
    this.getScaledParticleCount = getScaledParticleCount;
    this.addScreenShake = addScreenShake;
    this.addScreenFlash = addScreenFlash;
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
}
