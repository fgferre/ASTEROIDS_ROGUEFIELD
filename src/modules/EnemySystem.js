// src/modules/EnemySystem.js
import * as CONSTANTS from '../core/GameConstants.js';
import { GamePools } from '../core/GamePools.js';
import RandomService from '../core/RandomService.js';
import { normalizeDependencies, resolveService } from '../core/serviceUtils.js';
import { Asteroid } from './enemies/types/Asteroid.js';
import { EnemyFactory } from './enemies/base/EnemyFactory.js';
import { WaveManager } from './enemies/managers/WaveManager.js';
import { RewardManager } from './enemies/managers/RewardManager.js';
import { AsteroidMovement } from './enemies/components/AsteroidMovement.js';
import { AsteroidCollision } from './enemies/components/AsteroidCollision.js';
import { AsteroidRenderer } from './enemies/components/AsteroidRenderer.js';

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
      healthHearts: this.dependencies.healthHearts || null,
      random: this.dependencies.random || null,
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
    this.spawnTimer = 0;
    this.spawnDelay = 1.0;

    // Legacy wave state (for backward compatibility during migration)
    this.waveState = this.createInitialWaveState();
    this.sessionStats = this.createInitialSessionStats();
    this.sessionActive = false;
    this.lastWaveBroadcast = null;

    this.activeAsteroidCache = [];
    this.activeAsteroidCacheDirty = true;
    this.usesAsteroidPool = false;

    // Factory (optional - new architecture)
    this.factory = null;
    this.useFactory = false; // Feature flag for gradual migration - DISABLED (pool conflicts)

    // Managers (new architecture)
    this.waveManager = null;
    this.rewardManager = null;
    this.useManagers = true; // Feature flag to enable new manager system

    // Components (new architecture)
    this.movementComponent = null;
    this.collisionComponent = null;
    this.rendererComponent = null;
    this.useComponents = true; // Feature flag to enable component system

    // Registrar no ServiceLocator
    if (typeof gameServices !== 'undefined') {
      gameServices.register('enemies', this);
    }

    this.missingDependencyWarnings = new Set();
    this.deferredDependencyWarnings = new Set(['world']);

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
    if (typeof gameEvents === 'undefined') return;

    // Handle level 5 shield deflective explosion (AoE damage)
    gameEvents.on('shield-explosion-damage', (data) => {
      this.handleShieldExplosionDamage(data);
    });

    gameEvents.on('player-reset', () => {
      this.refreshInjectedServices({ force: true });
    });

    gameEvents.on('progression-reset', () => {
      this.refreshInjectedServices({ force: true });
    });

    gameEvents.on('world-reset', () => {
      this.refreshInjectedServices({ force: true });
    });

    gameEvents.on('physics-reset', () => {
      this.refreshInjectedServices({ force: true });
      this.syncPhysicsIntegration(true);
    });

    // NEW: Integrate RewardManager with enemy destruction
    if (this.useManagers) {
      gameEvents.on('enemy-destroyed', (data) => {
        if (this.rewardManager && data.enemy) {
          this.rewardManager.dropRewards(data.enemy);
        }
      });
    }
  }

  refreshInjectedServices({ force = false, suppressWarnings = false } = {}) {
    const options = { force, suppressWarnings };
    this.updateServiceCache('player', 'player', options);
    this.updateServiceCache('world', 'world', options);
    this.updateServiceCache('progression', 'progression', options);
    this.updateServiceCache('xpOrbs', 'xp-orbs', options);
    this.updateServiceCache('physics', 'physics', options);
    this.updateServiceCache('healthHearts', 'healthHearts', options);
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

      console.log('[EnemySystem] EnemyFactory initialized (optional - not active yet)');
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
    };

    // NEW: Use factory if enabled (feature flag)
    if (this.useFactory && this.factory) {
      return this.acquireEnemyViaFactory('asteroid', asteroidConfig);
    }

    // LEGACY: Original implementation (default)
    if (
      this.usesAsteroidPool &&
      GamePools?.asteroids &&
      typeof GamePools.asteroids.acquire === 'function'
    ) {
      const asteroid = GamePools.asteroids.acquire();
      if (asteroid && typeof asteroid.initialize === 'function') {
        asteroid.initialize(this, asteroidConfig);
        return asteroid;
      }
    }

    return new Asteroid(this, asteroidConfig);
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
        this.asteroids.push(enemy);
        this.invalidateActiveAsteroidCache();
      }
      return enemy;
    } catch (error) {
      console.error('[EnemySystem] Factory creation failed:', error);
      return null;
    }
  }

  releaseAsteroid(asteroid) {
    if (!asteroid) {
      return;
    }

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
    this.invalidateActiveAsteroidCache();
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

  getCachedHealthHearts() {
    this.refreshInjectedServices();
    return this.services.healthHearts;
  }

  invalidateActiveAsteroidCache() {
    this.activeAsteroidCacheDirty = true;
  }

  rebuildActiveAsteroidCache() {
    if (!this.activeAsteroidCacheDirty) {
      return;
    }

    if (!Array.isArray(this.activeAsteroidCache)) {
      this.activeAsteroidCache = [];
    }

    this.activeAsteroidCache.length = 0;

    for (let i = 0; i < this.asteroids.length; i += 1) {
      const asteroid = this.asteroids[i];
      if (asteroid && !asteroid.destroyed) {
        this.activeAsteroidCache.push(asteroid);
      }
    }

    this.activeAsteroidCacheDirty = false;
  }

  forEachActiveAsteroid(callback) {
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

    this.sessionStats.timeElapsed += deltaTime;

    this.updateAsteroids(deltaTime);
    this.updateWaveLogic(deltaTime);
    this.cleanupDestroyed();

    this.emitWaveStateUpdate();
  }

  updateWaveLogic(deltaTime) {
    const wave = this.waveState;

    if (!wave) return;

    if (wave.isActive) {
      wave.timeRemaining = Math.max(0, wave.timeRemaining - deltaTime);
      this.handleSpawning(deltaTime);

      const allAsteroidsKilled =
        wave.asteroidsKilled >= wave.totalAsteroids &&
        this.getAsteroidCount() === 0;

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
      this.getAsteroidCount() < CONSTANTS.MAX_ASTEROIDS_ON_SCREEN
    );
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
    const margin = 80;

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

    this.asteroids.push(asteroid);
    this.invalidateActiveAsteroidCache();

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
    this.invalidateActiveAsteroidCache();

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
        this.asteroids.push(fragment);
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
        this.getAsteroidCount() === 0;

      if (allAsteroidsKilled && this.waveState.timeRemaining > 0) {
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
      this.invalidateActiveAsteroidCache();
    }
  }

  // === GETTERS PÚBLICOS ===
  getAsteroids() {
    this.rebuildActiveAsteroidCache();
    return this.activeAsteroidCache;
  }

  getAllAsteroids() {
    return [...this.asteroids];
  }

  getAsteroidCount() {
    this.rebuildActiveAsteroidCache();
    return this.activeAsteroidCache.length;
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
    this.invalidateActiveAsteroidCache();
    this.spawnTimer = 0;
    this.waveState = this.createInitialWaveState();
    this.sessionStats = this.createInitialSessionStats();
    this.sessionActive = true;
    this.lastWaveBroadcast = null;

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
    this.services = {
      player: null,
      world: null,
      progression: null,
      xpOrbs: null,
      physics: null,
      healthHearts: null,
      random: null,
    };
    this.activeAsteroidCache = [];
    this.activeAsteroidCacheDirty = true;
    this.randomScopes = null;
    this.randomSequences = null;
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

    this.grantWaveRewards();

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('wave-completed', {
        wave: wave.current,
        completedWaves: wave.completedWaves,
        breakTimer: wave.breakTimer,
      });
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

  getSessionStats() {
    return { ...this.sessionStats };
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
    const nearbyAsteroids = physics && typeof physics.getNearbyAsteroids === 'function'
      ? physics.getNearbyAsteroids(originX, originY, radius)
      : this.asteroids;

    if (!nearbyAsteroids || nearbyAsteroids.length === 0) {
      return;
    }

    for (let i = 0; i < nearbyAsteroids.length; i += 1) {
      const asteroid = nearbyAsteroids[i];
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
    const nearbyAsteroids = physics && typeof physics.getNearbyAsteroids === 'function'
      ? physics.getNearbyAsteroids(originX, originY, radius)
      : this.asteroids;

    if (!nearbyAsteroids || nearbyAsteroids.length === 0) {
      return;
    }

    for (let i = 0; i < nearbyAsteroids.length; i += 1) {
      const asteroid = nearbyAsteroids[i];
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
