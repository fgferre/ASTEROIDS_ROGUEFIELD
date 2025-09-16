// Importar constantes
import * as CONSTANTS from '/core/GameConstants.js';

// Imports dos módulos
import InputSystem from './modules/InputSystem.js';
import PlayerSystem from './modules/PlayerSystem.js';
import CombatSystem from './modules/CombatSystem.js';
import { EnemySystem } from './modules/EnemySystem.js';
import ProgressionSystem from './modules/ProgressionSystem.js';
import UISystem from './modules/UISystem.js';
import EffectsSystem from './modules/EffectsSystem.js';

// Destructuring das constantes mais usadas para compatibilidade
const {
  GAME_WIDTH,
  GAME_HEIGHT,
  SHIP_SIZE,
  BULLET_SIZE,
  XP_ORB_SIZE,
  SHIP_MASS,
} = CONSTANTS;

// Estado global do jogo - Estruturado
let gameState = {
  screen: 'menu',
  canvas: null,
  ctx: null,
  initialized: false,
};

// Sistema de áudio espacial robusto
class SpaceAudioSystem {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.initialized = false;
    this.sounds = new Map();
  }

  async init() {
    if (this.initialized) return;

    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      await this.context.resume();

      this.masterGain = this.context.createGain();
      this.masterGain.connect(this.context.destination);
      this.masterGain.gain.value = 0.25;
      this.initialized = true;
    } catch (error) {
      console.warn('Áudio não disponível:', error);
      this.initialized = false;
    }
  }

  safePlay(soundFunction) {
    if (!this.initialized || !this.context) return;

    try {
      if (this.context.state === 'suspended') {
        this.context.resume();
      }
      soundFunction();
    } catch (error) {
      console.warn('Erro ao reproduzir som:', error);
    }
  }

  playLaserShot() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.frequency.setValueAtTime(800, this.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        150,
        this.context.currentTime + 0.08
      );

      gain.gain.setValueAtTime(0.12, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.context.currentTime + 0.08
      );

      osc.start();
      osc.stop(this.context.currentTime + 0.08);
    });
  }

  playAsteroidBreak(size) {
    this.safePlay(() => {
      const baseFreq = size === 'large' ? 70 : size === 'medium' ? 110 : 150;
      const duration =
        size === 'large' ? 0.35 : size === 'medium' ? 0.25 : 0.18;

      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(baseFreq, this.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        baseFreq * 0.4,
        this.context.currentTime + duration
      );

      gain.gain.setValueAtTime(0.15, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.context.currentTime + duration
      );

      osc.start();
      osc.stop(this.context.currentTime + duration);
    });
  }

  playBigExplosion() {
    this.safePlay(() => {
      // Oscilador de baixa frequência
      const osc = this.context.createOscillator();
      const oscGain = this.context.createGain();
      osc.connect(oscGain);
      oscGain.connect(this.masterGain);

      // Ruído branco
      const bufferSize = this.context.sampleRate * 0.5;
      const noiseBuffer = this.context.createBuffer(
        1,
        bufferSize,
        this.context.sampleRate
      );
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const noise = this.context.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = this.context.createGain();
      noise.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      const now = this.context.currentTime;

      // Configurações do oscilador
      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);

      oscGain.gain.setValueAtTime(0.2, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      // Envelope do ruído
      noiseGain.gain.setValueAtTime(0.5, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      // Iniciar fontes
      osc.start(now);
      osc.stop(now + 0.5);

      noise.start(now);
      noise.stop(now + 0.4);
    });
  }

  playXPCollect() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.frequency.setValueAtTime(600, this.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        1200,
        this.context.currentTime + 0.12
      );

      gain.gain.setValueAtTime(0.08, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.context.currentTime + 0.12
      );

      osc.start();
      osc.stop(this.context.currentTime + 0.12);
    });
  }

  playLevelUp() {
    this.safePlay(() => {
      const frequencies = [440, 554, 659, 880, 1108];
      frequencies.forEach((freq, index) => {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();

        osc.connect(gain);
        gain.connect(this.masterGain);

        const startTime = this.context.currentTime + index * 0.06;
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.1, startTime + 0.04);
        gain.gain.linearRampToValueAtTime(0, startTime + 0.18);

        osc.start(startTime);
        osc.stop(startTime + 0.18);
      });
    });
  }

  playShipHit() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, this.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        40,
        this.context.currentTime + 0.3
      );

      gain.gain.setValueAtTime(0.2, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.context.currentTime + 0.3
      );

      osc.start();
      osc.stop(this.context.currentTime + 0.3);
    });
  }
}

// Sistema de inicialização com tratamento de erros
const audio = new SpaceAudioSystem();

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

    setupEventListeners();
    audio.init();

    // Inicializar sistemas modulares
    const inputSystem = new InputSystem();
    // Inicializar PlayerSystem
    const playerSystem = new PlayerSystem();
    // Inicializar CombatSystem
    const combatSystem = new CombatSystem();
    // Inicializar EnemySystem
    const enemySystem = new EnemySystem();
    // Inicializar ProgressionSystem
    const progressionSystem = new ProgressionSystem();
    // Inicializar UISystem
    const uiSystem = new UISystem();
    // Inicializar EffectsSystem
    const effectsSystem = new EffectsSystem(audio);

    // Listener para quando uma bala atinge um inimigo
    if (typeof gameEvents !== 'undefined') {
      gameEvents.on('bullet-hit', (data) => {
        if (data.killed) {
          const asteroid = data.enemy;
          if (asteroid.destroyed) return; // Prevenir processamento duplo

          const enemies = gameServices.get('enemies');
          if (enemies) {
            // O EnemySystem agora gerencia a destruição e fragmentação
            enemies.destroyAsteroid(data.enemy);
          }
        }
      });

      // NOVO listener para quando inimigos morrem (lógica desacoplada)
      gameEvents.on('enemy-destroyed', (data) => {
        if (typeof audio !== 'undefined') {
          audio.playAsteroidBreak(data.size);
          if (data.size === 'large') {
            audio.playBigExplosion();
          }
        }

        const effects =
          typeof gameServices !== 'undefined' && gameServices.has('effects')
            ? gameServices.get('effects')
            : null;
        if (effects && typeof effects.createAsteroidExplosion === 'function') {
          effects.createAsteroidExplosion(data.enemy);
        }
      });

      // Listeners para sistema de progressão
      gameEvents.on('player-leveled-up', (data) => {
        if (typeof audio !== 'undefined') {
          audio.playLevelUp();
        }

        const effects =
          typeof gameServices !== 'undefined' && gameServices.has('effects')
            ? gameServices.get('effects')
            : null;
        if (effects) {
          if (typeof effects.addScreenShake === 'function') {
            effects.addScreenShake(6, 0.4);
          }
          if (typeof effects.addFreezeFrame === 'function') {
            effects.addFreezeFrame(0.2, 0.4);
          }
          if (typeof effects.addScreenFlash === 'function') {
            effects.addScreenFlash('#FFD700', 0.15, 0.2);
          }
          if (typeof effects.createLevelUpExplosion === 'function') {
            const player = gameServices.get('player');
            if (player) {
              effects.createLevelUpExplosion(player.position);
            }
          }
        }
      });

      gameEvents.on('xp-collected', (data) => {
        if (typeof audio !== 'undefined') {
          audio.playXPCollect();
        }

        const effects =
          typeof gameServices !== 'undefined' && gameServices.has('effects')
            ? gameServices.get('effects')
            : null;
        if (effects && typeof effects.createXPCollectEffect === 'function') {
          effects.createXPCollectEffect(data.position.x, data.position.y);
        }
      });
      // Atualizar state de tela quando UI mudar
      gameEvents.on('screen-changed', (data) => {
        gameState.screen = data.screen;
      });
    }
    gameState.initialized = true;

    requestAnimationFrame(gameLoop);
  } catch (error) {
    console.error('Erro na inicialização:', error);
    alert('Erro ao inicializar o jogo. Recarregue a página.');
  }
}

function setupEventListeners() {
  // Button events - usando função de callback direta
  document.addEventListener('click', (e) => {
    if (e.target.id === 'start-game-btn') {
      e.preventDefault();
      startGame();
    } else if (e.target.id === 'restart-game-btn') {
      e.preventDefault();
      startGame();
    }
  });
}

function startGame() {
  try {
    console.log('Iniciando jogo...');
    const playerSystem = gameServices.get('player');
    if (playerSystem && typeof playerSystem.reset === 'function') {
      playerSystem.reset();
    }

    const combat = gameServices.get('combat');
    if (combat && typeof combat.reset === 'function') {
      combat.reset();
    }

    const enemies = gameServices.get('enemies');
    if (enemies && typeof enemies.reset === 'function') {
      enemies.reset();
    }

    const progression = gameServices.get('progression');
    if (progression && typeof progression.reset === 'function') {
      progression.reset();
    }

    const ui = gameServices.get('ui');
    if (ui) ui.showGameUI();

    audio.init();

    console.log('Jogo iniciado com sucesso!');
  } catch (error) {
    console.error('Erro ao iniciar jogo:', error);
  }
}

// UI management moved to UISystem

// Loop principal do jogo com tratamento de erros

let lastTime = 0;

function gameLoop(currentTime) {
  if (!gameState.initialized) return;

  let deltaTime = Math.min((currentTime - lastTime) / 1000, 0.016);
  lastTime = currentTime;

  const effects = gameServices.get('effects');
  if (effects) {
    deltaTime = effects.update(deltaTime);
  }

  try {
    if (gameState.screen === 'playing') {
      updateGame(deltaTime);
      renderGame();
    }
  } catch (error) {
    console.error('Erro no game loop:', error);
  }

  requestAnimationFrame(gameLoop);
}

function updateGame(deltaTime) {
  const input = gameServices.get('input');
  if (input && typeof input.update === 'function') {
    input.update(deltaTime);
  }

  const player = gameServices.get('player');
  let playerStats = null;
  if (player && typeof player.update === 'function') {
    player.update(deltaTime);
    playerStats = player.getStats();
  }

  const combat = gameServices.get('combat');
  if (combat && playerStats) {
    combat.update(deltaTime, playerStats);
  }

  const enemies = gameServices.get('enemies');
  if (enemies && typeof enemies.update === 'function') {
    enemies.update(deltaTime);
  }

  const progression = gameServices.get('progression');
  if (progression && typeof progression.update === 'function') {
    progression.update(deltaTime);
  }

  checkCollisions();

  const ui = gameServices.get('ui');
  if (ui && typeof ui.updateHUD === 'function') {
    ui.updateHUD();
  }
}

// Detecção de colisão melhorada
function checkCollisions() {
  const player = gameServices.get('player');
  const enemies = gameServices.get('enemies');
  if (!player || !enemies) return;

  // A lógica de colisão de projéteis agora é gerenciada pelo CombatSystem.

  // Colisões nave-asteroide
  enemies.getAsteroids().forEach((asteroid) => {
    if (asteroid.destroyed) return;

    const dx = player.position.x - asteroid.x;
    const dy = player.position.y - asteroid.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < SHIP_SIZE + asteroid.radius) {
      const nx = dx / Math.max(distance, 1);
      const ny = dy / Math.max(distance, 1);
      const overlap = SHIP_SIZE + asteroid.radius - distance;
      if (overlap > 0) {
        player.position.x += nx * overlap * 0.5;
        player.position.y += ny * overlap * 0.5;
        asteroid.x -= nx * overlap * 0.5;
        asteroid.y -= ny * overlap * 0.5;
      }
      const rvx = asteroid.vx - player.velocity.vx;
      const rvy = asteroid.vy - player.velocity.vy;
      const velAlongNormal = rvx * nx + rvy * ny;
      if (velAlongNormal < 0) {
        const e = 0.2; // colisão menos elástica com a nave
        const invMass1 = 1 / SHIP_MASS;
        const invMass2 = 1 / asteroid.mass;
        const j = (-(1 + e) * velAlongNormal) / (invMass1 + invMass2);
        const jx = j * nx;
        const jy = j * ny;
        player.velocity.vx -= jx * invMass1;
        player.velocity.vy -= jy * invMass1;
        asteroid.vx += jx * invMass2;
        asteroid.vy += jy * invMass2;
      }

      if (player.invulnerableTimer <= 0) {
        const relSpeed = Math.sqrt(
          (asteroid.vx - player.velocity.vx) ** 2 +
            (asteroid.vy - player.velocity.vy) ** 2
        );
        const baseDamage = 12;
        const momentumFactor = (asteroid.mass * relSpeed) / 120;
        const rawDamage = baseDamage + momentumFactor;
        const damage = Math.max(3, Math.floor(rawDamage) - player.armor);
        const remaining = player.takeDamage(damage);
        player.invulnerableTimer = 0.5;

        audio.playShipHit();

        const effects = gameServices.get('effects');
        if (effects && typeof effects.addScreenShake === 'function') {
          effects.addScreenShake(8, 0.3);
        }

        if (remaining <= 0) {
          gameOver();
        }
      }
    }
  });
}

function gameOver() {
  const progression = gameServices.get('progression');
  const enemies = gameServices.get('enemies');

  const data = {
    player: { level: progression ? progression.getLevel() : 1 },
    stats: enemies ? enemies.getSessionStats() : { totalKills: 0, timeElapsed: 0 },
    wave: enemies ? enemies.getWaveState() : { completedWaves: 0 },
  };

  if (typeof gameEvents !== 'undefined') {
    gameEvents.emit('player-died', data);
  }

  if (enemies && typeof enemies.stop === 'function') {
    enemies.stop();
  }

  gameState.screen = 'gameover';
}

// Game over UI handled por UISystem

function renderGame() {
  if (!gameState.ctx) return;

  const ctx = gameState.ctx;

  const player = gameServices.get('player');
  const progression = gameServices.get('progression');
  const combat = gameServices.get('combat');
  const enemies = gameServices.get('enemies');

  const xpOrbs = progression ? progression.getXPOrbs() : [];
  const bullets = combat ? combat.getBullets() : [];
  const asteroids = enemies ? enemies.getAsteroids() : [];
  const currentTarget = combat ? combat.getCurrentTarget() : null;

  ctx.save();

  const effects = gameServices.get('effects');
  if (effects) {
    effects.applyScreenShake(ctx);
  }

  // Background
  const gradient = ctx.createRadialGradient(
    GAME_WIDTH / 2,
    GAME_HEIGHT / 2,
    0,
    GAME_WIDTH / 2,
    GAME_HEIGHT / 2,
    Math.max(GAME_WIDTH, GAME_HEIGHT)
  );
  gradient.addColorStop(0, '#0a0a1a');
  gradient.addColorStop(0.6, '#000510');
  gradient.addColorStop(1, '#000000');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // Stars
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  for (let i = 0; i < 80; i++) {
    const x = (i * 123.456) % GAME_WIDTH;
    const y = (i * 234.567) % GAME_HEIGHT;
    const size = Math.floor(i % 3) + 1;
    ctx.fillRect(x, y, size, size);
  }

  // XP orbs
  xpOrbs.forEach((orb) => {
    if (orb.collected) return;

    // Glow effect
    const gradient = ctx.createRadialGradient(
      orb.x,
      orb.y,
      0,
      orb.x,
      orb.y,
      XP_ORB_SIZE * 2
    );
    gradient.addColorStop(0, '#00DDFF');
    gradient.addColorStop(0.7, 'rgba(0, 221, 255, 0.3)');
    gradient.addColorStop(1, 'transparent');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, XP_ORB_SIZE * 2, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = '#00DDFF';
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, XP_ORB_SIZE, 0, Math.PI * 2);
    ctx.fill();

    // Inner highlight
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(orb.x - 2, orb.y - 2, XP_ORB_SIZE * 0.3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Bullets with trail
  bullets.forEach((bullet) => {
    if (bullet.hit) return;

    // Trail
    if (bullet.trail.length > 1) {
      ctx.strokeStyle = '#FFFF00';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.6;

      ctx.beginPath();
      ctx.moveTo(bullet.trail[0].x, bullet.trail[0].y);
      for (let i = 1; i < bullet.trail.length; i++) {
        ctx.lineTo(bullet.trail[i].x, bullet.trail[i].y);
      }
      ctx.stroke();

      ctx.globalAlpha = 1;
    }

    // Bullet glow
    const gradient = ctx.createRadialGradient(
      bullet.x,
      bullet.y,
      0,
      bullet.x,
      bullet.y,
      BULLET_SIZE * 3
    );
    gradient.addColorStop(0, '#FFFF00');
    gradient.addColorStop(0.5, 'rgba(255, 255, 0, 0.4)');
    gradient.addColorStop(1, 'transparent');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, BULLET_SIZE * 3, 0, Math.PI * 2);
    ctx.fill();

    // Bullet core
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, BULLET_SIZE, 0, Math.PI * 2);
    ctx.fill();
  });

  // Asteroids
  asteroids.forEach((asteroid) => {
    if (!asteroid.destroyed) {
      asteroid.draw(ctx);
    }
  });

  // Ship
  if (player) {
    ctx.save();
    ctx.translate(player.position.x, player.position.y);
    ctx.rotate(player.angle);

    // Ship body (triangle)
    ctx.fillStyle = '#00FF88';
    ctx.strokeStyle = '#00DD77';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(SHIP_SIZE, 0);
    ctx.lineTo(-SHIP_SIZE / 2, -SHIP_SIZE / 2);
    ctx.lineTo(-SHIP_SIZE / 3, 0);
    ctx.lineTo(-SHIP_SIZE / 2, SHIP_SIZE / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Wings
    ctx.fillStyle = '#0088DD';
    ctx.beginPath();
    ctx.moveTo(-SHIP_SIZE / 3, -SHIP_SIZE / 3);
    ctx.lineTo(-SHIP_SIZE, -SHIP_SIZE);
    ctx.lineTo(-SHIP_SIZE / 2, -SHIP_SIZE / 2);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-SHIP_SIZE / 3, SHIP_SIZE / 3);
    ctx.lineTo(-SHIP_SIZE, SHIP_SIZE);
    ctx.lineTo(-SHIP_SIZE / 2, SHIP_SIZE / 2);
    ctx.closePath();
    ctx.fill();

    // Cockpit
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(SHIP_SIZE / 3, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Magnetism field indicator
  if (player && xpOrbs.some((orb) => !orb.collected)) {
    ctx.strokeStyle = 'rgba(0, 221, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(
      player.position.x,
      player.position.y,
      player.magnetismRadius,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Target indicator
  if (currentTarget && !currentTarget.destroyed) {
    const target = currentTarget;
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(target.x, target.y, target.radius + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Target line
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
    ctx.lineWidth = 1;
    if (player) {
      ctx.beginPath();
      ctx.moveTo(player.position.x, player.position.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
    }
  }

  if (effects) {
    effects.draw(ctx);
  }

  ctx.restore();
}

// HUD update handled by UISystem

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  try {
    init();
    const ui = gameServices.get('ui');
    if (ui) ui.showScreen('menu');
    console.log('Aplicação inicializada com sucesso!');
  } catch (error) {
    console.error('Erro na inicialização:', error);
  }
});
