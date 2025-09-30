/**
 * Service Registry for ASTEROIDS_ROGUEFIELD
 *
 * Central configuration for all game services and their dependencies.
 * This registry defines the dependency graph and initialization order
 * for the entire application.
 *
 * Services are organized in layers:
 * 1. Core Services (EventBus, Settings, GamePools)
 * 2. Infrastructure (Audio, Input, Physics, Rendering)
 * 3. Game Logic (Player, Enemies, Combat, XPOrbs)
 * 4. UI & Effects (UISystem, EffectsSystem, ProgressionSystem)
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

    console.log('[ServiceRegistry] Setting up services...');

    // Layer 1: Core Services (no dependencies)
    this.registerCoreServices(container);

    // Layer 2: Infrastructure Services
    this.registerInfrastructureServices(container);

    // Layer 3: Game Logic Services
    this.registerGameLogicServices(container);

    // Layer 4: UI & Effects
    this.registerUIServices(container);

    // Validate configuration
    const validation = container.validate();
    if (!validation.valid) {
      console.error('[ServiceRegistry] Service configuration has errors:');
      validation.errors.forEach(err => console.error('  -', err));
      throw new Error('[ServiceRegistry] Invalid service configuration');
    }

    console.log(`[ServiceRegistry] Registered ${container.getServiceNames().length} services`);

    if (validation.warnings.length > 0) {
      console.warn('[ServiceRegistry] Warnings:');
      validation.warnings.forEach(warn => console.warn('  -', warn));
    }
  }

  /**
   * Registers core services with no external dependencies.
   *
   * @private
   */
  static registerCoreServices(container) {
    // Event Bus - Central event system
    container.register('event-bus', () => {
      // Lazy import to avoid circular dependencies
      if (typeof gameEvents !== 'undefined') {
        return gameEvents;
      }
      const { EventBus } = require('./EventBus.js');
      return new EventBus();
    }, {
      singleton: true,
      dependencies: []
    });

    // Game Pools - Object pooling system
    container.register('game-pools', () => {
      const { GamePools } = require('./GamePools.js');
      return GamePools;
    }, {
      singleton: true,
      dependencies: []
    });

    // Garbage Collection Manager
    container.register('garbage-collector', () => {
      const { GarbageCollectionManager } = require('./GarbageCollectionManager.js');
      return new GarbageCollectionManager();
    }, {
      singleton: true,
      dependencies: []
    });

    // Settings System
    container.register('settings', (eventBus) => {
      const { SettingsSystem } = require('../modules/SettingsSystem.js');
      const settings = new SettingsSystem();
      // Don't initialize here - let the system self-initialize
      return settings;
    }, {
      singleton: true,
      dependencies: ['event-bus']
    });
  }

  /**
   * Registers infrastructure services.
   *
   * @private
   */
  static registerInfrastructureServices(container) {
    // Audio System
    container.register('audio', (eventBus, settings) => {
      const { AudioSystem } = require('../modules/AudioSystem.js');
      const audio = new AudioSystem();
      // System registers itself with gameServices internally
      return audio;
    }, {
      singleton: true,
      dependencies: ['event-bus', 'settings']
    });

    // Input System
    container.register('input', (eventBus) => {
      const { InputSystem } = require('../modules/InputSystem.js');
      const input = new InputSystem();
      // System registers itself with gameServices internally
      return input;
    }, {
      singleton: true,
      dependencies: ['event-bus']
    });

    // Physics System
    container.register('physics', () => {
      const { PhysicsSystem } = require('../modules/PhysicsSystem.js');
      const physics = new PhysicsSystem();
      // System registers itself with gameServices internally
      return physics;
    }, {
      singleton: true,
      dependencies: []
    });

    // Rendering System
    container.register('rendering', (eventBus) => {
      const { RenderingSystem } = require('../modules/RenderingSystem.js');
      const rendering = new RenderingSystem();
      // System registers itself with gameServices internally
      return rendering;
    }, {
      singleton: true,
      dependencies: ['event-bus']
    });

    // World System
    container.register('world', (eventBus) => {
      const { WorldSystem } = require('../modules/WorldSystem.js');
      const world = new WorldSystem();
      // System registers itself with gameServices internally
      return world;
    }, {
      singleton: true,
      dependencies: ['event-bus']
    });
  }

  /**
   * Registers game logic services.
   *
   * @private
   */
  static registerGameLogicServices(container) {
    // Player System
    container.register('player', (eventBus, input, audio, physics) => {
      const { PlayerSystem } = require('../modules/PlayerSystem.js');
      const player = new PlayerSystem();
      // System registers itself with gameServices internally
      return player;
    }, {
      singleton: true,
      dependencies: ['event-bus', 'input', 'audio', 'physics']
    });

    // Enemy System
    container.register('enemies', (eventBus, physics, audio) => {
      const { EnemySystem } = require('../modules/EnemySystem.js');
      const enemies = new EnemySystem();
      // System registers itself with gameServices internally
      return enemies;
    }, {
      singleton: true,
      dependencies: ['event-bus', 'physics', 'audio']
    });

    // Combat System
    container.register('combat', (eventBus, physics, audio) => {
      const { CombatSystem } = require('../modules/CombatSystem.js');
      const combat = new CombatSystem();
      // System registers itself with gameServices internally
      return combat;
    }, {
      singleton: true,
      dependencies: ['event-bus', 'physics', 'audio']
    });

    // XP Orb System
    container.register('xp-orbs', (eventBus, physics) => {
      const { XPOrbSystem } = require('../modules/XPOrbSystem.js');
      const xpOrbs = new XPOrbSystem();
      // System registers itself with gameServices internally
      return xpOrbs;
    }, {
      singleton: true,
      dependencies: ['event-bus', 'physics']
    });
  }

  /**
   * Registers UI and effects services.
   *
   * @private
   */
  static registerUIServices(container) {
    // Effects System
    container.register('effects', (eventBus, audio, settings) => {
      const { EffectsSystem } = require('../modules/EffectsSystem.js');
      const effects = new EffectsSystem();
      // System registers itself with gameServices internally
      return effects;
    }, {
      singleton: true,
      dependencies: ['event-bus', 'audio', 'settings']
    });

    // UI System
    container.register('ui', (eventBus, settings, input) => {
      const { UISystem } = require('../modules/UISystem.js');
      const ui = new UISystem();
      // System registers itself with gameServices internally
      return ui;
    }, {
      singleton: true,
      dependencies: ['event-bus', 'settings', 'input']
    });

    // Progression System
    container.register('progression', (eventBus, player, audio) => {
      const { ProgressionSystem } = require('../modules/ProgressionSystem.js');
      const progression = new ProgressionSystem();
      // System registers itself with gameServices internally
      return progression;
    }, {
      singleton: true,
      dependencies: ['event-bus', 'player', 'audio']
    });

    // Menu Background System
    container.register('menu-background', (eventBus) => {
      const { MenuBackgroundSystem } = require('../modules/MenuBackgroundSystem.js');
      const menuBg = new MenuBackgroundSystem();
      // System registers itself with gameServices internally
      return menuBg;
    }, {
      singleton: true,
      dependencies: ['event-bus']
    });
  }

  /**
   * Gets the recommended initialization order based on dependency graph.
   *
   * @param {DIContainer} container - The DI container
   * @returns {Array<string>} Service names in initialization order
   */
  static getInitializationOrder(container) {
    const order = [];
    const visited = new Set();

    const visit = (serviceName) => {
      if (visited.has(serviceName)) return;

      const deps = container.getDependencies(serviceName);
      if (deps) {
        // Visit dependencies first
        deps.dependencies.forEach(dep => visit(dep));
      }

      visited.add(serviceName);
      order.push(serviceName);
    };

    // Visit all services
    container.getServiceNames().forEach(name => visit(name));

    return order;
  }

  /**
   * Initializes all services in the correct order.
   *
   * @param {DIContainer} container - The DI container
   * @returns {Promise<void>}
   */
  static async initializeAllServices(container) {
    const order = this.getInitializationOrder(container);

    console.log('[ServiceRegistry] Initializing services in order:', order.join(' → '));

    for (const serviceName of order) {
      try {
        const service = container.resolve(serviceName);

        // Call initialize if available
        if (service && typeof service.initialize === 'function') {
          await service.initialize();
        }

        console.log(`[ServiceRegistry] ✓ Initialized '${serviceName}'`);
      } catch (error) {
        console.error(`[ServiceRegistry] ✗ Failed to initialize '${serviceName}':`, error);
        throw error;
      }
    }

    console.log('[ServiceRegistry] All services initialized successfully');
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
    container.register('event-bus', () => overrides.eventBus || { on: () => {}, emit: () => {} });
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
