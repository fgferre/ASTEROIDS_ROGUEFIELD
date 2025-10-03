import * as CONSTANTS from '../core/GameConstants.js';
import { SpatialHash } from '../core/SpatialHash.js';

class PhysicsSystem {
  constructor() {
    this.cellSize = CONSTANTS.PHYSICS_CELL_SIZE || 96;
    this.maxAsteroidRadius = this.computeMaxAsteroidRadius();
    this.activeAsteroids = new Set();

    // New SpatialHash-based collision system
    this.spatialHash = new SpatialHash(this.cellSize, {
      maxObjects: 8,
      maxDepth: 4,
      dynamicResize: true
    });

    // Legacy spatial index for backward compatibility
    this.asteroidIndex = new Map();
    this.indexDirty = false;
    this.cachedEnemies = null;
    this.bootstrapCompleted = false;

    // Performance tracking
    this.performanceMetrics = {
      lastUpdateTime: 0,
      collisionChecks: 0,
      spatialQueries: 0,
      frameTime: 0
    };

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

      // Add to spatial hash
      if (Number.isFinite(asteroid.x) && Number.isFinite(asteroid.y) && Number.isFinite(asteroid.radius)) {
        this.spatialHash.insert(asteroid, asteroid.x, asteroid.y, asteroid.radius);
      }
    }
  }

  unregisterAsteroid(asteroid) {
    if (!asteroid) {
      return;
    }

    if (this.activeAsteroids.delete(asteroid)) {
      this.indexDirty = true;

      // Remove from spatial hash
      this.spatialHash.remove(asteroid);
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

  /**
   * Updates the spatial hash with current asteroid positions.
   * This ensures collision detection uses up-to-date positions.
   */
  updateSpatialHash() {
    for (const asteroid of this.activeAsteroids) {
      if (asteroid.destroyed) {
        continue;
      }

      // Update asteroid position in spatial hash
      if (Number.isFinite(asteroid.x) && Number.isFinite(asteroid.y) && Number.isFinite(asteroid.radius)) {
        this.spatialHash.update(asteroid, asteroid.x, asteroid.y, asteroid.radius);
      }
    }

    // Cleanup the spatial hash periodically
    if (performance.now() % 1000 < 50) { // Every ~1 second
      this.spatialHash.cleanup();
    }
  }

  update() {
    const startTime = performance.now();

    this.resolveCachedServices();
    this.cleanupDestroyedAsteroids();

    // Update spatial hash with current asteroid positions
    this.updateSpatialHash();

    if (!this.activeAsteroids.size) {
      if (this.asteroidIndex.size) {
        this.asteroidIndex.clear();
      }
      this.indexDirty = false;
      this.spatialHash.clear();
      return;
    }

    this.indexDirty = true;
    this.ensureSpatialIndex();

    // Update spatial hash
    this.spatialHash.update();

    // Track performance
    this.performanceMetrics.frameTime = performance.now() - startTime;
    this.performanceMetrics.lastUpdateTime = performance.now();
  }

  getNearbyAsteroids(x, y, radius) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return [];
    }

    this.performanceMetrics.spatialQueries++;

    // Use SpatialHash for efficient nearby object retrieval
    const searchRadius = Math.max(radius, this.maxAsteroidRadius);
    const candidates = this.spatialHash.query(x, y, searchRadius, {
      filter: (obj) => {
        // Filter for active asteroids only
        return this.activeAsteroids.has(obj) && !obj.destroyed;
      }
    });

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

    if (!this.activeAsteroids.size) {
      return;
    }

    const bulletRadius = CONSTANTS.BULLET_SIZE || 0;
    const maxCheckRadius = bulletRadius + this.maxAsteroidRadius;

    for (let i = 0; i < bullets.length; i += 1) {
      const bullet = bullets[i];
      if (!bullet || bullet.hit) {
        continue;
      }

      // Use spatial hash for efficient collision detection
      const candidates = this.spatialHash.query(bullet.x, bullet.y, maxCheckRadius, {
        filter: (obj) => this.activeAsteroids.has(obj) && !obj.destroyed
      });

      this.performanceMetrics.collisionChecks += candidates.length;

      let closestMatch = null;
      let closestDistanceSq = Infinity;

      for (let j = 0; j < candidates.length; j += 1) {
        const asteroid = candidates[j];
        if (!asteroid) {
          continue;
        }

        // Precise collision detection
        if (this.checkCircleCollision(
          bullet.x, bullet.y, bulletRadius,
          asteroid.x, asteroid.y, asteroid.radius || 0
        )) {
          const dx = bullet.x - asteroid.x;
          const dy = bullet.y - asteroid.y;
          const distanceSq = dx * dx + dy * dy;

          if (distanceSq < closestDistanceSq) {
            closestDistanceSq = distanceSq;
            closestMatch = asteroid;
          }
        }
      }

      if (closestMatch) {
        handler(bullet, closestMatch);
      }
    }
  }

  /**
   * Checks collision between two circular objects.
   * Optimized circle-circle collision detection.
   */
  checkCircleCollision(x1, y1, r1, x2, y2, r2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    const totalRadius = r1 + r2;

    // Use squared distance to avoid expensive sqrt operation
    return (dx * dx + dy * dy) <= (totalRadius * totalRadius);
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
        playerPosition: { x: player.position.x, y: player.position.y },
        damageSource: { x: asteroid.x, y: asteroid.y },
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
    this.spatialHash.clear();
    this.indexDirty = false;
    this.bootstrapCompleted = false;
    this.resolveCachedServices(true);

    // Reset performance metrics
    this.performanceMetrics = {
      lastUpdateTime: 0,
      collisionChecks: 0,
      spatialQueries: 0,
      frameTime: 0
    };

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('physics-reset');
    }

    console.log('[PhysicsSystem] Reset');
  }

  /**
   * Gets performance metrics for debugging and optimization.
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      spatialHashStats: this.spatialHash.getStats(),
      activeAsteroids: this.activeAsteroids.size,
      indexCells: this.asteroidIndex.size
    };
  }

  /**
   * Validates spatial hash consistency with active asteroids.
   */
  validateSpatialHash() {
    const validation = this.spatialHash.validate();
    const errors = [...validation.errors];

    // Check if all active asteroids are in spatial hash
    for (const asteroid of this.activeAsteroids) {
      if (!asteroid.destroyed && !this.spatialHash.objects.has(asteroid)) {
        errors.push(`Active asteroid not in spatial hash: ${asteroid.id || 'unknown'}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      spatialHashValidation: validation
    };
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
