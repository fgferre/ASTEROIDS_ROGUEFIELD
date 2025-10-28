// src/modules/EnemySystem.js
import { ASTEROID_SIZES, GAME_HEIGHT, GAME_WIDTH, SHIP_SIZE } from '../core/GameConstants.js';
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
import { EnemyRenderSystem } from './enemies/systems/EnemyRenderSystem.js';
import { EnemySpawnSystem } from './enemies/systems/EnemySpawnSystem.js';
import { EnemyDamageSystem } from './enemies/systems/EnemyDamageSystem.js';
import { EnemyUpdateSystem } from './enemies/systems/EnemyUpdateSystem.js';
import { CollisionComponent } from './enemies/components/CollisionComponent.js';
import { HealthComponent } from './enemies/components/HealthComponent.js';
import { MovementComponent } from './enemies/components/MovementComponent.js';
import { RenderComponent } from './enemies/components/RenderComponent.js';
import { WeaponComponent } from './enemies/components/WeaponComponent.js';
import { GameDebugLogger } from '../utils/dev/GameDebugLogger.js';
import {
  ASTEROIDS_PER_WAVE_BASE,
  ASTEROIDS_PER_WAVE_MULTIPLIER,
  ASTEROID_EDGE_SPAWN_MARGIN,
  COLLISION_BOUNCE,
  MAX_ASTEROIDS_ON_SCREEN,
  PRESERVE_LEGACY_POSITIONING,
  PRESERVE_LEGACY_SIZE_DISTRIBUTION,
  SHIELD_SHOCKWAVE_FORCE,
  SHIELD_SHOCKWAVE_RADIUS,
  USE_WAVE_MANAGER,
  WAVE_BREAK_TIME,
  WAVE_DURATION,
  WAVEMANAGER_HANDLES_ASTEROID_SPAWN,
} from '../data/constants/gameplay.js';
import { ENEMY_TYPES, BOSS_CONFIG } from '../data/constants/visual.js';
import { DRONE_COMPONENTS } from '../data/enemies/drone.js';
import { HUNTER_COMPONENTS } from '../data/enemies/hunter.js';
import { MINE_COMPONENTS } from '../data/enemies/mine.js';
import { BOSS_COMPONENTS } from '../data/enemies/boss.js';
import {
  ASTEROID_VARIANTS,
  ASTEROID_VARIANT_CHANCES,
  ORB_VALUE,
} from '../data/enemies/asteroid-configs.js';

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

    GameDebugLogger.log('INIT', 'EnemySystem player service', {
      hasPlayerDependency: !!this.dependencies.player,
      hasPlayerService: !!this.services.player,
    });

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
    this.availableBossMinionTypes = [];

    // Legacy wave state (for backward compatibility during migration)
    this.waveState = this.createInitialWaveState();
    this.sessionStats = this.createInitialSessionStats();
    this.sessionActive = false;
    this.lastWaveBroadcast = null;

    this.activeEnemyCache = [];
    this.activeEnemyCacheDirty = true;
    this.usesAsteroidPool = false;
    this._nextAsteroidPoolId = 1;
    this._activeAsteroidsBuffer = [];
    this._snapshotFallbackWarningIssued = false;
    this._waveSystemDebugLogged = false;
    this._waveManagerFallbackWarningIssued = false;
    this._waveManagerInvalidStateWarningIssued = false;
    this._lastWaveManagerCompletionHandled = null;
    this._asteroidSpawnDebugLogged = false;
    this._waveManagerRuntimeEnabled = false;
    this._lastEnemyUpdateLog = 0;
    this._playerCacheLogged = false;
    this._playerServiceRefreshWarning = false;
    this._playerLazyResolveLogEmitted = false;

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
    this.genericMovement = null;
    this.genericWeapon = null;
    this.genericRender = null;
    this.genericCollision = null;
    this.genericHealth = null;
    this.useComponents = true; // Feature flag to enable component system

    this.renderSystem = null;
    this.spawnSystem = null;
    this.damageSystem = null;
    this.updateSystem = null;

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
    this.setupRenderSystem(); // Initialize render sub-system
    this.setupSpawnSystem(); // Initialize spawn sub-system
    this.setupDamageSystem(); // Initialize damage sub-system
    this.setupUpdateSystem(); // Initialize update sub-system
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

    bus.on('wave-started', () => {
      this.refreshInjectedServices({ force: true, suppressWarnings: true });
    });

    bus.on('physics-reset', () => {
      this.refreshInjectedServices({ force: true });
      this.syncPhysicsIntegration(true);
    });

    bus.on('enemy-fired', (data) => {
      this.handleEnemyProjectile(data);
    });

    bus.on('player-hit-by-projectile', (data = {}) => {
      const damage = Number.isFinite(data.damage) ? data.damage : 0;
      if (damage <= 0) {
        return;
      }

      const position =
        data.position &&
        Number.isFinite(data.position.x) &&
        Number.isFinite(data.position.y)
          ? { x: data.position.x, y: data.position.y }
          : null;

      const result = this.applyDirectDamageToPlayer(damage, {
        cause: 'enemy-projectile',
        position,
        source: data.source || null,
      });

      GameDebugLogger.log('COLLISION', 'Player hit by enemy projectile', {
        damage,
        applied: Boolean(result?.applied),
        remaining: result?.remaining,
        absorbedByShield: Number.isFinite(result?.shieldAbsorbed)
          ? Number(result.shieldAbsorbed)
          : 0,
        healthDamage: Number.isFinite(result?.healthDamage)
          ? Number(result.healthDamage)
          : 0,
        position,
        source: data.source || null,
      });
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
          if (Boolean(USE_WAVE_MANAGER) && this.waveState) {
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
      this.refreshInjectedServices({ force: true, suppressWarnings: true });
      this.handleBossWaveStarted(data);
    });

    bus.on('boss-spawned', (data) => {
      this.refreshInjectedServices({ force: true, suppressWarnings: true });
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

    bus.on('boss-invulnerability-changed', (data) => {
      this.handleBossInvulnerabilityChanged(data);
    });
  }

  refreshInjectedServices({ force = false, suppressWarnings = false } = {}) {
    const options = { force, suppressWarnings };
    if (force) {
      this._playerCacheLogged = false;
      this._playerLazyResolveLogEmitted = false;
    }
    const previousPlayerService = this.services.player;
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

    let playerRefreshLogged = false;
    if (this.services.player && this.services.player !== previousPlayerService) {
      GameDebugLogger.log('STATE', 'Player service refreshed', {
        success: true,
        source: 'dependency-cache',
        forced: Boolean(force),
        changed: true,
      });
      this._playerCacheLogged = false;
      this._playerLazyResolveLogEmitted = false;
      this._playerServiceRefreshWarning = false;
      playerRefreshLogged = true;
    }

    if (force && this.services.player && !playerRefreshLogged) {
      this._playerServiceRefreshWarning = false;
    }

    if (!this.services.player) {
      let resolvedPlayer = null;
      let resolvedSource = null;

      const locatorAvailable =
        typeof gameServices !== 'undefined' &&
        typeof gameServices.resolve === 'function';

      if (locatorAvailable) {
        const locatorPlayer = gameServices.resolve('player');
        if (locatorPlayer) {
          resolvedPlayer = locatorPlayer;
          resolvedSource = 'service-locator';
        }
      }

      if (!resolvedPlayer) {
        const fallbackResolved = resolveService('player', this.dependencies);
        if (fallbackResolved) {
          resolvedPlayer = fallbackResolved;
          resolvedSource = resolvedSource || 'resolveService-fallback';
        }
      }

      if (resolvedPlayer) {
        const changed = this.services.player !== resolvedPlayer;
        this.services.player = resolvedPlayer;
        this.dependencies.player = resolvedPlayer;
        this._playerCacheLogged = false;
        this._playerLazyResolveLogEmitted = false;
        this._playerServiceRefreshWarning = false;
        GameDebugLogger.log('STATE', 'Player service refreshed', {
          success: true,
          source: resolvedSource || 'player-fallback',
          forced: Boolean(force),
          changed,
        });
      } else if (!suppressWarnings && !this._playerServiceRefreshWarning) {
        GameDebugLogger.log('STATE', 'Player service refreshed', {
          success: false,
          source: 'player-fallback',
          forced: Boolean(force),
        });
        this._playerServiceRefreshWarning = true;
      }
    }

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
          defaults: { ...ENEMY_TYPES.drone, components: DRONE_COMPONENTS },
          tags: ['enemy', 'hostile', 'ranged']
        });
      }

      if (ENEMY_TYPES?.mine) {
        this.factory.registerType('mine', {
          class: Mine,
          pool: GamePools?.mines || null,
          defaults: { ...ENEMY_TYPES.mine, components: MINE_COMPONENTS },
          tags: ['enemy', 'explosive', 'area-of-effect']
        });
      }

      if (ENEMY_TYPES?.hunter) {
        this.factory.registerType('hunter', {
          class: Hunter,
          pool: GamePools?.hunters || null,
          defaults: { ...ENEMY_TYPES.hunter, components: HUNTER_COMPONENTS },
          tags: ['enemy', 'hostile', 'ranged', 'elite']
        });
      }

      if (BOSS_CONFIG) {
        const bossDefaults = { ...BOSS_CONFIG };
        const sanitizedMinions = this.getAvailableBossMinionTypes(
          bossDefaults.minionTypes
        );

        if (Array.isArray(sanitizedMinions) && sanitizedMinions.length > 0) {
          bossDefaults.minionTypes = [...sanitizedMinions];
        } else {
          delete bossDefaults.minionTypes;
        }

        this.factory.registerType('boss', {
          class: BossEnemy,
          pool: GamePools?.bosses || null,
          defaults: { ...bossDefaults, components: BOSS_COMPONENTS },
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

      this.genericMovement = new MovementComponent();
      this.genericWeapon = new WeaponComponent();
      this.genericRender = new RenderComponent();
      this.genericCollision = new CollisionComponent();
      this.genericHealth = new HealthComponent();

      console.log('[EnemySystem] Generic enemy components initialized');
    } catch (error) {
      console.warn('[EnemySystem] Failed to initialize components', error);
      this.movementComponent = null;
      this.collisionComponent = null;
      this.rendererComponent = null;
      this.genericMovement = null;
      this.genericWeapon = null;
      this.genericRender = null;
      this.genericCollision = null;
      this.genericHealth = null;
      this.useComponents = false;
    }
  }

  setupRenderSystem() {
    try {
      const facade = this;
      const context = {
        facade,
        get asteroids() {
          return facade.asteroids;
        },
        get rendererComponent() {
          return facade.rendererComponent;
        },
        get useComponents() {
          return facade.useComponents;
        },
      };

      this.renderSystem = new EnemyRenderSystem(context);
      console.log('[EnemySystem] EnemyRenderSystem initialized');
    } catch (error) {
      console.warn('[EnemySystem] Failed to initialize render system', error);
      this.renderSystem = null;
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
        get spawnTimer() {
          return facade.spawnTimer;
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
      console.log('[EnemySystem] EnemySpawnSystem initialized');
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
        emitWaveStateUpdate: (...args) => facade.emitWaveStateUpdate?.(...args),
        completeCurrentWave: (...args) => facade.completeCurrentWave?.(...args),
        emitEvent: (...args) => facade.emitEvent?.(...args),
        getActiveEnemyCount: (...args) => facade.getActiveEnemyCount?.(...args),
      };

      this.damageSystem = new EnemyDamageSystem(context);
      console.log('[EnemySystem] EnemyDamageSystem initialized');
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
        get waveState() {
          return facade.waveState;
        },
        get sessionStats() {
          return facade.sessionStats;
        },
        get spawnTimer() {
          return facade.spawnTimer;
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
        get waveManager() {
          return facade.waveManager;
        },
        get useManagers() {
          return facade.useManagers;
        },
        refreshInjectedServices: (...args) =>
          facade.refreshInjectedServices?.(...args),
        getCachedPlayer: (...args) => facade.getCachedPlayer?.(...args),
        getCachedWorld: (...args) => facade.getCachedWorld?.(...args),
        getCachedPhysics: (...args) => facade.getCachedPhysics?.(...args),
        getRandomScope: (...args) => facade.getRandomScope?.(...args),
        getRandomService: (...args) => facade.getRandomService?.(...args),
        getActiveEnemyCount: (...args) => facade.getActiveEnemyCount?.(...args),
        invalidateActiveEnemyCache: (...args) =>
          facade.invalidateActiveEnemyCache?.(...args),
        releaseAsteroid: (...args) => facade.releaseAsteroid?.(...args),
        emitWaveStateUpdate: (...args) => facade.emitWaveStateUpdate?.(...args),
        completeCurrentWave: (...args) => facade.completeCurrentWave?.(...args),
        startNextWave: (...args) => facade.startNextWave?.(...args),
        spawnInitialAsteroids: (...args) =>
          facade.spawnInitialAsteroids?.(...args),
      };

      this.updateSystem = new EnemyUpdateSystem(context);
      console.log('[EnemySystem] EnemyUpdateSystem initialized');
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
    let player = this.services.player || null;

    if (!player) {
      const resolved = resolveService('player', this.dependencies);
      if (resolved) {
        this.services.player = resolved;
        this.dependencies.player = resolved;
        player = resolved;
        this._playerCacheLogged = false;
        if (this._playerLazyResolveLogEmitted !== 'success') {
        GameDebugLogger.log(
          'STATE',
          'getCachedPlayer lazy-resolved player service',
          {
            source: 'resolveService',
            success: true,
            fallback: true,
          }
        );
          this._playerLazyResolveLogEmitted = 'success';
        }
      } else if (this._playerLazyResolveLogEmitted !== 'failure') {
        GameDebugLogger.log('WARN', 'getCachedPlayer lazy resolve failed', {
          source: 'resolveService',
          success: false,
          fallback: true,
        });
        this._playerLazyResolveLogEmitted = 'failure';
      }
    } else if (this._playerLazyResolveLogEmitted) {
      GameDebugLogger.log(
        'STATE',
        'getCachedPlayer player reference confirmed after fallback',
        {
          playerPosition: this.getPlayerPositionSnapshot(player),
          lastState: this._playerLazyResolveLogEmitted,
        }
      );
      this._playerLazyResolveLogEmitted = false;
    }

    if (!this._playerCacheLogged) {
      GameDebugLogger.log('STATE', 'getCachedPlayer called', {
        hasServices: !!this.services,
        hasPlayer: !!player,
        playerPosition: player?.position || null,
        playerX: Number.isFinite(player?.x) ? player.x : null,
        playerY: Number.isFinite(player?.y) ? player.y : null,
      });
      this._playerCacheLogged = true;
    }

    return player;
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

    if (Number.isFinite(player.x) && Number.isFinite(player.y)) {
      return { x: player.x, y: player.y };
    }

    return null;
  }

  getPlayerHullRadius(player) {
    if (!player) {
      return SHIP_SIZE;
    }

    const rawHullRadius =
      typeof player.getHullBoundingRadius === 'function'
        ? player.getHullBoundingRadius()
        : player.hullRadius;

    if (Number.isFinite(rawHullRadius)) {
      return Math.max(0, rawHullRadius);
    }

    return SHIP_SIZE;
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
      invulnerable: false,
      invulnerabilityTimer: null,
      invulnerabilitySource: null,
    };
  }

  getAvailableBossMinionTypes(preferredTypes = null) {
    const rawCandidates = Array.isArray(preferredTypes) && preferredTypes.length
      ? [...preferredTypes]
      : Array.isArray(this.availableBossMinionTypes) && this.availableBossMinionTypes.length
      ? [...this.availableBossMinionTypes]
      : Array.isArray(BOSS_CONFIG?.minionTypes)
      ? [...BOSS_CONFIG.minionTypes]
      : [];

    const factory = this.factory;
    const hasFactoryCheck = factory && typeof factory.hasType === 'function';
    const enabledTypes = factory && typeof factory.getEnabledTypes === 'function'
      ? new Set(factory.getEnabledTypes())
      : null;

    const normalized = [];
    const seen = new Set();

    const isTypeAvailable = (value) => {
      if (!value) {
        return false;
      }

      const trimmed = String(value).trim();
      if (!trimmed) {
        return false;
      }

      const candidate = trimmed.toLowerCase();
      if (candidate === 'boss' || seen.has(candidate)) {
        return false;
      }

      if (hasFactoryCheck && !factory.hasType(candidate)) {
        return false;
      }

      if (enabledTypes && !enabledTypes.has(candidate)) {
        return false;
      }

      if (!ENEMY_TYPES?.[candidate] && candidate !== 'asteroid') {
        return false;
      }

      return true;
    };

    for (let i = 0; i < rawCandidates.length; i += 1) {
      const candidate = rawCandidates[i];
      if (!isTypeAvailable(candidate)) {
        continue;
      }

      const key = String(candidate).trim().toLowerCase();
      seen.add(key);
      normalized.push(key);
    }

    if (!normalized.length) {
      if (isTypeAvailable('drone')) {
        normalized.push('drone');
      } else if (isTypeAvailable('hunter')) {
        normalized.push('hunter');
      } else if (hasFactoryCheck) {
        const fallback = factory.getRegisteredTypes?.() || [];
        for (let i = 0; i < fallback.length; i += 1) {
          const candidate = fallback[i];
          if (candidate && candidate !== 'boss' && isTypeAvailable(candidate)) {
            normalized.push(String(candidate).trim().toLowerCase());
            break;
          }
        }
      }
    }

    this.availableBossMinionTypes = normalized;
    return [...normalized];
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
    this.bossHudState.invulnerable = Boolean(this.bossHudState.invulnerable);
    if (Number.isFinite(this.bossHudState.invulnerabilityTimer)) {
      this.bossHudState.invulnerabilityTimer = Math.max(
        0,
        Number(this.bossHudState.invulnerabilityTimer)
      );
    } else {
      this.bossHudState.invulnerabilityTimer = null;
    }

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

    const baseValue = ORB_VALUE || 5;
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

  /**
   * Routes enemy projectile events to the CombatSystem.
   * Called by the 'enemy-fired' event listener.
   * @param {Object} data - Projectile data from enemy weapon
   * @returns {boolean} True if routed successfully, false otherwise
   */
  handleEnemyProjectile(data) {
    const combat = this.getCachedCombat();

    if (!combat) {
      console.warn('[EnemySystem] Cannot route enemy projectile - CombatSystem not available');
      return false;
    }

    if (typeof combat.handleEnemyProjectile !== 'function') {
      console.warn('[EnemySystem] CombatSystem.handleEnemyProjectile is not a function');
      return false;
    }

    combat.handleEnemyProjectile(data);
    return true;
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
      totalAsteroids: ASTEROIDS_PER_WAVE_BASE,
      asteroidsSpawned: 0,
      asteroidsKilled: 0,
      isActive: true,
      breakTimer: 0,
      completedWaves: 0,
      timeRemaining: WAVE_DURATION,
      spawnTimer: 0,
      spawnDelay: 1.0,
      initialSpawnDone: false,
      managerTotals: { all: 0, asteroids: 0 },
      managerCounts: {
        spawned: { all: 0, asteroids: 0 },
        killed: { all: 0, asteroids: 0 },
      },
      compatibilityMode: false,
      legacyFallbackActive: false,
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

    const managerTotals = this.waveState?.managerTotals || null;
    const normalizedManagerTotals = managerTotals
      ? {
          all: Number.isFinite(managerTotals.all) ? managerTotals.all : 0,
          asteroids: Number.isFinite(managerTotals.asteroids)
            ? managerTotals.asteroids
            : 0,
        }
      : null;

    const wave = this.waveState
      ? {
          current: this.waveState.current,
          totalAsteroids: this.waveState.totalAsteroids,
          asteroidsKilled: this.waveState.asteroidsKilled,
          isActive: Boolean(this.waveState.isActive),
          breakTimer: Math.max(0, this.waveState.breakTimer),
          completedWaves: this.waveState.completedWaves,
          timeRemaining: Math.max(0, this.waveState.timeRemaining),
          managerTotals: normalizedManagerTotals,
          compatibilityMode: Boolean(this.waveState.compatibilityMode),
          legacyFallbackActive: Boolean(this.waveState.legacyFallbackActive),
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
      managerAllEnemiesTotal: normalizedManagerTotals?.all ?? 0,
      compatibilityMode: Boolean(this.waveState?.compatibilityMode),
      legacyFallbackActive: Boolean(this.waveState?.legacyFallbackActive),
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
        prev.sessionTimeSeconds === snapshot.sessionTimeSeconds &&
        prev.managerAllEnemiesTotal === snapshot.managerAllEnemiesTotal &&
        prev.compatibilityMode === snapshot.compatibilityMode &&
        prev.legacyFallbackActive === snapshot.legacyFallbackActive;

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
   * Updates wave progression through the update sub-system.
   * Throws if the update sub-system is not initialized.
   */
  updateWaveLogic(deltaTime, { skipSpawning = false } = {}) {
    if (!this.updateSystem) {
      throw new Error('[EnemySystem] UpdateSystem not initialized');
    }
    return this.updateSystem.updateWaveLogic(deltaTime, { skipSpawning });
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
  // === SISTEMA DE SPAWNING ===
  /**
   * Handles spawning ticks via the spawn sub-system.
   * Throws if the spawn sub-system is not initialized.
   */
  handleSpawning(deltaTime) {
    if (!this.spawnSystem) {
      throw new Error('[EnemySystem] SpawnSystem not initialized');
    }
    return this.spawnSystem.handleSpawning(deltaTime);
  }

  /**
   * Indicates whether a spawn should occur using the spawn sub-system rules.
   * Throws if the spawn sub-system is not initialized.
   */
  shouldSpawn() {
    if (!this.spawnSystem) {
      throw new Error('[EnemySystem] SpawnSystem not initialized');
    }
    return this.spawnSystem.shouldSpawn();
  }

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

  /**
   * Renders all registered enemies through the render sub-system.
   * Throws if the render sub-system is not initialized.
   *
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (!ctx) return;
    if (!this.renderSystem) {
      throw new Error('[EnemySystem] RenderSystem not initialized');
    }
    return this.renderSystem.render(ctx);
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
      managerTotals: {
        all: Number.isFinite(wave.managerTotals?.all)
          ? wave.managerTotals.all
          : base.managerTotals.all,
        asteroids: Number.isFinite(wave.managerTotals?.asteroids)
          ? wave.managerTotals.asteroids
          : base.managerTotals.asteroids,
      },
      managerCounts: {
        spawned: {
          all: Number.isFinite(wave.managerCounts?.spawned?.all)
            ? wave.managerCounts.spawned.all
            : base.managerCounts.spawned.all,
          asteroids: Number.isFinite(wave.managerCounts?.spawned?.asteroids)
            ? wave.managerCounts.spawned.asteroids
            : base.managerCounts.spawned.asteroids,
        },
        killed: {
          all: Number.isFinite(wave.managerCounts?.killed?.all)
            ? wave.managerCounts.killed.all
            : base.managerCounts.killed.all,
          asteroids: Number.isFinite(wave.managerCounts?.killed?.asteroids)
            ? wave.managerCounts.killed.asteroids
            : base.managerCounts.killed.asteroids,
        },
      },
      compatibilityMode:
        typeof wave.compatibilityMode === 'boolean'
          ? wave.compatibilityMode
          : base.compatibilityMode,
      legacyFallbackActive:
        typeof wave.legacyFallbackActive === 'boolean'
          ? wave.legacyFallbackActive
          : base.legacyFallbackActive,
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
      radius: safeNumber(asteroid.radius, ASTEROID_SIZES?.[asteroid.size] || 0),
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
          const registrationResult = this.registerActiveEnemy(restored, {
            skipDuplicateCheck: true,
          });
          this.warnIfWaveManagerRegistrationFailed(
            registrationResult,
            'snapshot-restore',
            restored
          );
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

    const waveManagerActive =
      this.useManagers &&
      Boolean(USE_WAVE_MANAGER) &&
      this.waveManager;

    if (waveManagerActive) {
      if (typeof this.waveManager.reset === 'function') {
        try {
          this.waveManager.reset();
        } catch (error) {
          console.error('[EnemySystem] Failed to reset WaveManager during system reset:', error);
        }
      }

      if (this.waveState) {
        this.waveState.isActive = false;
        this.waveState.breakTimer = 0;
        this.waveState.initialSpawnDone = false;
        this.waveState.asteroidsSpawned = 0;
        this.waveState.asteroidsKilled = 0;
      }
    } else {
      this.spawnInitialAsteroids(4);
    }

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
    wave.breakTimer = WAVE_BREAK_TIME;
    wave.completedWaves += 1;
    wave.spawnTimer = 0;
    wave.initialSpawnDone = false;

    const waveManagerActive =
      this.useManagers && Boolean(USE_WAVE_MANAGER) && this.waveManager;

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

    const waveManagerActive =
      this.useManagers && Boolean(USE_WAVE_MANAGER) && this.waveManager;

    let waveStarted = false;

    if (waveManagerActive) {
      if (!this.waveManager.waveInProgress) {
        waveStarted = this.waveManager.startNextWave();

        if (
          !waveStarted &&
          typeof process !== 'undefined' &&
          process.env?.NODE_ENV === 'development' &&
          typeof console !== 'undefined' &&
          typeof console.debug === 'function'
        ) {
          console.debug('[EnemySystem] WaveManager refused to start next wave');
        }
      } else {
        waveStarted = true;
      }

      if (!waveStarted) {
        this.emitWaveStateUpdate(true);
        return;
      }
    }

    const wave = this.waveState;

    if (!waveManagerActive) {
      wave.isActive = true;
    } else if (waveStarted === true) {
      wave.isActive = true;
    }

    if (!waveManagerActive) {
      wave.current += 1;
      wave.totalAsteroids = Math.floor(
        ASTEROIDS_PER_WAVE_BASE *
          Math.pow(ASTEROIDS_PER_WAVE_MULTIPLIER, wave.current - 1)
      );
      wave.totalAsteroids = Math.min(wave.totalAsteroids, 25);
      wave.asteroidsSpawned = 0;
      wave.asteroidsKilled = 0;
      wave.timeRemaining = WAVE_DURATION;
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
      invulnerable: Boolean(this.bossHudState.invulnerable),
      invulnerabilityTimer: Number.isFinite(this.bossHudState.invulnerabilityTimer)
        ? Math.max(0, Number(this.bossHudState.invulnerabilityTimer))
        : null,
      invulnerabilitySource: this.bossHudState.invulnerabilitySource || null,
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
      invulnerable: false,
      invulnerabilityTimer: null,
      invulnerabilitySource: null,
    };

    this.emitBossHudUpdate();
    this.forwardBossEvent('boss-wave-started', {
      ...data,
      wave: waveNumber,
      phaseColors,
      invulnerable: false,
      invulnerabilityTimer: null,
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
      const registrationResult = this.registerActiveEnemy(boss, {
        skipDuplicateCheck: true,
      });
      this.warnIfWaveManagerRegistrationFailed(
        registrationResult,
        'boss-event-spawn',
        boss
      );
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
    const invulnerable = Boolean(
      data.invulnerable ?? boss.invulnerable ?? this.bossHudState?.invulnerable
    );
    const invulnerabilityTimer = Number.isFinite(data.invulnerabilityTimer)
      ? Math.max(0, Number(data.invulnerabilityTimer))
      : Number.isFinite(boss.invulnerabilityTimer)
      ? Math.max(0, Number(boss.invulnerabilityTimer))
      : null;
    const invulnerabilitySource = data.invulnerabilitySource ?? null;
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
      invulnerable,
      invulnerabilityTimer,
      invulnerabilitySource,
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
      invulnerable,
      invulnerabilityTimer,
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
    const invulnerable = Boolean(
      data.invulnerable ?? boss?.invulnerable ?? this.bossHudState?.invulnerable
    );
    const invulnerabilityTimer = Number.isFinite(data.invulnerabilityTimer)
      ? Math.max(0, Number(data.invulnerabilityTimer))
      : Number.isFinite(boss?.invulnerabilityTimer)
      ? Math.max(0, Number(boss.invulnerabilityTimer))
      : null;
    const invulnerabilitySource = data.invulnerabilitySource ?? null;
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
      invulnerable,
      invulnerabilityTimer,
      invulnerabilitySource,
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
      invulnerable,
      invulnerabilityTimer,
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
      invulnerable: false,
      invulnerabilityTimer: null,
      invulnerabilitySource: 'defeated',
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
      invulnerable: false,
      invulnerabilityTimer: null,
    });

    this.releaseAsteroid(boss);

    this.sessionStats.totalKills += 1;
    if (this.waveState) {
      this.waveState.asteroidsKilled += 1;
    }

    this.emitWaveStateUpdate(true);
  }

  handleBossInvulnerabilityChanged(data = {}) {
    const boss = this.resolveBossReference(data);

    if (boss) {
      this.trackBossEnemy(boss);
    }

    const waveNumber = Number.isFinite(data.wave)
      ? Number(data.wave)
      : boss?.wave ?? this.bossHudState?.wave ?? this.waveState?.current ?? null;
    const invulnerable = Boolean(
      data.invulnerable ?? boss?.invulnerable ?? this.bossHudState?.invulnerable
    );
    const timerValue =
      data.remaining ?? data.invulnerabilityTimer ?? data.timer ?? data.timeRemaining;
    const invulnerabilityTimer = Number.isFinite(timerValue)
      ? Math.max(0, Number(timerValue))
      : Number.isFinite(boss?.invulnerabilityTimer)
      ? Math.max(0, Number(boss.invulnerabilityTimer))
      : null;
    const source = data.reason ?? data.invulnerabilitySource ?? null;

    this.bossHudState = {
      ...(this.bossHudState || this.createInitialBossHudState()),
      invulnerable,
      invulnerabilityTimer,
      invulnerabilitySource: source,
      wave: waveNumber ?? this.bossHudState?.wave ?? null,
      active: invulnerable ? true : this.bossHudState?.active,
      upcoming: invulnerable ? false : this.bossHudState?.upcoming,
    };

    GameDebugLogger.log('STATE', 'Boss invulnerability update received', {
      invulnerable,
      timer: invulnerabilityTimer,
      wave: waveNumber,
      source,
    });

    this.emitBossHudUpdate();
    this.forwardBossEvent('boss-invulnerability-changed', {
      ...data,
      enemy: boss,
      wave: waveNumber,
      invulnerable,
      invulnerabilityTimer,
      invulnerabilitySource: source,
    });
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

  handleShockwave(data) {
    if (!data || !data.position) {
      return;
    }

    const radius =
      typeof data.radius === 'number'
        ? data.radius
        : SHIELD_SHOCKWAVE_RADIUS;
    const force =
      typeof data.force === 'number'
        ? data.force
        : SHIELD_SHOCKWAVE_FORCE;

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
