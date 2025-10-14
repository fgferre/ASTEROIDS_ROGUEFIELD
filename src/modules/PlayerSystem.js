// src/modules/PlayerSystem.js
import * as CONSTANTS from '../core/GameConstants.js';
import shipModels from '../data/shipModels.js';
import { normalizeDependencies, resolveService } from '../core/serviceUtils.js';

const DRIFT_SETTINGS = {
  rampSpeed: 2.8,
  decaySpeed: 5.2,
  brakeReduction: 0.4,
};

const SHIELD_LEVEL_CONFIG = {
  1: {
    maxHP: 50,
    cooldown: CONSTANTS.SHIELD_COOLDOWN_DURATION,
  },
  2: {
    maxHP: 75,
    cooldown: CONSTANTS.SHIELD_COOLDOWN_DURATION,
  },
  3: {
    maxHP: 75,
    cooldown: Math.max(5, CONSTANTS.SHIELD_COOLDOWN_DURATION - 5),
  },
  4: {
    maxHP: 100,
    cooldown: Math.max(5, CONSTANTS.SHIELD_COOLDOWN_DURATION - 5),
  },
  5: {
    maxHP: 125,
    cooldown: Math.max(4, CONSTANTS.SHIELD_COOLDOWN_DURATION - 7),
  },
};

class PlayerSystem {
  constructor(config = {}) {
    const { position, dependencies } = this.normalizeConfig(config);
    const normalizedDependencies = normalizeDependencies(dependencies);

    if (
      config &&
      typeof config === 'object' &&
      !Array.isArray(config)
    ) {
      if (
        config['command-queue'] &&
        !normalizedDependencies['command-queue']
      ) {
        normalizedDependencies['command-queue'] = config['command-queue'];
      }

      if (
        config.commandQueue &&
        !normalizedDependencies['command-queue']
      ) {
        normalizedDependencies['command-queue'] = config.commandQueue;
      }
    }

    this.dependencies = normalizedDependencies;
    this.commandQueue =
      this.dependencies['command-queue'] ||
      resolveService('command-queue', this.dependencies) ||
      null;
    this.commandQueueConsumerId = 'player-system';
    this.cachedMovementInput = this.getDefaultMovementBinary();
    this.lastConsumedMovementCommand = null;
    const startX = Number.isFinite(position?.x)
      ? position.x
      : CONSTANTS.GAME_WIDTH / 2;
    const startY = Number.isFinite(position?.y)
      ? position.y
      : CONSTANTS.GAME_HEIGHT / 2;

    // === APENAS MOVIMENTO E POSIÇÃO ===
    this.position = { x: startX, y: startY };
    this.velocity = { vx: 0, vy: 0 };
    this.angle = 0;
    this.targetAngle = 0; // Para rotação suave (futuro)
    this.angularVelocity = 0;
    this.driftFactor = 0;

    // === CONFIGURAÇÕES DE MOVIMENTO ===
    // Usar constantes do arquivo separado
    this.maxSpeed = CONSTANTS.SHIP_MAX_SPEED;
    this.acceleration = CONSTANTS.SHIP_ACCELERATION;
    this.rotationSpeed = CONSTANTS.SHIP_ROTATION_SPEED;
    this.linearDamping = CONSTANTS.SHIP_LINEAR_DAMPING;
    this.angularDamping = CONSTANTS.SHIP_ANGULAR_DAMPING;

    // === STATS DO JOGADOR ===
    this.health = 100;
    this.maxHealth = 100;
    this.damage = 25;
    this.multishot = 1;
    this.magnetismRadius = CONSTANTS.MAGNETISM_RADIUS;
    this.currentHull = null;
    this._currentHullMetrics = {
      outline: [],
      boundingRadius: CONSTANTS.SHIP_SIZE,
      shieldPadding: 0,
    };
    this.setHull(shipModels.defaultHull);

    // === VISUAL UPGRADE LEVELS ===
    this.thrusterVisualLevel = 0;
    this.rcsVisualLevel = 0;
    this.brakingVisualLevel = 0;

    // === WEAPON RECOIL ===
    this.recoilOffset = { x: 0, y: 0 };
    this.recoilDecay = 0.85; // Fast decay for snappy feel

    this.shieldUpgradeLevel = 0;
    this.shieldMaxHP = 0;
    this.shieldHP = 0;
    this.shieldCooldownTimer = 0;
    this.shieldMaxCooldown = 0;
    this.shieldWasInCooldown = false;
    this.isShieldActive = false;
    this.invulnerableTimer = 0;

    // === DEATH/RETRY STATE ===
    this.isDead = false;
    this.isRetrying = false;

    // Registrar no ServiceLocator
    if (typeof gameServices !== 'undefined') {
      gameServices.register('player', this);
    }

    // Escutar eventos de upgrade
    this.setupEventListeners();

    console.log('[PlayerSystem] Initialized at', this.position);
  }

  normalizeConfig(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return { position: null, dependencies: {} };
    }

    const { position = null, dependencies = null, ...rest } = config;

    if (dependencies && typeof dependencies === 'object' && !Array.isArray(dependencies)) {
      return { position, dependencies };
    }

    return { position, dependencies: rest };
  }

  getCommandQueue() {
    if (this.commandQueue) {
      return this.commandQueue;
    }

    if (this.dependencies && this.dependencies['command-queue']) {
      this.commandQueue = this.dependencies['command-queue'];
      return this.commandQueue;
    }

    this.commandQueue = resolveService('command-queue', this.dependencies) || null;

    if (this.commandQueue && this.dependencies) {
      this.dependencies['command-queue'] = this.commandQueue;
    }

    return this.commandQueue;
  }

  consumeMovementCommands() {
    const queue = this.getCommandQueue();

    if (!queue || typeof queue.consume !== 'function') {
      return { consumed: false, binary: null };
    }

    let entries;

    try {
      entries = queue.consume({
        types: ['move'],
        consumerId: this.commandQueueConsumerId,
      });
    } catch (error) {
      console.warn('[PlayerSystem] Failed to consume move commands:', error);
      return { consumed: false, binary: null };
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return { consumed: false, binary: null };
    }

    const latestEntry = entries[entries.length - 1];
    const normalizedBinary = this.extractMovementBinary(latestEntry);

    if (!normalizedBinary) {
      this.lastConsumedMovementCommand = latestEntry || null;
      return { consumed: true, binary: null };
    }

    this.cachedMovementInput = { ...normalizedBinary };
    this.lastConsumedMovementCommand = latestEntry || null;

    return { consumed: true, binary: { ...normalizedBinary } };
  }

  extractMovementBinary(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const payload = entry.payload || null;

    if (payload && typeof payload === 'object') {
      if (payload.binary && typeof payload.binary === 'object') {
        return this.normalizeMovementBinary(payload.binary);
      }

      if (payload.axes && typeof payload.axes === 'object') {
        const threshold = 0.25;
        const x = Number(payload.axes.x) || 0;
        const y = Number(payload.axes.y) || 0;

        return this.normalizeMovementBinary({
          up: y < -threshold,
          down: y > threshold,
          left: x < -threshold,
          right: x > threshold,
        });
      }
    }

    return null;
  }

  normalizeMovementBinary(binary) {
    if (!binary || typeof binary !== 'object') {
      return this.getDefaultMovementBinary();
    }

    return {
      up: Boolean(binary.up),
      down: Boolean(binary.down),
      left: Boolean(binary.left),
      right: Boolean(binary.right),
    };
  }

  getDefaultMovementBinary() {
    return {
      up: false,
      down: false,
      left: false,
      right: false,
    };
  }

  pullLegacyMovementFromInput(inputSystem) {
    if (!inputSystem || typeof inputSystem.getMovementInput !== 'function') {
      return null;
    }

    try {
      const legacy = inputSystem.getMovementInput();
      if (legacy && typeof legacy === 'object') {
        return this.normalizeMovementBinary(legacy);
      }
    } catch (error) {
      console.warn('[PlayerSystem] Failed to read legacy movement input:', error);
    }

    return null;
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') return;

    gameEvents.on('upgrade-damage-boost', (data) => {
      this.damage = Math.floor(this.damage * data.multiplier);
      console.log('[PlayerSystem] Damage boosted to', this.damage);
    });

    gameEvents.on('upgrade-speed-boost', (data) => {
      this.maxSpeed = Math.floor(this.maxSpeed * data.multiplier);
      console.log('[PlayerSystem] Speed boosted to', this.maxSpeed);
    });

    gameEvents.on('upgrade-acceleration-boost', (data) => {
      this.acceleration = this.acceleration * data.multiplier;
      console.log('[PlayerSystem] Acceleration boosted to', this.acceleration);
    });

    gameEvents.on('upgrade-rotation-boost', (data) => {
      this.rotationSpeed = this.rotationSpeed * data.multiplier;
      console.log('[PlayerSystem] Rotation speed boosted to', this.rotationSpeed);
    });

    gameEvents.on('upgrade-angular-damping', (data) => {
      this.angularDamping = this.angularDamping * data.multiplier;
      console.log('[PlayerSystem] Angular damping adjusted to', this.angularDamping);
    });

    gameEvents.on('upgrade-linear-damping', (data) => {
      this.linearDamping = this.linearDamping * data.multiplier;
      console.log('[PlayerSystem] Linear damping adjusted to', this.linearDamping);
    });

    gameEvents.on('upgrade-thruster-visual', (data) => {
      this.thrusterVisualLevel = data.level || 0;
      console.log('[PlayerSystem] Thruster visual level:', this.thrusterVisualLevel);
    });

    gameEvents.on('upgrade-rcs-visual', (data) => {
      this.rcsVisualLevel = data.level || 0;
      console.log('[PlayerSystem] RCS visual level:', this.rcsVisualLevel);
    });

    gameEvents.on('upgrade-braking-visual', (data) => {
      this.brakingVisualLevel = data.level || 0;
      console.log('[PlayerSystem] Braking visual level:', this.brakingVisualLevel);
    });

    gameEvents.on('upgrade-health-boost', (data) => {
      this.maxHealth += data.bonus;
      this.health = Math.min(this.health + data.bonus, this.maxHealth);
      console.log('[PlayerSystem] Health boosted to', this.maxHealth);
    });

    gameEvents.on('upgrade-multishot', (data) => {
      this.multishot += data.bonus;
      console.log('[PlayerSystem] Multishot boosted to', this.multishot);
    });

    gameEvents.on('upgrade-magnetism', (data) => {
      this.magnetismRadius = Math.floor(this.magnetismRadius * data.multiplier);
      console.log('[PlayerSystem] Magnetism boosted to', this.magnetismRadius);
    });

    gameEvents.on('upgrade-deflector-shield', (data = {}) => {
      const level = Number(data.level);
      if (!Number.isFinite(level) || level <= 0) {
        return;
      }

      this.applyShieldLevel(level);
      console.log('[PlayerSystem] Deflector shield upgraded to level', level);
    });

    gameEvents.on('weapon-fired', (data) => {
      // Apply recoil when weapon fires
      if (data?.position && data?.target) {
        const dx = data.target.x - data.position.x;
        const dy = data.target.y - data.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
          // Recoil opposite to firing direction
          const recoilStrength = 2.5; // pixels
          this.recoilOffset.x = -(dx / distance) * recoilStrength;
          this.recoilOffset.y = -(dy / distance) * recoilStrength;
        }
      }
    });
  }

  applyShieldLevel(level) {
    const config = SHIELD_LEVEL_CONFIG[level];
    if (!config) {
      return;
    }

    this.shieldUpgradeLevel = level;
    this.shieldMaxHP = config.maxHP;
    this.shieldMaxCooldown = config.cooldown;

    if (this.isShieldActive) {
      this.shieldHP = this.shieldMaxHP;
    } else if (this.shieldCooldownTimer <= 0) {
      this.shieldHP = this.shieldMaxHP;
    } else {
      this.shieldHP = Math.min(
        this.shieldHP,
        this.shieldMaxHP
      );
    }

    if (level === 1) {
      this.shieldCooldownTimer = 0;
      this.shieldWasInCooldown = false;
    } else {
      this.shieldCooldownTimer = Math.min(
        this.shieldCooldownTimer,
        this.shieldMaxCooldown
      );
    }

    this.emitShieldStats();
  }

  emitShieldStats() {
    if (typeof gameEvents === 'undefined') return;

    gameEvents.emit('shield-stats-changed', {
      level: this.shieldUpgradeLevel,
      maxHP: this.shieldMaxHP,
      currentHP:
        this.isShieldActive || this.shieldCooldownTimer > 0
          ? this.shieldHP
          : this.shieldMaxHP,
      isActive: this.isShieldActive,
      cooldownTimer: this.shieldCooldownTimer,
      cooldownDuration: this.shieldMaxCooldown,
    });
  }

  emitShieldActivationFailed(reason) {
    if (typeof gameEvents === 'undefined') return;

    gameEvents.emit('shield-activation-failed', {
      reason,
      level: this.shieldUpgradeLevel,
    });
  }

  activateShield() {
    if (this.shieldUpgradeLevel <= 0) {
      this.emitShieldActivationFailed('locked');
      return false;
    }

    if (this.isShieldActive) {
      this.emitShieldActivationFailed('active');
      return false;
    }

    if (this.shieldCooldownTimer > 0) {
      this.emitShieldActivationFailed('cooldown');
      return false;
    }

    if (this.shieldMaxHP <= 0) {
      this.emitShieldActivationFailed('unavailable');
      return false;
    }

    this.isShieldActive = true;
    this.shieldHP = this.shieldMaxHP;
    this.shieldWasInCooldown = false;

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('shield-activated', {
        level: this.shieldUpgradeLevel,
        maxHP: this.shieldMaxHP,
      });
    }

    this.emitShieldStats();
    return true;
  }

  shieldTookDamage(damageAmount) {
    if (!this.isShieldActive || this.shieldMaxHP <= 0) {
      return false;
    }

    const actualDamage = Math.max(0, damageAmount);
    this.shieldHP = Math.max(0, this.shieldHP - actualDamage);

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('shield-hit', {
        level: this.shieldUpgradeLevel,
        remainingHP: this.shieldHP,
        maxHP: this.shieldMaxHP,
        damage: actualDamage,
      });
    }

    if (this.shieldHP <= 0) {
      this.breakShield();
    } else {
      this.emitShieldStats();
    }

    return true;
  }

  breakShield() {
    if (!this.isShieldActive) {
      return;
    }

    this.isShieldActive = false;
    this.shieldHP = 0;

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('shield-broken', {
        level: this.shieldUpgradeLevel,
      });
    }

    // Level 5: Deflective explosion on shield break
    if (this.shieldUpgradeLevel >= 5 && typeof gameEvents !== 'undefined') {
      const position = this.getPosition();
      gameEvents.emit('shield-deflective-explosion', {
        position,
        level: this.shieldUpgradeLevel,
      });
    }

    if (this.shieldMaxCooldown > 0) {
      this.shieldCooldownTimer = this.shieldMaxCooldown;
      this.shieldWasInCooldown = true;
    } else {
      this.shieldCooldownTimer = 0;
      this.shieldWasInCooldown = false;
      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('shield-recharged', {
          level: this.shieldUpgradeLevel,
        });
      }
      this.shieldHP = this.shieldMaxHP;
    }

    this.emitShieldStats();
  }

  getShieldState() {
    return {
      level: this.shieldUpgradeLevel,
      maxHits: this.shieldMaxHP, // For backward compatibility with rendering
      currentHits: this.isShieldActive || this.shieldCooldownTimer > 0
          ? this.shieldHP
          : this.shieldMaxHP, // For backward compatibility with rendering
      maxHP: this.shieldMaxHP,
      currentHP:
        this.isShieldActive || this.shieldCooldownTimer > 0
          ? this.shieldHP
          : this.shieldMaxHP,
      cooldownTimer: this.shieldCooldownTimer,
      cooldownDuration: this.shieldMaxCooldown,
      isActive: this.isShieldActive,
      isUnlocked: this.shieldUpgradeLevel > 0,
      isOnCooldown: this.shieldCooldownTimer > 0,
    };
  }

  // === MÉTODO PRINCIPAL UPDATE ===
  update(deltaTime) {
    const commandQueue = this.getCommandQueue();
    const inputSystem = resolveService('input', this.dependencies);

    if (!inputSystem && !commandQueue) {
      console.warn('[PlayerSystem] InputSystem and CommandQueue not found');
      return;
    }

    const { consumed, binary } = this.consumeMovementCommands();
    let movement = null;

    if (consumed && binary) {
      movement = { ...binary };
    } else if (!commandQueue) {
      const legacyMovement = this.pullLegacyMovementFromInput(inputSystem);
      if (legacyMovement) {
        this.cachedMovementInput = { ...legacyMovement };
        movement = { ...legacyMovement };
      }
    }

    if (!movement) {
      movement = { ...this.cachedMovementInput };
    }

    if (this.shieldCooldownTimer > 0) {
      this.shieldCooldownTimer -= deltaTime;
      if (this.shieldCooldownTimer <= 0) {
        this.shieldCooldownTimer = 0;
        if (this.shieldWasInCooldown) {
          this.shieldWasInCooldown = false;
          this.shieldHP = this.shieldMaxHP;
          if (typeof gameEvents !== 'undefined') {
            gameEvents.emit('shield-recharged', {
              level: this.shieldUpgradeLevel,
            });
          }
          this.emitShieldStats();
        } else {
          this.emitShieldStats(); // Emit stats during cooldown for UI progress bar
        }
      }
    }

    // === ONLY UPDATE WHEN ALIVE: ===
    if (this.isDead || this.isRetrying) {
      return; // Don't process input, movement, or effects when dead/retrying
    }

    this.updateMovement(deltaTime, movement);
    this.updatePosition(deltaTime);

    // Update weapon recoil (decay over time)
    this.recoilOffset.x *= this.recoilDecay;
    this.recoilOffset.y *= this.recoilDecay;

    // Clear recoil when very small (prevent tiny jitter)
    if (Math.abs(this.recoilOffset.x) < 0.01) this.recoilOffset.x = 0;
    if (Math.abs(this.recoilOffset.y) < 0.01) this.recoilOffset.y = 0;

    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - deltaTime);
    }

    if (this.shieldHitGraceTimer > 0) {
      this.shieldHitGraceTimer = Math.max(
        0,
        this.shieldHitGraceTimer - deltaTime
      );
    }

    // Emitir evento para outros sistemas
    // Usamos o método 'emitSilently' para não poluir o console a cada frame.
    if (typeof gameEvents !== 'undefined') {
      gameEvents.emitSilently('player-moved', {
        position: { ...this.position },
        velocity: { ...this.velocity },
        angle: this.angle,
      });
    }
  }

  // === LÓGICA DE MOVIMENTO (COPIADA DO ORIGINAL) ===
  updateMovement(deltaTime, input) {
    // COPIAR EXATAMENTE da função updatePlayerMovement() original
    const accelStep = this.acceleration * deltaTime;
    const fwd = {
      x: Math.cos(this.angle),
      y: Math.sin(this.angle),
    };

    // Thruster intensities (lógica do original)
    let thrMain = input.up ? 1 : 0;
    let thrAux = input.down ? 1 : 0;
    let thrSideR = input.left ? 1 : 0; // CCW torque
    let thrSideL = input.right ? 1 : 0; // CW torque

    // Auto-brake quando não há input linear
    const noLinearInput = !input.up && !input.down;
    const speed = Math.hypot(this.velocity.vx, this.velocity.vy);

    if (noLinearInput) {
      this.driftFactor = Math.min(
        1,
        this.driftFactor + DRIFT_SETTINGS.rampSpeed * deltaTime
      );
    } else {
      this.driftFactor = Math.max(
        0,
        this.driftFactor - DRIFT_SETTINGS.decaySpeed * deltaTime
      );
    }

    const driftBrakeScale =
      1 - this.driftFactor * DRIFT_SETTINGS.brakeReduction;

    if (noLinearInput && speed > 2) {
      const proj = this.velocity.vx * fwd.x + this.velocity.vy * fwd.y;
      const kBase = Math.max(
        0.35,
        Math.min(1, Math.abs(proj) / (this.maxSpeed * 0.8))
      );
      const k = kBase * driftBrakeScale;
      if (proj > 0) thrAux = Math.max(thrAux, k);
      else if (proj < 0) thrMain = Math.max(thrMain, k);
    }

    // Aplicar forças dos thrusters
    if (thrMain > 0) {
      this.velocity.vx += fwd.x * accelStep * thrMain;
      this.velocity.vy += fwd.y * accelStep * thrMain;
    }
    if (thrAux > 0) {
      this.velocity.vx -= fwd.x * accelStep * thrAux;
      this.velocity.vy -= fwd.y * accelStep * thrAux;
    }

    // Amortecimento ambiente
    const linearDamp = Math.exp(-this.linearDamping * deltaTime);
    this.velocity.vx *= linearDamp;
    this.velocity.vy *= linearDamp;

    // Limitar velocidade máxima
    const currentSpeed = Math.hypot(this.velocity.vx, this.velocity.vy);
    if (currentSpeed > this.maxSpeed) {
      const scale = this.maxSpeed / currentSpeed;
      this.velocity.vx *= scale;
      this.velocity.vy *= scale;
    }

    // === MOVIMENTO ANGULAR ===
    // Restaurando a lógica de aceleração e amortecimento angular do app.js original
    const rotationAccel = this.rotationSpeed * deltaTime;
    let angularAccel = 0;
    if (thrSideR) angularAccel -= rotationAccel; // 'a' ou 'arrowleft'
    if (thrSideL) angularAccel += rotationAccel; // 'd' ou 'arrowright'

    this.angularVelocity += angularAccel;

    // Amortecimento angular
    const angularDamp = Math.exp(-this.angularDamping * deltaTime);
    this.angularVelocity *= angularDamp;

    // Limitar velocidade angular (clamp)
    const maxAng = this.rotationSpeed;
    if (this.angularVelocity > maxAng) this.angularVelocity = maxAng;
    if (this.angularVelocity < -maxAng) this.angularVelocity = -maxAng;
    this.angle = this.wrapAngle(this.angle + this.angularVelocity * deltaTime);

    // === EFEITOS DE THRUSTER ===
    // Emitir eventos para EffectsSystem
    if (thrMain > 0) {
      const thrusterPos = this.getLocalToWorld(-CONSTANTS.SHIP_SIZE * 0.8, 0);
      gameEvents.emit('thruster-effect', {
        position: thrusterPos,
        direction: { x: fwd.x, y: fwd.y },
        intensity: thrMain,
        type: 'main',
        visualLevel: this.thrusterVisualLevel,
      });
    }

    if (thrAux > 0) {
      const thrusterPos = this.getLocalToWorld(CONSTANTS.SHIP_SIZE * 0.8, 0);
      gameEvents.emit('thruster-effect', {
        position: thrusterPos,
        direction: { x: -fwd.x, y: -fwd.y },
        intensity: thrAux,
        type: 'aux',
        visualLevel: this.brakingVisualLevel,
      });
    }

    // Side thrusters
    if (thrSideL > 0) {
      const thrusterPos = this.getLocalToWorld(0, -CONSTANTS.SHIP_SIZE * 0.52);
      const dir = this.getLocalDirection(0, 1);
      gameEvents.emit('thruster-effect', {
        position: thrusterPos,
        direction: dir,
        intensity: thrSideL,
        type: 'side',
        visualLevel: this.rcsVisualLevel,
      });
    }

    if (thrSideR > 0) {
      const thrusterPos = this.getLocalToWorld(0, CONSTANTS.SHIP_SIZE * 0.52);
      const dir = this.getLocalDirection(0, -1);
      gameEvents.emit('thruster-effect', {
        position: thrusterPos,
        direction: dir,
        intensity: thrSideR,
        type: 'side',
        visualLevel: this.rcsVisualLevel,
      });
    }
  }

  updatePosition(deltaTime) {
    // Integrar posição
    this.position.x += this.velocity.vx * deltaTime;
    this.position.y += this.velocity.vy * deltaTime;

    // Screen wrapping
    if (this.position.x < 0) this.position.x = CONSTANTS.GAME_WIDTH;
    if (this.position.x > CONSTANTS.GAME_WIDTH) this.position.x = 0;
    if (this.position.y < 0) this.position.y = CONSTANTS.GAME_HEIGHT;
    if (this.position.y > CONSTANTS.GAME_HEIGHT) this.position.y = 0;
  }

  // === UTILITÁRIOS ===
  computeHullMetrics(hullDefinition) {
    if (!hullDefinition) {
      return {
        outline: [],
        boundingRadius: CONSTANTS.SHIP_SIZE,
        shieldPadding: 0,
      };
    }

    const outline = Array.isArray(hullDefinition.outline)
      ? hullDefinition.outline.map((vertex) => ({
          x: Number.isFinite(vertex?.x) ? vertex.x : 0,
          y: Number.isFinite(vertex?.y) ? vertex.y : 0,
        }))
      : [];

    let boundingRadius = 0;
    outline.forEach((vertex) => {
      const radius = Math.hypot(vertex.x, vertex.y);
      if (radius > boundingRadius) {
        boundingRadius = radius;
      }
    });

    if (boundingRadius <= 0) {
      boundingRadius = CONSTANTS.SHIP_SIZE;
    }

    const shieldPadding =
      typeof hullDefinition.shieldPadding === 'number' &&
      Number.isFinite(hullDefinition.shieldPadding)
        ? hullDefinition.shieldPadding
        : 0;

    return {
      outline,
      boundingRadius,
      shieldPadding,
    };
  }

  wrapAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  // Transform local ship coordinates to world
  getLocalToWorld(localX, localY) {
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    return {
      x: this.position.x + (localX * cos - localY * sin),
      y: this.position.y + (localX * sin + localY * cos),
    };
  }

  // Transform local direction to world
  getLocalDirection(dx, dy) {
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos,
    };
  }

  // === GETTERS PÚBLICOS ===
  getPosition() {
    return { ...this.position };
  }

  getAngle() {
    return this.angle;
  }

  getVelocity() {
    return { ...this.velocity };
  }

  getAngularVelocity() {
    return this.angularVelocity;
  }

  getMagnetismRadius() {
    return this.magnetismRadius;
  }

  getHullOutline() {
    if (
      !this._currentHullMetrics ||
      !Array.isArray(this._currentHullMetrics.outline)
    ) {
      return [];
    }

    return this._currentHullMetrics.outline.map((vertex) => ({ ...vertex }));
  }

  getHullBoundingRadius() {
    if (
      this._currentHullMetrics &&
      typeof this._currentHullMetrics.boundingRadius === 'number'
    ) {
      return this._currentHullMetrics.boundingRadius;
    }

    return CONSTANTS.SHIP_SIZE;
  }

  getShieldPadding() {
    if (
      this._currentHullMetrics &&
      typeof this._currentHullMetrics.shieldPadding === 'number'
    ) {
      return this._currentHullMetrics.shieldPadding;
    }

    return 0;
  }

  getShieldRadius() {
    return this.getHullBoundingRadius() + this.getShieldPadding();
  }

  getShieldImpactProfile() {
    if (this.shieldUpgradeLevel <= 0) {
      return { damage: 0, forceMultiplier: 1, level: 0 };
    }

    const level = this.shieldUpgradeLevel;
    const damage =
      CONSTANTS.SHIELD_IMPACT_DAMAGE_BASE +
      CONSTANTS.SHIELD_IMPACT_DAMAGE_PER_LEVEL * Math.max(0, level - 1);
    const forceMultiplier = 1 + Math.max(0, level - 1) * 0.22;

    return { damage, forceMultiplier, level };
  }

  render(ctx, options = {}) {
    if (!ctx) return;

    // Hide ship when dead or during quit explosion
    if (this.isDead || this._quitExplosionHidden) return;

    const tilt = typeof options.tilt === 'number' ? options.tilt : 0;

    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    ctx.rotate(this.angle);

    if (tilt !== 0) {
      ctx.transform(1, 0, tilt, 1, 0, 0);
    }

    ctx.fillStyle = '#00FF88';
    ctx.strokeStyle = '#00DD77';
    ctx.lineWidth = 2;

    const hull = this.currentHull;
    const outline = Array.isArray(this._currentHullMetrics?.outline)
      ? this._currentHullMetrics.outline
      : Array.isArray(hull?.outline)
        ? hull.outline
        : [];

    if (outline.length >= 3) {
      ctx.beginPath();
      let hasMoved = false;
      outline.forEach((vertex) => {
        if (!vertex) return;
        if (!hasMoved) {
          ctx.moveTo(vertex.x, vertex.y);
          hasMoved = true;
        } else {
          ctx.lineTo(vertex.x, vertex.y);
        }
      });

      if (hasMoved) {
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    const accents = Array.isArray(hull?.accents) ? hull.accents : [];
    if (accents.length > 0) {
      ctx.fillStyle = '#0088DD';
      accents.forEach((polygon) => {
        if (!Array.isArray(polygon) || polygon.length === 0) {
          return;
        }
        ctx.beginPath();
        let accentHasMoved = false;
        polygon.forEach((vertex) => {
          if (!vertex) return;
          if (!accentHasMoved) {
            ctx.moveTo(vertex.x, vertex.y);
            accentHasMoved = true;
          } else {
            ctx.lineTo(vertex.x, vertex.y);
          }
        });
        if (accentHasMoved) {
          ctx.closePath();
          ctx.fill();
        }
      });
    }

    const cockpit = hull?.cockpit;
    if (cockpit?.position && typeof cockpit.radius === 'number') {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(
        cockpit.position.x,
        cockpit.position.y,
        Math.max(0, cockpit.radius),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
  }

  // === GERENCIAMENTO DE VIDA ===
  takeDamage(amount) {
    const damageAmount = Math.max(0, amount);
    if (damageAmount <= 0) {
      return this.health;
    }

    // Shield absorbs damage if active
    if (this.isShieldActive) {
      this.shieldTookDamage(damageAmount);
      return undefined; // Shield absorbed all damage
    }

    // Apply damage to health
    const previousHealth = this.health;
    this.health = Math.max(0, this.health - damageAmount);

    if (this.health !== previousHealth && typeof gameEvents !== 'undefined') {
      gameEvents.emit('player-health-changed', {
        current: this.health,
        max: this.maxHealth,
      });
    }

    return this.health;
  }

  setInvulnerableTimer(duration) {
    this.invulnerableTimer = duration;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + Math.max(0, amount));
    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('player-health-changed', {
        current: this.health,
        max: this.maxHealth,
      });
    }
    return this.health;
  }

  getStats() {
    return {
      health: this.health,
      maxHealth: this.maxHealth,
      maxHP: this.maxHealth, // Alias for consistency
      damage: this.damage,
      multishot: this.multishot,
      magnetismRadius: this.magnetismRadius,
      shieldLevel: this.shieldUpgradeLevel,
      shieldMaxHP: this.shieldMaxHP,
      shieldCooldown: this.shieldMaxCooldown,
      recoilOffset: this.recoilOffset, // Expose recoil for rendering
    };
  }

  // === SETTERS (para reset, teleport, etc.) ===
  setHull(hullDefinition) {
    if (!hullDefinition) {
      this.currentHull = null;
      this._currentHullMetrics = {
        outline: [],
        boundingRadius: CONSTANTS.SHIP_SIZE,
        shieldPadding: 0,
      };
      return false;
    }

    this.currentHull = hullDefinition;
    this._currentHullMetrics = this.computeHullMetrics(hullDefinition);
    return true;
  }

  setPosition(x, y) {
    this.position.x = x;
    this.position.y = y;
  }

  setAngle(angle) {
    this.angle = this.wrapAngle(angle);
  }

  resetShieldState() {
    this.shieldUpgradeLevel = 0;
    this.shieldMaxHP = 0;
    this.shieldHP = 0;
    this.shieldCooldownTimer = 0;
    this.shieldMaxCooldown = 0;
    this.shieldWasInCooldown = false;
    this.isShieldActive = false;
  }

  resetStats() {
    this.health = 100;
    this.maxHealth = 100;
    this.damage = 25;
    this.multishot = 1;
    this.magnetismRadius = CONSTANTS.MAGNETISM_RADIUS;
    this.maxSpeed = CONSTANTS.SHIP_MAX_SPEED;
    this.acceleration = CONSTANTS.SHIP_ACCELERATION;
    this.rotationSpeed = CONSTANTS.SHIP_ROTATION_SPEED;
    this.linearDamping = CONSTANTS.SHIP_LINEAR_DAMPING;
    this.angularDamping = CONSTANTS.SHIP_ANGULAR_DAMPING;
    this.invulnerableTimer = 0;
    this.driftFactor = 0;

    // Reset visual upgrade levels
    this.thrusterVisualLevel = 0;
    this.rcsVisualLevel = 0;
    this.brakingVisualLevel = 0;

    this.resetShieldState();
  }

  reset() {
    this.resetStats();
    this.position = {
      x: CONSTANTS.GAME_WIDTH / 2,
      y: CONSTANTS.GAME_HEIGHT / 2,
    };
    this.velocity = { vx: 0, vy: 0 };
    this.angle = 0;
    this.angularVelocity = 0;
    this.driftFactor = 0;
    this._quitExplosionHidden = false; // Reset visibility flag
    this.isDead = false;
    this.isRetrying = false;
  }

  markDead() {
    this.isDead = true;
    this.isRetrying = false;
    console.log('[PlayerSystem] Player marked as dead');
  }

  respawn(position, invulnerabilityDuration = 3) {
    this.isDead = false;
    this.isRetrying = false;

    if (position) {
      this.position.x = position.x;
      this.position.y = position.y;
    }

    // Reset velocity and rotation
    this.velocity.vx = 0;
    this.velocity.vy = 0;
    this.angularVelocity = 0;
    this.driftFactor = 0;

    // Give invulnerability
    this.invulnerableTimer = invulnerabilityDuration;

    // Show ship again
    this._quitExplosionHidden = false;

    console.log('[PlayerSystem] Player respawned at', position, 'with', invulnerabilityDuration, 's invulnerability');
  }

  heal(amount) {
    if (this.isDead) return 0;

    const oldHealth = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    const actualHealing = this.health - oldHealth;

    if (actualHealing > 0 && typeof gameEvents !== 'undefined') {
      gameEvents.emit('player-healed', {
        amount: actualHealing,
        currentHealth: this.health,
        maxHealth: this.maxHealth
      });
    }

    return actualHealing;
  }

  destroy() {
    console.log('[PlayerSystem] Destroyed');
  }
}

export default PlayerSystem;

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlayerSystem;
}
