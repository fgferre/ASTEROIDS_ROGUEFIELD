import InputSystem from './modules/InputSystem.js';
import PlayerSystem from './modules/PlayerSystem.js';
import CombatSystem from './modules/CombatSystem.js';
import { EnemySystem } from './modules/EnemySystem.js';
import ProgressionSystem from './modules/ProgressionSystem.js';
import UISystem from './modules/UISystem.js';
import EffectsSystem from './modules/EffectsSystem.js';
import AudioSystem from './modules/AudioSystem.js';
import WorldSystem from './modules/WorldSystem.js';
import RenderingSystem from './modules/RenderingSystem.js';
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

function registerGameStateService() {
  if (typeof gameServices === 'undefined') return;

  gameServices.register('game-state', {
    isPaused: () => gameState.isPaused,
    getScreen: () => gameState.screen,
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

    const audioSystem = new AudioSystem();
    new InputSystem();
    new PlayerSystem();
    new CombatSystem();
    new EnemySystem();
    new ProgressionSystem();
    new UISystem();
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
    if (event.target.id === 'start-game-btn') {
      event.preventDefault();
      startGame();
    } else if (event.target.id === 'restart-game-btn') {
      event.preventDefault();
      startGame();
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

function startGame() {
  try {
    const player = gameServices.get('player');
    if (player?.reset) player.reset();

    const combat = gameServices.get('combat');
    if (combat?.reset) combat.reset();

    const enemies = gameServices.get('enemies');
    if (enemies?.reset) enemies.reset();

    const progression = gameServices.get('progression');
    if (progression?.reset) progression.reset();

    const effects = gameServices.get('effects');
    if (effects?.reset) effects.reset();

    const world = gameServices.get('world');
    if (world?.reset) world.reset();

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

function gameLoop(currentTime) {
  if (!gameState.initialized) return;

  const deltaTime = Math.min((currentTime - gameState.lastTime) / 1000, 0.016);
  gameState.lastTime = currentTime;

  try {
    const shouldUpdateGame =
      gameState.screen === 'playing' && !gameState.isPaused;

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
    'combat',
    'enemies',
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
