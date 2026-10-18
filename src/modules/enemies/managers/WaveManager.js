/**
 * Wave Manager
 *
 * Manages wave progression, spawning, and difficulty scaling.
 * Supports multiple enemy types and complex wave compositions.
 *
 * Features:
 * - Layer table (src/data/layers.js): rocks, timed roster, surges, Warden
 * - Multiple enemy type support
 * - Wave state tracking
 *
 * @example
 * ```javascript
 * const waveManager = new WaveManager({ enemySystem, eventBus });
 * waveManager.startNextWave();
 * waveManager.update(deltaTime);
 * ```
 */

import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import RandomService from '../../../core/RandomService.js';
import {
  normalizeDependencies,
  requireService,
  resolveService,
} from '../../../core/serviceUtils.js';
import { debugLog } from '../../../core/debugLogging.js';
import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';
import { clamp } from '../../../utils/mathHelpers.js';
import {
  ASTEROID_EDGE_SPAWN_MARGIN,
  ASTEROID_SAFE_SPAWN_DISTANCE,
  WAVE_BREAK_TIME,
  WAVE_SPAWN_DELAY,
  WAVEMANAGER_HANDLES_ASTEROID_SPAWN,
} from '../../../data/constants/gameplay.js';
import { ENEMY_TYPES, BOSS_CONFIG } from '../../../data/constants/visual.js';
import { IS_DEV } from '../../../core/env.js';
import {
  BOSS_RUSH_BREATHER_SECONDS,
  FIELD_EVENTS,
  LAYER_MODIFIERS,
  bossRushDirectorFor,
  directorFor,
  nextBossRushLayer,
} from '../../../data/layers.js';
import { scaleDirector } from '../../../data/difficulty.js';
import { HERALD_SPAWN_AT } from '../../../data/enemies/herald.js';
import { PALETTE, withAlpha } from '../../../data/constants/palette.js';

// Support kinds the layer table can list; they spawn at a safe distance from
// the player (asteroids come in from the edges).
const SUPPORT_KINDS = [
  'drone',
  'mine',
  'hunter',
  'husk',
  'ram',
  'bulwark',
  'weaver',
  'caster',
  'shade',
];
// Surge bursts: units spread this far (px) along the edge either side of the
// burst point; support enemies appear this far inside the field.
const SURGE_SPREAD = 70;
const SURGE_INSET = 40;
// Field events: a Gravity Well point stays this far inside the field; the
// Solar Flare screen flash (color alpha, seconds, intensity). Proposta 18/10.
const GRAVITY_WELL_INSET = 40;
const SOLAR_FLARE_FLASH = { alpha: 0.5, duration: 0.6, intensity: 0.45 };

export class WaveManager {
  /**
   * Creates a new Wave Manager.
   *
   * @param {Object} dependencies - Dependencies for WaveManager
   * @param {Object} dependencies.enemySystem - Reference to EnemySystem
   * @param {Object} dependencies.eventBus - Event bus for wave events
   * @param {Object} dependencies.random - Random service override
   */
  constructor(dependencies = {}) {
    this.dependencies = normalizeDependencies(dependencies);

    this.enemySystem =
      this.dependencies.enemySystem ||
      requireService('enemies', this.dependencies, 'WaveManager');

    this.eventBus =
      this.dependencies.eventBus ||
      requireService('event-bus', this.dependencies, 'WaveManager');

    this._onEnemyDestroyedHandler = null;
    this._isEnemyDestroyedListenerActive = false;
    this._enemyDestroyedBus = null;

    let resolvedRandom =
      this.dependencies.random ||
      this.enemySystem.getRandomScope('wave-manager', {
        label: 'wave-manager',
      }) ||
      resolveService('random', this.dependencies) ||
      null;

    if (!resolvedRandom || typeof resolvedRandom.float !== 'function') {
      resolvedRandom = new RandomService();
    }

    this.random = resolvedRandom;
    this.randomScopeLabels = {
      spawn: 'wave-manager:spawn',
      variants: 'wave-manager:variants',
      fragments: 'wave-manager:fragments',
    };
    this.randomScopeSeeds = {};
    this.randomScopes = this.createRandomScopes(this.random);
    this.captureRandomScopeSeeds();
    this.randomSequences = { spawn: 0, variants: 0, fragments: 0 };
    this._fallbackRandom = null;

    const enemyTypes = ENEMY_TYPES || {};
    this.enemyTypeKeys = {
      asteroid: 'asteroid',
      drone: enemyTypes.drone?.key || 'drone',
      mine: enemyTypes.mine?.key || 'mine',
      hunter: enemyTypes.hunter?.key || 'hunter',
    };
    this.bossEnemyKey = (BOSS_CONFIG && BOSS_CONFIG.key) || 'boss';
    this.enemyTypeDefaults = {
      drone: enemyTypes.drone || {},
      mine: enemyTypes.mine || {},
      hunter: enemyTypes.hunter || {},
    };

    // Wave state
    this.currentWave = 0;
    // Boss Rush run (set by GameSessionService before the run resets): only
    // the Warden layers, a breather between them.
    this.bossRush = false;
    this.waveInProgress = false;
    this.wavePaused = false;
    this.waveStartTime = 0;
    this.waveEndTime = 0;

    // Spawn tracking
    this.enemiesSpawnedThisWave = 0;
    this.enemiesKilledThisWave = 0;
    this.totalEnemiesThisWave = 0;
    this.totalAsteroidEnemiesThisWave = 0;
    this.asteroidsSpawnedThisWave = 0;
    this.asteroidsKilledThisWave = 0;
    this.spawnQueue = [];
    this._legacyRegisteredEnemies = new WeakSet();
    this._trackedDynamicMinions = new WeakSet();
    this.managerTotalsForWave = { all: 0, asteroids: 0 };
    this.compatibilityModeActive = false;

    // Timers
    this.spawnTimer = 0;
    this.spawnDelay = WAVE_SPAWN_DELAY || 1.0;
    this.spawnDelayMultiplier = 1;
    this.waveDelay = WAVE_BREAK_TIME || 10.0; // WAVE-004: Usar WAVE_BREAK_TIME para paridade com sistema legado
    this.waveCountdown = 0;

    // Timed spawns for the layer in progress (src/data/layers.js), sorted by
    // `at` (seconds into the layer).
    this.layerSchedule = [];
    this.activeFieldEvents = [];
    this.layerElapsed = 0;
    // The layer's modifier id (LAYER_MODIFIERS) while it plays, else null.
    this.layerModifier = null;

    this.connectEventListeners();

    debugLog('[WaveManager] Initialized');
  }

  connectEventListeners() {
    const eventBus = this.eventBus;
    if (!this._onEnemyDestroyedHandler) {
      this._onEnemyDestroyedHandler = (data) => this.onEnemyDestroyed(data);
    }

    if (this._enemyDestroyedBus && this._enemyDestroyedBus !== eventBus) {
      this.disconnect();
    }

    if (this._isEnemyDestroyedListenerActive) {
      return;
    }

    // WAVE-004: Conectar ao evento de destruição para progressão automática de ondas
    eventBus.on('enemy-destroyed', this._onEnemyDestroyedHandler);
    this._enemyDestroyedBus = eventBus;
    this._isEnemyDestroyedListenerActive = true;
  }

  disconnect() {
    const bus = this._enemyDestroyedBus || this.eventBus;

    if (this._onEnemyDestroyedHandler) {
      bus.off('enemy-destroyed', this._onEnemyDestroyedHandler);
    }

    this._isEnemyDestroyedListenerActive = false;
    this._enemyDestroyedBus = null;
  }

  cloneWaveConfig(config = {}) {
    if (!config || typeof config !== 'object') {
      return { isBossWave: false, enemies: [] };
    }

    const cloned = {
      ...config,
      enemies: Array.isArray(config.enemies)
        ? config.enemies.map((group) => ({ ...group }))
        : [],
    };

    if (config.boss) {
      cloned.boss = { ...config.boss };
    }

    if (Array.isArray(config.supportGroups)) {
      cloned.supportGroups = config.supportGroups.map((group) => ({
        ...group,
      }));
    }

    if (config.metadata && typeof config.metadata === 'object') {
      cloned.metadata = { ...config.metadata };
    }

    return cloned;
  }

  isBossWave(waveNumber) {
    if (!Number.isFinite(waveNumber) || waveNumber <= 0) {
      return false;
    }

    return directorFor(waveNumber).warden;
  }

  getAsteroidDistributionWeights() {
    return { large: 0.5, medium: 0.3, small: 0.2 };
  }

  normalizeAsteroidDistribution(distribution = {}) {
    const weights = {
      large: Math.max(0, Number(distribution.large) || 0),
      medium: Math.max(0, Number(distribution.medium) || 0),
      small: Math.max(0, Number(distribution.small) || 0),
    };

    const total = weights.large + weights.medium + weights.small;

    return { weights, total };
  }

  resolveAsteroidSpawnSize(
    random,
    distribution = this.getAsteroidDistributionWeights()
  ) {
    const { weights, total } = this.normalizeAsteroidDistribution(distribution);
    const fallbackRandom = this.getRandomService();

    let spawnRandom = random;
    if (
      !spawnRandom ||
      (typeof spawnRandom.float !== 'function' &&
        typeof spawnRandom.range !== 'function')
    ) {
      spawnRandom = this.resolveScopedRandom(
        random,
        'spawn',
        'wave-spawn:size'
      );
    }

    const drawFloat = () => {
      if (spawnRandom && typeof spawnRandom.float === 'function') {
        return spawnRandom.float();
      }
      if (spawnRandom && typeof spawnRandom.range === 'function') {
        return spawnRandom.range(0, 1);
      }
      if (fallbackRandom && typeof fallbackRandom.float === 'function') {
        return fallbackRandom.float();
      }
      return 0;
    };

    const sizeOrder = ['large', 'medium', 'small'];
    const normalizedTotal = total > 0 ? total : 1;
    const roll = drawFloat();
    let cumulative = 0;

    for (const size of sizeOrder) {
      const weight = weights[size] / normalizedTotal;
      if (weight <= 0) {
        continue;
      }

      cumulative += weight;
      if (roll < cumulative) {
        return size;
      }
    }

    return sizeOrder[sizeOrder.length - 1];
  }

  filterAvailableMinionTypes(candidates) {
    const list = Array.isArray(candidates) ? candidates : [];
    const seen = new Set();
    const result = [];
    const availableKeys = new Set(
      Object.values(this.enemyTypeKeys || {}).map((value) =>
        typeof value === 'string'
          ? value.toLowerCase()
          : String(value || '').toLowerCase()
      )
    );

    for (let i = 0; i < list.length; i += 1) {
      const value = list[i];
      if (!value) {
        continue;
      }

      const key = String(value).trim().toLowerCase();
      if (!key || key === 'boss' || seen.has(key)) {
        continue;
      }

      if (availableKeys.size > 0 && !availableKeys.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(key);
    }

    if (!result.length) {
      if (availableKeys.has('drone')) {
        result.push('drone');
      } else if (availableKeys.has('hunter')) {
        result.push('hunter');
      }
    }

    return result;
  }

  resolveBossDefaults() {
    const base = BOSS_CONFIG || {};
    const enemySystem = this.enemySystem;

    const minionTypes =
      enemySystem &&
      typeof enemySystem.getAvailableBossMinionTypes === 'function'
        ? enemySystem.getAvailableBossMinionTypes(base.minionTypes)
        : this.filterAvailableMinionTypes(base.minionTypes);

    return { ...base, minionTypes };
  }

  generateBossWave() {
    const bossDefaults = this.resolveBossDefaults();

    const bossRadius = bossDefaults.radius || 60;
    const safeDistance = Math.max(
      Number.isFinite(bossDefaults.safeDistance)
        ? bossDefaults.safeDistance
        : 0,
      bossRadius * 2.4
    );
    const entryPadding = Number.isFinite(bossDefaults.entryPadding)
      ? Math.max(0, bossDefaults.entryPadding)
      : Math.max(20, bossRadius * 0.35);
    const entryDriftSpeed = Number.isFinite(bossDefaults.entryDriftSpeed)
      ? bossDefaults.entryDriftSpeed
      : Math.max(45, (bossDefaults.speed || 60) * 0.85);

    const bossEntry = {
      type: this.bossEnemyKey || bossDefaults.key || 'boss',
      key: bossDefaults.key || this.bossEnemyKey || 'boss',
      count: 1,
      displayName: bossDefaults.displayName || 'Boss',
      radius: bossDefaults.radius,
      health: bossDefaults.health,
      healthScaling: bossDefaults.healthScaling,
      spawnStrategy: 'scripted-entrance',
      entrance: 'top-center',
      safeDistance,
      entryPadding,
      entryDriftSpeed,
      rewards: bossDefaults.rewards ? { ...bossDefaults.rewards } : undefined,
      randomScope: 'boss-spawn',
      randomParentScope: 'spawn',
      metadata: {
        minionTypes: Array.isArray(bossDefaults.minionTypes)
          ? [...bossDefaults.minionTypes]
          : undefined,
      },
    };

    return { isBossWave: true, boss: bossEntry, enemies: [] };
  }

  computeTotalEnemies(waveConfig) {
    if (!waveConfig || typeof waveConfig !== 'object') {
      return 0;
    }

    const supportTotal = (
      Array.isArray(waveConfig.enemies) ? waveConfig.enemies : []
    ).reduce((sum, group) => sum + (Number(group?.count) || 0), 0);

    const bossCount =
      waveConfig.boss && Number.isFinite(waveConfig.boss.count)
        ? Math.max(0, Math.floor(waveConfig.boss.count))
        : 0;

    return supportTotal + bossCount;
  }

  computeAsteroidOnlyTotal(waveConfig) {
    if (!waveConfig || typeof waveConfig !== 'object') {
      return 0;
    }

    const groups = Array.isArray(waveConfig.enemies) ? waveConfig.enemies : [];

    return groups.reduce((sum, group) => {
      if (!group || group.type !== 'asteroid') {
        return sum;
      }

      const count = Number(group.count);
      return (
        sum + (Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0)
      );
    }, 0);
  }

  filterForLegacyAsteroidFallback(waveConfig = {}) {
    if (this.shouldWaveManagerSpawnAsteroids()) {
      return waveConfig;
    }

    const originalEnemies = Array.isArray(waveConfig.enemies)
      ? waveConfig.enemies
      : [];

    if (originalEnemies.length === 0) {
      if (!waveConfig || typeof waveConfig !== 'object') {
        return { enemies: [] };
      }

      return { ...waveConfig, enemies: [] };
    }

    const filteredEnemies = originalEnemies.filter(
      (group) => group && group.type !== 'asteroid'
    );

    if (filteredEnemies.length === originalEnemies.length) {
      return waveConfig;
    }

    const filteredConfig = {
      ...waveConfig,
      enemies: filteredEnemies.map((group) => ({ ...group })),
    };

    if (waveConfig.boss && typeof waveConfig.boss === 'object') {
      filteredConfig.boss = { ...waveConfig.boss };
    }

    if (Array.isArray(waveConfig.supportGroups)) {
      filteredConfig.supportGroups = waveConfig.supportGroups
        .filter((group) => group && group.type !== 'asteroid')
        .map((group) => ({ ...group }));
    }

    const filteredCount = originalEnemies.length - filteredEnemies.length;
    const metadata = {
      ...(waveConfig.metadata ? { ...waveConfig.metadata } : {}),
      asteroidFallbackFiltered: true,
      filteredAsteroidGroups: filteredCount,
    };

    filteredConfig.metadata = metadata;

    return filteredConfig;
  }

  shouldWaveManagerSpawnAsteroids() {
    const handlesOverride =
      typeof globalThis !== 'undefined'
        ? globalThis.__WAVEMANAGER_HANDLES_ASTEROID_SPAWN_OVERRIDE__
        : undefined;

    if (handlesOverride === true) {
      return true;
    }
    if (handlesOverride === false) {
      return false;
    }

    return Boolean(WAVEMANAGER_HANDLES_ASTEROID_SPAWN);
  }

  registerActiveEnemy(enemy, { skipDuplicateCheck = false } = {}) {
    if (!enemy) {
      return false;
    }

    if (!this.waveInProgress) {
      return false;
    }

    if (this.shouldWaveManagerSpawnAsteroids()) {
      return false;
    }

    const asteroidKey =
      this.enemyTypeKeys && this.enemyTypeKeys.asteroid
        ? String(this.enemyTypeKeys.asteroid).toLowerCase()
        : 'asteroid';
    const candidateType =
      enemy?.type ||
      enemy?.enemyType ||
      enemy?.enemyKind ||
      enemy?.kind ||
      null;
    const normalizedCandidate =
      typeof candidateType === 'string' ? candidateType.toLowerCase() : null;

    if (normalizedCandidate !== asteroidKey) {
      return false;
    }

    if (!this._legacyRegisteredEnemies) {
      this._legacyRegisteredEnemies = new WeakSet();
    }

    const bypassDuplicateCheck = Boolean(skipDuplicateCheck);
    const alreadyRegistered = this._legacyRegisteredEnemies.has(enemy);

    if (!bypassDuplicateCheck && alreadyRegistered) {
      return false;
    }

    if (!alreadyRegistered) {
      this._legacyRegisteredEnemies.add(enemy);
    }

    const coerce = (value) => (Number.isFinite(value) ? value : 0);

    this.enemiesSpawnedThisWave = coerce(this.enemiesSpawnedThisWave) + 1;
    this.totalEnemiesThisWave = coerce(this.totalEnemiesThisWave) + 1;
    this.totalAsteroidEnemiesThisWave =
      coerce(this.totalAsteroidEnemiesThisWave) + 1;
    this.asteroidsSpawnedThisWave = coerce(this.asteroidsSpawnedThisWave) + 1;

    if (!this.shouldWaveManagerSpawnAsteroids()) {
      this.totalEnemiesThisWave = this.enemiesSpawnedThisWave;
      this.totalAsteroidEnemiesThisWave = this.asteroidsSpawnedThisWave;
    }

    return true;
  }

  getNormalizedEnemyType(enemy) {
    if (!enemy) {
      return null;
    }

    const rawType =
      enemy.type ||
      enemy.enemyType ||
      enemy.enemyKind ||
      enemy.kind ||
      (typeof enemy === 'string' ? enemy : null);

    return typeof rawType === 'string' ? rawType.toLowerCase() : null;
  }

  isAsteroidType(type) {
    if (!type) {
      return false;
    }

    const asteroidKey = this.enemyTypeKeys?.asteroid
      ? String(this.enemyTypeKeys.asteroid).toLowerCase()
      : 'asteroid';

    return String(type).toLowerCase() === asteroidKey;
  }

  isBossMinionEnemy(enemy) {
    if (!enemy) {
      return false;
    }

    if (enemy.isBossMinion) {
      return true;
    }

    if (typeof enemy.hasTag === 'function' && enemy.hasTag('minion')) {
      return true;
    }

    const spawnSource =
      (typeof enemy.spawnSource === 'string' && enemy.spawnSource) ||
      (enemy.metadata && typeof enemy.metadata.spawnSource === 'string'
        ? enemy.metadata.spawnSource
        : null);

    if (spawnSource && spawnSource.toLowerCase() === 'boss-minion') {
      return true;
    }

    if (enemy.spawnedByBossId) {
      return true;
    }

    return false;
  }

  registerDynamicMinion(enemy, context = {}) {
    if (!enemy) {
      return false;
    }

    if (!this.waveInProgress) {
      GameDebugLogger.log(
        'STATE',
        'Boss minion spawn ignored - wave inactive',
        {
          bossId: context?.bossId ?? null,
          wave: this.currentWave,
          minionId: enemy.id,
        }
      );
      return false;
    }

    if (!this._trackedDynamicMinions) {
      this._trackedDynamicMinions = new WeakSet();
    }

    if (this._trackedDynamicMinions.has(enemy)) {
      return false;
    }

    this._trackedDynamicMinions.add(enemy);

    const coerce = (value) => (Number.isFinite(value) ? value : 0);
    const normalizedType = this.getNormalizedEnemyType(enemy);
    const isAsteroid = this.isAsteroidType(normalizedType);

    this.enemiesSpawnedThisWave = coerce(this.enemiesSpawnedThisWave) + 1;
    this.totalEnemiesThisWave = coerce(this.totalEnemiesThisWave) + 1;

    if (isAsteroid) {
      this.totalAsteroidEnemiesThisWave =
        coerce(this.totalAsteroidEnemiesThisWave) + 1;
      this.asteroidsSpawnedThisWave = coerce(this.asteroidsSpawnedThisWave) + 1;
    }

    if (this.managerTotalsForWave) {
      const managerAll = Number.isFinite(this.managerTotalsForWave.all)
        ? this.managerTotalsForWave.all
        : 0;
      const managerAsteroids = Number.isFinite(
        this.managerTotalsForWave.asteroids
      )
        ? this.managerTotalsForWave.asteroids
        : 0;

      this.managerTotalsForWave = {
        all: managerAll + 1,
        asteroids: managerAsteroids + (isAsteroid ? 1 : 0),
      };
    }

    if (this.enemySystem?.waveState && this.enemySystem.waveState.isActive) {
      const state = this.enemySystem.waveState;
      state.totalAsteroids = coerce(state.totalAsteroids) + 1;
      state.asteroidsSpawned = coerce(state.asteroidsSpawned) + 1;
    }

    GameDebugLogger.log('STATE', 'Boss minion accounted for wave totals', {
      wave: this.currentWave,
      minionId: enemy.id,
      minionType: normalizedType || enemy.type || enemy.enemyType || null,
      bossId: context?.bossId ?? enemy.spawnedByBossId ?? null,
      totals: {
        spawned: this.enemiesSpawnedThisWave,
        total: this.totalEnemiesThisWave,
      },
    });

    return true;
  }

  createSupportGroup(kind, count) {
    if (!count || count <= 0) {
      return null;
    }

    const defaults = this.enemyTypeDefaults || {};

    switch (kind) {
      case 'drone': {
        const droneDefaults = defaults.drone || {};
        return {
          type: this.enemyTypeKeys?.drone || 'drone',
          count,
          fireRate: droneDefaults.fireRate,
          fireVariance: droneDefaults.fireVariance,
          fireSpread: droneDefaults.fireSpread,
          projectileSpeed: droneDefaults.projectileSpeed,
          projectileDamage: droneDefaults.projectileDamage,
          targetingRange: droneDefaults.targetingRange,
          speed: droneDefaults.speed,
          acceleration: droneDefaults.acceleration,
        };
      }
      case 'mine': {
        const mineDefaults = defaults.mine || {};
        return {
          type: this.enemyTypeKeys?.mine || 'mine',
          count,
          armTime: mineDefaults.armTime,
          proximityRadius: mineDefaults.proximityRadius,
          explosionRadius: mineDefaults.explosionRadius,
          explosionDamage: mineDefaults.explosionDamage,
          pulseSpeed: mineDefaults.pulseSpeed,
          pulseAmount: mineDefaults.pulseAmount,
          lifetime: mineDefaults.lifetime,
        };
      }
      case 'hunter': {
        const hunterDefaults = defaults.hunter || {};
        return {
          type: this.enemyTypeKeys?.hunter || 'hunter',
          count,
          preferredDistance: hunterDefaults.preferredDistance,
          burstCount: hunterDefaults.burstCount,
          burstInterval: hunterDefaults.burstInterval,
          burstDelay: hunterDefaults.burstDelay,
          fireSpread: hunterDefaults.fireSpread,
          projectileSpeed: hunterDefaults.projectileSpeed,
          projectileDamage: hunterDefaults.projectileDamage,
          fireRange: hunterDefaults.fireRange,
          speed: hunterDefaults.speed,
          acceleration: hunterDefaults.acceleration,
        };
      }
      default:
        return SUPPORT_KINDS.includes(kind) ? { type: kind, count } : null;
    }
  }

  /**
   * Starts the next wave.
   *
   * @returns {boolean} True if wave started successfully
   */
  startNextWave() {
    if (this.waveInProgress) {
      console.warn(
        '[WaveManager] Cannot start wave - wave already in progress'
      );
      return false;
    }

    this.currentWave = this.bossRush
      ? nextBossRushLayer(this.currentWave)
      : this.currentWave + 1;
    this.waveInProgress = true;
    this.waveStartTime = this.getSimulationTimeMs();
    this.enemiesSpawnedThisWave = 0;
    this.enemiesKilledThisWave = 0;
    this.asteroidsSpawnedThisWave = 0;
    this.asteroidsKilledThisWave = 0;
    this.totalAsteroidEnemiesThisWave = 0;
    this.spawnQueue = [];
    this._legacyRegisteredEnemies = new WeakSet();
    this._trackedDynamicMinions = new WeakSet();

    const waveNumber = this.currentWave;
    const waveManagerSpawnsAsteroids = this.shouldWaveManagerSpawnAsteroids();
    // Same scaling as EnemySystem.layerDirector (difficulty spawnCount); the
    // endless modifiers roll from the run seed, so each run gets its own.
    const difficulty = resolveService(
      'difficulty',
      this.enemySystem.dependencies
    );
    const director = this.applyHuntersMoon(
      scaleDirector(
        this.bossRush
          ? bossRushDirectorFor(waveNumber)
          : directorFor(waveNumber, difficulty?.getRunSeed() ?? 0),
        difficulty?.getModifiers().spawnCount ?? 1
      )
    );
    let config;

    if (director.warden) {
      GameDebugLogger.log('WAVE', 'Boss wave detected', { wave: waveNumber });
      config = this.generateBossWave();
    } else {
      config = { isBossWave: false, enemies: [] };
    }

    if (director.rocks > 0) {
      // Sizes roll at spawn time (spawnWave) to keep the random call order
      // deterministic.
      const distributionWeights = this.getAsteroidDistributionWeights();
      config.enemies.push({
        type: 'asteroid',
        count: director.rocks,
        size: null,
        variant: null,
        metadata: { distributionWeights },
      });
    }

    config.isBossWave = Boolean(config.isBossWave);

    this.layerSchedule = this.buildLayerSchedule(director);
    this.layerElapsed = 0;

    const effectiveConfig = this.filterForLegacyAsteroidFallback(config);
    effectiveConfig.isBossWave = Boolean(effectiveConfig.isBossWave);

    const sharedSpawnDelayMultiplier =
      this.resolveWaveSpawnDelayMultiplier(effectiveConfig);
    effectiveConfig.spawnDelayMultiplier = sharedSpawnDelayMultiplier;

    let computedTotalEnemies = this.computeTotalEnemies(effectiveConfig);
    let asteroidOnlyTotal = this.computeAsteroidOnlyTotal(effectiveConfig);

    if (!waveManagerSpawnsAsteroids) {
      // Legacy fallback only defers asteroid spawning. Bosses and support
      // enemies are still spawned and completed by WaveManager.
      computedTotalEnemies = Math.max(
        0,
        Math.floor(computedTotalEnemies - asteroidOnlyTotal)
      );
      asteroidOnlyTotal = 0;
    }

    // Scheduled spawns count up front; in legacy mode surge rocks register
    // themselves on spawn (registerActiveEnemy), like the legacy ones.
    for (const { groups } of this.layerSchedule) {
      for (const { kind, count } of groups) {
        const isAsteroid = this.isAsteroidType(kind);
        if (isAsteroid && !waveManagerSpawnsAsteroids) continue;
        computedTotalEnemies += count;
        if (isAsteroid) asteroidOnlyTotal += count;
      }
    }

    const rawManagerTotals = {
      all: Math.max(0, Math.floor(computedTotalEnemies)),
      asteroids: Math.max(0, Math.floor(asteroidOnlyTotal)),
    };

    this.totalEnemiesThisWave = computedTotalEnemies;
    this.totalAsteroidEnemiesThisWave = asteroidOnlyTotal;
    this.managerTotalsForWave = { ...rawManagerTotals };
    this.compatibilityModeActive = true;

    const waveEventPayload = {
      wave: waveNumber,
      totalEnemies: this.totalEnemiesThisWave,
      asteroidTotal: asteroidOnlyTotal,
      isBossWave: effectiveConfig.isBossWave,
      spawnDelayMultiplier: sharedSpawnDelayMultiplier,
      compatibilityMode: true,
      managerTotals: { ...rawManagerTotals },
      bossRush: this.bossRush,
    };

    this.eventBus.emit('wave-started', waveEventPayload);
    if (director.modifier) {
      this.startLayerModifier(director.modifier);
    }

    // D-04: pre-boss tension trigger (one wave before a boss)
    if (this.isBossWave(waveNumber + 1)) {
      this.eventBus.emit('boss-warning', {
        wave: waveNumber,
        nextBossWave: waveNumber + 1,
      });
    }

    if (IS_DEV) {
      this.eventBus.emit('wave-started-debug', {
        ...waveEventPayload,
        config: this.cloneWaveConfig(effectiveConfig),
      });
    }

    if (effectiveConfig.isBossWave) {
      const supportGroups = Array.isArray(effectiveConfig.supportGroups)
        ? effectiveConfig.supportGroups.map((group) => ({ ...group }))
        : Array.isArray(effectiveConfig.enemies)
          ? effectiveConfig.enemies.map((group) => ({ ...group }))
          : [];

      this.eventBus.emit('boss-wave-started', {
        wave: waveNumber,
        totalEnemies: this.totalEnemiesThisWave,
        asteroidTotal: asteroidOnlyTotal,
        compatibilityMode: true,
        managerTotals: { ...rawManagerTotals },
        boss: effectiveConfig.boss ? { ...effectiveConfig.boss } : null,
        support: supportGroups,
        config: this.cloneWaveConfig(effectiveConfig),
      });
    }

    if (effectiveConfig.isBossWave) {
      this.queueBossWaveSpawns(effectiveConfig);
    } else {
      this.spawnWave(effectiveConfig);
    }

    debugLog(
      `[WaveManager] Started wave ${waveNumber} (${this.totalEnemiesThisWave} enemies${
        effectiveConfig.isBossWave ? ', boss wave' : ''
      })`
    );
    return true;
  }

  /**
   * Resolves a deterministic spawn delay multiplier for the provided wave configuration.
   * The multiplier is cached on the config object so boss support groups reuse the same pacing.
   *
   * @param {Object} waveConfig - Wave configuration
   * @returns {number} Effective spawn delay multiplier
   */
  resolveWaveSpawnDelayMultiplier(waveConfig = {}) {
    const existingMultiplier = Number(waveConfig?.spawnDelayMultiplier);

    if (Number.isFinite(existingMultiplier) && existingMultiplier > 0) {
      return existingMultiplier;
    }

    const spawnDelayRandom = this.resolveScopedRandom(
      this.randomScopes?.spawn,
      'spawn',
      'wave-spawn-delay'
    );

    const generatedMultiplier =
      spawnDelayRandom && typeof spawnDelayRandom.range === 'function'
        ? spawnDelayRandom.range(0.5, 1)
        : 1;

    const sanitizedMultiplier =
      Number.isFinite(generatedMultiplier) && generatedMultiplier > 0
        ? generatedMultiplier
        : 1;

    if (waveConfig && typeof waveConfig === 'object') {
      waveConfig.spawnDelayMultiplier = sanitizedMultiplier;
    }

    return sanitizedMultiplier;
  }

  /**
   * Spawns enemies for the current wave using the factory pattern.
   *
   * @param {Object} waveConfig - Wave configuration
   * @param {Object} [options]
   * @param {boolean} [options.surge] - Burst: every unit (asteroids too)
   *   spawns around one point on the field edge farthest from the player.
   */
  spawnWave(waveConfig, { surge = false } = {}) {
    const enemyGroups = Array.isArray(waveConfig?.enemies)
      ? waveConfig.enemies
      : [];

    const waveManagerSpawnsAsteroids = this.shouldWaveManagerSpawnAsteroids();

    if (!waveManagerSpawnsAsteroids && !surge) {
      if (enemyGroups.length === 0) {
        return;
      }

      const onlyAsteroids = enemyGroups.every(
        (group) => (group?.type || '').toLowerCase() === 'asteroid'
      );

      if (onlyAsteroids) {
        return;
      }
    }

    const world = this.enemySystem?.getCachedWorld?.();
    const worldBounds =
      world && typeof world.getBounds === 'function'
        ? world.getBounds()
        : {
            width: GAME_WIDTH || 800,
            height: GAME_HEIGHT || 600,
          };
    const player = this.enemySystem.getCachedPlayer();
    const playerSnapshot = this.enemySystem.getPlayerPositionSnapshot(player);
    const safeDistance = ASTEROID_SAFE_SPAWN_DISTANCE || 200;
    const compatibilityMode = this.compatibilityModeActive;
    const defaultDistributionWeights = this.getAsteroidDistributionWeights();
    const surgeEdge = surge
      ? this.calculateSurgeEdge(worldBounds, playerSnapshot)
      : null;

    const spawnDelayMultiplier =
      this.resolveWaveSpawnDelayMultiplier(waveConfig);
    this.spawnDelayMultiplier = spawnDelayMultiplier;
    const effectiveSpawnDelay = this.spawnDelay * spawnDelayMultiplier;

    for (const enemyGroup of enemyGroups) {
      if (!enemyGroup || typeof enemyGroup !== 'object') {
        continue;
      }

      const typeKey =
        typeof enemyGroup.type === 'string'
          ? enemyGroup.type.toLowerCase()
          : '';
      const isAsteroid = typeKey === 'asteroid';
      // Heralds appear in the field like support enemies (never Elite).
      const isTacticalEnemy =
        SUPPORT_KINDS.includes(typeKey) || typeKey === 'herald';
      // Legacy mode: the bridge (registerActiveEnemy) counts asteroids.
      const countedByBridge = isAsteroid && !waveManagerSpawnsAsteroids;

      if (countedByBridge && !surgeEdge) {
        continue;
      }

      const groupCount = Math.max(0, Math.floor(Number(enemyGroup.count) || 0));
      if (groupCount <= 0) {
        continue;
      }

      for (let i = 0; i < groupCount; i++) {
        const spawnContext = isAsteroid
          ? this.createLegacyAsteroidScopedRandom()
          : this.createScopedRandom('spawn', 'wave-spawn');

        let position;
        if (surgeEdge) {
          position = this.calculateSurgePosition(
            worldBounds,
            surgeEdge,
            isAsteroid,
            spawnContext.random
          );
        } else if (isAsteroid) {
          // Asteroids spawn on one of the 4 edges
          position = this.calculateEdgeSpawnPosition(
            worldBounds,
            spawnContext.random
          );
        } else if (isTacticalEnemy) {
          const anchor =
            playerSnapshot &&
            Number.isFinite(playerSnapshot.x) &&
            Number.isFinite(playerSnapshot.y)
              ? { x: playerSnapshot.x, y: playerSnapshot.y }
              : {
                  x: worldBounds.width / 2,
                  y: worldBounds.height / 2,
                };

          const tacticalPosition = this.calculatePlayerSafeInboundsPosition(
            worldBounds,
            anchor,
            safeDistance,
            spawnContext.random
          );

          position = { x: tacticalPosition.x, y: tacticalPosition.y };

          let isInBounds = this.isPositionWithinBounds(position, worldBounds);
          let fallbackApplied = false;

          if (!isInBounds) {
            position = this.calculateCenterBandFallbackPosition(
              worldBounds,
              spawnContext.random
            );
            isInBounds = this.isPositionWithinBounds(position, worldBounds);
            fallbackApplied = true;
          }

          GameDebugLogger.log('SPAWN', `${typeKey} spawn position`, {
            type: typeKey,
            position,
            playerPosition: anchor,
            safeDistance,
            isInBounds,
            usedFallback:
              fallbackApplied || Boolean(tacticalPosition.usedFallback),
            clamped: Boolean(tacticalPosition.clamped),
          });
        } else {
          // Modern: spawn at safe distance from player when snapshot is available.
          // Fall back to edge positioning if we cannot resolve the player snapshot.
          if (!playerSnapshot) {
            position = this.calculateEdgeSpawnPosition(
              worldBounds,
              spawnContext.random
            );
          } else {
            position = this.calculateSafeSpawnPosition(
              worldBounds,
              playerSnapshot,
              safeDistance,
              spawnContext.random
            );
          }
        }

        if (
          !position ||
          !Number.isFinite(position.x) ||
          !Number.isFinite(position.y)
        ) {
          position = {
            x: worldBounds.width / 2,
            y: worldBounds.height / 2,
          };
        }

        if (
          position.x < -100 ||
          position.x > worldBounds.width + 100 ||
          position.y < -100 ||
          position.y > worldBounds.height + 100
        ) {
          GameDebugLogger.log('ERROR', 'Enemy spawn position out of bounds', {
            type: typeKey,
            position,
            worldBounds,
          });

          position.x = worldBounds.width / 2;
          position.y = worldBounds.height / 2;
        }

        const {
          count: _omittedCount,
          spawnIndexBase: groupSpawnIndexBase,
          metadata: groupMetadata,
          eliteChance = 0,
          ...groupConfig
        } = enemyGroup;

        const spawnIndexBase = Number.isFinite(groupSpawnIndexBase)
          ? groupSpawnIndexBase
          : 0;
        const spawnIndex = spawnIndexBase + i;

        let resolvedSize = groupConfig.size || enemyGroup.size;
        if (isAsteroid && (!resolvedSize || resolvedSize === 'auto')) {
          const distributionForGroup =
            (groupMetadata && groupMetadata.distributionWeights) ||
            defaultDistributionWeights;

          resolvedSize = this.resolveAsteroidSpawnSize(
            spawnContext.random,
            distributionForGroup
          );
        }

        const enemyConfig = {
          ...groupConfig,
          type: groupConfig.type || enemyGroup.type,
          size: resolvedSize,
          variant: Object.prototype.hasOwnProperty.call(groupConfig, 'variant')
            ? groupConfig.variant
            : enemyGroup.variant,
          x: position.x,
          y: position.y,
          wave: this.currentWave,
          spawnIndex,
          spawnDelay: effectiveSpawnDelay,
          spawnDelayMultiplier: this.spawnDelayMultiplier,
        };

        if (
          !isAsteroid &&
          (enemyConfig.size === null ||
            typeof enemyConfig.size === 'undefined' ||
            enemyConfig.size === 'auto')
        ) {
          delete enemyConfig.size;
        }

        if (groupMetadata && typeof groupMetadata === 'object') {
          enemyConfig.metadata = {
            ...groupMetadata,
            spawnIndex,
            resolvedSize,
          };
        } else if (isAsteroid) {
          enemyConfig.metadata = { spawnIndex, resolvedSize };
        }

        if (spawnContext.random?.fork) {
          enemyConfig.random = spawnContext.random.fork('asteroid-core');
          enemyConfig.randomScope = 'spawn';
        }

        // Rolled after the core fork so the enemy's own stream is unchanged.
        if (isTacticalEnemy) {
          enemyConfig.elite = spawnContext.random.chance(eliteChance);
        }

        // Centralized acquisition path for factory-backed enemies
        const enemy = this.enemySystem.acquireEnemyViaFactory(
          enemyGroup.type,
          enemyConfig
        );

        if (
          enemy &&
          !enemy[Symbol.for('ASTEROIDS_ROGUEFIELD:factoryRegistered')]
        ) {
          this.enemySystem.registerActiveEnemy(enemy, {
            skipDuplicateCheck: true,
          });
        }

        if (enemy) {
          enemy[Symbol.for('ASTEROIDS_ROGUEFIELD:factoryRegistered')] = false;
        }

        if (enemy && !countedByBridge) {
          this.enemiesSpawnedThisWave++;
          if (compatibilityMode && isAsteroid) {
            this.asteroidsSpawnedThisWave++;
          }
        }
      }
    }
  }

  /**
   * Flattens a layer's roster, surges and field events into timed entries
   * sorted by `at` (seconds into the layer). Surge kinds are taken in turn.
   */
  buildLayerSchedule(director) {
    const schedule = [];

    for (const { kind, count, from, every, elite } of director.roster) {
      for (let i = 0; i < count; i += 1) {
        schedule.push({
          at: from + i * every,
          groups: [{ kind, count: 1 }],
          elite,
          surge: null,
        });
      }
    }

    for (const surge of director.surges) {
      const counts = new Map();
      for (let i = 0; i < surge.count; i += 1) {
        const kind = surge.kinds[i % surge.kinds.length];
        counts.set(kind, (counts.get(kind) || 0) + 1);
      }
      schedule.push({
        at: surge.at,
        groups: [...counts].map(([kind, count]) => ({ kind, count })),
        elite: 0,
        surge,
      });
    }

    for (const event of director.events) {
      schedule.push({ at: event.at, groups: [], elite: 0, surge: null, event });
    }

    // The Herald counts as one scheduled enemy: the layer holds until it dies.
    if (director.herald) {
      schedule.push({
        at: HERALD_SPAWN_AT,
        groups: [{ kind: 'herald', count: 1 }],
        elite: 0,
        surge: null,
        herald: director.herald,
      });
    }

    // Stable: entries due at the same time keep table order.
    return schedule.sort((a, b) => a.at - b.at);
  }

  /**
   * Advances the layer clock and spawns what is due. An empty field does not
   * wait: the next scheduled spawn comes at once.
   */
  updateLayerSchedule(deltaTime) {
    this.layerElapsed += deltaTime;
    this.updateFieldEvents(deltaTime);

    const next = this.layerSchedule[0];
    if (next && next.at > this.layerElapsed && this.isFieldEmpty()) {
      this.layerElapsed = next.at;
    }

    while (
      this.layerSchedule.length > 0 &&
      this.layerSchedule[0].at <= this.layerElapsed
    ) {
      this.spawnScheduled(this.layerSchedule.shift());
    }

    this.checkWaveCompletion();
  }

  spawnScheduled({ groups, elite, surge, event, herald }) {
    if (event) {
      this.startFieldEvent(event);
      return;
    }

    if (herald) {
      this.spawnWave({
        enemies: [{ type: 'herald', count: 1, heraldKind: herald }],
        spawnDelayMultiplier: this.spawnDelayMultiplier,
      });
      return;
    }

    const enemies = [];
    for (const { kind, count } of groups) {
      const group = this.isAsteroidType(kind)
        ? { type: kind, count, size: 'small', variant: 'common' }
        : this.createSupportGroup(kind, count);
      if (group) enemies.push({ ...group, eliteChance: elite });
    }

    this.spawnWave(
      { enemies, spawnDelayMultiplier: this.spawnDelayMultiplier },
      { surge: Boolean(surge) }
    );

    if (surge) {
      this.eventBus.emit('surge-started', {
        layer: this.currentWave,
        label: surge.label,
        kinds: [...surge.kinds],
        count: surge.count,
      });
    }
  }

  /**
   * Starts a field event: applies its gameplay effect and emits
   * 'field-event-started' {layer, kind, label, duration, x, y}; (x, y) is the
   * Gravity Well point, else the ship. 'field-event-ended' {kind} follows
   * `duration` seconds later (or when the layer ends).
   */
  startFieldEvent({ kind, label }) {
    const { duration } = FIELD_EVENTS[kind];
    const player = this.enemySystem.getPlayerPositionSnapshot(
      this.enemySystem.getCachedPlayer()
    );
    let point = player ? { x: player.x, y: player.y } : { x: 0, y: 0 };

    if (kind === 'gravity-well') {
      point = this.pickGravityWellPoint(point);
      const { pullSpeed, pullAcceleration } = FIELD_EVENTS[kind];
      this.enemySystem
        .getCachedXPOrbs?.()
        ?.startGlobalPull(duration, pullSpeed, pullAcceleration, 1, point);
    } else if (kind === 'solar-flare') {
      this.enemySystem.forEachActiveEnemy?.((enemy) => {
        enemy.stunTimer = duration;
      });
      this.enemySystem
        .getCachedEffects?.()
        ?.addScreenFlash(
          withAlpha(PALETTE.xp, SOLAR_FLARE_FLASH.alpha),
          SOLAR_FLARE_FLASH.duration,
          SOLAR_FLARE_FLASH.intensity
        );
    }

    this.activeFieldEvents.push({ kind, remaining: duration });
    this.eventBus.emit('field-event-started', {
      layer: this.currentWave,
      kind,
      label,
      duration,
      x: point.x,
      y: point.y,
    });
  }

  /**
   * Hunters' Moon: the roster keeps only its kinds, each count scaled;
   * surges keep their size, spawning only those kinds.
   */
  applyHuntersMoon(director) {
    if (director.modifier !== 'hunters-moon') return director;
    const { kinds, countScale } = LAYER_MODIFIERS['hunters-moon'];
    return {
      ...director,
      roster: director.roster
        .filter((entry) => kinds.includes(entry.kind))
        .map((entry) => ({
          ...entry,
          count: Math.round(entry.count * countScale),
        })),
      surges: director.surges
        .map((surge) => ({
          ...surge,
          kinds: surge.kinds.filter((kind) => kinds.includes(kind)),
        }))
        .filter((surge) => surge.kinds.length > 0),
    };
  }

  /**
   * Starts the layer's modifier and emits 'layer-modifier-started'
   * {layer, id, label, color}; 'layer-modifier-ended' {id} follows when the
   * layer ends. Glass Field is read on rock spawn (layerModifier); Magnetic
   * Storm sets the XP sparks drifting, seeded by run and layer.
   */
  startLayerModifier(id) {
    const { label, color } = LAYER_MODIFIERS[id];
    this.layerModifier = id;
    if (id === 'magnetic-storm') {
      const runSeed =
        resolveService(
          'difficulty',
          this.enemySystem.dependencies
        )?.getRunSeed() ?? 0;
      this.enemySystem
        .getCachedXPOrbs?.()
        ?.setDrift(
          LAYER_MODIFIERS[id],
          new RandomService(`magnetic-storm:${runSeed}:${this.currentWave}`)
        );
    }
    this.eventBus.emit('layer-modifier-started', {
      layer: this.currentWave,
      id,
      label,
      color,
    });
  }

  /** Ends the layer's modifier, if any (layer over, run reset). */
  endLayerModifier() {
    const id = this.layerModifier;
    if (!id) return;
    this.layerModifier = null;
    if (id === 'magnetic-storm') {
      this.enemySystem.getCachedXPOrbs?.()?.setDrift(null);
    }
    this.eventBus.emit('layer-modifier-ended', { id });
  }

  /** A point at a seeded angle and distance from the ship, inside the field. */
  pickGravityWellPoint(origin) {
    const { minDistance, maxDistance } = FIELD_EVENTS['gravity-well'];
    const { random } = this.createScopedRandom('spawn', 'gravity-well');
    const angle = random.range(0, Math.PI * 2);
    const distance = random.range(minDistance, maxDistance);
    const bounds = this.enemySystem.getCachedWorld?.()?.getBounds?.() || {
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    };
    return {
      x: clamp(
        origin.x + Math.cos(angle) * distance,
        GRAVITY_WELL_INSET,
        bounds.width - GRAVITY_WELL_INSET
      ),
      y: clamp(
        origin.y + Math.sin(angle) * distance,
        GRAVITY_WELL_INSET,
        bounds.height - GRAVITY_WELL_INSET
      ),
    };
  }

  /** Counts active field events down on the layer's own time. */
  updateFieldEvents(deltaTime) {
    for (const event of this.activeFieldEvents) {
      event.remaining -= deltaTime;
    }
    const ended = this.activeFieldEvents.filter((e) => e.remaining <= 0);
    if (ended.length === 0) return;
    this.activeFieldEvents = this.activeFieldEvents.filter(
      (e) => e.remaining > 0
    );
    for (const { kind } of ended) {
      this.eventBus.emit('field-event-ended', { kind });
    }
  }

  /** Ends every active field event at once (layer over, run reset). */
  endFieldEvents() {
    const ended = this.activeFieldEvents;
    this.activeFieldEvents = [];
    for (const { kind } of ended) {
      this.eventBus.emit('field-event-ended', { kind });
    }
  }

  /** Legacy mode: asteroids the EnemySystem spawner still owes this layer. */
  legacyRocksPending() {
    if (this.shouldWaveManagerSpawnAsteroids()) {
      return false;
    }
    const wave = this.enemySystem?.waveState;
    return (
      Boolean(wave?.isActive) && wave.asteroidsSpawned < wave.totalAsteroids
    );
  }

  isFieldEmpty() {
    return (
      this.getRemainingActiveEnemyCount() === 0 && !this.legacyRocksPending()
    );
  }

  /**
   * Completes the layer once everything it scheduled has spawned and every
   * enemy is gone.
   */
  checkWaveCompletion(excludedEnemy = null) {
    // Field events still to come do not hold the layer open.
    if (
      !this.waveInProgress ||
      this.layerSchedule.some((entry) => !entry.event) ||
      this.legacyRocksPending()
    ) {
      return;
    }

    const killsCleared =
      this.enemiesKilledThisWave >= this.totalEnemiesThisWave;
    if (
      killsCleared &&
      this.getRemainingActiveEnemyCount(excludedEnemy) === 0
    ) {
      this.completeWave();
    }
  }

  queueBossWaveSpawns(waveConfig = {}) {
    const queue = [];

    const sharedSpawnDelayMultiplier =
      this.resolveWaveSpawnDelayMultiplier(waveConfig);
    const baseConfig = {
      ...waveConfig,
      spawnDelayMultiplier: sharedSpawnDelayMultiplier,
    };

    const bossConfig = baseConfig.boss ? { ...baseConfig.boss } : null;
    if (bossConfig) {
      queue.push({
        type: 'boss',
        execute: () => this.spawnBossEnemy(bossConfig, baseConfig),
      });
    }

    const supportGroups = Array.isArray(baseConfig.enemies)
      ? baseConfig.enemies.map((group) => ({ ...group }))
      : [];

    supportGroups.forEach((group) => {
      queue.push({
        type: 'support-group',
        group,
        execute: () => this.spawnWave({ ...baseConfig, enemies: [group] }),
      });
    });

    this.spawnQueue = queue;
    this.processSpawnQueue();

    return queue;
  }

  processSpawnQueue() {
    if (!Array.isArray(this.spawnQueue)) {
      this.spawnQueue = [];
      return;
    }

    while (this.spawnQueue.length > 0) {
      const entry = this.spawnQueue.shift();

      if (!entry) {
        continue;
      }

      try {
        if (typeof entry === 'function') {
          entry();
        } else if (typeof entry.execute === 'function') {
          entry.execute();
        }
      } catch (error) {
        console.error(
          '[WaveManager] Failed to process spawn queue entry',
          error
        );
      }
    }

    this.spawnQueue = [];
  }

  spawnBossEnemy(bossConfig = {}, waveConfig = {}) {
    GameDebugLogger.log('SPAWN', 'Boss spawn attempted', {
      type: bossConfig.type,
      entrance: bossConfig.entrance,
      wave: this.currentWave,
    });

    const world = this.enemySystem?.getCachedWorld?.();
    const worldBounds =
      world && typeof world.getBounds === 'function'
        ? world.getBounds()
        : {
            width: GAME_WIDTH || 800,
            height: GAME_HEIGHT || 600,
          };

    const player = this.enemySystem.getCachedPlayer();
    const playerSnapshot = this.enemySystem.getPlayerPositionSnapshot(player);

    const spawnRandom = this.resolveScopedRandom(
      this.getRandomScope ? this.getRandomScope('boss-spawn') : null,
      'spawn',
      'boss-position'
    );

    const baseRadius = bossConfig.radius || BOSS_CONFIG?.radius || 60;
    const requestedSafeDistance = Number.isFinite(bossConfig.safeDistance)
      ? bossConfig.safeDistance
      : Number.isFinite(BOSS_CONFIG?.safeDistance)
        ? BOSS_CONFIG.safeDistance
        : 0;
    const safeDistance = Math.max(baseRadius * 2, requestedSafeDistance);
    const entryPadding = Number.isFinite(bossConfig.entryPadding)
      ? Math.max(0, bossConfig.entryPadding)
      : Number.isFinite(BOSS_CONFIG?.entryPadding)
        ? Math.max(0, BOSS_CONFIG.entryPadding)
        : Math.max(20, baseRadius * 0.35);
    const entryDriftSpeed = Number.isFinite(bossConfig.entryDriftSpeed)
      ? bossConfig.entryDriftSpeed
      : Number.isFinite(BOSS_CONFIG?.entryDriftSpeed)
        ? BOSS_CONFIG.entryDriftSpeed
        : Math.max(45, (bossConfig.speed || BOSS_CONFIG?.speed || 60) * 0.85);

    let spawnPosition;
    if (
      bossConfig?.spawnPosition &&
      Number.isFinite(bossConfig.spawnPosition.x) &&
      Number.isFinite(bossConfig.spawnPosition.y)
    ) {
      spawnPosition = { ...bossConfig.spawnPosition };
    } else {
      spawnPosition = this.calculateBossSpawnPosition(
        worldBounds,
        bossConfig.entrance || 'top-center',
        { safeDistance, entryPadding },
        playerSnapshot,
        spawnRandom
      );
    }

    GameDebugLogger.log('SPAWN', 'Boss position calculated', {
      x: spawnPosition.x,
      y: spawnPosition.y,
      entrance: bossConfig.entrance || 'top-center',
      worldBounds,
      safeDistance,
      entryPadding,
      entryDriftSpeed,
    });

    const metadata = {
      ...(bossConfig.metadata || {}),
      wave: this.currentWave,
      isBossWave: true,
      spawnSource: 'wave-manager',
      entrance: bossConfig.entrance || 'top-center',
      supportPlan: Array.isArray(waveConfig.enemies)
        ? waveConfig.enemies.map((group) => ({
            type: group.type,
            count: group.count,
          }))
        : undefined,
    };

    const bossSpawnConfig = {
      ...bossConfig,
      x: spawnPosition.x,
      y: spawnPosition.y,
      wave: this.currentWave,
      safeDistance,
      entryPadding,
      entryDriftSpeed,
      spawnStrategy: bossConfig.spawnStrategy || 'scripted-entrance',
      entrance: bossConfig.entrance || 'top-center',
      spawnOffset: bossConfig.spawnOffset,
      randomScope: bossConfig.randomScope || 'boss-spawn',
      randomParentScope: bossConfig.randomParentScope || 'spawn',
      skipWaveAccounting: true,
      metadata,
    };

    const boss = this.enemySystem.spawnBoss(bossSpawnConfig);

    if (!boss) {
      GameDebugLogger.log('ERROR', 'Boss spawn failed - no instance returned', {
        config: bossSpawnConfig,
      });
      return null;
    }

    GameDebugLogger.log('SPAWN', 'Boss spawned successfully', {
      id: boss.id,
      type: boss.type,
      position: { x: boss.x, y: boss.y },
      health: boss.health,
      maxHealth: boss.maxHealth,
      phase: boss.currentPhase,
    });

    this.enemiesSpawnedThisWave += 1;

    return boss;
  }

  calculateBossSpawnPosition(
    worldBounds = { width: 800, height: 600 },
    entrance = 'top-center',
    constraints = {},
    playerSnapshot = null,
    random = this.getRandomScope('spawn')
  ) {
    const bounds = {
      width: worldBounds?.width || GAME_WIDTH || 800,
      height: worldBounds?.height || GAME_HEIGHT || 600,
    };

    const generator = this.resolveScopedRandom(
      random,
      'spawn',
      'boss-position'
    );
    const bossRadius = BOSS_CONFIG?.radius || 60;
    const safeDistance = Math.max(
      Number(constraints?.safeDistance) || 0,
      bossRadius * 2
    );
    const entryPadding = Math.max(
      Number(constraints?.entryPadding) || 0,
      Math.max(20, bossRadius * 0.35)
    );
    const horizontalMargin = Math.min(
      bounds.width / 2,
      entryPadding + bossRadius
    );
    const verticalMargin = Math.min(
      bounds.height / 2,
      entryPadding + bossRadius
    );

    const getRange = (min, max) => generator.range(min, max);

    let x = bounds.width / 2;
    let y = verticalMargin;

    switch (entrance) {
      case 'center':
        x = bounds.width / 2;
        y = bounds.height / 2;
        break;
      case 'bottom-center':
      case 'bottom':
        x = getRange(horizontalMargin, bounds.width - horizontalMargin);
        y = bounds.height - verticalMargin;
        break;
      case 'left':
      case 'left-center':
        x = horizontalMargin;
        y = getRange(verticalMargin, bounds.height - verticalMargin);
        break;
      case 'right':
      case 'right-center':
        x = bounds.width - horizontalMargin;
        y = getRange(verticalMargin, bounds.height - verticalMargin);
        break;
      case 'top-center':
      default:
        x = getRange(horizontalMargin, bounds.width - horizontalMargin);
        y = verticalMargin;
        break;
    }

    if (
      playerSnapshot &&
      Number.isFinite(playerSnapshot.x) &&
      Number.isFinite(playerSnapshot.y)
    ) {
      const dx = x - playerSnapshot.x;
      const dy = y - playerSnapshot.y;
      const distance = Math.hypot(dx, dy);

      if (distance < safeDistance) {
        if (distance === 0) {
          x = playerSnapshot.x;
          y = playerSnapshot.y - safeDistance;
        } else {
          const scale = safeDistance / distance;
          x = playerSnapshot.x + dx * scale;
          y = playerSnapshot.y + dy * scale;
        }
      }
    }

    const maxX = bounds.width - horizontalMargin;
    const maxY = bounds.height - verticalMargin;
    x = clamp(x, horizontalMargin, maxX);
    y = clamp(y, verticalMargin, maxY);

    if (
      playerSnapshot &&
      Number.isFinite(playerSnapshot.x) &&
      Number.isFinite(playerSnapshot.y) &&
      safeDistance > 0
    ) {
      let dx = x - playerSnapshot.x;
      let dy = y - playerSnapshot.y;
      let distance = Math.hypot(dx, dy);

      if (distance < safeDistance) {
        let dirX = dx;
        let dirY = dy;
        if (dirX === 0 && dirY === 0) {
          dirX = 0;
          dirY = -1;
        }

        const magnitude = Math.hypot(dirX, dirY) || 1;
        dirX /= magnitude;
        dirY /= magnitude;

        const candidateX = playerSnapshot.x + dirX * safeDistance;
        const candidateY = playerSnapshot.y + dirY * safeDistance;

        let adjustedX = candidateX;
        let adjustedY = candidateY;

        const withinBand =
          adjustedX >= horizontalMargin &&
          adjustedX <= maxX &&
          adjustedY >= verticalMargin &&
          adjustedY <= maxY;

        if (!withinBand) {
          const boundaryTs = [];
          if (dirX > 0) {
            boundaryTs.push((maxX - playerSnapshot.x) / dirX);
          } else if (dirX < 0) {
            boundaryTs.push((horizontalMargin - playerSnapshot.x) / dirX);
          }

          if (dirY > 0) {
            boundaryTs.push((maxY - playerSnapshot.y) / dirY);
          } else if (dirY < 0) {
            boundaryTs.push((verticalMargin - playerSnapshot.y) / dirY);
          }

          const validTs = boundaryTs.filter(
            (t) => Number.isFinite(t) && t >= 0
          );
          let finalT = safeDistance;

          if (validTs.length > 0) {
            const sorted = [...validTs].sort((a, b) => a - b);
            const meetsSafeDistance = sorted.find(
              (t) => t >= safeDistance - 1e-6
            );
            if (Number.isFinite(meetsSafeDistance)) {
              finalT = meetsSafeDistance;
            } else {
              finalT = sorted[sorted.length - 1];
            }
          }

          adjustedX = playerSnapshot.x + dirX * finalT;
          adjustedY = playerSnapshot.y + dirY * finalT;
        }

        adjustedX = clamp(adjustedX, horizontalMargin, maxX);
        adjustedY = clamp(adjustedY, verticalMargin, maxY);

        dx = adjustedX - playerSnapshot.x;
        dy = adjustedY - playerSnapshot.y;
        distance = Math.hypot(dx, dy);

        if (distance < safeDistance) {
          const fallbackMagnitude = Math.max(distance, 1e-6);
          const scale = safeDistance / fallbackMagnitude;
          adjustedX = playerSnapshot.x + dx * scale;
          adjustedY = playerSnapshot.y + dy * scale;
          adjustedX = clamp(adjustedX, horizontalMargin, maxX);
          adjustedY = clamp(adjustedY, verticalMargin, maxY);
          distance = Math.hypot(
            adjustedX - playerSnapshot.x,
            adjustedY - playerSnapshot.y
          );
        }

        x = adjustedX;
        y = adjustedY;

        const finalDistance = Math.hypot(
          x - playerSnapshot.x,
          y - playerSnapshot.y
        );
        const safeSatisfied = finalDistance >= safeDistance - 1e-3;

        GameDebugLogger.log(
          'STATE',
          safeSatisfied
            ? 'Boss spawn adjusted after clamp to respect safe distance'
            : 'Boss spawn constrained by arena bounds',
          {
            player: { x: playerSnapshot.x, y: playerSnapshot.y },
            position: { x, y },
            safeDistance,
            distance: finalDistance,
            safeSatisfied,
          }
        );
      }
    }

    return { x, y };
  }

  /**
   * Calculates a safe spawn position away from player.
   *
   * @param {Object} bounds - World bounds
   * @param {Object} player - Player object
   * @param {number} safeDistance - Minimum distance from player
   * @returns {Object} {x, y} position
   */
  calculatePlayerSafeInboundsPosition(
    bounds,
    player,
    safeDistance,
    random = this.getRandomScope('spawn')
  ) {
    const width = bounds?.width || GAME_WIDTH || 800;
    const height = bounds?.height || GAME_HEIGHT || 600;
    const horizontalMargin = Math.max(40, Math.floor(width * 0.075));
    const verticalMargin = Math.max(40, Math.floor(height * 0.075));
    const spawnRandom = this.resolveScopedRandom(
      random,
      'spawn',
      'tactical-position'
    );

    const anchorX = player && Number.isFinite(player.x) ? player.x : width / 2;
    const anchorY = player && Number.isFinite(player.y) ? player.y : height / 2;

    const minRadius = Math.max(0, safeDistance);
    const maxRadius = Math.max(minRadius + 80, minRadius * 1.5 || 120);
    const attempts = 8;
    let clamped = false;

    const nextFloat = () => spawnRandom.float();
    const nextRange = (min, max) => {
      if (
        spawnRandom &&
        typeof spawnRandom.range === 'function' &&
        Number.isFinite(min) &&
        Number.isFinite(max)
      ) {
        return spawnRandom.range(min, max);
      }
      const t = nextFloat();
      return min + t * (max - min);
    };

    for (let i = 0; i < attempts; i += 1) {
      const angle = nextFloat() * Math.PI * 2;
      const radius = nextRange(minRadius, maxRadius);

      let candidateX = anchorX + Math.cos(angle) * radius;
      let candidateY = anchorY + Math.sin(angle) * radius;

      const clampedX = clamp(
        candidateX,
        horizontalMargin,
        width - horizontalMargin
      );
      const clampedY = clamp(
        candidateY,
        verticalMargin,
        height - verticalMargin
      );

      if (clampedX !== candidateX || clampedY !== candidateY) {
        clamped = true;
      }

      candidateX = clampedX;
      candidateY = clampedY;

      const dx = candidateX - anchorX;
      const dy = candidateY - anchorY;
      const distance = Math.hypot(dx, dy);

      if (distance >= Math.max(0, safeDistance * 0.85)) {
        return {
          x: candidateX,
          y: candidateY,
          clamped,
          usedFallback: false,
        };
      }
    }

    const centerMarginX = Math.max(horizontalMargin, Math.floor(width * 0.25));
    const centerMarginY = Math.max(verticalMargin, Math.floor(height * 0.25));
    const jitterXRange = Math.max(0, width - centerMarginX * 2);
    const jitterYRange = Math.max(0, height - centerMarginY * 2);

    const jitter = (range) => (nextFloat() - 0.5) * range * 0.5;

    const fallbackX = clamp(
      width / 2 + jitter(jitterXRange),
      centerMarginX,
      width - centerMarginX
    );
    const fallbackY = clamp(
      height / 2 + jitter(jitterYRange),
      centerMarginY,
      height - centerMarginY
    );

    return {
      x: fallbackX,
      y: fallbackY,
      clamped: true,
      usedFallback: true,
    };
  }

  calculateCenterBandFallbackPosition(
    bounds,
    random = this.getRandomScope('spawn')
  ) {
    const width = bounds?.width || GAME_WIDTH || 800;
    const height = bounds?.height || GAME_HEIGHT || 600;
    const horizontalMargin = Math.max(40, Math.floor(width * 0.25));
    const verticalMargin = Math.max(40, Math.floor(height * 0.25));
    const spawnRandom = this.resolveScopedRandom(
      random,
      'spawn',
      'tactical-center-fallback'
    );

    const nextFloat = () => spawnRandom.float();

    const jitter = (range) => (nextFloat() - 0.5) * range * 0.5;
    const usableWidth = Math.max(0, width - horizontalMargin * 2);
    const usableHeight = Math.max(0, height - verticalMargin * 2);

    return {
      x: clamp(
        width / 2 + jitter(usableWidth),
        horizontalMargin,
        width - horizontalMargin
      ),
      y: clamp(
        height / 2 + jitter(usableHeight),
        verticalMargin,
        height - verticalMargin
      ),
    };
  }

  isPositionWithinBounds(position, bounds, extraMargin = 0) {
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      return false;
    }

    const width = bounds?.width || GAME_WIDTH || 800;
    const height = bounds?.height || GAME_HEIGHT || 600;

    const minX = 0 - extraMargin;
    const maxX = width + extraMargin;
    const minY = 0 - extraMargin;
    const maxY = height + extraMargin;

    return (
      position.x >= minX &&
      position.x <= maxX &&
      position.y >= minY &&
      position.y <= maxY
    );
  }

  calculateSafeSpawnPosition(
    bounds,
    player,
    safeDistance,
    random = this.getRandomScope('spawn')
  ) {
    const spawnRandom = this.resolveScopedRandom(
      random,
      'spawn',
      'spawn-position'
    );
    const margin = 50;
    let x,
      y,
      attempts = 0;
    const maxAttempts = 10;

    do {
      // Random position at screen edges
      const edge = spawnRandom.int(0, 3);

      switch (edge) {
        case 0: // Top
          x = spawnRandom.range(0, bounds.width);
          y = -margin;
          break;
        case 1: // Right
          x = bounds.width + margin;
          y = spawnRandom.range(0, bounds.height);
          break;
        case 2: // Bottom
          x = spawnRandom.range(0, bounds.width);
          y = bounds.height + margin;
          break;
        case 3: // Left
          x = -margin;
          y = spawnRandom.range(0, bounds.height);
          break;
      }

      attempts++;

      // Check distance from player
      if (player && player.x !== undefined && player.y !== undefined) {
        const dx = x - player.x;
        const dy = y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance >= safeDistance) {
          break;
        }
      } else {
        break; // No player, position is fine
      }
    } while (attempts < maxAttempts);

    return { x, y };
  }

  /**
   * Calculates spawn position on one of the 4 edges (legacy asteroid behavior).
   * Replicates EnemySystem.spawnAsteroid() positioning logic (lines 2046-2083).
   *
   * @param {Object} worldBounds - World dimensions {width, height}
   * @param {Object} random - Random service instance
   * @returns {Object} Position {x, y}
   */
  calculateEdgeSpawnPosition(
    worldBounds,
    random = this.getRandomScope('spawn')
  ) {
    const width = worldBounds?.width || GAME_WIDTH || 800;
    const height = worldBounds?.height || GAME_HEIGHT || 600;
    const margin =
      typeof ASTEROID_EDGE_SPAWN_MARGIN === 'number'
        ? ASTEROID_EDGE_SPAWN_MARGIN
        : 80;

    let spawnRandom = this.resolveScopedRandom(
      random,
      'spawn',
      'edge-position'
    );

    if (!spawnRandom || typeof spawnRandom.float !== 'function') {
      const scopedFallback = this.createScopedRandom('spawn', 'edge-position');
      if (
        scopedFallback?.random &&
        typeof scopedFallback.random.float === 'function'
      ) {
        spawnRandom = scopedFallback.random;
      } else {
        const baseRandom = this.getRandomService();
        if (baseRandom && typeof baseRandom.fork === 'function') {
          spawnRandom = baseRandom.fork(
            'wave-manager:spawn:edge-position:fallback'
          );
        } else {
          spawnRandom = new RandomService(0);
        }
      }
    }

    const getRange = (min, max) => {
      if (typeof spawnRandom.range === 'function') {
        return spawnRandom.range(min, max);
      }
      const span = max - min;
      const base =
        typeof spawnRandom.float === 'function' ? spawnRandom.float() : 0;
      return min + span * base;
    };

    // Select side: 0=top, 1=right, 2=bottom, 3=left
    const side =
      typeof spawnRandom.int === 'function'
        ? spawnRandom.int(0, 3)
        : Math.min(3, Math.floor(getRange(0, 4)));

    let x;
    let y;

    switch (side) {
      case 0: // Top
        x = getRange(0, width);
        y = -margin;
        break;
      case 1: // Right
        x = width + margin;
        y = getRange(0, height);
        break;
      case 2: // Bottom
        x = getRange(0, width);
        y = height + margin;
        break;
      default: // Left (case 3)
        x = -margin;
        y = getRange(0, height);
        break;
    }

    return { x, y };
  }

  /**
   * Burst point for a surge: a random spot on the middle half of the field
   * edge farthest from the player.
   */
  calculateSurgeEdge(bounds, player) {
    const width = bounds?.width || GAME_WIDTH || 800;
    const height = bounds?.height || GAME_HEIGHT || 600;
    const px = Number.isFinite(player?.x) ? player.x : width / 2;
    const py = Number.isFinite(player?.y) ? player.y : height / 2;

    const edges = [
      { side: 'top', distance: py },
      { side: 'bottom', distance: height - py },
      { side: 'left', distance: px },
      { side: 'right', distance: width - px },
    ];
    const { side } = edges.reduce((best, edge) =>
      edge.distance > best.distance ? edge : best
    );

    const { random } = this.createScopedRandom('spawn', 'surge-edge');
    const length = side === 'top' || side === 'bottom' ? width : height;
    return { side, along: random.range(0.25, 0.75) * length };
  }

  /**
   * One surge unit near the burst point: asteroids just outside the edge
   * (they drift in), support enemies just inside it.
   */
  calculateSurgePosition(bounds, edge, isAsteroid, random) {
    const width = bounds?.width || GAME_WIDTH || 800;
    const height = bounds?.height || GAME_HEIGHT || 600;
    const depth = isAsteroid ? -ASTEROID_EDGE_SPAWN_MARGIN : SURGE_INSET;
    const length =
      edge.side === 'top' || edge.side === 'bottom' ? width : height;
    const along = clamp(
      edge.along + random.range(-SURGE_SPREAD, SURGE_SPREAD),
      SURGE_INSET,
      length - SURGE_INSET
    );

    switch (edge.side) {
      case 'top':
        return { x: along, y: depth };
      case 'bottom':
        return { x: along, y: height - depth };
      case 'left':
        return { x: depth, y: along };
      default:
        return { x: width - depth, y: along };
    }
  }

  resolveScopedRandom(random, scope = 'base', label = scope) {
    if (random && typeof random.float === 'function') {
      return random;
    }

    const scoped = this.createScopedRandom(scope, label);
    if (scoped?.random && typeof scoped.random.float === 'function') {
      return scoped.random;
    }

    if (!this._fallbackRandom) {
      this._fallbackRandom = new RandomService('wave-manager:fallback');
    }

    return this._fallbackRandom;
  }

  /**
   * Called when an enemy is destroyed.
   */
  onEnemyDestroyed(data = {}) {
    if (!this.waveInProgress || this.totalEnemiesThisWave <= 0) {
      return;
    }

    const fragmentCount = Array.isArray(data?.fragments)
      ? data.fragments.length
      : 0;

    const waveManagerSpawnsAsteroids = this.shouldWaveManagerSpawnAsteroids();

    if (fragmentCount > 0 && waveManagerSpawnsAsteroids) {
      this.totalEnemiesThisWave += fragmentCount;
      this.enemiesSpawnedThisWave += fragmentCount;
      this.totalAsteroidEnemiesThisWave += fragmentCount;
      this.asteroidsSpawnedThisWave += fragmentCount;
    }

    this.enemiesKilledThisWave++;

    const destroyedEnemy = data?.enemy || null;
    const isBossMinion = this.isBossMinionEnemy(destroyedEnemy);

    const asteroidKey = this.enemyTypeKeys?.asteroid || 'asteroid';
    const destroyedEnemyType =
      data?.enemy?.type ||
      data?.enemy?.enemyType ||
      data?.enemy?.enemyKind ||
      data?.enemy?.kind ||
      data?.type ||
      null;

    if (
      destroyedEnemyType &&
      String(destroyedEnemyType).toLowerCase() ===
        String(asteroidKey).toLowerCase()
    ) {
      this.asteroidsKilledThisWave++;
    }

    if (isBossMinion) {
      GameDebugLogger.log('STATE', 'Boss minion destroyed', {
        wave: this.currentWave,
        minionId: destroyedEnemy?.id,
        bossId:
          destroyedEnemy?.spawnedByBossId ?? destroyedEnemy?.spawnedBy ?? null,
        kills: this.enemiesKilledThisWave,
        total: this.totalEnemiesThisWave,
      });
    }

    // Development assertion: verify accounting consistency
    this.assertAccountingConsistency();

    this.checkWaveCompletion(destroyedEnemy);
  }

  getRemainingActiveEnemyCount(excludedEnemy = null) {
    const enemies = this.enemySystem.asteroids;
    let activeCount = 0;

    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      if (!enemy || enemy === excludedEnemy) {
        continue;
      }

      if (enemy.destroyed || enemy.alive === false) {
        continue;
      }

      activeCount += 1;
    }

    return activeCount;
  }

  /**
   * Development-only assertion to verify wave accounting consistency.
   * Compares WaveManager counts against EnemySystem counts.
   * Only runs in development mode to avoid performance impact.
   */
  assertAccountingConsistency() {
    if (!IS_DEV) {
      return;
    }

    if (!this.waveInProgress || !this.enemySystem?.waveState) {
      return;
    }

    const compatibilityMode = this.compatibilityModeActive;

    const waveManagerTotal = compatibilityMode
      ? this.totalAsteroidEnemiesThisWave
      : this.totalEnemiesThisWave;
    const waveManagerSpawned = compatibilityMode
      ? this.asteroidsSpawnedThisWave
      : this.enemiesSpawnedThisWave;
    const enemySystemTotal = this.enemySystem.waveState.totalAsteroids;
    const enemySystemSpawned = this.enemySystem.waveState.asteroidsSpawned;

    // Allow small discrepancies during spawn/death timing
    const totalDelta = Math.abs(waveManagerTotal - enemySystemTotal);
    const spawnedDelta = Math.abs(waveManagerSpawned - enemySystemSpawned);

    if (totalDelta > 1 || spawnedDelta > 1) {
      console.warn(
        `[WaveManager] Accounting discrepancy detected!\n` +
          `  WaveManager: ${waveManagerSpawned}/${waveManagerTotal}\n` +
          `  EnemySystem: ${enemySystemSpawned}/${enemySystemTotal}\n` +
          `  Wave: ${this.currentWave}`
      );
    }
  }

  /** Simulation clock in ms (session time from fixed steps, not wall clock). */
  getSimulationTimeMs() {
    return (this.enemySystem?.sessionStats?.timeElapsed ?? 0) * 1000;
  }

  /**
   * Completes the current wave.
   */
  completeWave() {
    if (!this.waveInProgress) return;

    this.waveInProgress = false;
    this.waveEndTime = this.getSimulationTimeMs();
    const duration = (this.waveEndTime - this.waveStartTime) / 1000;

    GameDebugLogger.log('WAVE', 'Wave complete', {
      wave: this.currentWave,
      duration: Number.isFinite(duration)
        ? Number(duration.toFixed(3))
        : duration,
      enemiesKilled: this.enemiesKilledThisWave,
      enemiesSpawned: this.enemiesSpawnedThisWave,
      isBossWave: this.isBossWave(this.currentWave),
    });

    this._legacyRegisteredEnemies = new WeakSet();
    this._trackedDynamicMinions = new WeakSet();
    this.endFieldEvents();
    this.endLayerModifier();

    // Emit wave complete event
    this.eventBus.emit('wave-complete', {
      wave: this.currentWave,
      duration: duration,
      enemiesKilled: this.enemiesKilledThisWave,
    });

    // Start countdown for next wave
    this.waveCountdown = this.waveDelay;
    const nextWarden = this.bossRush && nextBossRushLayer(this.currentWave);
    if (nextWarden) {
      // Boss Rush: the breather, then the next Warden, announced like the
      // layer before a Warden is.
      this.waveCountdown = BOSS_RUSH_BREATHER_SECONDS;
      this.eventBus.emit('boss-warning', {
        wave: this.currentWave,
        nextBossWave: nextWarden,
      });
    }

    debugLog(
      `[WaveManager] Wave ${this.currentWave} complete in ${duration.toFixed(1)}s`
    );
  }

  /**
   * Stops layer progression (until reset or resumeWaves): the run is over.
   */
  holdWaves() {
    this.wavePaused = true;
    this.waveCountdown = 0;
  }

  /**
   * Undoes holdWaves (the run went endless): a finished layer counts down to
   * the next as usual; one still in progress plays on.
   */
  resumeWaves() {
    this.wavePaused = false;
    if (!this.waveInProgress) {
      this.waveCountdown = this.waveDelay;
    }
  }

  /**
   * Updates the wave manager.
   *
   * @param {number} deltaTime - Time elapsed
   */
  update(deltaTime) {
    if (this.wavePaused) {
      return;
    }

    if (this.waveInProgress) {
      this.updateLayerSchedule(deltaTime);
      return;
    }

    // Handle wave countdown
    if (!this.waveInProgress && this.waveCountdown > 0) {
      this.waveCountdown -= deltaTime;
      this.waveCountdown = Math.max(0, this.waveCountdown);
    }

    if (!this.waveInProgress && this.waveCountdown <= 0) {
      this.startNextWave();
    }
  }

  /**
   * Resets the wave manager.
   */
  reset() {
    this.disconnect();

    this.currentWave = 0;
    this.waveInProgress = false;
    this.wavePaused = false;
    this.waveStartTime = 0;
    this.waveEndTime = 0;
    this.enemiesSpawnedThisWave = 0;
    this.enemiesKilledThisWave = 0;
    this.totalEnemiesThisWave = 0;
    this.totalAsteroidEnemiesThisWave = 0;
    this.asteroidsSpawnedThisWave = 0;
    this.asteroidsKilledThisWave = 0;
    this.spawnQueue = [];
    this.layerSchedule = [];
    this.layerElapsed = 0;
    this.endFieldEvents();
    this.endLayerModifier();
    this.spawnTimer = 0;
    this.waveCountdown = 0;
    this.spawnDelayMultiplier = 1;
    this._legacyRegisteredEnemies = new WeakSet();
    this._trackedDynamicMinions = new WeakSet();
    this.managerTotalsForWave = { all: 0, asteroids: 0 };
    this.compatibilityModeActive = false;
    if (this.randomSequences) {
      this.randomSequences.spawn = 0;
      this.randomSequences.variants = 0;
      this.randomSequences.fragments = 0;
    }

    this.connectEventListeners();

    debugLog('[WaveManager] Reset');
  }

  /**
   * Gets the current wave state.
   *
   * @returns {Object} Wave state
   */
  getState() {
    const sanitizeCount = (value) => (Number.isFinite(value) ? value : 0);

    const waveManagerSpawnsAsteroids = this.shouldWaveManagerSpawnAsteroids();
    const compatibilityMode = this.compatibilityModeActive;
    const preferAsteroidBreakdown = !waveManagerSpawnsAsteroids;

    const totals = {
      all: sanitizeCount(
        this.managerTotalsForWave?.all ?? this.totalEnemiesThisWave
      ),
      asteroids: sanitizeCount(
        this.managerTotalsForWave?.asteroids ??
          this.totalAsteroidEnemiesThisWave
      ),
    };

    const spawnedCounts = {
      all: sanitizeCount(this.enemiesSpawnedThisWave),
      asteroids: sanitizeCount(this.asteroidsSpawnedThisWave),
    };

    const killedCounts = {
      all: sanitizeCount(this.enemiesKilledThisWave),
      asteroids: sanitizeCount(this.asteroidsKilledThisWave),
    };

    const totalForState = preferAsteroidBreakdown
      ? totals.asteroids
      : compatibilityMode
        ? totals.asteroids
        : totals.all;
    const spawnedForState = preferAsteroidBreakdown
      ? spawnedCounts.asteroids
      : compatibilityMode
        ? spawnedCounts.asteroids
        : spawnedCounts.all;
    const killedForState = preferAsteroidBreakdown
      ? killedCounts.asteroids
      : compatibilityMode
        ? killedCounts.asteroids
        : killedCounts.all;

    const progressDenominator = totalForState > 0 ? totalForState : 0;

    return {
      currentWave: this.currentWave,
      inProgress: this.waveInProgress,
      paused: this.wavePaused,
      spawned: spawnedForState,
      killed: killedForState,
      total: totalForState,
      totals,
      counts: {
        spawned: spawnedCounts,
        killed: killedCounts,
      },
      countdown: this.waveCountdown,
      progress:
        progressDenominator > 0 ? killedForState / progressDenominator : 0,
      compatibilityMode,
    };
  }

  createRandomScopes(random) {
    let baseRandom = random;
    if (!baseRandom || typeof baseRandom.fork !== 'function') {
      baseRandom = new RandomService();
      this._fallbackRandom = baseRandom;
    }

    const spawnLabel = this.randomScopeLabels?.spawn || 'wave-manager:spawn';
    const variantLabel =
      this.randomScopeLabels?.variants || 'wave-manager:variants';
    const fragmentLabel =
      this.randomScopeLabels?.fragments || 'wave-manager:fragments';

    const scopes = {
      base: baseRandom,
      spawn: baseRandom.fork(spawnLabel),
      variants: baseRandom.fork(variantLabel),
      fragments: baseRandom.fork(fragmentLabel),
    };

    this.captureRandomScopeSeeds(scopes);

    return scopes;
  }

  getRandomService() {
    if (!this.randomScopes) {
      this.randomScopes = this.createRandomScopes(this.random);
      this.captureRandomScopeSeeds();
    }
    return this.randomScopes.base;
  }

  getRandomScope(scope) {
    if (!this.randomScopes) {
      this.randomScopes = this.createRandomScopes(this.random);
      this.captureRandomScopeSeeds();
    }

    return this.randomScopes[scope] || this.randomScopes.base;
  }

  nextRandomSequence(scope) {
    if (!this.randomSequences) {
      this.randomSequences = {};
    }

    if (typeof this.randomSequences[scope] !== 'number') {
      this.randomSequences[scope] = 0;
    }

    const sequence = this.randomSequences[scope];
    this.randomSequences[scope] += 1;
    return sequence;
  }

  createLegacyAsteroidScopedRandom() {
    const generator = this.getRandomScope('spawn');
    const sequence = this.nextRandomSequence('spawn');
    const label = `enemy-system:asteroid-spawn:${sequence}`;

    if (generator && typeof generator.fork === 'function') {
      return {
        random: generator.fork(label),
        sequence,
      };
    }

    const fallbackBase =
      this.getRandomService() ||
      this._fallbackRandom ||
      new RandomService('wave-manager:fallback');

    if (typeof fallbackBase.fork === 'function') {
      return {
        random: fallbackBase.fork(`${label}:fallback`),
        sequence,
      };
    }

    return {
      random: fallbackBase,
      sequence,
    };
  }

  createScopedRandom(scope = 'spawn', label = scope) {
    const generator = this.getRandomScope(scope);
    const sequence = this.nextRandomSequence(scope);

    if (generator && typeof generator.fork === 'function') {
      return {
        random: generator.fork(`wave-manager:${label}:${sequence}`),
        sequence,
      };
    }

    const fallback = this._fallbackRandom || new RandomService();
    this._fallbackRandom = fallback;

    return {
      random: fallback.fork(`wave-manager:${label}:${sequence}`),
      sequence,
    };
  }

  captureRandomScopeSeed(scope, generator) {
    if (!generator || typeof generator.seed !== 'number') {
      return;
    }

    if (!this.randomScopeSeeds) {
      this.randomScopeSeeds = {};
    }

    this.randomScopeSeeds[scope] = generator.seed >>> 0;
  }

  captureRandomScopeSeeds(scopes = this.randomScopes) {
    if (!scopes) {
      return;
    }

    Object.entries(scopes).forEach(([scope, generator]) => {
      this.captureRandomScopeSeed(scope, generator);
    });
  }

  reseedRandomScopes({ resetSequences = false } = {}) {
    if (!this.randomScopes) {
      this.randomScopes = this.createRandomScopes(this.random);
    }

    if (!this.randomScopeSeeds) {
      this.randomScopeSeeds = {};
      this.captureRandomScopeSeeds();
    }

    Object.entries(this.randomScopes).forEach(([scope, generator]) => {
      if (
        scope === 'base' ||
        !generator ||
        typeof generator.reset !== 'function'
      ) {
        return;
      }

      const storedSeed = this.randomScopeSeeds?.[scope];
      if (storedSeed !== undefined) {
        generator.reset(storedSeed);
      }
    });

    if (resetSequences && this.randomSequences) {
      Object.keys(this.randomSequences).forEach((scope) => {
        this.randomSequences[scope] = 0;
      });
    }
  }
}
