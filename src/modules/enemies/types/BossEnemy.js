import {
  BOSS_COMPONENTS,
  BOSS_CONFIG,
  WARDEN_KINDS,
} from '../../../data/enemies/boss.js';
import {
  UPGRADE_BOSS_HEALTH_SCALAR,
  UPGRADE_BOSS_DAMAGE_SCALAR,
} from '../../../core/GameConstants.js';
import RandomService from '../../../core/RandomService.js';
import { BaseEnemy } from '../base/BaseEnemy.js';
import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';
import { requireRandom } from '../../../utils/randomHelpers.js';

const SOURCE_CONFIG = BOSS_CONFIG || {};

const BASE_CONFIG = {
  key: 'boss',
  displayName: 'Warden Prime',
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
  spreadCooldown: 2.4,
  spreadVariance: 0.45,
  spreadArc: 0.85,
  spreadAngleVariance: 0.12,
  volleyBurstSize: 5,
  volleyShotDelay: 0.16,
  volleyCooldown: 1.35,
  volleyVariance: 0.2,
  volleyProjectileSpeed: 320,
  volleySpread: 0.12,
  minionTypes: ['drone', 'hunter'],
  spawnCooldown: 6.5,
  spawnVariance: 1.1,
  chargeCooldown: 6.2,
  chargeDuration: 1.1,
  chargeRecovery: 1.4,
  chargeSpeedMultiplier: 3.1,
  chargeProjectileCount: 10,
  chargeProjectileSpeed: 420,
  chargeProjectileVariance: 0.08,
  chargeAimVariance: 0.18,
  // Telegraphs: the boss shows where it will strike before it strikes.
  chargeWindup: 0.6,
  spreadWindup: 0.35,
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
  minionTypes:
    Array.isArray(SOURCE_CONFIG?.minionTypes) &&
    SOURCE_CONFIG.minionTypes.length
      ? [...SOURCE_CONFIG.minionTypes]
      : [...BASE_CONFIG.minionTypes],
  phaseThresholds:
    Array.isArray(SOURCE_CONFIG?.phaseThresholds) &&
    SOURCE_CONFIG.phaseThresholds.length
      ? [...SOURCE_CONFIG.phaseThresholds]
      : [...BASE_CONFIG.phaseThresholds],
};

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
    this._phaseThresholdMaxHealth = null;
    this.nextPhaseIndex = 0;

    this.spreadCooldown = BOSS_DEFAULTS.spreadCooldown;
    this.spreadCooldownVariance = BOSS_DEFAULTS.spreadVariance ?? 0;
    this.spreadProjectileCount = BOSS_DEFAULTS.spreadProjectileCount ?? 5;
    this.spreadProjectileSpeed = BOSS_DEFAULTS.spreadProjectileSpeed ?? 240;
    this.spreadArc = BOSS_DEFAULTS.spreadArc ?? 0.75;
    this.spreadAngleVariance = BOSS_DEFAULTS.spreadAngleVariance ?? 0;

    this.volleyCooldown = BOSS_DEFAULTS.volleyCooldown ?? 1.5;
    this.volleyCooldownVariance = BOSS_DEFAULTS.volleyVariance ?? 0;
    this.volleyBurstSize = BOSS_DEFAULTS.volleyBurstSize ?? 4;
    this.volleyShotDelay = BOSS_DEFAULTS.volleyShotDelay ?? 0.18;
    this.volleyProjectileSpeed = BOSS_DEFAULTS.volleyProjectileSpeed ?? 320;
    this.volleySpread = BOSS_DEFAULTS.volleySpread ?? 0.08;

    this.spawnCooldown = BOSS_DEFAULTS.spawnCooldown ?? 8;
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
    this.chargeWindup = BOSS_DEFAULTS.chargeWindup ?? 0.6;
    this.spreadWindup = BOSS_DEFAULTS.spreadWindup ?? 0.35;

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
    this.chargeAimAngle = 0;
    this.spreadWindupTimer = 0;
    this.telegraph = null;

    this.invulnerable = false;
    this.invulnerabilityTimer = 0;
    this._lastInvulnerabilityState = null;
    this.damageFlashDuration = 0.14;
    this.damageFlashTimer = 0;
    this.damageFlashStrength = 0;
    this.shieldImpactDuration = 0.24;
    this.shieldImpactTimer = 0;
    this.shieldImpactStrength = 0;
    this.shieldImpactAngle = 0;

    this.phaseColors = [...(BOSS_DEFAULTS.phaseColors || ['#ff6b6b'])];
    this.rewards = { ...BOSS_DEFAULTS.rewards };
    this._missingTargetLogged = false;
    this._missingPlayerReferenceLogged = false;
    this._playerResolveLogged = false;
    this._seekFallbackLogged = false;
    this._fallbackTargetActive = false;
    this._lastFallbackReason = null;
    this._invulnLog = 0;
    this._lastInvulnerabilityState = null;
    this.movementStrategy = 'seeking';
    this.movementConfig = null;
    this.movementPhases = null;
    this._lastMovementPhase = null;
    this.useComponents = false;

    if (Object.keys(config).length > 0) {
      this.initialize(config);
    }
  }

  initialize(config = {}) {
    this.resetForPool();
    super.initialize(config);

    const componentConfig = config.components ?? BOSS_COMPONENTS;
    if (componentConfig) {
      this.movementStrategy = componentConfig?.movement?.strategy || 'seeking';

      if (Array.isArray(componentConfig?.movementPhases)) {
        this.movementPhases = componentConfig.movementPhases.map((phase) => ({
          ...phase,
        }));
      } else {
        this.movementPhases = null;
      }
    }

    const defaults = BOSS_DEFAULTS;

    this.type = 'boss';
    this.bossKind = 'prime';
    this.displayName = config.displayName ?? defaults.displayName;
    this.subtitle = WARDEN_KINDS.prime.subtitle;
    this.addTag('boss');
    this._missingTargetLogged = false;
    this._missingPlayerReferenceLogged = false;
    this._playerResolveLogged = false;
    this._seekFallbackLogged = false;
    this._fallbackTargetActive = false;
    this._lastFallbackReason = null;
    this._invulnLog = 0;
    this._lastInvulnerabilityState = null;

    const waveNumber = Math.max(1, config.wave || this.wave || 1);
    this.wave = waveNumber;

    this.radius = config.radius ?? defaults.radius ?? 60;

    const baseHealth = config.health ?? defaults.health ?? 1500;
    const scaling = config.healthScaling ?? defaults.healthScaling ?? 1;
    const waveScaled =
      baseHealth * Math.pow(Math.max(1, scaling), waveNumber - 1);
    const upgradeLevelSum = this._resolveUpgradeLevelSum(config);
    const upgradeHealthFactor =
      1 + UPGRADE_BOSS_HEALTH_SCALAR * upgradeLevelSum; // FIX-04
    this.upgradeLevelSum = upgradeLevelSum;
    this.maxHealth = Math.ceil(waveScaled * upgradeHealthFactor);
    this.health = config.currentHealth ?? this.maxHealth;
    this.healthInitialized = true;

    this.speed = config.speed ?? defaults.speed ?? 60;
    this.acceleration = config.acceleration ?? defaults.acceleration ?? 120;
    const baseContactDamage =
      config.contactDamage ?? defaults.contactDamage ?? 45;
    const baseProjectileDamage =
      config.projectileDamage ?? defaults.projectileDamage ?? 35;
    const upgradeDamageFactor =
      1 + UPGRADE_BOSS_DAMAGE_SCALAR * upgradeLevelSum; // FIX-04
    this.contactDamage = Math.round(baseContactDamage * upgradeDamageFactor);
    this.projectileDamage = Math.round(
      baseProjectileDamage * upgradeDamageFactor
    );

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

    this.spreadProjectileCount =
      config.spreadProjectileCount ?? defaults.spreadProjectileCount ?? 7;
    this.spreadProjectileSpeed =
      config.spreadProjectileSpeed ?? defaults.spreadProjectileSpeed ?? 260;
    this.spreadCooldown =
      config.spreadCooldown ?? defaults.spreadCooldown ?? 2.4;
    this.spreadCooldownVariance =
      config.spreadVariance ?? defaults.spreadVariance ?? 0;
    this.spreadArc = config.spreadArc ?? defaults.spreadArc ?? 0.85;
    this.spreadAngleVariance =
      config.spreadAngleVariance ?? defaults.spreadAngleVariance ?? 0;

    this.volleyBurstSize =
      config.volleyBurstSize ?? defaults.volleyBurstSize ?? 5;
    this.volleyShotDelay =
      config.volleyShotDelay ?? defaults.volleyShotDelay ?? 0.16;
    this.volleyCooldown =
      config.volleyCooldown ?? defaults.volleyCooldown ?? 1.35;
    this.volleyCooldownVariance =
      config.volleyVariance ?? defaults.volleyVariance ?? 0;
    this.volleyProjectileSpeed =
      config.volleyProjectileSpeed ?? defaults.volleyProjectileSpeed ?? 320;
    this.volleySpread = config.volleySpread ?? defaults.volleySpread ?? 0.12;

    this.minionTypes =
      Array.isArray(config.minionTypes) && config.minionTypes.length
        ? [...config.minionTypes]
        : [...(defaults.minionTypes || ['drone'])];
    this.spawnCooldown = config.spawnCooldown ?? defaults.spawnCooldown ?? 6.5;
    this.spawnVariance = config.spawnVariance ?? defaults.spawnVariance ?? 0;

    this.chargeCooldown =
      config.chargeCooldown ?? defaults.chargeCooldown ?? 6.2;
    this.chargeDuration =
      config.chargeDuration ?? defaults.chargeDuration ?? 1.1;
    this.chargeRecovery =
      config.chargeRecovery ?? defaults.chargeRecovery ?? 1.4;
    this.chargeSpeedMultiplier =
      config.chargeSpeedMultiplier ?? defaults.chargeSpeedMultiplier ?? 3.1;
    this.chargeProjectileCount =
      config.chargeProjectileCount ?? defaults.chargeProjectileCount ?? 10;
    this.chargeProjectileSpeed =
      config.chargeProjectileSpeed ?? defaults.chargeProjectileSpeed ?? 420;
    this.chargeProjectileVariance =
      config.chargeProjectileVariance ?? defaults.chargeProjectileVariance ?? 0;
    this.chargeAimVariance =
      config.chargeAimVariance ?? defaults.chargeAimVariance ?? 0;
    this.chargeWindup = config.chargeWindup ?? defaults.chargeWindup ?? 0.6;
    this.spreadWindup = config.spreadWindup ?? defaults.spreadWindup ?? 0.35;

    this.invulnerabilityDuration =
      config.invulnerabilityDuration ?? defaults.invulnerabilityDuration ?? 2;

    this.phaseColors =
      Array.isArray(config.phaseColors) && config.phaseColors.length
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
    this.phaseCount = Math.max(
      1,
      config.phaseCount ??
        defaults.phaseCount ??
        this.phaseThresholds.length + 1
    );
    this.currentPhase = 0;
    this.nextPhaseIndex = 0;
    this.syncPhaseThresholds(true);

    this.spreadTimer = this.computeSpreadCooldown();
    this.volleyTimer = this.computeVolleyCooldown();
    this.volleyShotTimer = 0;
    this.volleyShotsRemaining = 0;
    this.spawnTimer = this.computeSpawnCooldown();
    this.chargeTimer = this.chargeCooldown;
    this.chargeState = 'idle';
    this.chargeStateTimer = 0;

    this._lastUpdateLog = 0;

    this.invulnerable = false;
    this.invulnerabilityTimer = 0;
    this.resetFeedbackState();
    this.applyPhaseMovement(true);

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

  /**
   * Returns the cumulative upgrade-level sum from progression.
   * Returns 0 if the progression service is unavailable or appliedUpgrades is
   * empty/missing.
   *
   * FIX-04 (Phase 0): drives boss stat scaling at construction time. The dual
   * lookup (getAllUpgrades first, then appliedUpgrades Map fallback) lets tests
   * pass a plain `{ appliedUpgrades: new Map([...]) }` mock OR a config-level
   * `upgradeLevelSum` literal without standing up the full ProgressionSystem.
   */
  _resolveUpgradeLevelSum(config = {}) {
    const explicit = config.upgradeLevelSum;
    if (Number.isFinite(explicit) && explicit >= 0) {
      return Math.floor(explicit);
    }
    const services = this.system?.dependencies ?? this.system ?? {};
    const progression = services.progression ?? services.progressionService;
    const upgrades =
      typeof progression?.getAllUpgrades === 'function'
        ? progression.getAllUpgrades()
        : progression?.appliedUpgrades instanceof Map
          ? progression.appliedUpgrades
          : null;
    if (!upgrades || typeof upgrades.values !== 'function') {
      return 0;
    }
    let sum = 0;
    for (const value of upgrades.values()) {
      if (Number.isFinite(value) && value > 0) sum += value;
    }
    return sum;
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

  syncPhaseThresholds(force = false) {
    const maxHealth = Number.isFinite(this.maxHealth) ? this.maxHealth : null;
    if (!Number.isFinite(maxHealth)) {
      this.phaseHealthThresholds = [];
      this._phaseThresholdMaxHealth = null;
      return;
    }

    if (
      !force &&
      this._phaseThresholdMaxHealth === maxHealth &&
      this.phaseHealthThresholds.length
    ) {
      return;
    }

    const thresholds = Array.isArray(this.phaseThresholds)
      ? this.phaseThresholds
      : [];
    this.phaseHealthThresholds = thresholds.map((ratio) => {
      const clamped = Math.min(Math.max(ratio, 0), 1);
      return maxHealth * clamped;
    });
    this._phaseThresholdMaxHealth = maxHealth;
    this.nextPhaseIndex = Math.min(
      Math.max(0, this.currentPhase || 0),
      this.phaseHealthThresholds.length
    );
  }

  applyPhaseMovement(force = false) {
    if (!Array.isArray(this.movementPhases) || !this.movementPhases.length) {
      if (force) {
        this._lastMovementPhase = null;
      }
      return;
    }

    const phaseIndex = Math.min(
      Math.max(0, this.currentPhase || 0),
      this.movementPhases.length - 1
    );

    if (!force && this._lastMovementPhase === phaseIndex) {
      return;
    }

    const phaseConfig = this.movementPhases[phaseIndex] || {};
    const { strategy, ...movementOverrides } = phaseConfig;

    if (strategy) {
      this.movementStrategy = strategy;
    }

    this.movementConfig = { ...movementOverrides };
    this._lastMovementPhase = phaseIndex;
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
    this.updateFeedbackState(deltaTime);

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
  }

  handlePhaseIntro(deltaTime, target) {
    this.updateSpreadCycle(deltaTime, target);
  }

  // The fan is announced by a wedge for `spreadWindup` seconds, then fired
  // at the player's position at that moment.
  updateSpreadCycle(deltaTime, target) {
    if (this.spreadWindupTimer > 0) {
      this.spreadWindupTimer -= deltaTime;
      if (target?.position) {
        this.chargeAimAngle = this.angleTo(target.position);
        if (this.telegraph?.type === 'fan') {
          const origin = this.attackOrigin();
          this.telegraph.x = origin.x;
          this.telegraph.y = origin.y;
          this.telegraph.angle = this.chargeAimAngle;
          this.telegraph.timer = Math.max(0, this.spreadWindupTimer);
        }
      }
      if (this.spreadWindupTimer <= 0) {
        this.clearTelegraph();
        if (target?.position) {
          this.fireSpreadPattern(target.position);
        }
        this.spreadTimer = this.computeSpreadCooldown();
      }
      return;
    }

    this.spreadTimer -= deltaTime;
    if (this.spreadTimer <= 0 && target?.position) {
      const windup = Math.max(0, this.spreadWindup || 0);
      if (windup <= 0) {
        this.fireSpreadPattern(target.position);
        this.spreadTimer = this.computeSpreadCooldown();
        return;
      }
      this.spreadWindupTimer = windup;
      this.chargeAimAngle = this.angleTo(target.position);
      const origin = this.attackOrigin();
      this.setTelegraph({
        type: 'fan',
        x: origin.x,
        y: origin.y,
        angle: this.chargeAimAngle,
        arc: Math.max(0, this.spreadArc ?? 0),
        length: 180,
        duration: windup,
        timer: windup,
      });
    }
  }

  // Where shots and the fan wedge start: the hull here; a Warden with
  // several bodies (WardenChoir) returns the one that is attacking.
  attackOrigin() {
    return this;
  }

  angleTo(position) {
    const origin = this.attackOrigin();
    return Math.atan2(position.y - origin.y, position.x - origin.x);
  }

  setTelegraph(telegraph) {
    this.telegraph = telegraph;
    const eventBus = this.getEventBus();
    if (eventBus?.emit) {
      eventBus.emit('boss-telegraph', {
        enemy: this,
        enemyId: this.id,
        telegraph,
      });
    }
  }

  clearTelegraph() {
    this.telegraph = null;
  }

  handlePhaseAssault(deltaTime, target) {
    this.updateVolleyCycle(deltaTime, target);
    this.updateMinionSpawns(deltaTime);
  }

  handlePhaseFinale(deltaTime, target) {
    this.updateChargeState(deltaTime, target);
  }

  updateInvulnerability(deltaTime) {
    if (!this.invulnerable) {
      this._invulnLog = 0;
      this.shieldImpactTimer = 0;
      this.shieldImpactStrength = 0;
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
      this.shieldImpactTimer = 0;
      this.shieldImpactStrength = 0;

      this.emitInvulnerabilityState(false, {
        reason: 'timer-expired',
        timer: 0,
        previous: Number.isFinite(oldTimer)
          ? Number(oldTimer.toFixed(3))
          : oldTimer,
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

    const eventBus = this.getEventBus();
    if (eventBus?.emit) {
      eventBus.emit('boss-invulnerability-changed', payload);
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
    this.volleyTimer = this.computeVolleyCooldown();
  }

  updateMinionSpawns(deltaTime) {
    if (!this.minionTypes.length) {
      return;
    }

    this.spawnTimer -= deltaTime;
    if (this.spawnTimer > 0) {
      return;
    }

    this.spawnTimer = this.computeSpawnCooldown();
    this.spawnMinion();
  }

  updateChargeState(deltaTime, target) {
    switch (this.chargeState) {
      case 'windup':
        // Slow to a near stop, keep tracking the player, show the lane.
        this.vx *= Math.max(0, 1 - 6 * deltaTime);
        this.vy *= Math.max(0, 1 - 6 * deltaTime);
        if (target?.position) {
          this.chargeAimAngle = this.angleTo(target.position);
          this.rotation = this.chargeAimAngle;
          if (this.telegraph?.type === 'charge') {
            this.telegraph.angle = this.chargeAimAngle;
          }
        }
        this.chargeStateTimer -= deltaTime;
        if (this.telegraph?.type === 'charge') {
          this.telegraph.timer = Math.max(0, this.chargeStateTimer);
        }
        if (this.chargeStateTimer <= 0) {
          this.launchCharge();
        }
        break;
      case 'charging':
        this.chargeStateTimer -= deltaTime;
        if (this.chargeStateTimer <= 0) {
          this.chargeState = 'recover';
          this.chargeStateTimer = this.chargeRecovery;
          this.applyPhaseMovement(true);
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
    this.chargeAimAngle = aimPosition ? this.angleTo(aimPosition) : 0;

    // The phase movement would steer and cap the dash; drift on vx/vy instead
    // until the charge ends.
    this.movementStrategy = 'linear';

    const windup = Math.max(0, this.chargeWindup || 0);
    if (windup <= 0) {
      this.launchCharge();
      return;
    }

    const chargeSpeed = (this.speed || 0) * (this.chargeSpeedMultiplier || 3);
    this.chargeState = 'windup';
    this.chargeStateTimer = windup;
    this.rotation = this.chargeAimAngle;
    this.setTelegraph({
      type: 'charge',
      angle: this.chargeAimAngle,
      length: chargeSpeed * (this.chargeDuration || 1),
      duration: windup,
      timer: windup,
    });
  }

  launchCharge() {
    this.clearTelegraph();
    const angle =
      this.chargeAimAngle + this.sampleVariance(this.chargeAimVariance);

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

  updateFeedbackState(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    if (this.damageFlashTimer > 0) {
      this.damageFlashTimer = Math.max(0, this.damageFlashTimer - deltaTime);
      if (this.damageFlashTimer === 0) {
        this.damageFlashStrength = 0;
      }
    }

    if (this.shieldImpactTimer > 0) {
      this.shieldImpactTimer = Math.max(0, this.shieldImpactTimer - deltaTime);
      if (this.shieldImpactTimer === 0) {
        this.shieldImpactStrength = 0;
      }
    }
  }

  fireSpreadPattern(targetPosition) {
    const baseAngle = this.angleTo(targetPosition);

    const count = Math.max(1, Math.floor(this.spreadProjectileCount));
    const arc = Math.max(0, this.spreadArc ?? 0);
    const startAngle = baseAngle - arc / 2;
    const step = count > 1 ? arc / (count - 1) : 0;

    for (let i = 0; i < count; i += 1) {
      const angle =
        startAngle + step * i + this.sampleVariance(this.spreadAngleVariance);
      this.emitBossProjectile({
        angle,
        speed: this.spreadProjectileSpeed,
        damage: this.projectileDamage,
        pattern: 'spread',
      });
    }
  }

  fireVolleyShot(targetPosition) {
    const angle =
      this.angleTo(targetPosition) + this.sampleVariance(this.volleySpread);

    this.emitBossProjectile({
      angle,
      speed: this.volleyProjectileSpeed,
      damage: this.projectileDamage,
      pattern: 'volley',
    });
  }

  emitBossProjectile({
    angle,
    speed,
    damage,
    pattern,
    meta = {},
    origin = this.attackOrigin(),
  }) {
    if (!Number.isFinite(angle)) {
      return;
    }

    const projectileSpeed = Math.max(60, speed || 0);
    const vx = Math.cos(angle) * projectileSpeed;
    const vy = Math.sin(angle) * projectileSpeed;

    const eventBus = this.getEventBus();
    if (!eventBus?.emit) {
      return;
    }

    eventBus.emit('enemy-fired', {
      enemy: this,
      enemyId: this.id,
      enemyType: this.type,
      wave: this.wave,
      position: { x: origin.x, y: origin.y },
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

    const angle =
      requireRandom(this.patternRandom, 'enemy.boss.pattern').float() *
      Math.PI *
      2;
    const distance = this.radius + 40;

    const minion = this.spawnChild(type, {
      x: this.x + Math.cos(angle) * distance,
      y: this.y + Math.sin(angle) * distance,
      randomParentScope: `boss:${this.id}`,
    });
    if (!minion) {
      console.warn(
        `[BossEnemy] Could not spawn minion of type '${type}'. Check factory configuration.`
      );
      return;
    }

    minion.addTag?.('minion');
    minion.spawnSource = 'boss-minion';
    minion.spawnedByBossId = this.id;
    minion.isBossMinion = true;
    minion.metadata = {
      ...minion.metadata,
      spawnSource: 'boss-minion',
      spawnedByBossId: this.id,
    };

    GameDebugLogger.log('STATE', 'Boss minion spawned', {
      bossId: this.id,
      wave: this.wave,
      minionId: minion.id,
      minionType: type,
      position: { x: Math.round(minion.x), y: Math.round(minion.y) },
    });
  }

  pickMinionType() {
    if (!this.minionTypes.length) {
      return null;
    }

    const index = requireRandom(this.minionRandom, 'enemy.boss.minion').int(
      0,
      this.minionTypes.length - 1
    );
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
      (!position ||
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.y)) &&
      player &&
      Number.isFinite(player.x) &&
      Number.isFinite(player.y)
    ) {
      position = { x: player.x, y: player.y };
    }

    if (
      (!position ||
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.y)) &&
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

    if (!player && !this._missingPlayerReferenceLogged) {
      GameDebugLogger.log(
        'ERROR',
        'Boss resolvePlayerTarget missing player reference',
        logPayload
      );
      this._missingPlayerReferenceLogged = true;
    } else if (player && this._missingPlayerReferenceLogged) {
      GameDebugLogger.log(
        'STATE',
        'Boss resolvePlayerTarget player reference restored',
        {
          playerPosition: position || player?.position || null,
        }
      );
      this._missingPlayerReferenceLogged = false;
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

  computeSpreadCooldown() {
    const base = Math.max(0.6, this.spreadCooldown || 0);
    return Math.max(
      0.45,
      base + this.sampleVariance(this.spreadCooldownVariance)
    );
  }

  computeVolleyCooldown() {
    const base = Math.max(0.45, this.volleyCooldown || 0);
    return Math.max(
      0.3,
      base + this.sampleVariance(this.volleyCooldownVariance)
    );
  }

  computeSpawnCooldown() {
    const base = Math.max(1, this.spawnCooldown || 0);
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

    return (
      (requireRandom(randomSource, 'enemy.boss.pattern').float() * 2 - 1) *
      value
    );
  }

  takeDamage(amount, source = null) {
    if (this.getComponent && this.getComponent('health')) {
      return super.takeDamage(amount, source);
    }

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

    return false;
  }

  onDamaged(amount, source, context = {}) {
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    this.triggerDamageFlash(amount);

    GameDebugLogger.log('STATE', 'Boss damaged', {
      id: this.id,
      wave: this.wave,
      damage: amount,
      remaining: this.health,
      source: source ?? null,
      context,
    });

    this.evaluatePhaseTransition();
  }

  triggerDamageFlash(amount = 0) {
    const normalizedDamage = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    const maxHealth =
      Number.isFinite(this.maxHealth) && this.maxHealth > 0
        ? this.maxHealth
        : 1;
    const relativeDamage = Math.min(
      1,
      normalizedDamage / Math.max(24, maxHealth * 0.12)
    );

    this.damageFlashStrength = Math.max(
      this.damageFlashStrength || 0,
      0.45 + relativeDamage * 0.55
    );
    this.damageFlashTimer = Math.max(
      this.damageFlashTimer || 0,
      this.damageFlashDuration
    );
  }

  registerInvulnerabilityHit(position = null) {
    if (!this.invulnerable) {
      return;
    }

    let impactAngle = Number.isFinite(this.shieldImpactAngle)
      ? this.shieldImpactAngle
      : this.rotation || 0;

    if (
      position &&
      Number.isFinite(position.x) &&
      Number.isFinite(position.y) &&
      Number.isFinite(this.x) &&
      Number.isFinite(this.y)
    ) {
      impactAngle = Math.atan2(position.y - this.y, position.x - this.x);
    }

    this.shieldImpactAngle = impactAngle;
    this.shieldImpactStrength = 1;
    this.shieldImpactTimer = Math.max(
      this.shieldImpactTimer || 0,
      this.shieldImpactDuration
    );
  }

  evaluatePhaseTransition() {
    this.syncPhaseThresholds();
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
    this.applyPhaseMovement(true);

    this.invulnerable = true;
    this.invulnerabilityTimer = this.invulnerabilityDuration || 0;
    this.shieldImpactTimer = 0;
    this.shieldImpactStrength = 0;

    this.emitInvulnerabilityState(true, {
      reason: 'phase-transition',
      timer: this.invulnerabilityTimer,
    });

    this.spreadTimer = this.computeSpreadCooldown();
    this.volleyTimer = this.computeVolleyCooldown();
    this.spawnTimer = this.computeSpawnCooldown();
    this.chargeTimer = this.chargeCooldown;
    this.chargeState = 'idle';
    this.chargeStateTimer = 0;

    const eventBus = this.getEventBus();
    if (eventBus?.emit) {
      eventBus.emit('boss-phase-changed', {
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

  onDestroyed(source, context = {}) {
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
    this.resetFeedbackState();

    this.emitInvulnerabilityState(false, {
      reason: 'destroyed',
      timer: 0,
      force: true,
    });

    let destructionError = null;
    try {
      super.onDestroyed(source, context);
    } catch (error) {
      destructionError = error;
    }

    const eventBus = this.getEventBus();
    if (eventBus?.emit) {
      eventBus.emit('boss-defeated', payload);
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

  resetFeedbackState() {
    this.damageFlashTimer = 0;
    this.damageFlashStrength = 0;
    this.shieldImpactTimer = 0;
    this.shieldImpactStrength = 0;
    this.shieldImpactAngle = 0;
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
    this._phaseThresholdMaxHealth = null;
    this.movementConfig = null;
    this.movementPhases = null;
    this._lastMovementPhase = null;

    this.spreadTimer = 0;
    this.volleyTimer = 0;
    this.volleyShotTimer = 0;
    this.volleyShotsRemaining = 0;
    this.spawnTimer = 0;
    this.chargeTimer = 0;
    this.chargeState = 'idle';
    this.chargeStateTimer = 0;
    this.chargeAimAngle = 0;
    this.spreadWindupTimer = 0;
    this.telegraph = null;

    this.invulnerable = false;
    this.invulnerabilityTimer = 0;
    this.resetFeedbackState();

    this.phaseColors = [...(BOSS_DEFAULTS.phaseColors || ['#ff6b6b'])];
    this.rewards = { ...BOSS_DEFAULTS.rewards };
    this._missingTargetLogged = false;
    this._missingPlayerReferenceLogged = false;
    this._playerResolveLogged = false;
    this._seekFallbackLogged = false;
    this._fallbackTargetActive = false;
    this._lastFallbackReason = null;
    this._invulnLog = 0;
  }
}

export default BossEnemy;
