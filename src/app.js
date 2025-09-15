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
  ASTEROID_SIZES,
  BULLET_SIZE,
  XP_ORB_SIZE,
  TRAIL_LENGTH,
  SHIP_ACCELERATION,
  SHIP_MAX_SPEED,
  SHIP_LINEAR_DAMPING,
  SHIP_ROTATION_SPEED,
  SHIP_ANGULAR_DAMPING,
  SHIP_MASS,
  ASTEROID_SPEEDS,
  BULLET_SPEED,
  COLLISION_BOUNCE,
  MAGNETISM_RADIUS,
  MAGNETISM_FORCE,
  TARGET_UPDATE_INTERVAL,
  ASTEROIDS_PER_WAVE_BASE,
  ASTEROIDS_PER_WAVE_MULTIPLIER,
  WAVE_DURATION,
  WAVE_BREAK_TIME,
  MAX_ASTEROIDS_ON_SCREEN,
} = CONSTANTS;

// Estado global do jogo - Estruturado
let gameState = {
  screen: 'menu',
  player: {
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT / 2,
    vx: 0,
    vy: 0,
    angle: 0,
    targetAngle: 0, // Ângulo alvo para rotação suave
    angularVelocity: 0,
    health: 100,
    maxHealth: 100,
    level: 1,
    xp: 0,
    xpToNext: 100,
    damage: 25,
    maxSpeed: SHIP_MAX_SPEED,
    acceleration: SHIP_ACCELERATION,
    rotationSpeed: SHIP_ROTATION_SPEED,
    armor: 0,
    multishot: 1,
    magnetismRadius: MAGNETISM_RADIUS,
    invulnerableTimer: 0,
  },
  world: {
    asteroids: [],
    bullets: [],
    xpOrbs: [],
    currentTarget: null,
    targetUpdateTimer: 0,
    lastShotTime: 0,
    shootCooldown: 0.3,
  },
  wave: {
    current: 1,
    totalAsteroids: ASTEROIDS_PER_WAVE_BASE,
    asteroidsSpawned: 0,
    asteroidsKilled: 0,
    isActive: true,
    breakTimer: 0,
    completedWaves: 0,
    timeRemaining: WAVE_DURATION, // Timer regressivo de 60 segundos
    spawnTimer: 0,
    spawnDelay: 1.0,
    initialSpawnDone: false,
  },
  stats: {
    totalKills: 0,
    time: 0,
    startTime: 0,
  },
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
        // Incrementar kills
        gameState.wave.asteroidsKilled++;
        gameState.stats.totalKills++;

        // Tocar som de destruição
        if (typeof audio !== 'undefined') {
          audio.playAsteroidBreak(data.size);
          if (data.size === 'large') {
            audio.playBigExplosion();
          }
        }

        // Efeitos visuais (serão movidos para EffectsSystem depois)
        createAsteroidExplosion(data.enemy);
      });

      // Listeners para sistema de progressão
      gameEvents.on('player-leveled-up', (data) => {
        if (typeof audio !== 'undefined') {
          audio.playLevelUp();
        }
        if (typeof addScreenShake !== 'undefined') {
          addScreenShake(6, 0.4, 'celebration');
        }
        if (typeof addFreezeFrame !== 'undefined') {
          addFreezeFrame(0.2, 0.4);
        }
        if (typeof addScreenFlash !== 'undefined') {
          addScreenFlash('#FFD700', 0.15, 0.2);
        }
      });

      gameEvents.on('xp-collected', (data) => {
        if (typeof audio !== 'undefined') {
          audio.playXPCollect();
        }
        // Criar efeito de coleta (futuro EffectsSystem)
        // createXPCollectEffect(data.position.x, data.position.y);
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
    gameState.stats.startTime = Date.now();

    resetPlayer();
    resetWorld();
    resetWave();

    // CORREÇÃO BUG 1: Spawn garantido imediato de asteroides
    spawnInitialAsteroids();

    const ui = gameServices.get('ui');
    if (ui) ui.showGameUI();
    audio.init();

    console.log('Jogo iniciado com sucesso!');
  } catch (error) {
    console.error('Erro ao iniciar jogo:', error);
  }
}

function spawnInitialAsteroids() {
  const enemies = gameServices.get('enemies');
  if (enemies) {
    enemies.spawnInitialAsteroids(4);
    gameState.wave.asteroidsSpawned += 4;
  }
  gameState.wave.initialSpawnDone = true;
}

function resetPlayer() {
  gameState.player = {
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT / 2,
    vx: 0,
    vy: 0,
    angle: 0,
    targetAngle: 0,
    angularVelocity: 0,
    health: 100,
    maxHealth: 100,
    level: 1,
    xp: 0,
    xpToNext: 100,
    damage: 25,
    maxSpeed: SHIP_MAX_SPEED,
    acceleration: SHIP_ACCELERATION,
    rotationSpeed: SHIP_ROTATION_SPEED,
    armor: 0,
    multishot: 1,
    magnetismRadius: MAGNETISM_RADIUS,
    invulnerableTimer: 0,
  };

  // Reset ProgressionSystem
  const progression = gameServices.get('progression');
  if (progression) {
    progression.reset();
  }
}

function resetWorld() {
  gameState.world = {
    asteroids: [],
    bullets: [],
    xpOrbs: [],
    currentTarget: null,
    targetUpdateTimer: 0,
    lastShotTime: 0,
    shootCooldown: 0.3,
  };

  // Reset EnemySystem
  const enemies = gameServices.get('enemies');
  if (enemies) {
    enemies.reset();
  }
}

function resetWave() {
  gameState.wave = {
    current: 1,
    totalAsteroids: ASTEROIDS_PER_WAVE_BASE,
    asteroidsSpawned: 0,
    asteroidsKilled: 0,
    isActive: true,
    breakTimer: 0,
    completedWaves: 0,
    timeRemaining: WAVE_DURATION, // CORREÇÃO BUG 3: Timer regressivo de 60s
    spawnTimer: 0,
    spawnDelay: 1.0,
    initialSpawnDone: false,
  };

  gameState.stats = {
    totalKills: 0,
    time: 0,
    startTime: Date.now(),
  };
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
  // Atualizar sistemas modulares
  const player = gameServices.get('player');
  let playerStats = null;
  if (player) {
    player.update(deltaTime);
    playerStats = player.getStats();

    // SINCRONIZAR com gameState antigo (temporário)
    gameState.player.x = player.position.x;
    gameState.player.y = player.position.y;
    gameState.player.vx = player.velocity.vx;
    gameState.player.vy = player.velocity.vy;
    gameState.player.angle = player.angle;
    gameState.player.health = playerStats.health;
    gameState.player.maxHealth = playerStats.maxHealth;
    gameState.player.damage = playerStats.damage;
    gameState.player.multishot = playerStats.multishot;
    gameState.player.magnetismRadius = playerStats.magnetismRadius;
  }
  // Atualizar CombatSystem
  const combat = gameServices.get('combat');
  if (combat && playerStats) {
    combat.update(deltaTime, playerStats);

    // SINCRONIZAR bullets com gameState antigo (temporário)
    gameState.world.bullets = combat.getBullets();
    gameState.world.currentTarget = combat.getCurrentTarget();
  }
  // Atualizar EnemySystem
  const enemies = gameServices.get('enemies');
  if (enemies) {
    enemies.update(deltaTime, gameState.wave);

    // SINCRONIZAR asteroids com gameState antigo (temporário)
    gameState.world.asteroids = enemies.getAllAsteroids();
  }

  // Atualizar ProgressionSystem
  const progression = gameServices.get('progression');
  if (progression) {
    progression.update(deltaTime);

    // SINCRONIZAR com gameState antigo (temporário)
    gameState.player.level = progression.getLevel();
    const expData = progression.getExperience();
    gameState.player.xp = expData.current;
    gameState.player.xpToNext = expData.needed;

    // Sincronizar XP orbs
    gameState.world.xpOrbs = progression.getXPOrbs();
  }

  gameState.stats.time = (Date.now() - gameState.stats.startTime) / 1000;
  // Atualizar i-frames do jogador
  if (gameState.player.invulnerableTimer > 0) {
    gameState.player.invulnerableTimer -= deltaTime;
    if (gameState.player.invulnerableTimer < 0)
      gameState.player.invulnerableTimer = 0;
  }

  // Funções legadas que ainda precisam ser limpas
  updateAsteroids(deltaTime);
  updateWaveSystem(deltaTime);

  checkCollisions();
  const ui = gameServices.get('ui');
  if (ui) {
    ui.updateHUD(gameState);
  }
}

function updateBullets(deltaTime) {
  // Esta função agora é redundante. O CombatSystem gerencia os projéteis.
  // A sincronização em updateGame() já atualiza o gameState.world.bullets.
}

function updateAsteroids(deltaTime) {
  // Esta função agora é redundante. O EnemySystem gerencia os asteroides e suas colisões.
  // A sincronização em updateGame() já atualiza o gameState.world.asteroids.
  // A lógica de colisão abaixo também foi movida para o EnemySystem.
  for (let i = 0; i < gameState.world.asteroids.length - 1; i++) {
    const a1 = gameState.world.asteroids[i];
    if (a1.destroyed) continue;

    for (let j = i + 1; j < gameState.world.asteroids.length; j++) {
      const a2 = gameState.world.asteroids[j];
      if (a2.destroyed) continue;

      const dx = a2.x - a1.x;
      const dy = a2.y - a1.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const minDistance = a1.radius + a2.radius;

      if (distance < minDistance && distance > 0) {
        const nx = dx / distance;
        const ny = dy / distance;
        // Correção de penetração
        const overlap = minDistance - distance;
        const percent = 0.5;
        a1.x -= nx * overlap * percent;
        a1.y -= ny * overlap * percent;
        a2.x += nx * overlap * percent;
        a2.y += ny * overlap * percent;

        // Impulso elástico com massa e restituição
        const rvx = a2.vx - a1.vx;
        const rvy = a2.vy - a1.vy;
        const velAlongNormal = rvx * nx + rvy * ny;
        if (velAlongNormal < 0) {
          const e = COLLISION_BOUNCE;
          const invMass1 = 1 / a1.mass;
          const invMass2 = 1 / a2.mass;
          const j = (-(1 + e) * velAlongNormal) / (invMass1 + invMass2);
          const jx = j * nx;
          const jy = j * ny;
          a1.vx -= jx * invMass1;
          a1.vy -= jy * invMass1;
          a2.vx += jx * invMass2;
          a2.vy += jy * invMass2;
        }

        a1.rotationSpeed += (Math.random() - 0.5) * 1.5;
        a2.rotationSpeed += (Math.random() - 0.5) * 1.5;
      }
    }
  }
}

function updateXPOrbs(deltaTime) {
  gameState.world.xpOrbs.forEach((orb) => {
    if (orb.collected) return;

    const dx = gameState.player.x - orb.x;
    const dy = gameState.player.y - orb.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Magnetismo
    if (distance < gameState.player.magnetismRadius && distance > 0) {
      const force = MAGNETISM_FORCE / Math.max(distance, 1);
      const normalizedDx = dx / distance;
      const normalizedDy = dy / distance;

      orb.x += normalizedDx * force * deltaTime;
      orb.y += normalizedDy * force * deltaTime;
    }

    // Coleta
    if (distance < SHIP_SIZE + XP_ORB_SIZE) {
      orb.collected = true;
      collectXP(orb.value);
      audio.playXPCollect();
      createXPCollectEffect(orb.x, orb.y);
    }
  });

  gameState.world.xpOrbs = gameState.world.xpOrbs.filter(
    (orb) => !orb.collected
  );
}

// CORREÇÃO BUG 3: Sistema de ondas com timer regressivo de 60 segundos
function updateWaveSystem(deltaTime) {
  if (gameState.wave.isActive) {
    // Reduzir timer da onda
    gameState.wave.timeRemaining -= deltaTime;

    // Controlar spawn de asteroides
    if (
      gameState.wave.asteroidsSpawned < gameState.wave.totalAsteroids &&
      gameState.world.asteroids.length < MAX_ASTEROIDS_ON_SCREEN
    ) {
      gameState.wave.spawnTimer -= deltaTime;

      if (gameState.wave.spawnTimer <= 0) {
        spawnAsteroid();
        gameState.wave.asteroidsSpawned++;
        gameState.wave.spawnTimer =
          gameState.wave.spawnDelay * (0.5 + Math.random() * 0.5);
      }
    }

    // Verificar se onda foi completada (timer chegou a 0 OU todos asteroides eliminados)
    const allAsteroidsKilled =
      gameState.wave.asteroidsKilled >= gameState.wave.totalAsteroids &&
      gameState.world.asteroids.filter((a) => !a.destroyed).length === 0;

    if (gameState.wave.timeRemaining <= 0 || allAsteroidsKilled) {
      completeWave();
    }
  } else {
    // Timer do intervalo entre ondas
    gameState.wave.breakTimer -= deltaTime;

    if (gameState.wave.breakTimer <= 0) {
      startNextWave();
    }
  }
}

function spawnAsteroid() {
  const enemies = gameServices.get('enemies');
  if (enemies) {
    const asteroid = enemies.spawnAsteroid();
    // Atualizar contador de spawn da wave
    if (gameState.wave.isActive) {
      gameState.wave.asteroidsSpawned++;
    }
    return asteroid;
  }
  return null;
}

function completeWave() {
  gameState.wave.isActive = false;
  gameState.wave.breakTimer = WAVE_BREAK_TIME;
  gameState.wave.completedWaves++;

  // Recompensas de fim de onda
  const orbCount = 4 + Math.floor(gameState.wave.current / 2);
  for (let i = 0; i < orbCount; i++) {
    const angle = (i / orbCount) * Math.PI * 2;
    const distance = 100;
    createXPOrb(
      gameState.player.x + Math.cos(angle) * distance,
      gameState.player.y + Math.sin(angle) * distance,
      20 + gameState.wave.current * 5
    );
  }
}

function startNextWave() {
  gameState.wave.current++;
  gameState.wave.totalAsteroids = Math.floor(
    ASTEROIDS_PER_WAVE_BASE *
      Math.pow(ASTEROIDS_PER_WAVE_MULTIPLIER, gameState.wave.current - 1)
  );
  gameState.wave.totalAsteroids = Math.min(gameState.wave.totalAsteroids, 25); // Limite máximo
  gameState.wave.asteroidsSpawned = 0;
  gameState.wave.asteroidsKilled = 0;
  gameState.wave.isActive = true;
  gameState.wave.timeRemaining = WAVE_DURATION; // Resetar timer para 60 segundos
  gameState.wave.spawnTimer = 1.0;
  gameState.wave.spawnDelay = Math.max(0.8, 2.0 - gameState.wave.current * 0.1);
  gameState.wave.initialSpawnDone = false;

  // CORREÇÃO BUG 1: Spawn imediato de asteroides na nova onda
  spawnInitialAsteroids();
}

function createXPOrb(x, y, value) {
  const progression = gameServices.get('progression');
  if (progression) {
    return progression.createXPOrb(x, y, value);
  }
  return null;
}

function collectXP(amount) {
  const progression = gameServices.get('progression');
  if (progression) {
    // ProgressionSystem já gerencia tudo via events
    // Função mantida para compatibilidade
    console.log('[collectXP] Redirecting to ProgressionSystem');
  }
}

// Legacy levelUp function substituted by ProgressionSystem

// Level up UI handled by UISystem

// Detecção de colisão melhorada
function checkCollisions() {
  // Usar collision detection do CombatSystem
  const combat = gameServices.get('combat');
  if (combat) {
    combat.checkBulletCollisions(gameState.world.asteroids);
  }

  // A lógica de colisão de balas foi movida para um listener do evento 'bullet-hit'.
  // O código legado abaixo agora é redundante, mas o manteremos por enquanto
  // para limpar os arrays até que o EnemySystem assuma essa responsabilidade.

  // gameState.world.bullets = gameState.world.bullets.filter(
  //   (bullet) => !bullet.hit
  // );
  // gameState.world.asteroids = gameState.world.asteroids.filter(
  //   (asteroid) => !asteroid.destroyed
  // );

  // Colisões nave-asteroide
  gameState.world.asteroids.forEach((asteroid) => {
    if (asteroid.destroyed) return;

    const dx = gameState.player.x - asteroid.x;
    const dy = gameState.player.y - asteroid.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < SHIP_SIZE + asteroid.radius) {
      // Normal de colisão
      const nx = dx / Math.max(distance, 1);
      const ny = dy / Math.max(distance, 1);
      // Correção de penetração
      const overlap = SHIP_SIZE + asteroid.radius - distance;
      if (overlap > 0) {
        gameState.player.x += nx * overlap * 0.5;
        gameState.player.y += ny * overlap * 0.5;
        asteroid.x -= nx * overlap * 0.5;
        asteroid.y -= ny * overlap * 0.5;
      }
      // Impulso baseado em massas
      const rvx = asteroid.vx - gameState.player.vx;
      const rvy = asteroid.vy - gameState.player.vy;
      const velAlongNormal = rvx * nx + rvy * ny;
      if (velAlongNormal < 0) {
        const e = 0.2; // colisão menos elástica com a nave
        const invMass1 = 1 / SHIP_MASS;
        const invMass2 = 1 / asteroid.mass;
        const j = (-(1 + e) * velAlongNormal) / (invMass1 + invMass2);
        const jx = j * nx;
        const jy = j * ny;
        gameState.player.vx -= jx * invMass1;
        gameState.player.vy -= jy * invMass1;
        asteroid.vx += jx * invMass2;
        asteroid.vy += jy * invMass2;
      }

      // Dano baseado em momento relativo (com i-frames)
      if (gameState.player.invulnerableTimer <= 0) {
        const relSpeed = Math.sqrt(
          (asteroid.vx - gameState.player.vx) ** 2 +
            (asteroid.vy - gameState.player.vy) ** 2
        );
        const baseDamage = 12;
        const momentumFactor = (asteroid.mass * relSpeed) / 120;
        const rawDamage = baseDamage + momentumFactor;
        const damage = Math.max(
          3,
          Math.floor(rawDamage) - gameState.player.armor
        );
        const playerSystem = gameServices.get('player');
        const remaining = playerSystem
          ? playerSystem.takeDamage(damage)
          : gameState.player.health - damage;
        gameState.player.health = remaining;
        gameState.player.invulnerableTimer = 0.5;

        audio.playShipHit();
        addScreenShake(8, 0.3);

        if (remaining <= 0) {
          gameOver();
        }
      }
    }
  });
}

// Game over UI handled por UISystem

function renderGame() {
  if (!gameState.ctx) return;

  const ctx = gameState.ctx;

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
  gameState.world.xpOrbs.forEach((orb) => {
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
  gameState.world.bullets.forEach((bullet) => {
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
  gameState.world.asteroids.forEach((asteroid) => {
    if (!asteroid.destroyed) {
      asteroid.draw(ctx);
    }
  });

  // Ship
  ctx.save();
  ctx.translate(gameState.player.x, gameState.player.y);
  ctx.rotate(gameState.player.angle);

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

  // Magnetism field indicator
  if (gameState.world.xpOrbs.some((orb) => !orb.collected)) {
    ctx.strokeStyle = 'rgba(0, 221, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(
      gameState.player.x,
      gameState.player.y,
      gameState.player.magnetismRadius,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Target indicator
  if (
    gameState.world.currentTarget &&
    !gameState.world.currentTarget.destroyed
  ) {
    const target = gameState.world.currentTarget;
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
    ctx.beginPath();
    ctx.moveTo(gameState.player.x, gameState.player.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
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
