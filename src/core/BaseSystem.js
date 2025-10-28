import { normalizeDependencies, resolveService } from './serviceUtils.js';
import RandomService from './RandomService.js';

/**
 * Base class for game systems providing common infrastructure.
 *
 * Consolidates patterns from 12+ systems including:
 * - Service caching and resolution
 * - Random fork management
 * - Event listener tracking with automatic cleanup
 * - Performance monitoring
 * - Lifecycle management (initialize, reset, destroy)
 *
 * @example
 * class MySystem extends BaseSystem {
 *   constructor(dependencies) {
 *     super(dependencies, {
 *       enableRandomManagement: true,
 *       systemName: 'my-system',
 *       randomForkLabels: {
 *         base: 'my-system.base',
 *         particles: 'my-system.particles'
 *       }
 *     });
 *
 *     // System-specific initialization
 *     this.myData = [];
 *   }
 *
 *   setupEventListeners() {
 *     this.registerEventListener('my-event', (data) => {
 *       this.handleMyEvent(data);
 *     });
 *   }
 *
 *   onReset() {
 *     this.myData = [];
 *   }
 * }
 */
class BaseSystem {
  /**
   * Creates a new BaseSystem instance.
   *
   * @param {Object} dependencies - Injected services (player, enemies, etc.)
   * @param {Object} options - Configuration options
   * @param {boolean} [options.enableRandomManagement=false] - Enable random fork management
   * @param {boolean} [options.enablePerformanceMonitoring=false] - Enable performance tracking
   * @param {string} options.systemName - System name for logging and events (required)
   * @param {string} [options.serviceName] - Service registration name (defaults to systemName)
   * @param {Object} [options.randomForkLabels] - Random fork labels (e.g., { base: 'system.base' })
   */
  constructor(dependencies, options = {}) {
    // Normalize dependencies
    this.dependencies = normalizeDependencies(dependencies);
    this.systemName = options.systemName;
    this._eventTopic = (options.serviceName || options.systemName || '').trim();

    // Initialize event listener tracking
    this._eventListeners = [];

    // Setup random management if enabled
    if (options.enableRandomManagement) {
      this.randomForkLabels = options.randomForkLabels || {};
      this.randomForks = {};
      this.randomForkSeeds = {};

      // Resolve random service from dependencies or create fallback
      this.random = resolveService('random', this.dependencies);
      if (!this.random) {
        this.random = new RandomService();
      }

      // Create random forks if labels provided
      if (Object.keys(this.randomForkLabels).length > 0) {
        this.randomForks = this.createRandomForks(this.random, this.randomForkLabels);
      }

      // Capture initial seeds
      this.captureRandomForkSeeds();
    }

    // Setup performance monitoring if enabled
    if (options.enablePerformanceMonitoring) {
      this.performanceMetrics = {
        enabled: true,
        frameCount: 0,
        lastFrameTime: performance.now()
      };
    }

    // Auto-register with gameServices
    const serviceKey = options.serviceName ?? options.systemName;
    if (serviceKey && typeof gameServices !== 'undefined' && gameServices?.register) {
      gameServices.register(serviceKey, this);
    }

    // Call template methods
    this.initialize();
    this.setupEventListeners();

    // Log initialization
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
      console.log(`[${this.systemName}] Initialized via BaseSystem`);
    }
  }

  // ========================================
  // SERVICE CACHING METHODS
  // ========================================

  /**
   * Batch resolve multiple services and cache them as properties.
   *
   * @param {Object} serviceMap - Object mapping property names to service names
   * @param {Object} [options] - Resolution options
   * @param {boolean} [options.force=false] - Re-resolve even if already cached
   *
   * @example
   * this.resolveCachedServices({
   *   cachedPlayer: 'player',
   *   cachedEnemies: 'enemies'
   * });
   */
  resolveCachedServices(serviceMap, { force = false } = {}) {
    if (!serviceMap || typeof serviceMap !== 'object') return;

    Object.entries(serviceMap).forEach(([property, serviceName]) => {
      if (force || !this[property]) {
        this[property] = resolveService(serviceName, this.dependencies);
      }
    });
  }

  /**
   * Resolve and cache a single service.
   *
   * @param {string} property - Property name to store cached service
   * @param {string} serviceName - Service name to resolve
   * @returns {*} The resolved service
   *
   * @example
   * const player = this.getCachedService('cachedPlayer', 'player');
   */
  getCachedService(property, serviceName) {
    if (!this[property]) {
      this[property] = resolveService(serviceName, this.dependencies);
    }
    return this[property];
  }

  // ========================================
  // RANDOM MANAGEMENT METHODS
  // ========================================

  /**
   * Create random forks from label object.
   *
   * @param {RandomService} random - RandomService instance
   * @param {Object} forkLabels - Object with fork names and labels
   * @returns {Object} Object containing fork instances
   *
   * @example
   * const forks = this.createRandomForks(random, {
   *   base: 'system.base',
   *   particles: 'system.particles'
   * });
   */
  createRandomForks(random, forkLabels) {
    if (!random || typeof random.fork !== 'function') {
      return {};
    }

    const forks = {};
    Object.entries(forkLabels || {}).forEach(([name, label]) => {
      forks[name] = random.fork(label);
    });

    return forks;
  }

  /**
   * Capture current seeds from all forks for later reseeding.
   *
   * @param {Object} [forks=this.randomForks] - Forks to capture seeds from
   *
   * @example
   * this.captureRandomForkSeeds();
   */
  captureRandomForkSeeds(forks = this.randomForks) {
    if (!forks) {
      this.randomForkSeeds = {};
      return;
    }

    if (!this.randomForkSeeds) {
      this.randomForkSeeds = {};
    }

    Object.entries(forks).forEach(([name, fork]) => {
      if (fork && typeof fork.seed === 'number' && Number.isFinite(fork.seed)) {
        this.randomForkSeeds[name] = fork.seed >>> 0;
      }
    });
  }

  /**
   * Retrieve a specific random fork by name.
   *
   * @param {string} name - Fork name
   * @returns {RandomService|null} The fork instance or null
   *
   * @example
   * const baseFork = this.getRandomFork('base');
   */
  getRandomFork(name) {
    if (!name || !this.randomForks) {
      return null;
    }
    return this.randomForks[name] || null;
  }

  /**
   * Reset all forks to their captured seeds.
   *
   * @param {Object} [options] - Reseeding options
   * @param {boolean} [options.refreshForks=false] - Recreate forks from scratch
   *
   * @example
   * this.reseedRandomForks({ refreshForks: true });
   */
  reseedRandomForks({ refreshForks = false } = {}) {
    if (!this.randomForks) return;

    if (refreshForks) {
      this.randomForks = this.createRandomForks(this.random, this.randomForkLabels);
      this.captureRandomForkSeeds();
      return;
    }

    if (!this.randomForkSeeds) {
      this.captureRandomForkSeeds();
    }

    Object.entries(this.randomForks).forEach(([name, fork]) => {
      if (!fork || typeof fork.reset !== 'function') return;

      const storedSeed = this.randomForkSeeds?.[name];
      if (storedSeed !== undefined) {
        fork.reset(storedSeed);
      }
    });

    this.captureRandomForkSeeds();
  }

  // ========================================
  // EVENT LISTENER MANAGEMENT
  // ========================================

  /**
   * Register event listener with automatic tracking for cleanup.
   *
   * @param {string} eventName - Event name to listen to
   * @param {Function} handler - Handler function
   * @param {Object} [options] - Registration options
   * @param {*} [options.context=this] - Context to bind handler to
   *
   * @example
   * this.registerEventListener('player-hit', (data) => {
   *   this.handlePlayerHit(data);
   * });
   */
  registerEventListener(eventName, handler, { context = this } = {}) {
    if (!eventName || typeof handler !== 'function') return;

    const boundHandler = context && context !== this ? handler.bind(context) : handler;

    gameEvents.on(eventName, boundHandler);

    this._eventListeners.push({
      eventName,
      handler: boundHandler
    });
  }

  /**
   * Remove all tracked event listeners (called by destroy()).
   *
   * @example
   * this.removeAllEventListeners();
   */
  removeAllEventListeners() {
    if (!this._eventListeners || !this._eventListeners.length) return;

    this._eventListeners.forEach(({ eventName, handler }) => {
      if (gameEvents && typeof gameEvents.off === 'function') {
        gameEvents.off(eventName, handler);
      }
    });

    this._eventListeners = [];
  }

  // ========================================
  // PERFORMANCE MONITORING METHODS
  // ========================================

  /**
   * Record a performance metric.
   *
   * @param {string} metricName - Metric name
   * @param {number} value - Metric value
   *
   * @example
   * this.trackPerformance('updateTime', deltaTime);
   */
  trackPerformance(metricName, value) {
    if (!this.performanceMetrics || !this.performanceMetrics.enabled) return;

    if (!this.performanceMetrics[metricName]) {
      this.performanceMetrics[metricName] = 0;
    }

    this.performanceMetrics[metricName] = value;
  }

  /**
   * Get copy of all performance metrics.
   *
   * @returns {Object} Performance metrics object
   *
   * @example
   * const metrics = this.getPerformanceMetrics();
   */
  getPerformanceMetrics() {
    if (!this.performanceMetrics) return {};
    return { ...this.performanceMetrics };
  }

  /**
   * Reset all performance counters.
   *
   * @example
   * this.resetPerformanceMetrics();
   */
  resetPerformanceMetrics() {
    if (!this.performanceMetrics) return;

    const enabled = this.performanceMetrics.enabled;
    this.performanceMetrics = {
      enabled,
      frameCount: 0,
      lastFrameTime: performance.now()
    };
  }

  // ========================================
  // TEMPLATE METHODS
  // ========================================

  /**
   * Hook for subclass initialization.
   * Called after constructor completes base setup.
   * Override in subclasses to add system-specific initialization.
   *
   * @example
   * initialize() {
   *   this.myData = [];
   *   this.myState = { active: false };
   * }
   */
  initialize() {
    // Override in subclasses
  }

  /**
   * Hook for event listener setup.
   * Called after initialize().
   * Use registerEventListener() to track listeners for automatic cleanup.
   *
   * @example
   * setupEventListeners() {
   *   this.registerEventListener('game-start', () => {
   *     this.handleGameStart();
   *   });
   * }
   */
  setupEventListeners() {
    // Override in subclasses
  }

  /**
   * Standard reset pattern with hooks.
   * Reseeds random forks, resets performance metrics, calls onReset() hook.
   *
   * @param {Object} [options] - Reset options
   * @param {boolean} [options.refreshForks=false] - Refresh random forks
   *
   * @example
   * reset({ refreshForks: true });
   */
  reset({ refreshForks = false } = {}) {
    // Reseed random forks if enabled
    if (this.randomForks) {
      this.reseedRandomForks({ refreshForks });
    }

    // Reset performance metrics if enabled
    if (this.performanceMetrics) {
      this.resetPerformanceMetrics();
    }

    // Call subclass hook
    this.onReset();

    // Emit reset event
    if (this._eventTopic && typeof gameEvents !== 'undefined') {
      gameEvents.emit(`${this._eventTopic}-reset`);
    }
  }

  /**
   * Hook for subclass-specific reset logic.
   * Called by reset() after common reset tasks.
   * Override in subclasses to add system-specific reset behavior.
   *
   * @example
   * onReset() {
   *   this.myData = [];
   *   this.myState.active = false;
   * }
   */
  onReset() {
    // Override in subclasses
  }

  /**
   * Standard cleanup pattern.
   * Removes event listeners, calls onDestroy() hook.
   *
   * @example
   * destroy();
   */
  destroy() {
    // Remove all event listeners
    this.removeAllEventListeners();

    // Call subclass hook
    this.onDestroy();

    // Log destruction
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
      console.log(`[${this.systemName}] Destroyed`);
    }
  }

  /**
   * Hook for subclass-specific cleanup.
   * Called by destroy() after common cleanup tasks.
   * Override in subclasses to add system-specific cleanup behavior.
   *
   * @example
   * onDestroy() {
   *   this.myData = null;
   *   this.myState = null;
   * }
   */
  onDestroy() {
    // Override in subclasses
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Centralized logging with system name prefix.
   *
   * @param {string} message - Log message
   * @param {*} [data=null] - Optional data to log
   *
   * @example
   * this.log('System initialized', { config: this.config });
   */
  log(message, data = null) {
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
      const prefix = `[${this.systemName || 'BaseSystem'}]`;
      if (data) {
        console.log(prefix, message, data);
      } else {
        console.log(prefix, message);
      }
    }
  }
}

export { BaseSystem };
