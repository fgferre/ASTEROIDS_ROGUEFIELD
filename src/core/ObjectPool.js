/**
 * Generic Object Pool for managing object lifecycle and reducing garbage collection.
 *
 * Provides efficient object reuse for frequently created/destroyed objects like
 * bullets, particles, enemies, etc. Significantly reduces GC pressure and improves
 * performance in games with high object churn.
 *
 * @example
 * ```javascript
 * const bulletPool = new ObjectPool(
 *   () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0 }),
 *   (bullet) => { bullet.x = bullet.y = bullet.vx = bullet.vy = bullet.life = 0; },
 *   20  // Initial pool size
 * );
 *
 * const bullet = bulletPool.acquire();
 * bullet.x = 100; bullet.y = 200; bullet.life = 2000;
 * // ... use bullet
 * bulletPool.release(bullet);
 * ```
 *
 * @class ObjectPool
 */
export class ObjectPool {
  /**
   * Creates a new object pool.
   *
   * @param {Function} createFn - Factory function to create new objects
   * @param {Function} resetFn - Function to reset object to initial state
   * @param {number} [initialSize=10] - Number of objects to pre-create
   * @param {number} [maxSize=100] - Maximum pool size (0 = unlimited)
   */
  constructor(createFn, resetFn, initialSize = 10, maxSize = 100) {
    if (typeof createFn !== 'function') {
      throw new Error('createFn must be a function');
    }
    if (typeof resetFn !== 'function') {
      throw new Error('resetFn must be a function');
    }

    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;

    /** @private @type {Array} Available objects ready for use */
    this.available = [];

    /** @private @type {Set} Objects currently in use */
    this.inUse = new Set();

    /** @private @type {number} Total objects created (for stats) */
    this.totalCreated = 0;

    /** @private @type {number} Total objects acquired (for stats) */
    this.totalAcquired = 0;

    /** @private @type {number} Total objects released (for stats) */
    this.totalReleased = 0;

    /** @private @type {number} Total successful reuse operations */
    this.totalHits = 0;

    /** @private @type {WeakSet<Object>} Objects that have been acquired at least once */
    this.objectUsage = new WeakSet();

    // Pre-populate pool
    this.expand(initialSize);

    // Track pool for debugging
    if (
      typeof window !== 'undefined' &&
      process.env.NODE_ENV === 'development'
    ) {
      if (!window.__objectPools) {
        window.__objectPools = [];
      }
      window.__objectPools.push(this);
    }
  }

  /**
   * Acquires an object from the pool.
   *
   * @returns {*} Object ready for use
   */
  acquire() {
    let obj;

    if (this.available.length > 0) {
      obj = this.available.pop();
      if (this.objectUsage.has(obj)) {
        this.totalHits++;
      }
    } else {
      // Pool exhausted, create new object
      obj = this.createFn();
      this.totalCreated++;

      if (process.env.NODE_ENV === 'development') {
        console.debug(
          `[ObjectPool] Created new object (total: ${this.totalCreated})`
        );
      }
    }

    this.inUse.add(obj);
    this.totalAcquired++;
    if (typeof obj === 'object' && obj !== null) {
      this.objectUsage.add(obj);
    }

    return obj;
  }

  /**
   * Releases an object back to the pool.
   *
   * @param {*} obj - Object to return to pool
   * @returns {boolean} True if object was released, false if not in use
   */
  release(obj) {
    if (!this.inUse.has(obj)) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          '[ObjectPool] Attempted to release object not acquired from this pool'
        );
      }
      return false;
    }

    // Reset object to clean state
    try {
      this.resetFn(obj);
    } catch (error) {
      console.error('[ObjectPool] Error resetting object:', error);
      // Remove from in-use but don't return to pool
      this.inUse.delete(obj);
      return false;
    }

    this.inUse.delete(obj);
    this.totalReleased++;

    // Return to pool if under max size
    if (this.maxSize === 0 || this.available.length < this.maxSize) {
      this.available.push(obj);
    }
    // Otherwise let object be garbage collected

    return true;
  }

  /**
   * Releases all objects currently in use.
   * Useful for level/scene cleanup.
   */
  releaseAll() {
    const objectsToRelease = Array.from(this.inUse);
    for (const obj of objectsToRelease) {
      this.release(obj);
    }
  }

  /**
   * Expands the pool by creating additional available objects.
   *
   * @param {number} count - Number of objects to add
   */
  expand(count) {
    for (let i = 0; i < count; i++) {
      if (this.maxSize > 0 && this.getTotalSize() >= this.maxSize) {
        break;
      }

      const obj = this.createFn();
      this.resetFn(obj);
      this.available.push(obj);
      this.totalCreated++;
    }
  }

  /**
   * Shrinks the pool by removing available objects.
   *
   * @param {number} count - Number of objects to remove
   */
  shrink(count) {
    const toRemove = Math.min(count, this.available.length);
    this.available.splice(0, toRemove);
  }

  /**
   * Clears the entire pool, releasing all objects.
   * Objects currently in use will be orphaned.
   */
  clear() {
    this.available.length = 0;
    this.inUse.clear();
  }

  /**
   * Gets pool statistics.
   *
   * @returns {Object} Pool statistics
   */
  getStats() {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      totalSize: this.getTotalSize(),
      totalCreated: this.totalCreated,
      totalAcquired: this.totalAcquired,
      totalReleased: this.totalReleased,
      hitRate:
        this.totalAcquired > 0
          ? ((this.totalHits / this.totalAcquired) * 100).toFixed(1) + '%'
          : '0%',
      maxSize: this.maxSize,
    };
  }

  /**
   * Gets total number of objects managed by this pool.
   *
   * @returns {number} Total objects (available + in use)
   */
  getTotalSize() {
    return this.available.length + this.inUse.size;
  }

  /**
   * Checks if the pool is empty (no available objects).
   *
   * @returns {boolean} True if no objects available
   */
  isEmpty() {
    return this.available.length === 0;
  }

  /**
   * Checks if the pool is full (at max capacity).
   *
   * @returns {boolean} True if at maximum size
   */
  isFull() {
    return this.maxSize > 0 && this.getTotalSize() >= this.maxSize;
  }

  /**
   * Auto-manages pool size based on usage patterns.
   * Call periodically to optimize pool size.
   *
   * @param {Object} [options={}] - Auto-management options
   * @param {number} [options.targetUtilization=0.7] - Target utilization ratio
   * @param {number} [options.maxExpansion=10] - Max objects to add at once
   * @param {number} [options.maxShrinkage=5] - Max objects to remove at once
   */
  autoManage(options = {}) {
    const {
      targetUtilization = 0.7,
      maxExpansion = 10,
      maxShrinkage = 5,
    } = options;

    const utilization = this.inUse.size / this.getTotalSize();

    if (utilization > targetUtilization && this.available.length < 3) {
      // High utilization and low availability - expand
      const expansion = Math.min(
        maxExpansion,
        Math.ceil(this.inUse.size * 0.2)
      );
      this.expand(expansion);

      if (process.env.NODE_ENV === 'development') {
        console.debug(`[ObjectPool] Auto-expanded by ${expansion} objects`);
      }
    } else if (
      utilization < targetUtilization * 0.5 &&
      this.available.length > 10
    ) {
      // Low utilization and high availability - shrink
      const shrinkage = Math.min(
        maxShrinkage,
        Math.floor(this.available.length * 0.2)
      );
      this.shrink(shrinkage);

      if (process.env.NODE_ENV === 'development') {
        console.debug(`[ObjectPool] Auto-shrunk by ${shrinkage} objects`);
      }
    }
  }

  /**
   * Validates pool integrity.
   * Useful for debugging and testing.
   *
   * @returns {Object} Validation result
   */
  validate() {
    const errors = [];

    // Check for objects that might be in both available and in-use
    for (const obj of this.available) {
      if (this.inUse.has(obj)) {
        errors.push('Object found in both available and in-use collections');
      }
    }

    // Check total created vs managed
    const managed = this.getTotalSize();
    if (managed > this.totalCreated) {
      errors.push(
        `More objects managed (${managed}) than created (${this.totalCreated})`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      stats: this.getStats(),
    };
  }

  /**
   * Creates a string representation of the pool for debugging.
   *
   * @returns {string} Pool debug string
   */
  toString() {
    const stats = this.getStats();
    return `ObjectPool[available: ${stats.available}, inUse: ${stats.inUse}, hitRate: ${stats.hitRate}]`;
  }

  /**
   * Reconfigures the pool with new lifecycle handlers.
   * Clears existing cached objects and re-warms the pool using
   * the provided factory/reset functions.
   *
   * @param {Function} createFn - New factory function
   * @param {Function} resetFn - New reset function
   * @param {number} [initialSize=this.available.length] - Objects to pre-create
   * @param {number} [maxSize=this.maxSize] - New maximum pool size
   */
  reconfigure(
    createFn,
    resetFn,
    initialSize = this.available.length,
    maxSize = this.maxSize
  ) {
    if (typeof createFn !== 'function') {
      throw new Error(
        'reconfigure(createFn, resetFn, ...) requires a create function'
      );
    }

    if (typeof resetFn !== 'function') {
      throw new Error(
        'reconfigure(createFn, resetFn, ...) requires a reset function'
      );
    }

    if (this.inUse.size > 0) {
      throw new Error('Cannot reconfigure pool while objects are still in use');
    }

    this.createFn = createFn;
    this.resetFn = resetFn;

    if (Number.isFinite(maxSize) && maxSize >= 0) {
      this.maxSize = maxSize;
    }

    this.available.length = 0;
    this.totalCreated = 0;
    this.totalAcquired = 0;
    this.totalReleased = 0;
    this.totalHits = 0;
    this.objectUsage = new WeakSet();

    if (initialSize > 0) {
      this.expand(initialSize);
    }
  }
}

/**
 * Specialized pool for objects with time-to-live (TTL) functionality.
 * Automatically releases objects when their TTL expires.
 *
 * @class TTLObjectPool
 * @extends ObjectPool
 */
export class TTLObjectPool extends ObjectPool {
  /**
   * Creates a TTL-enabled object pool.
   *
   * @param {Function} createFn - Factory function
   * @param {Function} resetFn - Reset function
   * @param {number} [initialSize=10] - Initial pool size
   * @param {number} [maxSize=100] - Maximum pool size
   */
  constructor(createFn, resetFn, initialSize = 10, maxSize = 100) {
    super(createFn, resetFn, initialSize, maxSize);

    /** @private @type {Map} TTL tracking for objects */
    this.ttlMap = new Map();

    /** @private @type {number} Last cleanup time */
    this.lastCleanup = 0;

    /** @private @type {number} Cleanup interval in ms */
    this.cleanupInterval = 1000;
  }

  /**
   * Acquires an object with optional TTL.
   *
   * @param {number} [ttl] - Time to live in milliseconds
   * @returns {*} Object ready for use
   */
  acquire(ttl) {
    const obj = super.acquire();

    if (ttl && ttl > 0) {
      this.ttlMap.set(obj, performance.now() + ttl);
    }

    return obj;
  }

  /**
   * Releases an object and removes TTL tracking.
   *
   * @param {*} obj - Object to release
   * @returns {boolean} Success status
   */
  release(obj) {
    this.ttlMap.delete(obj);
    return super.release(obj);
  }

  /**
   * Updates TTL system and releases expired objects.
   * Call this regularly from your game loop.
   *
   * @param {number} [currentTime] - Current time (defaults to performance.now())
   */
  update(currentTime = performance.now()) {
    if (!this.ttlMap.size) {
      this.lastCleanup = currentTime;
      return;
    }

    const nextExpiration = this._getNextExpirationTime();
    const shouldCleanup =
      currentTime - this.lastCleanup >= this.cleanupInterval ||
      (typeof nextExpiration === 'number' && currentTime >= nextExpiration);

    if (!shouldCleanup) {
      return;
    }

    const expiredObjects = [];

    for (const [obj, expireTime] of this.ttlMap.entries()) {
      if (currentTime >= expireTime) {
        expiredObjects.push(obj);
      }
    }

    for (const obj of expiredObjects) {
      this.release(obj);
    }

    this.lastCleanup = currentTime;

    if (process.env.NODE_ENV === 'development' && expiredObjects.length > 0) {
      console.debug(
        `[TTLObjectPool] Released ${expiredObjects.length} expired objects`
      );
    }
  }

  /**
   * Clears pool and TTL tracking.
   */
  clear() {
    super.clear();
    this.ttlMap.clear();
  }

  /**
   * Gets enhanced statistics including TTL info.
   *
   * @returns {Object} Enhanced statistics
   */
  getStats() {
    const baseStats = super.getStats();
    const nextExpiration = this._getNextExpirationTime();
    return {
      ...baseStats,
      objectsWithTTL: this.ttlMap.size,
      nextExpiration:
        typeof nextExpiration === 'number'
          ? nextExpiration - performance.now()
          : null,
    };
  }

  /**
   * Obtém o próximo tempo de expiração registrado.
   *
   * @returns {number|null} timestamp absoluto da próxima expiração
   */
  _getNextExpirationTime() {
    if (!this.ttlMap.size) {
      return null;
    }

    let nextExpiration = Infinity;
    for (const expireTime of this.ttlMap.values()) {
      if (expireTime < nextExpiration) {
        nextExpiration = expireTime;
      }
    }

    return Number.isFinite(nextExpiration) ? nextExpiration : null;
  }
}

// Development tools
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.__poolDebug = {
    getAllPools: () => window.__objectPools || [],
    getPoolStats: () =>
      (window.__objectPools || []).map((pool) => pool.getStats()),
    validateAllPools: () =>
      (window.__objectPools || []).map((pool) => pool.validate()),
  };
}
