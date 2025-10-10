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

const RANDOM_STORAGE_KEYS = {
  override: 'roguefield.seedOverride',
  last: 'roguefield.lastSeed'
};

function parseSeedCandidate(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  return trimmed;
}

function persistLastSeed(seed, source) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(
      RANDOM_STORAGE_KEYS.last,
      JSON.stringify({
        seed: typeof seed === 'number' ? seed : String(seed),
        source: source || 'unknown',
        timestamp: Date.now()
      })
    );
  } catch (error) {
    console.warn('[Random] Failed to persist last seed snapshot:', error);
  }
}

function deriveInitialSeed() {
  let source = 'crypto';
  let seed = null;

  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('seed');
      const parsedUrlSeed = parseSeedCandidate(fromUrl);
      if (parsedUrlSeed !== null) {
        source = 'url';
        seed = parsedUrlSeed;
        return { seed, source };
      }
    } catch (error) {
      console.warn('[Random] Failed to parse seed from URL:', error);
    }

    try {
      const storage = window.localStorage;
      if (storage) {
        const override = storage.getItem(RANDOM_STORAGE_KEYS.override);
        const parsedOverride = parseSeedCandidate(override);
        if (parsedOverride !== null) {
          source = 'localStorage';
          seed = parsedOverride;
          return { seed, source };
        }
      }
    } catch (error) {
      console.warn('[Random] Failed to read seed override from localStorage:', error);
    }

    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const buffer = new Uint32Array(1);
      window.crypto.getRandomValues(buffer);
      seed = buffer[0];
      return { seed, source };
    }
  }

  source = 'math-random';
  seed = Math.floor(Math.random() * 0xffffffff);
  return { seed, source };
}

function logRandomSnapshot(scope, snapshot, { mode = 'reset' } = {}) {
  if (!snapshot) {
    return;
  }

  const { seed, state } = snapshot;
  const stateHex = typeof state === 'number' ? `0x${state.toString(16).padStart(8, '0')}` : state;
  console.log(`[Random] ${scope} (${mode}) → seed=${seed} state=${stateHex}`);
}

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

function prepareRandomForScope(scope, { mode = 'reset', snapshot } = {}) {
  const random = getRandomService();

  if (!random || typeof random.serialize !== 'function') {
    console.warn(`[Random] Cannot prepare RNG for scope "${scope}" - service unavailable.`);
    return null;
  }

  if (mode === 'restore' && snapshot) {
    try {
      random.restore(snapshot);
    } catch (error) {
      console.warn(`[Random] Failed to restore RNG snapshot for scope "${scope}":`, error);
      random.reset(gameState.randomSeed);
      mode = 'reset';
    }
  } else {
    random.reset(gameState.randomSeed);
  }

  const currentSnapshot = random.serialize();
  gameState.randomSnapshot = currentSnapshot;
  gameState.randomScope = scope;
  logRandomSnapshot(scope, currentSnapshot, { mode });
  return random;
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
  if (manageRandom) {
    prepareRandomForScope('systems.reset', { mode: 'reset' });
  } else {
    logRandomSnapshot('systems.reset (pre-managed)', gameState.randomSnapshot, {
      mode: 'snapshot'
    });
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

function createDeathSnapshot() {
  const player = gameServices.get('player');
  const enemies = gameServices.get('enemies');
  const physics = gameServices.get('physics');
  const progression = gameServices.get('progression');

  if (!player || !enemies || !physics || !progression) return;

  const random = getRandomService();
  const randomSnapshot = random && typeof random.serialize === 'function'
    ? random.serialize()
    : gameState.randomSnapshot;
  if (randomSnapshot) {
    gameState.randomSnapshot = randomSnapshot;
    logRandomSnapshot('death.snapshot', randomSnapshot, { mode: 'snapshot' });
  }

  gameState.deathSnapshot = {
    // Player state (excluding health - will be restored to max)
    player: {
      maxHealth: player.maxHealth || 100,
      upgrades: player.upgrades ? [...player.upgrades] : [],
      position: player.position ? { ...player.position } : null,
    },
    // Progression state
    progression: {
      level: progression.level || 1,
      experience: progression.experience || 0,
      experienceNeeded: progression.experienceNeeded || 100,
    },
    // Enemy state (asteroids, enemies)
    enemies: enemies.getSnapshotState ? enemies.getSnapshotState() : null,
    // Physics state (asteroids positions)
    physics: physics.getSnapshotState ? physics.getSnapshotState() : null,
    // Timestamp
    timestamp: Date.now(),
    randomSeed: gameState.randomSeed,
    random: randomSnapshot,
  };

  console.log('[Retry] Death snapshot created', gameState.deathSnapshot);
}

function restoreFromSnapshot() {
  if (!gameState.deathSnapshot) {
    console.warn('[Retry] No snapshot available');
    return false;
  }

  const player = gameServices.get('player');
  const enemies = gameServices.get('enemies');
  const physics = gameServices.get('physics');
  const progression = gameServices.get('progression');

  if (!player || !enemies || !physics || !progression) return false;

  const snapshot = gameState.deathSnapshot;

  if (snapshot.random) {
    prepareRandomForScope('snapshot.restore', { mode: 'restore', snapshot: snapshot.random });
  } else {
    prepareRandomForScope('snapshot.restore', { mode: 'reset' });
  }

  // Restore player (with FULL health)
  if (snapshot.player) {
    player.maxHealth = snapshot.player.maxHealth;
    player.health = snapshot.player.maxHealth; // FULL HEALTH on retry
    player.upgrades = snapshot.player.upgrades ? [...snapshot.player.upgrades] : [];
    if (snapshot.player.position) {
      player.position.x = snapshot.player.position.x;
      player.position.y = snapshot.player.position.y;
    }
  }

  // Restore progression
  if (snapshot.progression && typeof progression.restoreState === 'function') {
    progression.restoreState(snapshot.progression);
  }

  // Restore enemies
  if (snapshot.enemies && typeof enemies.restoreSnapshotState === 'function') {
    enemies.restoreSnapshotState(snapshot.enemies);
  }

  // Restore physics
  if (snapshot.physics && typeof physics.restoreSnapshotState === 'function') {
    physics.restoreSnapshotState(snapshot.physics);
  }

  console.log('[Retry] Game state restored from snapshot');
  return true;
}

function findSafeSpawnPoint() {
  const fallbackCenter = {
    x: CONSTANTS.GAME_WIDTH / 2,
    y: CONSTANTS.GAME_HEIGHT / 2,
  };

  const enemies = gameServices.get('enemies');
  const canvas = gameState.canvas;

  if (!enemies || !canvas) {
    return fallbackCenter;
  }

  const asteroids = enemies.getAsteroids ? enemies.getAsteroids() : [];
  const safeDistance =
    CONSTANTS.PLAYER_SAFE_SPAWN_DISTANCE ??
    CONSTANTS.DEFAULT_SAFE_SPAWN_DISTANCE ??
    300;

  // Try center first
  const center = canvas
    ? { x: canvas.width / 2, y: canvas.height / 2 }
    : fallbackCenter;
  let isSafe = asteroids.every(ast => {
    const dx = ast.x - center.x;
    const dy = ast.y - center.y;
    return Math.sqrt(dx * dx + dy * dy) > safeDistance;
  });

  if (isSafe) return center;

  // Try quadrants
  const quadrants = [
    { x: canvas.width * 0.25, y: canvas.height * 0.25 },
    { x: canvas.width * 0.75, y: canvas.height * 0.25 },
    { x: canvas.width * 0.25, y: canvas.height * 0.75 },
    { x: canvas.width * 0.75, y: canvas.height * 0.75 },
  ];

  for (const point of quadrants) {
    isSafe = asteroids.every(ast => {
      const dx = ast.x - point.x;
      const dy = ast.y - point.y;
      return Math.sqrt(dx * dx + dy * dy) > safeDistance;
    });
    if (isSafe) return point;
  }

  // Fallback to center (even if not safe)
  return center || fallbackCenter;
}

function startRetryCountdown() {
  // Hide game over screen
  const gameoverScreen = document.getElementById('gameover-screen');
  if (gameoverScreen) {
    gameoverScreen.classList.add('hidden');
  }

  // Make sure game-ui is visible during countdown
  const gameUI = document.getElementById('game-ui');
  if (gameUI) {
    gameUI.classList.remove('hidden');
  }

  // Mark player as retrying
  const player = gameServices.get('player');
  if (player) {
    player.isRetrying = true;
  }

  // Show countdown: 3, 2, 1
  showCountdownNumber(3, () => {
    showCountdownNumber(2, () => {
      showCountdownNumber(1, () => {
        // Countdown done - respawn player
        executeRetryRespawn();
      });
    });
  });
}

function showCountdownNumber(number, onComplete) {
  // Create/get countdown element
  let countdown = document.getElementById('retry-countdown');
  if (!countdown) {
    countdown = document.createElement('div');
    countdown.id = 'retry-countdown';
    countdown.className = 'wave-countdown';
    document.body.appendChild(countdown);
  }

  countdown.textContent = number.toString();
  countdown.classList.remove('hidden');

  // Hide after 1 second and call onComplete
  setTimeout(() => {
    countdown.classList.add('hidden');
    setTimeout(onComplete, 100); // Small delay between numbers
  }, 900);
}

function executeRetryRespawn() {
  const snapshot = gameState.deathSnapshot;
  if (snapshot?.random) {
    prepareRandomForScope('retry.respawn', { mode: 'restore', snapshot: snapshot.random });
  } else {
    prepareRandomForScope('retry.respawn', { mode: 'reset' });
  }

  const player = gameServices.get('player');
  const world = gameServices.get('world');

  if (!player || !world) {
    console.error('[Retry] Cannot respawn - missing services');
    return;
  }

  // Find safe spawn point
  const safeSpawn = findSafeSpawnPoint();

  // Restore snapshot state
  if (!restoreFromSnapshot()) {
    console.error('[Retry] Failed to restore snapshot');
    return;
  }

  // Respawn player at safe location with invulnerability
  player.respawn(safeSpawn, 3);

  // Reset world state
  world.reset();

  // Hide gameover screen and countdown, show game
  const gameoverScreen = document.getElementById('gameover-screen');
  if (gameoverScreen) {
    gameoverScreen.classList.add('hidden');
  }

  const countdown = document.getElementById('retry-countdown');
  if (countdown) {
    countdown.classList.add('hidden');
  }

  const gameUI = document.getElementById('game-ui');
  if (gameUI) {
    gameUI.classList.remove('hidden');
  }
}

function init() {
  try {
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

    const { seed: initialSeed, source: seedSource } = deriveInitialSeed();
    gameState.randomSeed = initialSeed;
    gameState.randomSeedSource = seedSource;
    persistLastSeed(initialSeed, seedSource);
    console.log(`[Random] Boot seed (${seedSource}): ${String(initialSeed)}`);

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

    const bootRandom = prepareRandomForScope('bootstrap', { mode: 'reset' });
    if (bootRandom) {
      persistLastSeed(gameState.randomSnapshot?.seed ?? initialSeed, seedSource);
    }

    const ui = services['ui'] || gameServices.get('ui');
    if (ui) ui.showScreen('menu');

    gameState.initialized = true;

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
      const retryCountEl = document.getElementById('retry-count');
      const currentRetries = parseInt(retryCountEl?.textContent || '0');
      if (currentRetries > 0 && gameState.deathSnapshot) {
        retryCountEl.textContent = '0';
        button.disabled = true;
        button.style.opacity = '0.5';

        // Start retry flow with countdown
        startRetryCountdown();
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

  gameEvents.on('player-died', () => {
    // DON'T change screen immediately - let explosion animate!
    // UISystem will change screen to 'gameover' after 3s delay
    if (gameState.isPaused) {
      gameState.isPaused = false;
      emitPauseState();
    }

    // Create snapshot for retry system
    createDeathSnapshot();
  });

  gameEvents.on('toggle-pause', () => {
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
    prepareRandomForScope('run.start', { mode: 'reset' });
    gameState.deathSnapshot = null;

    resetGameSystems({ manageRandom: false });

    const audio = gameServices.get('audio');
    if (audio?.init) audio.init();

    const ui = gameServices.get('ui');
    if (ui) ui.showGameUI();

    // Reset retry count to 1 for new game
    const retryCountEl = document.getElementById('retry-count');
    if (retryCountEl) {
      retryCountEl.textContent = '1';
    }

    const retryBtn = document.getElementById('retry-game-btn');
    if (retryBtn) {
      retryBtn.disabled = false;
      retryBtn.style.opacity = '1';
    }

    gameState.screen = 'playing';
    gameState.isPaused = false;
    emitPauseState();
    gameState.lastTime = performance.now();

    console.log('Jogo iniciado com sucesso!');
  } catch (error) {
    console.error('Erro ao iniciar jogo:', error);
  }
}

function exitToMenu(payload = {}) {
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
        performExitToMenu(payload);
      }, 3500); // 3.5s to see full explosion
      return;
    } else {
      performExitToMenu(payload);
    }
  } catch (error) {
    console.error('Erro ao sair para o menu:', error);
    performExitToMenu(payload); // Fallback
  }
}

function performExitToMenu(payload = {}) {
  try {
    prepareRandomForScope('menu.exit', { mode: 'reset' });
    resetGameSystems({ manageRandom: false });

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
