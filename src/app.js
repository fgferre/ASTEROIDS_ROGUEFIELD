import { GamePools } from './core/GamePools.js';
import {
  USE_WAVE_MANAGER,
  WAVEMANAGER_HANDLES_ASTEROID_SPAWN,
  WAVE_BOSS_INTERVAL,
  PRESERVE_LEGACY_SIZE_DISTRIBUTION,
  PRESERVE_LEGACY_POSITIONING,
  STRICT_LEGACY_SPAWN_SEQUENCE,
} from './data/constants/gameplay.js';
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
import { GameDebugLogger, isDevEnvironment } from './utils/dev/GameDebugLogger.js';

// Dependency Injection System (Phase 2.1)
import { DIContainer } from './core/DIContainer.js';
import { ServiceRegistry } from './core/ServiceRegistry.js';

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

// Performance monitoring (Week 1: Balance & Feel)
const performanceMonitor = new PerformanceMonitor();

// Initialize DI Container (Phase 2.1)
let diContainer = null;
let mathRandomGuard = null;
let gameSessionService = null;

const DEV_MODE = isDevEnvironment();

let debugCommandsExposed = false;
let debugBannerPrinted = false;

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
    '1) DIContainer serves as the enhanced service registry with legacy compatibility.'
  );
  console.log(
    '2) ServiceRegistry.setupServices(diContainer) registers all services from manifest.'
  );
  console.log(
    '3) Legacy services are synced directly into DIContainer via syncInstance().'
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

function exposeDebugCommands({ showBanner = false } = {}) {
  if (!DEV_MODE || typeof window === 'undefined') {
    return;
  }

  if (!debugCommandsExposed) {
    window.downloadDebugLog = () => GameDebugLogger.download();
    window.clearDebugLog = () => GameDebugLogger.clear();
    window.showDebugLog = () => console.log(GameDebugLogger.getLogContent());
    debugCommandsExposed = true;
  }

  if (showBanner && !debugBannerPrinted) {
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00ff00');
    console.log('%c🎮 ASTEROIDS ROGUEFIELD - Debug Mode Active', 'color: #00ff00; font-weight: bold; font-size: 14px');
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00ff00');
    console.log('%cDebug Commands:', 'color: #ffff00; font-weight: bold');
    console.log('%c  downloadDebugLog()  %c- Download game-debug.log file', 'color: #00ff00', 'color: #ffffff');
    console.log('%c  showDebugLog()      %c- Show log in console', 'color: #00ff00', 'color: #ffffff');
    console.log('%c  clearDebugLog()     %c- Clear current log', 'color: #00ff00', 'color: #ffffff');
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00ff00');
    debugBannerPrinted = true;
  }
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

    // Synchronize any existing legacy services directly into DIContainer
    if (typeof gameServices !== 'undefined') {
      const legacyLocator = gameServices;
      legacyLocatorSnapshot = legacyLocator;

      try {
        const legacyEntries = legacyLocator?.services instanceof Map
          ? Array.from(legacyLocator.services.entries())
          : [];

        legacyEntries.forEach(([name, instance]) => {
          if (!name) return;
          try {
            diContainer.syncInstance(name, instance);
          } catch (syncError) {
            console.warn(`[App] Failed to sync legacy service '${name}' to DIContainer:`, syncError);
          }
        });
      } catch (syncError) {
        console.warn('[App] Could not synchronize existing legacy services:', syncError);
      }

      // Preserve legacy locator for reference
      if (typeof globalThis !== 'undefined') {
        if (!globalThis.__legacyGameServices) {
          globalThis.__legacyGameServices = legacyLocator;
        }
      }
    }

    // Set DIContainer as the global gameServices
    if (typeof globalThis !== 'undefined') {
      globalThis.gameServices = diContainer;
    }

    // DIContainer now handles both factory-based DI and legacy direct registration.
    // Systems can continue to call gameServices.register/get() transparently until
    // full constructor injection is introduced in Phase 2.2+.

    // Just expose container for debugging
    if (typeof window !== 'undefined' && DEV_MODE) {
      window.diContainer = diContainer;
      window.gameServices = diContainer;
      window.performanceMonitor = performanceMonitor;

      logServiceRegistrationFlow({ reason: 'development snapshot' });

      // Enable auto-logging every 10 seconds
      performanceMonitor.enableAutoLog(10000);

      console.log('[App] ℹ Performance monitor available: window.performanceMonitor');
      console.log('[App] ℹ DIContainer available: window.gameServices, window.diContainer');
      console.log('[App] ℹ Auto-logging enabled (logs saved to localStorage)');
      console.log('[App] ℹ Get logs: localStorage.getItem("performanceLog")');
      exposeDebugCommands({ showBanner: true });
    }

    console.log('[App] ✓ DI system initialized successfully');
    console.log(`[App] ✓ ${diContainer.getServiceNames().length} services registered`);
    console.log('[App] ℹ DIContainer serves as unified service registry (factory + legacy)');

    if (!DEV_MODE) {
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

function init() {
  if (DEV_MODE) {
    GameDebugLogger.init();
    GameDebugLogger.log('INIT', 'Game starting', {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    });
    exposeDebugCommands({ showBanner: true });
  }

  try {
    if (DEV_MODE && !mathRandomGuard) {
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

    if (DEV_MODE) {
      GameDebugLogger.log('INIT', 'Feature Flags', {
        USE_WAVE_MANAGER,
        WAVEMANAGER_HANDLES_ASTEROID_SPAWN,
        WAVE_BOSS_INTERVAL,
        PRESERVE_LEGACY_SIZE_DISTRIBUTION,
        PRESERVE_LEGACY_POSITIONING,
        STRICT_LEGACY_SPAWN_SEQUENCE,
      });
    }

    // Initialize DI system first (Phase 2.1)
    const diInitialized = initializeDependencyInjection(manifestContext);

    // Early exit if DI bootstrap failed
    if (!diInitialized) {
      if (DEV_MODE) {
        GameDebugLogger.log('ERROR', 'DI bootstrap failed; aborting init');
      }
      alert('Falha na inicialização dos serviços. Recarregue a página.');

      // Set safe no-op stub to prevent accidental usage
      if (typeof globalThis !== 'undefined') {
        globalThis.gameServices = {
          get: () => null,
          register: () => {},
          has: () => false
        };
      }

      return;
    }

    const { services } = bootstrapServices({
      container: diContainer,
      manifestContext,
      adapter: diContainer
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

    if (DEV_MODE) {
      const playerSystem = services['player'] || gameServices.get('player');
      const enemySystem = services['enemies'] || gameServices.get('enemies');
      const physicsSystem = services['physics'] || gameServices.get('physics');
      const combatSystem = services['combat'] || gameServices.get('combat');
      const uiSystem = services['ui'] || gameServices.get('ui');
      const effectsSystem = services['effects'] || gameServices.get('effects');
      const audioSystem = services['audio'] || gameServices.get('audio');

      GameDebugLogger.log('INIT', 'Systems initialized', {
        player: !!playerSystem,
        enemies: !!enemySystem,
        physics: !!physicsSystem,
        combat: !!combatSystem,
        ui: !!uiSystem,
        effects: !!effectsSystem,
        audio: !!audioSystem,
        waveManager: !!enemySystem?.waveManager,
        factory: !!enemySystem?.factory,
        pools: !!GamePools,
      });
    }

    gameState.initialized = true;

    if (DEV_MODE) {
      mathRandomGuard?.activate?.({ reason: 'bootstrap-complete' });
    }

    // Log DI statistics in development
    if (DEV_MODE && diInitialized) {
      console.group('📊 DI System Status');
      console.log('Container:', diContainer.getStats());
      console.log('Validation:', diContainer.validate());
      console.groupEnd();
    }

    if (DEV_MODE) {
      window.addEventListener('beforeunload', () => {
        const enemySystem = gameServices.get('enemies');
        GameDebugLogger.log('STATE', 'Game closing', {
          totalWaves: enemySystem?.waveState?.current || 0,
          sessionDuration: (Date.now() - GameDebugLogger.sessionStart) / 1000,
        });
      });
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
  console.log('Aplicação inicializada com sucesso!');
});
