// src/modules/EnemySystem.js
import * as CONSTANTS from '../core/GameConstants.js';
import { GamePools } from '../core/GamePools.js';
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
  constructor() {
    this.asteroids = [];
    this.spawnTimer = 0;
    this.spawnDelay = 1.0;

    // Legacy wave state (for backward compatibility during migration)
    this.waveState = this.createInitialWaveState();
    this.sessionStats = this.createInitialSessionStats();
    this.sessionActive = false;
    this.lastWaveBroadcast = null;

    this.cachedPlayer = null;
    this.cachedWorld = null;
    this.cachedProgression = null;
    this.cachedXPOrbs = null;
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

    this.setupAsteroidPoolIntegration();
    this.setupEnemyFactory(); // Initialize factory (optional)
    this.setupManagers(); // Initialize wave and reward managers
    this.setupComponents(); // Initialize components
    this.setupEventListeners();
    this.resolveCachedServices(true);

    this.emitWaveStateUpdate(true);

    console.log('[EnemySystem] Initialized');
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') return;

    // Handle level 5 shield deflective explosion (AoE damage)
    gameEvents.on('shield-explosion-damage', (data) => {
      this.handleShieldExplosionDamage(data);
    });

    gameEvents.on('player-reset', () => {
      this.resolveCachedServices(true);
    });

    gameEvents.on('progression-reset', () => {
      this.resolveCachedServices(true);
    });

    gameEvents.on('world-reset', () => {
      this.resolveCachedServices(true);
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

  resolveCachedServices(force = false) {
    if (typeof gameServices === 'undefined') {
      return;
    }

    if (force || !this.cachedPlayer) {
      if (typeof gameServices.has === 'function' && gameServices.has('player')) {
        this.cachedPlayer = gameServices.get('player');
      } else {
        this.cachedPlayer = null;
      }
    }

    if (force || !this.cachedWorld) {
      if (typeof gameServices.has === 'function' && gameServices.has('world')) {
        this.cachedWorld = gameServices.get('world');
      } else {
        this.cachedWorld = null;
      }
    }

    if (force || !this.cachedProgression) {
      if (
        typeof gameServices.has === 'function' &&
        gameServices.has('progression')
      ) {
        this.cachedProgression = gameServices.get('progression');
      } else {
        this.cachedProgression = null;
      }
    }

    if (force || !this.cachedXPOrbs) {
      if (
        typeof gameServices.has === 'function' &&
        gameServices.has('xp-orbs')
      ) {
        this.cachedXPOrbs = gameServices.get('xp-orbs');
      } else {
        this.cachedXPOrbs = null;
      }
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
        this.waveManager = new WaveManager(this, gameEvents);
        console.log('[EnemySystem] WaveManager initialized');
      }

      // Initialize RewardManager
      this.resolveCachedServices();
      const xpOrbSystem = this.getCachedXPOrbs();
      if (xpOrbSystem) {
        this.rewardManager = new RewardManager(this, xpOrbSystem);
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

  acquireAsteroid(config) {
    // NEW: Use factory if enabled (feature flag)
    if (this.useFactory && this.factory) {
      return this.acquireEnemyViaFactory('asteroid', config);
    }

    // LEGACY: Original implementation (default)
    if (
      this.usesAsteroidPool &&
      GamePools?.asteroids &&
      typeof GamePools.asteroids.acquire === 'function'
    ) {
      const asteroid = GamePools.asteroids.acquire();
      if (asteroid && typeof asteroid.initialize === 'function') {
        asteroid.initialize(this, config);
        return asteroid;
      }
    }

    return new Asteroid(this, config);
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
    if (!this.cachedPlayer) {
      this.resolveCachedServices();
    }
    return this.cachedPlayer;
  }

  getCachedWorld() {
    if (!this.cachedWorld) {
      this.resolveCachedServices();
    }
    return this.cachedWorld;
  }

  getCachedProgression() {
    if (!this.cachedProgression) {
      this.resolveCachedServices();
    }
    return this.cachedProgression;
  }

  getCachedXPOrbs() {
    if (!this.cachedXPOrbs) {
      this.resolveCachedServices();
    }
    return this.cachedXPOrbs;
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

    this.resolveCachedServices();

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
      a1.rotationSpeed += (Math.random() - 0.5) * 1.5;
      a2.rotationSpeed += (Math.random() - 0.5) * 1.5;
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
      this.spawnTimer = wave.spawnDelay * (0.5 + Math.random() * 0.5);
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

    const side = Math.floor(Math.random() * 4);
    let x;
    let y;
    const margin = 80;

    switch (side) {
      case 0:
        x = Math.random() * CONSTANTS.GAME_WIDTH;
        y = -margin;
        break;
      case 1:
        x = CONSTANTS.GAME_WIDTH + margin;
        y = Math.random() * CONSTANTS.GAME_HEIGHT;
        break;
      case 2:
        x = Math.random() * CONSTANTS.GAME_WIDTH;
        y = CONSTANTS.GAME_HEIGHT + margin;
        break;
      default:
        x = -margin;
        y = Math.random() * CONSTANTS.GAME_HEIGHT;
        break;
    }

    let size;
    const rand = Math.random();
    if (rand < 0.5) size = 'large';
    else if (rand < 0.8) size = 'medium';
    else size = 'small';

    const waveNumber = this.waveState?.current || 1;
    const variant = this.decideVariant(size, {
      wave: waveNumber,
      spawnType: 'spawn',
    });

    const asteroid = this.acquireAsteroid({
      x,
      y,
      size,
      variant,
      wave: waveNumber,
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
        const fragment = this.acquireAsteroid({
          ...descriptor,
          variant: fragmentVariants[index],
          wave: descriptor.wave || waveNumber,
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
    if (!availableKeys.length || Math.random() > chance) {
      return 'common';
    }

    const totalWeight = availableKeys.reduce(
      (sum, key) => sum + (distribution[key] ?? 0),
      0
    );

    if (totalWeight <= 0) {
      return 'common';
    }

    let roll = Math.random() * totalWeight;
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

    if (parent?.size === 'large') {
      const denseChance = Math.min(1, 0.3 + this.computeVariantWaveBonus(wave));
      if (Math.random() < denseChance) {
        const denseIndex = Math.floor(Math.random() * fragments.length);
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

    const hasBlastRadius =
      context &&
      context.position &&
      Number.isFinite(context.position.x) &&
      Number.isFinite(context.position.y) &&
      Number.isFinite(context.radius) &&
      context.radius > 0;

    if (hasBlastRadius) {
      let playerPosition = null;

      if (
        player.position &&
        Number.isFinite(player.position.x) &&
        Number.isFinite(player.position.y)
      ) {
        playerPosition = player.position;
      } else if (typeof player.getPosition === 'function') {
        const fetchedPosition = player.getPosition();
        if (
          fetchedPosition &&
          Number.isFinite(fetchedPosition.x) &&
          Number.isFinite(fetchedPosition.y)
        ) {
          playerPosition = fetchedPosition;
        }
      }

      if (playerPosition) {
        const rawHullRadius =
          typeof player.getHullBoundingRadius === 'function'
            ? player.getHullBoundingRadius()
            : CONSTANTS.SHIP_SIZE;
        const hullRadius = Number.isFinite(rawHullRadius)
          ? Math.max(0, rawHullRadius)
          : CONSTANTS.SHIP_SIZE;

        const dx = playerPosition.x - context.position.x;
        const dy = playerPosition.y - context.position.y;
        const distance = Math.hypot(dx, dy);

        if (distance > context.radius + hullRadius) {
          return { applied: false };
        }
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
      gameEvents.emit('player-took-damage', {
        damage: amount,
        remaining,
        max: player.maxHealth,
        position: { ...player.position },
        playerPosition: { x: player.position.x, y: player.position.y },
        damageSource: context.position ? { x: context.position.x, y: context.position.y } : null,
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

    this.resolveCachedServices(true);

    this.spawnInitialAsteroids(4);
    this.emitWaveStateUpdate(true);
    console.log('[EnemySystem] Reset');
  }

  destroy() {
    this.releaseAllAsteroidsToPool();
    this.asteroids = [];
    this.sessionActive = false;
    this.cachedPlayer = null;
    this.cachedWorld = null;
    this.cachedProgression = null;
    this.activeAsteroidCache = [];
    this.activeAsteroidCacheDirty = true;
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

    this.asteroids.forEach((asteroid) => {
      if (!asteroid || asteroid.destroyed) {
        return;
      }

      const dx = asteroid.x - originX;
      const dy = asteroid.y - originY;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq > radiusSq) {
        return;
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
        asteroid.rotationSpeed += (Math.random() - 0.5) * 3 * falloff;
      }
    });
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

    this.asteroids.forEach((asteroid) => {
      if (!asteroid || asteroid.destroyed) {
        return;
      }

      const dx = asteroid.x - originX;
      const dy = asteroid.y - originY;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq > radiusSq || distanceSq === 0) {
        return;
      }

      const distance = Math.sqrt(distanceSq);
      const falloff = 1 - Math.min(distance / radius, 1);
      const impulse = (force * falloff) / Math.max(asteroid.mass, 1);
      const nx = dx / Math.max(distance, 0.001);
      const ny = dy / Math.max(distance, 0.001);

      asteroid.vx += nx * impulse;
      asteroid.vy += ny * impulse;
      asteroid.rotationSpeed += (Math.random() - 0.5) * 4 * falloff;
      asteroid.lastDamageTime = Math.max(asteroid.lastDamageTime, 0.12);
    });
  }
}

export { EnemySystem, Asteroid };
