// src/modules/enemies/types/BossEnemy.js
//
// Warden Prime, and the base WardenChoir and WardenNull build on: stats from
// the wave and the upgrades, the three-phase update, the telegraph, the boss
// projectiles, the pattern draws, damage and defeat. The phases, the attacks
// (fan, volley, charge, minions), the invulnerability, the damage flash and
// the player lookup live in ../boss/; the methods the Wardens, EnemySnapshots
// and the tests call stay here and hand the boss to them.

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
import * as Phases from '../boss/phases.js';
import * as Invulnerability from '../boss/invulnerability.js';
import * as Fan from '../boss/fan.js';
import * as Volley from '../boss/volley.js';
import * as Charge from '../boss/charge.js';
import * as Minions from '../boss/minions.js';
import * as PlayerTarget from '../boss/playerTarget.js';
import * as DamageFlash from '../boss/damageFlash.js';

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
    DamageFlash.resetFeedbackState(this);
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
    Phases.syncPhaseThresholds(this, force);
  }

  applyPhaseMovement(force = false) {
    Phases.applyPhaseMovement(this, force);
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

    const target = PlayerTarget.resolvePlayerTarget(this);

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

  updateSpreadCycle(deltaTime, target) {
    Fan.updateSpreadCycle(this, deltaTime, target);
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
    Volley.updateVolleyCycle(this, deltaTime, target);
    Minions.updateMinionSpawns(this, deltaTime);
  }

  handlePhaseFinale(deltaTime, target) {
    this.updateChargeState(deltaTime, target);
  }

  updateInvulnerability(deltaTime) {
    Invulnerability.updateInvulnerability(this, deltaTime);
  }

  updateChargeState(deltaTime, target) {
    Charge.updateChargeState(this, deltaTime, target);
  }

  beginCharge(target) {
    Charge.beginCharge(this, target);
  }

  updateFeedbackState(deltaTime) {
    DamageFlash.updateFeedbackState(this, deltaTime);
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
    Minions.spawnMinion(this);
  }

  pickMinionType() {
    return Minions.pickMinionType(this.minionTypes, this.minionRandom);
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

    DamageFlash.triggerDamageFlash(this, amount);

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

  evaluatePhaseTransition() {
    Phases.evaluatePhaseTransition(this);
  }

  advancePhase() {
    Phases.advancePhase(this);
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
    DamageFlash.resetFeedbackState(this);

    Invulnerability.emitInvulnerabilityState(this, false, {
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
    DamageFlash.resetFeedbackState(this);

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
