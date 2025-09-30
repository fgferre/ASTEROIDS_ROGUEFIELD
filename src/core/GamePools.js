/**
 * Centralized game object pools for ASTEROIDS_ROGUEFIELD.
 *
 * Manages all object pools used in the game to optimize memory usage and
 * reduce garbage collection pressure. Each pool is configured for specific
 * game object types with appropriate factory and reset functions.
 *
 * @example
 * ```javascript
 * const bullet = GamePools.bullets.acquire();
 * bullet.x = playerX; bullet.y = playerY;
 * // ... use bullet
 * GamePools.bullets.release(bullet);
 * ```
 */

import { ObjectPool, TTLObjectPool } from './ObjectPool.js';

/**
 * Game object pool registry.
 * Contains pools for all frequently created/destroyed game objects.
 */
export class GamePools {
  static initialized = false;
  static poolConfig = null;
  static lifecycleOverrides = {};

  // Pool instances
  static bullets = null;
  static particles = null;
  static asteroids = null;
  static xpOrbs = null;
  static shockwaves = null;
  static tempObjects = null;

  /**
   * Initializes all game object pools.
   * Must be called before using any pools.
   *
   * @param {Object} [options={}] - Pool configuration options
   */
  static initialize(options = {}) {
    if (this.initialized) {
      console.warn('[GamePools] Already initialized');
      return;
    }

    const config = {
      bullets: { initial: 20, max: 100 },
      particles: { initial: 50, max: 300 },
      asteroids: { initial: 15, max: 80 },
      xpOrbs: { initial: 30, max: 200 },
      shockwaves: { initial: 5, max: 20 },
      tempObjects: { initial: 10, max: 50 },
      ...options
    };

    this.poolConfig = config;

    this.initializeBulletPool(config.bullets);
    this.initializeParticlePool(config.particles);
    this.initializeAsteroidPool(config.asteroids);
    this.initializeXPOrbPool(config.xpOrbs);
    this.initializeShockwavePool(config.shockwaves);
    this.initializeTempObjectPool(config.tempObjects);

    this.initialized = true;

    console.log('[GamePools] All pools initialized successfully');
    if (process.env.NODE_ENV === 'development') {
      console.log('Pool configuration:', this.getPoolStats());
    }
  }

  /**
   * Initializes bullet object pool.
   *
   * @private
   * @param {Object} config - Pool configuration
   */
  static initializeBulletPool(config) {
    this.bullets = new ObjectPool(
      // Factory function
      () => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        angle: 0,
        speed: 0,
        life: 0,
        maxLife: 2000,
        damage: 25,
        radius: 2,
        color: '#FFFF00',
        active: true,
        type: 'player',
        trail: null
      }),

      // Reset function
      (bullet) => {
        bullet.x = 0;
        bullet.y = 0;
        bullet.vx = 0;
        bullet.vy = 0;
        bullet.angle = 0;
        bullet.speed = 0;
        bullet.life = 0;
        bullet.maxLife = 2000;
        bullet.damage = 25;
        bullet.radius = 2;
        bullet.color = '#FFFF00';
        bullet.active = true;
        bullet.type = 'player';
        bullet.trail = null;
      },

      config.initial,
      config.max
    );
  }

  /**
   * Initializes particle object pool.
   *
   * @private
   * @param {Object} config - Pool configuration
   */
  static initializeParticlePool(config) {
    this.particles = new ObjectPool(
      // Factory function - creates objects with SpaceParticle methods
      () => {
        const particle = {
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          color: '#FFFFFF',
          size: 1,
          life: 0,
          maxLife: 1000,
          alpha: 1,
          rotation: 0,
          rotationSpeed: 0,
          type: 'normal',
          active: true
        };

        // Add SpaceParticle methods
        particle.update = function(deltaTime) {
          this.x += this.vx * deltaTime;
          this.y += this.vy * deltaTime;
          this.life -= deltaTime;
          this.alpha = Math.max(0, this.life / this.maxLife);
          this.rotation += this.rotationSpeed * deltaTime;

          const friction = this.type === 'thruster' ? 0.98 : 0.96;
          this.vx *= friction;
          this.vy *= friction;

          return this.life > 0;
        };

        particle.draw = function(ctx) {
          if (this.alpha <= 0) return;

          ctx.save();
          ctx.globalAlpha = this.alpha;
          ctx.translate(this.x, this.y);
          ctx.rotate(this.rotation);

          if (this.type === 'spark') {
            ctx.strokeStyle = this.color;
            ctx.lineWidth = this.size * this.alpha;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-this.size, 0);
            ctx.lineTo(this.size, 0);
            ctx.stroke();
          } else if (this.type === 'crack') {
            ctx.strokeStyle = this.color;
            ctx.lineWidth = Math.max(0.6, this.size * 0.4);
            ctx.lineCap = 'round';
            ctx.beginPath();
            const length = this.size * 3.2;
            ctx.moveTo(-length * 0.5, 0);
            ctx.lineTo(length * 0.5, 0);
            ctx.stroke();
          } else if (this.type === 'debris') {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            const s = this.size * this.alpha;
            ctx.rect(-s / 2, -s / 2, s, s);
            ctx.fill();
          } else {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(0, 0, this.size * this.alpha, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();
        };

        return particle;
      },

      // Reset function
      (particle) => {
        particle.x = 0;
        particle.y = 0;
        particle.vx = 0;
        particle.vy = 0;
        particle.color = '#FFFFFF';
        particle.size = 1;
        particle.life = 0;
        particle.maxLife = 1000;
        particle.alpha = 1;
        particle.rotation = 0;
        particle.rotationSpeed = 0;
        particle.type = 'normal';
        particle.active = true;
      },

      config.initial,
      config.max
    );
  }

  /**
   * Initializes asteroid object pool.
   *
   * @private
   * @param {Object} config - Pool configuration
   */
  static initializeAsteroidPool(config) {
    this.asteroids = new ObjectPool(
      // Factory function
      () => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        angle: 0,
        angularVelocity: 0,
        size: 'medium',
        radius: 30,
        health: 100,
        maxHealth: 100,
        variant: 'normal',
        color: '#888888',
        active: true,
        segments: [],
        crackProfile: null,
        lastDamageTime: 0,
        spawnTime: 0
      }),

      // Reset function
      (asteroid) => {
        asteroid.x = 0;
        asteroid.y = 0;
        asteroid.vx = 0;
        asteroid.vy = 0;
        asteroid.angle = 0;
        asteroid.angularVelocity = 0;
        asteroid.size = 'medium';
        asteroid.radius = 30;
        asteroid.health = 100;
        asteroid.maxHealth = 100;
        asteroid.variant = 'normal';
        asteroid.color = '#888888';
        asteroid.active = true;
        asteroid.segments.length = 0;
        asteroid.crackProfile = null;
        asteroid.lastDamageTime = 0;
        asteroid.spawnTime = 0;
      },

      config.initial,
      config.max
    );
  }

  /**
   * Overrides asteroid pool lifecycle with system-provided handlers.
   *
   * @param {Object} lifecycle - Lifecycle configuration
   * @param {Function} lifecycle.create - Factory that returns a new asteroid instance
   * @param {Function} lifecycle.reset - Reset handler invoked when releasing the asteroid
   * @param {number} [lifecycle.initial] - Optional warm-up size override
   * @param {number} [lifecycle.max] - Optional max size override
   */
  static configureAsteroidLifecycle(lifecycle = {}) {
    if (!lifecycle || typeof lifecycle.create !== 'function' || typeof lifecycle.reset !== 'function') {
      console.warn('[GamePools] Invalid asteroid lifecycle configuration provided');
      return;
    }

    if (!this.asteroids) {
      const baseConfig = this.poolConfig?.asteroids || { initial: 0, max: 0 };
      this.initializeAsteroidPool(baseConfig);
    }

    const initialSize = Number.isFinite(lifecycle.initial)
      ? lifecycle.initial
      : this.poolConfig?.asteroids?.initial ?? this.asteroids.available?.length ?? 0;
    const maxSize = Number.isFinite(lifecycle.max)
      ? lifecycle.max
      : this.poolConfig?.asteroids?.max ?? this.asteroids.maxSize;

    try {
      this.asteroids.reconfigure(lifecycle.create, lifecycle.reset, initialSize, maxSize);
      this.lifecycleOverrides.asteroids = { ...lifecycle, initial: initialSize, max: maxSize };
      console.log('[GamePools] Asteroid pool lifecycle configured via EnemySystem');
    } catch (error) {
      console.error('[GamePools] Failed to configure asteroid lifecycle:', error);
    }
  }

  /**
   * Initializes XP orb object pool.
   *
   * @private
   * @param {Object} config - Pool configuration
   */
  static initializeXPOrbPool(config) {
    this.xpOrbs = new ObjectPool(
      // Factory function
      () => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        value: 1,
        tier: 1,
        color: '#00FF00',
        radius: 4,
        glowRadius: 8,
        life: 30000, // 30 seconds default
        magnetized: false,
        collected: false,
        pulsePhase: 0,
        active: true
      }),

      // Reset function
      (orb) => {
        orb.x = 0;
        orb.y = 0;
        orb.vx = 0;
        orb.vy = 0;
        orb.value = 1;
        orb.tier = 1;
        orb.color = '#00FF00';
        orb.radius = 4;
        orb.glowRadius = 8;
        orb.life = 30000;
        orb.magnetized = false;
        orb.collected = false;
        orb.pulsePhase = 0;
        orb.active = true;
      },

      config.initial,
      config.max
    );
  }

  /**
   * Overrides XP orb pool lifecycle with system-provided handlers.
   *
   * @param {Object} lifecycle - Lifecycle configuration
   * @param {Function} lifecycle.create - Factory function returning a new XP orb
   * @param {Function} lifecycle.reset - Reset handler when releasing XP orb
   * @param {number} [lifecycle.initial] - Optional warm-up size override
   * @param {number} [lifecycle.max] - Optional max size override
   */
  static configureXPOrbLifecycle(lifecycle = {}) {
    if (!lifecycle || typeof lifecycle.create !== 'function' || typeof lifecycle.reset !== 'function') {
      console.warn('[GamePools] Invalid XP orb lifecycle configuration provided');
      return;
    }

    if (!this.xpOrbs) {
      const baseConfig = this.poolConfig?.xpOrbs || { initial: 0, max: 0 };
      this.initializeXPOrbPool(baseConfig);
    }

    const initialSize = Number.isFinite(lifecycle.initial)
      ? lifecycle.initial
      : this.poolConfig?.xpOrbs?.initial ?? this.xpOrbs.available?.length ?? 0;
    const maxSize = Number.isFinite(lifecycle.max)
      ? lifecycle.max
      : this.poolConfig?.xpOrbs?.max ?? this.xpOrbs.maxSize;

    try {
      this.xpOrbs.reconfigure(lifecycle.create, lifecycle.reset, initialSize, maxSize);
      this.lifecycleOverrides.xpOrbs = { ...lifecycle, initial: initialSize, max: maxSize };
      console.log('[GamePools] XP orb pool lifecycle configured via XPOrbSystem');
    } catch (error) {
      console.error('[GamePools] Failed to configure XP orb lifecycle:', error);
    }
  }

  /**
   * Initializes shockwave effect pool.
   *
   * @private
   * @param {Object} config - Pool configuration
   */
  static initializeShockwavePool(config) {
    this.shockwaves = new ObjectPool(
      // Factory function
      () => ({
        x: 0,
        y: 0,
        radius: 0,
        maxRadius: 100,
        thickness: 2,
        color: 'rgba(255, 255, 255, 1)',
        growthSpeed: 120,
        life: 1,
        maxLife: 1,
        active: true
      }),

      // Reset function
      (shockwave) => {
        shockwave.x = 0;
        shockwave.y = 0;
        shockwave.radius = 0;
        shockwave.maxRadius = 100;
        shockwave.thickness = 2;
        shockwave.color = 'rgba(255, 255, 255, 1)';
        shockwave.growthSpeed = 120;
        shockwave.life = 1;
        shockwave.maxLife = 1;
        shockwave.active = true;
      },

      config.initial,
      config.max
    );
  }

  /**
   * Initializes temporary object pool using TTL.
   *
   * @private
   * @param {Object} config - Pool configuration
   */
  static initializeTempObjectPool(config) {
    this.tempObjects = new TTLObjectPool(
      // Factory function
      () => ({
        data: null,
        timestamp: 0,
        type: 'generic',
        active: true
      }),

      // Reset function
      (obj) => {
        obj.data = null;
        obj.timestamp = 0;
        obj.type = 'generic';
        obj.active = true;
      },

      config.initial,
      config.max
    );
  }

  /**
   * Updates all pools that require periodic updates (like TTL pools).
   * Call this from your game loop.
   *
   * @param {number} [deltaTime] - Time since last update
   */
  static update(deltaTime) {
    if (!this.initialized) {
      console.warn('[GamePools] Not initialized - call GamePools.initialize() first');
      return;
    }

    // Update TTL pools
    if (this.tempObjects && typeof this.tempObjects.update === 'function') {
      this.tempObjects.update();
    }

    // Auto-manage pool sizes periodically
    if (performance.now() % 5000 < 100) { // Every ~5 seconds
      this.autoManageAll();
    }
  }

  /**
   * Auto-manages all pools based on usage patterns.
   */
  static autoManageAll() {
    if (!this.initialized) return;

    const pools = [
      this.bullets,
      this.particles,
      this.asteroids,
      this.xpOrbs,
      this.shockwaves,
      this.tempObjects
    ];

    for (const pool of pools) {
      if (pool && typeof pool.autoManage === 'function') {
        pool.autoManage();
      }
    }
  }

  /**
   * Releases all objects from all pools.
   * Useful for level transitions or cleanup.
   */
  static releaseAll() {
    if (!this.initialized) return;

    const pools = [
      this.bullets,
      this.particles,
      this.asteroids,
      this.xpOrbs,
      this.shockwaves,
      this.tempObjects
    ];

    for (const pool of pools) {
      if (pool && typeof pool.releaseAll === 'function') {
        pool.releaseAll();
      }
    }

    console.log('[GamePools] Released all objects from all pools');
  }

  /**
   * Gets comprehensive statistics for all pools.
   *
   * @returns {Object} Pool statistics
   */
  static getPoolStats() {
    if (!this.initialized) {
      return { initialized: false };
    }

    return {
      initialized: true,
      bullets: this.bullets?.getStats() || null,
      particles: this.particles?.getStats() || null,
      asteroids: this.asteroids?.getStats() || null,
      xpOrbs: this.xpOrbs?.getStats() || null,
      shockwaves: this.shockwaves?.getStats() || null,
      tempObjects: this.tempObjects?.getStats() || null
    };
  }

  /**
   * Validates integrity of all pools.
   * Useful for debugging and testing.
   *
   * @returns {Object} Validation results
   */
  static validateAll() {
    if (!this.initialized) {
      return { initialized: false, valid: false, errors: ['Not initialized'] };
    }

    const results = {
      initialized: true,
      valid: true,
      errors: [],
      poolResults: {}
    };

    const pools = {
      bullets: this.bullets,
      particles: this.particles,
      asteroids: this.asteroids,
      xpOrbs: this.xpOrbs,
      shockwaves: this.shockwaves,
      tempObjects: this.tempObjects
    };

    for (const [name, pool] of Object.entries(pools)) {
      if (pool && typeof pool.validate === 'function') {
        const validation = pool.validate();
        results.poolResults[name] = validation;

        if (!validation.valid) {
          results.valid = false;
          results.errors.push(...validation.errors.map(err => `${name}: ${err}`));
        }
      }
    }

    return results;
  }

  /**
   * Destroys all pools and cleans up resources.
   * Call this when shutting down the game.
   */
  static destroy() {
    if (!this.initialized) return;

    this.releaseAll();

    this.bullets = null;
    this.particles = null;
    this.asteroids = null;
    this.xpOrbs = null;
    this.shockwaves = null;
    this.tempObjects = null;

    this.initialized = false;

    console.log('[GamePools] All pools destroyed');
  }

  /**
   * Logs detailed pool information to console.
   * Useful for debugging and performance analysis.
   */
  static debugLog() {
    if (!this.initialized) {
      console.log('[GamePools] Not initialized');
      return;
    }

    console.group('🎱 Game Pools Debug Information');

    const stats = this.getPoolStats();
    for (const [poolName, poolStats] of Object.entries(stats)) {
      if (poolName === 'initialized') continue;
      if (!poolStats) continue;

      console.group(`📦 ${poolName.toUpperCase()} Pool`);
      console.log('Available:', poolStats.available);
      console.log('In Use:', poolStats.inUse);
      console.log('Total Size:', poolStats.totalSize);
      console.log('Hit Rate:', poolStats.hitRate);
      console.log('Max Size:', poolStats.maxSize);

      if (poolStats.objectsWithTTL !== undefined) {
        console.log('Objects with TTL:', poolStats.objectsWithTTL);
      }

      console.groupEnd();
    }

    console.groupEnd();
  }
}

// Development tools
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.GamePools = GamePools;

  // Add global debug commands
  window.__gamePoolsDebug = {
    stats: () => GamePools.getPoolStats(),
    validate: () => GamePools.validateAll(),
    debugLog: () => GamePools.debugLog(),
    releaseAll: () => GamePools.releaseAll(),
    autoManage: () => GamePools.autoManageAll()
  };
}

// Export individual pools for convenience
export const {
  bullets: BulletPool,
  particles: ParticlePool,
  asteroids: AsteroidPool,
  xpOrbs: XPOrbPool,
  shockwaves: ShockwavePool,
  tempObjects: TempObjectPool
} = GamePools;