import { GamePools } from './core/GamePools.js';
import {
  debugLog,
  resolveDebugPreference,
  applyDebugPreference,
} from './core/debugLogging.js';
import {
  PerformanceMonitor,
  downloadJSON,
  statsRequestedByUrl,
} from './utils/PerformanceMonitor.js';
import { createFixedStepper } from './core/fixedStep.js';
import { IS_DEV } from './core/env.js';
import { serialize } from './core/replay.js';
import { bootstrapServices } from './bootstrap/bootstrapServices.js';
import { mobileGuard } from './bootstrap/mobileGuard.js';
import { getRendererMode } from './modules/render3d/rendererMode.js';
import {
  activateProfileHarness,
  startRun,
} from './bootstrap/profileHarness.js';
import {
  createReplayController,
  fetchRecording,
  getReplayUrl,
} from './bootstrap/replaySession.js';
import {
  DEFAULT_POOL_CONFIG,
  DEFAULT_GC_OPTIONS,
} from './bootstrap/serviceManifest.js';
import { installMathRandomGuard } from './utils/dev/mathRandomGuard.js';
import GameSessionService from './services/GameSessionService.js';
import { GameDebugLogger } from './utils/dev/GameDebugLogger.js';

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

// Simulation runs in fixed 1/60 s steps; render once per animation frame.
const fixedStepper = createFixedStepper();
// Fixed steps simulated since boot; recordings index input by it.
let simulationStep = 0;
let replayController = null;

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
  pickups: null,
  progression: null,
  world: null,
  ui: null,
};
let servicesCacheInitialized = false;

const DEV_MODE = IS_DEV;

// The loading bar's last stretch: the 3D renderer compiles its shaders
// (Renderer3D.warmUp) after the menu's preload, before the menu shows.
const WARM_UP_SHARE = 0.4;

function holdLoadingForWarmUp(menu, renderer) {
  const { onProgress, onComplete } = menu.loadingState;
  menu.setLoadingCallbacks(
    (progress, message) => onProgress(progress * (1 - WARM_UP_SHARE), message),
    async () => {
      const start = performance.now();
      try {
        await renderer.warmUp((done) =>
          onProgress(
            1 - WARM_UP_SHARE + done * WARM_UP_SHARE,
            'Compiling shaders'
          )
        );
        performance.measure('renderer-warm-up', { start });
      } finally {
        onComplete();
      }
    }
  );
}

function initializeDependencyInjection(manifestContext) {
  debugLog('[App] Initializing Dependency Injection system...');

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

      debugLog('[App] ℹ Auto-logging enabled (logs saved to localStorage)');
      debugLog('[App] ℹ Performance overlay enabled (F3 to toggle)');
    }

    debugLog('[App] ✓ DI system initialized successfully');
    debugLog(
      `[App] ✓ ${diContainer.getServiceNames().length} services registered`
    );
    debugLog('[App] ℹ DIContainer serves as unified service registry');

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

function installStatsShortcut() {
  if (statsRequestedByUrl(window.location.search)) {
    performanceMonitor.showOverlay();
  }
  window.addEventListener('keydown', (event) => {
    if (event.key === 'F8') {
      event.preventDefault();
      performanceMonitor.toggleOverlay();
    }
  });
}

function installReplayDownloadShortcut() {
  window.addEventListener('keydown', (event) => {
    const recorder = gameSessionService?.replayRecorder;
    if (event.key !== 'F9' || !recorder) {
      return;
    }
    event.preventDefault();
    const recording = recorder.toJSON();
    downloadJSON(
      `roguefield-replay-${recording.seed}.json`,
      serialize(recording)
    );
  });
}

function init(recording = null) {
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
      throw new Error('Canvas not found');
    }

    gameState.gameUI = document.getElementById('game-ui');
    // The 3D renderer takes the canvas for WebGL: a 2D context would lock it.
    gameState.rendererMode = getRendererMode();
    if (gameState.rendererMode === '2d') {
      gameState.ctx = gameState.canvas.getContext('2d');
      if (!gameState.ctx) {
        throw new Error('2D context unavailable');
      }
    }

    const { seed: initialSeed, source: seedSource } = recording
      ? { seed: recording.seed, source: 'replay' }
      : gameState.randomSeedSource === 'profile-harness'
        ? { seed: gameState.randomSeed, source: gameState.randomSeedSource }
        : GameSessionService.deriveInitialSeed();
    const seedInfo = { seed: initialSeed, source: seedSource };
    gameState.randomSeed = initialSeed;
    gameState.randomSeedSource = seedSource;
    if (DEV_MODE) {
      console.info(`[Seed] using ${initialSeed} (${seedSource})`);
    }

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
      rendererMode: gameState.rendererMode,
    };

    // Initialize DI system first (Phase 2.1)
    const diInitialized = initializeDependencyInjection(manifestContext);

    // Early exit if DI bootstrap failed
    if (!diInitialized) {
      if (DEV_MODE) {
        GameDebugLogger.log('ERROR', 'DI bootstrap failed; aborting init');
      }
      alert('Service initialization failed. Reload the page.');

      return;
    }

    const { services } = bootstrapServices({
      container: diContainer,
      manifestContext,
    });

    // Store services for use in game loop
    gameSystemServices = services;

    if (gameState.rendererMode === '3d') {
      holdLoadingForWarmUp(services['menu-background'], services.renderer);
    }

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
        'pickups',
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

    replayController = createReplayController({
      eventBus: diContainer.resolve('event-bus'),
      input: services['input'],
      session: gameSessionService,
      progression: services['progression'],
      ui,
      getStep: () => simulationStep,
    });
    if (recording) {
      replayController.arm(recording);
      ui.onboardingDisabled = true;
      void startRun(services['enemies']);
    }
    if (DEV_MODE) {
      installReplayDownloadShortcut();
      installStatsShortcut();
    }

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
            servicesCacheInitialized = false;
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
      debugLog('[App] Warming up render caches...');
      if (typeof RenderComponent.warmup === 'function') {
        RenderComponent.warmup();
      }
      if (typeof warmupProjectileCache === 'function') {
        warmupProjectileCache();
      }
      debugLog('[App] Render caches warmed up.');
    } catch (e) {
      console.warn('[App] Cache warmup failed (non-fatal):', e);
    }

    requestAnimationFrame(gameLoop);
  } catch (error) {
    console.error('Erro na inicialização:', error);
    alert('Game failed to start. Reload the page.');
  }
}

function gameLoop(currentTime) {
  if (!gameState.initialized) return;

  // Start performance monitoring
  performanceMonitor.startFrame();

  const frameSeconds =
    gameState.lastTime > 0 ? (currentTime - gameState.lastTime) / 1000 : 0;
  gameState.lastTime = currentTime;

  try {
    replayController.tick();

    const currentScreen = gameSessionService.getScreen();
    const shouldUpdateGame = gameSessionService.isRunning();

    const shouldRenderGame = gameState.gameUI
      ? !gameState.gameUI.classList.contains('hidden')
      : currentScreen === 'playing' || currentScreen === 'gameover';

    const effects = gameSystemServices?.['effects'];
    const stepSeconds = fixedStepper.step;

    if (shouldUpdateGame) {
      const steps = fixedStepper.advance(frameSeconds);
      // Stop mid-frame when a step pauses the run (level-up, pause): the
      // remaining steps must not depend on how frames were batched.
      for (let i = 0; i < steps && gameSessionService.isRunning(); i += 1) {
        GamePools.update(stepSeconds);
        garbageCollectionManager.update(stepSeconds);
        // Effects own freeze frames and time dilation: they return the
        // simulation delta the game systems should actually advance by.
        const adjustedDelta = effects.update(stepSeconds);
        updateGame(adjustedDelta);
        simulationStep += 1;
        // Renderer3D keeps each step's poses to interpolate between them.
        gameSystemServices.renderer.snapshot?.();
      }
    } else {
      fixedStepper.reset();
      effects.update(0);
    }

    // OPTIMIZATION #1: PerformanceMonitor Cache - recalculate only every 5 frames
    if (shouldUpdateGame) {
      if (metricsCacheFrameCount % 5 === 0 || metricsCache === null) {
        const enemies = gameSystemServices?.['enemies'];
        const combat = gameSystemServices?.['combat'];
        const xpOrbs = gameSystemServices?.['xp-orbs'];
        const effects = gameSystemServices?.['effects'];
        const projectilePerf = combat.getProjectilePerfSnapshot();

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
      // Paused, the last step is what stays on screen.
      renderGame(shouldUpdateGame ? fixedStepper.alpha : 1);
      if (shouldUpdateGame) {
        // Renderer3D's automatic quality preset follows the frame rate.
        gameSystemServices.renderer.quality?.update(
          frameSeconds,
          performanceMonitor.getAverageFrameInterval()
        );
      }
    }

    // Capture render timing AFTER render completes
    if (shouldUpdateGame && metricsCacheFrameCount % 5 === 1) {
      const combat = gameSystemServices?.['combat'];
      const projectilePerf = combat.getProjectilePerfSnapshot();
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
    servicesCache.pickups = gameSystemServices?.['pickups'];
    servicesCache.progression = gameSystemServices?.['progression'];
    servicesCache.world = gameSystemServices?.['world'];
    servicesCache.ui = gameSystemServices?.['ui'];
    servicesCacheInitialized = true;
  }

  // Use cached service references directly (10 direct lookups instead of forEach).
  // The manifest guarantees every one of these services and its update().
  servicesCache.input.update(deltaTime);
  servicesCache.player.update(deltaTime);
  servicesCache.enemies.update(deltaTime);
  servicesCache.physics.update(deltaTime);
  servicesCache.combat.update(deltaTime);
  servicesCache['xp-orbs'].update(deltaTime);
  servicesCache.healthHearts.update(deltaTime);
  servicesCache.pickups.update(deltaTime);
  servicesCache.progression.update(deltaTime);
  servicesCache.world.update(deltaTime);
  servicesCache.ui.update(deltaTime);
}

function renderGame(alpha) {
  if (gameState.rendererMode === '2d' && !gameState.ctx) return;

  performanceMonitor.startMeasure('render');
  gameSystemServices.renderer.render(gameState.ctx, alpha);
  performanceMonitor.endMeasure('render');
}

document.addEventListener('DOMContentLoaded', () => {
  void (async () => {
    bootstrapDebugLogging();

    // A11Y-08: BLOCK on touch devices unless ?desktop=force override is present.
    // Writes Canvas2D notice on the blocked path; no DI / no Three.js / no Web Audio.
    const guard = mobileGuard();
    if (guard.blocked) {
      return;
    }

    // INFRA-01: ?profile=<scenario> activates the in-browser performance harness.
    // No-op when the URL flag is absent. Mutates gameState.randomSeed when active.
    activateProfileHarness({
      gameState,
      performanceMonitor,
      getServices: () => gameSystemServices,
    });

    // ?replay=<url>: the recording's seed must be known before init().
    const replayUrl = getReplayUrl();
    let recording = null;
    if (replayUrl) {
      try {
        recording = await fetchRecording(replayUrl);
      } catch (error) {
        console.error('[replay] Could not load recording:', error);
      }
    }

    init(recording);
  })();
});
