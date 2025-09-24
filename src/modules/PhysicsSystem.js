import * as CONSTANTS from '../core/GameConstants.js';

class PhysicsSystem {
  constructor() {
    this.cellSize = CONSTANTS.PHYSICS_CELL_SIZE || 96;
    this.maxAsteroidRadius = this.computeMaxAsteroidRadius();
    this.activeAsteroids = new Set();
    this.asteroidIndex = new Map();
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

    this.activeAsteroids.add(asteroid);
  }

  unregisterAsteroid(asteroid) {
    if (!asteroid) {
      return;
    }

    if (this.activeAsteroids.delete(asteroid)) {
      // Clean removal triggers rebuild on next update
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
  }

  rebuildSpatialIndex() {
    this.asteroidIndex.clear();

    if (!this.activeAsteroids.size) {
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
  }

  update() {
    this.resolveCachedServices();
    this.cleanupDestroyedAsteroids();

    if (!this.activeAsteroids.size) {
      if (this.asteroidIndex.size) {
        this.asteroidIndex.clear();
      }
      return;
    }

    this.rebuildSpatialIndex();
  }

  getNearbyAsteroids(x, y, radius) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return [];
    }

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

  reset() {
    this.activeAsteroids.clear();
    this.asteroidIndex.clear();
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
    this.cachedEnemies = null;
    this.bootstrapCompleted = false;
    console.log('[PhysicsSystem] Destroyed');
  }
}

export default PhysicsSystem;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PhysicsSystem;
}
