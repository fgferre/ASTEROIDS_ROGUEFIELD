import {
  ASTEROID_EDGE_SPAWN_MARGIN,
  MAX_ASTEROIDS_ON_SCREEN,
  USE_WAVE_MANAGER,
  WAVEMANAGER_HANDLES_ASTEROID_SPAWN,
} from '../../../data/constants/gameplay.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../../../core/GameConstants.js';
import {
  ASTEROID_VARIANTS,
  ASTEROID_VARIANT_CHANCES,
} from '../../../data/enemies/asteroid-configs.js';
import { GamePools } from '../../../core/GamePools.js';
import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';
import { resolveEventBus } from '../../../core/serviceUtils.js';
import { Asteroid } from '../types/Asteroid.js';
import { BossEnemy } from '../types/BossEnemy.js';

const ASTEROID_POOL_ID = Symbol.for('ASTEROIDS_ROGUEFIELD:asteroidPoolId');
const FACTORY_REGISTERED_FLAG = Symbol.for(
  'ASTEROIDS_ROGUEFIELD:factoryRegistered'
);

/**
 * EnemySpawnSystem centralizes spawning logic that originally lived inside
 * EnemySystem. It mirrors the public API so callers can continue interacting
 * with EnemySystem while the heavy lifting happens here.
 */
export class EnemySpawnSystem {
  /**
   * @param {{ facade: import('../../EnemySystem.js').EnemySystem }} context
   */
  constructor(context = {}) {
    this.facade = context.facade ?? null;

    if (!this.facade) {
      GameDebugLogger.log('ERROR', 'EnemySpawnSystem missing facade reference');
    } else {
      GameDebugLogger.log('SPAWN', 'EnemySpawnSystem initialized');
    }
  }

  shouldSpawn() {
    const facade = this.facade;
    const wave = facade?.waveState;
    if (!wave || !wave.isActive) {
      return false;
    }

    return (
      wave.asteroidsSpawned < wave.totalAsteroids &&
      facade.getActiveEnemyCount() < MAX_ASTEROIDS_ON_SCREEN
    );
  }

  handleSpawning(deltaTime) {
    const facade = this.facade;
    const wave = facade?.waveState;
    if (!wave || !wave.isActive) {
      return;
    }

    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    facade.spawnTimer -= deltaTime;

    if (this.shouldSpawn() && facade.spawnTimer <= 0) {
      this.spawnAsteroid();
      const spawnRandom =
        facade.getRandomScope('spawn') || facade.getRandomService();
      const delayMultiplier =
        spawnRandom && typeof spawnRandom.range === 'function'
          ? spawnRandom.range(0.5, 1)
          : 0.5 + spawnRandom.float() * 0.5;
      facade.spawnTimer = wave.spawnDelay * delayMultiplier;
    }
  }

  spawnBoss(config = {}) {
    const facade = this.facade;
    if (!facade) {
      return null;
    }

    const waveNumber = Number.isFinite(config.wave)
      ? config.wave
      : facade.waveState?.current ?? 1;

    const scopeLabel = config.randomScope || 'boss-spawn';
    const spawnContext = facade.createScopedRandom(
      scopeLabel,
      `boss-${waveNumber}`
    );
    const spawnRandom =
      config.random ||
      spawnContext.random ||
      facade.getRandomScope(scopeLabel) ||
      facade.getRandomService();

    const spawnConfig = {
      ...config,
      wave: waveNumber,
      random: spawnRandom,
      randomScope: scopeLabel,
      randomParentScope: config.randomParentScope || 'spawn',
    };

    const minionTypes = facade.getAvailableBossMinionTypes(config.minionTypes);
    if (minionTypes.length > 0) {
      spawnConfig.minionTypes = [...minionTypes];
    }

    GameDebugLogger.log('SPAWN', 'EnemySystem.spawnBoss() called', {
      wave: waveNumber,
      hasPosition: Number.isFinite(config.x) && Number.isFinite(config.y),
      position: { x: config.x, y: config.y },
    });

    let boss = null;
    let registrationResult = null;

    if (facade.useFactory && facade.factory) {
      const factory = facade.factory;
      const canCheckType = typeof factory.hasType === 'function';
      const supportsBoss = !canCheckType || factory.hasType('boss');

      if (supportsBoss) {
        boss = this.acquireEnemyViaFactory('boss', spawnConfig);
      }
    }

    if (!boss) {
      try {
        boss = new BossEnemy(facade, spawnConfig);
        this.assignAsteroidPoolId(boss, spawnConfig.poolId);
      } catch (error) {
        console.error('[EnemySystem] Failed to instantiate boss enemy', error);
        GameDebugLogger.log('ERROR', 'Boss creation failed', {
          useFactory: facade.useFactory,
          hasFactory: !!facade.factory,
          factoryHasBossType:
            typeof facade.factory?.hasType === 'function'
              ? facade.factory.hasType('boss')
              : null,
          error: error?.message,
        });
        return null;
      }
    }

    if (!boss) {
      console.warn('[EnemySystem] Boss spawn failed: no instance created');
      GameDebugLogger.log('ERROR', 'Boss creation failed', {
        useFactory: facade.useFactory,
        hasFactory: !!facade.factory,
        factoryHasBossType:
          typeof facade.factory?.hasType === 'function'
            ? facade.factory.hasType('boss')
            : null,
      });
      return null;
    }

    if (!Number.isFinite(boss.x) || !Number.isFinite(boss.y)) {
      GameDebugLogger.log('ERROR', 'Boss has invalid position', {
        x: boss.x,
        y: boss.y,
        configX: config.x,
        configY: config.y,
      });

      const fallbackX = Number.isFinite(config.x)
        ? config.x
        : (GAME_WIDTH || 800) / 2;
      const fallbackY = Number.isFinite(config.y) ? config.y : -100;

      boss.x = fallbackX;
      boss.y = fallbackY;

      GameDebugLogger.log('STATE', 'Boss position set to fallback', {
        x: boss.x,
        y: boss.y,
      });
    }

    GameDebugLogger.log('SPAWN', 'Boss instance created', {
      id: boss.id,
      type: boss.type,
      position: { x: boss.x, y: boss.y },
      radius: boss.radius,
      health: boss.health,
      maxHealth: boss.maxHealth,
    });

    const alreadyTracked = Array.isArray(facade.asteroids)
      ? facade.asteroids.includes(boss)
      : false;
    const factoryRegistered = boss?.[FACTORY_REGISTERED_FLAG] === true;

    if (factoryRegistered) {
      registrationResult = boss;
      boss[FACTORY_REGISTERED_FLAG] = false;
    } else if (!alreadyTracked) {
      registrationResult = this.registerActiveEnemy(boss, {
        skipDuplicateCheck: true,
      });
      this.warnIfWaveManagerRegistrationFailed(
        registrationResult,
        'boss-spawn',
        boss
      );
    } else {
      registrationResult = boss;
    }

    GameDebugLogger.log('STATE', 'Boss registered', {
      success: !!registrationResult,
      activeEnemyCount: Array.isArray(facade.asteroids)
        ? facade.asteroids.length
        : 0,
    });

    boss.destroyed = false;

    const shouldApplyLegacyWaveAccounting =
      config?.skipWaveAccounting !== true &&
      (!facade.useManagers ||
        !facade._waveManagerRuntimeEnabled ||
        !Boolean(USE_WAVE_MANAGER) ||
        WAVEMANAGER_HANDLES_ASTEROID_SPAWN === false);

    if (
      facade.waveState &&
      facade.waveState.isActive &&
      shouldApplyLegacyWaveAccounting
    ) {
      facade.waveState.totalAsteroids += 1;
      facade.waveState.asteroidsSpawned += 1;
    }

    const payload = {
      enemy: boss,
      wave: waveNumber,
      config: spawnConfig,
      rewards: facade.mergeBossRewards(boss, spawnConfig.rewards || {}),
      position: { x: boss.x ?? 0, y: boss.y ?? 0 },
    };

    if (typeof facade.emitEvent === 'function') {
      facade.emitEvent('boss-spawned', payload);
    } else {
      const eventBus =
        facade?.eventBus || resolveEventBus(facade?.dependencies);
      if (eventBus?.emit) {
        eventBus.emit('boss-spawned', payload);
      } else {
        facade.handleBossSpawned(payload);
      }
    }

    return boss;
  }

  spawnAsteroid() {
    const facade = this.facade;
    if (!facade || !facade.sessionActive) {
      return null;
    }

    const spawnContext = facade.createScopedRandom('spawn', 'asteroid-spawn');
    const globalRandom = facade.getRandomService();
    const spawnRandom =
      spawnContext.random || facade.getRandomScope('spawn') || globalRandom;
    const floatRandom =
      spawnRandom && typeof spawnRandom.float === 'function'
        ? spawnRandom
        : globalRandom;
    const side =
      spawnRandom && typeof spawnRandom.int === 'function'
        ? spawnRandom.int(0, 3)
        : Math.floor(floatRandom.float() * 4);
    let x;
    let y;
    const margin =
      typeof ASTEROID_EDGE_SPAWN_MARGIN === 'number'
        ? ASTEROID_EDGE_SPAWN_MARGIN
        : 80;

    switch (side) {
      case 0:
        x =
          spawnRandom && typeof spawnRandom.range === 'function'
            ? spawnRandom.range(0, GAME_WIDTH)
            : floatRandom.float() * GAME_WIDTH;
        y = -margin;
        break;
      case 1:
        x = GAME_WIDTH + margin;
        y =
          spawnRandom && typeof spawnRandom.range === 'function'
            ? spawnRandom.range(0, GAME_HEIGHT)
            : floatRandom.float() * GAME_HEIGHT;
        break;
      case 2:
        x =
          spawnRandom && typeof spawnRandom.range === 'function'
            ? spawnRandom.range(0, GAME_WIDTH)
            : floatRandom.float() * GAME_WIDTH;
        y = GAME_HEIGHT + margin;
        break;
      default:
        x = -margin;
        y =
          spawnRandom && typeof spawnRandom.range === 'function'
            ? spawnRandom.range(0, GAME_HEIGHT)
            : floatRandom.float() * GAME_HEIGHT;
        break;
    }

    let size;
    const rand = floatRandom.float();
    if (rand < 0.5) size = 'large';
    else if (rand < 0.8) size = 'medium';
    else size = 'small';

    const waveNumber = facade.waveState?.current || 1;
    const variant = this.decideVariant(size, {
      wave: waveNumber,
      spawnType: 'spawn',
      random: facade.getRandomScope('variants'),
    });

    const asteroidRandom =
      spawnRandom && typeof spawnRandom.fork === 'function'
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

    GameDebugLogger.log('SPAWN', 'Asteroid spawned', {
      requested: { size, variant, wave: waveNumber },
      actual: {
        size: asteroid?.size,
        variant: asteroid?.variant,
        radius: asteroid?.radius,
        variantKey: asteroid?.variantConfig?.key,
      },
      match: asteroid?.size === size && asteroid?.variant === variant,
    });

    let registrationResult = null;
    if (asteroid?.[FACTORY_REGISTERED_FLAG]) {
      registrationResult = asteroid;
      asteroid[FACTORY_REGISTERED_FLAG] = false;
    } else {
      registrationResult = this.registerActiveEnemy(asteroid);
      this.warnIfWaveManagerRegistrationFailed(
        registrationResult,
        'spawn-asteroid',
        asteroid
      );
    }

    const shouldApplyLegacyWaveAccounting =
      !facade.useManagers ||
      !facade._waveManagerRuntimeEnabled ||
      !Boolean(USE_WAVE_MANAGER) ||
      WAVEMANAGER_HANDLES_ASTEROID_SPAWN === false;

    if (
      facade.waveState &&
      facade.waveState.isActive &&
      shouldApplyLegacyWaveAccounting
    ) {
      facade.waveState.asteroidsSpawned += 1;
    }

    const payload = {
      enemy: asteroid,
      type: 'asteroid',
      size,
      variant,
      wave: waveNumber,
      maxHealth: asteroid.maxHealth,
      position: { x, y },
    };

    if (typeof facade.emitEvent === 'function') {
      facade.emitEvent('enemy-spawned', payload);
    } else {
      const eventBus =
        facade?.eventBus || resolveEventBus(facade?.dependencies);
      if (eventBus?.emit) {
        eventBus.emit('enemy-spawned', payload);
      }
    }

    return asteroid;
  }

  acquireAsteroid(config = {}) {
    const facade = this.facade;
    if (!facade) {
      return null;
    }

    const scopeHint =
      config.randomScope || (config.spawnedBy ? 'fragments' : 'spawn');
    const asteroidRandom =
      config.random || facade.createScopedRandom(scopeHint, 'asteroid').random;
    const asteroidConfig = {
      ...config,
      random: asteroidRandom,
      poolId: config.poolId,
    };

    let asteroid = null;

    if (facade.useFactory && facade.factory) {
      asteroid = this.acquireEnemyViaFactory('asteroid', asteroidConfig);
      if (asteroid) {
        return asteroid;
      }
    }

    if (
      facade.usesAsteroidPool &&
      GamePools?.asteroids &&
      typeof GamePools.asteroids.acquire === 'function'
    ) {
      asteroid = GamePools.asteroids.acquire();
      if (asteroid && typeof asteroid.initialize === 'function') {
        asteroid.initialize(facade, asteroidConfig);
        this.assignAsteroidPoolId(asteroid, config.poolId);
        return asteroid;
      }
    }

    asteroid = new Asteroid(facade, asteroidConfig);
    this.assignAsteroidPoolId(asteroid, config.poolId);
    return asteroid;
  }

  acquireEnemyViaFactory(type, config = {}) {
    const facade = this.facade;
    if (!facade || !facade.factory) {
      GameDebugLogger.log(
        'WARN',
        'Factory unavailable for acquireEnemyViaFactory()',
        { type }
      );
      return null;
    }

    const factory = facade.factory;
    const hasType =
      typeof factory.hasType === 'function' ? factory.hasType(type) : true;

    if (!hasType) {
      GameDebugLogger.log('WARN', 'Factory type missing', { type });
      return null;
    }

    if (typeof factory.create !== 'function') {
      GameDebugLogger.log('ERROR', 'Factory missing create() method', {
        type,
      });
      return null;
    }

    try {
      const enemy = factory.create(type, config);
      if (!enemy) {
        return null;
      }

      this.assignAsteroidPoolId(enemy, config?.poolId);
      const registrationResult = this.registerActiveEnemy(enemy, {
        skipDuplicateCheck: true,
      });
      if (registrationResult !== false) {
        enemy[FACTORY_REGISTERED_FLAG] = true;
      }
      this.warnIfWaveManagerRegistrationFailed(
        registrationResult,
        'factory-acquire',
        enemy
      );
      return enemy;
    } catch (error) {
      console.error('[EnemySystem] Factory creation failed:', error);
      return null;
    }
  }

  registerActiveEnemy(enemy, { skipDuplicateCheck = false } = {}) {
    const facade = this.facade;
    if (!facade || !enemy) {
      return false;
    }

    const alreadyTracked = facade.asteroids.includes(enemy);

    if (!skipDuplicateCheck && alreadyTracked) {
      return enemy;
    }

    if (facade.isBossEnemy(enemy)) {
      facade.trackBossEnemy(enemy);
    }

    if (!alreadyTracked) {
      facade.asteroids.push(enemy);
      facade.invalidateActiveEnemyCache();
      facade.registerEnemyWithPhysics(enemy);
    }

    enemy.destroyed = false;

    const shouldBridgeToWaveManager =
      facade.useManagers &&
      facade.waveManager &&
      facade._waveManagerRuntimeEnabled &&
      Boolean(USE_WAVE_MANAGER) &&
      !Boolean(WAVEMANAGER_HANDLES_ASTEROID_SPAWN) &&
      typeof facade.waveManager.registerActiveEnemy === 'function';

    let waveManagerRegistered = true;

    if (shouldBridgeToWaveManager) {
      const candidateType =
        enemy?.type ||
        enemy?.enemyType ||
        enemy?.enemyKind ||
        enemy?.kind ||
        null;
      const asteroidKey =
        (facade.waveManager.enemyTypeKeys &&
          facade.waveManager.enemyTypeKeys.asteroid) ||
        'asteroid';
      const normalizedCandidate =
        typeof candidateType === 'string' ? candidateType.toLowerCase() : null;
      if (normalizedCandidate === String(asteroidKey).toLowerCase()) {
        const result = facade.waveManager.registerActiveEnemy(enemy);
        if (result === false) {
          waveManagerRegistered = false;
        }
      }
    }

    return waveManagerRegistered ? enemy : false;
  }

  warnIfWaveManagerRegistrationFailed(result, context, enemy = null) {
    const facade = this.facade;
    if (result !== false) {
      return;
    }

    const waveManagerEnabled =
      facade.useManagers &&
      facade._waveManagerRuntimeEnabled &&
      Boolean(USE_WAVE_MANAGER) &&
      !Boolean(WAVEMANAGER_HANDLES_ASTEROID_SPAWN) &&
      facade.waveManager;

    const isDevelopment =
      typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';

    if (!waveManagerEnabled || !isDevelopment) {
      return;
    }

    if (typeof console === 'undefined' || typeof console.warn !== 'function') {
      return;
    }

    console.warn('[EnemySystem] WaveManager registration failed', {
      context,
      enemyType: enemy?.type || enemy?.enemyType || null,
      enemyId: enemy?.id ?? null,
      wave: facade.waveState?.current ?? null,
    });
  }

  decideVariant(size, context = {}) {
    if (context.forcedVariant) {
      return context.forcedVariant;
    }

    const chanceConfig = ASTEROID_VARIANT_CHANCES || {};
    const variantConfig = ASTEROID_VARIANTS || {};
    const info = chanceConfig[size];

    if (!info) {
      return 'common';
    }

    const wave = context.wave ?? this.facade?.waveState?.current ?? 1;
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
      context.random ||
      this.facade.getRandomScope('variants') ||
      this.facade.getRandomService();
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
    const config = ASTEROID_VARIANT_CHANCES?.waveBonus;
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
    const variantRandom =
      this.facade.getRandomScope('variants') || this.facade.getRandomService();

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
        poolId = this.facade._nextAsteroidPoolId++;
      }
    }

    asteroid[ASTEROID_POOL_ID] = poolId;

    if (poolId >= this.facade._nextAsteroidPoolId) {
      this.facade._nextAsteroidPoolId = poolId + 1;
    }

    return poolId;
  }

  clearAsteroidPoolId(asteroid) {
    if (!asteroid || asteroid[ASTEROID_POOL_ID] == null) {
      return;
    }

    delete asteroid[ASTEROID_POOL_ID];
  }
}
