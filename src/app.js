import { GamePools } from './core/GamePools.js';
import * as CONSTANTS from './core/GameConstants.js';
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
  randomService: null,
};

let garbageCollectionManager = null;

// Performance monitoring (Week 1: Balance & Feel)
const performanceMonitor = new PerformanceMonitor();

// Initialize DI Container (Phase 2.1)
let diContainer = null;
let serviceLocatorAdapter = null;
let mathRandomGuard = null;
let gameSessionService = null;

function getRandomService() {
  if (gameState.randomService) {
    return gameState.randomService;
  }

  if (typeof gameServices !== 'undefined') {
    try {
      if (typeof gameServices.has === 'function' ? gameServices.has('random') : true) {
        const service = gameServices.get('random');
        if (service) {
          gameState.randomService = service;
          return service;
        }
      }
    } catch (error) {
      console.warn('[Random] Failed to obtain service from legacy locator:', error);
    }
  }

  if (diContainer && typeof diContainer.resolve === 'function') {
    try {
      const service = diContainer.resolve('random');
      if (service) {
        gameState.randomService = service;
        return service;
      }
    } catch (error) {
      console.warn('[Random] Failed to resolve random service from DI:', error);
    }
  }

  return null;
}

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

function resetGameSystems({ manageRandom = true } = {}) {
  if (gameSessionService?.resetSystems) {
    gameSessionService.resetSystems({ manageRandom });
    return;
  }

  if (manageRandom) {
    if (gameSessionService?.prepareRandomForScope) {
      gameSessionService.prepareRandomForScope('systems.reset', { mode: 'reset' });
    } else {
      console.warn('[Random] Unable to prepare RNG scope "systems.reset" - service unavailable.');
    }
  } else {
    const snapshot = gameSessionService?.getRandomSnapshot?.() ?? gameState.randomSnapshot;
    if (gameSessionService?.logRandomSnapshot) {
      gameSessionService.logRandomSnapshot('systems.reset (pre-managed)', snapshot, {
        mode: 'snapshot'
      });
    } else {
      GameSessionService.logRandomSnapshot('systems.reset (pre-managed)', snapshot, {
        mode: 'snapshot'
      });
    }
  }

  if (typeof gameServices === 'undefined') {
    return;
  }

  const servicesToReset = [
    'player',
    'combat',
    'enemies',
    'physics',
    'progression',
    'xp-orbs',
    'healthHearts',
    'effects',
    'renderer',
    'world',
    'audio',
  ];

  servicesToReset.forEach((serviceName) => {
    try {
      if (typeof gameServices.has === 'function' && !gameServices.has(serviceName)) {
        return;
      }

      const service = gameServices.get(serviceName);
      if (service && typeof service.reset === 'function') {
        service.reset();
      }
    } catch (error) {
      console.warn(`Não foi possível resetar o serviço "${serviceName}":`, error);
    }
  });
}

function emitPauseState() {
  if (typeof gameEvents === 'undefined') return;

  gameEvents.emit('pause-state-changed', { isPaused: gameState.isPaused });
}

function bootstrapDebugLogging() {
  const preference = resolveDebugPreference();
  applyDebugPreference(preference);
}

function startRetryCountdown() {
  if (gameSessionService?.beginRetryCountdown) {
    gameSessionService.beginRetryCountdown();
  } else {
    console.warn('[Retry] GameSessionService unavailable - fallback countdown not implemented.');
  }
}

function executeRetryRespawn() {
  if (gameSessionService?.completeRetryRespawn) {
    gameSessionService.completeRetryRespawn();
  } else {
    console.warn('[Retry] GameSessionService unavailable - respawn skipped.');
  }
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

    setupDomEventListeners();
    setupGlobalEventListeners();

    const { seed: initialSeed, source: seedSource } = GameSessionService.deriveInitialSeed();
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

    if (services['random']) {
      gameState.randomService = services['random'];
    }

    gameSessionService = services['game-session'] || null;

    if (!gameSessionService && diContainer && typeof diContainer.resolve === 'function') {
      try {
        gameSessionService = diContainer.resolve('game-session');
      } catch (error) {
        console.warn('[App] Failed to resolve GameSessionService from DI:', error);
      }
    }

    if (gameSessionService && typeof gameSessionService.initialize === 'function') {
      gameSessionService.initialize({
        seed: initialSeed,
        source: seedSource,
        canvas: gameState.canvas,
        ctx: gameState.ctx,
      });
    }

    const bootRandom =
      gameSessionService?.prepareRandomForScope?.('bootstrap', { mode: 'reset' }) || null;

    if (!bootRandom) {
      console.warn('[Random] GameSessionService could not prepare bootstrap scope deterministically.');
      if (!gameSessionService) {
        GameSessionService.persistLastSeed(initialSeed, seedSource);
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

function setupDomEventListeners() {
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const button = event.target.closest('button');
    if (!button) {
      return;
    }

    if (button.id === 'start-game-btn') {
      event.preventDefault();
      requestStartGame();
    } else if (button.id === 'restart-game-btn') {
      event.preventDefault();
      requestStartGame();
    } else if (button.id === 'retry-game-btn') {
      event.preventDefault();
      if (gameSessionService?.beginRetryCountdown) {
        gameSessionService.beginRetryCountdown();
      } else {
        console.warn('[Retry] GameSessionService unavailable - countdown skipped.');
      }
    } else if (button.id === 'quit-game-btn') {
      event.preventDefault();
      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('exit-to-menu-requested', { source: 'gameover' });
      }
    } else if (button.id === 'open-settings-btn') {
      event.preventDefault();
      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('settings-menu-requested', { source: 'menu' });
      }
    } else if (button.id === 'menu-credits-btn') {
      event.preventDefault();
      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('credits-menu-requested', {
          open: true,
          source: 'menu',
          triggerId: 'menu-credits-btn',
        });
      }
    }
  });
}

function setupGlobalEventListeners() {
  if (typeof gameEvents === 'undefined') return;

  gameEvents.on('screen-changed', (data) => {
    if (data?.screen) {
      gameState.screen = data.screen;
      if (gameState.screen !== 'playing' && gameState.isPaused) {
        gameState.isPaused = false;
        emitPauseState();
      }
    }
  });

  gameEvents.on('player-died', (data) => {
    if (gameSessionService?.handlePlayerDeath) {
      gameSessionService.handlePlayerDeath(data);
    } else {
      if (gameState.isPaused) {
        gameState.isPaused = false;
        emitPauseState();
      }

      console.warn('[Retry] Unable to capture snapshot - GameSessionService unavailable.');
    }
  });

  gameEvents.on('toggle-pause', () => {
    if (gameSessionService?.togglePause) {
      gameSessionService.togglePause();
      return;
    }

    if (gameState.screen !== 'playing') {
      if (gameState.isPaused) {
        gameState.isPaused = false;
        emitPauseState();
      }
      return;
    }

    gameState.isPaused = !gameState.isPaused;
    emitPauseState();
  });

  gameEvents.on('exit-to-menu-requested', (payload = {}) => {
    exitToMenu(payload);
  });

  gameEvents.on('activate-shield-pressed', () => {
    if (gameState.screen !== 'playing') {
      return;
    }
    const player = gameServices.get('player');
    if (player && typeof player.activateShield === 'function') {
      player.activateShield();
    }
  });
}

function requestStartGame() {
  if (typeof gameEvents !== 'undefined') {
    gameEvents.emit('credits-menu-requested', {
      open: false,
      restoreFocus: false,
    });
  }
  startGame();
}

function startGame() {
  try {
    let usedService = false;

    if (gameSessionService?.startNewRun) {
      gameSessionService.startNewRun();
      usedService = true;
    } else {
      if (gameSessionService?.prepareRandomForScope) {
        gameSessionService.prepareRandomForScope('run.start', { mode: 'reset' });
      } else {
        const random = getRandomService();
        if (random && typeof random.reset === 'function') {
          random.reset(gameState.randomSeed);
          const snapshot = random.serialize?.();
          if (snapshot) {
            gameState.randomSnapshot = snapshot;
            GameSessionService.logRandomSnapshot('run.start (fallback)', snapshot, {
              mode: 'reset'
            });
          }
        } else {
          console.warn('[Random] Unable to prepare RNG for run.start - service unavailable.');
        }
      }

      if (gameSessionService?.clearDeathSnapshot) {
        gameSessionService.clearDeathSnapshot();
      } else {
        gameState.deathSnapshot = null;
      }

      resetGameSystems({ manageRandom: false });

      const audio = gameServices.get('audio');
      if (audio?.init) audio.init();

      const ui = gameServices.get('ui');
      if (ui) ui.showGameUI();

      // Reset retry UI state for new game
      if (gameSessionService?.setRetryCount) {
        gameSessionService.setRetryCount(1);
      } else {
        const retryCountEl = document.getElementById('retry-count');
        if (retryCountEl) {
          retryCountEl.textContent = '1';
        }
      }

      if (gameSessionService?.setRetryButtonEnabled) {
        gameSessionService.setRetryButtonEnabled(true);
      } else {
        const retryBtn = document.getElementById('retry-game-btn');
        if (retryBtn) {
          retryBtn.disabled = false;
          retryBtn.style.opacity = '1';
        }
      }

      gameSessionService?.hideRetryCountdown?.();

      gameState.screen = 'playing';
      gameState.isPaused = false;
      emitPauseState();
    }

    if (usedService) {
      gameState.screen = gameSessionService?.getScreen?.() ?? 'playing';
      gameState.isPaused = Boolean(gameSessionService?.isPaused?.());
    }

    gameState.lastTime = performance.now();

    console.log('Jogo iniciado com sucesso!');
  } catch (error) {
    console.error('Erro ao iniciar jogo:', error);
  }
}

function exitToMenu(payload = {}) {
  if (gameSessionService?.exitToMenu) {
    try {
      gameSessionService.exitToMenu(payload);
      return;
    } catch (error) {
      console.error('Erro ao sair para o menu via GameSessionService:', error);
    }
  }

  legacyExitToMenu(payload);
}

function legacyExitToMenu(payload = {}) {
  try {
    // If exiting from pause menu, trigger epic ship explosion first!
    if (payload?.source === 'pause-menu' && gameState.screen === 'playing') {
      console.log('[App] Quit from pause - triggering epic explosion...');

      const player = gameServices.get('player');
      const effects = gameServices.get('effects');
      const ui = gameServices.get('ui');

      // Unpause game so explosion can animate
      gameState.isPaused = false;
      emitPauseState();

      // Hide pause screen to show explosion
      if (ui && typeof ui.showScreen === 'function') {
        ui.showScreen('playing');
      }

      // Get player position for explosion
      const playerPosition = player && typeof player.getPosition === 'function'
        ? player.getPosition()
        : (player ? player.position : { x: 960, y: 540 });

      // DIRECTLY trigger epic explosion effect (don't reuse death system!)
      if (effects && typeof effects.createEpicShipExplosion === 'function') {
        effects.createEpicShipExplosion(playerPosition);
      }

      // Hide player ship during explosion
      if (player) {
        player._quitExplosionHidden = true; // Flag to hide rendering
      }

      // Wait for explosion to complete before going to menu
      setTimeout(() => {
        if (player) {
          player._quitExplosionHidden = false; // Restore for next game
        }
        legacyPerformExitToMenu(payload);
      }, 3500); // 3.5s to see full explosion
      return;
    } else {
      legacyPerformExitToMenu(payload);
    }
  } catch (error) {
    console.error('Erro ao sair para o menu:', error);
    legacyPerformExitToMenu(payload); // Fallback
  }
}

function legacyPerformExitToMenu(payload = {}) {
  try {
    if (gameSessionService?.prepareRandomForScope) {
      gameSessionService.prepareRandomForScope('menu.exit', { mode: 'reset' });
    } else {
      const random = getRandomService();
      if (random && typeof random.reset === 'function') {
        random.reset(gameState.randomSeed);
        const snapshot = random.serialize?.();
        if (snapshot) {
          gameState.randomSnapshot = snapshot;
          GameSessionService.logRandomSnapshot('menu.exit (fallback)', snapshot, {
            mode: 'reset'
          });
        }
      } else {
        console.warn('[Random] Unable to prepare RNG for menu.exit - service unavailable.');
      }
    }
    resetGameSystems({ manageRandom: false });

    gameSessionService?.resetForMenu?.();

    const ui = gameServices.get('ui');
    if (ui) {
      if (typeof ui.resetLevelUpState === 'function') {
        ui.resetLevelUpState();
      }
      ui.showScreen('menu');
    }

    gameState.screen = 'menu';
    const wasPaused = gameState.isPaused;
    gameState.isPaused = false;
    if (wasPaused) {
      emitPauseState();
    }

    if (payload?.source) {
      console.log(`Retornando ao menu (origem: ${payload.source}).`);
    } else {
      console.log('Retornando ao menu.');
    }
  } catch (error) {
    console.error('Erro ao retornar ao menu:', error);
  }
}

function gameLoop(currentTime) {
  if (!gameState.initialized) return;

  // Start performance monitoring
  performanceMonitor.startFrame();

  const deltaTime = Math.min((currentTime - gameState.lastTime) / 1000, 0.016);
  gameState.lastTime = currentTime;

  try {
    const shouldUpdateGame =
      gameState.screen === 'playing' && !gameState.isPaused;

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
