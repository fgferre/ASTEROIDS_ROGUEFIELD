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

export class ServiceRegistry {
  /**
   * Registers all game services in the DI container.
   *
   * @param {DIContainer} container - The DI container to populate
   */
  static setupServices(container) {
    if (!(container instanceof DIContainer)) {
      throw new Error('[ServiceRegistry] Invalid container provided');
    }

    console.log('[ServiceRegistry] Setting up service placeholders...');

    // Register all service names that systems use
    const serviceNames = [
      // Core
      'event-bus',
      'settings',
      'game-pools',
      'garbage-collector',

      // Infrastructure
      'audio',
      'input',
      'physics',
      'renderer',
      'world',

      // Game Logic
      'player',
      'enemies',
      'combat',
      'xp-orbs',

      // UI & Effects
      'effects',
      'ui',
      'progression',
      'menu-background',

      // Utility
      'game-state'
    ];

    // Register each service as a lazy getter from gameServices
    serviceNames.forEach(name => {
      container.register(name, () => {
        // Try to get from existing gameServices (legacy)
        if (typeof gameServices !== 'undefined') {
          if (gameServices.has && gameServices.has(name)) {
            return gameServices.get(name);
          }
          // Try direct property access for adapter
          if (gameServices.legacyServices && gameServices.legacyServices.has(name)) {
            return gameServices.legacyServices.get(name);
          }
        }

        // Special cases
        if (name === 'event-bus' && typeof gameEvents !== 'undefined') {
          return gameEvents;
        }

        // Service not available yet
        console.warn(`[ServiceRegistry] Service '${name}' not available yet`);
        return null;
      }, {
        singleton: true,
        dependencies: []
      });
    });

    console.log(`[ServiceRegistry] Registered ${serviceNames.length} service placeholders`);
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
    container.register('event-bus', () => overrides.eventBus || { on: () => {}, emit: () => {}, off: () => {} });
    container.register('settings', () => overrides.settings || { get: () => null, set: () => {} });
    container.register('audio', () => overrides.audio || { play: () => {}, stop: () => {} });

    // Add any additional overrides
    for (const [name, factory] of Object.entries(overrides)) {
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
