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
  DEFAULT_GC_OPTIONS,
} from './bootstrap/serviceManifest.js';
import { installMathRandomGuard } from './utils/dev/mathRandomGuard.js';
import GameSessionService from './services/GameSessionService.js';
import {
  GameDebugLogger,
  isDevEnvironment,
} from './utils/dev/GameDebugLogger.js';

// [NEO-ARCADE] Warmup imports
import { RenderComponent } from './modules/enemies/components/RenderComponent.js';
import { warmupProjectileCache } from './utils/drawEnemyProjectile.js';

// Dependency Injection System (Phase 2.1)
import { DIContainer } from './core/DIContainer.js';
import { ServiceRegistry } from './core/ServiceRegistry.js';

const gameState = {
  screen: 'menu',
  isPaused: false,
  canvas: null,
  ctx: null,
  gameUI: null,
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
let gameSystemServices = null; // Services from bootstrapServices()

// Performance and state cache (OPTIMIZATION)
let metricsCache = null;
let metricsCacheFrameCount = 0;
let servicesCache = {
  input: null,
  player: null,
  enemies: null,
  physics: null,
  combat: null,
  'xp-orbs': null,
  healthHearts: null,
  progression: null,
  world: null,
  ui: null,
};
let servicesCacheInitialized = false;
let stateDirty = false;
let lastSyncTime = 0;

const DEV_MODE = isDevEnvironment();

function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('document is not available'));
      return;
    }

    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error(`Failed to load script: ${src}`)),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true';
        resolve();
      },
      { once: true }
    );
    script.addEventListener(
      'error',
      () => reject(new Error(`Failed to load script: ${src}`)),
      { once: true }
    );
    document.head.appendChild(script);
  });
}

async function initializeDevStatsPanel() {
  if (!DEV_MODE || typeof window === 'undefined' || window.stats) {
    return;
  }

  try {
    if (typeof window.Stats !== 'function') {
      await loadExternalScript('/libs/Stats.min.js');
    }

    if (typeof window.Stats !== 'function' || window.stats) {
      return;
    }

    const statsPanel = new window.Stats();
    statsPanel.showPanel(0);
    const statsElement = statsPanel.dom || statsPanel.domElement;
    if (statsElement instanceof Node) {
      document.body.appendChild(statsElement);
      window.stats = statsPanel;
    }
  } catch (error) {
    console.warn('[bootstrap] Failed to initialize dev stats panel:', error);
  }
}

function initializeDependencyInjection(manifestContext) {
  console.log('[App] Initializing Dependency Injection system...');

  try {
    // Create DI container
    diContainer = new DIContainer();
    diContainer.verbose = false; // Keep it quiet in production

    // Register all services
    ServiceRegistry.setupServices(diContainer, manifestContext);

    // DIContainer now handles factory-based DI registrations.

    // Development diagnostics
    if (typeof window !== 'undefined' && DEV_MODE) {
      // Enable auto-logging every 10 seconds
      performanceMonitor.enableAutoLog(10000);

      // Expose performanceMonitor for console access
      window.performanceMonitor = performanceMonitor;

      // Enable on-screen performance overlay (F3 to toggle)
      performanceMonitor.showOverlay();

      console.log('[App] ℹ Auto-logging enabled (logs saved to localStorage)');
      console.log('[App] ℹ Performance overlay enabled (F3 to toggle)');
    }

    console.log('[App] ✓ DI system initialized successfully');
    console.log(
      `[App] ✓ ${diContainer.getServiceNames().length} services registered`
    );
    console.log('[App] ℹ DIContainer serves as unified service registry');

    return true;
  } catch (error) {
    console.error('[App] ✗ Failed to initialize DI system:', error);
    console.warn('[App] DI initialization failed; cannot continue.');
    return false;
  }
}

function bootstrapDebugLogging() {
  const preference = resolveDebugPreference();
  applyDebugPreference(preference);
}

function synchronizeSessionState(currentTime, session) {
  if (!session) {
    return;
  }

  if (typeof session.synchronizeLegacyState === 'function') {
    const shouldSync = stateDirty || currentTime - lastSyncTime > 100;
    if (!shouldSync) {
      return;
    }

    try {
      session.synchronizeLegacyState();
      stateDirty = false;
      lastSyncTime = currentTime;
    } catch (syncError) {
      console.warn('[App] Failed to synchronize legacy state:', syncError);
    }
    return;
  }

  try {
    const screen =
      typeof session.getScreen === 'function' ? session.getScreen() : undefined;
    if (typeof screen === 'string') {
      gameState.screen = screen;
    }

    const paused =
      typeof session.isPaused === 'function' ? session.isPaused() : undefined;
    if (typeof paused === 'boolean') {
      gameState.isPaused = paused;
    }
  } catch (syncError) {
    console.warn('[App] Failed to mirror session state:', syncError);
  }
}

function getSessionFrameState(session) {
  const snapshot = {
    screen: gameState.screen,
    isPaused: gameState.isPaused,
    isRunning: gameState.screen === 'playing' && !gameState.isPaused,
  };

  if (!session) {
    return snapshot;
  }

  try {
    const screen =
      typeof session.getScreen === 'function'
        ? session.getScreen()
        : snapshot.screen;
    if (typeof screen === 'string') {
      snapshot.screen = screen;
      gameState.screen = screen;
    }

    const paused =
      typeof session.isPaused === 'function'
        ? session.isPaused()
        : snapshot.isPaused;
    if (typeof paused === 'boolean') {
      snapshot.isPaused = paused;
      gameState.isPaused = paused;
    }

    if (typeof session.isRunning === 'function') {
      const running = session.isRunning();
      if (typeof running === 'boolean') {
        snapshot.isRunning = running;
      }
    } else {
      snapshot.isRunning = snapshot.screen === 'playing' && !snapshot.isPaused;
    }
  } catch (stateError) {
    console.warn(
      '[App] Failed to read current session frame state:',
      stateError
    );
  }

  return snapshot;
}

function init() {
  if (DEV_MODE) {
    GameDebugLogger.init();
    GameDebugLogger.log('INIT', 'Game starting', {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    });
  }

  try {
    if (DEV_MODE && !mathRandomGuard) {
      mathRandomGuard = installMathRandomGuard({ logger: console });
    }

    gameState.canvas = document.getElementById('game-canvas');
    if (!gameState.canvas) {
      throw new Error('Canvas não encontrado');
    }

    gameState.gameUI = document.getElementById('game-ui');
    gameState.ctx = gameState.canvas.getContext('2d');
    if (!gameState.ctx) {
      throw new Error('Contexto 2D não disponível');
    }

    const { seed: initialSeed, source: seedSource } =
      GameSessionService.deriveInitialSeed();
    const seedInfo = { seed: initialSeed, source: seedSource };
    gameState.randomSeed = initialSeed;
    gameState.randomSeedSource = seedSource;

    const manifestContext = {
      gameState,
      poolConfig: Object.fromEntries(
        Object.entries(DEFAULT_POOL_CONFIG).map(([key, value]) => [
          key,
          { ...value },
        ])
      ),
      garbageCollectorOptions: { ...DEFAULT_GC_OPTIONS },
      seed: initialSeed,
      randomSeed: initialSeed,
      randomSeedSource: seedSource,
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

      return;
    }

    const { services } = bootstrapServices({
      container: diContainer,
      manifestContext,
    });

    // Store services for use in game loop
    gameSystemServices = services;

    // Validate that all required services exist (DEV_MODE only)
    if (DEV_MODE) {
      const requiredServices = [
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
        'effects',
        'renderer',
      ];
      const missingServices = requiredServices.filter(
        (name) => !gameSystemServices[name]
      );
      if (missingServices.length > 0) {
        console.warn('[App] ⚠️ Missing required services:', missingServices);
      }
    }

    garbageCollectionManager =
      services['garbage-collector'] || garbageCollectionManager;

    let resolvedGameSession = null;
    if (diContainer && typeof diContainer.resolve === 'function') {
      try {
        resolvedGameSession = diContainer.resolve('game-session');
      } catch (error) {
        console.warn(
          '[App] Failed to resolve GameSessionService from DI:',
          error
        );
      }
    }

    gameSessionService =
      resolvedGameSession || services['game-session'] || null;

    if (
      gameSessionService &&
      typeof gameSessionService.initialize === 'function'
    ) {
      gameSessionService.initialize({
        canvas: gameState.canvas,
        ctx: gameState.ctx,
        seedInfo,
      });
    }

    const bootRandom =
      gameSessionService?.prepareRandomForScope?.('bootstrap', {
        mode: 'reset',
      }) || null;

    if (!bootRandom) {
      console.warn(
        '[Random] GameSessionService could not prepare bootstrap scope deterministically.'
      );
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

    const ui = services['ui'];
    if (ui) ui.showScreen('menu');

    if (DEV_MODE) {
      const playerSystem = services['player'];
      const enemySystem = services['enemies'];
      const physicsSystem = services['physics'];
      const combatSystem = services['combat'];
      const uiSystem = services['ui'];
      const effectsSystem = services['effects'];
      const audioSystem = services['audio'];

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
        const enemySystem = gameSystemServices?.['enemies'];
        GameDebugLogger.log('STATE', 'Game closing', {
          totalWaves: enemySystem?.waveState?.current || 0,
          sessionDuration: (Date.now() - GameDebugLogger.sessionStart) / 1000,
        });
      });
    }

    // Register cache invalidation listeners (OPTIMIZATION #3)
    if (diContainer) {
      try {
        const gameEvents = diContainer.resolve('event-bus');
        if (gameEvents && typeof gameEvents.on === 'function') {
          gameEvents.on('screen-changed', () => {
            stateDirty = true;
            servicesCacheInitialized = false;
          });
          gameEvents.on('pause-state-changed', () => {
            stateDirty = true;
          });
          gameEvents.on('session-state-changed', () => {
            stateDirty = true;
          });
        }
      } catch (error) {
        console.warn(
          '[App] Failed to register cache invalidation listeners:',
          error
        );
      }
    }

    // [NEO-ARCADE] OPTIMIZATION: Warmup Caches to prevent lag spikes
    try {
      console.log('[App] Warming up render caches...');
      if (typeof RenderComponent.warmup === 'function') {
        RenderComponent.warmup();
      }
      if (typeof warmupProjectileCache === 'function') {
        warmupProjectileCache();
      }
      console.log('[App] Render caches warmed up.');
    } catch (e) {
      console.warn('[App] Cache warmup failed (non-fatal):', e);
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
    synchronizeSessionState(currentTime, session);
    const sessionState = getSessionFrameState(session);
    const currentScreen = sessionState.screen;
    const shouldUpdateGame = sessionState.isRunning;

    const shouldRenderGame = gameState.gameUI
      ? !gameState.gameUI.classList.contains('hidden')
      : currentScreen === 'playing' || currentScreen === 'gameover';

    if (shouldUpdateGame) {
      GamePools.update(deltaTime);
      if (
        garbageCollectionManager &&
        typeof garbageCollectionManager.update === 'function'
      ) {
        garbageCollectionManager.update(deltaTime);
      }
    }

    let adjustedDelta = deltaTime;
    const effects = gameSystemServices?.['effects'];
    if (effects && typeof effects.update === 'function') {
      adjustedDelta = effects.update(shouldUpdateGame ? deltaTime : 0);
    }

    if (shouldUpdateGame) {
      updateGame(adjustedDelta);
    }

    // OPTIMIZATION #1: PerformanceMonitor Cache - recalculate only every 5 frames
    if (shouldUpdateGame) {
      if (metricsCacheFrameCount % 5 === 0 || metricsCache === null) {
        const enemies = gameSystemServices?.['enemies'];
        const combat = gameSystemServices?.['combat'];
        const xpOrbs = gameSystemServices?.['xp-orbs'];
        const effects = gameSystemServices?.['effects'];
        const projectilePerf =
          combat && typeof combat.getProjectilePerfSnapshot === 'function'
            ? combat.getProjectilePerfSnapshot()
            : null;

        metricsCache = {
          enemies: enemies?.asteroids?.length || 0,
          bullets: combat?.bullets?.length || 0,
          orbs: xpOrbs?.orbs?.length || 0,
          particles: effects?.particles?.length || 0,
          wave: enemies?.waveManager?.currentWave || 0,
          projectileUpdateMs: projectilePerf?.projectileUpdateMs || 0,
          projectileRenderMs: projectilePerf?.projectileRenderMs || 0,
          projectilePlayerCount: projectilePerf?.projectilePlayerCount || 0,
          projectileEnemyCount: projectilePerf?.projectileEnemyCount || 0,
          projectilePlayerTrailPoints:
            projectilePerf?.projectilePlayerTrailPoints || 0,
          projectileEnemyTrailPoints:
            projectilePerf?.projectileEnemyTrailPoints || 0,
        };
      }

      metricsCacheFrameCount++;
    }

    if (shouldRenderGame) {
      renderGame();
    }

    // Capture render timing AFTER render completes
    if (shouldUpdateGame && metricsCacheFrameCount % 5 === 1) {
      const combat = gameSystemServices?.['combat'];
      const projectilePerf =
        combat && typeof combat.getProjectilePerfSnapshot === 'function'
          ? combat.getProjectilePerfSnapshot()
          : null;
      if (projectilePerf && metricsCache) {
        metricsCache.projectileRenderMs =
          projectilePerf.projectileRenderMs || 0;
        metricsCache.projectilePlayerTrailPoints =
          projectilePerf.projectilePlayerTrailPoints || 0;
        metricsCache.projectileEnemyTrailPoints =
          projectilePerf.projectileEnemyTrailPoints || 0;
        performanceMonitor.updateMetrics(metricsCache);
      }
    }
  } catch (error) {
    console.error('Erro no game loop:', error);
  }

  // End performance monitoring
  performanceMonitor.endFrame();

  requestAnimationFrame(gameLoop);
}

function updateGame(deltaTime) {
  // OPTIMIZATION #2: Services Lookup Cache - initialize cache on first run or after invalidation
  if (!servicesCacheInitialized) {
    servicesCache.input = gameSystemServices?.['input'];
    servicesCache.player = gameSystemServices?.['player'];
    servicesCache.enemies = gameSystemServices?.['enemies'];
    servicesCache.physics = gameSystemServices?.['physics'];
    servicesCache.combat = gameSystemServices?.['combat'];
    servicesCache['xp-orbs'] = gameSystemServices?.['xp-orbs'];
    servicesCache.healthHearts = gameSystemServices?.['healthHearts'];
    servicesCache.progression = gameSystemServices?.['progression'];
    servicesCache.world = gameSystemServices?.['world'];
    servicesCache.ui = gameSystemServices?.['ui'];
    servicesCacheInitialized = true;
  }

  // Use cached service references directly (10 direct lookups instead of forEach)
  if (servicesCache.input && typeof servicesCache.input.update === 'function') {
    servicesCache.input.update(deltaTime);
  }
  if (
    servicesCache.player &&
    typeof servicesCache.player.update === 'function'
  ) {
    servicesCache.player.update(deltaTime);
  }
  if (
    servicesCache.enemies &&
    typeof servicesCache.enemies.update === 'function'
  ) {
    servicesCache.enemies.update(deltaTime);
  }
  if (
    servicesCache.physics &&
    typeof servicesCache.physics.update === 'function'
  ) {
    servicesCache.physics.update(deltaTime);
  }
  if (
    servicesCache.combat &&
    typeof servicesCache.combat.update === 'function'
  ) {
    servicesCache.combat.update(deltaTime);
  }
  if (
    servicesCache['xp-orbs'] &&
    typeof servicesCache['xp-orbs'].update === 'function'
  ) {
    servicesCache['xp-orbs'].update(deltaTime);
  }
  if (
    servicesCache.healthHearts &&
    typeof servicesCache.healthHearts.update === 'function'
  ) {
    servicesCache.healthHearts.update(deltaTime);
  }
  if (
    servicesCache.progression &&
    typeof servicesCache.progression.update === 'function'
  ) {
    servicesCache.progression.update(deltaTime);
  }
  if (servicesCache.world && typeof servicesCache.world.update === 'function') {
    servicesCache.world.update(deltaTime);
  }
  if (servicesCache.ui && typeof servicesCache.ui.update === 'function') {
    servicesCache.ui.update(deltaTime);
  }
}

function renderGame() {
  if (!gameState.ctx) return;

  const renderer = gameSystemServices?.['renderer'];
  if (renderer && typeof renderer.render === 'function') {
    performanceMonitor.startMeasure('render');
    renderer.render(gameState.ctx);
    performanceMonitor.endMeasure('render');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void (async () => {
    bootstrapDebugLogging();
    await initializeDevStatsPanel();
    init();
  })();
});
