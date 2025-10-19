import { GamePools } from './core/GamePools.js';
import {
  resolveDebugPreference,
  applyDebugPreference,
} from './core/debugLogging.js';
import { PerformanceMonitor } from './utils/PerformanceMonitor.js';
import { bootstrapServices } from './bootstrap/bootstrapServices.js';
import {
  DEFAULT_POOL_CONFIG,
  DEFAULT_GC_OPTIONS
} from './bootstrap/serviceManifest.js';
import { installMathRandomGuard } from './utils/dev/mathRandomGuard.js';
import GameSessionService from './services/GameSessionService.js';
import {
  loadFeatureFlags,
  saveFeatureFlags,
  applyFeatureFlagsToGlobal,
  resetFeatureFlagsToDefaults,
  logFeatureFlagStatus,
} from './core/featureFlagManager.js';

// Dependency Injection System (Phase 2.1)
import { DIContainer } from './core/DIContainer.js';
import { ServiceRegistry } from './core/ServiceRegistry.js';
import { ServiceLocatorAdapter } from './core/ServiceLocatorAdapter.js';

const gameState = {
  screen: 'menu',
  isPaused: false,
  canvas: null,
  ctx: null,
  initialized: false,
  lastTime: 0,
  deathSnapshot: null, // Snapshot of game state at death for retry
  randomSeed: null,
  randomSeedSource: 'unknown',
  randomSnapshot: null,
  randomScope: 'uninitialized',
};

let garbageCollectionManager = null;

const FEATURE_FLAG_KEY_TO_ID = {
  useWaveManager: 'use-wave-manager',
  asteroidSpawn: 'asteroid-spawn',
  legacySizeDistribution: 'legacy-size-distribution',
  legacyPositioning: 'legacy-positioning',
  strictLegacySpawn: 'strict-legacy-spawn',
};

// Performance monitoring (Week 1: Balance & Feel)
const performanceMonitor = new PerformanceMonitor();

// Initialize DI Container (Phase 2.1)
let diContainer = null;
let serviceLocatorAdapter = null;
let mathRandomGuard = null;
let gameSessionService = null;

function logServiceRegistrationFlow({ reason = 'bootstrap' } = {}) {
  if (!diContainer || typeof diContainer.getServiceNames !== 'function') {
    return;
  }

  const legacyHas =
    typeof gameServices !== 'undefined' && typeof gameServices.has === 'function'
      ? (name) => gameServices.has(name)
      : () => false;

  const serviceSnapshot = diContainer.getServiceNames().map((name) => ({
    service: name,
    placeholder: typeof diContainer.has === 'function' ? diContainer.has(name) : false,
    legacyRegistered: legacyHas(name),
    diSingleton: typeof diContainer.isInstantiated === 'function'
      ? diContainer.isInstantiated(name)
      : false,
  }));

  const shouldLog = typeof console !== 'undefined' && typeof console.groupCollapsed === 'function';

  if (!shouldLog) {
    return;
  }

  console.groupCollapsed(`[App] Service registration flow (${reason})`);
  console.log(
    '1) gameServices (ServiceLocator) recebe instâncias concretas registradas pelos sistemas legados.'
  );
  console.log(
    '2) ServiceRegistry.setupServices(diContainer) cria placeholders na DI para acompanhar os serviços existentes.'
  );
  console.log(
    '3) ServiceLocatorAdapter monitora o ServiceLocator legado e prepara a sincronização para fases futuras.'
  );

  if (typeof console.table === 'function') {
    console.table(serviceSnapshot);
  } else {
    serviceSnapshot.forEach((row) => {
      console.log(` - ${row.service}: placeholder=${row.placeholder}, legacy=${row.legacyRegistered}, singleton=${row.diSingleton}`);
    });
  }

  console.groupEnd();
}

function initializeDependencyInjection(manifestContext) {
  console.log('[App] Initializing Dependency Injection system...');

  let legacyLocatorSnapshot =
    typeof gameServices !== 'undefined' ? gameServices : null;

  try {
    // Create DI container
    diContainer = new DIContainer();
    diContainer.verbose = false; // Keep it quiet in production

    // Register all services
    ServiceRegistry.setupServices(diContainer, manifestContext);

    if (typeof gameServices !== 'undefined') {
      const legacyLocator = gameServices;
      legacyLocatorSnapshot = legacyLocator;
      serviceLocatorAdapter = new ServiceLocatorAdapter(diContainer);

      // Synchronize already-registered legacy services into the adapter
      try {
        const legacyEntries = legacyLocator?.services instanceof Map
          ? Array.from(legacyLocator.services.entries())
          : [];

        legacyEntries.forEach(([name, instance]) => {
          if (!name) return;
          try {
            serviceLocatorAdapter.syncInstance(name, instance);
          } catch (syncError) {
            console.warn(`[App] Failed to sync legacy service '${name}' to adapter:`, syncError);
          }
        });
      } catch (syncError) {
        console.warn('[App] Could not synchronize existing legacy services:', syncError);
      }

      if (typeof globalThis !== 'undefined') {
        if (!globalThis.__legacyGameServices) {
          globalThis.__legacyGameServices = legacyLocator;
        }
        globalThis.gameServices = serviceLocatorAdapter;
      }
    }

    // The adapter keeps legacy APIs operational while mirroring DI instances.
    // Systems continue to call gameServices.register/get() transparently until
    // full constructor injection is introduced in Phase 2.2+.

    // Just expose container for debugging
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      window.diContainer = diContainer;
      window.performanceMonitor = performanceMonitor;
      window.serviceLocatorAdapter = serviceLocatorAdapter;
      if (serviceLocatorAdapter) {
        window.gameServices = serviceLocatorAdapter;
      }
      window.featureFlags = {
        load: loadFeatureFlags,
        save: saveFeatureFlags,
        apply: applyFeatureFlagsToGlobal,
        reset: resetFeatureFlagsToDefaults,
        log: logFeatureFlagStatus,
      };

      logServiceRegistrationFlow({ reason: 'development snapshot' });

      // Enable auto-logging every 10 seconds
      performanceMonitor.enableAutoLog(10000);

      console.log('[App] ℹ Performance monitor available: window.performanceMonitor');
      console.log('[App] ℹ Auto-logging enabled (logs saved to localStorage)');
      console.log('[App] ℹ Get logs: localStorage.getItem("performanceLog")');
    }

    console.log('[App] ✓ DI system initialized successfully');
    console.log(`[App] ✓ ${diContainer.getServiceNames().length} services registered`);
    console.log('[App] ℹ ServiceLocator adapter will be enabled in Phase 2.2');

    if (process.env.NODE_ENV === 'production') {
      logServiceRegistrationFlow({ reason: 'production snapshot' });
    }

    return true;
  } catch (error) {
    console.error('[App] ✗ Failed to initialize DI system:', error);
    console.warn('[App] Falling back to legacy ServiceLocator');
    if (legacyLocatorSnapshot && typeof globalThis !== 'undefined') {
      globalThis.gameServices = legacyLocatorSnapshot;
    }
    return false;
  }
}

function bootstrapDebugLogging() {
  const preference = resolveDebugPreference();
  applyDebugPreference(preference);
}

function initializeFeatureFlagsUI() {
  const featureFlagsScreen = document.getElementById('feature-flags-screen');
  const featureFlagsForm = document.getElementById('feature-flags-form');
  const resetButton = document.getElementById('feature-flags-reset-btn');
  const startButton = document.getElementById('feature-flags-start-btn');
  const menuScreen = document.getElementById('menu-screen');

  if (!featureFlagsScreen || !featureFlagsForm || !resetButton || !startButton || !menuScreen) {
    menuScreen?.classList.remove('hidden');
    featureFlagsScreen?.classList.add('hidden');
    return;
  }

  const applyFlagsToForm = (flags) => {
    Object.entries(FEATURE_FLAG_KEY_TO_ID).forEach(([flagKey, elementId]) => {
      const checkbox = featureFlagsForm.querySelector(`#${elementId}`);
      if (checkbox) {
        checkbox.checked = Boolean(flags?.[flagKey]);
      }
    });
  };

  try {
    const storedFlags = loadFeatureFlags();
    applyFlagsToForm(storedFlags);
  } catch (error) {
    console.warn('[App] Failed to load feature flags for UI:', error);
  }

  resetButton.addEventListener('click', () => {
    const defaults = resetFeatureFlagsToDefaults();
    applyFlagsToForm(defaults);
    logFeatureFlagStatus();
  });

  startButton.addEventListener('click', (event) => {
    event.preventDefault();
    const updatedFlags = {};

    Object.entries(FEATURE_FLAG_KEY_TO_ID).forEach(([flagKey, elementId]) => {
      const checkbox = featureFlagsForm.querySelector(`#${elementId}`);
      updatedFlags[flagKey] = checkbox ? checkbox.checked : false;
    });

    const normalizedFlags = saveFeatureFlags(updatedFlags);
    applyFeatureFlagsToGlobal(normalizedFlags);
    logFeatureFlagStatus();

    featureFlagsScreen.classList.add('hidden');
    featureFlagsScreen.setAttribute('aria-hidden', 'true');

    menuScreen.classList.remove('hidden');
    menuScreen.removeAttribute('aria-hidden');

    const menuFocusTarget = document.getElementById('start-game-btn');
    menuFocusTarget?.focus();
  });

  featureFlagsScreen.classList.remove('hidden');
  featureFlagsScreen.removeAttribute('aria-hidden');
  menuScreen.setAttribute('aria-hidden', 'true');
}

function init() {
  try {
    if (process.env.NODE_ENV === 'development' && !mathRandomGuard) {
      mathRandomGuard = installMathRandomGuard({ logger: console });
    }

    gameState.canvas = document.getElementById('game-canvas');
    if (!gameState.canvas) {
      throw new Error('Canvas não encontrado');
    }

    gameState.ctx = gameState.canvas.getContext('2d');
    if (!gameState.ctx) {
      throw new Error('Contexto 2D não disponível');
    }

    try {
      const storedFlags = loadFeatureFlags();
      applyFeatureFlagsToGlobal(storedFlags);
      logFeatureFlagStatus();
    } catch (featureFlagError) {
      console.warn('[App] Failed to initialize feature flags:', featureFlagError);
    }

    const { seed: initialSeed, source: seedSource } = GameSessionService.deriveInitialSeed();
    const seedInfo = { seed: initialSeed, source: seedSource };
    gameState.randomSeed = initialSeed;
    gameState.randomSeedSource = seedSource;

    const manifestContext = {
      gameState,
      poolConfig: Object.fromEntries(
        Object.entries(DEFAULT_POOL_CONFIG).map(([key, value]) => [key, { ...value }])
      ),
      garbageCollectorOptions: { ...DEFAULT_GC_OPTIONS },
      seed: initialSeed,
      randomSeed: initialSeed,
      randomSeedSource: seedSource
    };

    // Initialize DI system first (Phase 2.1)
    const diInitialized = initializeDependencyInjection(manifestContext);

    const { services } = bootstrapServices({
      container: diContainer,
      manifestContext,
      adapter: serviceLocatorAdapter
    });

    garbageCollectionManager = services['garbage-collector'] || garbageCollectionManager;

    let resolvedGameSession = null;
    if (diContainer && typeof diContainer.resolve === 'function') {
      try {
        resolvedGameSession = diContainer.resolve('game-session');
      } catch (error) {
        console.warn('[App] Failed to resolve GameSessionService from DI:', error);
      }
    }

    gameSessionService = resolvedGameSession || services['game-session'] || null;

    if (gameSessionService && typeof gameSessionService.initialize === 'function') {
      gameSessionService.initialize({
        canvas: gameState.canvas,
        ctx: gameState.ctx,
        seedInfo
      });
    }

    const bootRandom =
      gameSessionService?.prepareRandomForScope?.('bootstrap', { mode: 'reset' }) || null;

    if (!bootRandom) {
      console.warn('[Random] GameSessionService could not prepare bootstrap scope deterministically.');
      if (!gameSessionService) {
        GameSessionService.persistLastSeed(seedInfo.seed, seedInfo.source);
      }
    } else if (gameSessionService) {
      const snapshot = gameSessionService.getRandomSnapshot();
      const seedInfo = gameSessionService.getSeedInfo();
      GameSessionService.persistLastSeed(
        snapshot?.seed ?? seedInfo.seed,
        seedInfo.source
      );
    }

    const ui = services['ui'] || gameServices.get('ui');
    if (ui) ui.showScreen('menu');

    gameState.initialized = true;

    if (process.env.NODE_ENV === 'development') {
      mathRandomGuard?.activate?.({ reason: 'bootstrap-complete' });
    }

    // Log DI statistics in development
    if (process.env.NODE_ENV === 'development' && diInitialized) {
      console.group('📊 DI System Status');
      console.log('Container:', diContainer.getStats());
      console.log('Validation:', diContainer.validate());
      console.groupEnd();
    }

    requestAnimationFrame(gameLoop);
  } catch (error) {
    console.error('Erro na inicialização:', error);
    alert('Erro ao inicializar o jogo. Recarregue a página.');
  }
}

function gameLoop(currentTime) {
  if (!gameState.initialized) return;

  // Start performance monitoring
  performanceMonitor.startFrame();

  const deltaTime = Math.min((currentTime - gameState.lastTime) / 1000, 0.016);
  gameState.lastTime = currentTime;

  try {
    const session = gameSessionService;

    if (session && typeof session.synchronizeLegacyState === 'function') {
      try {
        session.synchronizeLegacyState();
      } catch (syncError) {
        console.warn('[App] Failed to synchronize legacy state:', syncError);
      }
    } else if (session) {
      try {
        const screen = typeof session.getScreen === 'function' ? session.getScreen() : undefined;
        if (typeof screen === 'string') {
          gameState.screen = screen;
        }

        const paused = typeof session.isPaused === 'function' ? session.isPaused() : undefined;
        if (typeof paused === 'boolean') {
          gameState.isPaused = paused;
        }
      } catch (syncError) {
        console.warn('[App] Failed to mirror session state:', syncError);
      }
    }

    const shouldUpdateGame = (() => {
      if (session) {
        try {
          if (typeof session.isRunning === 'function') {
            const running = session.isRunning();
            if (typeof running === 'boolean') {
              return running;
            }
          }

          const screen = typeof session.getScreen === 'function' ? session.getScreen() : gameState.screen;
          const paused = typeof session.isPaused === 'function' ? session.isPaused() : gameState.isPaused;
          return screen === 'playing' && !paused;
        } catch (stateError) {
          console.warn('[App] Failed to evaluate session state:', stateError);
        }
      }

      return gameState.screen === 'playing' && !gameState.isPaused;
    })();

    // Update object pools (always, for TTL and auto-management)
    GamePools.update(deltaTime);
    if (garbageCollectionManager && typeof garbageCollectionManager.update === 'function') {
      garbageCollectionManager.update(deltaTime);
    }

    let adjustedDelta = deltaTime;
    const effects = gameServices.get('effects');
    if (effects && typeof effects.update === 'function') {
      adjustedDelta = effects.update(shouldUpdateGame ? deltaTime : 0);
    }

    if (shouldUpdateGame) {
      updateGame(adjustedDelta);
    }

    // Update performance metrics
    if (shouldUpdateGame) {
      const enemies = gameServices.get('enemies');
      const combat = gameServices.get('combat');
      const xpOrbs = gameServices.get('xp-orbs');
      const effects = gameServices.get('effects');

      performanceMonitor.updateMetrics({
        enemies: enemies?.asteroids?.length || 0,
        bullets: combat?.bullets?.length || 0,
        orbs: xpOrbs?.orbs?.length || 0,
        particles: effects?.particles?.length || 0,
        wave: enemies?.waveManager?.currentWave || 0,
      });
    }

    renderGame();
  } catch (error) {
    console.error('Erro no game loop:', error);
  }

  // End performance monitoring
  performanceMonitor.endFrame();

  requestAnimationFrame(gameLoop);
}

function updateGame(deltaTime) {
  const servicesToUpdate = [
    'input',
    'player',
    'enemies',
    'physics',
    'combat',
    'xp-orbs',
    'healthHearts',
    'progression',
    'world',
    'ui',
  ];

  servicesToUpdate.forEach((serviceName) => {
    const service = gameServices.get(serviceName);
    if (service && typeof service.update === 'function') {
      service.update(deltaTime);
    }
  });
}

function renderGame() {
  if (!gameState.ctx) return;

  const renderer = gameServices.get('renderer');
  if (renderer && typeof renderer.render === 'function') {
    renderer.render(gameState.ctx);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bootstrapDebugLogging();
  init();
  initializeFeatureFlagsUI();
  console.log('Aplicação inicializada com sucesso!');
});
