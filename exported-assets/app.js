// Constantes do jogo espacial - Balanceadas
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const SHIP_SIZE = 15;
// Ajuste: chaves em minúsculas para casar com o restante do código
const ASTEROID_SIZES = { large: 35, medium: 22, small: 12 };
const BULLET_SIZE = 3;
const XP_ORB_SIZE = 8;
const TRAIL_LENGTH = 6;

// Constantes de física - Otimizadas
const SHIP_ACCELERATION = 280;
const SHIP_MAX_SPEED = 220;
// Amortecimento dependente de dt (equivale a ~0.94/frame em 60 FPS)
const SHIP_LINEAR_DAMPING = 3.9; // s^-1
const SHIP_ROTATION_SPEED = 8; // Velocidade máxima de rotação (rad/s)
const SHIP_ANGULAR_DAMPING = 8.0; // s^-1
const SHIP_MASS = 60; // massa efetiva da nave para colisões
// Ajuste: chaves em minúsculas para casar com o restante do código
const ASTEROID_SPEEDS = { large: 25, medium: 45, small: 70 };
const BULLET_SPEED = 450;
const COLLISION_BOUNCE = 0.6;

// Constantes de magnetismo - Balanceadas
const MAGNETISM_RADIUS = 70;
const MAGNETISM_FORCE = 120;

// Constantes de targeting e ondas - Corrigidas
const TARGET_UPDATE_INTERVAL = 0.15;
const ASTEROIDS_PER_WAVE_BASE = 4;
const ASTEROIDS_PER_WAVE_MULTIPLIER = 1.3;
const WAVE_DURATION = 60; // 60 segundos por onda
const WAVE_BREAK_TIME = 10; // 10 segundos entre ondas
const MAX_ASTEROIDS_ON_SCREEN = 20;

// Sistema de upgrades espaciais
const SPACE_UPGRADES = [
  { 
    id: 'plasma', 
    name: 'Arma de Plasma', 
    description: '+25% dano', 
    icon: '⚡', 
    color: '#FFD700' 
  },
  { 
    id: 'propulsors', 
    name: 'Propulsores Melhorados', 
    description: '+20% velocidade máxima', 
    icon: '🚀', 
    color: '#00BFFF' 
  },
  { 
    id: 'shield', 
    name: 'Escudo Energético', 
    description: '+50 HP máximo', 
    icon: '🛡️', 
    color: '#32CD32' 
  },
  { 
    id: 'armor', 
    name: 'Blindagem Reativa', 
    description: '+25% resistência', 
    icon: '🔰', 
    color: '#FF6B6B' 
  },
  { 
    id: 'multishot', 
    name: 'Tiro Múltiplo', 
    description: '+1 projétil', 
    icon: '💥', 
    color: '#9932CC' 
  },
  { 
    id: 'magfield', 
    name: 'Campo Magnético', 
    description: '+50% alcance magnético', 
    icon: '🧲', 
    color: '#FF69B4' 
  }
];

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
    invulnerableTimer: 0
  },
  world: {
    asteroids: [],
    bullets: [],
    xpOrbs: [],
    particles: [],
    currentTarget: null,
    targetUpdateTimer: 0,
    lastShotTime: 0,
    shootCooldown: 0.3
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
    initialSpawnDone: false
  },
  stats: {
    totalKills: 0,
    time: 0,
    startTime: 0
  },
  input: {},
  canvas: null,
  ctx: null,
  screenShake: { intensity: 0, duration: 0, timer: 0 },
  freezeFrame: { timer: 0, duration: 0, fade: 0 },
  screenFlash: { timer: 0, duration: 0, color: '#FFFFFF', intensity: 0 },
  initialized: false
};

// Função para interpolação angular suave
function lerpAngle(from, to, factor) {
  let diff = to - from;
  
  // Normalizar a diferença para o menor caminho circular
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  
  return from + diff * factor;
}

// Utilitários angulares adicionais
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function angleDiff(from, to) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

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
      osc.frequency.exponentialRampToValueAtTime(150, this.context.currentTime + 0.08);
      
      gain.gain.setValueAtTime(0.12, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.08);
      
      osc.start();
      osc.stop(this.context.currentTime + 0.08);
    });
  }

  playAsteroidBreak(size) {
    this.safePlay(() => {
      const baseFreq = size === 'large' ? 70 : size === 'medium' ? 110 : 150;
      const duration = size === 'large' ? 0.35 : size === 'medium' ? 0.25 : 0.18;
      
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      
      osc.connect(gain);
      gain.connect(this.masterGain);
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(baseFreq, this.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, this.context.currentTime + duration);
      
      gain.gain.setValueAtTime(0.15, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
      
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
      const noiseBuffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
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
      osc.frequency.exponentialRampToValueAtTime(1200, this.context.currentTime + 0.12);
      
      gain.gain.setValueAtTime(0.08, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.12);
      
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
      osc.frequency.exponentialRampToValueAtTime(40, this.context.currentTime + 0.3);
      
      gain.gain.setValueAtTime(0.2, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.3);
      
      osc.start();
      osc.stop(this.context.currentTime + 0.3);
    });
  }

  playBigExplosion() {
    this.safePlay(() => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.type = 'square';
      osc.frequency.setValueAtTime(60, this.context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(20, this.context.currentTime + 0.5);

      gain.gain.setValueAtTime(0.3, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.5);

      osc.start();
      osc.stop(this.context.currentTime + 0.5);
    });
  }
}

// Sistema de partículas otimizado
class SpaceParticle {
  constructor(x, y, vx, vy, color, size, life, type = 'normal') {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.life = life;
    this.maxLife = life;
    this.alpha = 1;
    this.type = type;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 4;
  }

  update(deltaTime) {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    this.life -= deltaTime;
    this.alpha = Math.max(0, this.life / this.maxLife);
    this.rotation += this.rotationSpeed * deltaTime;
    
    const friction = this.type === 'thruster' ? 0.98 : 0.96;
    this.vx *= friction;
    this.vy *= friction;
    
    return this.life > 0;
  }

  draw(ctx) {
    if (this.alpha <= 0) return;
    
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    
    if (this.type === 'spark') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.size * this.alpha;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-this.size, 0);
      ctx.lineTo(this.size, 0);
      ctx.stroke();
    } else if (this.type === 'debris') {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      const s = this.size * this.alpha;
      ctx.rect(-s/2, -s/2, s, s);
      ctx.fill();
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(0, 0, this.size * this.alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
}

// Classe para asteroides melhorada
class Asteroid {
  constructor(x, y, size, vx = 0, vy = 0) {
    this.id = Date.now() + Math.random();
    this.x = x;
    this.y = y;
    this.size = size;
    this.radius = ASTEROID_SIZES[size];
    this.mass = this.radius * this.radius * 0.05; // massa proporcional à área
    this.health = size === 'large' ? 3 : size === 'medium' ? 2 : 1;
    this.maxHealth = this.health;
    
    // Velocidade balanceada baseada no tamanho
    if (vx === 0 && vy === 0) {
      const speed = ASTEROID_SPEEDS[size] * (0.8 + Math.random() * 0.4);
      const angle = Math.random() * Math.PI * 2;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
    } else {
      this.vx = vx;
      this.vy = vy;
    }
    
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 1.5;
    this.lastDamageTime = 0;
    this.vertices = this.generateVertices();
    this.destroyed = false;
  }

  generateVertices() {
    const vertices = [];
    const numVertices = 6 + Math.floor(Math.random() * 3);
    
    for (let i = 0; i < numVertices; i++) {
      const angle = (i / numVertices) * Math.PI * 2;
      const radiusVariation = 0.8 + Math.random() * 0.4;
      const radius = this.radius * radiusVariation;
      
      vertices.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      });
    }
    
    return vertices;
  }

  update(deltaTime) {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    this.rotation += this.rotationSpeed * deltaTime;
    
    // Wrap around screen com margem
    const margin = this.radius;
    if (this.x < -margin) this.x = GAME_WIDTH + margin;
    if (this.x > GAME_WIDTH + margin) this.x = -margin;
    if (this.y < -margin) this.y = GAME_HEIGHT + margin;
    if (this.y > GAME_HEIGHT + margin) this.y = -margin;
    
    if (this.lastDamageTime > 0) {
      this.lastDamageTime -= deltaTime;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    
    // Efeito de dano
    if (this.lastDamageTime > 0) {
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#FFFFFF';
    } else {
      const colors = { large: '#8B4513', medium: '#A0522D', small: '#CD853F' };
      ctx.fillStyle = colors[this.size];
      ctx.strokeStyle = '#654321';
    }
    
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let i = 0; i < this.vertices.length; i++) {
      const vertex = this.vertices[i];
      if (i === 0) {
        ctx.moveTo(vertex.x, vertex.y);
      } else {
        ctx.lineTo(vertex.x, vertex.y);
      }
    }
    
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Detalhes internos
    ctx.strokeStyle = 'rgba(101, 67, 33, 0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      const startVertex = this.vertices[Math.floor(Math.random() * this.vertices.length)];
      const endVertex = this.vertices[Math.floor(Math.random() * this.vertices.length)];
      ctx.beginPath();
      ctx.moveTo(startVertex.x * 0.4, startVertex.y * 0.4);
      ctx.lineTo(endVertex.x * 0.4, endVertex.y * 0.4);
      ctx.stroke();
    }
    
    ctx.restore();
  }

  takeDamage(damage) {
    this.health -= damage;
    this.lastDamageTime = 0.12;
    return this.health <= 0;
  }

  fragment() {
    if (this.size === 'small') return [];
    
    const newSize = this.size === 'large' ? 'medium' : 'small';
    const fragments = [];
    const fragmentCount = 2 + Math.floor(Math.random() * 2);
    
    for (let i = 0; i < fragmentCount; i++) {
      const angle = (i / fragmentCount) * Math.PI * 2 + Math.random() * 0.4;
      const speed = ASTEROID_SPEEDS[newSize] * (0.8 + Math.random() * 0.4);
      const fragment = new Asteroid(
        this.x + Math.cos(angle) * 10,
        this.y + Math.sin(angle) * 10,
        newSize,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed
      );
      fragments.push(fragment);
    }
    
    return fragments;
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
    gameState.initialized = true;
    
    requestAnimationFrame(gameLoop);
  } catch (error) {
    console.error('Erro na inicialização:', error);
    alert('Erro ao inicializar o jogo. Recarregue a página.');
  }
}

function setupEventListeners() {
  // Keyboard events
  document.addEventListener('keydown', (e) => {
    gameState.input[e.key.toLowerCase()] = true;
    if (e.key.toLowerCase() === 'escape' && gameState.screen === 'levelup') {
      e.preventDefault();
    }
    
    // Inicializar áudio no primeiro input
    if (!audio.initialized) {
      audio.init();
    }
  });
  
  document.addEventListener('keyup', (e) => {
    gameState.input[e.key.toLowerCase()] = false;
  });
  
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
    gameState.screen = 'playing';
    gameState.stats.startTime = Date.now();
    
    resetPlayer();
    resetWorld();
    resetWave();
    
    // CORREÇÃO BUG 1: Spawn garantido imediato de asteroides
    spawnInitialAsteroids();
    
    showGameUI();
    audio.init();
    
    console.log('Jogo iniciado com sucesso!');
  } catch (error) {
    console.error('Erro ao iniciar jogo:', error);
  }
}

function spawnInitialAsteroids() {
  // CORREÇÃO BUG 1: Spawn imediato de 4 asteroides no início da onda
  for (let i = 0; i < 4; i++) {
    spawnAsteroid();
    gameState.wave.asteroidsSpawned++;
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
    invulnerableTimer: 0
  };
}

function resetWorld() {
  gameState.world = {
    asteroids: [],
    bullets: [],
    xpOrbs: [],
    particles: [],
    currentTarget: null,
    targetUpdateTimer: 0,
    lastShotTime: 0,
    shootCooldown: 0.3
  };
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
    initialSpawnDone: false
  };
  
  gameState.stats = {
    totalKills: 0,
    time: 0,
    startTime: Date.now()
  };
}

function showScreen(screenName) {
  try {
    console.log('Mudando para tela:', screenName);
    
    // Esconder todas as telas
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.add('hidden');
    });
    
    const gameUI = document.getElementById('game-ui');
    if (gameUI) gameUI.classList.add('hidden');
    
    // Mostrar tela específica
    if (screenName === 'playing' || screenName === 'game') {
      if (gameUI) {
        gameUI.classList.remove('hidden');
        console.log('Game UI mostrada');
      }
    } else {
      const screen = document.getElementById(`${screenName}-screen`);
      if (screen) {
        screen.classList.remove('hidden');
        console.log(`Tela ${screenName} mostrada`);
      }
    }
  } catch (error) {
    console.error('Erro ao mostrar tela:', error);
  }
}

function showGameUI() {
  showScreen('playing');
}

// Sistema de targeting aprimorado
function updateTargeting(deltaTime) {
  gameState.world.targetUpdateTimer -= deltaTime;
  
  if (gameState.world.targetUpdateTimer <= 0) {
    let newTarget = null;
    let closestDistance = Infinity;
    
    // Encontrar asteroide mais próximo e válido
    gameState.world.asteroids.forEach(asteroid => {
      if (asteroid.destroyed) return;
      
      const dx = asteroid.x - gameState.player.x;
      const dy = asteroid.y - gameState.player.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < closestDistance && distance < 400) { // Limite de alcance
        closestDistance = distance;
        newTarget = asteroid;
      }
    });
    
    gameState.world.currentTarget = newTarget;
    gameState.world.targetUpdateTimer = TARGET_UPDATE_INTERVAL;
  }
  
  // Verificar se o alvo ainda é válido
  if (gameState.world.currentTarget && 
      (gameState.world.currentTarget.destroyed || 
       !gameState.world.asteroids.find(a => a.id === gameState.world.currentTarget.id))) {
    gameState.world.currentTarget = null;
  }
}

function handleShooting(deltaTime) {
  gameState.world.lastShotTime += deltaTime;
  
  if (gameState.world.lastShotTime >= gameState.world.shootCooldown && 
      gameState.world.currentTarget && 
      !gameState.world.currentTarget.destroyed) {
    
    const target = gameState.world.currentTarget;
    
    // Tiro com predição de movimento
    const predictTime = 0.5;
    const predictedX = target.x + target.vx * predictTime;
    const predictedY = target.y + target.vy * predictTime;
    
    for (let i = 0; i < gameState.player.multishot; i++) {
      let targetX = predictedX;
      let targetY = predictedY;
      
      if (gameState.player.multishot > 1) {
        const spreadAngle = (i - (gameState.player.multishot - 1) / 2) * 0.3;
        const dx = predictedX - gameState.player.x;
        const dy = predictedY - gameState.player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) + spreadAngle;
        
        targetX = gameState.player.x + Math.cos(angle) * distance;
        targetY = gameState.player.y + Math.sin(angle) * distance;
      }
      
      createBullet(gameState.player.x, gameState.player.y, targetX, targetY);
    }
    
    gameState.world.lastShotTime = 0;
    audio.playLaserShot();
  }
}

function createBullet(fromX, fromY, toX, toY) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance === 0) return;
  
  const bullet = {
    id: Date.now() + Math.random(),
    x: fromX,
    y: fromY,
    vx: (dx / distance) * BULLET_SPEED,
    vy: (dy / distance) * BULLET_SPEED,
    damage: gameState.player.damage,
    life: 1.8,
    trail: [],
    hit: false
  };
  
  gameState.world.bullets.push(bullet);
}

function updatePlayerMovement(deltaTime) {
  let accelerating = false;
  const acceleration = gameState.player.acceleration * deltaTime;
  
  let ax = 0, ay = 0;
  
  if (gameState.input['w'] || gameState.input['arrowup']) {
    ay -= acceleration;
    accelerating = true;
  }
  if (gameState.input['s'] || gameState.input['arrowdown']) {
    ay += acceleration;
    accelerating = true;
  }
  if (gameState.input['a'] || gameState.input['arrowleft']) {
    ax -= acceleration;
    accelerating = true;
  }
  if (gameState.input['d'] || gameState.input['arrowright']) {
    ax += acceleration;
    accelerating = true;
  }
  
  gameState.player.vx += ax;
  gameState.player.vy += ay;

  // Aplicar amortecimento dependente de dt
  const linearDamp = Math.exp(-SHIP_LINEAR_DAMPING * deltaTime);
  gameState.player.vx *= linearDamp;
  gameState.player.vy *= linearDamp;

  // Limitar velocidade máxima
  const speed = Math.sqrt(gameState.player.vx ** 2 + gameState.player.vy ** 2);
  if (speed > gameState.player.maxSpeed) {
    gameState.player.vx = (gameState.player.vx / speed) * gameState.player.maxSpeed;
    gameState.player.vy = (gameState.player.vy / speed) * gameState.player.maxSpeed;
  }

  // Atualizar posição
  gameState.player.x += gameState.player.vx * deltaTime;
  gameState.player.y += gameState.player.vy * deltaTime;

  // Wrap around screen
  if (gameState.player.x < 0) gameState.player.x = GAME_WIDTH;
  if (gameState.player.x > GAME_WIDTH) gameState.player.x = 0;
  if (gameState.player.y < 0) gameState.player.y = GAME_HEIGHT;
  if (gameState.player.y > GAME_HEIGHT) gameState.player.y = 0;

  // Controle de rotação
  let angularAccel = 0;
  if (rotateLeft) angularAccel -= rotationAccel;
  if (rotateRight) angularAccel += rotationAccel;
  gameState.player.angularVelocity += angularAccel;

  // Amortecimento angular
  const angularDamp = Math.exp(-SHIP_ANGULAR_DAMPING * deltaTime);
  gameState.player.angularVelocity *= angularDamp;

  // Limitar velocidade angular
  const maxAng = gameState.player.rotationSpeed;
  if (gameState.player.angularVelocity > maxAng) gameState.player.angularVelocity = maxAng;
  if (gameState.player.angularVelocity < -maxAng) gameState.player.angularVelocity = -maxAng;
  gameState.player.angle = wrapAngle(gameState.player.angle + gameState.player.angularVelocity * deltaTime);
  
  // Efeito de propulsão
  if (accelerating) {
    createThrusterEffect();
  }
}

function createThrusterEffect() {
  const thrusterX = gameState.player.x - Math.cos(gameState.player.angle) * SHIP_SIZE * 0.8;
  const thrusterY = gameState.player.y - Math.sin(gameState.player.angle) * SHIP_SIZE * 0.8;
  
  for (let i = 0; i < 2; i++) {
    const particle = new SpaceParticle(
      thrusterX + (Math.random() - 0.5) * 4,
      thrusterY + (Math.random() - 0.5) * 4,
      -Math.cos(gameState.player.angle) * (80 + Math.random() * 40) + (Math.random() - 0.5) * 20,
      -Math.sin(gameState.player.angle) * (80 + Math.random() * 40) + (Math.random() - 0.5) * 20,
      `hsl(${Math.random() * 60 + 15}, 100%, 70%)`,
      2 + Math.random() * 1.5,
      0.25 + Math.random() * 0.15,
      'thruster'
    );
    gameState.world.particles.push(particle);
  }
}

let lastTime = 0;

function gameLoop(currentTime) {
  if (!gameState.initialized) return;

  let deltaTime = Math.min((currentTime - lastTime) / 1000, 0.016);
  lastTime = currentTime;

  if (gameState.freezeFrame.timer > 0) {
    gameState.freezeFrame.timer -= deltaTime;
    if (gameState.freezeFrame.timer < 0) gameState.freezeFrame.timer = 0;
    deltaTime *= gameState.freezeFrame.fade;
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
  gameState.stats.time = (Date.now() - gameState.stats.startTime) / 1000;
  // Atualizar i-frames do jogador
  if (gameState.player.invulnerableTimer > 0) {
    gameState.player.invulnerableTimer -= deltaTime;
    if (gameState.player.invulnerableTimer < 0) gameState.player.invulnerableTimer = 0;
  }
  
  updatePlayerMovement(deltaTime);
  updateTargeting(deltaTime);
  handleShooting(deltaTime);
  updateBullets(deltaTime);
  updateAsteroids(deltaTime);
  updateXPOrbs(deltaTime);
  updateParticles(deltaTime);
  updateWaveSystem(deltaTime);
  updateScreenShake(deltaTime);
  updateScreenFlash(deltaTime);

  checkCollisions();
  updateUI();
}

function updateBullets(deltaTime) {
  gameState.world.bullets.forEach(bullet => {
    if (bullet.hit) return;
    
    // Rastro da bala
    bullet.trail.push({ x: bullet.x, y: bullet.y });
    if (bullet.trail.length > TRAIL_LENGTH) {
      bullet.trail.shift();
    }
    
    bullet.x += bullet.vx * deltaTime;
    bullet.y += bullet.vy * deltaTime;
    bullet.life -= deltaTime;
    
    // Wrap around screen
    if (bullet.x < 0) bullet.x = GAME_WIDTH;
    if (bullet.x > GAME_WIDTH) bullet.x = 0;
    if (bullet.y < 0) bullet.y = GAME_HEIGHT;
    if (bullet.y > GAME_HEIGHT) bullet.y = 0;
  });
  
  gameState.world.bullets = gameState.world.bullets.filter(bullet => 
    bullet.life > 0 && !bullet.hit
  );
}

function updateAsteroids(deltaTime) {
  gameState.world.asteroids.forEach(asteroid => {
    if (!asteroid.destroyed) {
      asteroid.update(deltaTime);
    }
  });
  
  // Física de colisão entre asteroides (impulso com massa)
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
          const j = -(1 + e) * velAlongNormal / (invMass1 + invMass2);
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
  gameState.world.xpOrbs.forEach(orb => {
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
  
  gameState.world.xpOrbs = gameState.world.xpOrbs.filter(orb => !orb.collected);
}

function updateParticles(deltaTime) {
  gameState.world.particles = gameState.world.particles.filter(particle => 
    particle.update(deltaTime)
  );
  
  // Limitar número de partículas para performance
  if (gameState.world.particles.length > 150) {
    gameState.world.particles = gameState.world.particles.slice(-100);
  }
}

// CORREÇÃO BUG 3: Sistema de ondas com timer regressivo de 60 segundos
function updateWaveSystem(deltaTime) {
  if (gameState.wave.isActive) {
    // Reduzir timer da onda
    gameState.wave.timeRemaining -= deltaTime;
    
    // Controlar spawn de asteroides
    if (gameState.wave.asteroidsSpawned < gameState.wave.totalAsteroids &&
        gameState.world.asteroids.length < MAX_ASTEROIDS_ON_SCREEN) {
      
      gameState.wave.spawnTimer -= deltaTime;
      
      if (gameState.wave.spawnTimer <= 0) {
        spawnAsteroid();
        gameState.wave.asteroidsSpawned++;
        gameState.wave.spawnTimer = gameState.wave.spawnDelay * (0.5 + Math.random() * 0.5);
      }
    }
    
    // Verificar se onda foi completada (timer chegou a 0 OU todos asteroides eliminados)
    const allAsteroidsKilled = gameState.wave.asteroidsKilled >= gameState.wave.totalAsteroids && 
                              gameState.world.asteroids.filter(a => !a.destroyed).length === 0;
    
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
  const side = Math.floor(Math.random() * 4);
  let x, y;
  const margin = 80;
  
  switch(side) {
    case 0: // Top
      x = Math.random() * GAME_WIDTH;
      y = -margin;
      break;
    case 1: // Right
      x = GAME_WIDTH + margin;
      y = Math.random() * GAME_HEIGHT;
      break;
    case 2: // Bottom
      x = Math.random() * GAME_WIDTH;
      y = GAME_HEIGHT + margin;
      break;
    case 3: // Left
      x = -margin;
      y = Math.random() * GAME_HEIGHT;break;
  }
  
  // Distribuição balanceada de tamanhos
  let size;
  const rand = Math.random();
  if (rand < 0.5) size = 'large';
  else if (rand < 0.8) size = 'medium';
  else size = 'small';
  
  const asteroid = new Asteroid(x, y, size);
  gameState.world.asteroids.push(asteroid);
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
    ASTEROIDS_PER_WAVE_BASE * Math.pow(ASTEROIDS_PER_WAVE_MULTIPLIER, gameState.wave.current - 1)
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
  const orb = {
    id: Date.now() + Math.random(),
    x: x,
    y: y,
    value: value,
    collected: false
  };
  
  gameState.world.xpOrbs.push(orb);
}

function collectXP(amount) {
  gameState.player.xp += amount;
  
  if (gameState.player.xp >= gameState.player.xpToNext) {
    levelUp();
  }
  
  updateUI();
}

function levelUp() {
  gameState.player.level++;
  gameState.player.xp = 0;
  gameState.player.xpToNext = Math.floor(gameState.player.xpToNext * 1.2);
  
  gameState.screen = 'levelup';
  showLevelUpScreen();

  audio.playLevelUp();
  addScreenShake(6, 0.4, 'celebration');
  addFreezeFrame(0.2, 0.4);
  createLevelUpExplosion();
  addScreenFlash('#FFD700', 0.15, 0.2);
}

function showLevelUpScreen() {
  showScreen('levelup');
  
  const levelText = document.getElementById('levelup-text');
  if (levelText) {
    levelText.textContent = `Level ${gameState.player.level} - Escolha sua tecnologia:`;
  }
  
  const shuffled = [...SPACE_UPGRADES].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 3);
  
  const container = document.getElementById('upgrades-container');
  if (container) {
    container.innerHTML = '';
    
    selected.forEach(upgrade => {
      const button = document.createElement('button');
      button.className = 'upgrade-option';
      button.onclick = () => selectUpgrade(upgrade.id);
      
      button.innerHTML = `
        <div class="upgrade-icon" style="color: ${upgrade.color};">
          ${upgrade.icon}
        </div>
        <div class="upgrade-info">
          <h3>${upgrade.name}</h3>
          <p>${upgrade.description}</p>
        </div>
      `;
      
      container.appendChild(button);
    });
  }
}

function selectUpgrade(upgradeId) {
  applyUpgrade(upgradeId);
  gameState.screen = 'playing';
  showGameUI();
}

function applyUpgrade(upgradeId) {
  switch(upgradeId) {
    case 'plasma':
      gameState.player.damage = Math.floor(gameState.player.damage * 1.25);
      break;
    case 'propulsors':
      // Aumenta velocidade máxima, aceleração e um pouco a rotação para melhor controle
      gameState.player.maxSpeed = Math.floor(gameState.player.maxSpeed * 1.2);
      gameState.player.acceleration = Math.floor(gameState.player.acceleration * 1.2);
      gameState.player.rotationSpeed = gameState.player.rotationSpeed * 1.1;
      break;
    case 'shield':
      gameState.player.maxHealth += 50;
      gameState.player.health = Math.min(
        gameState.player.health + 50, 
        gameState.player.maxHealth
      );
      break;
    case 'armor':
      gameState.player.armor = Math.min(gameState.player.armor + 25, 75);
      break;
    case 'multishot':
      gameState.player.multishot = Math.min(gameState.player.multishot + 1, 5);
      break;
    case 'magfield':
      gameState.player.magnetismRadius = Math.floor(gameState.player.magnetismRadius * 1.5);
      break;
  }
}

// Detecção de colisão melhorada
function checkCollisions() {
  // Colisões bala-asteroide
  gameState.world.bullets.forEach(bullet => {
    if (bullet.hit) return;
    
    gameState.world.asteroids.forEach(asteroid => {
      if (asteroid.destroyed) return;
      
      const dx = bullet.x - asteroid.x;
      const dy = bullet.y - asteroid.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < asteroid.radius + BULLET_SIZE) {
        bullet.hit = true;
        
        if (asteroid.takeDamage(bullet.damage)) {
          asteroid.destroyed = true;
          gameState.stats.totalKills++;
          gameState.wave.asteroidsKilled++;
          
          createAsteroidExplosion(asteroid);
          audio.playAsteroidBreak(asteroid.size);
          if (asteroid.size === 'large') {
            audio.playBigExplosion();
          }
          
          // Fragmentação
          const fragments = asteroid.fragment();
          gameState.world.asteroids.push(...fragments);
          
          // XP reward
          const xpValue = { large: 20, medium: 12, small: 8 }[asteroid.size];
          createXPOrb(
            asteroid.x + (Math.random() - 0.5) * 20,
            asteroid.y + (Math.random() - 0.5) * 20, 
            xpValue + gameState.wave.current * 2
          );
        }
      }
    });
  });
  
  // Remover balas destruídas
  gameState.world.bullets = gameState.world.bullets.filter(bullet => !bullet.hit);
  gameState.world.asteroids = gameState.world.asteroids.filter(asteroid => !asteroid.destroyed);
  
  // Colisões nave-asteroide
  gameState.world.asteroids.forEach(asteroid => {
    if (asteroid.destroyed) return;
    
    const dx = gameState.player.x - asteroid.x;
    const dy = gameState.player.y - asteroid.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < SHIP_SIZE + asteroid.radius) {
      // Normal de colisão
      const nx = dx / Math.max(distance, 1);
      const ny = dy / Math.max(distance, 1);
      // Correção de penetração
      const overlap = (SHIP_SIZE + asteroid.radius) - distance;
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
        const j = -(1 + e) * velAlongNormal / (invMass1 + invMass2);
        const jx = j * nx;
        const jy = j * ny;
        gameState.player.vx -= jx * invMass1;
        gameState.player.vy -= jy * invMass1;
        asteroid.vx += jx * invMass2;
        asteroid.vy += jy * invMass2;
      }

      // Dano baseado em momento relativo (com i-frames)
      if (gameState.player.invulnerableTimer <= 0) {
        const relSpeed = Math.sqrt((asteroid.vx - gameState.player.vx) ** 2 + (asteroid.vy - gameState.player.vy) ** 2);
        const baseDamage = 12;
        const momentumFactor = (asteroid.mass * relSpeed) / 120;
        const rawDamage = baseDamage + momentumFactor;
        const damage = Math.max(3, Math.floor(rawDamage) - gameState.player.armor);
        gameState.player.health -= damage;
        gameState.player.invulnerableTimer = 0.5;
        
        audio.playShipHit();
        addScreenShake(8, 0.3);
        
        if (gameState.player.health <= 0) {
          gameOver();
        }
      }
    }
  });
}

function createAsteroidExplosion(asteroid) {
  const particleCount = { large: 12, medium: 8, small: 5 }[asteroid.size];

  if (asteroid.size === 'small') {
    addScreenShake(2, 0.1);
  } else if (asteroid.size === 'medium') {
    addScreenShake(4, 0.15);
  } else if (asteroid.size === 'large') {
    addScreenShake(8, 0.25, 'explosion');
    addFreezeFrame(0.15, 0.2);
    addScreenFlash('#FF6B6B', 0.2, 0.1);
    if (typeof audio.playBigExplosion === 'function') {
      audio.playBigExplosion();
    }
  }

  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 80;
    
    // Debris
    const debris = new SpaceParticle(
      asteroid.x + (Math.random() - 0.5) * asteroid.radius,
      asteroid.y + (Math.random() - 0.5) * asteroid.radius,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      '#8B4513',
      2 + Math.random() * 3,
      0.6 + Math.random() * 0.4,
      'debris'
    );
    gameState.world.particles.push(debris);
    
    // Sparks
    const spark = new SpaceParticle(
      asteroid.x,
      asteroid.y,
      Math.cos(angle) * speed * 1.3,
      Math.sin(angle) * speed * 1.3,
      `hsl(${Math.random() * 60 + 15}, 100%, 70%)`,
      1.5 + Math.random() * 1.5,
      0.3 + Math.random() * 0.2,
      'spark'
    );
    gameState.world.particles.push(spark);
  }
}

function createXPCollectEffect(x, y) {
  for (let i = 0; i < 6; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 25 + Math.random() * 40;
    const particle = new SpaceParticle(
      x, y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      '#00DDFF',
      1.5 + Math.random() * 1.5,
      0.3 + Math.random() * 0.2
    );
    gameState.world.particles.push(particle);
  }
}

function createLevelUpExplosion() {
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 120;
    const particle = new SpaceParticle(
      gameState.player.x,
      gameState.player.y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      `hsl(${Math.random() * 40 + 40}, 100%, 60%)`,
      2 + Math.random() * 2,
      0.6 + Math.random() * 0.4,
      'spark'
    );
    gameState.world.particles.push(particle);
  }
}

function addScreenShake(intensity, duration) {
  gameState.screenShake.intensity = Math.max(gameState.screenShake.intensity, intensity);
  gameState.screenShake.duration = Math.max(gameState.screenShake.duration, duration);
  gameState.screenShake.timer = gameState.screenShake.duration;
}

function addFreezeFrame(duration, fade = 0) {
  gameState.freezeFrame.timer = Math.max(gameState.freezeFrame.timer, duration);
  gameState.freezeFrame.duration = Math.max(gameState.freezeFrame.duration, duration);
  gameState.freezeFrame.fade = fade;
}

function addScreenFlash(color, duration, intensity) {
  gameState.screenFlash.color = color;
  gameState.screenFlash.duration = duration;
  gameState.screenFlash.timer = duration;
  gameState.screenFlash.intensity = intensity;
}

function updateScreenShake(deltaTime) {
  if (gameState.screenShake.timer > 0) {
    gameState.screenShake.timer -= deltaTime;
    
    if (gameState.screenShake.timer <= 0) {
      gameState.screenShake.intensity = 0;
      gameState.screenShake.duration = 0;
    }
  }
}

function updateScreenFlash(deltaTime) {
  if (gameState.screenFlash.timer > 0) {
    gameState.screenFlash.timer -= deltaTime;
    if (gameState.screenFlash.timer < 0) gameState.screenFlash.timer = 0;
  }
}

function gameOver() {
  gameState.screen = 'gameover';
  showGameOverScreen();
}

function showGameOverScreen() {
  showScreen('gameover');
  
  const elements = [
    { id: 'final-level', value: gameState.player.level },
    { id: 'final-kills', value: gameState.stats.totalKills },
    { id: 'final-waves', value: gameState.wave.completedWaves },
    { id: 'final-time', value: Math.floor(gameState.stats.time) + 's' }
  ];
  
  elements.forEach(({ id, value }) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });
}

function renderGame() {
  if (!gameState.ctx) return;
  
  const ctx = gameState.ctx;
  
  ctx.save();
  
  // Screen shake
  if (gameState.screenShake.timer > 0) {
    const shakeAmount = gameState.screenShake.intensity * 
      (gameState.screenShake.timer / gameState.screenShake.duration);
    ctx.translate(
      (Math.random() - 0.5) * shakeAmount,
      (Math.random() - 0.5) * shakeAmount
    );
  }
  
  // Background
  const gradient = ctx.createRadialGradient(
    GAME_WIDTH/2, GAME_HEIGHT/2, 0, 
    GAME_WIDTH/2, GAME_HEIGHT/2, Math.max(GAME_WIDTH, GAME_HEIGHT)
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
    const size = Math.floor((i % 3)) + 1;
    ctx.fillRect(x, y, size, size);
  }
  
  // Partículas
  gameState.world.particles.forEach(particle => particle.draw(ctx));
  
  // XP orbs
  gameState.world.xpOrbs.forEach(orb => {
    if (orb.collected) return;
    
    // Glow effect
    const gradient = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, XP_ORB_SIZE * 2);
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
  gameState.world.bullets.forEach(bullet => {
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
    const gradient = ctx.createRadialGradient(bullet.x, bullet.y, 0, bullet.x, bullet.y, BULLET_SIZE * 3);
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
  gameState.world.asteroids.forEach(asteroid => {
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
  ctx.lineTo(-SHIP_SIZE/2, -SHIP_SIZE/2);
  ctx.lineTo(-SHIP_SIZE/3, 0);
  ctx.lineTo(-SHIP_SIZE/2, SHIP_SIZE/2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Wings
  ctx.fillStyle = '#0088DD';
  ctx.beginPath();
  ctx.moveTo(-SHIP_SIZE/3, -SHIP_SIZE/3);
  ctx.lineTo(-SHIP_SIZE, -SHIP_SIZE);
  ctx.lineTo(-SHIP_SIZE/2, -SHIP_SIZE/2);
  ctx.closePath();
  ctx.fill();
  
  ctx.beginPath();
  ctx.moveTo(-SHIP_SIZE/3, SHIP_SIZE/3);
  ctx.lineTo(-SHIP_SIZE, SHIP_SIZE);
  ctx.lineTo(-SHIP_SIZE/2, SHIP_SIZE/2);
  ctx.closePath();
  ctx.fill();
  
  // Cockpit
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(SHIP_SIZE/3, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
  
  // Magnetism field indicator
  if (gameState.world.xpOrbs.some(orb => !orb.collected)) {
    ctx.strokeStyle = 'rgba(0, 221, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(gameState.player.x, gameState.player.y, gameState.player.magnetismRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  
  // Target indicator
  if (gameState.world.currentTarget && !gameState.world.currentTarget.destroyed) {
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

  if (gameState.screenFlash.timer > 0) {
    const alpha = (gameState.screenFlash.timer / gameState.screenFlash.duration) * gameState.screenFlash.intensity;
    ctx.fillStyle = gameState.screenFlash.color;
    ctx.globalAlpha = alpha;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function updateUI() {
  try {
    const elements = [
      { id: 'health-display', value: `${Math.max(0, Math.floor(gameState.player.health))}/${gameState.player.maxHealth}` },
      { id: 'level-display', value: `Level ${gameState.player.level}` },
      { id: 'kills-display', value: `${gameState.stats.totalKills} asteroides` },
      { id: 'time-display', value: `${Math.floor(gameState.stats.time)}s` }
    ];
    
    elements.forEach(({ id, value }) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
    
    // XP Bar
    const xpPercent = (gameState.player.xp / gameState.player.xpToNext) * 100;
    const xpProgress = document.getElementById('xp-progress');
    const xpText = document.getElementById('xp-text');
    
    if (xpProgress) xpProgress.style.width = xpPercent + '%';
    if (xpText) xpText.textContent = `XP: ${gameState.player.xp} / ${gameState.player.xpToNext}`;
    
    // Wave info
    const waveTitle = document.getElementById('wave-title');
    const waveTimerDisplay = document.getElementById('wave-timer-display');
    const waveProgressBar = document.getElementById('wave-progress-bar');
    const waveEnemies = document.getElementById('wave-enemies');
    const waveCountdown = document.getElementById('wave-countdown');
    
    if (waveTitle) waveTitle.textContent = `Setor ${gameState.wave.current}`;
    
    if (gameState.wave.isActive) {
      // CORREÇÃO BUG 3: Mostrar timer regressivo
      const timeLeft = Math.max(0, Math.ceil(gameState.wave.timeRemaining));
      if (waveTimerDisplay) waveTimerDisplay.textContent = `${timeLeft}s`;
      
      const progress = Math.min((gameState.wave.asteroidsKilled / gameState.wave.totalAsteroids) * 100, 100);
      
      if (waveProgressBar) waveProgressBar.style.width = progress + '%';
      if (waveEnemies) waveEnemies.textContent = `${gameState.wave.asteroidsKilled} asteroides eliminados`;
      if (waveCountdown) waveCountdown.classList.add('hidden');
    } else {
      if (waveTimerDisplay) waveTimerDisplay.textContent = '0s';
      if (waveProgressBar) waveProgressBar.style.width = '100%';
      if (waveEnemies) waveEnemies.textContent = 'Setor Limpo!';
      
      const countdown = Math.ceil(gameState.wave.breakTimer);
      const countdownTimer = document.getElementById('countdown-timer');
      if (countdownTimer) countdownTimer.textContent = countdown;
      if (waveCountdown) waveCountdown.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Erro ao atualizar UI:', error);
  }
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  try {
    init();
    showScreen('menu');
    console.log('Aplicação inicializada com sucesso!');
  } catch (error) {
    console.error('Erro na inicialização:', error);
  }
});
