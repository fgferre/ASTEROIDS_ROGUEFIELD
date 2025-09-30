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

const gameState = {
  screen: 'menu',
  isPaused: false,
  canvas: null,
  ctx: null,
  initialized: false,
  lastTime: 0,
};

const garbageCollectionManager = new GarbageCollectionManager({
  defaultInterval: 4500,
  idleTimeout: 120,
  maxTasksPerFrame: 2,
});

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
    gameState.screen = 'gameover';
    if (gameState.isPaused) {
      gameState.isPaused = false;
      emitPauseState();
    }
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

    renderGame();
  } catch (error) {
    console.error('Erro no game loop:', error);
  }

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
