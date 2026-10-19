// src/modules/enemies/systems/EnemyCombatRelay.js
// What enemy fire hands to CombatSystem (the projectile payload, its source
// filled in) and how a shield shockwave pushes the enemies around it.
import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';
import {
  SHIELD_SHOCKWAVE_FORCE,
  SHIELD_SHOCKWAVE_RADIUS,
} from '../../../data/constants/gameplay.js';

export class EnemyCombatRelay {
  /**
   * @param {object} kit What the relay needs from EnemySystem: bosses and
   *   enemyRandom (its boss and random-scope modules), getAsteroids,
   *   getPhysics, getCachedCombat and applyDirectDamageToPlayer.
   */
  constructor(kit) {
    this.kit = kit;
    this.bosses = kit.bosses;
    this.enemyRandom = kit.enemyRandom;
  }

  // EnemySystem's state and calls, under the names the relay code uses.
  get asteroids() {
    return this.kit.getAsteroids();
  }

  get physics() {
    return this.kit.getPhysics();
  }

  getCachedCombat() {
    return this.kit.getCachedCombat();
  }

  getRandomScope(...args) {
    return this.enemyRandom.getRandomScope(...args);
  }

  getRandomService() {
    return this.enemyRandom.getRandomService();
  }

  applyDirectDamageToPlayer(...args) {
    return this.kit.applyDirectDamageToPlayer(...args);
  }

  normalizeEnemyProjectilePayload(data = {}) {
    const payload = { ...data };

    if (payload.enemy == null) {
      const resolvedBoss = this.bosses.resolveBossReference(payload);
      if (resolvedBoss) {
        payload.enemy = resolvedBoss;
      }
    }

    const source = payload.source ? { ...payload.source } : {};
    if (!source.id && payload.enemy?.id != null) {
      source.id = payload.enemy.id;
    }
    if (!source.type && payload.enemy?.type) {
      source.type = payload.enemy.type;
    }
    if (!source.wave && (payload.wave || payload.enemy?.wave)) {
      source.wave = payload.wave ?? payload.enemy?.wave ?? null;
    }
    if (Object.keys(source).length) {
      payload.source = source;
    }

    payload.enemyId = payload.enemyId ?? payload.enemy?.id ?? source.id ?? null;
    payload.enemyType =
      payload.enemyType || payload.enemy?.type || source.type || null;

    const projectile =
      payload.projectile && typeof payload.projectile === 'object'
        ? { ...payload.projectile }
        : {};

    const meta = {
      ...(projectile.meta && typeof projectile.meta === 'object'
        ? projectile.meta
        : {}),
      ...(payload.meta && typeof payload.meta === 'object' ? payload.meta : {}),
    };

    if (meta.pattern == null && projectile.pattern) {
      meta.pattern = projectile.pattern;
    }

    if (meta.phase == null && typeof payload.phase === 'number') {
      meta.phase = payload.phase;
    }

    projectile.meta = { ...meta };
    payload.projectile = projectile;
    payload.meta = { ...meta };

    return payload;
  }

  handleEnemyProjectile(data = null) {
    if (!data) {
      return false;
    }

    const payload = this.normalizeEnemyProjectilePayload(data);
    this.getCachedCombat().handleEnemyProjectile(payload);
    return true;
  }

  // An enemy projectile reached the player: its damage, then the debug log.
  handlePlayerHitByProjectile(data) {
    const damage = Number.isFinite(data.damage) ? data.damage : 0;
    if (damage <= 0) {
      return;
    }

    const position =
      data.position &&
      Number.isFinite(data.position.x) &&
      Number.isFinite(data.position.y)
        ? { x: data.position.x, y: data.position.y }
        : null;

    const result = this.applyDirectDamageToPlayer(damage, {
      cause: 'enemy-projectile',
      position,
      source: data.source || null,
    });

    GameDebugLogger.log('COLLISION', 'Player hit by enemy projectile', {
      damage,
      applied: Boolean(result?.applied),
      remaining: result?.remaining,
      absorbedByShield: Number.isFinite(result?.shieldAbsorbed)
        ? Number(result.shieldAbsorbed)
        : 0,
      healthDamage: Number.isFinite(result?.healthDamage)
        ? Number(result.healthDamage)
        : 0,
      position,
      source: data.source || null,
    });
  }

  handleShockwave(data) {
    if (!data || !data.position) {
      return;
    }

    const radius =
      typeof data.radius === 'number' ? data.radius : SHIELD_SHOCKWAVE_RADIUS;
    const force =
      typeof data.force === 'number' ? data.force : SHIELD_SHOCKWAVE_FORCE;

    const radiusSq = radius * radius;
    const originX = data.position.x;
    const originY = data.position.y;

    let nearbyEnemies = this.physics.getNearbyEnemies(originX, originY, radius);

    if (!nearbyEnemies || nearbyEnemies.length === 0) {
      nearbyEnemies = this.asteroids;
    }

    if (!nearbyEnemies || nearbyEnemies.length === 0) {
      return;
    }

    for (let i = 0; i < nearbyEnemies.length; i += 1) {
      const asteroid = nearbyEnemies[i];
      if (!asteroid || asteroid.destroyed) {
        continue;
      }

      const dx = asteroid.x - originX;
      const dy = asteroid.y - originY;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq > radiusSq || distanceSq === 0) {
        continue;
      }

      const distance = Math.sqrt(distanceSq);
      const falloff = 1 - Math.min(distance / radius, 1);
      const impulse = (force * falloff) / Math.max(asteroid.mass, 1);
      const nx = dx / Math.max(distance, 0.001);
      const ny = dy / Math.max(distance, 0.001);

      asteroid.vx += nx * impulse;
      asteroid.vy += ny * impulse;
      const collisionRandom =
        typeof asteroid.getRandomFor === 'function'
          ? asteroid.getRandomFor('collision')
          : null;
      const rotationImpulseSource =
        collisionRandom ||
        this.getRandomScope('fragments') ||
        this.getRandomService();
      const rotationImpulse =
        rotationImpulseSource &&
        typeof rotationImpulseSource.range === 'function'
          ? rotationImpulseSource.range(-2, 2)
          : (rotationImpulseSource.float() - 0.5) * 4;
      asteroid.rotationSpeed += rotationImpulse * falloff;
      asteroid.lastDamageTime = Math.max(asteroid.lastDamageTime, 0.12);
    }
  }
}
