import * as CONSTANTS from '../core/GameConstants.js';

class PhysicsSystem {
  constructor() {
    this.cellSize = CONSTANTS.PHYSICS_CELL_SIZE || 96;
    this.maxAsteroidRadius = this.computeMaxAsteroidRadius();
    this.activeAsteroids = new Set();
    this.asteroidIndex = new Map();
    this.indexDirty = false;
    this.cachedEnemies = null;
    this.bootstrapCompleted = false;

    if (typeof gameServices !== 'undefined') {
      gameServices.register('physics', this);
    }

    this.setupEventListeners();
    this.resolveCachedServices(true);

    console.log('[PhysicsSystem] Initialized');
  }

  computeMaxAsteroidRadius() {
    const sizes = CONSTANTS.ASTEROID_SIZES || {};
    const values = Object.values(sizes).filter((value) =>
      Number.isFinite(value)
    );
    if (!values.length) {
      return 0;
    }
    return Math.max(...values);
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') {
      return;
    }

    gameEvents.on('enemy-spawned', (data) => {
      if (!data || (data.type && data.type !== 'asteroid')) {
        return;
      }
      if (data.enemy) {
        this.registerAsteroid(data.enemy);
      }
    });

    gameEvents.on('enemy-destroyed', (data) => {
      if (!data) {
        return;
      }

      if (data.enemy) {
        this.unregisterAsteroid(data.enemy);
      }

      if (Array.isArray(data.fragments)) {
        data.fragments.forEach((fragment) => {
          this.registerAsteroid(fragment);
        });
      }
    });

    gameEvents.on('progression-reset', () => {
      this.reset();
    });
  }

  resolveCachedServices(force = false) {
    if (typeof gameServices === 'undefined') {
      return;
    }

    if (force || !this.cachedEnemies) {
      if (
        typeof gameServices.has === 'function' &&
        gameServices.has('enemies')
      ) {
        this.cachedEnemies = gameServices.get('enemies');
        this.bootstrapCompleted = false;
      } else {
        this.cachedEnemies = null;
      }
    }

    if (!this.bootstrapCompleted) {
      this.bootstrapExistingAsteroids();
    }
  }

  bootstrapExistingAsteroids() {
    if (
      !this.cachedEnemies ||
      typeof this.cachedEnemies.getAsteroids !== 'function'
    ) {
      return;
    }

    if (typeof this.cachedEnemies.forEachActiveAsteroid === 'function') {
      this.cachedEnemies.forEachActiveAsteroid((asteroid) => {
        this.registerAsteroid(asteroid);
      });
      this.bootstrapCompleted = true;
      return;
    }

    const asteroids = this.cachedEnemies.getAsteroids();
    if (!Array.isArray(asteroids) || asteroids.length === 0) {
      return;
    }

    asteroids.forEach((asteroid) => {
      this.registerAsteroid(asteroid);
    });

    this.bootstrapCompleted = true;
  }

  registerAsteroid(asteroid) {
    if (!asteroid || asteroid.destroyed) {
      return;
    }

    if (!this.activeAsteroids.has(asteroid)) {
      this.activeAsteroids.add(asteroid);
      this.indexDirty = true;
    }
  }

  unregisterAsteroid(asteroid) {
    if (!asteroid) {
      return;
    }

    if (this.activeAsteroids.delete(asteroid)) {
      this.indexDirty = true;
    }
  }

  cleanupDestroyedAsteroids() {
    if (!this.activeAsteroids.size) {
      return;
    }

    const toRemove = [];
    this.activeAsteroids.forEach((asteroid) => {
      if (!asteroid || asteroid.destroyed) {
        toRemove.push(asteroid);
      }
    });

    if (!toRemove.length) {
      return;
    }

    toRemove.forEach((asteroid) => {
      this.activeAsteroids.delete(asteroid);
    });

    this.indexDirty = true;
  }

  ensureSpatialIndex() {
    if (!this.indexDirty) {
      return;
    }

    if (!this.activeAsteroids.size) {
      if (this.asteroidIndex.size) {
        this.asteroidIndex.clear();
      }
      this.indexDirty = false;
      return;
    }

    this.rebuildSpatialIndex();
  }

  rebuildSpatialIndex() {
    this.asteroidIndex.clear();

    if (!this.activeAsteroids.size) {
      this.indexDirty = false;
      return;
    }

    const cellSize = this.cellSize;

    this.activeAsteroids.forEach((asteroid) => {
      if (!asteroid || asteroid.destroyed) {
        return;
      }

      const cellX = Math.floor(asteroid.x / cellSize);
      const cellY = Math.floor(asteroid.y / cellSize);
      const key = `${cellX}:${cellY}`;
      let bucket = this.asteroidIndex.get(key);
      if (!bucket) {
        bucket = [];
        this.asteroidIndex.set(key, bucket);
      }
      bucket.push(asteroid);
    });

    this.indexDirty = false;
  }

  update() {
    this.resolveCachedServices();
    this.cleanupDestroyedAsteroids();

    if (!this.activeAsteroids.size) {
      if (this.asteroidIndex.size) {
        this.asteroidIndex.clear();
      }
      this.indexDirty = false;
      return;
    }

    this.indexDirty = true;
    this.ensureSpatialIndex();
  }

  getNearbyAsteroids(x, y, radius) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return [];
    }

    this.ensureSpatialIndex();

    const searchRadius = Math.max(radius, this.maxAsteroidRadius);
    const cellRange = Math.max(1, Math.ceil(searchRadius / this.cellSize));
    const centerCellX = Math.floor(x / this.cellSize);
    const centerCellY = Math.floor(y / this.cellSize);

    const candidates = [];
    const seen = new Set();

    for (let offsetX = -cellRange; offsetX <= cellRange; offsetX += 1) {
      for (let offsetY = -cellRange; offsetY <= cellRange; offsetY += 1) {
        const key = `${centerCellX + offsetX}:${centerCellY + offsetY}`;
        const bucket = this.asteroidIndex.get(key);
        if (!bucket) {
          continue;
        }

        for (let index = 0; index < bucket.length; index += 1) {
          const asteroid = bucket[index];
          if (!asteroid || asteroid.destroyed || seen.has(asteroid)) {
            continue;
          }
          seen.add(asteroid);
          candidates.push(asteroid);
        }
      }
    }

    return candidates;
  }

  forEachNearbyAsteroid(position, radius, callback) {
    if (typeof callback !== 'function') {
      return;
    }

    const x = position?.x ?? 0;
    const y = position?.y ?? 0;
    const candidates = this.getNearbyAsteroids(x, y, radius);
    for (let i = 0; i < candidates.length; i += 1) {
      callback(candidates[i]);
    }
  }

  forEachBulletCollision(bullets, handler) {
    if (!Array.isArray(bullets) || typeof handler !== 'function') {
      return;
    }

    this.ensureSpatialIndex();

    if (!this.asteroidIndex.size) {
      return;
    }

    const bulletRadius = CONSTANTS.BULLET_SIZE || 0;
    const maxCheckRadius = bulletRadius + this.maxAsteroidRadius;

    for (let i = 0; i < bullets.length; i += 1) {
      const bullet = bullets[i];
      if (!bullet || bullet.hit) {
        continue;
      }

      const candidates = this.getNearbyAsteroids(
        bullet.x,
        bullet.y,
        maxCheckRadius
      );

      if (!candidates.length) {
        continue;
      }

      for (let j = 0; j < candidates.length; j += 1) {
        const asteroid = candidates[j];
        if (!asteroid) {
          continue;
        }

        const dx = bullet.x - asteroid.x;
        const dy = bullet.y - asteroid.y;
        const collisionRadius = bulletRadius + (asteroid.radius || 0);
        if (dx * dx + dy * dy <= collisionRadius * collisionRadius) {
          handler(bullet, asteroid);
          break;
        }
      }
    }
  }

  buildPlayerCollisionContext(player) {
    const shieldState =
      typeof player.getShieldState === 'function'
        ? player.getShieldState()
        : null;
    const shieldActive =
      shieldState?.isActive &&
      shieldState.maxHits > 0 &&
      shieldState.currentHits > 0;
    const impactProfile =
      shieldActive && typeof player.getShieldImpactProfile === 'function'
        ? player.getShieldImpactProfile()
        : { damage: 0, forceMultiplier: 1, level: shieldState?.level ?? 0 };

    const hullRadius =
      typeof player.getHullBoundingRadius === 'function'
        ? player.getHullBoundingRadius()
        : CONSTANTS.SHIP_SIZE;
    const padding =
      shieldActive && typeof player.getShieldPadding === 'function'
        ? player.getShieldPadding()
        : 0;

    const collisionRadius = Math.max(0, hullRadius + padding);

    return {
      shieldState,
      shieldActive,
      impactProfile,
      hullRadius,
      padding,
      collisionRadius,
    };
  }

  handlePlayerAsteroidCollision(player, asteroid, enemiesSystem) {
    const result = { collided: false, playerDied: false };

    if (!asteroid || asteroid.destroyed || !player) {
      return result;
    }

    const position = player.position;
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      return result;
    }

    const context = this.buildPlayerCollisionContext(player);
    const collisionRadius = context.collisionRadius;
    const asteroidRadius = Number.isFinite(asteroid.radius)
      ? Math.max(0, asteroid.radius)
      : 0;

    if (collisionRadius <= 0) {
      return result;
    }

    const dx = position.x - asteroid.x;
    const dy = position.y - asteroid.y;
    const maxDistance = collisionRadius + asteroidRadius;
    const distanceSq = dx * dx + dy * dy;

    if (distanceSq >= maxDistance * maxDistance) {
      return result;
    }

    result.collided = true;

    const distance = Math.sqrt(distanceSq);
    const nx = distance > 0 ? dx / distance : 0;
    const ny = distance > 0 ? dy / distance : 0;
    const overlap = maxDistance - distance;

    if (overlap > 0) {
      const playerPushRatio = context.shieldActive ? 0.18 : 0.5;
      const asteroidPushRatio = 1 - playerPushRatio;
      player.position.x += nx * overlap * playerPushRatio;
      player.position.y += ny * overlap * playerPushRatio;
      asteroid.x -= nx * overlap * asteroidPushRatio;
      asteroid.y -= ny * overlap * asteroidPushRatio;
    }

    const rvx = asteroid.vx - player.velocity.vx;
    const rvy = asteroid.vy - player.velocity.vy;
    const velAlongNormal = rvx * nx + rvy * ny;

    if (velAlongNormal < 0) {
      const bounce = context.shieldActive
        ? CONSTANTS.SHIELD_COLLISION_BOUNCE
        : 0.2;
      const playerMass = context.shieldActive
        ? CONSTANTS.SHIP_MASS * Math.max(context.impactProfile.forceMultiplier, 1)
        : CONSTANTS.SHIP_MASS;
      const invMass1 = 1 / playerMass;
      const invMass2 = 1 / asteroid.mass;
      let j = (-(1 + bounce) * velAlongNormal) / (invMass1 + invMass2);
      if (context.shieldActive) {
        j *= Math.max(context.impactProfile.forceMultiplier, 1);
      }

      const jx = j * nx;
      const jy = j * ny;

      player.velocity.vx -= jx * invMass1;
      player.velocity.vy -= jy * invMass1;
      asteroid.vx += jx * invMass2;
      asteroid.vy += jy * invMass2;
    }

    if (player.invulnerableTimer > 0) {
      return result;
    }

    const previousShieldHits = context.shieldState?.currentHits ?? 0;
    const prevShieldActive = context.shieldActive;

    const relSpeed = Math.hypot(
      asteroid.vx - player.velocity.vx,
      asteroid.vy - player.velocity.vy
    );
    const baseDamage = 12;
    const momentumFactor = (asteroid.mass * relSpeed) / 120;
    const rawDamage = baseDamage + momentumFactor;
    const damage = Math.max(3, Math.floor(rawDamage));
    const remaining =
      typeof player.takeDamage === 'function'
        ? player.takeDamage(damage)
        : undefined;

    const newShieldState =
      typeof player.getShieldState === 'function'
        ? player.getShieldState()
        : null;

    const shieldAbsorbedHit =
      prevShieldActive &&
      (!newShieldState?.isActive ||
        (typeof newShieldState.currentHits === 'number' &&
          newShieldState.currentHits < previousShieldHits));

    if (shieldAbsorbedHit) {
      const boost =
        CONSTANTS.SHIELD_REFLECT_SPEED *
        Math.max(context.impactProfile.forceMultiplier, 1);
      asteroid.vx -= nx * boost;
      asteroid.vy -= ny * boost;

      const cooldown = CONSTANTS.SHIELD_HIT_GRACE_TIME;
      if (
        asteroid.shieldHitCooldown === undefined ||
        !Number.isFinite(asteroid.shieldHitCooldown)
      ) {
        asteroid.shieldHitCooldown = 0;
      }

      if (asteroid.shieldHitCooldown <= 0) {
        if (
          enemiesSystem &&
          typeof enemiesSystem.applyDamage === 'function'
        ) {
          enemiesSystem.applyDamage(asteroid, context.impactProfile.damage);
        }
        asteroid.shieldHitCooldown = cooldown;
      }

      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('shield-deflected', {
          position: { x: player.position.x, y: player.position.y },
          normal: { x: nx, y: ny },
          level: context.impactProfile.level || context.shieldState?.level || 0,
          intensity: Math.max(context.impactProfile.forceMultiplier, 1),
        });
      }
    }

    if (typeof remaining !== 'number') {
      return result;
    }

    if (typeof player.setInvulnerableTimer === 'function') {
      player.setInvulnerableTimer(0.5);
    } else {
      player.invulnerableTimer = 0.5;
    }

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('player-took-damage', {
        damage,
        remaining,
        max: player.maxHealth,
        position: { ...player.position },
      });
    }

    if (remaining <= 0) {
      result.playerDied = true;
    }

    return result;
  }

  processPlayerCollisions(player, enemiesSystem) {
    const summary = { collisions: 0, playerDied: false };

    if (!player) {
      return summary;
    }

    const position = player.position;
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      return summary;
    }

    this.ensureSpatialIndex();

    const context = this.buildPlayerCollisionContext(player);
    const queryRadius = Math.max(
      0,
      context.collisionRadius + (this.maxAsteroidRadius || 0)
    );

    if (queryRadius <= 0) {
      return summary;
    }

    const candidates = this.getNearbyAsteroids(
      position.x,
      position.y,
      queryRadius
    );

    if (!candidates.length) {
      return summary;
    }

    for (let i = 0; i < candidates.length; i += 1) {
      const asteroid = candidates[i];
      const collision = this.handlePlayerAsteroidCollision(
        player,
        asteroid,
        enemiesSystem
      );

      if (collision.collided) {
        summary.collisions += 1;
      }

      if (collision.playerDied) {
        summary.playerDied = true;
        break;
      }
    }

    return summary;
  }

  reset() {
    this.activeAsteroids.clear();
    this.asteroidIndex.clear();
    this.indexDirty = false;
    this.bootstrapCompleted = false;
    this.resolveCachedServices(true);

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('physics-reset');
    }

    console.log('[PhysicsSystem] Reset');
  }

  destroy() {
    this.activeAsteroids.clear();
    this.asteroidIndex.clear();
    this.indexDirty = false;
    this.cachedEnemies = null;
    this.bootstrapCompleted = false;
    console.log('[PhysicsSystem] Destroyed');
  }
}

export default PhysicsSystem;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PhysicsSystem;
}
