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

import RandomService from '../../../core/RandomService.js';
import {
  normalizeDependencies,
  requireService,
  resolveService,
} from '../../../core/serviceUtils.js';
import { debugLog } from '../../../core/debugLogging.js';
import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';
import {
  MAX_ASTEROIDS_ON_SCREEN,
  WAVE_BREAK_TIME,
} from '../../../data/constants/gameplay.js';
import { IS_DEV } from '../../../core/env.js';
import {
  BOSS_RUSH_BREATHER_SECONDS,
  bossRushDirectorFor,
  directorFor,
  nextBossRushLayer,
} from '../../../data/layers.js';
import { scaleDirector } from '../../../data/difficulty.js';
import { WaveRandom } from '../waves/WaveRandom.js';
import { WaveSpawner } from '../waves/WaveSpawner.js';
import { LayerEvents } from '../waves/LayerEvents.js';
import { LayerSchedule } from '../waves/LayerSchedule.js';
import { BossWave } from '../waves/BossWave.js';

// The rock trickle: seconds between rocks, times a 0.5-1 draw.
const ROCK_TRICKLE_DELAY = 1.0;

// A pool hands the same object back as a new life (a new id) within a wave,
// so a wave registration is remembered per life, not per object.
const isRegisteredLife = (lives, enemy) =>
  lives.has(enemy) && lives.get(enemy) === enemy.id;

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

    this.waveRandom = new WaveRandom(resolvedRandom);

    // The layer's subjects (src/modules/enemies/waves/), each given what it
    // needs by name.
    const getLayer = () => this.currentWave;
    const countSpawn = () => {
      this.enemiesSpawnedThisWave += 1;
    };
    this.spawner = new WaveSpawner({
      enemySystem: this.enemySystem,
      waveRandom: this.waveRandom,
      getLayer,
      countSpawn,
      addExtraRocks: (count) => this.addExtraRocks(count),
    });
    this.layerEvents = new LayerEvents({
      eventBus: this.eventBus,
      enemySystem: this.enemySystem,
      waveRandom: this.waveRandom,
      getLayer,
    });
    this.schedule = new LayerSchedule({
      eventBus: this.eventBus,
      spawner: this.spawner,
      layerEvents: this.layerEvents,
      getLayer,
      isFieldEmpty: () => this.isFieldEmpty(),
      checkWaveCompletion: () => this.checkWaveCompletion(),
    });
    this.bossWave = new BossWave({
      enemySystem: this.enemySystem,
      waveRandom: this.waveRandom,
      enemyTypeKeys: this.schedule.enemyTypeKeys,
      getLayer,
      countSpawn,
    });

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
    this._legacyRegisteredEnemies = new WeakMap();
    this._trackedDynamicMinions = new WeakMap();

    // The layer's rocks: EnemySystem builds each one, WaveManager trickles
    // them in and keeps the counts EnemySystem.waveState reports. rockLayer
    // is currentWave as of the last update (1 after a reset): rocks and
    // fragments spawn with it. The plan (rocksTotal) is the layer's rocks
    // plus those it did not plan (fragments, surge rocks, rock minions).
    this.rockLayer = 1;
    this.rocksActive = false;
    this.rocksTotal = 0;
    this.rocksSpawned = 0;
    this.layerRocks = 0;
    this.completedWaves = 0;

    // Timers (spawnTimer paces the rock trickle)
    this.spawnTimer = 0;
    this.waveDelay = WAVE_BREAK_TIME || 10.0; // WAVE-004: Usar WAVE_BREAK_TIME para paridade com sistema legado
    this.waveCountdown = 0;

    this.connectEventListeners();

    debugLog('[WaveManager] Initialized');
  }

  // The schedule, its clock, the modifier and the random scopes live in their
  // modules; these keep the names EnemySystem, the session and tests use.
  get layerSchedule() {
    return this.schedule.layerSchedule;
  }

  set layerSchedule(entries) {
    this.schedule.layerSchedule = entries;
  }

  get layerElapsed() {
    return this.schedule.layerElapsed;
  }

  set layerElapsed(seconds) {
    this.schedule.layerElapsed = seconds;
  }

  get enemyTypeKeys() {
    return this.schedule.enemyTypeKeys;
  }

  get layerModifier() {
    return this.layerEvents.layerModifier;
  }

  get randomScopes() {
    return this.waveRandom.randomScopes;
  }

  get randomScopeSeeds() {
    return this.waveRandom.randomScopeSeeds;
  }

  startLayerModifier(id) {
    this.layerEvents.startLayerModifier(id);
  }

  reseedRandomScopes(options) {
    this.waveRandom.reseedRandomScopes(options);
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

  /**
   * The layer's director (Boss Rush's on a Boss Rush run) with spawn counts
   * scaled by the difficulty; past the table the endless modifiers roll from
   * the run seed, so each run gets its own.
   */
  layerDirector(layer) {
    const difficulty = resolveService(
      'difficulty',
      this.enemySystem.dependencies
    );
    return scaleDirector(
      this.bossRush
        ? bossRushDirectorFor(layer)
        : directorFor(layer, difficulty?.getRunSeed() ?? 0),
      difficulty?.getModifiers().spawnCount ?? 1
    );
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

  registerActiveEnemy(enemy, { skipDuplicateCheck = false } = {}) {
    if (!enemy) {
      return false;
    }

    if (!this.waveInProgress) {
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
      this._legacyRegisteredEnemies = new WeakMap();
    }

    const bypassDuplicateCheck = Boolean(skipDuplicateCheck);
    const alreadyRegistered = isRegisteredLife(
      this._legacyRegisteredEnemies,
      enemy
    );

    if (!bypassDuplicateCheck && alreadyRegistered) {
      return false;
    }

    if (!alreadyRegistered) {
      this._legacyRegisteredEnemies.set(enemy, enemy.id);
    }

    const coerce = (value) => (Number.isFinite(value) ? value : 0);

    this.enemiesSpawnedThisWave = coerce(this.enemiesSpawnedThisWave) + 1;
    this.asteroidsSpawnedThisWave = coerce(this.asteroidsSpawnedThisWave) + 1;
    this.totalEnemiesThisWave = this.enemiesSpawnedThisWave;
    this.totalAsteroidEnemiesThisWave = this.asteroidsSpawnedThisWave;

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
      this._trackedDynamicMinions = new WeakMap();
    }

    if (isRegisteredLife(this._trackedDynamicMinions, enemy)) {
      return false;
    }

    this._trackedDynamicMinions.set(enemy, enemy.id);

    const coerce = (value) => (Number.isFinite(value) ? value : 0);
    const normalizedType = this.getNormalizedEnemyType(enemy);
    const isAsteroid = this.schedule.isAsteroidType(normalizedType);

    // A rock the legacy bridge (registerActiveEnemy) already counted on
    // acquire (a Herald's wall) would hold the layer open if counted twice.
    if (!isRegisteredLife(this._legacyRegisteredEnemies, enemy)) {
      this.enemiesSpawnedThisWave = coerce(this.enemiesSpawnedThisWave) + 1;
      this.totalEnemiesThisWave = coerce(this.totalEnemiesThisWave) + 1;

      if (isAsteroid) {
        this.totalAsteroidEnemiesThisWave =
          coerce(this.totalAsteroidEnemiesThisWave) + 1;
        this.asteroidsSpawnedThisWave =
          coerce(this.asteroidsSpawnedThisWave) + 1;
      }
    }

    // The rock plan counts rocks only: a drone or mine minion stays out.
    if (isAsteroid) {
      this.addExtraRocks(1);
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
    this._legacyRegisteredEnemies = new WeakMap();
    this._trackedDynamicMinions = new WeakMap();

    const waveNumber = this.currentWave;
    const director = this.layerEvents.applyHuntersMoon(
      this.layerDirector(waveNumber)
    );
    let config;

    if (director.warden) {
      GameDebugLogger.log('WAVE', 'Boss wave detected', { wave: waveNumber });
      config = this.bossWave.generateBossWave();
    } else {
      config = { isBossWave: false, enemies: [] };
    }

    config.isBossWave = Boolean(config.isBossWave);

    this.layerSchedule = this.schedule.buildLayerSchedule(director);
    this.layerElapsed = 0;
    this.layerRocks = director.rocks;

    const sharedSpawnDelayMultiplier =
      this.spawner.resolveWaveSpawnDelayMultiplier(config);
    config.spawnDelayMultiplier = sharedSpawnDelayMultiplier;

    // The layer's own rocks trickle in (updateRockTrickle), so only the
    // Warden and the scheduled machines count up front; rocks register
    // themselves on spawn (registerActiveEnemy).
    let computedTotalEnemies = this.computeTotalEnemies(config);
    for (const { groups } of this.layerSchedule) {
      for (const { kind, count } of groups) {
        if (!this.schedule.isAsteroidType(kind)) computedTotalEnemies += count;
      }
    }

    const rawManagerTotals = {
      all: Math.max(0, Math.floor(computedTotalEnemies)),
      asteroids: 0,
    };

    this.totalEnemiesThisWave = computedTotalEnemies;

    const waveEventPayload = {
      wave: waveNumber,
      totalEnemies: this.totalEnemiesThisWave,
      asteroidTotal: 0,
      isBossWave: config.isBossWave,
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
        config: this.cloneWaveConfig(config),
      });
    }

    if (config.isBossWave) {
      const supportGroups = Array.isArray(config.supportGroups)
        ? config.supportGroups.map((group) => ({ ...group }))
        : Array.isArray(config.enemies)
          ? config.enemies.map((group) => ({ ...group }))
          : [];

      this.eventBus.emit('boss-wave-started', {
        wave: waveNumber,
        totalEnemies: this.totalEnemiesThisWave,
        asteroidTotal: 0,
        compatibilityMode: true,
        managerTotals: { ...rawManagerTotals },
        boss: config.boss ? { ...config.boss } : null,
        support: supportGroups,
        config: this.cloneWaveConfig(config),
      });
    }

    if (config.isBossWave) {
      this.queueBossWaveSpawns(config);
    } else {
      this.spawner.spawnWave(config);
    }

    debugLog(
      `[WaveManager] Started wave ${waveNumber} (${this.totalEnemiesThisWave} enemies${
        config.isBossWave ? ', boss wave' : ''
      })`
    );
    return true;
  }

  /** Rocks the trickle still owes this layer. */
  rocksPending() {
    return this.rocksActive && this.rocksSpawned < this.rocksTotal;
  }

  isFieldEmpty() {
    return this.getRemainingActiveEnemyCount() === 0 && !this.rocksPending();
  }

  /**
   * The rock trickle, run each frame right before update(): while the
   * layer's rocks count, a rock spawns once the timer runs out if the plan
   * has rocks left and the field holds fewer than MAX_ASTEROIDS_ON_SCREEN
   * enemies; the next waits ROCK_TRICKLE_DELAY times a 0.5-1 draw.
   */
  updateRockTrickle(deltaTime) {
    if (!this.rocksActive) {
      return;
    }

    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    const enemySystem = this.enemySystem;
    this.spawnTimer -= deltaTime;

    if (
      this.rocksSpawned < this.rocksTotal &&
      enemySystem.getActiveEnemyCount() < MAX_ASTEROIDS_ON_SCREEN &&
      this.spawnTimer <= 0
    ) {
      enemySystem.spawnAsteroid();
      const spawnRandom =
        enemySystem.getRandomScope('spawn') || enemySystem.getRandomService();
      const delayMultiplier =
        spawnRandom && typeof spawnRandom.range === 'function'
          ? spawnRandom.range(0.5, 1)
          : 0.5 + spawnRandom.float() * 0.5;
      this.spawnTimer = ROCK_TRICKLE_DELAY * delayMultiplier;
    }
  }

  /** A rock of the plan spawned (EnemySystem.spawnAsteroid). */
  countPlannedRock() {
    if (this.rocksActive) {
      this.rocksSpawned += 1;
    }
  }

  /** Rocks the plan did not have (fragments, surge rocks, rock minions). */
  addExtraRocks(count) {
    if (this.rocksActive) {
      this.rocksTotal += count;
      this.rocksSpawned += count;
    }
  }

  /**
   * Starts the next layer from the session (run kickoff, a forced jump) and
   * counts its rocks at once, on the plan the run already has.
   */
  startLayerFromSession() {
    if (!this.waveInProgress) {
      this.startNextWave();
    }
    this.rocksActive = true;
  }

  /**
   * Ends every update: the rock state catches up with the layer clock. A
   * layer that started since (not from the session) opens a fresh plan.
   */
  settleRocks() {
    if (this.waveInProgress && !this.rocksActive) {
      this.rocksTotal = this.layerRocks;
      this.rocksSpawned = 0;
    }
    this.rocksActive = this.waveInProgress;
    this.rockLayer = this.currentWave;
  }

  /** The layer's clock, schedule and counts, for a snapshot (exportState). */
  captureLayerProgress() {
    return {
      wave: this.currentWave,
      inProgress: this.waveInProgress,
      startTime: this.waveStartTime,
      countdown: this.waveCountdown,
      elapsed: this.layerElapsed,
      schedule: [...this.layerSchedule],
      enemiesSpawned: this.enemiesSpawnedThisWave,
      enemiesKilled: this.enemiesKilledThisWave,
      enemiesTotal: this.totalEnemiesThisWave,
      asteroidsSpawned: this.asteroidsSpawnedThisWave,
      asteroidsKilled: this.asteroidsKilledThisWave,
      asteroidsTotal: this.totalAsteroidEnemiesThisWave,
    };
  }

  /**
   * Puts back the layer a snapshot holds (EnemySystem.importState), once its
   * enemies are back on the field: registering them counted them again, and
   * a layer whose counts outgrow its kills never completes.
   */
  restoreRocks({
    layer,
    active,
    total,
    spawned,
    completedWaves,
    spawnTimer,
    progress,
  }) {
    this.rockLayer = layer;
    this.rocksActive = active;
    this.rocksTotal = total;
    this.rocksSpawned = spawned;
    this.completedWaves = completedWaves;
    this.spawnTimer = spawnTimer;
    this.currentWave = progress.wave;
    this.waveInProgress = progress.inProgress;
    this.waveStartTime = progress.startTime;
    this.waveCountdown = progress.countdown;
    this.layerElapsed = progress.elapsed;
    this.layerSchedule = [...progress.schedule];
    this.enemiesSpawnedThisWave = progress.enemiesSpawned;
    this.enemiesKilledThisWave = progress.enemiesKilled;
    this.totalEnemiesThisWave = progress.enemiesTotal;
    this.asteroidsSpawnedThisWave = progress.asteroidsSpawned;
    this.asteroidsKilledThisWave = progress.asteroidsKilled;
    this.totalAsteroidEnemiesThisWave = progress.asteroidsTotal;
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
      this.rocksPending()
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
      this.spawner.resolveWaveSpawnDelayMultiplier(waveConfig);
    const baseConfig = {
      ...waveConfig,
      spawnDelayMultiplier: sharedSpawnDelayMultiplier,
    };

    const bossConfig = baseConfig.boss ? { ...baseConfig.boss } : null;
    if (bossConfig) {
      queue.push({
        type: 'boss',
        execute: () => this.bossWave.spawnBossEnemy(bossConfig, baseConfig),
      });
    }

    const supportGroups = Array.isArray(baseConfig.enemies)
      ? baseConfig.enemies.map((group) => ({ ...group }))
      : [];

    supportGroups.forEach((group) => {
      queue.push({
        type: 'support-group',
        group,
        execute: () =>
          this.spawner.spawnWave({ ...baseConfig, enemies: [group] }),
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

  /**
   * Called when an enemy is destroyed.
   */
  onEnemyDestroyed(data = {}) {
    if (!this.waveInProgress || this.totalEnemiesThisWave <= 0) {
      return;
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
   * Compares the bridge counts against the rock plan's.
   * Only runs in development mode to avoid performance impact.
   */
  assertAccountingConsistency() {
    if (!IS_DEV) {
      return;
    }

    if (!this.waveInProgress) {
      return;
    }

    const waveManagerTotal = this.totalAsteroidEnemiesThisWave;
    const waveManagerSpawned = this.asteroidsSpawnedThisWave;

    // Allow small discrepancies during spawn/death timing. The rock plan has
    // the layer's rock total up front, while the bridge counts rocks as they
    // register: only the spawned counts compare.
    const spawnedDelta = Math.abs(waveManagerSpawned - this.rocksSpawned);

    if (spawnedDelta > 1) {
      console.warn(
        `[WaveManager] Accounting discrepancy detected!\n` +
          `  WaveManager: ${waveManagerSpawned}/${waveManagerTotal}\n` +
          `  Rock plan: ${this.rocksSpawned}/${this.rocksTotal}\n` +
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

    this._legacyRegisteredEnemies = new WeakMap();
    this._trackedDynamicMinions = new WeakMap();
    this.layerEvents.endFieldEvents();
    this.layerEvents.endLayerModifier();
    this.rocksActive = false;
    this.completedWaves += 1;

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
    if (!this.wavePaused) {
      if (this.waveInProgress) {
        this.schedule.updateLayerSchedule(deltaTime);
      } else {
        // Handle wave countdown
        if (this.waveCountdown > 0) {
          this.waveCountdown -= deltaTime;
          this.waveCountdown = Math.max(0, this.waveCountdown);
        }

        if (this.waveCountdown <= 0) {
          this.startNextWave();
        }
      }
    }

    this.settleRocks();
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
    this.layerEvents.endFieldEvents();
    this.layerEvents.endLayerModifier();
    this.spawnTimer = 0;
    this.waveCountdown = 0;
    this.spawner.spawnDelayMultiplier = 1;
    this._legacyRegisteredEnemies = new WeakMap();
    this._trackedDynamicMinions = new WeakMap();
    // The run's first layer starts from the session (startLayerFromSession)
    // on this plan.
    this.rockLayer = 1;
    this.rocksActive = false;
    this.rocksTotal = this.layerDirector(1).rocks;
    this.rocksSpawned = 0;
    this.layerRocks = 0;
    this.completedWaves = 0;
    const { randomSequences } = this.waveRandom;
    if (randomSequences) {
      randomSequences.spawn = 0;
      randomSequences.variants = 0;
      randomSequences.fragments = 0;
    }

    this.connectEventListeners();

    debugLog('[WaveManager] Reset');
  }
}
