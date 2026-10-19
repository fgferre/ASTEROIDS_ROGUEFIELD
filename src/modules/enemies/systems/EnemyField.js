// src/modules/enemies/systems/EnemyField.js
// The enemies on the field: the active-enemy cache and the queries over it,
// and handing enemies back to their pools (or to the factory) when they go.
import { GamePools } from '../../../core/GamePools.js';
import { Asteroid } from '../types/Asteroid.js';

export class EnemyField {
  /**
   * @param {object} kit What the field needs from EnemySystem: bosses (its
   *   boss module), getAsteroids, getFactory, getUseFactory,
   *   unregisterEnemyFromPhysics and clearAsteroidPoolId.
   */
  constructor(kit) {
    this.kit = kit;
    this.bosses = kit.bosses;
    this.activeEnemyCache = [];
    this.activeEnemyCacheDirty = true;
    this.usesAsteroidPool = false;
  }

  // EnemySystem's state and calls, under the names the field code uses.
  get asteroids() {
    return this.kit.getAsteroids();
  }

  get activeBosses() {
    return this.bosses.activeBosses;
  }

  get factory() {
    return this.kit.getFactory();
  }

  get useFactory() {
    return this.kit.getUseFactory();
  }

  isBossEnemy(enemy) {
    return this.bosses.isBossEnemy(enemy);
  }

  unregisterEnemyFromPhysics(enemy) {
    return this.kit.unregisterEnemyFromPhysics(enemy);
  }

  clearAsteroidPoolId(asteroid) {
    return this.kit.clearAsteroidPoolId(asteroid);
  }

  setupAsteroidPoolIntegration() {
    if (
      !GamePools ||
      typeof GamePools.configureAsteroidLifecycle !== 'function'
    ) {
      this.usesAsteroidPool = false;
      return;
    }

    try {
      GamePools.configureAsteroidLifecycle({
        create: () => new Asteroid(),
        reset: (asteroid) => {
          if (asteroid && typeof asteroid.resetForPool === 'function') {
            asteroid.resetForPool();
          }
        },
      });
      this.usesAsteroidPool = true;
    } catch (error) {
      this.usesAsteroidPool = false;
      console.warn(
        '[EnemySystem] Failed to configure asteroid pool lifecycle',
        error
      );
    }
  }

  releaseAsteroid(asteroid) {
    if (!asteroid) {
      return;
    }

    const isBoss = this.isBossEnemy(asteroid);
    if (isBoss) {
      this.bosses.untrackBossEnemy(asteroid);
    }

    this.unregisterEnemyFromPhysics(asteroid);
    this.clearAsteroidPoolId(asteroid);

    if (isBoss) {
      return;
    }

    // NEW: Use factory release if enabled
    if (this.useFactory && this.factory) {
      this.factory.release(asteroid);
      return;
    }

    // LEGACY: Direct pool release
    if (
      !this.usesAsteroidPool ||
      !GamePools?.asteroids ||
      typeof GamePools.asteroids.release !== 'function'
    ) {
      return;
    }

    GamePools.asteroids.release(asteroid);
  }

  releaseAllAsteroidsToPool() {
    if (!Array.isArray(this.asteroids) || this.asteroids.length === 0) {
      return;
    }

    for (let i = 0; i < this.asteroids.length; i += 1) {
      this.releaseAsteroid(this.asteroids[i]);
    }

    this.asteroids.length = 0;
    if (this.activeBosses) {
      this.activeBosses.clear();
    }
    this.bosses.emitBossHudUpdate(this.bosses.createInitialBossHudState());
    this.invalidateActiveEnemyCache();
  }

  removeActiveEnemy(enemy) {
    if (!enemy || !Array.isArray(this.asteroids)) {
      return false;
    }

    const index = this.asteroids.indexOf(enemy);
    if (index === -1) {
      return false;
    }

    this.asteroids.splice(index, 1);
    this.invalidateActiveEnemyCache();
    return true;
  }

  invalidateActiveEnemyCache() {
    this.activeEnemyCacheDirty = true;
  }

  rebuildActiveEnemyCache() {
    if (!this.activeEnemyCacheDirty) {
      return;
    }

    if (!Array.isArray(this.activeEnemyCache)) {
      this.activeEnemyCache = [];
    }

    this.activeEnemyCache.length = 0;

    for (let i = 0; i < this.asteroids.length; i += 1) {
      const asteroid = this.asteroids[i];
      if (asteroid && !asteroid.destroyed) {
        this.activeEnemyCache.push(asteroid);
      }
    }

    this.activeEnemyCacheDirty = false;
  }

  forEachActiveEnemy(callback) {
    if (typeof callback !== 'function') {
      return;
    }

    for (let i = 0; i < this.asteroids.length; i += 1) {
      const asteroid = this.asteroids[i];
      if (asteroid && !asteroid.destroyed) {
        callback(asteroid);
      }
    }
  }

  // Backward compatibility with legacy API
  forEachActiveAsteroid(callback) {
    this.forEachActiveEnemy(callback);
  }

  getActiveEnemies() {
    this.rebuildActiveEnemyCache();
    return this.activeEnemyCache;
  }

  getActiveEnemiesByType(type) {
    const enemies = this.getActiveEnemies();
    if (!type || typeof type !== 'string') {
      return enemies;
    }

    const normalized = type.toLowerCase();
    return enemies.filter((enemy) => {
      const enemyType =
        typeof enemy?.type === 'string' ? enemy.type.toLowerCase() : null;
      return enemyType === normalized;
    });
  }

  getAllEnemies() {
    return [...this.asteroids];
  }

  getActiveEnemyCount() {
    this.rebuildActiveEnemyCache();
    return this.activeEnemyCache.length;
  }

  getAsteroids() {
    return this.getActiveEnemies();
  }

  getAllAsteroids() {
    return this.getAllEnemies();
  }

  getAsteroidCount() {
    return this.getActiveEnemyCount();
  }
}
