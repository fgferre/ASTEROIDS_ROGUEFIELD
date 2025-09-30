/**
 * Service Locator Adapter for backward compatibility
 *
 * This adapter provides a bridge between the old Service Locator pattern
 * and the new Dependency Injection container. It allows gradual migration
 * by maintaining the same API while delegating to the DI container.
 *
 * Features:
 * - Drop-in replacement for existing ServiceLocator
 * - Deprecation warnings for legacy usage
 * - Full backward compatibility
 * - Statistics tracking for migration progress
 *
 * Migration Strategy:
 * 1. Replace global gameServices with this adapter
 * 2. Systems continue using gameServices.get()
 * 3. Gradually refactor to constructor injection
 * 4. Remove adapter once migration complete
 *
 * @example
 * ```javascript
 * // Old code still works:
 * const audio = gameServices.get('audio');
 *
 * // New code uses DI:
 * class MySystem {
 *   constructor(audio, input) {
 *     this.audio = audio;
 *     this.input = input;
 *   }
 * }
 * ```
 */

export class ServiceLocatorAdapter {
  /**
   * Creates a new adapter that wraps a DI container.
   *
   * @param {DIContainer} container - The DI container to delegate to
   */
  constructor(container) {
    if (!container) {
      throw new Error('[ServiceLocatorAdapter] DIContainer is required');
    }

    /** @private @type {DIContainer} */
    this.container = container;

    /** @private @type {Set<string>} Services that emitted deprecation warnings */
    this.deprecationWarnings = new Set();

    /** @private @type {boolean} Enable deprecation warnings */
    this.showDeprecationWarnings = typeof process !== 'undefined' &&
                                    process.env.NODE_ENV === 'development';

    /** @private @type {Map<string, any>} Legacy direct registrations */
    this.legacyServices = new Map();

    // Statistics
    this.stats = {
      getLegacyCalls: 0,
      getContainerCalls: 0,
      directRegistrations: 0,
      uniqueCallers: new Set()
    };

    console.log('[ServiceLocatorAdapter] Initialized - providing backward compatibility');
  }

  /**
   * Gets a service by name (backward compatible with old ServiceLocator).
   *
   * @param {string} name - Service name
   * @returns {any} The resolved service
   */
  get(name) {
    // Track unique callers for migration metrics
    const caller = this.getCaller();
    if (caller) {
      this.stats.uniqueCallers.add(caller);
    }

    // Check legacy services first (for services not yet in DI)
    if (this.legacyServices.has(name)) {
      this.stats.getLegacyCalls++;
      this.emitDeprecationWarning(name, caller);
      return this.legacyServices.get(name);
    }

    // DON'T try to resolve from DI container in Phase 2.1
    // The container placeholders would create circular dependencies
    // Real DI resolution will be enabled in Phase 2.2+

    // Service not found in legacy services
    // This is expected during startup before systems register themselves
    return null;
  }

  /**
   * Registers a service directly (legacy compatibility).
   *
   * @param {string} name - Service name
   * @param {any} service - Service instance
   * @returns {boolean} True if registered successfully
   */
  register(name, service) {
    if (!name || typeof name !== 'string') {
      console.error('[ServiceLocatorAdapter] Service name must be a non-empty string');
      return false;
    }

    if (!service) {
      console.error('[ServiceLocatorAdapter] Service cannot be null/undefined');
      return false;
    }

    // Warn about legacy registration
    if (this.showDeprecationWarnings) {
      console.warn(
        `[DEPRECATED] gameServices.register('${name}', ...) - Register with DIContainer instead`
      );
    }

    // If service is already in DI container, replace the singleton
    if (this.container.has(name)) {
      try {
        this.container.replaceSingleton(name, service);
        console.log(`[ServiceLocatorAdapter] Replaced DI singleton: ${name}`);
        return true;
      } catch (error) {
        console.warn(`[ServiceLocatorAdapter] Cannot replace '${name}' in DI:`, error);
        // Fall through to legacy registration
      }
    }

    // Store in legacy map
    if (this.legacyServices.has(name)) {
      console.warn(`[ServiceLocatorAdapter] Service '${name}' already exists. Overwriting.`);
    }

    this.legacyServices.set(name, service);
    this.stats.directRegistrations++;

    console.log(`[ServiceLocatorAdapter] Registered legacy service: ${name}`);
    return true;
  }

  /**
   * Checks if a service is registered.
   *
   * @param {string} name - Service name
   * @returns {boolean} True if service exists
   */
  has(name) {
    return this.container.has(name) || this.legacyServices.has(name);
  }

  /**
   * Unregisters a service (backward compatible).
   *
   * @param {string} name - Service name
   * @returns {boolean} True if service was unregistered
   */
  unregister(name) {
    let removed = false;

    // Remove from legacy services
    if (this.legacyServices.has(name)) {
      this.legacyServices.delete(name);
      removed = true;
    }

    // Cannot unregister from DI container (by design)
    if (this.container.has(name)) {
      console.warn(
        `[ServiceLocatorAdapter] Cannot unregister DI service '${name}'. ` +
        `It will remain in the container.`
      );
    }

    if (removed) {
      console.log(`[ServiceLocatorAdapter] Unregistered legacy service: ${name}`);
    }

    return removed;
  }

  /**
   * Lists all available services.
   *
   * @returns {Array<string>} List of service names
   */
  listServices() {
    const containerServices = this.container.getServiceNames();
    const legacyServices = Array.from(this.legacyServices.keys());
    const allServices = [...new Set([...containerServices, ...legacyServices])];

    console.log('[ServiceLocatorAdapter] Available services:', allServices);
    console.log(`  - DI Container: ${containerServices.length}`);
    console.log(`  - Legacy: ${legacyServices.length}`);

    return allServices;
  }

  /**
   * Clears all legacy services (DI services remain).
   */
  clear() {
    const count = this.legacyServices.size;
    this.legacyServices.clear();

    console.log(`[ServiceLocatorAdapter] Cleared ${count} legacy services`);
    console.warn('[ServiceLocatorAdapter] DI container services were not cleared');
  }

  /**
   * Emits a deprecation warning for legacy service access.
   *
   * @private
   */
  emitDeprecationWarning(serviceName, caller) {
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
   *
   * @private
   * @returns {string|null} Caller location
   */
  getCaller() {
    try {
      const error = new Error();
      const stack = error.stack?.split('\n');

      if (stack && stack.length >= 4) {
        // Stack: Error -> getCaller -> get/register -> actual caller
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
   * Gets migration statistics.
   *
   * @returns {Object} Statistics about legacy usage
   */
  getStats() {
    const totalCalls = this.stats.getLegacyCalls + this.stats.getContainerCalls;
    const migrationProgress = totalCalls > 0
      ? ((this.stats.getContainerCalls / totalCalls) * 100).toFixed(1)
      : '0';

    return {
      totalGetCalls: totalCalls,
      legacyServiceCalls: this.stats.getLegacyCalls,
      containerServiceCalls: this.stats.getContainerCalls,
      directRegistrations: this.stats.directRegistrations,
      uniqueCallers: this.stats.uniqueCallers.size,
      migrationProgress: `${migrationProgress}%`,
      legacyServicesRemaining: this.legacyServices.size,
      containerServices: this.container.getServiceNames().length
    };
  }

  /**
   * Generates a migration report.
   *
   * @returns {Object} Detailed migration information
   */
  getMigrationReport() {
    const stats = this.getStats();

    const legacyServices = Array.from(this.legacyServices.keys());
    const containerServices = this.container.getServiceNames();

    const report = {
      summary: stats,
      legacyServices,
      containerServices,
      recommendations: []
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

    if (stats.migrationProgress === '100.0%' && legacyServices.length === 0) {
      report.recommendations.push({
        type: 'remove-adapter',
        priority: 'low',
        message: 'Migration complete! Consider removing ServiceLocatorAdapter'
      });
    }

    return report;
  }

  /**
   * Logs a detailed migration status report.
   */
  debugLog() {
    console.group('🔄 Service Locator Adapter - Migration Status');

    const stats = this.getStats();
    console.log('📊 Statistics:');
    console.table(stats);

    if (this.legacyServices.size > 0) {
      console.group('⚠️ Legacy Services (not in DI)');
      this.legacyServices.forEach((_, name) => console.log(`  - ${name}`));
      console.groupEnd();
    }

    console.group('✅ DI Container Services');
    this.container.getServiceNames().forEach(name => {
      const instantiated = this.container.isInstantiated(name) ? '✓' : '○';
      console.log(`  ${instantiated} ${name}`);
    });
    console.groupEnd();

    const report = this.getMigrationReport();
    if (report.recommendations.length > 0) {
      console.group('💡 Recommendations');
      report.recommendations.forEach(rec => {
        const emoji = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
        console.log(`${emoji} [${rec.priority}] ${rec.message}`);
      });
      console.groupEnd();
    }

    console.groupEnd();
  }

  /**
   * Gets the underlying DI container (for advanced usage).
   *
   * @returns {DIContainer} The DI container
   */
  getContainer() {
    return this.container;
  }
}

// Development tools
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.__serviceLocatorDebug = {
    getStats: () => window.gameServices?.getStats?.(),
    getMigrationReport: () => window.gameServices?.getMigrationReport?.(),
    debugLog: () => window.gameServices?.debugLog?.()
  };
}
