import * as CONSTANTS from '../../../core/GameConstants.js';
import RandomService from '../../../core/RandomService.js';
import { BaseEnemy } from '../base/BaseEnemy.js';
import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';

const SOURCE_CONFIG = CONSTANTS?.BOSS_CONFIG || {};

const BASE_CONFIG = {
  key: 'boss',
  displayName: 'Apex Overlord',
  radius: 60,
  safeDistance: 220,
  entryPadding: 24,
  entryDriftSpeed: 80,
  health: 1500,
  healthScaling: 1.2,
  speed: 60,
  acceleration: 120,
  contactDamage: 45,
  projectileDamage: 35,
  spreadProjectileCount: 7,
  spreadProjectileSpeed: 260,
  spreadInterval: 2.4,
  spreadVariance: 0.45,
  spreadArc: 0.85,
  spreadAngleVariance: 0.12,
  volleyBurstSize: 5,
  volleyShotDelay: 0.16,
  volleyInterval: 1.35,
  volleyVariance: 0.2,
  volleyProjectileSpeed: 320,
  volleySpread: 0.12,
  minionTypes: ['drone', 'hunter'],
  spawnInterval: 6.5,
  spawnVariance: 1.1,
  chargeCooldown: 6.2,
  chargeDuration: 1.1,
  chargeRecovery: 1.4,
  chargeSpeedMultiplier: 3.1,
  chargeProjectileCount: 10,
  chargeProjectileSpeed: 420,
  chargeProjectileVariance: 0.08,
  chargeAimVariance: 0.18,
  phaseThresholds: [0.66, 0.33],
  phaseCount: 3,
  invulnerabilityDuration: 2.0,
  rewards: { xp: 500, lootTable: ['core-upgrade', 'weapon-blueprint'] },
  phaseColors: ['#ff6b6b', '#f9c74f', '#4d96ff'],
};

const BOSS_DEFAULTS = {
  ...BASE_CONFIG,
  ...SOURCE_CONFIG,
  rewards: {
    ...BASE_CONFIG.rewards,
    ...(SOURCE_CONFIG?.rewards || {}),
  },
  phaseColors: Array.isArray(SOURCE_CONFIG?.phaseColors)
    ? [...SOURCE_CONFIG.phaseColors]
    : [...BASE_CONFIG.phaseColors],
  minionTypes: Array.isArray(SOURCE_CONFIG?.minionTypes) && SOURCE_CONFIG.minionTypes.length
    ? [...SOURCE_CONFIG.minionTypes]
    : [...BASE_CONFIG.minionTypes],
  phaseThresholds: Array.isArray(SOURCE_CONFIG?.phaseThresholds) && SOURCE_CONFIG.phaseThresholds.length
    ? [...SOURCE_CONFIG.phaseThresholds]
    : [...BASE_CONFIG.phaseThresholds],
};

function resolveVector(dx, dy) {
  const magnitude = Math.hypot(dx, dy);
  if (magnitude === 0) {
    return { magnitude: 0, nx: 0, ny: 0 };
  }
  return { magnitude, nx: dx / magnitude, ny: dy / magnitude };
}

export class BossEnemy extends BaseEnemy {
  constructor(system, config = {}) {
    super(system, config);

    this.type = 'boss';

    this.random = null;
    this.patternRandom = null;
    this.minionRandom = null;

    this.currentPhase = 0;
    this.phaseCount = BOSS_DEFAULTS.phaseCount ?? 3;
    this.phaseThresholds = [];
    this.phaseHealthThresholds = [];
    this.nextPhaseIndex = 0;

    this.spreadInterval = BOSS_DEFAULTS.spreadInterval;
    this.spreadIntervalVariance = BOSS_DEFAULTS.spreadVariance ?? 0;
    this.spreadProjectileCount = BOSS_DEFAULTS.spreadProjectileCount ?? 5;
    this.spreadProjectileSpeed = BOSS_DEFAULTS.spreadProjectileSpeed ?? 240;
    this.spreadArc = BOSS_DEFAULTS.spreadArc ?? 0.75;
    this.spreadAngleVariance = BOSS_DEFAULTS.spreadAngleVariance ?? 0;

    this.volleyInterval = BOSS_DEFAULTS.volleyInterval ?? 1.5;
    this.volleyIntervalVariance = BOSS_DEFAULTS.volleyVariance ?? 0;
    this.volleyBurstSize = BOSS_DEFAULTS.volleyBurstSize ?? 4;
    this.volleyShotDelay = BOSS_DEFAULTS.volleyShotDelay ?? 0.18;
    this.volleyProjectileSpeed = BOSS_DEFAULTS.volleyProjectileSpeed ?? 320;
    this.volleySpread = BOSS_DEFAULTS.volleySpread ?? 0.08;

    this.spawnInterval = BOSS_DEFAULTS.spawnInterval ?? 8;
    this.spawnVariance = BOSS_DEFAULTS.spawnVariance ?? 0;
    this.minionTypes = [...(BOSS_DEFAULTS.minionTypes ?? ['drone'])];

    this.chargeCooldown = BOSS_DEFAULTS.chargeCooldown ?? 6;
    this.chargeDuration = BOSS_DEFAULTS.chargeDuration ?? 1;
    this.chargeRecovery = BOSS_DEFAULTS.chargeRecovery ?? 1.2;
    this.chargeSpeedMultiplier = BOSS_DEFAULTS.chargeSpeedMultiplier ?? 3;
    this.chargeProjectileCount = BOSS_DEFAULTS.chargeProjectileCount ?? 8;
    this.chargeProjectileSpeed = BOSS_DEFAULTS.chargeProjectileSpeed ?? 420;
    this.chargeProjectileVariance = BOSS_DEFAULTS.chargeProjectileVariance ?? 0;
    this.chargeAimVariance = BOSS_DEFAULTS.chargeAimVariance ?? 0;

    this.projectileDamage = BOSS_DEFAULTS.projectileDamage ?? 30;
    this.contactDamage = BOSS_DEFAULTS.contactDamage ?? 40;

    this.spreadTimer = 0;
    this.volleyTimer = 0;
    this.volleyShotTimer = 0;
    this.volleyShotsRemaining = 0;
    this.spawnTimer = 0;
    this.chargeTimer = 0;
    this.chargeState = 'idle';
    this.chargeStateTimer = 0;

    this.invulnerable = false;
    this.invulnerabilityTimer = 0;
    this._lastInvulnerabilityState = null;

    this.phaseColors = [...(BOSS_DEFAULTS.phaseColors || ['#ff6b6b'])];
    this.rewards = { ...BOSS_DEFAULTS.rewards };
    this.renderPayload = this.buildRenderPayload();
    this._missingTargetLogged = false;
    this._playerResolveLogged = false;
    this._seekFallbackLogged = false;
    this._invulnLog = 0;
    this._lastInvulnerabilityState = null;

    if (Object.keys(config).length > 0) {
      this.initialize(config);
    }
  }

  initialize(config = {}) {
    this.resetForPool();
    super.initialize(config);

    const defaults = BOSS_DEFAULTS;

    this.type = 'boss';
    this.addTag('boss');
    this._drawLogged = false;
    this._missingTargetLogged = false;
    this._playerResolveLogged = false;
    this._seekFallbackLogged = false;
    this._invulnLog = 0;
    this._lastInvulnerabilityState = null;

    const waveNumber = Math.max(1, config.wave || this.wave || 1);
    this.wave = waveNumber;

    this.radius = config.radius ?? defaults.radius ?? 60;

    const baseHealth = config.health ?? defaults.health ?? 1500;
    const scaling = config.healthScaling ?? defaults.healthScaling ?? 1;
    const scaledHealth = baseHealth * Math.pow(Math.max(1, scaling), waveNumber - 1);
    this.maxHealth = Math.ceil(scaledHealth);
    this.health = config.currentHealth ?? this.maxHealth;

    this.speed = config.speed ?? defaults.speed ?? 60;
    this.acceleration = config.acceleration ?? defaults.acceleration ?? 120;
    this.contactDamage = config.contactDamage ?? defaults.contactDamage ?? 45;
    this.projectileDamage = config.projectileDamage ?? defaults.projectileDamage ?? 35;

    this.safeDistance = Number.isFinite(config.safeDistance)
      ? config.safeDistance
      : Number.isFinite(defaults.safeDistance)
        ? defaults.safeDistance
        : this.radius * 2.5;
    this.entryPadding = Number.isFinite(config.entryPadding)
      ? Math.max(0, config.entryPadding)
      : Number.isFinite(defaults.entryPadding)
        ? Math.max(0, defaults.entryPadding)
        : Math.max(16, this.radius * 0.35);
    this.entryDriftSpeed = Number.isFinite(config.entryDriftSpeed)
      ? config.entryDriftSpeed
      : Number.isFinite(defaults.entryDriftSpeed)
        ? defaults.entryDriftSpeed
        : Math.max(45, (this.speed || 0) * 0.8);

    this.spreadProjectileCount = config.spreadProjectileCount ?? defaults.spreadProjectileCount ?? 7;
    this.spreadProjectileSpeed = config.spreadProjectileSpeed ?? defaults.spreadProjectileSpeed ?? 260;
    this.spreadInterval = config.spreadInterval ?? defaults.spreadInterval ?? 2.4;
    this.spreadIntervalVariance = config.spreadVariance ?? defaults.spreadVariance ?? 0;
    this.spreadArc = config.spreadArc ?? defaults.spreadArc ?? 0.85;
    this.spreadAngleVariance =
      config.spreadAngleVariance ?? defaults.spreadAngleVariance ?? 0;

    this.volleyBurstSize = config.volleyBurstSize ?? defaults.volleyBurstSize ?? 5;
    this.volleyShotDelay = config.volleyShotDelay ?? defaults.volleyShotDelay ?? 0.16;
    this.volleyInterval = config.volleyInterval ?? defaults.volleyInterval ?? 1.35;
    this.volleyIntervalVariance = config.volleyVariance ?? defaults.volleyVariance ?? 0;
    this.volleyProjectileSpeed =
      config.volleyProjectileSpeed ?? defaults.volleyProjectileSpeed ?? 320;
    this.volleySpread = config.volleySpread ?? defaults.volleySpread ?? 0.12;

    this.minionTypes = Array.isArray(config.minionTypes) && config.minionTypes.length
      ? [...config.minionTypes]
      : [...(defaults.minionTypes || ['drone'])];
    this.spawnInterval = config.spawnInterval ?? defaults.spawnInterval ?? 6.5;
    this.spawnVariance = config.spawnVariance ?? defaults.spawnVariance ?? 0;

    this.chargeCooldown = config.chargeCooldown ?? defaults.chargeCooldown ?? 6.2;
    this.chargeDuration = config.chargeDuration ?? defaults.chargeDuration ?? 1.1;
    this.chargeRecovery = config.chargeRecovery ?? defaults.chargeRecovery ?? 1.4;
    this.chargeSpeedMultiplier =
      config.chargeSpeedMultiplier ?? defaults.chargeSpeedMultiplier ?? 3.1;
    this.chargeProjectileCount =
      config.chargeProjectileCount ?? defaults.chargeProjectileCount ?? 10;
    this.chargeProjectileSpeed =
      config.chargeProjectileSpeed ?? defaults.chargeProjectileSpeed ?? 420;
    this.chargeProjectileVariance =
      config.chargeProjectileVariance ?? defaults.chargeProjectileVariance ?? 0;
    this.chargeAimVariance = config.chargeAimVariance ?? defaults.chargeAimVariance ?? 0;

    this.invulnerabilityDuration =
      config.invulnerabilityDuration ?? defaults.invulnerabilityDuration ?? 2;

    this.phaseColors = Array.isArray(config.phaseColors) && config.phaseColors.length
      ? [...config.phaseColors]
      : [...(defaults.phaseColors || ['#ff6b6b'])];

    this.rewards = {
      ...defaults.rewards,
      ...(config.rewards || {}),
    };

    this.random = this.resolveRandom({ ...config, id: this.id });
    this.patternRandom = this.random?.fork
      ? this.random.fork('boss:pattern')
      : this.random;
    this.minionRandom = this.random?.fork
      ? this.random.fork('boss:minion')
      : this.random;

    const thresholds = Array.isArray(config.phaseThresholds)
      ? config.phaseThresholds
      : defaults.phaseThresholds;

    this.phaseThresholds = Array.isArray(thresholds)
      ? [...thresholds].filter((value) => Number.isFinite(value))
      : [];
    this.phaseThresholds.sort((a, b) => b - a);
    this.phaseHealthThresholds = this.phaseThresholds.map((ratio) =>
      this.maxHealth * Math.min(Math.max(ratio, 0), 1)
    );
    this.phaseCount = Math.max(
      1,
      config.phaseCount ?? defaults.phaseCount ?? this.phaseThresholds.length + 1
    );
    this.currentPhase = 0;
    this.nextPhaseIndex = 0;

    this.spreadTimer = this.computeSpreadInterval();
    this.volleyTimer = this.computeVolleyInterval();
    this.volleyShotTimer = 0;
    this.volleyShotsRemaining = 0;
    this.spawnTimer = this.computeSpawnInterval();
    this.chargeTimer = this.chargeCooldown;
    this.chargeState = 'idle';
    this.chargeStateTimer = 0;

    this._lastUpdateLog = 0;
    this._drawLogged = false;

    this.invulnerable = false;
    this.invulnerabilityTimer = 0;

    this.renderPayload = this.buildRenderPayload();

    GameDebugLogger.log('SPAWN', 'BossEnemy initialized', {
      id: this.id,
      wave: this.wave,
      position: { x: this.x, y: this.y },
      health: this.health,
      maxHealth: this.maxHealth,
      radius: this.radius,
      phaseCount: this.phaseCount,
      phaseThresholds: [...this.phaseHealthThresholds],
      safeDistance: this.safeDistance,
      entryPadding: this.entryPadding,
      entryDriftSpeed: this.entryDriftSpeed,
    });

    if (Number.isFinite(this.entryDriftSpeed) && this.entryDriftSpeed > 0) {
      if (!Number.isFinite(this.vx)) {
        this.vx = 0;
      }
      if (!Number.isFinite(this.vy)) {
        this.vy = 0;
      }

      const entryBand = (this.entryPadding || 0) + (this.radius || 0);
      if (this.y <= entryBand) {
        const previousVy = this.vy;
        this.vy = Math.max(this.vy, this.entryDriftSpeed);
        if (this.vy !== previousVy) {
          GameDebugLogger.log('STATE', 'Boss entry drift primed', {
            id: this.id,
            entryBand,
            previousVy,
            newVy: this.vy,
          });
        }
      }
    }

    return this;
  }

  resolveRandom(config = {}) {
    if (config.random && typeof config.random.float === 'function') {
      return config.random;
    }

    if (this.system && typeof this.system.getRandomScope === 'function') {
      const scope = config.randomScope || 'boss';
      const generator = this.system.getRandomScope(scope, {
        parentScope: config.randomParentScope || 'spawn',
        label: `enemy:${this.type}:${config.id || this.id || 'spawn'}`,
      });

      if (generator && typeof generator.fork === 'function') {
        return generator.fork(`${this.type}:core`);
      }

      return generator || null;
    }

    return new RandomService(`enemy:${this.type}`);
  }

  onUpdate(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    const now = Date.now();
    if (!this._lastUpdateLog || now - this._lastUpdateLog > 2000) {
      const velocity = {
        vx: Number.isFinite(this.vx) ? Number(this.vx.toFixed(2)) : 0,
        vy: Number.isFinite(this.vy) ? Number(this.vy.toFixed(2)) : 0,
      };
      const healthPercent =
        Number.isFinite(this.maxHealth) && this.maxHealth > 0
          ? Number(((this.health / this.maxHealth) * 100).toFixed(1))
          : null;

      GameDebugLogger.log('UPDATE', 'Boss.onUpdate()', {
        id: this.id,
        position: { x: Math.round(this.x ?? 0), y: Math.round(this.y ?? 0) },
        velocity,
        health: this.health,
        maxHealth: this.maxHealth,
        healthPercent,
        currentPhase: this.currentPhase,
        invulnerable: !!this.invulnerable,
        chargeState: this.chargeState,
      });

      this._lastUpdateLog = now;
    }

    this.updateInvulnerability(deltaTime);

    const target = this.resolvePlayerTarget();

    switch (this.currentPhase) {
      case 0:
        this.handlePhaseIntro(deltaTime, target);
        break;
      case 1:
        this.handlePhaseAssault(deltaTime, target);
        break;
      default:
        this.handlePhaseFinale(deltaTime, target);
        break;
    }

    if (this.chargeState !== 'charging') {
      this.applyDamping(deltaTime);
    }

    this.renderPayload = this.buildRenderPayload();
  }

  handlePhaseIntro(deltaTime, target) {
    this.seekPlayer(target, deltaTime, 0.55);

    this.spreadTimer -= deltaTime;
    if (this.spreadTimer <= 0 && target?.position) {
      this.fireSpreadPattern(target.position);
      this.spreadTimer = this.computeSpreadInterval();
    }
  }

  handlePhaseAssault(deltaTime, target) {
    this.seekPlayer(target, deltaTime, 0.75);
    this.updateVolleyCycle(deltaTime, target);
    this.updateMinionSpawns(deltaTime);
  }

  handlePhaseFinale(deltaTime, target) {
    this.updateChargeState(deltaTime, target);
    if (this.chargeState !== 'charging') {
      this.seekPlayer(target, deltaTime, 0.9);
    }
  }

  seekPlayer(target, deltaTime, intensity = 1) {
    if (!Number.isFinite(deltaTime)) {
      return;
    }

    let targetPosition = target?.position;
    const hasValidTarget =
      targetPosition &&
      Number.isFinite(targetPosition.x) &&
      Number.isFinite(targetPosition.y);

    if (!hasValidTarget) {
      if (!this._missingTargetLogged) {
        GameDebugLogger.log('ERROR', 'Boss seekPlayer target unavailable', {
          hasTarget: !!target,
          hasPosition: !!target?.position,
          deltaTime,
        });
        this._missingTargetLogged = true;
      }

      const fallbackPosition = {
        x: Number.isFinite(CONSTANTS.GAME_WIDTH)
          ? CONSTANTS.GAME_WIDTH / 2
          : 0,
        y: Number.isFinite(CONSTANTS.GAME_HEIGHT)
          ? CONSTANTS.GAME_HEIGHT / 2
          : 0,
      };

      targetPosition = fallbackPosition;

      if (!this._seekFallbackLogged) {
        GameDebugLogger.log('UPDATE', 'Boss using fallback target (center)', {
          fallbackPosition,
        });
        this._seekFallbackLogged = true;
      }
    } else {
      if (this._missingTargetLogged) {
        GameDebugLogger.log('STATE', 'Boss seekPlayer target restored', {
          targetPosition,
        });
        this._missingTargetLogged = false;
      }

      if (this._seekFallbackLogged) {
        GameDebugLogger.log('STATE', 'Boss seekPlayer fallback cleared', {
          targetPosition,
        });
        this._seekFallbackLogged = false;
      }
    }

    if (!targetPosition) {
      return;
    }

    const dx = targetPosition.x - this.x;
    const dy = targetPosition.y - this.y;
    const { nx, ny } = resolveVector(dx, dy);

    const accel = (this.acceleration || 0) * Math.max(intensity, 0);
    const maxSpeed = (this.speed || 0) * Math.max(intensity, 0.1);

    this.vx += nx * accel * deltaTime;
    this.vy += ny * accel * deltaTime;

    const speed = Math.hypot(this.vx, this.vy);
    if (speed > maxSpeed && maxSpeed > 0) {
      const clamp = maxSpeed / speed;
      this.vx *= clamp;
      this.vy *= clamp;
    }

    if (speed > 0.1) {
      this.rotation = Math.atan2(this.vy, this.vx);
    }
  }

  applyDamping(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    const damping = 0.92 ** deltaTime;
    this.vx *= damping;
    this.vy *= damping;
  }

  updateInvulnerability(deltaTime) {
    if (!this.invulnerable) {
      this._invulnLog = 0;
      return;
    }

    if (!Number.isFinite(deltaTime)) {
      return;
    }

    const oldTimer = this.invulnerabilityTimer;
    this.invulnerabilityTimer -= deltaTime;

    if (this.invulnerabilityTimer <= 0) {
      this.invulnerable = false;
      this.invulnerabilityTimer = 0;
      this._invulnLog = 0;

      this.emitInvulnerabilityState(false, {
        reason: 'timer-expired',
        timer: 0,
        previous: Number.isFinite(oldTimer) ? Number(oldTimer.toFixed(3)) : oldTimer,
        force: true,
      });
    } else if (!this._invulnLog || Date.now() - this._invulnLog > 500) {
      GameDebugLogger.log('STATE', 'Boss invulnerable', {
        id: this.id,
        phase: this.currentPhase,
        timeRemaining: Number(this.invulnerabilityTimer.toFixed(3)),
      });
      this._invulnLog = Date.now();
    }
  }

  emitInvulnerabilityState(invulnerable, context = {}) {
    const force = Boolean(context.force);
    const timer = Number.isFinite(context.timer)
      ? Math.max(0, Number(context.timer))
      : Number.isFinite(this.invulnerabilityTimer)
      ? Math.max(0, Number(this.invulnerabilityTimer))
      : null;

    if (!force && this._lastInvulnerabilityState === invulnerable) {
      return;
    }

    this._lastInvulnerabilityState = invulnerable;

    const payload = {
      enemy: this,
      enemyId: this.id,
      wave: this.wave,
      phase: this.currentPhase,
      invulnerable,
      invulnerabilityTimer: timer,
      remaining: timer,
      reason: context.reason ?? null,
      invulnerabilitySource: context.reason ?? null,
      previousTimer: context.previous ?? null,
    };

    if (typeof gameEvents !== 'undefined' && gameEvents?.emit) {
      gameEvents.emit('boss-invulnerability-changed', payload);
    }

    GameDebugLogger.log('STATE', 'Boss invulnerability state changed', {
      id: this.id,
      phase: this.currentPhase,
      invulnerable,
      remaining: timer,
      reason: context.reason ?? null,
      previous: context.previous ?? null,
    });
  }

  updateVolleyCycle(deltaTime, target) {
    if (this.volleyShotsRemaining > 0) {
      this.volleyShotTimer -= deltaTime;
      if (this.volleyShotTimer <= 0 && target?.position) {
        this.fireVolleyShot(target.position);
        this.volleyShotsRemaining -= 1;
        this.volleyShotTimer = this.volleyShotDelay;
      }
      return;
    }

    this.volleyTimer -= deltaTime;
    if (this.volleyTimer <= 0 && target?.position) {
      this.startVolley();
      this.fireVolleyShot(target.position);
      this.volleyShotsRemaining -= 1;
      this.volleyShotTimer = this.volleyShotDelay;
    }
  }

  startVolley() {
    this.volleyShotsRemaining = Math.max(0, Math.floor(this.volleyBurstSize));
    this.volleyTimer = this.computeVolleyInterval();
  }

  updateMinionSpawns(deltaTime) {
    if (!this.minionTypes.length) {
      return;
    }

    this.spawnTimer -= deltaTime;
    if (this.spawnTimer > 0) {
      return;
    }

    this.spawnTimer = this.computeSpawnInterval();
    this.spawnMinion();
  }

  updateChargeState(deltaTime, target) {
    switch (this.chargeState) {
      case 'charging':
        this.chargeStateTimer -= deltaTime;
        if (this.chargeStateTimer <= 0) {
          this.chargeState = 'recover';
          this.chargeStateTimer = this.chargeRecovery;
          this.triggerChargeBurst('end');
        }
        break;
      case 'recover':
        this.chargeStateTimer -= deltaTime;
        if (this.chargeStateTimer <= 0) {
          this.chargeState = 'idle';
          this.chargeTimer = this.chargeCooldown;
        }
        break;
      default:
        this.chargeTimer -= deltaTime;
        if (this.chargeTimer <= 0) {
          this.beginCharge(target);
        }
        break;
    }
  }

  beginCharge(target) {
    const aimPosition = target?.position || null;
    let angle = 0;

    if (aimPosition) {
      const dx = aimPosition.x - this.x;
      const dy = aimPosition.y - this.y;
      angle = Math.atan2(dy, dx);
    }

    angle += this.sampleVariance(this.chargeAimVariance);

    const chargeSpeed = (this.speed || 0) * (this.chargeSpeedMultiplier || 3);
    this.vx = Math.cos(angle) * chargeSpeed;
    this.vy = Math.sin(angle) * chargeSpeed;
    this.rotation = angle;

    this.chargeState = 'charging';
    this.chargeStateTimer = this.chargeDuration;
    this.triggerChargeBurst('start');
  }

  triggerChargeBurst(stage) {
    if (!this.chargeProjectileCount || this.chargeProjectileCount <= 0) {
      return;
    }

    const count = Math.max(1, Math.floor(this.chargeProjectileCount));
    const angleStep = (Math.PI * 2) / count;
    const baseOffset = this.sampleVariance(this.chargeProjectileVariance);

    for (let i = 0; i < count; i += 1) {
      const angle = baseOffset + i * angleStep;
      this.emitBossProjectile({
        angle,
        speed: this.chargeProjectileSpeed,
        damage: this.projectileDamage,
        pattern: 'charge-burst',
        meta: { stage },
      });
    }
  }

  fireSpreadPattern(targetPosition) {
    const dx = targetPosition.x - this.x;
    const dy = targetPosition.y - this.y;
    const baseAngle = Math.atan2(dy, dx);

    const count = Math.max(1, Math.floor(this.spreadProjectileCount));
    const arc = Math.max(0, this.spreadArc ?? 0);
    const startAngle = baseAngle - arc / 2;
    const step = count > 1 ? arc / (count - 1) : 0;

    for (let i = 0; i < count; i += 1) {
      const angle = startAngle + step * i + this.sampleVariance(this.spreadAngleVariance);
      this.emitBossProjectile({
        angle,
        speed: this.spreadProjectileSpeed,
        damage: this.projectileDamage,
        pattern: 'spread',
      });
    }
  }

  fireVolleyShot(targetPosition) {
    const dx = targetPosition.x - this.x;
    const dy = targetPosition.y - this.y;
    let angle = Math.atan2(dy, dx);
    angle += this.sampleVariance(this.volleySpread);

    this.emitBossProjectile({
      angle,
      speed: this.volleyProjectileSpeed,
      damage: this.projectileDamage,
      pattern: 'volley',
    });
  }

  emitBossProjectile({ angle, speed, damage, pattern, meta = {} }) {
    if (!Number.isFinite(angle)) {
      return;
    }

    const projectileSpeed = Math.max(60, speed || 0);
    const vx = Math.cos(angle) * projectileSpeed;
    const vy = Math.sin(angle) * projectileSpeed;

    if (typeof gameEvents === 'undefined' || !gameEvents?.emit) {
      return;
    }

    gameEvents.emit('enemy-fired', {
      enemy: this,
      enemyId: this.id,
      enemyType: this.type,
      wave: this.wave,
      position: { x: this.x, y: this.y },
      velocity: { x: vx, y: vy },
      damage: damage ?? this.projectileDamage,
      projectile: {
        speed: projectileSpeed,
        angle,
        pattern,
        phase: this.currentPhase,
      },
      meta: {
        phase: this.currentPhase,
        pattern,
        ...meta,
      },
      source: { id: this.id, type: this.type, wave: this.wave },
    });
  }

  spawnMinion() {
    if (!this.system || !this.minionTypes.length) {
      return;
    }

    const type = this.pickMinionType();
    if (!type) {
      return;
    }

    const angle = this.patternRandom?.float
      ? this.patternRandom.float() * Math.PI * 2
      : Math.random() * Math.PI * 2;
    const distance = this.radius + 40;

    const spawnConfig = {
      x: this.x + Math.cos(angle) * distance,
      y: this.y + Math.sin(angle) * distance,
      wave: this.wave,
      spawnedBy: this.id,
      randomParentScope: `boss:${this.id}`,
    };

    let minion = null;

    // Special handling for asteroid type
    if (type === 'asteroid' && typeof this.system.acquireAsteroid === 'function') {
      minion = this.system.acquireAsteroid(spawnConfig);
    } else if (typeof this.system.acquireEnemyViaFactory === 'function') {
      // Check if factory has the type registered
      if (this.system.factory && typeof this.system.factory.hasType === 'function') {
        if (!this.system.factory.hasType(type)) {
          console.warn(
            `[BossEnemy] Minion type '${type}' not registered in factory. Minion spawn skipped.`
          );
          return;
        }
      }

      minion = this.system.acquireEnemyViaFactory(type, spawnConfig);

      if (!minion) {
        console.warn(
          `[BossEnemy] Factory failed to create minion of type '${type}'. Check factory configuration.`
        );
        return;
      }
    } else {
      console.warn(
        `[BossEnemy] Factory not available for spawning minion type '${type}'.`
      );
      return;
    }

    // Successfully created minion - register and tag it
    if (minion) {
      if (typeof minion.addTag === 'function') {
        minion.addTag('minion');
      }

      minion.spawnSource = 'boss-minion';
      minion.spawnedBy = this.id;
      minion.spawnedByBossId = this.id;
      minion.isBossMinion = true;
      minion.wave = this.wave;

      if (minion.metadata && typeof minion.metadata === 'object') {
        minion.metadata.spawnSource = 'boss-minion';
        minion.metadata.spawnedByBossId = this.id;
      } else {
        minion.metadata = {
          spawnSource: 'boss-minion',
          spawnedByBossId: this.id,
        };
      }

      let registered = false;

      if (typeof this.system.registerActiveEnemy === 'function') {
        registered = Boolean(
          this.system.registerActiveEnemy(minion, { skipDuplicateCheck: true })
        );
      }

      if (!registered) {
        GameDebugLogger.log('ERROR', 'Boss minion registration failed', {
          bossId: this.id,
          wave: this.wave,
          minionType: type,
          hasRegisterFunction: typeof this.system.registerActiveEnemy === 'function',
        });
        return;
      }

      if (this.system.waveManager &&
          typeof this.system.waveManager.registerDynamicMinion === 'function') {
        this.system.waveManager.registerDynamicMinion(minion, {
          bossId: this.id,
          minionType: type,
        });
      }

      GameDebugLogger.log('STATE', 'Boss minion spawned', {
        bossId: this.id,
        wave: this.wave,
        minionId: minion.id,
        minionType: type,
        position: { x: Math.round(minion.x), y: Math.round(minion.y) },
      });
    }
  }

  pickMinionType() {
    if (!this.minionTypes.length) {
      return null;
    }

    if (this.minionRandom && typeof this.minionRandom.int === 'function') {
      const index = this.minionRandom.int(0, this.minionTypes.length - 1);
      return this.minionTypes[index] || null;
    }

    const index = Math.floor(Math.random() * this.minionTypes.length);
    return this.minionTypes[index] || null;
  }

  resolvePlayerTarget() {
    const player =
      this.system && typeof this.system.getCachedPlayer === 'function'
        ? this.system.getCachedPlayer()
        : null;
    let position =
      this.system && typeof this.system.getPlayerPositionSnapshot === 'function'
        ? this.system.getPlayerPositionSnapshot(player)
        : player?.position || null;

    if (
      (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) &&
      player &&
      Number.isFinite(player.x) &&
      Number.isFinite(player.y)
    ) {
      position = { x: player.x, y: player.y };
    }

    if (
      (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) &&
      player &&
      player.position &&
      Number.isFinite(player.position.x) &&
      Number.isFinite(player.position.y)
    ) {
      position = { x: player.position.x, y: player.position.y };
    }

    const logPayload = {
      hasSystem: !!this.system,
      hasGetCachedPlayer: typeof this.system?.getCachedPlayer === 'function',
      hasPlayer: !!player,
      hasPosition: !!position,
      playerPosition: position || player?.position || null,
    };

    if (!this._playerResolveLogged) {
      GameDebugLogger.log('UPDATE', 'Boss resolvePlayerTarget', logPayload);
      this._playerResolveLogged = true;
    }

    if (!position && !this._missingTargetLogged) {
      GameDebugLogger.log('ERROR', 'Boss could not resolve player position', {
        ...logPayload,
        playerKeys: player ? Object.keys(player) : null,
      });
      this._missingTargetLogged = true;
    }

    return { player, position: position || null };
  }

  computeSpreadInterval() {
    const base = Math.max(0.6, this.spreadInterval || 0);
    return Math.max(0.45, base + this.sampleVariance(this.spreadIntervalVariance));
  }

  computeVolleyInterval() {
    const base = Math.max(0.45, this.volleyInterval || 0);
    return Math.max(0.3, base + this.sampleVariance(this.volleyIntervalVariance));
  }

  computeSpawnInterval() {
    const base = Math.max(1, this.spawnInterval || 0);
    return Math.max(0.75, base + this.sampleVariance(this.spawnVariance));
  }

  sampleVariance(variance = 0) {
    const value = Math.max(0, variance || 0);
    if (!value) {
      return 0;
    }

    const randomSource = this.patternRandom || this.random;
    if (randomSource && typeof randomSource.range === 'function') {
      return randomSource.range(-value, value);
    }

    if (randomSource && typeof randomSource.float === 'function') {
      return (randomSource.float() * 2 - 1) * value;
    }

    return (Math.random() * 2 - 1) * value;
  }

  takeDamage(amount, source = null) {
    if (!this.alive || this.invulnerable) {
      return false;
    }

    const actualDamage = Math.max(0, amount - this.armor);
    if (!actualDamage) {
      return false;
    }

    this.health -= actualDamage;

    if (typeof this.onDamaged === 'function') {
      this.onDamaged(actualDamage, source);
    }

    if (this.health <= 0) {
      this.onDestroyed(source);
      return true;
    }

    this.evaluatePhaseTransition();

    return false;
  }

  evaluatePhaseTransition() {
    if (!this.phaseHealthThresholds.length) {
      return;
    }

    while (
      this.nextPhaseIndex < this.phaseHealthThresholds.length &&
      this.health <= this.phaseHealthThresholds[this.nextPhaseIndex]
    ) {
      this.advancePhase();
    }
  }

  advancePhase() {
    if (this.currentPhase >= this.phaseCount - 1) {
      this.nextPhaseIndex = this.phaseHealthThresholds.length;
      return;
    }

    const previousPhase = this.currentPhase;
    this.currentPhase = Math.min(this.phaseCount - 1, this.currentPhase + 1);
    this.nextPhaseIndex += 1;

    this.invulnerable = true;
    this.invulnerabilityTimer = this.invulnerabilityDuration || 0;

    this.emitInvulnerabilityState(true, {
      reason: 'phase-transition',
      timer: this.invulnerabilityTimer,
    });

    this.spreadTimer = this.computeSpreadInterval();
    this.volleyTimer = this.computeVolleyInterval();
    this.spawnTimer = this.computeSpawnInterval();
    this.chargeTimer = this.chargeCooldown;
    this.chargeState = 'idle';
    this.chargeStateTimer = 0;

    if (typeof gameEvents !== 'undefined' && gameEvents?.emit) {
      gameEvents.emit('boss-phase-changed', {
        enemy: this,
        phase: this.currentPhase,
        wave: this.wave,
        health: this.health,
        maxHealth: this.maxHealth,
      });
    }

    const healthPercent =
      Number.isFinite(this.maxHealth) && this.maxHealth > 0
        ? Number(((this.health / this.maxHealth) * 100).toFixed(1))
        : null;

    GameDebugLogger.log('STATE', 'Boss phase transition', {
      id: this.id,
      oldPhase: previousPhase,
      newPhase: this.currentPhase,
      health: this.health,
      maxHealth: this.maxHealth,
      healthPercent,
      invulnerable: !!this.invulnerable,
      invulnerabilityDuration: this.invulnerabilityTimer,
    });
  }

  onDestroyed(source) {
    GameDebugLogger.log('STATE', 'Boss destroyed', {
      id: this.id,
      wave: this.wave,
      finalPhase: this.currentPhase,
      position: { x: this.x, y: this.y },
      rewards: { ...this.rewards },
    });

    const payload = {
      enemy: this,
      wave: this.wave,
      position: { x: this.x, y: this.y },
      rewards: { ...this.rewards },
      source,
    };

    this.invulnerable = false;
    this.invulnerabilityTimer = 0;

    this.emitInvulnerabilityState(false, {
      reason: 'destroyed',
      timer: 0,
      force: true,
    });

    let destructionError = null;
    try {
      super.onDestroyed(source);
    } catch (error) {
      destructionError = error;
    }

    if (typeof gameEvents !== 'undefined' && gameEvents?.emit) {
      gameEvents.emit('boss-defeated', payload);
      GameDebugLogger.log('EVENT', 'boss-defeated event emitted', {
        id: this.id,
        wave: this.wave,
        position: { x: this.x, y: this.y },
        rewards: payload.rewards,
      });
    }

    if (destructionError) {
      throw destructionError;
    }
  }

  onDraw(ctx) {
    if (!this._drawLogged) {
      GameDebugLogger.log('RENDER', 'Boss.onDraw() first call', {
        id: this.id,
        position: { x: this.x, y: this.y },
        radius: this.radius,
        phase: this.currentPhase,
        color: this.phaseColors[this.currentPhase] || null,
      });
      this._drawLogged = true;
    }

    const payload = this.buildRenderPayload();
    this.renderPayload = payload;

    if (!ctx || typeof ctx.save !== 'function') {
      return payload;
    }

    const phaseIndex = Math.min(payload.phase, this.phaseColors.length - 1);
    const color = this.phaseColors[phaseIndex] || '#ffffff';
    const auraColor = this.invulnerable ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.3)';

    ctx.save();
    ctx.translate(this.x, this.y);

    const scale = payload.scale;
    const radius = this.radius * scale;

    ctx.beginPath();
    ctx.fillStyle = auraColor;
    ctx.globalAlpha = 0.6 + (this.invulnerable ? 0.2 : 0);
    ctx.arc(0, 0, radius * 1.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 1;
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = this.invulnerable ? 0.9 : 0.6;
    ctx.stroke();

    ctx.restore();

    return payload;
  }

  buildRenderPayload() {
    const phase = Math.max(0, Math.min(this.currentPhase, this.phaseCount - 1));
    const pulse = this.invulnerable ? 1 + Math.sin(this.age * 9) * 0.12 : 1 + Math.sin(this.age * 4) * 0.08;

    return {
      type: this.type,
      id: this.id,
      phase,
      invulnerable: this.invulnerable,
      scale: pulse,
      color: this.phaseColors[phase] || '#ffffff',
      position: { x: this.x, y: this.y },
      radius: this.radius,
    };
  }

  resetForPool() {
    super.resetForPool();

    this.random = null;
    this.patternRandom = null;
    this.minionRandom = null;

    this.currentPhase = 0;
    this.phaseThresholds = [];
    this.phaseHealthThresholds = [];
    this.phaseCount = BOSS_DEFAULTS.phaseCount ?? 3;
    this.nextPhaseIndex = 0;

    this.spreadTimer = 0;
    this.volleyTimer = 0;
    this.volleyShotTimer = 0;
    this.volleyShotsRemaining = 0;
    this.spawnTimer = 0;
    this.chargeTimer = 0;
    this.chargeState = 'idle';
    this.chargeStateTimer = 0;

    this.invulnerable = false;
    this.invulnerabilityTimer = 0;

    this.phaseColors = [...(BOSS_DEFAULTS.phaseColors || ['#ff6b6b'])];
    this.rewards = { ...BOSS_DEFAULTS.rewards };
    this.renderPayload = this.buildRenderPayload();
    this._missingTargetLogged = false;
    this._playerResolveLogged = false;
    this._seekFallbackLogged = false;
    this._invulnLog = 0;
  }
}

export default BossEnemy;
