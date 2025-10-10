/**
 * Service Registry for ASTEROIDS_ROGUEFIELD
 *
 * Central configuration for all game services and their dependencies.
 * This registry defines the dependency graph and initialization order
 * for the entire application.
 *
 * PHASE 2.1 Implementation:
 * - Sets up DI container with service placeholders
 * - Delegates to existing gameServices for now
 * - Full dependency injection will be gradual in Phase 2.2+
 *
 * @example
 * ```javascript
 * const container = new DIContainer();
 * ServiceRegistry.setupServices(container);
 * const player = container.resolve('player');
 * ```
 */

import { DIContainer } from './DIContainer.js';
import { createServiceManifest } from '../bootstrap/serviceManifest.js';
import RandomService from './RandomService.js';

export class ServiceRegistry {
  /**
   * Registers all game services in the DI container.
   *
   * @param {DIContainer} container - The DI container to populate
   */
  static setupServices(container, options = {}) {
    if (!(container instanceof DIContainer)) {
      throw new Error('[ServiceRegistry] Invalid container provided');
    }

    const manifestContext = (() => {
      if (!options || typeof options !== 'object') {
        return {};
      }

      if (options.manifestContext && typeof options.manifestContext === 'object') {
        return { ...options.manifestContext };
      }

      return { ...options };
    })();

    if (options && typeof options === 'object') {
      if (Object.prototype.hasOwnProperty.call(options, 'seed') && manifestContext.seed === undefined) {
        manifestContext.seed = options.seed;
      }

      if (
        Object.prototype.hasOwnProperty.call(options, 'randomOverrides') &&
        manifestContext.randomOverrides === undefined
      ) {
        manifestContext.randomOverrides = options.randomOverrides;
      }
    }

    const manifest = createServiceManifest(manifestContext);
    const registeredNames = new Set();

    manifest.forEach((entry) => {
      const {
        name,
        factory,
        dependencies = [],
        singleton = true,
        lazy = true
      } = entry;

      if (!name || typeof name !== 'string') {
        throw new Error('[ServiceRegistry] Service entry missing valid name');
      }

      if (registeredNames.has(name)) {
        throw new Error(`[ServiceRegistry] Duplicate service definition: ${name}`);
      }

      if (typeof factory !== 'function') {
        throw new Error(`[ServiceRegistry] Service '${name}' is missing a factory function`);
      }

      dependencies.forEach((dependency) => {
        const dependencyExists = manifest.some((candidate) => candidate.name === dependency);
        if (!dependencyExists) {
          throw new Error(
            `[ServiceRegistry] Service '${name}' depends on unknown service '${dependency}'`
          );
        }
      });

      registeredNames.add(name);

      container.register(
        name,
        (...resolvedDeps) => {
          const resolved = {};
          dependencies.forEach((dependencyName, index) => {
            resolved[dependencyName] = resolvedDeps[index];
          });

          return factory({
            resolved,
            container,
            context: manifestContext,
            manifestEntry: entry
          });
        },
        {
          dependencies,
          singleton,
          lazy
        }
      );
    });

    console.log(`[ServiceRegistry] Registered ${registeredNames.size} services in DI container`);
  }

  /**
   * Gets the list of all registered service names.
   *
   * @param {DIContainer} container - The DI container
   * @returns {Array<string>} Service names
   */
  static getServiceNames(container) {
    return container.getServiceNames();
  }

  /**
   * Creates a lightweight service map for testing.
   *
   * @param {Object} overrides - Services to override for testing
   * @returns {DIContainer} Container with test services
   */
  static createTestContainer(overrides = {}) {
    const container = new DIContainer();
    container.verbose = false; // Disable verbose logging in tests

    // Register minimal services
    const {
      random: randomOverride,
      randomSeed,
      ...serviceOverrides
    } = overrides || {};

    container.register(
      'event-bus',
      () => serviceOverrides.eventBus || { on: () => {}, emit: () => {}, off: () => {} }
    );
    container.register('settings', () => serviceOverrides.settings || { get: () => null, set: () => {} });
    container.register('audio', () => serviceOverrides.audio || { play: () => {}, stop: () => {} });

    const deterministicRandom = (() => {
      if (randomOverride) {
        if (typeof randomOverride === 'function') {
          const produced = randomOverride({
            seed: randomSeed,
            RandomService,
          });

          if (produced) {
            return produced;
          }
        }

        return randomOverride;
      }

      return new RandomService(Number.isFinite(randomSeed) ? randomSeed : 1337);
    })();

    container.register('random', () => deterministicRandom);

    // Add any additional overrides
    for (const [name, factory] of Object.entries(serviceOverrides)) {
      if (!container.has(name)) {
        container.register(name, () => factory);
      }
    }

    return container;
  }

  /**
   * Exports the dependency graph as a visualization.
   *
   * @param {DIContainer} container - The DI container
   * @returns {string} DOT format graph
   */
  static exportDependencyGraph(container) {
    return container.generateDependencyGraph();
  }
}

// Export convenience function
export function createServiceContainer() {
  const container = new DIContainer();
  ServiceRegistry.setupServices(container);
  return container;
}
