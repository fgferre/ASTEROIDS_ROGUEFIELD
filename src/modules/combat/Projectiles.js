// src/modules/combat/Projectiles.js
//
// The shots in flight: the ship's lance and flak bolts, and every enemy
// projectile. Takes them from the pool, moves them, trims their trails, lets
// enemy shots hit the player, and returns spent ones to the pool. CombatSystem
// owns it, ticks it after shooting, then resolves the player shots' hits.

import {
  GAME_HEIGHT,
  GAME_WIDTH,
  BULLET_SIZE,
} from '../../core/GameConstants.js';
import { GamePools } from '../../core/GamePools.js';
import { GameDebugLogger } from '../../utils/dev/GameDebugLogger.js';
import {
  PLAYER_BULLET_OFFSCREEN_MARGIN,
  PLAYER_BULLET_OFFSCREEN_GRACE,
} from '../../data/constants/gameplay.js';
import { ENEMY_TYPES, BOSS_CONFIG } from '../../data/constants/visual.js';
import { WEAPONS } from '../../data/weapons.js';

const FLAK = WEAPONS.scatter.flak;

export class Projectiles {
  /**
   * `physics()`: the physics service (buildPlayerCollisionContext, checkCircleCollision).
   * `emit(name, payload)`: sends bullet-created and player-hit-by-projectile.
   * `weapon()`: the ship's shot right now, a fresh plain object: { weaponId, bulletSpeed, bulletLifetime, trailLength, thermalLens, lanceDamageTuning, lanceApexDamage, lancePierce, pierceBonus }.
   * `burstFlak(bolt)`: bursts a flak bolt at the end of its range (the weapon's hit path).
   */
  constructor({ physics, emit, weapon, burstFlak }) {
    this.physics = physics;
    this.emit = emit;
    this.weapon = weapon;
    this.burstFlak = burstFlak;

    this.bullets = [];
    this.enemyBullets = [];
    this.enemyProjectileTrailLength = 10;
    this.bossProjectileTrailLength = 18;
    this.projectilePerf = {
      projectileUpdateMs: 0,
      projectilePlayerCount: 0,
      projectileEnemyCount: 0,
      projectilePlayerTrailPoints: 0,
      projectileEnemyTrailPoints: 0,
    };
  }

  // `volley` (Scatter Coil) makes it a flak bolt of that volley.
  createBullet(fromPos, toPos, damage, volley = null) {
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return;

    const weapon = this.weapon();

    // Use object pool instead of creating new object
    const bullet = GamePools.bullets.acquire();

    // Configure bullet properties
    bullet.x = fromPos.x;
    bullet.y = fromPos.y;
    const speed = volley
      ? weapon.bulletSpeed * FLAK.speedMultiplier
      : weapon.bulletSpeed;
    bullet.vx = (dx / distance) * speed;
    bullet.vy = (dy / distance) * speed;
    // Thermal Lens boosts the lance only while the beam is not there to take it.
    const lens =
      weapon.weaponId !== 'harmonic' && weapon.thermalLens
        ? weapon.thermalLens.lanceDamageMultiplier
        : 1;
    const shotDamage =
      damage * weapon.lanceDamageTuning * lens * weapon.lanceApexDamage;
    // A flak bolt lives until the end of its range and does not pierce.
    const life = volley ? FLAK.range / speed : weapon.bulletLifetime;
    bullet.damage = volley ? shotDamage * FLAK.damageMultiplier : shotDamage;
    bullet.shrapnel = volley ? shotDamage * FLAK.burstDamageMultiplier : 0;
    bullet.volley = volley;
    bullet.life = life;
    bullet.maxLife = life;
    bullet.hit = false;
    bullet.active = true;
    bullet.type = 'player';
    bullet.kind = volley ? 'flak' : 'lance';
    bullet.offscreenTimer = 0;
    bullet.pierceLeft = volley ? 0 : weapon.lancePierce + weapon.pierceBonus;
    if (!bullet.pierced) {
      bullet.pierced = [];
    } else {
      bullet.pierced.length = 0;
    }

    // Initialize trail array
    if (!bullet.trail) {
      bullet.trail = [];
    } else {
      bullet.trail.length = 0; // Clear existing trail
    }

    this.bullets.push(bullet);

    // Emitir evento para efeitos
    this.emit('bullet-created', {
      bullet,
      from: fromPos,
      to: toPos,
    });
  }

  createEnemyBullet(data = {}) {
    if (!data) {
      return null;
    }

    const position =
      data.position ||
      (data.enemy && {
        x: data.enemy.x,
        y: data.enemy.y,
      });

    const posX = Number.isFinite(position?.x) ? position.x : null;
    const posY = Number.isFinite(position?.y) ? position.y : null;

    if (posX === null || posY === null) {
      return null;
    }

    const isBossProjectile = this.isBossProjectileSource(data);

    const velocity = data.velocity || data.projectile?.velocity || {};
    const vx = Number.isFinite(velocity?.x) ? velocity.x : 0;
    const vy = Number.isFinite(velocity?.y) ? velocity.y : 0;

    const projectile = data.projectile || {};
    const declaredSpeed = Number.isFinite(projectile.speed)
      ? Math.max(0, projectile.speed)
      : null;
    const computedSpeed = Math.sqrt(vx * vx + vy * vy);
    const bulletSpeed = declaredSpeed ?? computedSpeed;

    const bullet = GamePools.bullets.acquire();
    bullet.x = posX;
    bullet.y = posY;
    bullet.vx = vx;
    bullet.vy = vy;
    bullet.speed = bulletSpeed;
    const damage = this.resolveEnemyProjectileDamage(
      { ...data, isBossProjectile },
      projectile
    );
    bullet.damage = damage;

    const lifetime = Number.isFinite(projectile.lifetime)
      ? Math.max(0.05, projectile.lifetime)
      : this.resolveEnemyProjectileLifetime(bulletSpeed);

    bullet.life = lifetime;
    bullet.maxLife = lifetime;
    bullet.hit = false;
    bullet.active = true;
    bullet.type = 'enemy';
    bullet.offscreenTimer = 0;
    bullet.isBossProjectile = isBossProjectile;
    bullet.color = this.resolveEnemyProjectileColor(
      { ...data, isBossProjectile },
      projectile
    );
    bullet.destroyed = false;
    bullet.destroyReason = null;
    bullet.destroyLogEmitted = false;
    bullet.createdAt = Date.now();

    if (Number.isFinite(projectile.radius)) {
      bullet.radius = Math.max(0, projectile.radius);
    } else if (isBossProjectile) {
      bullet.radius = 6;
    } else if (!Number.isFinite(bullet.radius)) {
      bullet.radius = BULLET_SIZE || 0;
    }

    if (Array.isArray(bullet.trail)) {
      bullet.trail.length = 0;
    } else {
      bullet.trail = [];
    }

    bullet.trailMax = this.resolveEnemyProjectileTrailLength(
      data,
      projectile,
      bullet
    );

    bullet.enemyId = data.enemyId ?? data.source?.id ?? data.enemy?.id ?? null;
    bullet.enemyType =
      data.enemyType ?? data.source?.type ?? data.enemy?.type ?? null;
    bullet.source = data.source
      ? { ...data.source }
      : bullet.enemyId || bullet.enemyType
        ? {
            id: bullet.enemyId,
            type: bullet.enemyType,
            wave: data.wave ?? data.enemy?.wave ?? null,
            displayName: data.enemy?.displayName ?? null,
            elite: Boolean(data.enemy?.elite),
            bossKind: data.enemy?.bossKind ?? null,
          }
        : null;

    if (isBossProjectile) {
      GameDebugLogger.log('EVENT', 'Boss projectile created', {
        pattern: projectile.pattern || null,
        phase: projectile.phase ?? data.enemy?.currentPhase ?? null,
        damage: damage,
        position: { x: posX, y: posY },
        velocity: { x: Number(vx.toFixed(2)), y: Number(vy.toFixed(2)) },
      });
    }

    this.enemyBullets.push(bullet);

    return bullet;
  }

  isBossProjectileSource(data = {}) {
    const enemyType = data.enemyType ?? data.source?.type ?? data.enemy?.type;
    if (enemyType === 'boss') {
      return true;
    }

    const source = data.enemy ?? data.source ?? null;
    if (!source) {
      return false;
    }

    if (typeof source.hasTag === 'function' && source.hasTag('boss')) {
      return true;
    }

    const tags = source.tags;
    if (tags) {
      if (typeof tags.has === 'function' && tags.has('boss')) {
        return true;
      }

      if (Array.isArray(tags) && tags.includes('boss')) {
        return true;
      }
    }

    if (source.type === 'boss' || source.isBoss === true) {
      return true;
    }

    if (source.bossId != null) {
      return true;
    }

    return false;
  }

  resolveEnemyProjectileTrailLength(data = {}, projectile = {}, bullet = null) {
    if (Number.isFinite(projectile?.trailLength)) {
      return Math.max(2, projectile.trailLength);
    }

    if (Number.isFinite(data?.trailLength)) {
      return Math.max(2, data.trailLength);
    }

    if (bullet && Number.isFinite(bullet.trailMax) && bullet.trailMax > 0) {
      return Math.max(2, bullet.trailMax);
    }

    const isBoss =
      bullet?.isBossProjectile ?? this.isBossProjectileSource(data);
    return isBoss
      ? Math.max(2, this.bossProjectileTrailLength)
      : Math.max(2, this.enemyProjectileTrailLength);
  }

  getEnemyBulletTrailLimit(bullet) {
    if (!bullet) {
      return 0;
    }

    if (Number.isFinite(bullet.trailMax) && bullet.trailMax > 0) {
      return Math.max(2, bullet.trailMax);
    }

    return bullet.isBossProjectile
      ? Math.max(2, this.bossProjectileTrailLength)
      : Math.max(2, this.enemyProjectileTrailLength);
  }

  resolveEnemyProjectileColor(data = {}, projectile = {}) {
    if (typeof projectile?.color === 'string') {
      return projectile.color;
    }

    if (data.isBossProjectile) {
      return '#ff6b6b';
    }

    const enemyType =
      data.enemyType ?? data.source?.type ?? data.enemy?.type ?? null;

    switch (enemyType) {
      case 'hunter':
        return 'rgba(80, 220, 255, 0.9)';
      case 'mine':
        return 'rgba(255, 204, 102, 0.9)';
      case 'drone':
        return 'rgba(255, 96, 64, 0.92)';
      default:
        return 'rgba(255, 120, 80, 0.9)';
    }
  }

  resolveEnemyProjectileDamage(data = {}, projectile = {}) {
    if (Number.isFinite(data?.damage)) {
      return data.damage;
    }

    if (Number.isFinite(projectile?.damage)) {
      return projectile.damage;
    }

    if (Number.isFinite(data.enemy?.projectileDamage)) {
      return data.enemy.projectileDamage;
    }

    const enemyType = data.enemyType ?? data.source?.type ?? data.enemy?.type;
    const bossProjectileDamage = Number.isFinite(BOSS_CONFIG?.projectileDamage)
      ? BOSS_CONFIG.projectileDamage
      : 35;

    if (enemyType === 'boss') {
      return bossProjectileDamage;
    }

    const enemyConfig = enemyType ? ENEMY_TYPES?.[enemyType] : null;
    if (enemyConfig && Number.isFinite(enemyConfig.projectileDamage)) {
      return enemyConfig.projectileDamage;
    }

    if (data.isBossProjectile || data.source?.type === 'boss') {
      return bossProjectileDamage;
    }

    return 10;
  }

  resolveEnemyProjectileLifetime(speed) {
    if (Number.isFinite(speed) && speed > 0) {
      const width = Number.isFinite(GAME_WIDTH) ? GAME_WIDTH : 0;
      const height = Number.isFinite(GAME_HEIGHT) ? GAME_HEIGHT : 0;
      const diagonal = Math.sqrt(width * width + height * height);

      if (diagonal > 0) {
        return Math.max(0.15, diagonal / speed);
      }
    }

    return 2.5;
  }

  updateEnemyBullets(deltaTime, player = null) {
    if (!Array.isArray(this.enemyBullets) || !this.enemyBullets.length) {
      return;
    }

    const physics = this.physics();
    const gameWidth = Number.isFinite(GAME_WIDTH) ? GAME_WIDTH : Infinity;
    const gameHeight = Number.isFinite(GAME_HEIGHT) ? GAME_HEIGHT : Infinity;
    const defaultBulletRadius = Number.isFinite(BULLET_SIZE) ? BULLET_SIZE : 0;

    const playerAlive =
      player &&
      !player.isDead &&
      !player.isRetrying &&
      !player._quitExplosionHidden;

    let playerPosition = null;
    let collisionContext = null;
    const hitsToEmit = [];

    const activeBullets = [];

    let trailPoints = 0;
    for (let i = 0; i < this.enemyBullets.length; i += 1) {
      const bullet = this.enemyBullets[i];
      if (!bullet) {
        continue;
      }

      if (Array.isArray(bullet.trail)) {
        bullet.trail.push({ x: bullet.x, y: bullet.y });
        const trailLimit = this.getEnemyBulletTrailLimit(bullet);
        if (trailLimit > 0 && bullet.trail.length > trailLimit) {
          bullet.trail.splice(0, bullet.trail.length - trailLimit);
        }
        trailPoints += bullet.trail.length;
      }

      bullet.x += bullet.vx * deltaTime;
      bullet.y += bullet.vy * deltaTime;
      bullet.life -= deltaTime;

      const outOfBounds =
        bullet.x < 0 ||
        bullet.x > gameWidth ||
        bullet.y < 0 ||
        bullet.y > gameHeight;

      if (outOfBounds) {
        bullet.life = 0;
        if (!bullet.destroyReason) {
          bullet.destroyReason = 'out-of-bounds';
        }
        bullet.destroyed = true;
      }

      let collided = false;

      if (playerAlive && bullet.life > 0 && !bullet.hit) {
        if (!playerPosition) {
          const candidatePosition = player.getPosition();

          if (
            candidatePosition &&
            Number.isFinite(candidatePosition.x) &&
            Number.isFinite(candidatePosition.y)
          ) {
            playerPosition = candidatePosition;
          }
        }

        if (playerPosition) {
          if (!collisionContext) {
            collisionContext = physics.buildPlayerCollisionContext(player);
          }

          const collisionRadius = collisionContext.collisionRadius;

          const bulletRadius = Number.isFinite(bullet.radius)
            ? bullet.radius
            : defaultBulletRadius;

          if (collisionRadius > 0) {
            collided = physics.checkCircleCollision(
              bullet.x,
              bullet.y,
              bulletRadius,
              playerPosition.x,
              playerPosition.y,
              collisionRadius
            );
          }
        }
      }

      if (collided) {
        bullet.hit = true;
        bullet.life = 0;
        bullet.destroyed = true;
        bullet.destroyReason = 'hit-player';

        if (bullet.isBossProjectile) {
          GameDebugLogger.log('COLLISION', 'Boss projectile hit player', {
            projectilePosition: {
              x: Math.round(bullet.x ?? 0),
              y: Math.round(bullet.y ?? 0),
            },
            playerPosition: {
              x: Math.round(playerPosition?.x ?? 0),
              y: Math.round(playerPosition?.y ?? 0),
            },
            damage: Number.isFinite(bullet.damage) ? bullet.damage : 0,
            enemyId: bullet.enemyId ?? null,
            enemyType: bullet.enemyType ?? null,
          });
        }

        hitsToEmit.push({
          damage: Number.isFinite(bullet.damage) ? bullet.damage : 0,
          position: { x: bullet.x, y: bullet.y },
          velocity: { x: bullet.vx, y: bullet.vy },
          projectile: {
            type: bullet.type || 'enemy',
            color: bullet.color,
            radius: Number.isFinite(bullet.radius)
              ? bullet.radius
              : defaultBulletRadius,
          },
          source: bullet.source
            ? { ...bullet.source }
            : {
                enemyId: bullet.enemyId ?? null,
                enemyType: bullet.enemyType ?? null,
                wave: null,
              },
        });
      }

      if (bullet.life > 0 && !bullet.hit) {
        activeBullets.push(bullet);
      } else {
        if (!bullet.destroyReason) {
          bullet.destroyReason = bullet.hit ? 'hit-player' : 'expired';
        }
        if (!bullet.destroyed) {
          bullet.destroyed = true;
        }
        if (bullet.isBossProjectile && !bullet.destroyLogEmitted) {
          const lifetime =
            typeof bullet.createdAt === 'number'
              ? Math.max(0, Date.now() - bullet.createdAt)
              : null;
          GameDebugLogger.log('STATE', 'Boss projectile destroyed', {
            reason: bullet.destroyReason,
            position: {
              x: Math.round(bullet.x ?? 0),
              y: Math.round(bullet.y ?? 0),
            },
            lifetime,
          });
          bullet.destroyLogEmitted = true;
        }
        bullet.source = null;
        bullet.enemyId = null;
        bullet.enemyType = null;
        bullet.isBossProjectile = false;
        bullet.destroyed = false;
        bullet.destroyReason = null;
        bullet.destroyLogEmitted = false;
        bullet.createdAt = 0;
        if (Array.isArray(bullet.trail)) {
          bullet.trail.length = 0;
        }
        bullet.trailMax = 0;
        GamePools.bullets.release(bullet);
      }
    }

    this.enemyBullets = activeBullets;
    this.projectilePerf.projectileEnemyTrailPoints = trailPoints;

    for (let i = 0; i < hitsToEmit.length; i += 1) {
      this.emit('player-hit-by-projectile', hitsToEmit[i]);
    }
  }

  clearEnemyBullets() {
    if (!Array.isArray(this.enemyBullets) || !this.enemyBullets.length) {
      this.enemyBullets = [];
      return;
    }

    for (let i = 0; i < this.enemyBullets.length; i += 1) {
      const bullet = this.enemyBullets[i];
      if (!bullet) {
        continue;
      }
      bullet.source = null;
      bullet.enemyId = null;
      bullet.enemyType = null;
      bullet.isBossProjectile = false;
      if (Array.isArray(bullet.trail)) {
        bullet.trail.length = 0;
      }
      bullet.trailMax = 0;
      GamePools.bullets.release(bullet);
    }

    this.enemyBullets.length = 0;
  }

  updateBullets(deltaTime) {
    const { trailLength } = this.weapon();
    let trailPoints = 0;
    this.bullets.forEach((bullet) => {
      if (bullet.hit) return;

      // Atualizar trail
      bullet.trail.push({ x: bullet.x, y: bullet.y });
      const trailLimit =
        bullet.kind === 'flak' ? FLAK.trailPoints : trailLength;
      if (bullet.trail.length > trailLimit) {
        bullet.trail.shift();
      }
      trailPoints += bullet.trail.length;

      // Atualizar posição
      bullet.x += bullet.vx * deltaTime;
      bullet.y += bullet.vy * deltaTime;
      bullet.life -= deltaTime;

      // A flak bolt that reached the end of its range bursts there (backed
      // up by the overshoot, so the range does not depend on the frame).
      if (bullet.kind === 'flak' && bullet.life <= 0) {
        bullet.x += bullet.vx * bullet.life;
        bullet.y += bullet.vy * bullet.life;
        bullet.hit = true;
        this.burstFlak(bullet);
        return;
      }

      const offscreenGrace = Number.isFinite(PLAYER_BULLET_OFFSCREEN_GRACE)
        ? Math.max(0, PLAYER_BULLET_OFFSCREEN_GRACE)
        : 0;
      const offscreenMargin = Number.isFinite(PLAYER_BULLET_OFFSCREEN_MARGIN)
        ? Math.max(0, PLAYER_BULLET_OFFSCREEN_MARGIN)
        : 0;
      const isOffscreen =
        bullet.x < 0 ||
        bullet.x > GAME_WIDTH ||
        bullet.y < 0 ||
        bullet.y > GAME_HEIGHT;

      if (isOffscreen) {
        bullet.offscreenTimer =
          (Number(bullet.offscreenTimer) || 0) + deltaTime;
        if (bullet.offscreenTimer >= offscreenGrace) {
          bullet.life = 0;
          return;
        }
      } else {
        bullet.offscreenTimer = 0;
      }

      const outOfBounds =
        bullet.x < -offscreenMargin ||
        bullet.x > GAME_WIDTH + offscreenMargin ||
        bullet.y < -offscreenMargin ||
        bullet.y > GAME_HEIGHT + offscreenMargin;

      if (outOfBounds) {
        bullet.life = 0;
        bullet.offscreenTimer = 0;
        return;
      }
    });

    // Return expired bullets to pool and remove from active list
    const activeBullets = [];
    for (const bullet of this.bullets) {
      if (bullet.life > 0 && !bullet.hit) {
        activeBullets.push(bullet);
      } else {
        // Return to pool
        GamePools.bullets.release(bullet);
      }
    }
    this.bullets = activeBullets;
    this.projectilePerf.projectilePlayerTrailPoints = trailPoints;
  }

  getProjectilePerfSnapshot() {
    return { ...this.projectilePerf };
  }

  // Zeroes the counters and returns every shot in flight to the pool.
  reset() {
    this.projectilePerf.projectileUpdateMs = 0;
    this.projectilePerf.projectilePlayerCount = 0;
    this.projectilePerf.projectileEnemyCount = 0;
    this.projectilePerf.projectilePlayerTrailPoints = 0;
    this.projectilePerf.projectileEnemyTrailPoints = 0;

    for (const bullet of this.bullets) {
      GamePools.bullets.release(bullet);
    }
    this.bullets = [];
    this.clearEnemyBullets();
  }
}
