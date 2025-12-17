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

      if (
        options.manifestContext &&
        typeof options.manifestContext === 'object'
      ) {
        return { ...options.manifestContext };
      }

      return { ...options };
    })();

    if (options && typeof options === 'object') {
      if (
        Object.prototype.hasOwnProperty.call(options, 'seed') &&
        manifestContext.seed === undefined
      ) {
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
        lazy = true,
      } = entry;

      if (!name || typeof name !== 'string') {
        throw new Error('[ServiceRegistry] Service entry missing valid name');
      }

      if (registeredNames.has(name)) {
        throw new Error(
          `[ServiceRegistry] Duplicate service definition: ${name}`
        );
      }

      if (typeof factory !== 'function') {
        throw new Error(
          `[ServiceRegistry] Service '${name}' is missing a factory function`
        );
      }

      dependencies.forEach((dependency) => {
        const dependencyExists = manifest.some(
          (candidate) => candidate.name === dependency
        );
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
            manifestEntry: entry,
          });
        },
        {
          dependencies,
          singleton,
          lazy,
        }
      );
    });

    console.log(
      `[ServiceRegistry] Registered ${registeredNames.size} services in DI container`
    );
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
      gameSession: gameSessionOverride,
      eventBus: eventBusOverride,
      settings: settingsOverride,
      audio: audioOverride,
      ...serviceOverrides
    } = overrides || {};

    container.register(
      'event-bus',
      () => eventBusOverride || { on: () => {}, emit: () => {}, off: () => {} }
    );
    container.register(
      'settings',
      () => settingsOverride || { get: () => null, set: () => {} }
    );
    container.register(
      'audio',
      () => audioOverride || { play: () => {}, stop: () => {} }
    );

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

    const sessionState = {
      paused: false,
      screen: 'menu',
      sessionState: 'menu',
      retryCount: 0,
      retryCountdownActive: false,
      seed: null,
      seedSource: 'unknown',
      randomScope: 'uninitialized',
      randomSnapshot: null,
    };

    const defaultSessionStub = {
      initialize: ({ seedInfo, seed, source } = {}) => {
        const normalizedSeedInfo =
          typeof seedInfo === 'object' && seedInfo !== null ? seedInfo : {};

        if (
          typeof normalizedSeedInfo.seed === 'undefined' &&
          typeof seed !== 'undefined'
        ) {
          normalizedSeedInfo.seed = seed;
        }

        if (
          typeof normalizedSeedInfo.source === 'undefined' &&
          typeof source === 'string'
        ) {
          normalizedSeedInfo.source = source;
        }

        if (Object.prototype.hasOwnProperty.call(normalizedSeedInfo, 'seed')) {
          sessionState.seed = normalizedSeedInfo.seed;
        }

        if (typeof normalizedSeedInfo.source === 'string') {
          sessionState.seedSource = normalizedSeedInfo.source;
        }

        return { seed: sessionState.seed, source: sessionState.seedSource };
      },
      isPaused: () => sessionState.paused,
      setPaused: (value) => {
        sessionState.paused = Boolean(value);
        return sessionState.paused;
      },
      getScreen: () => sessionState.screen,
      setScreen: (screen) => {
        sessionState.screen = screen;
        return sessionState.screen;
      },
      isRunning: () =>
        sessionState.screen === 'playing' && !sessionState.paused,
      setSessionState: (state) => {
        sessionState.sessionState = state;
        return sessionState.sessionState;
      },
      getSessionState: () => sessionState.sessionState,
      getRetryCount: () => sessionState.retryCount,
      setRetryCount: (value) => {
        const numeric = Number.isFinite(value) ? value : 0;
        sessionState.retryCount = Math.max(0, numeric);
        return sessionState.retryCount;
      },
      requestRetry: () => {
        if (sessionState.retryCountdownActive || sessionState.retryCount <= 0) {
          return false;
        }

        sessionState.retryCountdownActive = true;
        sessionState.retryCount = Math.max(0, sessionState.retryCount - 1);
        sessionState.sessionState = 'retrying';
        return true;
      },
      beginRetryCountdown: () => {
        if (sessionState.retryCountdownActive || sessionState.retryCount <= 0) {
          return false;
        }

        sessionState.retryCountdownActive = true;
        sessionState.retryCount = Math.max(0, sessionState.retryCount - 1);
        sessionState.sessionState = 'retrying';
        return true;
      },
      completeRetryRespawn: () => {
        sessionState.retryCountdownActive = false;
        sessionState.sessionState = 'running';
        sessionState.screen = 'playing';
        sessionState.paused = false;
        return true;
      },
      handlePlayerDeath: () => {
        sessionState.sessionState = 'player-died';
        sessionState.screen = 'gameover';
        return true;
      },
      startNewRun: ({ source } = {}) => {
        sessionState.screen = 'playing';
        sessionState.paused = false;
        sessionState.sessionState = 'running';
        sessionState.lastStartSource = source || 'unknown';
        if (sessionState.retryCount <= 0) {
          sessionState.retryCount = 1;
        }
        sessionState.retryCountdownActive = false;
        return true;
      },
      exitToMenu: ({ source } = {}) => {
        sessionState.screen = 'menu';
        sessionState.paused = false;
        sessionState.sessionState = 'menu';
        sessionState.retryCountdownActive = false;
        sessionState.retryCount = 0;
        sessionState.randomScope = 'menu';
        sessionState.lastExitSource = source || 'unknown';
        return true;
      },
      togglePause: ({ forcedState } = {}) => {
        if (typeof forcedState === 'boolean') {
          sessionState.paused = forcedState;
        } else {
          sessionState.paused = !sessionState.paused;
        }
        sessionState.sessionState = sessionState.paused ? 'paused' : 'running';
        return sessionState.paused;
      },
      prepareRandomForScope: (scope, { mode = 'reset', snapshot } = {}) => {
        sessionState.randomScope = scope;
        if (snapshot) {
          sessionState.randomSnapshot = snapshot;
        } else if (mode === 'reset') {
          sessionState.randomSnapshot = {
            seed: sessionState.seed,
            scope,
            mode,
          };
        }
        return {
          scope,
          mode,
          snapshot: sessionState.randomSnapshot,
        };
      },
      getRandomSnapshot: () => sessionState.randomSnapshot,
      getSeedInfo: () => ({
        seed: sessionState.seed,
        source: sessionState.seedSource,
      }),
      synchronizeLegacyState: () => undefined,
    };

    const resolvedGameSession = (() => {
      if (typeof gameSessionOverride === 'function') {
        const produced = gameSessionOverride({
          defaults: defaultSessionStub,
          state: sessionState,
        });

        if (produced && typeof produced === 'object') {
          return { ...defaultSessionStub, ...produced };
        }

        return defaultSessionStub;
      }

      if (gameSessionOverride && typeof gameSessionOverride === 'object') {
        return { ...defaultSessionStub, ...gameSessionOverride };
      }

      return defaultSessionStub;
    })();

    container.register('game-session', () => resolvedGameSession);

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
