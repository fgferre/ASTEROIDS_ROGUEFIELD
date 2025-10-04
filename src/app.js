import SettingsSystem from './modules/SettingsSystem.js';
import InputSystem from './modules/InputSystem.js';
import PlayerSystem from './modules/PlayerSystem.js';
import CombatSystem from './modules/CombatSystem.js';
import { EnemySystem } from './modules/EnemySystem.js';
import PhysicsSystem from './modules/PhysicsSystem.js';
import XPOrbSystem from './modules/XPOrbSystem.js';
import ProgressionSystem from './modules/ProgressionSystem.js';
import UISystem from './modules/UISystem.js';
import EffectsSystem from './modules/EffectsSystem.js';
import AudioSystem from './modules/AudioSystem.js';
import WorldSystem from './modules/WorldSystem.js';
import RenderingSystem from './modules/RenderingSystem.js';
import MenuBackgroundSystem from './modules/MenuBackgroundSystem.js';
import { GamePools } from './core/GamePools.js';
import { GarbageCollectionManager } from './core/GarbageCollectionManager.js';
import {
  resolveDebugPreference,
  applyDebugPreference,
} from './core/debugLogging.js';
import { PerformanceMonitor } from './utils/PerformanceMonitor.js';

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
};

const garbageCollectionManager = new GarbageCollectionManager({
  defaultInterval: 4500,
  idleTimeout: 120,
  maxTasksPerFrame: 2,
});

// Performance monitoring (Week 1: Balance & Feel)
const performanceMonitor = new PerformanceMonitor();

// Initialize DI Container (Phase 2.1)
let diContainer = null;

function initializeDependencyInjection() {
  console.log('[App] Initializing Dependency Injection system...');

  try {
    // Create DI container
    diContainer = new DIContainer();
    diContainer.verbose = false; // Keep it quiet in production

    // Register all services
    ServiceRegistry.setupServices(diContainer);

    // IMPORTANT: Don't replace gameServices yet!
    // Systems need to register themselves first using the original ServiceLocator
    // The adapter will be enabled in Phase 2.2+ when systems use constructor injection

    // Just expose container for debugging
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      window.diContainer = diContainer;
      window.performanceMonitor = performanceMonitor;

      // Enable auto-logging every 10 seconds
      performanceMonitor.enableAutoLog(10000);

      console.log('[App] ℹ Performance monitor available: window.performanceMonitor');
      console.log('[App] ℹ Auto-logging enabled (logs saved to localStorage)');
      console.log('[App] ℹ Get logs: localStorage.getItem("performanceLog")');
    }

    console.log('[App] ✓ DI system initialized successfully');
    console.log(`[App] ✓ ${diContainer.getServiceNames().length} services registered`);
    console.log('[App] ℹ ServiceLocator adapter will be enabled in Phase 2.2');

    return true;
  } catch (error) {
    console.error('[App] ✗ Failed to initialize DI system:', error);
    console.warn('[App] Falling back to legacy ServiceLocator');
    return false;
  }
}

function registerGameStateService() {
  if (typeof gameServices === 'undefined') return;

  gameServices.register('game-state', {
    isPaused: () => gameState.isPaused,
    getScreen: () => gameState.screen,
  });
}

function resetGameSystems() {
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
  const enemies = gameServices.get('enemies');
  if (!enemies) return { x: CONSTANTS.GAME_WIDTH / 2, y: CONSTANTS.GAME_HEIGHT / 2 };

  const asteroids = enemies.getAsteroids ? enemies.getAsteroids() : [];
  const canvas = gameState.canvas;
  const safeDistance = 300; // Minimum distance from any asteroid

  // Try center first
  const center = { x: canvas.width / 2, y: canvas.height / 2 };
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
  return center;
}

function startRetryCountdown() {
  console.log('[Retry] Starting countdown...');

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
    console.log('[Retry] Player marked as retrying');
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
  console.log(`[Retry] Showing countdown: ${number}`);

  // Create/get countdown element
  let countdown = document.getElementById('retry-countdown');
  if (!countdown) {
    countdown = document.createElement('div');
    countdown.id = 'retry-countdown';
    countdown.className = 'wave-countdown';
    document.body.appendChild(countdown);
    console.log('[Retry] Created countdown element');
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
  console.log('[Retry] Starting respawn sequence...');

  const player = gameServices.get('player');
  const world = gameServices.get('world');

  if (!player || !world) {
    console.error('[Retry] Cannot respawn - missing services');
    return;
  }

  // Find safe spawn point
  const safeSpawn = findSafeSpawnPoint();
  console.log('[Retry] Safe spawn point:', safeSpawn);

  // Restore snapshot state
  if (!restoreFromSnapshot()) {
    console.error('[Retry] Failed to restore snapshot');
    return;
  }
  console.log('[Retry] Snapshot restored');

  // Respawn player at safe location with invulnerability
  player.respawn(safeSpawn, 3);
  console.log('[Retry] Player respawned');

  // Reset world state
  world.reset();
  console.log('[Retry] World reset');

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

  console.log('[Retry] Respawn complete - game resumed');
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

    // Initialize DI system first (Phase 2.1)
    const diInitialized = initializeDependencyInjection();

    registerGameStateService();

    // Initialize object pools before any game systems
    GamePools.initialize({
      bullets: { initial: 25, max: 120 },
      particles: { initial: 60, max: 400 },
      asteroids: { initial: 20, max: 100 },
      xpOrbs: { initial: 40, max: 250 },
      shockwaves: { initial: 8, max: 25 },
      tempObjects: { initial: 15, max: 60 }
    });

    garbageCollectionManager.initialize();
    garbageCollectionManager.registerPeriodicTask(
      'pool-auto-manage',
      () => GamePools.autoManageAll(),
      { interval: 5000, priority: 2, runImmediately: true }
    );
    garbageCollectionManager.registerPeriodicTask(
      'temp-pool-trim',
      () => {
        const tempPool = GamePools.tempObjects;
        if (tempPool && typeof tempPool.autoManage === 'function') {
          tempPool.autoManage({ targetUtilization: 0.55, maxShrinkage: 10, maxExpansion: 6 });
        }
      },
      { interval: 7000, priority: 1 }
    );

    // Initialize game systems
    // Note: Systems still register themselves with gameServices internally
    // DI integration will be gradual in Phase 2.2+
    new SettingsSystem();

    const audioSystem = new AudioSystem();
    new InputSystem();
    new PlayerSystem();
    new EnemySystem();
    new PhysicsSystem();
    new CombatSystem();
    new XPOrbSystem();
    new ProgressionSystem();
    new UISystem();
    new MenuBackgroundSystem();
    new EffectsSystem(audioSystem);
    new WorldSystem();
    new RenderingSystem();

    const ui = gameServices.get('ui');
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
    resetGameSystems();

    const audio = gameServices.get('audio');
    if (audio?.init) audio.init();

    const ui = gameServices.get('ui');
    if (ui) ui.showGameUI();

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
    resetGameSystems();

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
    garbageCollectionManager.update(deltaTime);

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
