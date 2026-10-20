// src/modules/EnemySystem.js
import { BaseSystem } from '../core/BaseSystem.js';
import {
  requireService,
  resolveEventBus,
  resolveService,
} from '../core/serviceUtils.js';
import { Asteroid } from './enemies/types/Asteroid.js';
import { registerEnemyTypes } from './enemies/base/enemyTypeRegistry.js';
import { EnemyFactory } from './enemies/base/EnemyFactory.js';
import { WaveManager } from './enemies/managers/WaveManager.js';
import { RewardManager } from './enemies/managers/RewardManager.js';
import { AsteroidCollision } from './enemies/components/AsteroidCollision.js';
import { EnemySpawnSystem } from './enemies/systems/EnemySpawnSystem.js';
import { EnemyDamageSystem } from './enemies/systems/EnemyDamageSystem.js';
import { EnemyUpdateSystem } from './enemies/systems/EnemyUpdateSystem.js';
import { EnemyRandomScopes } from './enemies/systems/EnemyRandomScopes.js';
import { EnemyRewards } from './enemies/systems/EnemyRewards.js';
import { EnemyBossSystem } from './enemies/systems/EnemyBossSystem.js';
import { EnemySnapshots } from './enemies/systems/EnemySnapshots.js';
import { EnemyField } from './enemies/systems/EnemyField.js';
import { EnemyCombatRelay } from './enemies/systems/EnemyCombatRelay.js';
import {
  getPlayerPositionSnapshot,
  getPlayerHullRadius,
} from './enemies/base/playerGeometry.js';
import { CollisionComponent } from './enemies/components/CollisionComponent.js';
import { HealthComponent } from './enemies/components/HealthComponent.js';
import { MovementComponent } from './enemies/components/MovementComponent.js';
import { WeaponComponent } from './enemies/components/WeaponComponent.js';
import { createFallbackHandler } from '../utils/StateManager.js';

// === CLASSE ENEMYSYSTEM ===
// Asteroid class moved to: ./enemies/types/Asteroid.js
// === SISTEMA DE INIMIGOS ===
class EnemySystem extends BaseSystem {
  constructor(dependencies = {}) {
    super(dependencies, {
      systemName: 'EnemySystem',
      serviceName: 'enemies',
      enableRandomManagement: true,
    });
    this.enemyRandom = new EnemyRandomScopes({
      dependencies: this.dependencies,
      getRandom: () => this.random,
      setRandom: (random) => (this.random = random),
      getWaveManager: () => this.waveManager,
      getRewardManager: () => this.rewardManager,
    });

    this.asteroids = [];
    this.rewards = new EnemyRewards({
      getEventBus: () => this.eventBus,
      getRewardManager: () => this.rewardManager,
      getWaveState: () => this.waveState,
      getXPOrbs: () => this.xpOrbs,
      getPlayer: () => this.player,
    });
    this.bosses = new EnemyBossSystem({
      rewards: this.rewards,
      getFactory: () => this.factory,
      getWaveState: () => this.waveState,
      getAsteroids: () => this.asteroids,
      getPhysics: () => this.physics,
      getSessionStats: () => this.sessionStats,
      getCachedUI: () => this.getCachedUI(),
      getCachedEffects: () => this.getCachedEffects(),
      getCachedAudio: () => this.getCachedAudio(),
      registerActiveEnemy: (...args) => this.registerActiveEnemy(...args),
      warnIfWaveManagerRegistrationFailed: (...args) =>
        this.warnIfWaveManagerRegistrationFailed(...args),
      registerEnemyWithPhysics: (enemy) => this.registerEnemyWithPhysics(enemy),
      unregisterEnemyFromPhysics: (enemy) =>
        this.unregisterEnemyFromPhysics(enemy),
      removeActiveEnemy: (enemy) => this.removeActiveEnemy(enemy),
      releaseAsteroid: (asteroid) => this.releaseAsteroid(asteroid),
    });
    this.field = new EnemyField({
      bosses: this.bosses,
      getAsteroids: () => this.asteroids,
      getFactory: () => this.factory,
      getUseFactory: () => this.useFactory,
      unregisterEnemyFromPhysics: (enemy) =>
        this.unregisterEnemyFromPhysics(enemy),
      clearAsteroidPoolId: (asteroid) => this.clearAsteroidPoolId(asteroid),
    });
    this.combatRelay = new EnemyCombatRelay({
      bosses: this.bosses,
      enemyRandom: this.enemyRandom,
      getAsteroids: () => this.asteroids,
      getPhysics: () => this.physics,
      getCachedCombat: () => this.getCachedCombat(),
      applyDirectDamageToPlayer: (...args) =>
        this.applyDirectDamageToPlayer(...args),
    });
    this.snapshots = new EnemySnapshots({
      bosses: this.bosses,
      enemyRandom: this.enemyRandom,
      field: this.field,
      getAsteroids: () => this.asteroids,
      setAsteroids: (asteroids) => (this.asteroids = asteroids),
      getSessionStats: () => this.sessionStats,
      setSessionStats: (sessionStats) => (this.sessionStats = sessionStats),
      getSessionActive: () => this.sessionActive,
      setSessionActive: (sessionActive) => (this.sessionActive = sessionActive),
      setLastWaveManagerCompletionHandled: (wave) =>
        (this._lastWaveManagerCompletionHandled = wave),
      setSnapshotFallbackWarningIssued: (issued) =>
        (this._snapshotFallbackWarningIssued = issued),
      getWaveState: () => this.waveState,
      getWaveManager: () => this.waveManager,
      getFactory: () => this.factory,
      getUseFactory: () => this.useFactory,
      createInitialSessionStats: () => this.createInitialSessionStats(),
      assignAsteroidPoolId: (...args) => this.assignAsteroidPoolId(...args),
      acquireAsteroid: (config) => this.acquireAsteroid(config),
      acquireEnemyViaFactory: (type, config) =>
        this.acquireEnemyViaFactory(type, config),
      registerActiveEnemy: (...args) => this.registerActiveEnemy(...args),
      warnIfWaveManagerRegistrationFailed: (...args) =>
        this.warnIfWaveManagerRegistrationFailed(...args),
      syncPhysicsIntegration: (force) => this.syncPhysicsIntegration(force),
      handleSnapshotFallback: (reason) => this._handleSnapshotFallback(reason),
      createEnemy: (EnemyClass, config) => new EnemyClass(this, config),
    });

    this.sessionStats = this.createInitialSessionStats();
    this.sessionActive = false;

    this._nextAsteroidPoolId = 1;
    this._activeAsteroidsBuffer = [];
    this._snapshotFallbackWarningIssued = false;
    this._handleSnapshotFallback = createFallbackHandler({
      systemName: 'EnemySystem',
      warningFlag: '_snapshotFallbackWarningIssued',
      onFallback: this.reset.bind(this),
    });
    this._lastWaveManagerCompletionHandled = null;
    this._lastEnemyUpdateLog = 0;

    // Factory (optional - new architecture)
    this.factory = null;
    this.useFactory = true; // Factory path enabled for runtime spawns

    // Managers (new architecture)
    this.waveManager = null;
    this.rewardManager = null;
    this.heartDropsBlocked = false; // Blood Ledger

    // Components (new architecture)
    this.movementComponent = null;
    this.collisionComponent = null;
    this.genericMovement = null;
    this.genericWeapon = null;
    this.genericCollision = null;
    this.genericHealth = null;
    this.useComponents = true; // Feature flag to enable component system

    this.spawnSystem = null;
    this.damageSystem = null;
    this.updateSystem = null;

    this.eventBus =
      resolveEventBus(this.dependencies) ||
      requireService('event-bus', this.dependencies, 'EnemySystem');

    // Required services: the manifest builds them before enemies.
    this.player = requireService('player', this.dependencies, 'EnemySystem');
    this.xpOrbs = requireService('xp-orbs', this.dependencies, 'EnemySystem');
    this.progression = requireService(
      'progression',
      this.dependencies,
      'EnemySystem'
    );
    this.physics = requireService('physics', this.dependencies, 'EnemySystem');
    this.healthHearts = requireService(
      'healthHearts',
      this.dependencies,
      'EnemySystem'
    );
    // Late-bound: world is attached by the manifest right after construction
    // and combat is built after enemies (resolved on first use). Effects,
    // audio and ui are optional presentation hooks, absent in headless runs.
    this.world = this.dependencies.world || null;
    this.combat = null;
    this.effects = null;
    this.audio = null;
    this.ui = null;

    this.field.setupAsteroidPoolIntegration();
    this.setupEnemyFactory(); // Initialize factory (optional)
    this.refreshServiceState({ force: true });
    this.enemyRandom.setupRandomGenerators();
    this.setupManagers(); // Initialize wave and reward managers
    this.setupComponents(); // Initialize components
    this.setupSpawnSystem(); // Initialize spawn sub-system
    this.setupDamageSystem(); // Initialize damage sub-system
    this.setupUpdateSystem(); // Initialize update sub-system
    // Re-register listeners now that managers/subsystems are ready.
    // BaseSystem already called setupEventListeners() during super(), but
    // at that point waveManager etc. didn't exist yet, so conditional
    // registrations were skipped.  Clear and redo.
    this.removeAllEventListeners();
    this.setupEventListeners();
    this.syncPhysicsIntegration(true);
  }

  attachProgression(progressionSystem) {
    this.progression = progressionSystem;
    this.dependencies.progression = progressionSystem;
    this.refreshServiceState({ force: true });
  }

  attachWorld(worldSystem) {
    this.world = worldSystem;
    this.dependencies.world = worldSystem;
    this.refreshServiceState({ force: true });
  }

  setupEventListeners() {
    // Handle level 5 shield deflective explosion (AoE damage)
    this.registerEventListener('shield-explosion-damage', (data) => {
      this.handleShieldExplosionDamage(data);
    });

    this.registerEventListener('player-reset', () => {
      this.refreshServiceState({ force: true });
    });

    this.registerEventListener('progression-reset', () => {
      this.refreshServiceState({ force: true });
      this.heartDropsBlocked = false;
    });

    this.registerEventListener('upgrade-no-heart-drops', () => {
      this.heartDropsBlocked = true;
    });

    this.registerEventListener('world-reset', () => {
      this.refreshServiceState({ force: true });
    });

    this.registerEventListener('wave-started', () => {
      this.refreshServiceState({ force: true });
    });

    this.registerEventListener('physics-reset', () => {
      this.refreshServiceState({ force: true });
      this.syncPhysicsIntegration(true);
    });

    this.registerEventListener('enemy-fired', (data) => {
      this.handleEnemyProjectile(data);
    });

    this.registerEventListener('player-hit-by-projectile', (data = {}) => {
      this.combatRelay.handlePlayerHitByProjectile(data);
    });

    this.registerEventListener('mine-exploded', (data) => {
      this.handleMineExplosion(data);
    });

    // NEW: Integrate RewardManager with enemy destruction
    this.registerEventListener('enemy-destroyed', (data) => {
      if (this.rewardManager && data.enemy) {
        this.rewardManager.dropRewards(
          data.enemy,
          data.source?.hitPosition ?? null
        );
      }
    });

    this.registerEventListener('wave-complete', (data = {}) => {
      const waveNumber = Number.isFinite(Number(data.wave))
        ? Number(data.wave)
        : this.waveState.current;

      if (this._lastWaveManagerCompletionHandled === waveNumber) {
        return;
      }

      console.debug(
        '[EnemySystem] Wave complete event received from WaveManager:',
        data
      );

      this._lastWaveManagerCompletionHandled = waveNumber;
      this.handleWaveManagerWaveComplete(data);
    });

    this.registerEventListener('boss-attack', (data) => {
      this.handleBossAttackPayload(data);
    });

    // BaseSystem's constructor runs this before the boss module exists; the
    // constructor's second pass wires the boss events.
    this.bosses?.registerEventListeners(
      (eventName, handler) => this.registerEventListener(eventName, handler),
      () => this.refreshServiceState({ force: true })
    );
  }

  refreshServiceState(options) {
    return this.enemyRandom.refreshServiceState(options);
  }

  syncPhysicsIntegration(force = false) {
    this.physics.bootstrapFromEnemySystem(this, { force });
  }

  getRandomService() {
    return this.enemyRandom.getRandomService();
  }

  getRandomScope(...args) {
    return this.enemyRandom.getRandomScope(...args);
  }

  createScopedRandom(...args) {
    return this.enemyRandom.createScopedRandom(...args);
  }

  reseedRandomScopes(...args) {
    return this.enemyRandom.reseedRandomScopes(...args);
  }

  setupEnemyFactory() {
    try {
      this.factory = new EnemyFactory(this);
      registerEnemyTypes(this.factory, {
        getAvailableBossMinionTypes: (preferredTypes) =>
          this.getAvailableBossMinionTypes(preferredTypes),
      });
    } catch (error) {
      console.warn('[EnemySystem] Failed to initialize EnemyFactory', error);
      this.factory = null;
    }
  }

  setupManagers() {
    // Initialize WaveManager: waves, their counts and the rock trickle are
    // its, so the system cannot run without it.
    const waveManagerRandom = this.getRandomScope('wave-manager', {
      label: 'wave-manager',
    });
    const serviceResolver = this.dependencies?.serviceResolver;

    try {
      this.waveManager = new WaveManager({
        enemySystem: this,
        eventBus: this.eventBus,
        random: waveManagerRandom,
        serviceResolver,
      });
    } catch (error) {
      throw new Error(
        `[EnemySystem] WaveManager failed to initialize: ${error.message}`,
        { cause: error }
      );
    }

    try {
      // Initialize RewardManager
      const rewardRandom = this.getRandomScope('enemy-rewards', {
        parentScope: 'fragments',
        label: 'enemy-rewards',
      });

      this.rewardManager = new RewardManager({
        enemySystem: this,
        xpOrbSystem: this.xpOrbs,
        healthHearts: this.healthHearts,
        random: rewardRandom,
        serviceResolver,
      });
    } catch (error) {
      console.warn('[EnemySystem] Failed to initialize RewardManager', error);
      this.rewardManager = null;
    }
  }

  setupComponents() {
    try {
      // Initialize collision component
      this.collisionComponent = new AsteroidCollision();

      this.genericMovement = new MovementComponent();
      this.genericWeapon = new WeaponComponent();
      this.genericCollision = new CollisionComponent();
      this.genericHealth = new HealthComponent();
    } catch (error) {
      console.warn('[EnemySystem] Failed to initialize components', error);
      this.collisionComponent = null;
      this.genericMovement = null;
      this.genericWeapon = null;
      this.genericCollision = null;
      this.genericHealth = null;
      this.useComponents = false;
    }
  }

  setupSpawnSystem() {
    try {
      const facade = this;
      const context = {
        facade,
        get asteroids() {
          return facade.asteroids;
        },
        get waveState() {
          return facade.waveState;
        },
        get factory() {
          return facade.factory;
        },
        get waveManager() {
          return facade.waveManager;
        },
        get useFactory() {
          return facade.useFactory;
        },
        get sessionActive() {
          return facade.sessionActive;
        },
        createScopedRandom: (...args) => facade.createScopedRandom(...args),
        getRandomScope: (...args) => facade.getRandomScope(...args),
        getRandomService: (...args) => facade.getRandomService(...args),
        isBossEnemy: (...args) => facade.isBossEnemy(...args),
        trackBossEnemy: (...args) => facade.trackBossEnemy(...args),
        getAvailableBossMinionTypes: (...args) =>
          facade.getAvailableBossMinionTypes(...args),
        invalidateActiveEnemyCache: (...args) =>
          facade.invalidateActiveEnemyCache(...args),
        registerEnemyWithPhysics: (...args) =>
          facade.registerEnemyWithPhysics(...args),
        emitEvent: (...args) => facade.emitEvent?.(...args),
        handleBossSpawned: (...args) => facade.handleBossSpawned(...args),
        mergeBossRewards: (...args) => facade.mergeBossRewards(...args),
        getActiveEnemyCount: (...args) => facade.getActiveEnemyCount(...args),
      };

      this.spawnSystem = new EnemySpawnSystem(context);
    } catch (error) {
      console.warn('[EnemySystem] Failed to initialize spawn system', error);
      this.spawnSystem = null;
    }
  }

  setupDamageSystem() {
    try {
      const facade = this;
      const context = {
        facade,
        get spawnSystem() {
          return facade.spawnSystem;
        },
        get asteroids() {
          return facade.asteroids;
        },
        get waveState() {
          return facade.waveState;
        },
        get sessionStats() {
          return facade.sessionStats;
        },
        createScopedRandom: (...args) => facade.createScopedRandom?.(...args),
        getRandomScope: (...args) => facade.getRandomScope?.(...args),
        getRandomService: (...args) => facade.getRandomService?.(...args),
        getCachedPlayer: (...args) => facade.getCachedPlayer?.(...args),
        getCachedWorld: (...args) => facade.getCachedWorld?.(...args),
        getCachedPhysics: (...args) => facade.getCachedPhysics?.(...args),
        getPlayerPositionSnapshot: (...args) =>
          facade.getPlayerPositionSnapshot?.(...args),
        getPlayerHullRadius: (...args) => facade.getPlayerHullRadius?.(...args),
        invalidateActiveEnemyCache: (...args) =>
          facade.invalidateActiveEnemyCache?.(...args),
        emitEvent: (...args) => facade.emitEvent?.(...args),
        getActiveEnemyCount: (...args) => facade.getActiveEnemyCount?.(...args),
      };

      this.damageSystem = new EnemyDamageSystem(context);
    } catch (error) {
      console.warn('[EnemySystem] Failed to initialize damage system', error);
      this.damageSystem = null;
    }
  }

  setupUpdateSystem() {
    try {
      const facade = this;
      const context = {
        facade,
        get spawnSystem() {
          return facade.spawnSystem;
        },
        get damageSystem() {
          return facade.damageSystem;
        },
        get asteroids() {
          return facade.asteroids;
        },
        get sessionStats() {
          return facade.sessionStats;
        },
        get useComponents() {
          return facade.useComponents;
        },
        get movementComponent() {
          return facade.movementComponent;
        },
        get collisionComponent() {
          return facade.collisionComponent;
        },
        get genericMovement() {
          return facade.genericMovement;
        },
        get waveManager() {
          return facade.waveManager;
        },
        refreshServiceState: (...args) => facade.refreshServiceState?.(...args),
        getCachedPlayer: (...args) => facade.getCachedPlayer?.(...args),
        getCachedWorld: (...args) => facade.getCachedWorld?.(...args),
        getCachedPhysics: (...args) => facade.getCachedPhysics?.(...args),
        getRandomScope: (...args) => facade.getRandomScope?.(...args),
        getRandomService: (...args) => facade.getRandomService?.(...args),
        getActiveEnemyCount: (...args) => facade.getActiveEnemyCount?.(...args),
        invalidateActiveEnemyCache: (...args) =>
          facade.invalidateActiveEnemyCache?.(...args),
        releaseAsteroid: (...args) => facade.releaseAsteroid?.(...args),
      };

      this.updateSystem = new EnemyUpdateSystem(context);
    } catch (error) {
      console.warn('[EnemySystem] Failed to initialize update system', error);
      this.updateSystem = null;
    }
  }

  /**
   * Acquires an asteroid from the spawn sub-system.
   * Throws if the spawn sub-system is not initialized.
   */
  acquireAsteroid(config = {}) {
    if (!this.spawnSystem) {
      throw new Error('[EnemySystem] SpawnSystem not initialized');
    }
    return this.spawnSystem.acquireAsteroid(config);
  }

  /**
   * Acquires an enemy via the spawn factory.
   * Throws if the spawn sub-system is not initialized.
   */
  acquireEnemyViaFactory(type, config) {
    if (!this.spawnSystem) {
      throw new Error('[EnemySystem] SpawnSystem not initialized');
    }
    return this.spawnSystem.acquireEnemyViaFactory(type, config);
  }

  /**
   * Registers an active enemy with the spawn sub-system.
   * Throws if the spawn sub-system is not initialized.
   */
  registerActiveEnemy(enemy, { skipDuplicateCheck = false } = {}) {
    if (!this.spawnSystem) {
      throw new Error('[EnemySystem] SpawnSystem not initialized');
    }
    return this.spawnSystem.registerActiveEnemy(enemy, {
      skipDuplicateCheck,
    });
  }

  /**
   * Emits a warning when wave registration fails within the spawn sub-system.
   * Throws if the spawn sub-system is not initialized.
   */
  warnIfWaveManagerRegistrationFailed(result, context, enemy = null) {
    if (!this.spawnSystem) {
      throw new Error('[EnemySystem] SpawnSystem not initialized');
    }
    return this.spawnSystem.warnIfWaveManagerRegistrationFailed(
      result,
      context,
      enemy
    );
  }

  releaseAsteroid(asteroid) {
    return this.field.releaseAsteroid(asteroid);
  }

  releaseAllAsteroidsToPool() {
    return this.field.releaseAllAsteroidsToPool();
  }

  getCachedPlayer() {
    return this.player;
  }

  getPlayerPositionSnapshot(player) {
    return getPlayerPositionSnapshot(player);
  }

  getPlayerHullRadius(player) {
    return getPlayerHullRadius(player);
  }

  getCachedWorld() {
    return this.world;
  }

  getCachedProgression() {
    return this.progression;
  }

  getCachedXPOrbs() {
    return this.xpOrbs;
  }

  // Pickups are built after the enemies (they need them): resolved late.
  getCachedPickups() {
    return resolveService('pickups', this.dependencies);
  }

  getCachedPhysics() {
    return this.physics;
  }

  getCachedCombat() {
    if (!this.combat) {
      this.combat = requireService('combat', this.dependencies, 'EnemySystem');
    }
    return this.combat;
  }

  getCachedHealthHearts() {
    return this.healthHearts;
  }

  getCachedEffects() {
    return this.getCachedService('effects', 'effects');
  }

  getCachedAudio() {
    return this.getCachedService('audio', 'audio');
  }

  getCachedUI() {
    return this.getCachedService('ui', 'ui');
  }

  /**
   * Retrieves the pool identifier associated with an asteroid.
   * Throws if the spawn sub-system is not initialized.
   */
  getAsteroidPoolId(asteroid) {
    if (!this.spawnSystem) {
      throw new Error('[EnemySystem] SpawnSystem not initialized');
    }
    return this.spawnSystem.getAsteroidPoolId(asteroid);
  }

  /**
   * Assigns a pool identifier to an asteroid.
   * Throws if the spawn sub-system is not initialized.
   */
  assignAsteroidPoolId(asteroid, preferredId = null) {
    if (!this.spawnSystem) {
      throw new Error('[EnemySystem] SpawnSystem not initialized');
    }
    return this.spawnSystem.assignAsteroidPoolId(asteroid, preferredId);
  }

  /**
   * Clears the pool identifier stored on an asteroid.
   * Throws if the spawn sub-system is not initialized.
   */
  clearAsteroidPoolId(asteroid) {
    if (!this.spawnSystem) {
      throw new Error('[EnemySystem] SpawnSystem not initialized');
    }
    return this.spawnSystem.clearAsteroidPoolId(asteroid);
  }

  isBossEnemy(enemy) {
    return this.bosses.isBossEnemy(enemy);
  }

  trackBossEnemy(enemy) {
    return this.bosses.trackBossEnemy(enemy);
  }

  getAvailableBossMinionTypes(preferredTypes = null) {
    return this.bosses.getAvailableBossMinionTypes(preferredTypes);
  }

  mergeBossRewards(boss, override = {}) {
    return this.rewards.mergeBossRewards(boss, override);
  }

  handleBossSpawned(data = {}) {
    return this.bosses.handleBossSpawned(data);
  }

  get activeBosses() {
    return this.bosses.activeBosses;
  }

  set activeBosses(activeBosses) {
    this.bosses.activeBosses = activeBosses;
  }

  registerEnemyWithPhysics(enemy) {
    this.physics.registerEnemy(enemy);
  }

  unregisterEnemyFromPhysics(enemy) {
    this.physics.unregisterEnemy(enemy);
  }

  removeActiveEnemy(enemy) {
    return this.field.removeActiveEnemy(enemy);
  }

  invalidateActiveEnemyCache() {
    return this.field.invalidateActiveEnemyCache();
  }

  forEachActiveEnemy(callback) {
    return this.field.forEachActiveEnemy(callback);
  }

  forEachActiveAsteroid(callback) {
    return this.field.forEachActiveAsteroid(callback);
  }

  /**
   * The wave as the HUD, snapshots and spawners read it: a read-only copy
   * built from WaveManager, which owns every count (a new object each read).
   */
  get waveState() {
    const waveManager = this.waveManager;
    return {
      current: waveManager.rockLayer,
      totalAsteroids: waveManager.rocksTotal,
      asteroidsSpawned: waveManager.rocksSpawned,
      asteroidsKilled: waveManager.asteroidsKilledThisWave,
      isActive: waveManager.rocksActive,
      breakTimer: waveManager.rocksActive ? 0 : waveManager.waveCountdown,
      completedWaves: waveManager.completedWaves,
    };
  }

  createInitialSessionStats() {
    return {
      totalKills: 0,
      timeElapsed: 0,
    };
  }

  // === UPDATE PRINCIPAL ===
  /**
   * Main update entry point routed through the update sub-system.
   * Throws if the update sub-system is not initialized.
   */
  update(deltaTime) {
    if (!this.updateSystem) {
      throw new Error('[EnemySystem] UpdateSystem not initialized');
    }
    return this.updateSystem.update(deltaTime);
  }

  /**
   * Updates support enemies (drones, hunters, mines) through the update
   * sub-system.
   * Throws if the update sub-system is not initialized.
   */
  updateSupportEnemies(deltaTime) {
    if (!this.updateSystem) {
      throw new Error('[EnemySystem] UpdateSystem not initialized');
    }
    return this.updateSystem.updateSupportEnemies(deltaTime);
  }

  /**
   * Synchronizes with the wave manager through the update sub-system.
   * Throws if the update sub-system is not initialized.
   */
  updateWaveManagerLogic(deltaTime) {
    if (!this.updateSystem) {
      throw new Error('[EnemySystem] UpdateSystem not initialized');
    }
    return this.updateSystem.updateWaveManagerLogic(deltaTime);
  }

  /**
   * Updates asteroid entities through the update sub-system.
   * Throws if the update sub-system is not initialized.
   */
  updateAsteroids(deltaTime) {
    if (!this.updateSystem) {
      throw new Error('[EnemySystem] UpdateSystem not initialized');
    }
    return this.updateSystem.updateAsteroids(deltaTime);
  }

  /**
   * Resolves asteroid collisions through the update sub-system.
   * Throws if the update sub-system is not initialized.
   */
  handleAsteroidCollisions() {
    if (!this.updateSystem) {
      throw new Error('[EnemySystem] UpdateSystem not initialized');
    }
    return this.updateSystem.handleAsteroidCollisions();
  }

  /**
   * Checks for a collision between two asteroids via the update sub-system.
   * Throws if the update sub-system is not initialized.
   */
  checkAsteroidCollision(a1, a2) {
    if (!this.updateSystem) {
      throw new Error('[EnemySystem] UpdateSystem not initialized');
    }
    return this.updateSystem.checkAsteroidCollision(a1, a2);
  }

  // === SISTEMA DE SPAWNING ===
  /**
   * Spawns a boss enemy via the spawn sub-system.
   * Throws if the spawn sub-system is not initialized.
   */
  spawnBoss(config = {}) {
    if (!this.spawnSystem) {
      throw new Error('[EnemySystem] SpawnSystem not initialized');
    }
    return this.spawnSystem.spawnBoss(config);
  }

  /**
   * Spawns a regular asteroid via the spawn sub-system.
   * Throws if the spawn sub-system is not initialized.
   */
  spawnAsteroid() {
    if (!this.spawnSystem) {
      throw new Error('[EnemySystem] SpawnSystem not initialized');
    }
    return this.spawnSystem.spawnAsteroid();
  }

  /**
   * Applies damage through the damage sub-system.
   * Throws if the damage sub-system is not initialized.
   */
  applyDamage(asteroid, damage, options = {}) {
    if (!this.damageSystem) {
      throw new Error('[EnemySystem] DamageSystem not initialized');
    }
    return this.damageSystem.applyDamage(asteroid, damage, options);
  }

  // === GERENCIAMENTO DE DESTRUIÇÃO ===
  /**
   * Destroys an asteroid via the damage sub-system.
   * Throws if the damage sub-system is not initialized.
   */
  destroyAsteroid(asteroid, options = {}) {
    if (!this.damageSystem) {
      throw new Error('[EnemySystem] DamageSystem not initialized');
    }
    return this.damageSystem.destroyAsteroid(asteroid, options);
  }

  /**
   * Determines an asteroid variant via the spawn sub-system.
   * Throws if the spawn sub-system is not initialized.
   */
  decideVariant(size, context = {}) {
    if (!this.spawnSystem) {
      throw new Error('[EnemySystem] SpawnSystem not initialized');
    }
    return this.spawnSystem.decideVariant(size, context);
  }

  /**
   * Computes the variant wave bonus via the spawn sub-system.
   * Throws if the spawn sub-system is not initialized.
   */
  computeVariantWaveBonus(wave) {
    if (!this.spawnSystem) {
      throw new Error('[EnemySystem] SpawnSystem not initialized');
    }
    return this.spawnSystem.computeVariantWaveBonus(wave);
  }

  /**
   * Assigns variants to asteroid fragments via the spawn sub-system.
   * Throws if the spawn sub-system is not initialized.
   */
  assignVariantsToFragments(fragments, parent, wave) {
    if (!this.spawnSystem) {
      throw new Error('[EnemySystem] SpawnSystem not initialized');
    }
    return this.spawnSystem.assignVariantsToFragments(fragments, parent, wave);
  }

  /**
   * Determines if an asteroid is volatile via the damage sub-system.
   * Throws if the damage sub-system is not initialized.
   */
  isVolatileVariant(asteroid) {
    if (!this.damageSystem) {
      throw new Error('[EnemySystem] DamageSystem not initialized');
    }
    return this.damageSystem.isVolatileVariant(asteroid);
  }

  /**
   * Triggers volatile explosions via the damage sub-system.
   * Throws if the damage sub-system is not initialized.
   */
  triggerVolatileExplosion(asteroid, cause = 'destroyed') {
    if (!this.damageSystem) {
      throw new Error('[EnemySystem] DamageSystem not initialized');
    }
    return this.damageSystem.triggerVolatileExplosion(asteroid, cause);
  }

  /**
   * Handles volatile timeout via the damage sub-system.
   * Throws if the damage sub-system is not initialized.
   */
  handleVolatileTimeout(asteroid) {
    if (!this.damageSystem) {
      throw new Error('[EnemySystem] DamageSystem not initialized');
    }
    return this.damageSystem.handleVolatileTimeout(asteroid);
  }

  /**
   * Applies direct damage to the player via the damage sub-system.
   * Throws if the damage sub-system is not initialized.
   */
  applyDirectDamageToPlayer(amount, context = {}) {
    if (!this.damageSystem) {
      throw new Error('[EnemySystem] DamageSystem not initialized');
    }
    return this.damageSystem.applyDirectDamageToPlayer(amount, context);
  }

  /**
   * Releases destroyed enemies through the update sub-system.
   * Throws if the update sub-system is not initialized.
   */
  cleanupDestroyed() {
    if (!this.updateSystem) {
      throw new Error('[EnemySystem] UpdateSystem not initialized');
    }
    return this.updateSystem.cleanupDestroyed();
  }

  // === GETTERS PÚBLICOS ===
  // === GETTERS PÚBLICOS ===
  getActiveEnemies() {
    return this.field.getActiveEnemies();
  }

  getAllEnemies() {
    return this.field.getAllEnemies();
  }

  getActiveEnemyCount() {
    return this.field.getActiveEnemyCount();
  }

  // === LEGACY COMPATIBILITY HELPERS ===
  getAsteroids() {
    return this.field.getAsteroids();
  }

  getAllAsteroids() {
    return this.field.getAllAsteroids();
  }

  get usesAsteroidPool() {
    return this.field.usesAsteroidPool;
  }

  exportState() {
    return this.snapshots.exportState();
  }

  importState(snapshot) {
    return this.snapshots.importState(snapshot);
  }

  getSnapshotState() {
    return this.exportState();
  }

  captureSnapshot() {
    return this.exportState();
  }

  restoreSnapshotState(snapshot) {
    return this.importState(snapshot);
  }

  applySnapshot(snapshot) {
    return this.importState(snapshot);
  }

  // === RESET E CLEANUP ===
  reset() {
    super.reset();

    this.releaseAllAsteroidsToPool();
    this.asteroids = [];
    this.invalidateActiveEnemyCache();
    this._nextAsteroidPoolId = 1;
    this.sessionStats = this.createInitialSessionStats();
    this.sessionActive = true;
    this._snapshotFallbackWarningIssued = false;
    this._lastWaveManagerCompletionHandled = null;
    this.bosses._lastBossHudDamageUpdate = 0;
    this.refreshServiceState({ force: true });
    this.syncPhysicsIntegration(true);

    try {
      this.waveManager.reset();
    } catch (error) {
      console.error(
        '[EnemySystem] Failed to reset WaveManager during system reset:',
        error
      );
    }

    console.log('[EnemySystem] Reset');
  }

  destroy() {
    this.releaseAllAsteroidsToPool();
    this.asteroids = [];
    this.sessionActive = false;
    if (this.activeBosses) {
      this.activeBosses.clear();
    }
    this.bosses.bossHudState = this.bosses.createInitialBossHudState();
    this.player = null;
    this.world = null;
    this.progression = null;
    this.xpOrbs = null;
    this.physics = null;
    this.combat = null;
    this.healthHearts = null;
    this.random = null;
    this.effects = null;
    this.audio = null;
    this.ui = null;
    this.field.activeEnemyCache = [];
    this.field.activeEnemyCacheDirty = true;
    this.enemyRandom.randomScopes = null;
    this.enemyRandom.randomSequences = null;
    this._nextAsteroidPoolId = 1;
    this._snapshotFallbackWarningIssued = false;
    this._lastWaveManagerCompletionHandled = null;
    console.log('[EnemySystem] Destroyed');
  }

  stop() {
    this.sessionActive = false;
  }

  startNextWave() {
    this.waveManager.startLayerFromSession();
  }

  handleWaveManagerWaveComplete(data) {
    if (!this.updateSystem) {
      throw new Error('[EnemySystem] UpdateSystem not initialized');
    }
    return this.updateSystem.handleWaveManagerWaveComplete(data);
  }

  grantWaveRewards() {
    return this.rewards.grantWaveRewards();
  }

  getWaveState() {
    return this.waveState;
  }

  getBossHudState() {
    return this.bosses.getBossHudState();
  }

  getSessionStats() {
    return { ...this.sessionStats };
  }

  handleBossAttackPayload(data = {}) {
    if (!data || data.processedBy === 'physics') {
      return;
    }

    const physics = this.physics;
    const attackType =
      data.type ||
      data.attackType ||
      data.event ||
      data.kind ||
      data.mode ||
      null;

    const boss = this.bosses.resolveBossReference(data) || data.boss || null;
    const player = data.player || this.getCachedPlayer();

    const payload = {
      ...data,
      boss,
      player,
      enemiesSystem: this,
    };

    if (!attackType && !payload.radius && !payload.knockback) {
      return;
    }

    switch (attackType) {
      case 'charge':
      case 'charge-impact':
      case 'charge-collision':
      case 'boss-charge':
        physics.handleBossChargeCollision(payload);
        break;
      case 'area':
      case 'area-damage':
      case 'nova':
      case 'shockwave':
      case 'boss-area':
        physics.applyBossAreaDamage(payload);
        break;
      default:
        if (payload.collisionType === 'boss-charge') {
          physics.handleBossChargeCollision(payload);
          break;
        }

        if (payload.radius) {
          physics.applyBossAreaDamage(payload);
        }
        break;
    }
  }

  handleEnemyProjectile(data = null) {
    return this.combatRelay.handleEnemyProjectile(data);
  }

  /**
   * Handles mine explosions via the damage sub-system.
   * Throws if the damage sub-system is not initialized.
   */
  handleMineExplosion(data = null) {
    if (!this.damageSystem) {
      throw new Error('[EnemySystem] DamageSystem not initialized');
    }
    return this.damageSystem.handleMineExplosion(data);
  }

  /**
   * Resolves shield explosion damage via the damage sub-system.
   * Throws if the damage sub-system is not initialized.
   */
  handleShieldExplosionDamage(data) {
    if (!this.damageSystem) {
      throw new Error('[EnemySystem] DamageSystem not initialized');
    }
    return this.damageSystem.handleShieldExplosionDamage(data);
  }
}

export { EnemySystem, Asteroid };
