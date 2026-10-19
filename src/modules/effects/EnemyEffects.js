// src/modules/effects/EnemyEffects.js
//
// What the enemies and the field do, as light, split by subject: this file
// holds the per-kind death effects (mine, drone, hunter, asteroid) and the
// choice of effect by the enemy's kind; the muzzle flashes live in
// EnemyFireEffects, the crack debris in CrackEffects and the Volatile rock's
// and Caster shell's blasts in VolatileEffects. EffectsSystem owns it and its
// enemy listeners land here.

import { PALETTE, withAlpha } from '../../data/constants/palette.js';
import { ShakePresets } from '../../utils/ScreenShake.js';
import { SpaceParticle } from '../EffectEntities.js';
import { CrackEffects } from './CrackEffects.js';
import { EnemyFireEffects } from './EnemyFireEffects.js';
import { ENEMY_FX } from './EnemyFx.js';
import { VolatileEffects } from './VolatileEffects.js';

// Light lingers (docs/NORTE.md §2): PROPOSAL from 17/10, judged by playing.
// A multiplier on the old lifetimes: asteroid explosion embers were
// 0.32–0.54 s (secondary 0.28–0.46 s). Stone chips are mass, not light, and
// are unchanged.
const EXPLOSION_EMBER_LIFE_SCALE = 1.3; // was 1

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
    this.getRandomFork = getRandomFork;
    this.getScaledParticleCount = getScaledParticleCount;
    this.addScreenShake = addScreenShake;
    this.addScreenFlash = addScreenFlash;
    this.addHitStop = addHitStop;

    this.fireEffects = new EnemyFireEffects({
      particleEffects,
      createParticle,
      randomFloat,
      getScaledParticleCount,
      addScreenShake,
      addScreenFlash,
    });
    this.crackEffects = new CrackEffects({
      particleEffects,
      createParticle,
      randomFloat,
      getRandomFork,
      getScaledParticleCount,
      particleDensity,
      motionReduced,
    });
    this.volatileEffects = new VolatileEffects({
      particleEffects,
      createParticle,
      randomFloat,
      randomRange,
      getRandomFork,
      getScaledParticleCount,
      getScaledProbability,
      addScreenShake,
      addScreenFlash,
    });

    // Mines whose blast already played; a mine leaving the pool again is
    // forgotten in onEnemySpawned.
    this.processedMineExplosions = new WeakSet();
  }

  // === EffectsSystem's enemy listeners land here ===

  onEnemyFired(payload = {}) {
    const type = this.resolveEnemyType(payload);
    switch (type) {
      case 'drone':
        this.fireEffects.createDroneMuzzleFlash(payload);
        break;
      case 'hunter':
        this.fireEffects.createHunterBurstEffect(payload);
        break;
      case 'boss':
        this.fireEffects.createBossAttackEffect(payload);
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
    this.volatileEffects.onVolatileArmed(data);
  }

  createCrackDebris(event) {
    this.crackEffects.createCrackDebris(event);
  }

  spawnVolatileTrail(data) {
    this.volatileEffects.spawnVolatileTrail(data);
  }

  createVolatileExplosionEffect(data) {
    this.volatileEffects.createVolatileExplosionEffect(data);
  }

  createShellImpactEffect(data) {
    this.volatileEffects.createShellImpactEffect(data);
  }

  // === The kind of enemy ===

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

  // === The deaths ===

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
}
