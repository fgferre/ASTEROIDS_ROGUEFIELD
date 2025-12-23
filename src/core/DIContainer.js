/**
 * Dependency Injection Container for ASTEROIDS_ROGUEFIELD
 *
 * The SOLE service registry for the game. Replaced ServiceLocator.js and
 * ServiceLocatorAdapter.js with a unified DI system.
 *
 * Features:
 * - Singleton and transient service lifetimes
 * - Circular dependency detection
 * - Lazy initialization
 * - Comprehensive error handling
 * - Development-mode diagnostics
 *
 * @example
 * ```javascript
 * const container = new DIContainer();
 * ServiceRegistry.setupServices(container);
 *
 * // Modern DI (factory-based, recommended):
 * container.register('audio', (events) => new AudioSystem(events), {
 *   dependencies: ['events'],
 *   singleton: true
 * });
 * // Resolve services:
 * const audio = container.resolve('audio');
 * ```
 */

import { isDevEnvironment } from '../utils/dev/GameDebugLogger.js';

const DEV_MODE = isDevEnvironment();

export class DIContainer {
  /**
   * Creates a new DI container instance.
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

    /** @private @type {boolean} Enable verbose logging */
    this.verbose = DEV_MODE;

    // Statistics
    this.stats = {
      registrations: 0,
      resolutions: 0,
      singletonHits: 0,
      circularDependencyErrors: 0,
    };

    if (this.verbose) {
      console.log('[DIContainer] Initialized');
    }
  }

  /**
   * Registers a service factory in the container.
   *
   * @param {string} name - Unique service identifier
   * @param {Function} factory - Factory function
   * @param {Object} [options={}] - Configuration options (factory pattern only)
   * @param {Array<string>} [options.dependencies=[]] - List of dependency service names
   * @param {boolean} [options.singleton=true] - Whether to cache as singleton
   * @param {boolean} [options.lazy=true] - Whether to initialize lazily or immediately
   * @returns {DIContainer} This container for chaining
   * @throws {Error} If service name is invalid or already registered
   */
  register(name, factory, options = {}) {
    // Validation
    if (!name || typeof name !== 'string') {
      throw new Error('[DIContainer] Service name must be a non-empty string');
    }

    if (typeof factory !== 'function') {
      throw new Error(
        `[DIContainer] Factory for '${name}' must be a function`
      );
    }

    if (this.factories.has(name)) {
      throw new Error(`[DIContainer] Service '${name}' is already registered`);
    }

    // Parse options
    const { dependencies = [], singleton = true, lazy = true } = options;

    // Validate dependencies
    if (!Array.isArray(dependencies)) {
      throw new Error(
        `[DIContainer] Dependencies for '${name}' must be an array`
      );
    }

    // Store factory configuration
    this.factories.set(name, {
      factory,
      dependencies,
      singleton,
      lazy,
    });

    // Update dependency graph
    this.dependencyGraph.set(name, dependencies);

    // Statistics
    this.stats.registrations++;

    if (this.verbose) {
      const depsStr =
        dependencies.length > 0 ? ` (deps: ${dependencies.join(', ')})` : '';
      console.log(`[DIContainer] Registered '${name}'${depsStr}`);
    }

    // Initialize immediately if not lazy
    if (!lazy && singleton) {
      try {
        this.resolve(name);
      } catch (error) {
        console.error(
          `[DIContainer] Failed to eagerly initialize '${name}':`,
          error
        );
      }
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
      const resolvedDeps = config.dependencies.map((depName) => {
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
        throw new Error(
          `[DIContainer] Factory for '${name}' returned null/undefined`
        );
      }

      // Cache if singleton
      if (config.singleton) {
        this.singletons.set(name, instance);
      }

      // Statistics
      this.stats.resolutions++;

      if (this.verbose) {
        console.log(
          `[DIContainer] Resolved '${name}' (singleton: ${config.singleton})`
        );
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
   * Checks if a service is registered.
   *
   * @param {string} name - Service name
   * @returns {boolean} True if service is registered
   */
  has(name) {
    return this.factories.has(name);
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
      throw new Error(
        `[DIContainer] Cannot replace '${name}': service not registered`
      );
    }

    if (!config.singleton) {
      throw new Error(
        `[DIContainer] Cannot replace '${name}': not a singleton`
      );
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
    const hadFactory = this.factories.delete(name);
    const hadSingleton = this.singletons.delete(name);
    this.dependencyGraph.delete(name);

    if ((hadFactory || hadSingleton || removed) && this.verbose) {
      console.log(`[DIContainer] Unregistered '${name}'`);
    }

    return hadFactory || hadSingleton;
  }

  /**
   * Clears all services and resets the container.
   */
  clear() {
    this.factories.clear();
    this.singletons.clear();
    this.initializing.clear();
    this.dependencyGraph.clear();

    if (this.verbose) {
      console.log('[DIContainer] Cleared all services');
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
      instantiated: this.singletons.has(name),
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
          errors.push(
            `Service '${serviceName}' depends on unregistered service '${dep}'`
          );
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
      deps.forEach((dep) => allDeps.add(dep));
    }

    for (const serviceName of this.factories.keys()) {
      if (!allDeps.has(serviceName)) {
        warnings.push(
          `Service '${serviceName}' has no dependents (root service)`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      services: this.factories.size,
      instantiated: this.singletons.size,
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
    return {
      ...this.stats,
      totalServices: this.factories.size,
      instantiatedServices: this.singletons.size,
      hitRate:
        this.stats.resolutions > 0
          ? ((this.stats.singletonHits / this.stats.resolutions) * 100).toFixed(
              1
            ) + '%'
          : '0%',
    };
  }

  /**
   * Generates a status report for the container.
   *
   * @returns {Object} Report with service status
   */
  getMigrationReport() {
    const services = this.getServiceNames();
    const legacyServices = [];
    const containerServices = services;

    const report = {
      summary: this.getStats(),
      legacyServices,
      containerServices,
      recommendations: [],
      services: services.map((name) => ({
        name,
        registered: this.has(name),
        instantiated: this.isInstantiated(name),
        dependencies: this.getDependencies(name)?.dependencies || [],
        singleton: this.factories.get(name)?.singleton || false,
      })),
    };

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
      const depsStr =
        config.dependencies.length > 0
          ? ` → [${config.dependencies.join(', ')}]`
          : ' (no deps)';
      console.log(`${instantiated} ${name}${depsStr}`);
    }
    console.groupEnd();

    const validation = this.validate();
    if (validation.errors.length > 0) {
      console.group('⚠️ Validation Errors');
      validation.errors.forEach((err) => console.error(err));
      console.groupEnd();
    }

    if (validation.warnings.length > 0) {
      console.group('⚡ Warnings');
      validation.warnings.forEach((warn) => console.warn(warn));
      console.groupEnd();
    }

    const report = this.getMigrationReport();
    if (report.recommendations.length > 0) {
      console.group('💡 Migration Recommendations');
      report.recommendations.forEach((rec) => {
        const emoji =
          rec.priority === 'high'
            ? '🔴'
            : rec.priority === 'medium'
              ? '🟡'
              : '🟢';
        console.log(`${emoji} [${rec.priority}] ${rec.message}`);
      });
      console.groupEnd();
    }

    console.groupEnd();
  }
}

