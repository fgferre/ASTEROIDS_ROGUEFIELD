import { DIContainer } from '../../src/core/DIContainer.js';
import RandomService from '../../src/core/RandomService.js';

/**
 * Creates a lightweight service map for testing.
 *
 * @param {Object} overrides - Services to override for testing
 * @returns {DIContainer} Container with test services
 */
function buildTestContainer(overrides = {}) {
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

  const createEventBusStub = () => {
    const listeners = new Map();

    const on = (eventName, handler) => {
      if (typeof eventName !== 'string' || typeof handler !== 'function') {
        return;
      }
      if (!listeners.has(eventName)) {
        listeners.set(eventName, new Set());
      }
      listeners.get(eventName).add(handler);
    };

    const off = (eventName, handler) => {
      const handlers = listeners.get(eventName);
      if (!handlers) {
        return;
      }
      handlers.delete(handler);
      if (handlers.size === 0) {
        listeners.delete(eventName);
      }
    };

    const emit = (eventName, payload) => {
      const handlers = listeners.get(eventName);
      if (!handlers) {
        return;
      }
      for (const handler of handlers) {
        handler(payload);
      }
    };

    return {
      on,
      off,
      emit,
      emitSilently: emit,
    };
  };

  const eventBusInstance = eventBusOverride || createEventBusStub();

  container.register('event-bus', () => eventBusInstance);
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
    isRunning: () => sessionState.screen === 'playing' && !sessionState.paused,
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
 * Create a lightweight test container with a deterministic random seed.
 * Lives apart from setup.js so tests that do not need it skip loading the
 * whole game manifest.
 *
 * @param {string} [seed='test-seed'] - Seed for the random service.
 * @returns {DIContainer}
 * @example
 * const container = createTestContainer('audio-seed');
 * const random = container.resolve('RandomService');
 */
export function createTestContainer(seed = 'test-seed') {
  return buildTestContainer({ randomSeed: seed });
}
