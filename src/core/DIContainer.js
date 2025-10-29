/**
 * Dependency Injection Container for ASTEROIDS_ROGUEFIELD
 *
 * The SOLE service registry for the game. Replaced ServiceLocator.js and
 * ServiceLocatorAdapter.js with a unified DI system that maintains full
 * backward compatibility via built-in legacy support.
 *
 * Features:
 * - Singleton and transient service lifetimes
 * - Circular dependency detection
 * - Lazy initialization
 * - Comprehensive error handling
 * - Development-mode diagnostics
 * - Legacy compatibility (direct instance registration)
 *
 * @example
 * ```javascript
 * // Used as global gameServices (see app.js line 175):
 * globalThis.gameServices = new DIContainer();
 * ServiceRegistry.setupServices(gameServices);
 *
 * // Modern DI (factory-based, recommended):
 * gameServices.register('audio', (events) => new AudioSystem(events), {
 *   dependencies: ['events'],
 *   singleton: true
 * });
 *
 * // Legacy compatibility (direct instance registration):
 * gameServices.register('input', inputInstance); // Works!
 *
 * // Resolve services:
 * const audio = gameServices.resolve('audio');
 * ```
 *
 * Migration from ServiceLocator:
 * - ServiceLocator.js: REMOVED (replaced by DIContainer)
 * - ServiceLocatorAdapter.js: REMOVED (functionality merged into DIContainer)
 * - All legacy code continues working via built-in compatibility layer
 * - Use DIContainer directly as gameServices (see app.js line 175)
 */

import { isDevEnvironment } from '../utils/dev/GameDebugLogger.js';

const DEV_MODE = isDevEnvironment();

export class DIContainer {
  /**
   * Creates a new DI container instance.
   *
   * Includes legacy service map for backward compatibility with ServiceLocator
   * and automatic deprecation warnings in development mode.
   */
  constructor() {
    /** @private @type {Map<string, Object>} Service factory configurations */
    this.factories = new Map();

    /** @private @type {Map<string, any>} Singleton instances cache */
    this.singletons = new Map();

    /** @private @type {Set<string>} Track services being initialized (circular dependency detection) */
    this.initializing = new Set();

    /** @private @type {Map<string, Array<string>>} Dependency graph for diagnostics */
    this.dependencyGraph = new Map();

    /** @private @type {Map<string, any>} Legacy direct registrations (non-factory) */
    this.legacyServices = new Map();

    /** @private @type {Set<string>} Services that emitted deprecation warnings */
    this.deprecationWarnings = new Set();

    /** @private @type {boolean} Enable deprecation warnings */
    this.showDeprecationWarnings = DEV_MODE;

    /** @private @type {boolean} Enable verbose logging */
    this.verbose = DEV_MODE;

    // Statistics
    this.stats = {
      registrations: 0,
      resolutions: 0,
      singletonHits: 0,
      circularDependencyErrors: 0,
      // Legacy compatibility stats
      getLegacyCalls: 0,
      getContainerCalls: 0,
      directRegistrations: 0,
      uniqueCallers: new Set()
    };

    if (this.verbose) {
      console.log('[DIContainer] Initialized');
    }
  }

  /**
   * Registers a service factory or instance in the container.
   *
   * Supports two registration patterns (auto-detected via typeof check):
   * 1. Factory-based DI (recommended): register(name, factory, options)
   * 2. Direct instance (legacy): register(name, instance)
   *
   * @param {string} name - Unique service identifier
   * @param {Function|any} factoryOrInstance - Factory function OR direct instance
   * @param {Object} [options={}] - Configuration options (factory pattern only)
   * @param {Array<string>} [options.dependencies=[]] - List of dependency service names
   * @param {boolean} [options.singleton=true] - Whether to cache as singleton
   * @param {boolean} [options.lazy=true] - Whether to initialize lazily or immediately
   * @returns {DIContainer} This container for chaining
   * @throws {Error} If service name is invalid or already registered
   */
  register(name, factoryOrInstance, options = {}) {
    // Validation
    if (!name || typeof name !== 'string') {
      throw new Error('[DIContainer] Service name must be a non-empty string');
    }

    // Detect registration pattern
    const isFactory = typeof factoryOrInstance === 'function';

    // Legacy instance registration (backward compatibility)
    if (!isFactory) {
      return this._registerLegacyInstance(name, factoryOrInstance);
    }

    // Factory-based DI registration (existing behavior)
    const factory = factoryOrInstance;

    if (this.factories.has(name)) {
      throw new Error(`[DIContainer] Service '${name}' is already registered`);
    }

    // Parse options
    const {
      dependencies = [],
      singleton = true,
      lazy = true
    } = options;

    // Validate dependencies
    if (!Array.isArray(dependencies)) {
      throw new Error(`[DIContainer] Dependencies for '${name}' must be an array`);
    }

    // Store factory configuration
    this.factories.set(name, {
      factory,
      dependencies,
      singleton,
      lazy
    });

    // Update dependency graph
    this.dependencyGraph.set(name, dependencies);

    // Statistics
    this.stats.registrations++;

    if (this.verbose) {
      const depsStr = dependencies.length > 0 ? ` (deps: ${dependencies.join(', ')})` : '';
      console.log(`[DIContainer] Registered '${name}'${depsStr}`);
    }

    // Initialize immediately if not lazy
    if (!lazy && singleton) {
      try {
        this.resolve(name);
      } catch (error) {
        console.error(`[DIContainer] Failed to eagerly initialize '${name}':`, error);
      }
    }

    return this;
  }

  /**
   * Registers a service instance directly (legacy compatibility).
   * @private
   */
  _registerLegacyInstance(name, instance) {
    if (!instance) {
      console.error('[DIContainer] Service cannot be null/undefined');
      return this;
    }

    // Warn about legacy registration
    if (this.showDeprecationWarnings) {
      console.warn(
        `[DEPRECATED] gameServices.register('${name}', instance) - ` +
        `Use DIContainer factory registration instead`
      );
    }

    // If service is already in DI container, replace the singleton
    if (this.factories.has(name)) {
      try {
        this.replaceSingleton(name, instance);
        if (this.verbose) {
          console.log(`[DIContainer] Replaced DI singleton: ${name}`);
        }
        return this;
      } catch (error) {
        console.warn(`[DIContainer] Cannot replace '${name}' in DI:`, error);
        // Fall through to legacy registration
      }
    }

    // Store in legacy map
    if (this.legacyServices.has(name)) {
      console.warn(`[DIContainer] Service '${name}' already exists. Overwriting.`);
    }

    this.legacyServices.set(name, instance);
    this.stats.directRegistrations++;

    if (this.verbose) {
      console.log(`[DIContainer] Registered legacy service: ${name}`);
    }

    return this;
  }

  /**
   * Resolves a service by name, creating it if necessary.
   *
   * @param {string} name - Service name to resolve
   * @returns {any} The resolved service instance
   * @throws {Error} If service not found or circular dependency detected
   */
  resolve(name) {
    // Check if singleton already exists
    if (this.singletons.has(name)) {
      this.stats.singletonHits++;
      return this.singletons.get(name);
    }

    // Get factory configuration
    const config = this.factories.get(name);
    if (!config) {
      const available = Array.from(this.factories.keys()).join(', ');
      throw new Error(
        `[DIContainer] Service '${name}' not found. Available services: ${available || '(none)'}`
      );
    }

    // Circular dependency detection
    if (this.initializing.has(name)) {
      const chain = Array.from(this.initializing).join(' -> ');
      this.stats.circularDependencyErrors++;
      throw new Error(
        `[DIContainer] Circular dependency detected: ${chain} -> ${name}`
      );
    }

    // Mark as initializing
    this.initializing.add(name);

    try {
      // Resolve all dependencies first
      const resolvedDeps = config.dependencies.map(depName => {
        try {
          return this.resolve(depName);
        } catch (error) {
          throw new Error(
            `[DIContainer] Failed to resolve dependency '${depName}' for '${name}': ${error.message}`
          );
        }
      });

      // Create instance
      const instance = config.factory(...resolvedDeps);

      if (instance === null || instance === undefined) {
        throw new Error(`[DIContainer] Factory for '${name}' returned null/undefined`);
      }

      // Cache if singleton
      if (config.singleton) {
        this.singletons.set(name, instance);
      }

      // Statistics
      this.stats.resolutions++;

      if (this.verbose) {
        console.log(`[DIContainer] Resolved '${name}' (singleton: ${config.singleton})`);
      }

      return instance;

    } catch (error) {
      // Log error with context
      console.error(`[DIContainer] Error resolving '${name}':`, error);
      throw error;

    } finally {
      // Always remove from initializing set
      this.initializing.delete(name);
    }
  }

  /**
   * Gets a service by name (backward compatible with ServiceLocator).
   * Checks legacy services first, then resolves from DI container.
   */
  get(name) {
    // Track caller for migration metrics
    const caller = this._getCaller();
    if (caller) {
      this.stats.uniqueCallers.add(caller);
    }

    // Check legacy services first (direct registrations)
    if (this.legacyServices.has(name)) {
      this.stats.getLegacyCalls++;
      this._emitDeprecationWarning(name, caller);
      return this.legacyServices.get(name);
    }

    // Try to resolve from DI container
    if (this.has(name)) {
      try {
        const instance = this.resolve(name);
        this.stats.getContainerCalls++;
        this._emitDeprecationWarning(name, caller);
        return instance;
      } catch (error) {
        console.error(`[DIContainer] Failed to resolve '${name}':`, error);
      }
    }

    // Service not found
    return null;
  }

  /**
   * Checks if a service is registered.
   *
   * @param {string} name - Service name
   * @returns {boolean} True if service is registered
   */
  has(name) {
    return this.factories.has(name) || this.legacyServices.has(name);
  }

  /**
   * Lists all available services (factory + legacy).
   */
  listServices() {
    const factoryServices = Array.from(this.factories.keys());
    const legacyServices = Array.from(this.legacyServices.keys());
    const allServices = [...new Set([...factoryServices, ...legacyServices])];

    if (this.verbose) {
      console.log('[DIContainer] Available services:', allServices);
      console.log(`  - Factory-based: ${factoryServices.length}`);
      console.log(`  - Legacy: ${legacyServices.length}`);
    }

    return allServices;
  }

  /**
   * Checks if a service has been instantiated.
   *
   * @param {string} name - Service name
   * @returns {boolean} True if singleton instance exists
   */
  isInstantiated(name) {
    return this.singletons.has(name);
  }

  /**
   * Synchronizes a legacy service instance into the DI container.
   * Used during migration from ServiceLocator to DIContainer.
   *
   * @param {string} name - Service name
   * @param {any} instance - Existing service instance to sync
   * @throws {Error} If name is invalid or instance is null/undefined
   */
  syncInstance(name, instance) {
    // Validation
    if (!name || typeof name !== 'string') {
      throw new Error('[DIContainer] Service name must be a non-empty string');
    }

    if (instance === null || instance === undefined) {
      throw new Error(`[DIContainer] Cannot sync null/undefined instance for '${name}'`);
    }

    let syncedWithContainer = false;

    // If service already registered as factory, handle based on lifecycle
    if (this.factories.has(name)) {
      const config = this.factories.get(name);

      if (config.singleton) {
        // Replace singleton instance
        this.singletons.set(name, instance);
        syncedWithContainer = true;
        if (this.verbose) {
          console.log(`[DIContainer] Synced legacy instance '${name}' (replaced singleton)`);
        }
      } else {
        // Cannot sync transient service - would override factory behavior
        console.warn(`[DIContainer] Cannot sync legacy instance for transient service '${name}'`);
      }
    } else {
      // If not registered, create factory placeholder
      this.factories.set(name, {
        factory: () => instance,
        dependencies: [],
        singleton: true,
        lazy: false
      });

      this.singletons.set(name, instance);
      this.dependencyGraph.set(name, []);
      this.stats.registrations++;
      syncedWithContainer = true;

      if (this.verbose) {
        console.log(`[DIContainer] Synced legacy instance '${name}' (new registration)`);
      }
    }

    // Always store in legacy map for get() access
    this.legacyServices.set(name, instance);

    return syncedWithContainer;
  }

  /**
   * Emits a deprecation warning for legacy service access.
   * @private
   */
  _emitDeprecationWarning(serviceName, caller) {
    if (!this.showDeprecationWarnings) return;

    // Only warn once per service
    if (this.deprecationWarnings.has(serviceName)) return;

    const callerInfo = caller ? ` (called from: ${caller})` : '';
    console.warn(
      `%c[DEPRECATED]%c gameServices.get('${serviceName}')${callerInfo}\n` +
      `Migrate to constructor injection instead:\n` +
      `  constructor(${serviceName}) { this.${serviceName} = ${serviceName}; }`,
      'color: orange; font-weight: bold',
      'color: inherit'
    );

    this.deprecationWarnings.add(serviceName);
  }

  /**
   * Gets the caller location for deprecation warnings.
   * @private
   */
  _getCaller() {
    try {
      const error = new Error();
      const stack = error.stack?.split('\n');

      if (stack && stack.length >= 4) {
        // Stack: Error -> _getCaller -> get -> actual caller
        const callerLine = stack[3];
        const match = callerLine.match(/at\s+(.+?)\s+\(/);
        return match ? match[1] : null;
      }
    } catch (e) {
      // Stack trace not available
    }

    return null;
  }

  /**
   * Replaces an existing singleton instance.
   * Useful for testing or hot-reload scenarios.
   *
   * @param {string} name - Service name
   * @param {any} instance - New instance to use
   * @throws {Error} If service is not a registered singleton
   */
  replaceSingleton(name, instance) {
    const config = this.factories.get(name);

    if (!config) {
      throw new Error(`[DIContainer] Cannot replace '${name}': service not registered`);
    }

    if (!config.singleton) {
      throw new Error(`[DIContainer] Cannot replace '${name}': not a singleton`);
    }

    this.singletons.set(name, instance);

    if (this.verbose) {
      console.log(`[DIContainer] Replaced singleton '${name}'`);
    }
  }

  /**
   * Unregisters a service from the container.
   *
   * @param {string} name - Service name to unregister
   * @returns {boolean} True if service was unregistered
   */
  unregister(name) {
    let removed = false;

    // Remove from legacy services
    if (this.legacyServices.has(name)) {
      this.legacyServices.delete(name);
      removed = true;
    }

    // Remove from factory services
    const hadFactory = this.factories.delete(name);
    const hadSingleton = this.singletons.delete(name);
    this.dependencyGraph.delete(name);

    if ((hadFactory || hadSingleton || removed) && this.verbose) {
      console.log(`[DIContainer] Unregistered '${name}'`);
    }

    return hadFactory || hadSingleton || removed;
  }

  /**
   * Clears all services and resets the container.
   */
  clear() {
    this.factories.clear();
    this.singletons.clear();
    this.initializing.clear();
    this.dependencyGraph.clear();
    this.legacyServices.clear();
    this.deprecationWarnings.clear();

    if (this.verbose) {
      console.log('[DIContainer] Cleared all services (factory + legacy)');
    }
  }

  /**
   * Gets all registered service names.
   *
   * @returns {Array<string>} List of service names
   */
  getServiceNames() {
    return Array.from(this.factories.keys());
  }

  /**
   * Gets dependency information for a service.
   *
   * @param {string} name - Service name
   * @returns {Object|null} Dependency info or null if not found
   */
  getDependencies(name) {
    const config = this.factories.get(name);
    if (!config) return null;

    return {
      name,
      dependencies: config.dependencies,
      singleton: config.singleton,
      instantiated: this.singletons.has(name)
    };
  }

  /**
   * Validates the dependency graph for issues.
   *
   * @returns {Object} Validation result
   */
  validate() {
    const errors = [];
    const warnings = [];

    // Check for missing dependencies
    for (const [serviceName, deps] of this.dependencyGraph.entries()) {
      for (const dep of deps) {
        if (!this.factories.has(dep)) {
          errors.push(`Service '${serviceName}' depends on unregistered service '${dep}'`);
        }
      }
    }

    // Check for potential circular dependencies (full graph analysis)
    const visited = new Set();
    const recursionStack = new Set();

    const detectCycle = (name, path = []) => {
      if (recursionStack.has(name)) {
        errors.push(`Circular dependency: ${path.join(' -> ')} -> ${name}`);
        return;
      }

      if (visited.has(name)) {
        return;
      }

      visited.add(name);
      recursionStack.add(name);

      const deps = this.dependencyGraph.get(name) || [];
      for (const dep of deps) {
        detectCycle(dep, [...path, name]);
      }

      recursionStack.delete(name);
    };

    for (const serviceName of this.factories.keys()) {
      detectCycle(serviceName);
    }

    // Check for unused services (no dependents)
    const allDeps = new Set();
    for (const deps of this.dependencyGraph.values()) {
      deps.forEach(dep => allDeps.add(dep));
    }

    for (const serviceName of this.factories.keys()) {
      if (!allDeps.has(serviceName)) {
        warnings.push(`Service '${serviceName}' has no dependents (root service)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      services: this.factories.size,
      instantiated: this.singletons.size
    };
  }

  /**
   * Generates a visual representation of the dependency graph.
   *
   * @returns {string} DOT format graph for visualization
   */
  generateDependencyGraph() {
    let dot = 'digraph Dependencies {\n';
    dot += '  rankdir=LR;\n';
    dot += '  node [shape=box];\n\n';

    for (const [service, deps] of this.dependencyGraph.entries()) {
      const instantiated = this.singletons.has(service);
      const color = instantiated ? 'lightgreen' : 'lightblue';
      dot += `  "${service}" [style=filled, fillcolor="${color}"];\n`;

      for (const dep of deps) {
        dot += `  "${service}" -> "${dep}";\n`;
      }
    }

    dot += '}\n';
    return dot;
  }

  /**
   * Gets container statistics.
   *
   * @returns {Object} Statistics object
   */
  getStats() {
    const totalCalls = this.stats.getLegacyCalls + this.stats.getContainerCalls;
    const migrationProgress = totalCalls > 0
      ? ((this.stats.getContainerCalls / totalCalls) * 100).toFixed(1)
      : '0';

    return {
      ...this.stats,
      totalServices: this.factories.size,
      instantiatedServices: this.singletons.size,
      legacyServicesRemaining: this.legacyServices.size,
      hitRate: this.stats.resolutions > 0
        ? ((this.stats.singletonHits / this.stats.resolutions) * 100).toFixed(1) + '%'
        : '0%',
      // Legacy compatibility stats
      totalGetCalls: totalCalls,
      legacyServiceCalls: this.stats.getLegacyCalls,
      containerServiceCalls: this.stats.getContainerCalls,
      directRegistrations: this.stats.directRegistrations,
      uniqueCallers: this.stats.uniqueCallers.size,
      migrationProgress: `${migrationProgress}%`
    };
  }

  /**
   * Generates a migration report for tracking progress from ServiceLocator to DIContainer.
   *
   * @returns {Object} Migration report with service status
   */
  getMigrationReport() {
    const services = this.getServiceNames();
    const legacyServices = Array.from(this.legacyServices.keys());
    const containerServices = services;

    const report = {
      summary: this.getStats(),
      legacyServices,
      containerServices,
      recommendations: [],
      services: services.map(name => ({
        name,
        registered: this.has(name),
        instantiated: this.isInstantiated(name),
        dependencies: this.getDependencies(name)?.dependencies || [],
        singleton: this.factories.get(name)?.singleton || false
      }))
    };

    // Generate recommendations
    if (legacyServices.length > 0) {
      report.recommendations.push({
        type: 'migrate-legacy',
        priority: 'high',
        message: `${legacyServices.length} legacy service(s) should be migrated to DI container`,
        services: legacyServices
      });
    }

    if (this.stats.uniqueCallers.size > 0) {
      report.recommendations.push({
        type: 'refactor-callers',
        priority: 'medium',
        message: `${this.stats.uniqueCallers.size} location(s) still use gameServices.get()`,
        locations: Array.from(this.stats.uniqueCallers)
      });
    }

    const stats = this.getStats();
    if (stats.migrationProgress === '100.0%' && legacyServices.length === 0) {
      report.recommendations.push({
        type: 'migration-complete',
        priority: 'low',
        message: 'Migration complete! All services use DI container'
      });
    }

    return report;
  }

  /**
   * Creates a child container that inherits from this one.
   * Useful for scoped dependency injection.
   *
   * @returns {DIContainer} New child container
   */
  createChildContainer() {
    const child = new DIContainer();
    child.verbose = this.verbose;

    // Copy factories (not singletons - each child creates its own)
    for (const [name, config] of this.factories.entries()) {
      child.factories.set(name, { ...config });
      child.dependencyGraph.set(name, [...config.dependencies]);
    }

    if (this.verbose) {
      console.log('[DIContainer] Created child container');
    }

    return child;
  }

  /**
   * Debug utility: logs the current state of the container.
   */
  debugLog() {
    console.group('🔧 DIContainer Debug Info');

    console.log('📊 Statistics:', this.getStats());

    console.group('📦 Factory-Based Services');
    for (const [name, config] of this.factories.entries()) {
      const instantiated = this.singletons.has(name) ? '✅' : '⏳';
      const depsStr = config.dependencies.length > 0
        ? ` → [${config.dependencies.join(', ')}]`
        : ' (no deps)';
      console.log(`${instantiated} ${name}${depsStr}`);
    }
    console.groupEnd();

    if (this.legacyServices.size > 0) {
      console.group('⚠️ Legacy Services (direct registration)');
      this.legacyServices.forEach((_, name) => console.log(`  - ${name}`));
      console.groupEnd();
    }

    const validation = this.validate();
    if (validation.errors.length > 0) {
      console.group('⚠️ Validation Errors');
      validation.errors.forEach(err => console.error(err));
      console.groupEnd();
    }

    if (validation.warnings.length > 0) {
      console.group('⚡ Warnings');
      validation.warnings.forEach(warn => console.warn(warn));
      console.groupEnd();
    }

    const report = this.getMigrationReport();
    if (report.recommendations.length > 0) {
      console.group('💡 Migration Recommendations');
      report.recommendations.forEach(rec => {
        const emoji = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
        console.log(`${emoji} [${rec.priority}] ${rec.message}`);
      });
      console.groupEnd();
    }

    console.groupEnd();
  }
}

// Development tools
if (typeof window !== 'undefined' && DEV_MODE) {
  window.__diContainerDebug = {
    getStats: () => window.diContainer?.getStats(),
    validate: () => window.diContainer?.validate(),
    debugLog: () => window.diContainer?.debugLog(),
    generateGraph: () => window.diContainer?.generateDependencyGraph(),
    getMigrationReport: () => window.diContainer?.getMigrationReport()
  };

  // Alias for backward compatibility
  window.__serviceLocatorDebug = window.__diContainerDebug;
}
