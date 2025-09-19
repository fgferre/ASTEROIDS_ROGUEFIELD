// src/modules/PlayerSystem.js
import * as CONSTANTS from '../core/GameConstants.js';
import shipModels from '../data/shipModels.js';

const DRIFT_SETTINGS = {
  rampSpeed: 2.8,
  decaySpeed: 5.2,
  brakeReduction: 0.4,
};

const SHIELD_LEVEL_CONFIG = {
  1: {
    maxHits: CONSTANTS.SHIELD_DEFAULT_HITS,
    cooldown: CONSTANTS.SHIELD_COOLDOWN_DURATION,
  },
  2: {
    maxHits: CONSTANTS.SHIELD_DEFAULT_HITS + 1,
    cooldown: CONSTANTS.SHIELD_COOLDOWN_DURATION,
  },
  3: {
    maxHits: CONSTANTS.SHIELD_DEFAULT_HITS + 1,
    cooldown: Math.max(5, CONSTANTS.SHIELD_COOLDOWN_DURATION - 5),
  },
  4: {
    maxHits: CONSTANTS.SHIELD_DEFAULT_HITS + 2,
    cooldown: Math.max(5, CONSTANTS.SHIELD_COOLDOWN_DURATION - 5),
  },
  5: {
    maxHits: CONSTANTS.SHIELD_DEFAULT_HITS + 2,
    cooldown: Math.max(5, CONSTANTS.SHIELD_COOLDOWN_DURATION - 5),
  },
};

class PlayerSystem {
  constructor(x = CONSTANTS.GAME_WIDTH / 2, y = CONSTANTS.GAME_HEIGHT / 2) {
    // === APENAS MOVIMENTO E POSIÇÃO ===
    this.position = { x, y };
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
    this.currentHull = shipModels.defaultHull;
    this.shieldUpgradeLevel = 0;
    this.shieldMaxHits = 0;
    this.shieldCurrentHits = 0;
    this.shieldCooldownTimer = 0;
    this.shieldMaxCooldown = 0;
    this.shieldWasInCooldown = false;
    this.isShieldActive = false;
    this.invulnerableTimer = 0;

    // Registrar no ServiceLocator
    if (typeof gameServices !== 'undefined') {
      gameServices.register('player', this);
    }

    // Escutar eventos de upgrade
    this.setupEventListeners();

    console.log('[PlayerSystem] Initialized at', this.position);
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
  }

  applyShieldLevel(level) {
    const config = SHIELD_LEVEL_CONFIG[level];
    if (!config) {
      return;
    }

    this.shieldUpgradeLevel = level;
    this.shieldMaxHits = config.maxHits;
    this.shieldMaxCooldown = config.cooldown;

    if (this.isShieldActive) {
      this.shieldCurrentHits = this.shieldMaxHits;
    } else if (this.shieldCooldownTimer <= 0) {
      this.shieldCurrentHits = this.shieldMaxHits;
    } else {
      this.shieldCurrentHits = Math.min(
        this.shieldCurrentHits,
        this.shieldMaxHits
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
      maxHits: this.shieldMaxHits,
      currentHits:
        this.isShieldActive || this.shieldCooldownTimer > 0
          ? this.shieldCurrentHits
          : this.shieldMaxHits,
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

    if (this.shieldMaxHits <= 0) {
      this.emitShieldActivationFailed('unavailable');
      return false;
    }

    this.isShieldActive = true;
    this.shieldCurrentHits = this.shieldMaxHits;
    this.shieldWasInCooldown = false;

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('shield-activated', {
        level: this.shieldUpgradeLevel,
        maxHits: this.shieldMaxHits,
      });
    }

    this.emitShieldStats();
    return true;
  }

  shieldTookHit() {
    if (!this.isShieldActive || this.shieldMaxHits <= 0) {
      return;
    }

    this.shieldCurrentHits = Math.max(0, this.shieldCurrentHits - 1);

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('shield-hit', {
        level: this.shieldUpgradeLevel,
        remainingHits: this.shieldCurrentHits,
        maxHits: this.shieldMaxHits,
      });
    }

    if (this.shieldCurrentHits <= 0) {
      this.breakShield();
    } else {
      this.emitShieldStats();
    }
  }

  breakShield() {
    if (!this.isShieldActive) {
      return;
    }

    this.isShieldActive = false;
    this.shieldCurrentHits = 0;

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('shield-broken', {
        level: this.shieldUpgradeLevel,
      });
    }

    if (this.shieldUpgradeLevel >= 5 && typeof gameEvents !== 'undefined') {
      const position = this.getPosition();
      gameEvents.emit('shield-shockwave', {
        position,
        radius: CONSTANTS.SHIELD_SHOCKWAVE_RADIUS,
        force: CONSTANTS.SHIELD_SHOCKWAVE_FORCE,
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
      this.shieldCurrentHits = this.shieldMaxHits;
    }

    this.emitShieldStats();
  }

  getShieldState() {
    return {
      level: this.shieldUpgradeLevel,
      maxHits: this.shieldMaxHits,
      currentHits:
        this.isShieldActive || this.shieldCooldownTimer > 0
          ? this.shieldCurrentHits
          : this.shieldMaxHits,
      cooldownTimer: this.shieldCooldownTimer,
      cooldownDuration: this.shieldMaxCooldown,
      isActive: this.isShieldActive,
      isUnlocked: this.shieldUpgradeLevel > 0,
      isOnCooldown: this.shieldCooldownTimer > 0,
    };
  }

  // === MÉTODO PRINCIPAL UPDATE ===
  update(deltaTime) {
    const inputSystem = gameServices.get('input');
    if (!inputSystem) {
      console.warn('[PlayerSystem] InputSystem not found');
      return;
    }

    if (this.shieldCooldownTimer > 0) {
      this.shieldCooldownTimer -= deltaTime;
      if (this.shieldCooldownTimer <= 0) {
        this.shieldCooldownTimer = 0;
        if (this.shieldWasInCooldown) {
          this.shieldWasInCooldown = false;
          this.shieldCurrentHits = this.shieldMaxHits;
          if (typeof gameEvents !== 'undefined') {
            gameEvents.emit('shield-recharged', {
              level: this.shieldUpgradeLevel,
            });
          }
          this.emitShieldStats();
        }
      }
    }

    const movement = inputSystem.getMovementInput();
    this.updateMovement(deltaTime, movement);
    this.updatePosition(deltaTime);

    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - deltaTime);
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

    const driftBrakeScale = 1 - this.driftFactor * DRIFT_SETTINGS.brakeReduction;

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
      });
    }

    if (thrAux > 0) {
      const thrusterPos = this.getLocalToWorld(CONSTANTS.SHIP_SIZE * 0.8, 0);
      gameEvents.emit('thruster-effect', {
        position: thrusterPos,
        direction: { x: -fwd.x, y: -fwd.y },
        intensity: thrAux,
        type: 'aux',
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
    if (!this.currentHull || !Array.isArray(this.currentHull.outline)) {
      return [];
    }

    return this.currentHull.outline.map((vertex) => ({ ...vertex }));
  }

  getShieldPadding() {
    if (
      this.currentHull &&
      typeof this.currentHull.shieldPadding === 'number' &&
      Number.isFinite(this.currentHull.shieldPadding)
    ) {
      return this.currentHull.shieldPadding;
    }

    return 0;
  }

  render(ctx, options = {}) {
    if (!ctx) return;

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
    const outline = Array.isArray(hull?.outline) ? hull.outline : [];

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
    if (this.isShieldActive) {
      this.shieldTookHit();
      return undefined;
    }

    const damageAmount = Math.max(0, amount);
    if (damageAmount <= 0) {
      return this.health;
    }

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
      damage: this.damage,
      multishot: this.multishot,
      magnetismRadius: this.magnetismRadius,
      shieldLevel: this.shieldUpgradeLevel,
      shieldMaxHits: this.shieldMaxHits,
      shieldCooldown: this.shieldMaxCooldown,
    };
  }

  // === SETTERS (para reset, teleport, etc.) ===
  setPosition(x, y) {
    this.position.x = x;
    this.position.y = y;
  }

  setAngle(angle) {
    this.angle = this.wrapAngle(angle);
  }

  resetShieldState() {
    this.shieldUpgradeLevel = 0;
    this.shieldMaxHits = 0;
    this.shieldCurrentHits = 0;
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
    this.invulnerableTimer = 0;
    this.driftFactor = 0;
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
