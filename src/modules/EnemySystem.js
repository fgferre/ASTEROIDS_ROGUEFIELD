// src/modules/EnemySystem.js
import * as CONSTANTS from '../core/GameConstants.js';
import { ENEMY_TYPES } from '../core/GameConstants.js';
import { GamePools } from '../core/GamePools.js';
import RandomService from '../core/RandomService.js';
import { normalizeDependencies, resolveService } from '../core/serviceUtils.js';
import { Asteroid } from './enemies/types/Asteroid.js';
import { Drone } from './enemies/types/Drone.js';
import { Mine } from './enemies/types/Mine.js';
import { Hunter } from './enemies/types/Hunter.js';
import { BossEnemy } from './enemies/types/BossEnemy.js';
import { EnemyFactory } from './enemies/base/EnemyFactory.js';
import { WaveManager } from './enemies/managers/WaveManager.js';
import { RewardManager } from './enemies/managers/RewardManager.js';
import { AsteroidMovement } from './enemies/components/AsteroidMovement.js';
import { AsteroidCollision } from './enemies/components/AsteroidCollision.js';
import { AsteroidRenderer } from './enemies/components/AsteroidRenderer.js';

const ASTEROID_POOL_ID = Symbol.for('ASTEROIDS_ROGUEFIELD:asteroidPoolId');

// === CLASSE ENEMYSYSTEM ===
// Asteroid class moved to: ./enemies/types/Asteroid.js
// === SISTEMA DE INIMIGOS ===
class EnemySystem {
  constructor(dependencies = {}) {
    this.dependencies = normalizeDependencies(dependencies);
    this.services = {
      player: this.dependencies.player || null,
      world: this.dependencies.world || null,
      progression: this.dependencies.progression || null,
      xpOrbs: this.dependencies['xp-orbs'] || null,
      physics: this.dependencies.physics || null,
      combat: this.dependencies.combat || null,
      healthHearts: this.dependencies.healthHearts || null,
      random: this.dependencies.random || null,
      effects: this.dependencies.effects || null,
      audio: this.dependencies.audio || null,
      ui: this.dependencies.ui || null,
    };

    this.randomScopes = null;
    this.randomSequences = null;
    this.randomScopeSeeds = {};
    this.randomScopeLabels = {
      spawn: 'enemy-system:spawn',
      variants: 'enemy-system:variants',
      fragments: 'enemy-system:fragments',
    };
    this._fallbackRandom = null;

    this.asteroids = [];
    this.activeBosses = new Map();
    this.bossHudState = this.createInitialBossHudState();
    this.spawnTimer = 0;
    this.spawnDelay = 1.0;
    this.pendingEnemyProjectiles = [];

    // Legacy wave state (for backward compatibility during migration)
    this.waveState = this.createInitialWaveState();
    this.sessionStats = this.createInitialSessionStats();
    this.sessionActive = false;
    this.lastWaveBroadcast = null;

    this.activeEnemyCache = [];
    this.activeEnemyCacheDirty = true;
    this.usesAsteroidPool = false;
    this._nextAsteroidPoolId = 1;
    this._snapshotFallbackWarningIssued = false;
    this._waveSystemDebugLogged = false;
    this._waveManagerFallbackWarningIssued = false;
    this._waveManagerInvalidStateWarningIssued = false;
    this._lastWaveManagerCompletionHandled = null;
    this._asteroidSpawnDebugLogged = false;
    this._waveManagerRuntimeEnabled = false;

    // Factory (optional - new architecture)
    this.factory = null;
    this.useFactory = true; // Factory path enabled for runtime spawns

    // Managers (new architecture)
    this.waveManager = null;
    this.rewardManager = null;
    this.useManagers = true; // Feature flag to enable new manager system

    // Components (new architecture)
    this.movementComponent = null;
    this.collisionComponent = null;
    this.rendererComponent = null;
    this.useComponents = true; // Feature flag to enable component system

    this.eventBus = typeof gameEvents !== 'undefined' ? gameEvents : null;

    // Registrar no ServiceLocator
    if (typeof gameServices !== 'undefined') {
      gameServices.register('enemies', this);
    }

    this.missingDependencyWarnings = new Set();
    this.deferredDependencyWarnings = new Set(['world', 'combat', 'effects', 'audio', 'ui']);

    this.setupAsteroidPoolIntegration();
    this.setupEnemyFactory(); // Initialize factory (optional)
    this.refreshInjectedServices({ force: true, suppressWarnings: true });
    this.setupRandomGenerators();
    this.setupManagers(); // Initialize wave and reward managers
    this.setupComponents(); // Initialize components
    this.setupEventListeners();
    this.syncPhysicsIntegration(true);

    this.emitWaveStateUpdate(true);

    console.log('[EnemySystem] Initialized');
  }

  attachProgression(progressionSystem) {
    if (!progressionSystem) {
      this.logMissingDependency('progression');
      return;
    }

    this.dependencies.progression = progressionSystem;
    this.refreshInjectedServices({ force: true });
  }

  attachWorld(worldSystem) {
    if (!worldSystem) {
      this.logMissingDependency('world');
      return;
    }

    this.dependencies.world = worldSystem;
    this.deferredDependencyWarnings.delete('world');
    this.refreshInjectedServices({ force: true });
  }

  logMissingDependency(name) {
    if (this.missingDependencyWarnings.has(name)) {
      return;
    }

    this.missingDependencyWarnings.add(name);
    console.warn(`[EnemySystem] Missing dependency: ${name}`);
  }

  warnSnapshotFallback(reason) {
    if (this._snapshotFallbackWarningIssued) {
      return;
    }

    this._snapshotFallbackWarningIssued = true;
    const detail = reason ? ` (${reason})` : '';
    console.warn(
      `[EnemySystem] Snapshot data unavailable, performing full reset${detail}`
    );
  }

  updateServiceCache(targetKey, dependencyKey, { force = false, suppressWarnings = false } = {}) {
    if (force) {
      this.services[targetKey] = null;
    }

    const dependency = this.dependencies[dependencyKey];
    if (dependency) {
      this.services[targetKey] = dependency;
      this.missingDependencyWarnings.delete(dependencyKey);
      return;
    }

    const resolvedService = resolveService(dependencyKey, this.dependencies);
    if (resolvedService) {
      this.services[targetKey] = resolvedService;
      this.dependencies[dependencyKey] = resolvedService;
      this.missingDependencyWarnings.delete(dependencyKey);
      return;
    }

    if (!this.services[targetKey] && !suppressWarnings) {
      if (this.deferredDependencyWarnings.has(dependencyKey)) {
        return;
      }
      this.logMissingDependency(dependencyKey);
    }
  }

  setupEventListeners() {
    const bus = this.eventBus || (typeof gameEvents !== 'undefined' ? gameEvents : null);
    if (!bus) return;

    // Handle level 5 shield deflective explosion (AoE damage)
    bus.on('shield-explosion-damage', (data) => {
      this.handleShieldExplosionDamage(data);
    });

    bus.on('player-reset', () => {
      this.refreshInjectedServices({ force: true });
    });

    bus.on('progression-reset', () => {
      this.refreshInjectedServices({ force: true });
    });

    bus.on('world-reset', () => {
      this.refreshInjectedServices({ force: true });
    });

    bus.on('physics-reset', () => {
      this.refreshInjectedServices({ force: true });
      this.syncPhysicsIntegration(true);
    });

    bus.on('enemy-fired', (data) => {
      this.handleEnemyProjectile(data);
    });

    bus.on('mine-exploded', (data) => {
      this.handleMineExplosion(data);
    });

    // NEW: Integrate RewardManager with enemy destruction
    if (this.useManagers) {
      bus.on('enemy-destroyed', (data) => {
        if (this.rewardManager && data.enemy) {
          this.rewardManager.dropRewards(data.enemy);
        }
      });

      if (this.waveManager) {
        bus.on('wave-complete', (data = {}) => {
          if (Boolean(CONSTANTS?.USE_WAVE_MANAGER) && this.waveState) {
            const waveNumber = Number.isFinite(Number(data.wave))
              ? Number(data.wave)
              : Number.isFinite(this.waveState.current)
              ? this.waveState.current
              : null;

            if (
              waveNumber !== null &&
              this._lastWaveManagerCompletionHandled === waveNumber
            ) {
              return;
            }

            console.debug(
              '[EnemySystem] Wave complete event received from WaveManager:',
              data
            );

            if (waveNumber !== null) {
              this._lastWaveManagerCompletionHandled = waveNumber;
            }

            this.handleWaveManagerWaveComplete(data);
          }
        });
      }
    }

    bus.on('boss-wave-started', (data) => {
      this.handleBossWaveStarted(data);
    });

    bus.on('boss-spawned', (data) => {
      this.handleBossSpawned(data);
    });

    bus.on('boss-phase-changed', (data) => {
      this.handleBossPhaseChange(data);
    });

    bus.on('boss-defeated', (data) => {
      this.handleBossDefeated(data);
    });

    bus.on('boss-attack', (data) => {
      this.handleBossAttackPayload(data);
    });
  }

  refreshInjectedServices({ force = false, suppressWarnings = false } = {}) {
    const options = { force, suppressWarnings };
    this.updateServiceCache('player', 'player', options);
    this.updateServiceCache('world', 'world', options);
    this.updateServiceCache('progression', 'progression', options);
    this.updateServiceCache('xpOrbs', 'xp-orbs', options);
    this.updateServiceCache('physics', 'physics', options);
    this.updateServiceCache('combat', 'combat', options);
    this.updateServiceCache('healthHearts', 'healthHearts', options);
    this.updateServiceCache('effects', 'effects', options);
    this.updateServiceCache('audio', 'audio', options);
    this.updateServiceCache('ui', 'ui', options);
    const previousRandom = this.services.random;
    this.updateServiceCache('random', 'random', options);
    const randomServiceChanged = previousRandom !== this.services.random;

    if (randomServiceChanged) {
      this.randomScopes = null;
      this.randomSequences = null;
    }

    this.setupRandomGenerators();

    if (force || randomServiceChanged) {
      this.reseedRandomScopes({ resetSequences: force || randomServiceChanged });
    }

    // Flush pending enemy projectiles when CombatSystem becomes available
    if (this.pendingEnemyProjectiles.length > 0) {
      const combat = this.services.combat;
      if (combat) {
        const pending = [...this.pendingEnemyProjectiles];
        this.pendingEnemyProjectiles = [];
        pending.forEach(payload => this.handleEnemyProjectile(payload));
        if (process.env.NODE_ENV === 'development') {
          console.debug('[EnemySystem] Flushed pending projectiles', pending.length);
        }
      }
    }
  }

  syncPhysicsIntegration(force = false) {
    const physics = this.getCachedPhysics();
    if (!physics || typeof physics.bootstrapFromEnemySystem !== 'function') {
      return;
    }

    physics.bootstrapFromEnemySystem(this, { force });
  }

  setupRandomGenerators() {
    let randomService = this.services.random || this.dependencies.random;

    if (!randomService) {
      randomService = resolveService('random', this.dependencies);
      if (randomService) {
        this.dependencies.random = randomService;
        this.services.random = randomService;
      }
    }

    if (!randomService) {
      if (!this._fallbackRandom) {
        this._fallbackRandom = new RandomService('enemy-system:fallback');
      }
      randomService = this._fallbackRandom;
      this.services.random = randomService;
    }

    if (this.randomScopes && this.randomScopes.base === randomService) {
      if (!this.randomSequences) {
        this.randomSequences = { spawn: 0, variants: 0, fragments: 0 };
      }
      return;
    }

    this.randomScopes = {
      base: randomService,
      spawn: randomService.fork(this.randomScopeLabels.spawn),
      variants: randomService.fork(this.randomScopeLabels.variants),
      fragments: randomService.fork(this.randomScopeLabels.fragments),
    };

    this.captureRandomScopeSeeds();

    this.randomSequences = {
      spawn: 0,
      variants: 0,
      fragments: 0,
    };
  }

  getRandomService() {
    this.setupRandomGenerators();
    return this.randomScopes?.base || this._fallbackRandom || null;
  }

  getRandomScope(scope, { parentScope = 'base', label } = {}) {
    this.setupRandomGenerators();

    if (!this.randomScopes) {
      return null;
    }

    if (this.randomScopes[scope]) {
      return this.randomScopes[scope];
    }

    const forkLabel = label || `enemy-system:${scope}`;
    const parent = this.randomScopes[parentScope] || this.randomScopes.base;
    if (parent && typeof parent.fork === 'function') {
      const forked = parent.fork(forkLabel);
      this.randomScopes[scope] = forked;
      this.registerRandomScopeLabel(scope, forkLabel);
      this.captureRandomScopeSeed(scope, forked);
      if (!this.randomSequences) {
        this.randomSequences = {};
      }
      if (this.randomSequences[scope] === undefined) {
        this.randomSequences[scope] = 0;
      }
      return forked;
    }

    if (!this._fallbackRandom) {
      this._fallbackRandom = new RandomService('enemy-system:fallback');
    }

    const fallbackFork = this._fallbackRandom.fork(forkLabel);
    this.randomScopes[scope] = fallbackFork;
    this.registerRandomScopeLabel(scope, forkLabel);
    this.captureRandomScopeSeed(scope, fallbackFork);
    if (!this.randomSequences) {
      this.randomSequences = {};
    }
    if (this.randomSequences[scope] === undefined) {
      this.randomSequences[scope] = 0;
    }

    return this.randomScopes[scope];
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

  createScopedRandom(scope = 'spawn', label = scope) {
    const generator = this.getRandomScope(scope);
    const sequence = this.nextRandomSequence(scope);

    if (generator && typeof generator.fork === 'function') {
      return {
        random: generator.fork(`enemy-system:${label}:${sequence}`),
        sequence,
      };
    }

    const fallbackBase = this.getRandomService() || this._fallbackRandom || new RandomService('enemy-system:fallback');
    return {
      random:
        typeof fallbackBase.fork === 'function'
          ? fallbackBase.fork(`enemy-system:${label}:${sequence}:fallback`)
          : fallbackBase,
      sequence,
    };
  }

  registerRandomScopeLabel(scope, label) {
    if (!this.randomScopeLabels) {
      this.randomScopeLabels = {};
    }

    if (label) {
      this.randomScopeLabels[scope] = label;
    }
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
      return;
    }

    if (!this.randomScopeSeeds) {
      this.randomScopeSeeds = {};
      this.captureRandomScopeSeeds();
    }

    Object.entries(this.randomScopes).forEach(([scope, generator]) => {
      if (scope === 'base' || !generator || typeof generator.reset !== 'function') {
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

    if (this.waveManager && typeof this.waveManager.reseedRandomScopes === 'function') {
      this.waveManager.reseedRandomScopes({ resetSequences });
    }

    if (this.rewardManager && typeof this.rewardManager.reseedRandom === 'function') {
      const rewardRandom = this.randomScopes?.['enemy-rewards'];
      this.rewardManager.reseedRandom(rewardRandom);
    }
  }

  captureRandomSnapshot() {
    const base = this.getRandomService();
    const baseSeed =
      base && typeof base.seed === 'number' ? base.seed >>> 0 : null;

    return {
      baseSeed,
      scopeSeeds: this.randomScopeSeeds
        ? { ...this.randomScopeSeeds }
        : null,
      sequences: this.randomSequences ? { ...this.randomSequences } : null,
    };
  }

  restoreRandomFromSnapshot(snapshot) {
    this.setupRandomGenerators();

    const base = this.getRandomService();
    if (base && typeof snapshot?.baseSeed === 'number') {
      if (typeof base.reset === 'function') {
        base.reset(snapshot.baseSeed);
      } else {
        base.seed = snapshot.baseSeed >>> 0;
      }
    }

    if (snapshot?.scopeSeeds && typeof snapshot.scopeSeeds === 'object') {
      this.randomScopeSeeds = { ...snapshot.scopeSeeds };
      this.reseedRandomScopes({ resetSequences: false });
    } else {
      this.reseedRandomScopes({ resetSequences: true });
    }

    if (snapshot?.sequences && typeof snapshot.sequences === 'object') {
      this.randomSequences = { ...snapshot.sequences };
    }
  }

  setupAsteroidPoolIntegration() {
    if (!GamePools || typeof GamePools.configureAsteroidLifecycle !== 'function') {
      this.usesAsteroidPool = false;
      return;
    }

    try {
      GamePools.configureAsteroidLifecycle({
        create: () => new Asteroid(),
        reset: (asteroid) => {
          if (asteroid && typeof asteroid.resetForPool === 'function') {
            asteroid.resetForPool();
          }
        }
      });
      this.usesAsteroidPool = true;
    } catch (error) {
      this.usesAsteroidPool = false;
      console.warn('[EnemySystem] Failed to configure asteroid pool lifecycle', error);
    }
  }

  setupEnemyFactory() {
    try {
      this.factory = new EnemyFactory(this);

      // Register asteroid type with factory
      this.factory.registerType('asteroid', {
        class: Asteroid,
        pool: GamePools?.asteroids || null,
        defaults: {
          size: 'medium',
          variant: 'common'
        },
        tags: ['destructible', 'enemy']
      });

      if (ENEMY_TYPES?.drone) {
        this.factory.registerType('drone', {
          class: Drone,
          pool: GamePools?.drones || null,
          defaults: { ...ENEMY_TYPES.drone },
          tags: ['enemy', 'hostile', 'ranged']
        });
      }

      if (ENEMY_TYPES?.mine) {
        this.factory.registerType('mine', {
          class: Mine,
          pool: GamePools?.mines || null,
          defaults: { ...ENEMY_TYPES.mine },
          tags: ['enemy', 'explosive', 'area-of-effect']
        });
      }

      if (ENEMY_TYPES?.hunter) {
        this.factory.registerType('hunter', {
          class: Hunter,
          pool: GamePools?.hunters || null,
          defaults: { ...ENEMY_TYPES.hunter },
          tags: ['enemy', 'hostile', 'ranged', 'elite']
        });
      }

      if (CONSTANTS?.BOSS_CONFIG) {
        this.factory.registerType('boss', {
          class: BossEnemy,
          pool: GamePools?.bosses || null,
          defaults: { ...CONSTANTS.BOSS_CONFIG },
          tags: ['enemy', 'boss', 'elite']
        });
      }

      console.log('[EnemySystem] EnemyFactory initialized (factory-enabled)');
    } catch (error) {
      console.warn('[EnemySystem] Failed to initialize EnemyFactory', error);
      this.factory = null;
    }
  }

  setupManagers() {
    try {
      // Initialize WaveManager
      if (typeof gameEvents !== 'undefined') {
        const waveManagerRandom = this.getRandomScope('wave-manager', {
          label: 'wave-manager',
        });

        this.waveManager = new WaveManager({
          enemySystem: this,
          eventBus: gameEvents,
          random: waveManagerRandom,
        });
        console.log('[EnemySystem] WaveManager initialized');
      }

      // Initialize RewardManager
      this.refreshInjectedServices();
      const xpOrbSystem = this.getCachedXPOrbs();
      const healthHeartSystem = this.getCachedHealthHearts();
      if (xpOrbSystem) {
        const rewardRandom = this.getRandomScope('enemy-rewards', {
          parentScope: 'fragments',
          label: 'enemy-rewards',
        });

        this.rewardManager = new RewardManager({
          enemySystem: this,
          xpOrbSystem,
          healthHearts: healthHeartSystem,
          random: rewardRandom,
        });
        console.log('[EnemySystem] RewardManager initialized');
      }
    } catch (error) {
      console.warn('[EnemySystem] Failed to initialize managers', error);
      this.waveManager = null;
      this.rewardManager = null;
      this.useManagers = false;
    }
  }

  setupComponents() {
    try {
      // Initialize movement component
      this.movementComponent = new AsteroidMovement();
      console.log('[EnemySystem] AsteroidMovement component initialized');

      // Initialize collision component
      this.collisionComponent = new AsteroidCollision();
      console.log('[EnemySystem] AsteroidCollision component initialized');

      // Initialize renderer component
      this.rendererComponent = new AsteroidRenderer();
      console.log('[EnemySystem] AsteroidRenderer component initialized');
    } catch (error) {
      console.warn('[EnemySystem] Failed to initialize components', error);
      this.movementComponent = null;
      this.collisionComponent = null;
      this.rendererComponent = null;
      this.useComponents = false;
    }
  }

  acquireAsteroid(config = {}) {
    const scopeHint = config.randomScope || (config.spawnedBy ? 'fragments' : 'spawn');
    const asteroidRandom =
      config.random || this.createScopedRandom(scopeHint, 'asteroid').random;
    const asteroidConfig = {
      ...config,
      random: asteroidRandom,
      poolId: config.poolId,
    };

    let asteroid = null;

    // NEW: Use factory if enabled (feature flag)
    if (this.useFactory && this.factory) {
      asteroid = this.acquireEnemyViaFactory('asteroid', asteroidConfig);
      if (asteroid) {
        this.assignAsteroidPoolId(asteroid, config.poolId);
        return asteroid;
      }
    }

    // LEGACY: Original implementation (default)
    if (
      this.usesAsteroidPool &&
      GamePools?.asteroids &&
      typeof GamePools.asteroids.acquire === 'function'
    ) {
      asteroid = GamePools.asteroids.acquire();
      if (asteroid && typeof asteroid.initialize === 'function') {
        asteroid.initialize(this, asteroidConfig);
        this.assignAsteroidPoolId(asteroid, config.poolId);
        return asteroid;
      }
    }

    asteroid = new Asteroid(this, asteroidConfig);
    this.assignAsteroidPoolId(asteroid, config.poolId);
    return asteroid;
  }

  // NEW: Factory-based enemy acquisition (optional path)
  acquireEnemyViaFactory(type, config) {
    if (!this.factory) {
      console.warn('[EnemySystem] Factory not available, falling back to legacy');
      return this.acquireAsteroid(config);
    }

    try {
      const enemy = this.factory.create(type, config);
      if (enemy) {
        this.assignAsteroidPoolId(enemy, config?.poolId);
        this.registerActiveEnemy(enemy, { skipDuplicateCheck: true });
      }
      return enemy;
    } catch (error) {
      console.error('[EnemySystem] Factory creation failed:', error);
      return null;
    }
  }

  registerActiveEnemy(enemy, { skipDuplicateCheck = false } = {}) {
    if (!enemy) {
      return null;
    }

    if (!skipDuplicateCheck && this.asteroids.includes(enemy)) {
      return enemy;
    }

    if (this.isBossEnemy(enemy)) {
      this.trackBossEnemy(enemy);
      enemy.destroyed = false;
    }

    this.asteroids.push(enemy);
    this.invalidateActiveEnemyCache();
    this.registerEnemyWithPhysics(enemy);

    const shouldBridgeToWaveManager =
      this.useManagers &&
      this.waveManager &&
      this._waveManagerRuntimeEnabled &&
      Boolean(CONSTANTS?.USE_WAVE_MANAGER) &&
      !Boolean(CONSTANTS?.WAVEMANAGER_HANDLES_ASTEROID_SPAWN) &&
      typeof this.waveManager.registerActiveEnemy === 'function';

    if (shouldBridgeToWaveManager) {
      const candidateType =
        enemy?.type ||
        enemy?.enemyType ||
        enemy?.enemyKind ||
        enemy?.kind ||
        null;
      const asteroidKey =
        (this.waveManager.enemyTypeKeys && this.waveManager.enemyTypeKeys.asteroid) ||
        'asteroid';
      const normalizedCandidate =
        typeof candidateType === 'string' ? candidateType.toLowerCase() : null;
      if (normalizedCandidate === String(asteroidKey).toLowerCase()) {
        this.waveManager.registerActiveEnemy(enemy, { skipDuplicateCheck: true });
      }
    }
    return enemy;
  }

  releaseAsteroid(asteroid) {
    if (!asteroid) {
      return;
    }

    if (this.isBossEnemy(asteroid)) {
      this.untrackBossEnemy(asteroid);
    }

    this.unregisterEnemyFromPhysics(asteroid);
    this.clearAsteroidPoolId(asteroid);

    // NEW: Use factory release if enabled
    if (this.useFactory && this.factory) {
      this.factory.release(asteroid);
      return;
    }

    // LEGACY: Direct pool release
    if (
      !this.usesAsteroidPool ||
      !GamePools?.asteroids ||
      typeof GamePools.asteroids.release !== 'function'
    ) {
      return;
    }

    GamePools.asteroids.release(asteroid);
  }

  releaseAllAsteroidsToPool() {
    if (!Array.isArray(this.asteroids) || this.asteroids.length === 0) {
      return;
    }

    for (let i = 0; i < this.asteroids.length; i += 1) {
      this.releaseAsteroid(this.asteroids[i]);
    }

    this.asteroids.length = 0;
    if (this.activeBosses) {
      this.activeBosses.clear();
    }
    this.emitBossHudUpdate(this.createInitialBossHudState());
    this.invalidateActiveEnemyCache();
  }

  getCachedPlayer() {
    this.refreshInjectedServices();
    return this.services.player;
  }

  getPlayerPositionSnapshot(player) {
    if (!player) {
      return null;
    }

    if (
      player.position &&
      Number.isFinite(player.position.x) &&
      Number.isFinite(player.position.y)
    ) {
      return { x: player.position.x, y: player.position.y };
    }

    if (typeof player.getPosition === 'function') {
      const fetchedPosition = player.getPosition();
      if (
        fetchedPosition &&
        Number.isFinite(fetchedPosition.x) &&
        Number.isFinite(fetchedPosition.y)
      ) {
        return { x: fetchedPosition.x, y: fetchedPosition.y };
      }
    }

    return null;
  }

  getPlayerHullRadius(player) {
    if (!player) {
      return CONSTANTS.SHIP_SIZE;
    }

    const rawHullRadius =
      typeof player.getHullBoundingRadius === 'function'
        ? player.getHullBoundingRadius()
        : player.hullRadius;

    if (Number.isFinite(rawHullRadius)) {
      return Math.max(0, rawHullRadius);
    }

    return CONSTANTS.SHIP_SIZE;
  }

  getCachedWorld() {
    this.refreshInjectedServices();
    return this.services.world;
  }

  getCachedProgression() {
    this.refreshInjectedServices();
    return this.services.progression;
  }

  getCachedXPOrbs() {
    this.refreshInjectedServices();
    return this.services.xpOrbs;
  }

  getCachedPhysics() {
    this.refreshInjectedServices();
    return this.services.physics;
  }

  getCachedCombat() {
    this.refreshInjectedServices();
    return this.services.combat;
  }

  getCachedHealthHearts() {
    this.refreshInjectedServices();
    return this.services.healthHearts;
  }

  getCachedEffects() {
    this.refreshInjectedServices();
    return this.services.effects;
  }

  getCachedAudio() {
    this.refreshInjectedServices();
    return this.services.audio;
  }

  getCachedUI() {
    this.refreshInjectedServices();
    return this.services.ui;
  }

  getAsteroidPoolId(asteroid) {
    if (!asteroid) {
      return null;
    }

    return asteroid[ASTEROID_POOL_ID] ?? null;
  }

  assignAsteroidPoolId(asteroid, preferredId = null) {
    if (!asteroid) {
      return null;
    }

    let poolId = asteroid[ASTEROID_POOL_ID];
    if (poolId == null) {
      if (
        Number.isFinite(preferredId) &&
        preferredId > 0 &&
        Math.floor(preferredId) === preferredId
      ) {
        poolId = preferredId;
      } else {
        poolId = this._nextAsteroidPoolId++;
      }
    }

    asteroid[ASTEROID_POOL_ID] = poolId;

    if (poolId >= this._nextAsteroidPoolId) {
      this._nextAsteroidPoolId = poolId + 1;
    }

    return poolId;
  }

  clearAsteroidPoolId(asteroid) {
    if (!asteroid || asteroid[ASTEROID_POOL_ID] == null) {
      return;
    }

    delete asteroid[ASTEROID_POOL_ID];
  }

  isBossEnemy(enemy) {
    if (!enemy) {
      return false;
    }

    if (enemy.type === 'boss') {
      return true;
    }

    if (typeof enemy.hasTag === 'function') {
      return enemy.hasTag('boss');
    }

    if (enemy.tags && typeof enemy.tags.has === 'function') {
      return enemy.tags.has('boss');
    }

    return false;
  }

  trackBossEnemy(enemy) {
    if (!enemy) {
      return;
    }

    if (!this.activeBosses) {
      this.activeBosses = new Map();
    }

    const bossId = enemy.id ?? enemy.bossId ?? null;
    if (bossId != null) {
      this.activeBosses.set(bossId, enemy);
    }
  }

  untrackBossEnemy(enemy) {
    if (!enemy || !this.activeBosses) {
      return;
    }

    const bossId = enemy.id ?? enemy.bossId ?? null;
    if (bossId != null) {
      this.activeBosses.delete(bossId);
    }
  }

  getTrackedBoss(bossId) {
    if (!this.activeBosses || bossId == null) {
      return null;
    }

    return this.activeBosses.get(bossId) || null;
  }

  resolveBossReference(payload = {}) {
    if (payload && payload.enemy) {
      return payload.enemy;
    }

    const candidateId =
      payload?.enemyId ?? payload?.id ?? payload?.source?.id ?? payload?.bossId ?? null;

    if (candidateId != null) {
      return this.getTrackedBoss(candidateId);
    }

    return null;
  }

  registerEnemyWithPhysics(enemy) {
    const physics = this.getCachedPhysics();
    if (!physics || typeof physics.registerEnemy !== 'function') {
      return;
    }

    physics.registerEnemy(enemy);
  }

  unregisterEnemyFromPhysics(enemy) {
    const physics = this.getCachedPhysics();
    if (!physics || typeof physics.unregisterEnemy !== 'function') {
      return;
    }

    physics.unregisterEnemy(enemy);
  }

  removeActiveEnemy(enemy) {
    if (!enemy || !Array.isArray(this.asteroids)) {
      return false;
    }

    const index = this.asteroids.indexOf(enemy);
    if (index === -1) {
      return false;
    }

    this.asteroids.splice(index, 1);
    this.invalidateActiveEnemyCache();
    return true;
  }

  createInitialBossHudState() {
    return {
      active: false,
      upcoming: false,
      defeated: false,
      bossId: null,
      name: null,
      phase: 0,
      phaseCount: 0,
      health: 0,
      maxHealth: 0,
      wave: null,
      color: null,
      phaseColors: [],
      lastUpdate: null,
    };
  }

  emitBossHudUpdate(patch = null) {
    const timestamp = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

    if (!this.bossHudState) {
      this.bossHudState = this.createInitialBossHudState();
    }

    if (patch && typeof patch === 'object') {
      const next = { ...this.bossHudState, ...patch };
      if (patch.phaseColors && Array.isArray(patch.phaseColors)) {
        next.phaseColors = [...patch.phaseColors];
      }
      this.bossHudState = next;
    }

    if (!Array.isArray(this.bossHudState.phaseColors)) {
      this.bossHudState.phaseColors = [];
    }

    this.bossHudState.lastUpdate = timestamp;

    const ui = this.getCachedUI();
    if (ui) {
      if (typeof ui.updateBossHud === 'function') {
        ui.updateBossHud({ ...this.bossHudState });
      } else if (typeof ui.handleBossEvent === 'function') {
        ui.handleBossEvent('boss-hud-update', { ...this.bossHudState });
      }
    }

    this.emitBossSystemEvent('ui', 'boss-hud-update', { ...this.bossHudState });

    return this.bossHudState;
  }

  forwardBossEvent(eventName, payload = {}) {
    const eventData = { event: eventName, ...payload };

    const effects = this.getCachedEffects();
    if (effects) {
      if (typeof effects.handleBossEvent === 'function') {
        effects.handleBossEvent(eventName, eventData);
      } else if (typeof effects.onBossEvent === 'function') {
        effects.onBossEvent(eventName, eventData);
      } else if (typeof effects.enqueueBossEvent === 'function') {
        effects.enqueueBossEvent(eventName, eventData);
      } else {
        this.applyBossEffectsFallback(effects, eventName, eventData);
      }
    } else {
      this.applyBossEffectsFallback(null, eventName, eventData);
    }

    const audio = this.getCachedAudio();
    if (audio) {
      if (typeof audio.handleBossEvent === 'function') {
        audio.handleBossEvent(eventName, eventData);
      } else if (typeof audio.playBossEvent === 'function') {
        audio.playBossEvent(eventName, eventData);
      } else {
        this.applyBossAudioFallback(audio, eventName, eventData);
      }
    } else {
      this.applyBossAudioFallback(null, eventName, eventData);
    }

    const ui = this.getCachedUI();
    if (ui) {
      if (typeof ui.handleBossEvent === 'function') {
        ui.handleBossEvent(eventName, eventData);
      } else if (typeof ui.updateBossHud === 'function' && eventName !== 'boss-hud-update') {
        ui.updateBossHud({ ...this.bossHudState, ...eventData });
      }
    }

    this.emitBossSystemEvent('effects', eventName, eventData);
    this.emitBossSystemEvent('audio', eventName, eventData);
    this.emitBossSystemEvent('ui', eventName, eventData);
    this.emitBossSystemEvent('boss', eventName, eventData);
  }

  applyBossEffectsFallback(effects, eventName, payload) {
    const target = effects || this.getCachedEffects();

    if (!target) {
      return;
    }

    const flash = typeof target.addScreenFlash === 'function' ? target.addScreenFlash.bind(target) : null;
    const shake = typeof target.addScreenShake === 'function' ? target.addScreenShake.bind(target) : null;
    const shockwave = typeof target.createShockwaveEffect === 'function'
      ? target.createShockwaveEffect.bind(target)
      : null;

    switch (eventName) {
      case 'boss-wave-started':
        if (flash) {
          flash('rgba(255, 140, 0, 0.25)', 0.35, 0.2);
        }
        break;
      case 'boss-spawned':
        if (shake) {
          shake(14, 0.55);
        }
        if (flash) {
          flash('rgba(255, 80, 80, 0.35)', 0.45, 0.3);
        }
        break;
      case 'boss-phase-changed':
        if (flash) {
          flash('rgba(255, 255, 255, 0.25)', 0.25, 0.18);
        }
        break;
      case 'boss-defeated':
        if (shake) {
          shake(18, 0.75);
        }
        if (flash) {
          flash('rgba(255, 215, 0, 0.45)', 0.5, 0.45);
        }
        if (shockwave) {
          const enemy = payload?.enemy;
          const position = payload?.position || (enemy
            ? { x: enemy.x ?? 0, y: enemy.y ?? 0 }
            : null);
          if (position) {
            shockwave({
              position,
              radius: Math.max(240, (enemy?.radius || 60) * 3),
              color: 'rgba(255, 200, 80, 0.55)',
            });
          }
        }
        break;
      default:
        break;
    }
  }

  applyBossAudioFallback(audio, eventName, payload) {
    const target = audio || this.getCachedAudio();
    if (!target) {
      return;
    }

    switch (eventName) {
      case 'boss-wave-started':
        if (typeof target.playShieldShockwave === 'function') {
          target.playShieldShockwave();
        } else if (typeof target.playGoldSpawn === 'function') {
          target.playGoldSpawn();
        }
        break;
      case 'boss-spawned':
        if (typeof target.playGoldSpawn === 'function') {
          target.playGoldSpawn(payload?.enemy);
        } else if (typeof target.playBigExplosion === 'function') {
          target.playBigExplosion();
        }
        break;
      case 'boss-phase-changed':
        if (typeof target.playShieldActivate === 'function') {
          target.playShieldActivate();
        } else if (typeof target.playTargetLock === 'function') {
          target.playTargetLock(payload || {});
        }
        break;
      case 'boss-defeated':
        if (typeof target.playBigExplosion === 'function') {
          target.playBigExplosion();
        } else if (typeof target.playGoldJackpot === 'function') {
          target.playGoldJackpot();
        }
        break;
      default:
        break;
    }
  }

  emitBossSystemEvent(channel, eventName, payload) {
    const bus = this.eventBus || (typeof gameEvents !== 'undefined' ? gameEvents : null);
    if (!bus || !eventName || !channel) {
      return;
    }

    bus.emit(`${channel}-${eventName}`, payload);
  }

  mergeBossRewards(boss, override = {}) {
    const baseRewards = boss && boss.rewards && typeof boss.rewards === 'object'
      ? { ...boss.rewards }
      : {};

    if (override && typeof override === 'object') {
      if (override.xp != null) {
        baseRewards.xp = override.xp;
      }

      if (Array.isArray(override.lootTable)) {
        baseRewards.lootTable = [...override.lootTable];
      }
    }

    return baseRewards;
  }

  dropBossRewards(boss, rewards = {}) {
    if (!boss) {
      return;
    }

    const mergedRewards = this.mergeBossRewards(boss, rewards);
    const xpReward = Number.isFinite(mergedRewards.xp) ? mergedRewards.xp : 0;

    if (xpReward > 0) {
      this.spawnBossXPOrbs(boss, xpReward);
    }

    if (
      this.rewardManager &&
      this.rewardManager.rewardConfigs &&
      typeof this.rewardManager.rewardConfigs.has === 'function' &&
      this.rewardManager.rewardConfigs.has('boss') &&
      typeof this.rewardManager.dropRewards === 'function'
    ) {
      this.rewardManager.dropRewards(boss);
    } else if (
      this.rewardManager &&
      typeof this.rewardManager.createMilestoneReward === 'function'
    ) {
      this.rewardManager.createMilestoneReward(boss.x ?? 0, boss.y ?? 0, 'boss_kill');
    }

    if (Array.isArray(mergedRewards.lootTable) && mergedRewards.lootTable.length > 0) {
      this.emitBossSystemEvent('boss', 'loot-dropped', {
        enemy: boss,
        loot: [...mergedRewards.lootTable],
        wave: boss.wave ?? this.waveState?.current ?? null,
      });
    }

    return mergedRewards;
  }

  spawnBossXPOrbs(boss, xpAmount) {
    if (!boss || !Number.isFinite(xpAmount) || xpAmount <= 0) {
      return;
    }

    const xpOrbs = this.getCachedXPOrbs();
    if (!xpOrbs || typeof xpOrbs.createXPOrb !== 'function') {
      return;
    }

    const baseValue = CONSTANTS.ORB_VALUE || 5;
    const safeBaseValue = Math.max(1, baseValue);
    const orbCount = Math.max(1, Math.round(xpAmount / safeBaseValue));
    const valuePerOrb = Math.max(1, Math.floor(xpAmount / orbCount));
    let remainder = Math.max(0, Math.round(xpAmount - valuePerOrb * orbCount));

    const radius = Math.max(80, (boss.radius || 60) + 24);
    const originX = boss.x ?? 0;
    const originY = boss.y ?? 0;

    for (let i = 0; i < orbCount; i += 1) {
      const angle = (Math.PI * 2 * i) / orbCount;
      let value = valuePerOrb;
      if (remainder > 0) {
        value += 1;
        remainder -= 1;
      }

      const x = originX + Math.cos(angle) * radius;
      const y = originY + Math.sin(angle) * radius;

      try {
        xpOrbs.createXPOrb(x, y, value, {
          source: 'boss-reward',
          special: true,
          clusterId: boss.id ? `boss-${boss.id}` : 'boss-reward',
        });
      } catch (error) {
        console.warn('[EnemySystem] Failed to create boss XP orb', error);
        break;
      }
    }
  }

  normalizeEnemyProjectilePayload(data = {}) {
    const payload = { ...data };

    if (payload.enemy == null) {
      const resolvedBoss = this.resolveBossReference(payload);
      if (resolvedBoss) {
        payload.enemy = resolvedBoss;
      }
    }

    const source = payload.source ? { ...payload.source } : {};
    if (!source.id && payload.enemy?.id != null) {
      source.id = payload.enemy.id;
    }
    if (!source.type && payload.enemy?.type) {
      source.type = payload.enemy.type;
    }
    if (!source.wave && (payload.wave || payload.enemy?.wave)) {
      source.wave = payload.wave ?? payload.enemy?.wave ?? null;
    }
    if (Object.keys(source).length) {
      payload.source = source;
    }

    payload.enemyId = payload.enemyId ?? payload.enemy?.id ?? source.id ?? null;
    payload.enemyType = payload.enemyType || payload.enemy?.type || source.type || null;

    const projectile = payload.projectile && typeof payload.projectile === 'object'
      ? { ...payload.projectile }
      : {};

    const meta = {
      ...(projectile.meta && typeof projectile.meta === 'object' ? projectile.meta : {}),
      ...(payload.meta && typeof payload.meta === 'object' ? payload.meta : {}),
    };

    if (meta.pattern == null && projectile.pattern) {
      meta.pattern = projectile.pattern;
    }

    if (meta.phase == null && typeof payload.phase === 'number') {
      meta.phase = payload.phase;
    }

    projectile.meta = { ...meta };
    payload.projectile = projectile;
    payload.meta = { ...meta };

    return payload;
  }

  isBossProjectile(payload) {
    if (!payload) {
      return false;
    }

    const enemyType = typeof payload.enemyType === 'string' ? payload.enemyType.toLowerCase() : null;
    if (enemyType === 'boss') {
      return true;
    }

    const sourceType = typeof payload.source?.type === 'string' ? payload.source.type.toLowerCase() : null;
    if (sourceType === 'boss') {
      return true;
    }

    if (payload.enemy && this.isBossEnemy(payload.enemy)) {
      return true;
    }

    if (payload.projectile?.pattern) {
      return true;
    }

    if (payload.meta && (payload.meta.pattern || payload.meta.phase != null || payload.meta.stage != null)) {
      return true;
    }

    return false;
  }

  invalidateActiveEnemyCache() {
    this.activeEnemyCacheDirty = true;
  }

  rebuildActiveEnemyCache() {
    if (!this.activeEnemyCacheDirty) {
      return;
    }

    if (!Array.isArray(this.activeEnemyCache)) {
      this.activeEnemyCache = [];
    }

    this.activeEnemyCache.length = 0;

    for (let i = 0; i < this.asteroids.length; i += 1) {
      const asteroid = this.asteroids[i];
      if (asteroid && !asteroid.destroyed) {
        this.activeEnemyCache.push(asteroid);
      }
    }

    this.activeEnemyCacheDirty = false;
  }

  forEachActiveEnemy(callback) {
    if (typeof callback !== 'function') {
      return;
    }

    for (let i = 0; i < this.asteroids.length; i += 1) {
      const asteroid = this.asteroids[i];
      if (asteroid && !asteroid.destroyed) {
        callback(asteroid);
      }
    }
  }

  // Backward compatibility with legacy API
  forEachActiveAsteroid(callback) {
    if (
      typeof process !== 'undefined' &&
      process?.env?.NODE_ENV === 'development'
    ) {
      console.warn(
        '[EnemySystem] forEachActiveAsteroid is deprecated. Use forEachActiveEnemy instead.'
      );
    }

    this.forEachActiveEnemy(callback);
  }

  createInitialWaveState() {
    return {
      current: 1,
      totalAsteroids: CONSTANTS.ASTEROIDS_PER_WAVE_BASE,
      asteroidsSpawned: 0,
      asteroidsKilled: 0,
      isActive: true,
      breakTimer: 0,
      completedWaves: 0,
      timeRemaining: CONSTANTS.WAVE_DURATION,
      spawnTimer: 0,
      spawnDelay: 1.0,
      initialSpawnDone: false,
    };
  }

  createInitialSessionStats() {
    return {
      totalKills: 0,
      timeElapsed: 0,
    };
  }

  emitWaveStateUpdate(force = false) {
    if (typeof gameEvents === 'undefined') {
      return;
    }

    const wave = this.waveState
      ? {
          current: this.waveState.current,
          totalAsteroids: this.waveState.totalAsteroids,
          asteroidsKilled: this.waveState.asteroidsKilled,
          isActive: Boolean(this.waveState.isActive),
          breakTimer: Math.max(0, this.waveState.breakTimer),
          completedWaves: this.waveState.completedWaves,
          timeRemaining: Math.max(0, this.waveState.timeRemaining),
        }
      : null;

    const session = this.sessionStats
      ? {
          totalKills: this.sessionStats.totalKills,
          timeElapsed: this.sessionStats.timeElapsed,
        }
      : null;

    const snapshot = {
      current: wave?.current ?? 0,
      totalAsteroids: wave?.totalAsteroids ?? 0,
      asteroidsKilled: wave?.asteroidsKilled ?? 0,
      isActive: wave?.isActive ?? false,
      timeRemainingSeconds: wave?.isActive
        ? Math.max(0, Math.ceil(wave?.timeRemaining ?? 0))
        : 0,
      breakTimerSeconds: !wave?.isActive
        ? Math.max(0, Math.ceil(wave?.breakTimer ?? 0))
        : 0,
      completedWaves: wave?.completedWaves ?? 0,
      totalKills: session?.totalKills ?? 0,
      sessionTimeSeconds: session
        ? Math.max(0, Math.floor(session.timeElapsed ?? 0))
        : 0,
    };

    if (!force && this.lastWaveBroadcast) {
      const prev = this.lastWaveBroadcast;
      const unchanged =
        prev.current === snapshot.current &&
        prev.totalAsteroids === snapshot.totalAsteroids &&
        prev.asteroidsKilled === snapshot.asteroidsKilled &&
        prev.isActive === snapshot.isActive &&
        prev.timeRemainingSeconds === snapshot.timeRemainingSeconds &&
        prev.breakTimerSeconds === snapshot.breakTimerSeconds &&
        prev.completedWaves === snapshot.completedWaves &&
        prev.totalKills === snapshot.totalKills &&
        prev.sessionTimeSeconds === snapshot.sessionTimeSeconds;

      if (unchanged) {
        return;
      }
    }

    this.lastWaveBroadcast = snapshot;

    gameEvents.emit('wave-state-updated', {
      wave,
      session,
    });
  }

  // === UPDATE PRINCIPAL ===
  update(deltaTime) {
    if (!this.sessionActive) {
      return;
    }

    this.refreshInjectedServices();

    const overrideValue =
      typeof globalThis !== 'undefined'
        ? globalThis.__USE_WAVE_MANAGER_OVERRIDE__
        : undefined;

    const constantsFlag =
      typeof CONSTANTS?.USE_WAVE_MANAGER === 'boolean'
        ? CONSTANTS.USE_WAVE_MANAGER
        : false;

    let waveManagerEnabled = constantsFlag;
    if (overrideValue === true) {
      waveManagerEnabled = true;
    } else if (overrideValue === false) {
      waveManagerEnabled = false;
    }

    if (!this._waveSystemDebugLogged) {
      console.debug(
        `[EnemySystem] Wave system: ${waveManagerEnabled ? 'WaveManager' : 'Legacy'}`
      );
      this._waveSystemDebugLogged = true;
    }

    this._waveManagerRuntimeEnabled = waveManagerEnabled;

    const waveManagerHandlesSpawnFlag =
      (CONSTANTS.WAVEMANAGER_HANDLES_ASTEROID_SPAWN ?? false) &&
      this._waveManagerRuntimeEnabled;
    const waveManagerControlsSpawn = Boolean(
      waveManagerHandlesSpawnFlag && this.waveManager
    );

    if (!this._asteroidSpawnDebugLogged) {
      console.debug(
        `[EnemySystem] Asteroid spawn: ${
          waveManagerControlsSpawn ? 'WaveManager' : 'Legacy handleSpawning()'
        }`
      );
      this._asteroidSpawnDebugLogged = true;
    }

    this.sessionStats.timeElapsed += deltaTime;

    // FEATURE FLAG: Roteamento entre sistema legado e WaveManager
    if (waveManagerEnabled) {
      if (!waveManagerControlsSpawn) {
        this.handleSpawning(deltaTime);
      }

      this.updateWaveManagerLogic(deltaTime);
      this.updateAsteroids(deltaTime);
    } else {
      this.updateAsteroids(deltaTime);
      this.updateWaveLogic(deltaTime);
    }
    this.cleanupDestroyed();

    this.emitWaveStateUpdate();
  }

  updateWaveLogic(deltaTime) {
    const wave = this.waveState;

    if (!wave) return;

    const waveManagerHandlesSpawn =
      (CONSTANTS.WAVEMANAGER_HANDLES_ASTEROID_SPAWN ?? false) &&
      this._waveManagerRuntimeEnabled &&
      this.waveManager &&
      !this._waveManagerFallbackWarningIssued &&
      !this._waveManagerInvalidStateWarningIssued;

    if (wave.isActive) {
      wave.timeRemaining = Math.max(0, wave.timeRemaining - deltaTime);
      if (!waveManagerHandlesSpawn) {
        this.handleSpawning(deltaTime);
      }

      const allAsteroidsKilled =
        wave.asteroidsKilled >= wave.totalAsteroids &&
        this.getActiveEnemyCount() === 0;

      if (wave.timeRemaining <= 0 || allAsteroidsKilled) {
        this.completeCurrentWave();
      }
    } else if (wave.breakTimer > 0) {
      wave.breakTimer = Math.max(0, wave.breakTimer - deltaTime);

      if (wave.breakTimer === 0) {
        this.startNextWave();
      }
    }
  }

  // EXPERIMENTAL: Delegação para WaveManager com sincronização de estado (docs/plans/phase1-enemy-foundation-plan.md)
  updateWaveManagerLogic(deltaTime) {
    const wave = this.waveState;

    if (!wave) {
      return;
    }

    if (!this.waveManager) {
      if (!this._waveManagerFallbackWarningIssued) {
        console.warn(
          '[EnemySystem] WaveManager indisponível. Recuando para updateWaveLogic() enquanto USE_WAVE_MANAGER está ativo.'
        );
        this._waveManagerFallbackWarningIssued = true;
      }
      this.updateWaveLogic(deltaTime);
      return;
    }

    this.waveManager.update(deltaTime);

    const managerState = this.waveManager.getState ? this.waveManager.getState() : null;

    const managerStateValid =
      managerState &&
      managerState.currentWave !== undefined &&
      managerState.inProgress !== undefined &&
      managerState.spawned !== undefined &&
      managerState.killed !== undefined &&
      managerState.total !== undefined;

    if (!managerStateValid) {
      if (!this._waveManagerInvalidStateWarningIssued) {
        console.warn(
          '[EnemySystem] WaveManager returned invalid state. Falling back to updateWaveLogic() while USE_WAVE_MANAGER is active.'
        );
        this._waveManagerInvalidStateWarningIssued = true;
      }
      this.updateWaveLogic(deltaTime);
      return;
    }

    const {
      current: previousCurrent,
      isActive: previousIsActive,
      asteroidsSpawned: previousSpawned,
      asteroidsKilled: previousKilled,
      totalAsteroids: previousTotal,
    } = wave;

    wave.current = managerState.currentWave ?? previousCurrent;
    wave.isActive = managerState.inProgress ?? previousIsActive;
    const waveManagerHandlesAsteroids =
      (CONSTANTS.WAVEMANAGER_HANDLES_ASTEROID_SPAWN ?? false) &&
      this._waveManagerRuntimeEnabled;
    const legacyCompatibilityEnabled =
      (CONSTANTS.PRESERVE_LEGACY_SIZE_DISTRIBUTION ?? true) &&
      waveManagerHandlesAsteroids;

    const totals = managerState.totals || {};
    const counts = managerState.counts || {};
    const spawnedBreakdown = counts.spawned || {};
    const killedBreakdown = counts.killed || {};

    const selectManagerValue = (value, fallback) =>
      Number.isFinite(value) ? value : fallback;

    let nextSpawned = previousSpawned;
    let nextTotal = previousTotal;
    let nextKilled = previousKilled;

    if (waveManagerHandlesAsteroids) {
      const managerSpawnedValue = legacyCompatibilityEnabled
        ? spawnedBreakdown.asteroids ?? managerState.spawned
        : managerState.spawned;
      const managerTotalValue = legacyCompatibilityEnabled
        ? totals.asteroids ?? managerState.total
        : managerState.total;

      nextSpawned = selectManagerValue(managerSpawnedValue, previousSpawned);
      nextTotal = selectManagerValue(managerTotalValue, previousTotal);

      wave.asteroidsSpawned = nextSpawned;
      wave.totalAsteroids = nextTotal;
    }

    const managerKilledValue = legacyCompatibilityEnabled
      ? killedBreakdown.asteroids ?? managerState.killed
      : managerState.killed;
    const shouldSyncKilledCount = true; // WaveManager derives kills from enemy-destroyed events

    if (shouldSyncKilledCount) {
      nextKilled = selectManagerValue(managerKilledValue, previousKilled);
      wave.asteroidsKilled = nextKilled;
    }

    const stateChanged =
      wave.current !== previousCurrent ||
      wave.isActive !== previousIsActive ||
      (shouldSyncKilledCount && nextKilled !== previousKilled);

    if (stateChanged) {
      console.debug(
        `[EnemySystem] WaveManager state synced: wave ${wave.current}, ${wave.asteroidsKilled}/${wave.totalAsteroids} enemies, active=${wave.isActive}`
      );
    }

    // WAVE-004: Validação de consistência em desenvolvimento
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      const managerKilled = managerState.killed ?? 0;
      const systemKilled = wave.asteroidsKilled ?? 0;
      if (Math.abs(managerKilled - systemKilled) > 1) {
        console.warn(
          `[EnemySystem] Kill count mismatch: WaveManager=${managerKilled}, waveState=${systemKilled}`
        );
      }
    }
  }

  handleWaveManagerWaveComplete(data = {}) {
    if (!this.waveState) {
      return;
    }

    const waveNumberCandidate = Number(data.wave);
    if (Number.isFinite(waveNumberCandidate) && waveNumberCandidate > 0) {
      this.waveState.current = waveNumberCandidate;
    }

    const breakDuration = Number(CONSTANTS.WAVE_BREAK_TIME) || 0;

    this.waveState.isActive = false;
    this.waveState.breakTimer = breakDuration;
    this.waveState.timeRemaining = 0;
    this.waveState.spawnTimer = 0;
    this.waveState.initialSpawnDone = false;

    if (
      this.waveManager &&
      Number.isFinite(Number(this.waveManager.totalEnemiesThisWave))
    ) {
      this.waveState.totalAsteroids = Number(this.waveManager.totalEnemiesThisWave);
    }

    if (!Number.isFinite(Number(this.waveState.asteroidsSpawned))) {
      this.waveState.asteroidsSpawned = 0;
    }

    this.waveState.asteroidsSpawned = Math.max(
      Number(this.waveState.asteroidsSpawned) || 0,
      Number(this.waveState.totalAsteroids) || 0
    );

    const possibleKilledValues = [];
    const payloadKilled = Number(data.enemiesKilled);
    if (Number.isFinite(payloadKilled)) {
      possibleKilledValues.push(payloadKilled);
    }

    if (
      this.waveManager &&
      Number.isFinite(Number(this.waveManager.enemiesKilledThisWave))
    ) {
      possibleKilledValues.push(Number(this.waveManager.enemiesKilledThisWave));
    }

    if (Number.isFinite(Number(this.waveState.asteroidsKilled))) {
      possibleKilledValues.push(Number(this.waveState.asteroidsKilled));
    }

    if (Number.isFinite(Number(this.waveState.totalAsteroids))) {
      possibleKilledValues.push(Number(this.waveState.totalAsteroids));
    }

    if (possibleKilledValues.length > 0) {
      this.waveState.asteroidsKilled = Math.max(...possibleKilledValues);
    }

    this.waveState.completedWaves = (this.waveState.completedWaves || 0) + 1;

    this.grantWaveRewards();

    this.emitWaveStateUpdate(true);
  }

  // === GERENCIAMENTO DE ASTEROIDES ===
  updateAsteroids(deltaTime) {
    // NEW: Use movement component if enabled
    if (this.useComponents && this.movementComponent) {
      // Build context for movement component
      const context = {
        player: this.getCachedPlayer(),
        worldBounds: {
          width: CONSTANTS.GAME_WIDTH,
          height: CONSTANTS.GAME_HEIGHT
        }
      };

      // Update each asteroid using component
      this.asteroids.forEach((asteroid) => {
        if (!asteroid.destroyed) {
          // Component handles movement
          this.movementComponent.update(asteroid, deltaTime, context);

          // Asteroid handles its own state updates (non-movement)
          asteroid.updateVisualState(deltaTime);

          // Volatile behavior (timer, not movement)
          if (asteroid.behavior?.type === 'volatile') {
            asteroid.updateVolatileBehavior(deltaTime);
          }

          // Timers
          if (asteroid.lastDamageTime > 0) {
            asteroid.lastDamageTime = Math.max(0, asteroid.lastDamageTime - deltaTime);
          }
          if (asteroid.shieldHitCooldown > 0) {
            asteroid.shieldHitCooldown = Math.max(0, asteroid.shieldHitCooldown - deltaTime);
          }
        }
      });
    } else {
      // LEGACY: Asteroids handle their own update
      this.asteroids.forEach((asteroid) => {
        if (!asteroid.destroyed) {
          asteroid.update(deltaTime);
        }
      });
    }

    // Física de colisão entre asteroides (always enabled)
    this.handleAsteroidCollisions();
  }

  handleAsteroidCollisions() {
    // NEW: Use collision component if available
    if (this.useComponents && this.collisionComponent) {
      this.collisionComponent.handleAsteroidCollisions(this.asteroids);
    } else {
      // LEGACY: Original collision logic
      for (let i = 0; i < this.asteroids.length - 1; i++) {
        const a1 = this.asteroids[i];
        if (a1.destroyed) continue;

        for (let j = i + 1; j < this.asteroids.length; j++) {
          const a2 = this.asteroids[j];
          if (a2.destroyed) continue;

          this.checkAsteroidCollision(a1, a2);
        }
      }
    }
  }

  checkAsteroidCollision(a1, a2) {
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

      // Impulso elástico com massa
      const rvx = a2.vx - a1.vx;
      const rvy = a2.vy - a1.vy;
      const velAlongNormal = rvx * nx + rvy * ny;

      if (velAlongNormal < 0) {
        const e = CONSTANTS.COLLISION_BOUNCE;
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

      // Rotação adicional
      const collisionRandom =
        (typeof a1?.getRandomFor === 'function' && a1.getRandomFor('collision')) ||
        (typeof a2?.getRandomFor === 'function' && a2.getRandomFor('collision')) ||
        this.getRandomScope('fragments');
      const rotationSource =
        collisionRandom || this.getRandomScope('fragments') || this.getRandomService();
      const rotationDelta =
        rotationSource && typeof rotationSource.range === 'function'
          ? rotationSource.range(-0.75, 0.75)
          : (rotationSource.float() - 0.5) * 1.5;
      a1.rotationSpeed += rotationDelta;
      a2.rotationSpeed += rotationDelta;
    }
  }

  // === SISTEMA DE SPAWNING ===
  handleSpawning(deltaTime) {
    // LEGACY: Used when WAVEMANAGER_HANDLES_ASTEROID_SPAWN=false
    const wave = this.waveState;
    if (!wave || !wave.isActive) {
      return;
    }

    this.spawnTimer -= deltaTime;

    if (this.shouldSpawn() && this.spawnTimer <= 0) {
      this.spawnAsteroid();
      const spawnRandom = this.getRandomScope('spawn') || this.getRandomService();
      const delayMultiplier =
        spawnRandom && typeof spawnRandom.range === 'function'
          ? spawnRandom.range(0.5, 1)
          : 0.5 + spawnRandom.float() * 0.5;
      this.spawnTimer = wave.spawnDelay * delayMultiplier;
    }
  }

  shouldSpawn() {
    const wave = this.waveState;
    if (!wave || !wave.isActive) {
      return false;
    }

    return (
      wave.asteroidsSpawned < wave.totalAsteroids &&
      this.getActiveEnemyCount() < CONSTANTS.MAX_ASTEROIDS_ON_SCREEN
    );
  }

  spawnBoss(config = {}) {
    const waveNumber = Number.isFinite(config.wave)
      ? config.wave
      : this.waveState?.current ?? 1;

    const scopeLabel = config.randomScope || 'boss-spawn';
    const spawnContext = this.createScopedRandom(scopeLabel, `boss-${waveNumber}`);
    const spawnRandom =
      config.random || spawnContext.random || this.getRandomScope(scopeLabel) || this.getRandomService();

    const spawnConfig = {
      ...config,
      wave: waveNumber,
      random: spawnRandom,
      randomScope: scopeLabel,
      randomParentScope: config.randomParentScope || 'spawn',
    };

    let boss = null;

    if (this.useFactory && this.factory && typeof this.factory.hasType === 'function') {
      if (this.factory.hasType('boss')) {
        boss = this.acquireEnemyViaFactory('boss', spawnConfig);
      }
    } else if (this.useFactory && this.factory) {
      boss = this.acquireEnemyViaFactory('boss', spawnConfig);
    }

    if (!boss) {
      try {
        boss = new BossEnemy(this, spawnConfig);
        this.assignAsteroidPoolId(boss, spawnConfig.poolId);
        this.registerActiveEnemy(boss, { skipDuplicateCheck: true });
      } catch (error) {
        console.error('[EnemySystem] Failed to instantiate boss enemy', error);
        return null;
      }
    }

    if (!boss) {
      console.warn('[EnemySystem] Boss spawn failed: no instance created');
      return null;
    }

    boss.destroyed = false;

    if (this.waveState && this.waveState.isActive && config?.skipWaveAccounting !== true) {
      this.waveState.totalAsteroids += 1;
      this.waveState.asteroidsSpawned += 1;
    }

    const payload = {
      enemy: boss,
      wave: waveNumber,
      config: spawnConfig,
      rewards: this.mergeBossRewards(boss, spawnConfig.rewards || {}),
      position: { x: boss.x ?? 0, y: boss.y ?? 0 },
    };

    if (typeof gameEvents !== 'undefined' && typeof gameEvents.emit === 'function') {
      gameEvents.emit('boss-spawned', payload);
    } else {
      this.handleBossSpawned(payload);
    }

    return boss;
  }

  spawnAsteroid() {
    if (!this.sessionActive) return null;

    const spawnContext = this.createScopedRandom('spawn', 'asteroid-spawn');
    const globalRandom = this.getRandomService();
    const spawnRandom =
      spawnContext.random || this.getRandomScope('spawn') || globalRandom;
    const floatRandom =
      spawnRandom && typeof spawnRandom.float === 'function' ? spawnRandom : globalRandom;
    const side =
      spawnRandom && typeof spawnRandom.int === 'function'
        ? spawnRandom.int(0, 3)
        : Math.floor(floatRandom.float() * 4);
    let x;
    let y;
    const margin =
      typeof CONSTANTS.ASTEROID_EDGE_SPAWN_MARGIN === 'number'
        ? CONSTANTS.ASTEROID_EDGE_SPAWN_MARGIN
        : 80;

    switch (side) {
      case 0:
        x =
          spawnRandom && typeof spawnRandom.range === 'function'
            ? spawnRandom.range(0, CONSTANTS.GAME_WIDTH)
            : floatRandom.float() * CONSTANTS.GAME_WIDTH;
        y = -margin;
        break;
      case 1:
        x = CONSTANTS.GAME_WIDTH + margin;
        y =
          spawnRandom && typeof spawnRandom.range === 'function'
            ? spawnRandom.range(0, CONSTANTS.GAME_HEIGHT)
            : floatRandom.float() * CONSTANTS.GAME_HEIGHT;
        break;
      case 2:
        x =
          spawnRandom && typeof spawnRandom.range === 'function'
            ? spawnRandom.range(0, CONSTANTS.GAME_WIDTH)
            : floatRandom.float() * CONSTANTS.GAME_WIDTH;
        y = CONSTANTS.GAME_HEIGHT + margin;
        break;
      default:
        x = -margin;
        y =
          spawnRandom && typeof spawnRandom.range === 'function'
            ? spawnRandom.range(0, CONSTANTS.GAME_HEIGHT)
            : floatRandom.float() * CONSTANTS.GAME_HEIGHT;
        break;
    }

    let size;
    const rand = floatRandom.float();
    if (rand < 0.5) size = 'large';
    else if (rand < 0.8) size = 'medium';
    else size = 'small';

    const waveNumber = this.waveState?.current || 1;
    const variant = this.decideVariant(size, {
      wave: waveNumber,
      spawnType: 'spawn',
      random: this.getRandomScope('variants'),
    });

    const asteroidRandom = spawnRandom?.fork
      ? spawnRandom.fork('asteroid-core')
      : null;

    const asteroid = this.acquireAsteroid({
      x,
      y,
      size,
      variant,
      wave: waveNumber,
      random: asteroidRandom,
      randomScope: 'spawn',
    });

    this.registerActiveEnemy(asteroid);

    if (this.waveState && this.waveState.isActive) {
      this.waveState.asteroidsSpawned += 1;
    }

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('enemy-spawned', {
        enemy: asteroid,
        type: 'asteroid',
        size,
        variant,
        wave: waveNumber,
        maxHealth: asteroid.maxHealth,
        position: { x, y },
      });
    }

    return asteroid;
  }

  applyDamage(asteroid, damage, options = {}) {
    if (!asteroid || typeof asteroid.takeDamage !== 'function') {
      return { killed: false, remainingHealth: 0, fragments: [] };
    }

    if (asteroid.destroyed) {
      return { killed: false, remainingHealth: 0, fragments: [] };
    }

    const killed = asteroid.takeDamage(damage);
    const remainingHealth = Math.max(0, asteroid.health);

    if (killed) {
      const fragments = this.destroyAsteroid(asteroid, {
        cause: options.cause || 'damage',
        createFragments: options.createFragments !== false,
        triggerExplosion: options.triggerExplosion,
      });
      return { killed: true, remainingHealth: 0, fragments };
    }

    return { killed: false, remainingHealth, fragments: [] };
  }

  // === GERENCIAMENTO DE DESTRUIÇÃO ===
  destroyAsteroid(asteroid, options = {}) {
    if (!asteroid || asteroid.destroyed) return [];

    const waveNumber = this.waveState?.current || asteroid.wave || 1;
    const createFragments = options.createFragments !== false;

    asteroid.destroyed = true;
        this.invalidateActiveEnemyCache();

      const fragmentDescriptors = createFragments
      ? asteroid.generateFragments()
      : [];
    const fragments = [];

    if (fragmentDescriptors.length > 0) {
      const fragmentVariants = this.assignVariantsToFragments(
        fragmentDescriptors,
        asteroid,
        waveNumber
      );

      fragmentDescriptors.forEach((descriptor, index) => {
        const fragmentRandom = this.createScopedRandom('fragments', 'fragment');
        const fragment = this.acquireAsteroid({
          ...descriptor,
          variant: fragmentVariants[index],
          wave: descriptor.wave || waveNumber,
          random: fragmentRandom.random,
          randomScope: 'fragments',
        });
        this.registerActiveEnemy(fragment);
        fragments.push(fragment);
      });

      if (this.waveState && this.waveState.isActive) {
        this.waveState.totalAsteroids += fragments.length;
        this.waveState.asteroidsSpawned += fragments.length;
      }
    }

    if (this.waveState) {
      this.waveState.asteroidsKilled += 1;
    }

    this.sessionStats.totalKills += 1;

    const shouldExplode =
      options.triggerExplosion === true ||
      (options.triggerExplosion !== false && this.isVolatileVariant(asteroid));

    if (shouldExplode) {
      this.triggerVolatileExplosion(asteroid, options.cause || 'destroyed');
    }

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('enemy-destroyed', {
        enemy: asteroid,
        fragments,
        position: { x: asteroid.x, y: asteroid.y },
        size: asteroid.size,
        variant: asteroid.variant,
        maxHealth: asteroid.maxHealth,
        cause: options.cause || 'destroyed',
        wave: waveNumber,
        spawnedBy: asteroid.spawnedBy,
      });
    }

    this.emitWaveStateUpdate();

    if (this.waveState && this.waveState.isActive) {
      const allAsteroidsKilled =
        this.waveState.asteroidsKilled >= this.waveState.totalAsteroids &&
        this.getActiveEnemyCount() === 0;

      const usingWaveManager =
        this.useManagers && Boolean(CONSTANTS?.USE_WAVE_MANAGER) && this.waveManager;

      if (!usingWaveManager && allAsteroidsKilled && this.waveState.timeRemaining > 0) {
        this.completeCurrentWave();
      }
    }

    return fragments;
  }

  decideVariant(size, context = {}) {
    if (context.forcedVariant) {
      return context.forcedVariant;
    }

    const chanceConfig = CONSTANTS.ASTEROID_VARIANT_CHANCES || {};
    const variantConfig = CONSTANTS.ASTEROID_VARIANTS || {};
    const info = chanceConfig[size];

    if (!info) {
      return 'common';
    }

    const wave = context.wave ?? this.waveState?.current ?? 1;
    let chance = info.baseChance ?? 0;
    chance += this.computeVariantWaveBonus(wave);
    chance = Math.min(Math.max(chance, 0), 1);

    const distribution = { ...(info.distribution || {}) };

    Object.keys(distribution).forEach((key) => {
      const variant = variantConfig[key];
      const allowedSizes = variant?.allowedSizes;
      const minWave = variant?.availability?.minWave;

      const sizeAllowed =
        !Array.isArray(allowedSizes) || allowedSizes.includes(size);
      const waveAllowed = typeof minWave !== 'number' || wave >= minWave;
      const disallowed =
        Array.isArray(context.disallowedVariants) &&
        context.disallowedVariants.includes(key);

      if (!variant || !sizeAllowed || !waveAllowed || disallowed) {
        delete distribution[key];
      }
    });

    const availableKeys = Object.keys(distribution);
    const variantRandom =
      context.random || this.getRandomScope('variants') || this.getRandomService();
    const shouldRoll =
      variantRandom && typeof variantRandom.chance === 'function'
        ? variantRandom.chance(chance)
        : variantRandom.float() <= chance;

    if (!availableKeys.length || !shouldRoll) {
      return 'common';
    }

    const totalWeight = availableKeys.reduce(
      (sum, key) => sum + (distribution[key] ?? 0),
      0
    );

    if (totalWeight <= 0) {
      return 'common';
    }

    let roll;
    if (variantRandom && typeof variantRandom.range === 'function') {
      roll = variantRandom.range(0, totalWeight);
    } else {
      roll = variantRandom.float() * totalWeight;
    }
    for (let i = 0; i < availableKeys.length; i += 1) {
      const key = availableKeys[i];
      roll -= distribution[key];
      if (roll <= 0) {
        return key;
      }
    }

    return availableKeys[availableKeys.length - 1] || 'common';
  }

  computeVariantWaveBonus(wave) {
    const config = CONSTANTS.ASTEROID_VARIANT_CHANCES?.waveBonus;
    if (!config) return 0;

    const startWave = config.startWave ?? Infinity;
    if (wave < startWave) {
      return 0;
    }

    const increment = config.increment ?? 0;
    const maxBonus = config.maxBonus ?? 0;
    const extraWaves = Math.max(0, wave - startWave + 1);
    return Math.min(maxBonus, extraWaves * increment);
  }

  assignVariantsToFragments(fragments, parent, wave) {
    if (!Array.isArray(fragments) || fragments.length === 0) {
      return [];
    }

    const variants = new Array(fragments.length).fill('common');
    const variantRandom = this.getRandomScope('variants') || this.getRandomService();

    if (parent?.size === 'large') {
      const denseChance = Math.min(1, 0.3 + this.computeVariantWaveBonus(wave));
      const shouldApplyDense =
        variantRandom && typeof variantRandom.chance === 'function'
          ? variantRandom.chance(denseChance)
          : variantRandom.float() < denseChance;
      if (shouldApplyDense) {
        const denseIndex =
          variantRandom && typeof variantRandom.int === 'function'
            ? variantRandom.int(0, fragments.length - 1)
            : Math.floor(variantRandom.float() * fragments.length);
        variants[denseIndex] = 'denseCore';
      }
    }

    for (let i = 0; i < fragments.length; i += 1) {
      if (variants[i] !== 'common') {
        continue;
      }

      const fragment = fragments[i];
      const disallowed = [];

      if (parent?.size === 'large' && variants.includes('denseCore')) {
        disallowed.push('denseCore');
      }

      variants[i] = this.decideVariant(fragment.size, {
        wave,
        spawnType: 'fragment',
        parent,
        disallowedVariants: disallowed,
        random: variantRandom,
      });
    }

    return variants;
  }

  isVolatileVariant(asteroid) {
    if (!asteroid) return false;
    const variant =
      CONSTANTS.ASTEROID_VARIANTS?.[asteroid.variant] ||
      CONSTANTS.ASTEROID_VARIANTS?.common;
    return variant?.behavior?.type === 'volatile';
  }

  triggerVolatileExplosion(asteroid, cause = 'destroyed') {
    if (!asteroid) return;

    const variant =
      CONSTANTS.ASTEROID_VARIANTS?.[asteroid.variant] ||
      CONSTANTS.ASTEROID_VARIANTS?.common;
    const explosion = variant?.behavior?.explosion;

    if (!explosion) {
      return;
    }

    const radius = explosion.radius ?? 0;
    const damage = explosion.damage ?? 0;
    if (radius <= 0 || damage <= 0) {
      return;
    }

    const radiusSq = radius * radius;

    this.asteroids.forEach((target) => {
      if (!target || target === asteroid || target.destroyed) {
        return;
      }

      const dx = target.x - asteroid.x;
      const dy = target.y - asteroid.y;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq <= radiusSq) {
        this.applyDamage(target, damage, {
          cause: 'volatile-explosion',
          sourceId: asteroid.id,
        });
      }
    });

    let shouldDamagePlayer = false;

    const player = this.getCachedPlayer();
    const playerPos = player?.position;

    if (
      player &&
      playerPos &&
      Number.isFinite(playerPos.x) &&
      Number.isFinite(playerPos.y)
    ) {
      const playerDx = playerPos.x - asteroid.x;
      const playerDy = playerPos.y - asteroid.y;
      const playerDistanceSq = playerDx * playerDx + playerDy * playerDy;

      shouldDamagePlayer = playerDistanceSq <= radiusSq;
    }

    if (shouldDamagePlayer) {
      this.applyDirectDamageToPlayer(damage, {
        cause: 'volatile-explosion',
        position: { x: asteroid.x, y: asteroid.y },
        radius,
      });
    }

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('asteroid-volatile-exploded', {
        asteroid,
        position: { x: asteroid.x, y: asteroid.y },
        radius,
        damage,
        cause,
      });
    }
  }

  handleVolatileTimeout(asteroid) {
    if (!asteroid || asteroid.destroyed) {
      return;
    }

    this.destroyAsteroid(asteroid, {
      createFragments: false,
      cause: 'self-destruct',
      triggerExplosion: true,
    });
  }

  applyDirectDamageToPlayer(amount, context = {}) {
    const player = this.getCachedPlayer();
    if (!player || typeof player.takeDamage !== 'function') {
      return { applied: false };
    }

    const playerPosition = this.getPlayerPositionSnapshot(player);

    const hasBlastRadius =
      context &&
      context.position &&
      Number.isFinite(context.position.x) &&
      Number.isFinite(context.position.y) &&
      Number.isFinite(context.radius) &&
      context.radius > 0;

    if (hasBlastRadius && playerPosition) {
      const hullRadius = this.getPlayerHullRadius(player);
      const dx = playerPosition.x - context.position.x;
      const dy = playerPosition.y - context.position.y;
      const distance = Math.hypot(dx, dy);

      if (distance > context.radius + hullRadius) {
        return { applied: false };
      }
    }

    if (
      Number.isFinite(player.invulnerableTimer) &&
      player.invulnerableTimer > 0
    ) {
      return { applied: false };
    }

    const remaining = player.takeDamage(amount);
    if (typeof remaining !== 'number') {
      return { applied: false, absorbed: true };
    }

    if (typeof player.setInvulnerableTimer === 'function') {
      player.setInvulnerableTimer(0.5);
    } else {
      player.invulnerableTimer = 0.5;
    }

    if (typeof gameEvents !== 'undefined') {
      const eventPosition = playerPosition
        ? { x: playerPosition.x, y: playerPosition.y }
        : null;
      const damageSource =
        context &&
        context.position &&
        Number.isFinite(context.position.x) &&
        Number.isFinite(context.position.y)
          ? { x: context.position.x, y: context.position.y }
          : null;

      gameEvents.emit('player-took-damage', {
        damage: amount,
        remaining,
        max: Number.isFinite(player.maxHealth) ? player.maxHealth : undefined,
        position: eventPosition,
        playerPosition: eventPosition,
        damageSource,
        cause: context.cause || 'enemy',
      });
    }

    if (remaining <= 0) {
      const world = this.getCachedWorld();
      if (world && typeof world.handlePlayerDeath === 'function') {
        if (world.playerAlive !== false) {
          world.handlePlayerDeath();
        }
      }
    }

    return { applied: true, remaining };
  }

  cleanupDestroyed() {
    if (!Array.isArray(this.asteroids) || this.asteroids.length === 0) {
      return;
    }

    const remaining = [];
    let removed = 0;

    for (let i = 0; i < this.asteroids.length; i += 1) {
      const asteroid = this.asteroids[i];
      if (!asteroid || asteroid.destroyed) {
        this.releaseAsteroid(asteroid);
        removed += 1;
        continue;
      }

      remaining.push(asteroid);
    }

    if (removed > 0) {
      this.asteroids = remaining;
      this.invalidateActiveEnemyCache();
    }
  }

  // === GETTERS PÚBLICOS ===
  getActiveEnemies() {
    this.rebuildActiveEnemyCache();
    return this.activeEnemyCache;
  }

  getActiveEnemiesByType(type) {
    const enemies = this.getActiveEnemies();
    if (!type || typeof type !== 'string') {
      return enemies;
    }

    const normalized = type.toLowerCase();
    return enemies.filter((enemy) => {
      const enemyType = typeof enemy?.type === 'string'
        ? enemy.type.toLowerCase()
        : null;
      return enemyType === normalized;
    });
  }

  getAllEnemies() {
    return [...this.asteroids];
  }

  getActiveEnemyCount() {
    this.rebuildActiveEnemyCache();
    return this.activeEnemyCache.length;
  }

  // === LEGACY COMPATIBILITY HELPERS ===
  getAsteroids() {
    return this.getActiveEnemies();
  }

  getAllAsteroids() {
    return this.getAllEnemies();
  }

  getAsteroidCount() {
    return this.getActiveEnemyCount();
  }

  render(ctx) {
    if (!ctx) return;

    // NEW: Use renderer component if available
    if (this.useComponents && this.rendererComponent) {
      this.rendererComponent.renderAll(ctx, this.asteroids);
    } else {
      // LEGACY: Original render logic
      this.asteroids.forEach((asteroid) => {
        if (!asteroid.destroyed && typeof asteroid.draw === 'function') {
          asteroid.draw(ctx);
        }
      });
    }
  }

  cloneWaveStateForSnapshot(wave = this.waveState) {
    if (!wave) {
      return null;
    }

    const base = this.createInitialWaveState();
    return {
      current: Number.isFinite(wave.current) ? wave.current : base.current,
      totalAsteroids: Number.isFinite(wave.totalAsteroids)
        ? wave.totalAsteroids
        : base.totalAsteroids,
      asteroidsSpawned: Number.isFinite(wave.asteroidsSpawned)
        ? wave.asteroidsSpawned
        : base.asteroidsSpawned,
      asteroidsKilled: Number.isFinite(wave.asteroidsKilled)
        ? wave.asteroidsKilled
        : base.asteroidsKilled,
      isActive: Boolean(wave.isActive),
      breakTimer: Number.isFinite(wave.breakTimer) ? wave.breakTimer : base.breakTimer,
      completedWaves: Number.isFinite(wave.completedWaves)
        ? wave.completedWaves
        : base.completedWaves,
      timeRemaining: Number.isFinite(wave.timeRemaining)
        ? wave.timeRemaining
        : base.timeRemaining,
      spawnTimer: Number.isFinite(wave.spawnTimer) ? wave.spawnTimer : base.spawnTimer,
      spawnDelay: Number.isFinite(wave.spawnDelay) ? wave.spawnDelay : base.spawnDelay,
      initialSpawnDone: Boolean(wave.initialSpawnDone),
    };
  }

  cloneSessionStatsForSnapshot(stats = this.sessionStats) {
    if (!stats) {
      return null;
    }

    const base = this.createInitialSessionStats();
    return {
      totalKills: Number.isFinite(stats.totalKills) ? stats.totalKills : base.totalKills,
      timeElapsed: Number.isFinite(stats.timeElapsed)
        ? stats.timeElapsed
        : base.timeElapsed,
    };
  }

  captureAsteroidSnapshot(asteroid) {
    if (!asteroid || asteroid.destroyed) {
      return null;
    }

    const poolId = this.assignAsteroidPoolId(asteroid);
    const safeNumber = (value, fallback = 0) =>
      Number.isFinite(value) ? value : fallback;

    const snapshot = {
      poolId,
      id: asteroid.id || null,
      type: asteroid.type || 'asteroid',
      size: asteroid.size || 'small',
      variant: asteroid.variant || 'common',
      wave: safeNumber(asteroid.wave, this.waveState?.current || 1),
      generation: safeNumber(asteroid.generation, 0),
      spawnedBy: asteroid.spawnedBy ?? null,
      x: safeNumber(asteroid.x),
      y: safeNumber(asteroid.y),
      vx: safeNumber(asteroid.vx),
      vy: safeNumber(asteroid.vy),
      radius: safeNumber(asteroid.radius, CONSTANTS.ASTEROID_SIZES?.[asteroid.size] || 0),
      rotation: safeNumber(asteroid.rotation),
      rotationSpeed: safeNumber(asteroid.rotationSpeed),
      health: safeNumber(asteroid.health),
      maxHealth: safeNumber(asteroid.maxHealth),
      destroyed: Boolean(asteroid.destroyed),
      spawnTime: safeNumber(asteroid.spawnTime),
      crackSeed: Number.isFinite(asteroid.crackSeed) ? asteroid.crackSeed : null,
      crackStage: Number.isFinite(asteroid.crackStage) ? asteroid.crackStage : 0,
      randomSeed:
        asteroid.random && typeof asteroid.random.seed === 'number'
          ? asteroid.random.seed >>> 0
          : null,
      randomScopes: asteroid.randomScopeSeeds
        ? { ...asteroid.randomScopeSeeds }
        : null,
      variantState: asteroid.variantState
        ? JSON.parse(JSON.stringify(asteroid.variantState))
        : null,
      visualState: asteroid.visualState
        ? JSON.parse(JSON.stringify(asteroid.visualState))
        : null,
    };

    return snapshot;
  }

  applyAsteroidSnapshot(snapshot) {
    if (!snapshot || snapshot.destroyed) {
      return null;
    }

    const randomSeed = Number.isFinite(snapshot.randomSeed) ? snapshot.randomSeed : null;
    const randomInstance = randomSeed !== null ? new RandomService(randomSeed) : null;

    const config = {
      id: snapshot.id || undefined,
      size: snapshot.size || 'small',
      variant: snapshot.variant || 'common',
      wave: Number.isFinite(snapshot.wave)
        ? snapshot.wave
        : this.waveState?.current || 1,
      generation: Number.isFinite(snapshot.generation) ? snapshot.generation : 0,
      spawnedBy: snapshot.spawnedBy ?? null,
      x: Number.isFinite(snapshot.x) ? snapshot.x : 0,
      y: Number.isFinite(snapshot.y) ? snapshot.y : 0,
      vx: Number.isFinite(snapshot.vx) ? snapshot.vx : 0,
      vy: Number.isFinite(snapshot.vy) ? snapshot.vy : 0,
      rotation: Number.isFinite(snapshot.rotation) ? snapshot.rotation : 0,
      rotationSpeed: Number.isFinite(snapshot.rotationSpeed)
        ? snapshot.rotationSpeed
        : 0,
      random: randomInstance,
      randomScope: 'snapshot',
      poolId: snapshot.poolId,
    };

    const asteroid = this.acquireAsteroid(config);
    if (!asteroid) {
      return null;
    }

    if (Number.isFinite(snapshot.radius)) {
      asteroid.radius = snapshot.radius;
    }
    if (Number.isFinite(snapshot.maxHealth)) {
      asteroid.maxHealth = snapshot.maxHealth;
    }
    if (Number.isFinite(snapshot.health)) {
      asteroid.health = snapshot.health;
    }
    asteroid.destroyed = Boolean(snapshot.destroyed);

    if (Number.isFinite(snapshot.spawnTime)) {
      asteroid.spawnTime = snapshot.spawnTime;
    }

    if (Number.isFinite(snapshot.crackSeed)) {
      asteroid.crackSeed = snapshot.crackSeed;
    }

    if (Number.isFinite(snapshot.crackStage)) {
      asteroid.crackStage = snapshot.crackStage;
    }

    if (snapshot.variantState && typeof snapshot.variantState === 'object') {
      asteroid.variantState = JSON.parse(JSON.stringify(snapshot.variantState));
    }

    if (snapshot.visualState && typeof snapshot.visualState === 'object') {
      asteroid.visualState = JSON.parse(JSON.stringify(snapshot.visualState));
    }

    if (snapshot.randomScopes && typeof snapshot.randomScopes === 'object') {
      asteroid.randomScopeSeeds = { ...snapshot.randomScopes };
      if (typeof asteroid.ensureRandomScopes === 'function') {
        asteroid.ensureRandomScopes();
      }
      if (typeof asteroid.reseedRandomScopes === 'function') {
        asteroid.reseedRandomScopes();
      }
    }

    this.assignAsteroidPoolId(asteroid, snapshot.poolId);
    return asteroid;
  }

  exportState() {
    const wave = this.cloneWaveStateForSnapshot();
    const session = this.cloneSessionStatsForSnapshot();
    const asteroids = [];

    for (let i = 0; i < this.asteroids.length; i += 1) {
      const snapshot = this.captureAsteroidSnapshot(this.asteroids[i]);
      if (snapshot) {
        asteroids.push(snapshot);
      }
    }

    return {
      version: 1,
      sessionActive: Boolean(this.sessionActive),
      spawnTimer: Number.isFinite(this.spawnTimer) ? this.spawnTimer : 0,
      waveState: wave,
      sessionStats: session,
      asteroids,
      random: this.captureRandomSnapshot(),
    };
  }

  importState(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      this.warnSnapshotFallback('invalid snapshot payload');
      this.reset();
      return false;
    }

    try {
      const waveSnapshot = snapshot.waveState || null;
      const sessionSnapshot = snapshot.sessionStats || null;
      const asteroidSnapshots = Array.isArray(snapshot.asteroids)
        ? snapshot.asteroids
        : null;

      if (!waveSnapshot || !sessionSnapshot || !asteroidSnapshots) {
        this.warnSnapshotFallback('missing fields');
        this.reset();
        return false;
      }

      this.releaseAllAsteroidsToPool();
      this.asteroids = [];

      const baseWave = this.createInitialWaveState();
      this.waveState = {
        ...baseWave,
        ...this.cloneWaveStateForSnapshot(waveSnapshot),
      };

      const baseSession = this.createInitialSessionStats();
      this.sessionStats = {
        ...baseSession,
        ...this.cloneSessionStatsForSnapshot(sessionSnapshot),
      };

      this.spawnTimer = Number.isFinite(snapshot.spawnTimer) ? snapshot.spawnTimer : 0;
      this.sessionActive = snapshot.sessionActive !== false;
      this._lastWaveManagerCompletionHandled = null;

      if (snapshot.random) {
        this.restoreRandomFromSnapshot(snapshot.random);
      } else {
        this.reseedRandomScopes({ resetSequences: true });
      }

      for (let i = 0; i < asteroidSnapshots.length; i += 1) {
        const restored = this.applyAsteroidSnapshot(asteroidSnapshots[i]);
        if (restored) {
          this.registerActiveEnemy(restored, { skipDuplicateCheck: true });
        }
      }

      this.invalidateActiveEnemyCache();
      this.syncPhysicsIntegration(true);
      this.emitWaveStateUpdate(true);
      this._snapshotFallbackWarningIssued = false;
      return true;
    } catch (error) {
      console.error('[EnemySystem] Failed to restore snapshot state', error);
      this.warnSnapshotFallback('exception during restore');
      this.reset();
      return false;
    }
  }

  getSnapshotState() {
    return this.exportState();
  }

  restoreSnapshotState(snapshot) {
    return this.importState(snapshot);
  }

  // === INTERFACE PARA OUTROS SISTEMAS ===
  spawnInitialAsteroids(count = 4) {
    if (!this.waveState) return;

    const remaining = Math.max(
      0,
      this.waveState.totalAsteroids - this.waveState.asteroidsSpawned
    );

    const spawnCount = Math.min(count, remaining);

    for (let i = 0; i < spawnCount; i++) {
      this.spawnAsteroid();
    }

    this.waveState.initialSpawnDone = true;
    console.log(`[EnemySystem] Spawned ${spawnCount} initial asteroids`);
  }

  // === RESET E CLEANUP ===
  reset() {
    this.releaseAllAsteroidsToPool();
    this.asteroids = [];
    this.invalidateActiveEnemyCache();
    this.spawnTimer = 0;
    this._nextAsteroidPoolId = 1;
    this.waveState = this.createInitialWaveState();
    this.sessionStats = this.createInitialSessionStats();
    this.sessionActive = true;
    this.lastWaveBroadcast = null;
    this._snapshotFallbackWarningIssued = false;
    this._lastWaveManagerCompletionHandled = null;
    this.pendingEnemyProjectiles = [];

    this.refreshInjectedServices({ force: true });
    this.syncPhysicsIntegration(true);

    this.spawnInitialAsteroids(4);
    this.emitWaveStateUpdate(true);
    console.log('[EnemySystem] Reset');
  }

  destroy() {
    this.releaseAllAsteroidsToPool();
    this.asteroids = [];
    this.sessionActive = false;
    if (this.activeBosses) {
      this.activeBosses.clear();
    }
    this.bossHudState = this.createInitialBossHudState();
    this.services = {
      player: null,
      world: null,
      progression: null,
      xpOrbs: null,
      physics: null,
      combat: null,
      healthHearts: null,
      random: null,
      effects: null,
      audio: null,
      ui: null,
    };
    this.activeEnemyCache = [];
    this.activeEnemyCacheDirty = true;
    this.randomScopes = null;
    this.randomSequences = null;
    this._nextAsteroidPoolId = 1;
    this._snapshotFallbackWarningIssued = false;
    this._lastWaveManagerCompletionHandled = null;
    console.log('[EnemySystem] Destroyed');
  }

  stop() {
    this.sessionActive = false;
  }

  completeCurrentWave() {
    if (!this.waveState) return;

    const wave = this.waveState;
    if (!wave.isActive) return;

    wave.isActive = false;
    wave.breakTimer = CONSTANTS.WAVE_BREAK_TIME;
    wave.completedWaves += 1;
    wave.spawnTimer = 0;
    wave.initialSpawnDone = false;

    const waveManagerActive =
      this.useManagers && Boolean(CONSTANTS?.USE_WAVE_MANAGER) && this.waveManager;

    if (!waveManagerActive) {
      this.grantWaveRewards();

      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('wave-completed', {
          wave: wave.current,
          completedWaves: wave.completedWaves,
          breakTimer: wave.breakTimer,
        });
      }
    } else if (
      typeof process !== 'undefined' &&
      process.env?.NODE_ENV === 'development' &&
      typeof console !== 'undefined' &&
      typeof console.debug === 'function'
    ) {
      console.debug(
        '[EnemySystem] WaveManager active - skipping legacy wave-completed emit for Wave',
        wave.current
      );
    }

    this.emitWaveStateUpdate(true);
  }

  startNextWave() {
    if (!this.waveState) return;

    const wave = this.waveState;
    wave.current += 1;
    wave.totalAsteroids = Math.floor(
      CONSTANTS.ASTEROIDS_PER_WAVE_BASE *
        Math.pow(CONSTANTS.ASTEROIDS_PER_WAVE_MULTIPLIER, wave.current - 1)
    );
    wave.totalAsteroids = Math.min(wave.totalAsteroids, 25);
    wave.asteroidsSpawned = 0;
    wave.asteroidsKilled = 0;
    wave.isActive = true;
    wave.timeRemaining = CONSTANTS.WAVE_DURATION;
    wave.spawnTimer = 1.0;
    wave.spawnDelay = Math.max(0.8, 2.0 - wave.current * 0.1);
    wave.initialSpawnDone = false;

    this.spawnInitialAsteroids(4);

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('wave-started', {
        wave: wave.current,
        totalAsteroids: wave.totalAsteroids,
      });
    }

    this.emitWaveStateUpdate(true);
  }

  grantWaveRewards() {
    const xpOrbs = this.getCachedXPOrbs();
    const player = this.getCachedPlayer();

    if (!xpOrbs || !player) return;

    const orbCount = 4 + Math.floor(this.waveState.current / 2);

    for (let i = 0; i < orbCount; i++) {
      const angle = (i / orbCount) * Math.PI * 2;
      const distance = 100;
      xpOrbs.createXPOrb(
        player.position.x + Math.cos(angle) * distance,
        player.position.y + Math.sin(angle) * distance,
        20 + this.waveState.current * 5
      );
    }
  }

  getWaveState() {
    if (!this.waveState) return null;

    return { ...this.waveState };
  }

  getBossHudState() {
    if (!this.bossHudState) {
      this.bossHudState = this.createInitialBossHudState();
    }

    return {
      ...this.bossHudState,
      phaseColors: Array.isArray(this.bossHudState.phaseColors)
        ? [...this.bossHudState.phaseColors]
        : [],
    };
  }

  getSessionStats() {
    return { ...this.sessionStats };
  }

  handleBossWaveStarted(data = {}) {
    const waveNumber = Number.isFinite(data.wave)
      ? data.wave
      : this.waveState?.current ?? null;

    const phaseColors = Array.isArray(data.phaseColors)
      ? [...data.phaseColors]
      : Array.isArray(this.bossHudState?.phaseColors)
      ? [...this.bossHudState.phaseColors]
      : [];

    this.bossHudState = {
      ...this.createInitialBossHudState(),
      upcoming: true,
      active: false,
      defeated: false,
      wave: waveNumber,
      name: data.name || this.bossHudState?.name || null,
      phaseColors,
    };

    this.emitBossHudUpdate();
    this.forwardBossEvent('boss-wave-started', {
      ...data,
      wave: waveNumber,
      phaseColors,
    });
  }

  handleBossSpawned(data = {}) {
    const boss = this.resolveBossReference(data);

    if (!boss) {
      console.warn('[EnemySystem] boss-spawned event missing enemy reference');
      this.forwardBossEvent('boss-spawned', data);
      return;
    }

    if (!this.asteroids.includes(boss)) {
      this.registerActiveEnemy(boss, { skipDuplicateCheck: true });
    } else {
      this.trackBossEnemy(boss);
      this.registerEnemyWithPhysics(boss);
    }

    boss.destroyed = false;

    const waveNumber = Number.isFinite(data.wave)
      ? data.wave
      : boss.wave ?? this.waveState?.current ?? null;

    const phase = data.phase ?? boss.currentPhase ?? 0;
    const maxHealth = data.maxHealth ?? boss.maxHealth ?? boss.health ?? 0;
    const health = data.health ?? boss.health ?? maxHealth;
    const phaseColorsSource = Array.isArray(boss.phaseColors)
      ? boss.phaseColors
      : Array.isArray(data.phaseColors)
      ? data.phaseColors
      : this.bossHudState?.phaseColors;
    const phaseColors = Array.isArray(phaseColorsSource)
      ? [...phaseColorsSource]
      : [];
    const color = phaseColors.length
      ? phaseColors[Math.min(phase, phaseColors.length - 1)]
      : this.bossHudState?.color ?? null;

    this.bossHudState = {
      ...this.bossHudState,
      active: true,
      upcoming: false,
      defeated: false,
      bossId: boss.id ?? this.bossHudState?.bossId ?? null,
      name: boss.displayName || boss.name || this.bossHudState?.name || 'Boss',
      phase,
      phaseCount: boss.phaseCount ?? this.bossHudState?.phaseCount ?? 0,
      health,
      maxHealth,
      wave: waveNumber,
      color,
      phaseColors,
    };

    this.emitBossHudUpdate();
    this.forwardBossEvent('boss-spawned', {
      ...data,
      enemy: boss,
      wave: waveNumber,
      phase,
      health,
      maxHealth,
      color,
      phaseColors,
    });
  }

  handleBossPhaseChange(data = {}) {
    const boss = this.resolveBossReference(data);

    if (boss) {
      this.trackBossEnemy(boss);
    }

    const waveNumber = Number.isFinite(data.wave)
      ? data.wave
      : boss?.wave ?? this.waveState?.current ?? null;

    const phase = data.phase ?? boss?.currentPhase ?? this.bossHudState?.phase ?? 0;
    const maxHealth = data.maxHealth ?? boss?.maxHealth ?? this.bossHudState?.maxHealth ?? 0;
    const health = data.health ?? boss?.health ?? this.bossHudState?.health ?? maxHealth;
    const phaseColorsSource = boss && Array.isArray(boss.phaseColors)
      ? boss.phaseColors
      : Array.isArray(data.phaseColors)
      ? data.phaseColors
      : this.bossHudState?.phaseColors;
    const phaseColors = Array.isArray(phaseColorsSource)
      ? [...phaseColorsSource]
      : [];
    const color = phaseColors.length
      ? phaseColors[Math.min(phase, phaseColors.length - 1)]
      : this.bossHudState?.color ?? null;

    this.bossHudState = {
      ...this.bossHudState,
      active: true,
      upcoming: false,
      bossId: boss?.id ?? this.bossHudState?.bossId ?? null,
      name: boss?.displayName || boss?.name || this.bossHudState?.name || 'Boss',
      phase,
      phaseCount: boss?.phaseCount ?? this.bossHudState?.phaseCount ?? 0,
      health,
      maxHealth,
      wave: waveNumber,
      color,
      phaseColors,
    };

    this.emitBossHudUpdate();
    this.forwardBossEvent('boss-phase-changed', {
      ...data,
      enemy: boss,
      wave: waveNumber,
      phase,
      health,
      maxHealth,
      color,
      phaseColors,
    });
  }

  handleBossDefeated(data = {}) {
    const boss = this.resolveBossReference(data);

    if (!boss) {
      this.forwardBossEvent('boss-defeated', data);
      return;
    }

    const physics = this.getCachedPhysics();
    if (physics && typeof physics.clearBossPhysicsState === 'function') {
      physics.clearBossPhysicsState(boss);
    }

    const waveNumber = Number.isFinite(data.wave)
      ? data.wave
      : boss.wave ?? this.waveState?.current ?? null;

    const rewards = this.dropBossRewards(boss, data.rewards || {});
    const position = data.position || { x: boss.x ?? 0, y: boss.y ?? 0 };

    boss.destroyed = true;

    const phaseColorsSource = Array.isArray(this.bossHudState?.phaseColors)
      ? this.bossHudState.phaseColors
      : Array.isArray(boss.phaseColors)
      ? boss.phaseColors
      : null;
    const phaseColors = Array.isArray(phaseColorsSource)
      ? [...phaseColorsSource]
      : [];

    const nextHudState = {
      ...this.bossHudState,
      active: false,
      upcoming: false,
      defeated: true,
      bossId: boss.id ?? this.bossHudState?.bossId ?? null,
      name: boss.displayName || boss.name || this.bossHudState?.name || 'Boss',
      phase: boss.currentPhase ?? this.bossHudState?.phase ?? 0,
      phaseCount: boss.phaseCount ?? this.bossHudState?.phaseCount ?? 0,
      health: 0,
      maxHealth: rewards?.maxHealth ?? boss.maxHealth ?? this.bossHudState?.maxHealth ?? 0,
      wave: waveNumber,
      color: this.bossHudState?.color ?? null,
      phaseColors,
    };

    this.unregisterEnemyFromPhysics(boss);
    this.untrackBossEnemy(boss);
    this.removeActiveEnemy(boss);

    this.bossHudState = nextHudState;
    this.emitBossHudUpdate();

    this.forwardBossEvent('boss-defeated', {
      ...data,
      enemy: boss,
      rewards,
      wave: waveNumber,
      position,
      color: nextHudState.color,
      phaseColors,
    });

    this.releaseAsteroid(boss);

    this.sessionStats.totalKills += 1;
    if (this.waveState) {
      this.waveState.asteroidsKilled += 1;
    }

    this.emitWaveStateUpdate(true);
  }

  handleBossAttackPayload(data = {}) {
    if (!data || data.processedBy === 'physics') {
      return;
    }

    const physics = this.getCachedPhysics();
    if (!physics) {
      return;
    }

    const attackType =
      data.type ||
      data.attackType ||
      data.event ||
      data.kind ||
      data.mode ||
      null;

    const boss = this.resolveBossReference(data) || data.boss || null;
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
        if (typeof physics.handleBossChargeCollision === 'function') {
          physics.handleBossChargeCollision(payload);
        }
        break;
      case 'area':
      case 'area-damage':
      case 'nova':
      case 'shockwave':
      case 'boss-area':
        if (typeof physics.applyBossAreaDamage === 'function') {
          physics.applyBossAreaDamage(payload);
        }
        break;
      default:
        if (
          payload.collisionType === 'boss-charge' &&
          typeof physics.handleBossChargeCollision === 'function'
        ) {
          physics.handleBossChargeCollision(payload);
          break;
        }

        if (payload.radius && typeof physics.applyBossAreaDamage === 'function') {
          physics.applyBossAreaDamage(payload);
        }
        break;
    }
  }

  handleEnemyProjectile(data = null) {
    if (!data) {
      return false;
    }

    const payload = this.normalizeEnemyProjectilePayload(data);
    const combat = this.getCachedCombat();

    if (combat) {
      if (this.isBossProjectile(payload) && typeof combat.handleBossProjectile === 'function') {
        combat.handleBossProjectile(payload);
        return true;
      }

      if (typeof combat.handleEnemyProjectile === 'function') {
        combat.handleEnemyProjectile(payload);
        return true;
      }

      if (typeof combat.queueEnemyProjectile === 'function') {
        combat.queueEnemyProjectile(payload);
        return true;
      }

      if (typeof combat.spawnEnemyProjectile === 'function') {
        combat.spawnEnemyProjectile(payload);
        return true;
      }
    }

    const bus = this.eventBus || (typeof gameEvents !== 'undefined' ? gameEvents : null);
    if (bus) {
      bus.emit('combat-enemy-projectile', payload);
      return true;
    }

    // Last-resort: queue payload when both combat and bus are unavailable
    this.pendingEnemyProjectiles.push(payload);
    if (process.env.NODE_ENV === 'development') {
      console.debug('[EnemySystem] Queued enemy projectile (combat/bus unavailable)', payload);
    }
    return false;
  }

  handleMineExplosion(data = null) {
    if (!data || !data.position) {
      return;
    }

    const physics = this.getCachedPhysics();
    if (physics) {
      if (typeof physics.handleMineExplosion === 'function') {
        physics.handleMineExplosion(data);
        return;
      }

      if (typeof physics.applyAreaDamage === 'function') {
        physics.applyAreaDamage(data);
        return;
      }

      if (typeof physics.queueAreaDamage === 'function') {
        physics.queueAreaDamage(data);
        return;
      }
    }

    this.handleShieldExplosionDamage({
      position: data.position,
      radius: data.radius,
      damage: data.damage,
    });
  }

  handleShieldExplosionDamage(data) {
    if (!data || !data.position) {
      return;
    }

    const radius = typeof data.radius === 'number' ? data.radius : 200;
    const damage = typeof data.damage === 'number' ? data.damage : 50;

    const radiusSq = radius * radius;
    const originX = data.position.x;
    const originY = data.position.y;

    const physics = this.getCachedPhysics();
    let nearbyEnemies = null;
    if (physics) {
      if (typeof physics.getNearbyEnemies === 'function') {
        nearbyEnemies = physics.getNearbyEnemies(originX, originY, radius);
      } else if (typeof physics.getNearbyAsteroids === 'function') {
        nearbyEnemies = physics.getNearbyAsteroids(originX, originY, radius);
      }
    }

    if (!nearbyEnemies || nearbyEnemies.length === 0) {
      nearbyEnemies = this.asteroids;
    }

    if (!nearbyEnemies || nearbyEnemies.length === 0) {
      return;
    }

    for (let i = 0; i < nearbyEnemies.length; i += 1) {
      const asteroid = nearbyEnemies[i];
      if (!asteroid || asteroid.destroyed) {
        continue;
      }

      const dx = asteroid.x - originX;
      const dy = asteroid.y - originY;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq > radiusSq) {
        continue;
      }

      // Apply damage with distance falloff
      const distance = Math.sqrt(distanceSq);
      const falloff = 1 - Math.min(distance / radius, 1);
      const actualDamage = damage * falloff;

      asteroid.takeDamage(actualDamage);

      // Also apply knockback
      if (distanceSq > 0) {
        const impulse = (300 * falloff) / Math.max(asteroid.mass, 1);
        const nx = dx / Math.max(distance, 0.001);
        const ny = dy / Math.max(distance, 0.001);

        asteroid.vx += nx * impulse;
        asteroid.vy += ny * impulse;
        const collisionRandom =
          typeof asteroid.getRandomFor === 'function'
            ? asteroid.getRandomFor('collision')
            : null;
        const rotationSource =
          collisionRandom || this.getRandomScope('fragments') || this.getRandomService();
        const rotationImpulse =
          rotationSource && typeof rotationSource.range === 'function'
            ? rotationSource.range(-1.5, 1.5)
            : (rotationSource.float() - 0.5) * 3;
        asteroid.rotationSpeed += rotationImpulse * falloff;
      }
    }
  }

  handleShockwave(data) {
    if (!data || !data.position) {
      return;
    }

    const radius =
      typeof data.radius === 'number'
        ? data.radius
        : CONSTANTS.SHIELD_SHOCKWAVE_RADIUS;
    const force =
      typeof data.force === 'number'
        ? data.force
        : CONSTANTS.SHIELD_SHOCKWAVE_FORCE;

    const radiusSq = radius * radius;
    const originX = data.position.x;
    const originY = data.position.y;

    const physics = this.getCachedPhysics();
    let nearbyEnemies = null;
    if (physics) {
      if (typeof physics.getNearbyEnemies === 'function') {
        nearbyEnemies = physics.getNearbyEnemies(originX, originY, radius);
      } else if (typeof physics.getNearbyAsteroids === 'function') {
        nearbyEnemies = physics.getNearbyAsteroids(originX, originY, radius);
      }
    }

    if (!nearbyEnemies || nearbyEnemies.length === 0) {
      nearbyEnemies = this.asteroids;
    }

    if (!nearbyEnemies || nearbyEnemies.length === 0) {
      return;
    }

    for (let i = 0; i < nearbyEnemies.length; i += 1) {
      const asteroid = nearbyEnemies[i];
      if (!asteroid || asteroid.destroyed) {
        continue;
      }

      const dx = asteroid.x - originX;
      const dy = asteroid.y - originY;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq > radiusSq || distanceSq === 0) {
        continue;
      }

      const distance = Math.sqrt(distanceSq);
      const falloff = 1 - Math.min(distance / radius, 1);
      const impulse = (force * falloff) / Math.max(asteroid.mass, 1);
      const nx = dx / Math.max(distance, 0.001);
      const ny = dy / Math.max(distance, 0.001);

      asteroid.vx += nx * impulse;
      asteroid.vy += ny * impulse;
      const collisionRandom =
        typeof asteroid.getRandomFor === 'function'
          ? asteroid.getRandomFor('collision')
          : null;
      const rotationImpulseSource =
        collisionRandom || this.getRandomScope('fragments') || this.getRandomService();
      const rotationImpulse =
        rotationImpulseSource && typeof rotationImpulseSource.range === 'function'
          ? rotationImpulseSource.range(-2, 2)
          : (rotationImpulseSource.float() - 0.5) * 4;
      asteroid.rotationSpeed += rotationImpulse * falloff;
      asteroid.lastDamageTime = Math.max(asteroid.lastDamageTime, 0.12);
    }
  }
}

export { EnemySystem, Asteroid };
