import * as CONSTANTS from '../core/GameConstants.js';
import { SpatialHash } from '../core/SpatialHash.js';
import { normalizeDependencies, resolveService } from '../core/serviceUtils.js';
import { GameDebugLogger } from '../utils/dev/GameDebugLogger.js';

const ASTEROID_POOL_ID = Symbol.for('ASTEROIDS_ROGUEFIELD:asteroidPoolId');

class PhysicsSystem {
  constructor(dependencies = {}) {
    this.dependencies = normalizeDependencies(dependencies);
    this.enemySystem = null;
    this.cellSize = CONSTANTS.PHYSICS_CELL_SIZE || 96;
    this.maxEnemyRadius = this.computeMaxEnemyRadius();
    this.maxEnemyRadius = Math.max(this.maxEnemyRadius, this.getBossSpatialRadius());
    this.maxAsteroidRadius = this.maxEnemyRadius; // Legacy alias
    const activeEnemies = new Set();
    this.activeEnemies = activeEnemies;
    this.activeAsteroids = activeEnemies; // Legacy alias for backward compatibility
    this.activeBosses = new Set();
    this.bossCollisionState = new Map();

    this._handledMineExplosions = new WeakSet();
    this._handledMineExplosionIds = new Set();

    this.effectsService = this.dependencies.effects || null;

    // New SpatialHash-based collision system
    this.spatialHash = new SpatialHash(this.cellSize, {
      maxObjects: 8,
      maxDepth: 4,
      dynamicResize: true
    });

    // Legacy spatial index for backward compatibility
    const enemyIndex = new Map();
    this.enemyIndex = enemyIndex;
    this.asteroidIndex = enemyIndex; // Legacy alias for backward compatibility
    this.indexDirty = false;
    this.bootstrapCompleted = false;
    this.lastSpatialHashMaintenance = performance.now();
    this.missingEnemyWarningLogged = false;
    this._snapshotFallbackWarningIssued = false;

    // Performance tracking
    this.performanceMetrics = {
      lastUpdateTime: 0,
      collisionChecks: 0,
      spatialQueries: 0,
      frameTime: 0
    };

    if (typeof gameServices !== 'undefined') {
      gameServices.register('physics', this);
    }

    this.setupEventListeners();
    this.refreshEnemyReference({ suppressWarning: true });

    console.log('[PhysicsSystem] Initialized');
  }

  attachEnemySystem(enemySystem, { force = false } = {}) {
    if (!enemySystem) {
      if (!this.missingEnemyWarningLogged) {
        console.warn('[PhysicsSystem] attachEnemySystem called without enemy system instance');
        this.missingEnemyWarningLogged = true;
      }
      return;
    }

    this.dependencies.enemies = enemySystem;
    this.missingEnemyWarningLogged = false;
    const needsForce = force || this.enemySystem !== enemySystem;
    this.enemySystem = enemySystem;
    this.bootstrapFromEnemySystem(enemySystem, { force: needsForce });
  }

  computeMaxEnemyRadius() {
    const radii = [];

    const asteroidSizes = CONSTANTS.ASTEROID_SIZES || {};
    for (const value of Object.values(asteroidSizes)) {
      if (Number.isFinite(value)) {
        radii.push(value);
      }
    }

    const enemyTypes = CONSTANTS.ENEMY_TYPES || {};
    for (const config of Object.values(enemyTypes)) {
      if (!config || typeof config !== 'object') {
        continue;
      }

      if (Number.isFinite(config.radius)) {
        radii.push(config.radius);
      }

      if (Number.isFinite(config.explosionRadius)) {
        radii.push(config.explosionRadius);
      }

      if (Number.isFinite(config.proximityRadius)) {
        radii.push(config.proximityRadius);
      }
    }

    const bossRadius = CONSTANTS.BOSS_CONFIG?.radius;
    if (Number.isFinite(bossRadius)) {
      radii.push(bossRadius);
      const bossSpatialPadding = this.getBossSpatialPadding();
      const bossCollisionPadding = this.getBossCollisionPadding();
      if (bossSpatialPadding) {
        radii.push(bossRadius + bossSpatialPadding);
      }
      if (bossCollisionPadding) {
        radii.push(bossRadius + bossCollisionPadding);
      }
    }

    if (!radii.length) {
      return 0;
    }

    return Math.max(...radii);
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') {
      return;
    }

    gameEvents.on('enemy-spawned', (data = {}) => {
      const enemy = data.enemy ?? data;
      if (!enemy || enemy.destroyed) {
        return;
      }

      this.registerEnemy(enemy);
      this.updateMaxEnemyRadiusFromPayload(enemy);
      this.updateMaxEnemyRadiusFromPayload(data);

      if (Array.isArray(data.fragments)) {
        data.fragments.forEach((fragment) => {
          this.registerEnemy(fragment);
          this.updateMaxEnemyRadiusFromPayload(fragment);
        });
      }
    });

    gameEvents.on('enemy-destroyed', (data = {}) => {
      const enemy = data.enemy ?? null;

      if (enemy) {
        this.unregisterEnemy(enemy);
        if (
          enemy.type === 'mine' &&
          data.triggerMineExplosion !== false &&
          !this.hasMineExplosionBeenHandled(enemy, data.enemyId)
        ) {
          this.dispatchMineExplosion(enemy, data);
        }
      }

      if (Array.isArray(data.fragments)) {
        data.fragments.forEach((fragment) => {
          this.registerEnemy(fragment);
          this.updateMaxEnemyRadiusFromPayload(fragment);
        });
      }
    });

    gameEvents.on('mine-exploded', (payload = {}) => {
      this.markMineExplosionHandled(payload.enemy, payload.enemyId);
    });

    gameEvents.on('progression-reset', () => {
      this.reset();
    });

    gameEvents.on('boss-defeated', (data = {}) => {
      const boss = this.resolveBossEntity(data);
      if (boss) {
        this.clearBossPhysicsState(boss);
        this.unregisterEnemy(boss);
      } else if (data?.enemyId != null) {
        this.clearBossPhysicsState(data.enemyId);
      }
    });
  }

  refreshEnemyReference({ force = false, suppressWarning = false } = {}) {
    if (force) {
      this.bootstrapCompleted = false;
    }

    let enemyService = this.dependencies.enemies;
    if (!enemyService) {
      try {
        enemyService = resolveService('enemies', this.dependencies);
        if (enemyService) {
          this.dependencies.enemies = enemyService;
        }
      } catch (error) {
        enemyService = null;
      }
    }

    if (enemyService) {
      const changed = this.enemySystem !== enemyService;
      this.enemySystem = enemyService;
      this.bootstrapFromEnemySystem(this.enemySystem, { force: force || changed });
      this.missingEnemyWarningLogged = false;
      return;
    }

    if (this.enemySystem) {
      this.bootstrapFromEnemySystem(this.enemySystem, { force });
      return;
    }

    if (!this.missingEnemyWarningLogged && !suppressWarning) {
      console.warn('[PhysicsSystem] Enemy system dependency not available');
      this.missingEnemyWarningLogged = true;
    }
  }

  bootstrapFromEnemySystem(enemySystem, { force = false } = {}) {
    if (!enemySystem) {
      return;
    }

    if (force) {
      this.bootstrapCompleted = false;
    }

    this.enemySystem = enemySystem;

    if (this.bootstrapCompleted && !force) {
      return;
    }

    if (typeof enemySystem.forEachActiveEnemy === 'function') {
      enemySystem.forEachActiveEnemy((asteroid) => {
        this.registerEnemy(asteroid);
      });
      this.bootstrapCompleted = true;
      return;
    }

    if (typeof enemySystem.getActiveEnemies === 'function') {
      const asteroids = enemySystem.getActiveEnemies();
      if (Array.isArray(asteroids) && asteroids.length) {
        asteroids.forEach((asteroid) => {
          this.registerEnemy(asteroid);
        });
      }
      this.bootstrapCompleted = true;
      return;
    }

    if (typeof enemySystem.forEachActiveAsteroid === 'function') {
      enemySystem.forEachActiveAsteroid((asteroid) => {
        this.registerEnemy(asteroid);
      });
      this.bootstrapCompleted = true;
      return;
    }

    if (typeof enemySystem.getAsteroids === 'function') {
      const asteroids = enemySystem.getAsteroids();
      if (Array.isArray(asteroids) && asteroids.length) {
        asteroids.forEach((asteroid) => {
          this.registerEnemy(asteroid);
        });
      }
      this.bootstrapCompleted = true;
    }
  }

  registerEnemy(enemy) {
    if (!enemy || enemy.destroyed) {
      return;
    }

    this.clearMineExplosionTracking(enemy);

    this.updateMaxEnemyRadiusFromPayload(enemy);
    const spatialRadius = this.resolveEnemySpatialRadius(enemy);
    if (Number.isFinite(spatialRadius) && spatialRadius > this.maxEnemyRadius) {
      this.maxEnemyRadius = spatialRadius;
      this.maxAsteroidRadius = this.maxEnemyRadius;
    }

    if (!this.activeEnemies.has(enemy)) {
      this.activeEnemies.add(enemy);
      this.indexDirty = true;

      if (this.isBossEnemy(enemy)) {
        this.activeBosses.add(enemy);
      }

      // Add to spatial hash
      if (
        Number.isFinite(enemy.x) &&
        Number.isFinite(enemy.y) &&
        Number.isFinite(spatialRadius)
      ) {
        this.spatialHash.insert(enemy, enemy.x, enemy.y, spatialRadius);
      }
    }
  }

  registerAsteroid(asteroid) {
    return this.registerEnemy(asteroid);
  }

  unregisterEnemy(enemy) {
    if (!enemy) {
      return;
    }

    if (this.activeEnemies.delete(enemy)) {
      this.indexDirty = true;

      if (this.isBossEnemy(enemy)) {
        this.activeBosses.delete(enemy);
        this.clearBossPhysicsState(enemy);
      }

      // Remove from spatial hash
      this.spatialHash.remove(enemy);
    }
  }

  unregisterAsteroid(asteroid) {
    return this.unregisterEnemy(asteroid);
  }

  cleanupDestroyedEnemies() {
    if (!this.activeEnemies.size) {
      return;
    }

    const toRemove = [];
    this.activeEnemies.forEach((enemy) => {
      if (!enemy || enemy.destroyed) {
        toRemove.push(enemy);
      }
    });

    if (!toRemove.length) {
      return;
    }

    toRemove.forEach((enemy) => {
      this.activeEnemies.delete(enemy);
      if (this.isBossEnemy(enemy)) {
        this.activeBosses.delete(enemy);
        this.clearBossPhysicsState(enemy);
      }
    });

    this.indexDirty = true;
  }

  cleanupDestroyedAsteroids() {
    this.cleanupDestroyedEnemies();
  }

  updateMaxEnemyRadiusFromPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const radiusCandidates = [];
    const radiusKeys = ['radius', 'explosionRadius', 'proximityRadius', 'collisionRadius'];

    for (let i = 0; i < radiusKeys.length; i += 1) {
      const value = payload[radiusKeys[i]];
      if (Number.isFinite(value)) {
        radiusCandidates.push(value);
      }
    }

    if (!radiusCandidates.length) {
      if (this.isBossEnemy(payload)) {
        const bossRadius = this.resolveEnemySpatialRadius(payload);
        if (Number.isFinite(bossRadius)) {
          radiusCandidates.push(bossRadius);
        }
      } else if (payload && (payload.type === 'boss' || payload.enemyType === 'boss')) {
        const bossRadius = this.getBossSpatialRadius();
        if (Number.isFinite(bossRadius)) {
          radiusCandidates.push(bossRadius);
        }
      }

      if (!radiusCandidates.length) {
        return;
      }
    }

    const candidateMax = Math.max(...radiusCandidates);
    if (!Number.isFinite(this.maxEnemyRadius) || candidateMax > this.maxEnemyRadius) {
      this.maxEnemyRadius = candidateMax;
      this.maxAsteroidRadius = this.maxEnemyRadius;
    }
  }

  getBossPhysicsConfig() {
    return CONSTANTS.BOSS_PHYSICS_CONFIG || {};
  }

  getBossBaseRadius(boss = null) {
    const bossRadius = boss && Number.isFinite(boss.radius) ? Math.max(0, boss.radius) : NaN;
    if (Number.isFinite(bossRadius)) {
      return bossRadius;
    }

    const configRadius = CONSTANTS.BOSS_CONFIG?.radius;
    if (Number.isFinite(configRadius)) {
      return configRadius;
    }

    return 60;
  }

  getBossSpatialPadding() {
    const config = this.getBossPhysicsConfig();
    return Number.isFinite(config.spatialPadding) ? config.spatialPadding : 0;
  }

  getBossCollisionPadding() {
    const config = this.getBossPhysicsConfig();
    return Number.isFinite(config.collisionPadding) ? config.collisionPadding : 0;
  }

  getBossSpatialRadius(boss = null) {
    const base = this.getBossBaseRadius(boss);
    return base + this.getBossSpatialPadding();
  }

  resolveEnemySpatialRadius(enemy) {
    if (!enemy) {
      return 0;
    }

    if (this.isBossEnemy(enemy)) {
      const base = Math.max(this.getBossBaseRadius(enemy), Number.isFinite(enemy.radius) ? Math.max(0, enemy.radius) : 0);
      return base + this.getBossSpatialPadding();
    }

    if (Number.isFinite(enemy.radius)) {
      return Math.max(0, enemy.radius);
    }

    return 0;
  }

  resolveEnemyCollisionRadius(enemy, { includeBossPadding = true } = {}) {
    if (!enemy) {
      return 0;
    }

    if (this.isBossEnemy(enemy) && includeBossPadding) {
      const base = Math.max(this.getBossBaseRadius(enemy), Number.isFinite(enemy.radius) ? Math.max(0, enemy.radius) : 0);
      return base + this.getBossCollisionPadding();
    }

    if (Number.isFinite(enemy.radius)) {
      return Math.max(0, enemy.radius);
    }

    return 0;
  }

  isBossEnemy(enemy) {
    if (!enemy) {
      return false;
    }

    if (enemy.type === 'boss' || enemy.enemyType === 'boss') {
      return true;
    }

    if (typeof enemy.hasTag === 'function') {
      try {
        if (enemy.hasTag('boss')) {
          return true;
        }
      } catch (error) {
        // ignore
      }
    }

    const { tags } = enemy;
    if (tags) {
      if (tags instanceof Set) {
        return tags.has('boss');
      }
      if (Array.isArray(tags)) {
        return tags.includes('boss');
      }
    }

    return Boolean(enemy.isBoss);
  }

  resolveBossEntity(payload = {}) {
    if (!payload) {
      return null;
    }

    if (payload.boss && this.isBossEnemy(payload.boss)) {
      return payload.boss;
    }

    if (payload.enemy && this.isBossEnemy(payload.enemy)) {
      return payload.enemy;
    }

    if (this.isBossEnemy(payload)) {
      return payload;
    }

    const bossId =
      payload.bossId ?? payload.enemyId ?? payload.id ?? payload.source?.bossId ?? payload.source?.id ?? null;

    if (bossId == null) {
      return null;
    }

    for (const boss of this.activeBosses) {
      if (!boss) {
        continue;
      }

      if (boss.id === bossId || boss.bossId === bossId) {
        return boss;
      }
    }

    return null;
  }

  getBossCollisionCooldown(type) {
    const config = this.getBossPhysicsConfig();
    if (type === 'boss-charge') {
      return Number.isFinite(config.chargeCooldownMs) ? config.chargeCooldownMs : 240;
    }

    if (type === 'boss-area') {
      return Number.isFinite(config.areaCooldownMs) ? config.areaCooldownMs : 300;
    }

    return Number.isFinite(config.contactCooldownMs) ? config.contactCooldownMs : 120;
  }

  shouldEmitBossCollision(boss, type) {
    if (!boss) {
      return false;
    }

    const now = performance.now();
    const cooldown = this.getBossCollisionCooldown(type);
    const state = this.bossCollisionState.get(boss) || {};
    const lastTime = state[type] ?? 0;

    if (now - lastTime < cooldown) {
      return false;
    }

    state[type] = now;
    this.bossCollisionState.set(boss, state);
    return true;
  }

  clearBossPhysicsState(reference = null) {
    if (reference == null) {
      this.bossCollisionState.clear();
      return;
    }

    if (!this.bossCollisionState.size) {
      return;
    }

    if (this.bossCollisionState.delete(reference)) {
      return;
    }

    const referenceId =
      typeof reference === 'object' && reference
        ? reference.id ?? reference.bossId ?? null
        : reference;

    if (referenceId == null) {
      return;
    }

    for (const boss of this.bossCollisionState.keys()) {
      if (!boss) {
        this.bossCollisionState.delete(boss);
        continue;
      }

      if (boss.id === referenceId || boss.bossId === referenceId) {
        this.bossCollisionState.delete(boss);
      }
    }
  }

  getBossChargeKnockback(value) {
    if (Number.isFinite(value)) {
      return value;
    }

    const config = this.getBossPhysicsConfig();
    return Number.isFinite(config.chargeKnockback) ? config.chargeKnockback : 0;
  }

  getBossChargeBossSlow(value) {
    if (Number.isFinite(value)) {
      return value;
    }

    const config = this.getBossPhysicsConfig();
    return Number.isFinite(config.chargeBossSlow) ? config.chargeBossSlow : 0;
  }

  getBossChargeDamageBonus(value) {
    if (Number.isFinite(value)) {
      return value;
    }

    const config = this.getBossPhysicsConfig();
    return Number.isFinite(config.chargeDamageBonus) ? config.chargeDamageBonus : 0;
  }

  getBossChargeShake(override) {
    if (override && Number.isFinite(override.intensity) && Number.isFinite(override.duration)) {
      return override;
    }

    const config = this.getBossPhysicsConfig();
    const shake = config.chargeShake;
    if (shake && Number.isFinite(shake.intensity) && Number.isFinite(shake.duration)) {
      return shake;
    }

    return null;
  }

  getBossAreaDamage(value, boss = null) {
    if (Number.isFinite(value)) {
      return value;
    }

    const config = this.getBossPhysicsConfig();
    if (Number.isFinite(config.areaDamage)) {
      return config.areaDamage;
    }

    const base = boss?.contactDamage ?? CONSTANTS.BOSS_CONFIG?.contactDamage;
    if (Number.isFinite(base)) {
      return base * 1.1;
    }

    return 45;
  }

  getBossAreaForce(value) {
    if (Number.isFinite(value)) {
      return value;
    }

    const config = this.getBossPhysicsConfig();
    return Number.isFinite(config.areaForce) ? config.areaForce : 280;
  }

  getBossAreaRadius(value, boss = null) {
    if (Number.isFinite(value)) {
      return value;
    }

    const baseRadius = this.getBossBaseRadius(boss);
    const config = this.getBossPhysicsConfig();
    const multiplier = Number.isFinite(config.areaRadiusMultiplier) ? config.areaRadiusMultiplier : 2.2;
    return baseRadius * multiplier;
  }

  getBossAreaShake(override) {
    if (override && Number.isFinite(override.intensity) && Number.isFinite(override.duration)) {
      return override;
    }

    const config = this.getBossPhysicsConfig();
    const shake = config.areaShake;
    if (shake && Number.isFinite(shake.intensity) && Number.isFinite(shake.duration)) {
      return shake;
    }

    return null;
  }

  getBossContactShake(override) {
    if (override && Number.isFinite(override.intensity) && Number.isFinite(override.duration)) {
      return override;
    }

    const config = this.getBossPhysicsConfig();
    const shake = config.contactShake;
    if (shake && Number.isFinite(shake.intensity) && Number.isFinite(shake.duration)) {
      return shake;
    }

    return null;
  }

  emitBossPhysicsEvent(eventName, payload = {}) {
    if (typeof gameEvents === 'undefined' || !gameEvents?.emit) {
      return;
    }

    gameEvents.emit(eventName, { ...payload, processedBy: 'physics' });
  }

  getEffectsService() {
    if (this.effectsService) {
      return this.effectsService;
    }

    try {
      const effects = resolveService('effects', this.dependencies);
      if (effects) {
        this.effectsService = effects;
        return effects;
      }
    } catch (error) {
      // ignore service resolution failures
    }

    return null;
  }

  triggerScreenShake(intensity, duration, reason = 'boss-impact', payload = {}) {
    if (!Number.isFinite(intensity) || intensity <= 0 || !Number.isFinite(duration) || duration <= 0) {
      return;
    }

    const effects = this.getEffectsService();
    if (effects && typeof effects.addScreenShake === 'function') {
      try {
        effects.addScreenShake(intensity, duration);
      } catch (error) {
        // ignore effects failures
      }
    }

    this.emitBossPhysicsEvent('boss-screen-shake', {
      reason,
      intensity,
      duration,
      ...payload,
    });
  }

  handleBossCollisionFeedback(type, context = {}) {
    const boss = context.boss || context.enemy || null;
    if (!this.shouldEmitBossCollision(boss, type)) {
      return;
    }

    let shakeConfig = null;

    switch (type) {
      case 'boss-charge':
        shakeConfig = this.getBossChargeShake(context.screenShake);
        break;
      case 'boss-area':
        shakeConfig = this.getBossAreaShake(context.screenShake);
        break;
      default:
        shakeConfig = this.getBossContactShake(context.screenShake);
        break;
    }

    if (shakeConfig) {
      this.triggerScreenShake(shakeConfig.intensity, shakeConfig.duration, type, {
        bossId: boss?.id ?? null,
        playerId: context.player?.id ?? null,
        impactPosition: context.impactPosition || null,
        overlap: context.overlap ?? null,
        relativeSpeed: context.relativeSpeed ?? null,
      });
    }

    let eventName = 'boss-contact-collision';
    if (type === 'boss-charge') {
      eventName = 'boss-charge-impact';
    } else if (type === 'boss-area') {
      eventName = 'boss-area-damage';
    }

    this.emitBossPhysicsEvent(eventName, {
      type,
      boss,
      player: context.player || null,
      damage: context.damage ?? null,
      knockback: context.knockback ?? null,
      overlap: context.overlap ?? null,
      relativeSpeed: context.relativeSpeed ?? null,
      impactPosition: context.impactPosition || null,
      source: context.source || 'physics',
    });
  }

  dispatchMineExplosion(enemy, data = {}) {
    if (!enemy) {
      return;
    }

    const enemyId = data.enemyId ?? enemy.id;
    if (this.hasMineExplosionBeenHandled(enemy, enemyId)) {
      return;
    }

    const payload = this.buildMineExplosionPayload(enemy, data);
    if (!payload) {
      return;
    }

    this.markMineExplosionHandled(payload.enemy, payload.enemyId);

    this.updateMaxEnemyRadiusFromPayload(payload);

    const enemySystem = this.enemySystem ?? this.dependencies.enemies;
    if (enemySystem && typeof enemySystem.handleMineExplosion === 'function') {
      enemySystem.handleMineExplosion(payload);
      return;
    }

    // Fallback: emit event only if not already emitted by Mine itself
    if (typeof gameEvents !== 'undefined' && typeof gameEvents.emit === 'function') {
      // Prevent double-emission if Mine already emitted the event
      if (data.__emittedByMine || payload.__emittedByMine) {
        return;
      }
      gameEvents.emit('mine-exploded', payload);
    }
  }

  buildMineExplosionPayload(enemy, data = {}) {
    if (!enemy) {
      return null;
    }

    const defaults = (CONSTANTS.ENEMY_TYPES && CONSTANTS.ENEMY_TYPES.mine) || {};
    const position = data.position || {
      x: Number.isFinite(enemy.x) ? enemy.x : 0,
      y: Number.isFinite(enemy.y) ? enemy.y : 0,
    };

    const velocity = data.velocity || {
      x: Number.isFinite(enemy.vx) ? enemy.vx : 0,
      y: Number.isFinite(enemy.vy) ? enemy.vy : 0,
    };

    const radiusCandidates = [
      data.explosionRadius,
      enemy.explosionRadius,
      enemy.radius,
      defaults.explosionRadius,
      defaults.radius,
    ].filter((value) => Number.isFinite(value));

    const damageCandidates = [
      data.explosionDamage,
      enemy.explosionDamage,
      defaults.explosionDamage,
    ].filter((value) => Number.isFinite(value));

    const fallbackRadius = Number.isFinite(defaults.explosionRadius)
      ? defaults.explosionRadius
      : Number.isFinite(defaults.radius)
      ? defaults.radius
      : Number.isFinite(enemy.radius)
      ? enemy.radius
      : 0;
    const radius = radiusCandidates.length
      ? Math.max(...radiusCandidates)
      : fallbackRadius;

    const fallbackDamage = Number.isFinite(defaults.explosionDamage)
      ? defaults.explosionDamage
      : Number.isFinite(enemy.explosionDamage)
      ? enemy.explosionDamage
      : 0;
    const damage = damageCandidates.length ? damageCandidates[0] : fallbackDamage;

    return {
      enemy,
      enemyId: enemy.id,
      enemyType: enemy.type || 'mine',
      wave: data.wave ?? enemy.wave,
      position,
      velocity,
      radius,
      damage,
      cause: data.cause ?? enemy.explosionCause?.cause ?? 'detonation',
      context: data.context ?? enemy.explosionCause?.context ?? {},
      source:
        data.source ??
        {
          id: enemy.id,
          type: enemy.type,
          wave: enemy.wave,
        },
    };
  }

  hasMineExplosionBeenHandled(enemy, enemyId) {
    if (enemy && this._handledMineExplosions.has(enemy)) {
      return true;
    }

    const id = enemyId ?? enemy?.id;
    if (id != null && this._handledMineExplosionIds.has(id)) {
      return true;
    }

    return false;
  }

  markMineExplosionHandled(enemy, enemyId) {
    if (enemy && typeof enemy === 'object') {
      this._handledMineExplosions.add(enemy);
      if (enemy.id != null) {
        this._handledMineExplosionIds.add(enemy.id);
      }
    }

    if (enemyId != null) {
      this._handledMineExplosionIds.add(enemyId);
    }
  }

  clearMineExplosionTracking(enemy, enemyId) {
    if (enemy && this._handledMineExplosions) {
      this._handledMineExplosions.delete(enemy);
    }

    const id = enemyId ?? enemy?.id;
    if (id != null) {
      this._handledMineExplosionIds.delete(id);
    }
  }

  ensureSpatialIndex() {
    if (!this.indexDirty) {
      return;
    }

    if (!this.activeEnemies.size) {
      if (this.enemyIndex.size) {
        this.enemyIndex.clear();
      }
      this.indexDirty = false;
      return;
    }

    this.rebuildSpatialIndex();
  }

  rebuildSpatialIndex() {
    this.enemyIndex.clear();

    if (!this.activeEnemies.size) {
      this.indexDirty = false;
      return;
    }

    const cellSize = this.cellSize;

    this.activeEnemies.forEach((asteroid) => {
      if (!asteroid || asteroid.destroyed) {
        return;
      }

      const cellX = Math.floor(asteroid.x / cellSize);
      const cellY = Math.floor(asteroid.y / cellSize);
      const key = `${cellX}:${cellY}`;
      let bucket = this.enemyIndex.get(key);
      if (!bucket) {
        bucket = [];
        this.enemyIndex.set(key, bucket);
      }
      bucket.push(asteroid);
    });

    this.indexDirty = false;
  }

  /**
   * Updates the spatial hash with current asteroid positions.
   * This ensures collision detection uses up-to-date positions.
   */
  updateSpatialHash() {
    const now = performance.now();

    for (const asteroid of this.activeEnemies) {
      if (asteroid.destroyed) {
        continue;
      }

      // Update asteroid position in spatial hash
      const spatialRadius = this.resolveEnemySpatialRadius(asteroid);
      if (
        Number.isFinite(asteroid.x) &&
        Number.isFinite(asteroid.y) &&
        Number.isFinite(spatialRadius)
      ) {
        this.spatialHash.update(asteroid, asteroid.x, asteroid.y, spatialRadius);
      }
    }

    // Cleanup the spatial hash on a fixed cadence
    if (now - this.lastSpatialHashMaintenance >= 1000) {
      this.spatialHash.cleanup();
      this.lastSpatialHashMaintenance = now;
    }
  }

  serializeAsteroidForSnapshot(asteroid) {
    if (!asteroid || asteroid.destroyed) {
      return null;
    }

    const safeNumber = (value, fallback = 0) =>
      Number.isFinite(value) ? value : fallback;

    return {
      poolId: asteroid[ASTEROID_POOL_ID] ?? null,
      id: asteroid.id ?? null,
      x: safeNumber(asteroid.x),
      y: safeNumber(asteroid.y),
      vx: safeNumber(asteroid.vx),
      vy: safeNumber(asteroid.vy),
      radius: safeNumber(asteroid.radius),
      rotation: safeNumber(asteroid.rotation),
      rotationSpeed: safeNumber(asteroid.rotationSpeed),
      randomSeed:
        asteroid.random && typeof asteroid.random.seed === 'number'
          ? asteroid.random.seed >>> 0
          : null,
      randomScopes: asteroid.randomScopeSeeds
        ? { ...asteroid.randomScopeSeeds }
        : null,
    };
  }

  exportState() {
    const asteroids = [];
    for (const asteroid of this.activeEnemies) {
      const snapshot = this.serializeAsteroidForSnapshot(asteroid);
      if (snapshot) {
        asteroids.push(snapshot);
      }
    }

    return {
      version: 1,
      asteroids,
    };
  }

  handleSnapshotFallback(reason) {
    if (!this._snapshotFallbackWarningIssued) {
      const detail = reason ? ` (${reason})` : '';
      console.warn(
        `[PhysicsSystem] Snapshot data unavailable, performing full reset${detail}`
      );
      this._snapshotFallbackWarningIssued = true;
    }

    this.reset();
    return false;
  }

  importState(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return this.handleSnapshotFallback('invalid snapshot payload');
    }

    const asteroidSnapshots = Array.isArray(snapshot.asteroids)
      ? snapshot.asteroids
      : null;

    if (!asteroidSnapshots) {
      return this.handleSnapshotFallback('missing asteroid list');
    }

    this.refreshEnemyReference({ suppressWarning: true });
    const enemySystem = this.enemySystem;
    if (!enemySystem) {
      return this.handleSnapshotFallback('enemy system unavailable');
    }

    const availableAsteroids =
      typeof enemySystem.getAllAsteroids === 'function'
        ? enemySystem.getAllAsteroids()
        : Array.isArray(enemySystem.asteroids)
        ? enemySystem.asteroids
        : [];

    const asteroidByPoolId = new Map();
    for (let i = 0; i < availableAsteroids.length; i += 1) {
      const asteroid = availableAsteroids[i];
      if (!asteroid || asteroid.destroyed) {
        continue;
      }

      const poolId = asteroid[ASTEROID_POOL_ID];
      if (poolId != null) {
        asteroidByPoolId.set(poolId, asteroid);
      }
    }

    this.activeEnemies.clear();
    this.enemyIndex.clear();
    this.spatialHash.clear();

    let restored = 0;

    for (let i = 0; i < asteroidSnapshots.length; i += 1) {
      const entry = asteroidSnapshots[i];
      if (!entry || entry.poolId == null) {
        continue;
      }

      const asteroid = asteroidByPoolId.get(entry.poolId);
      if (!asteroid || asteroid.destroyed) {
        continue;
      }

      if (Number.isFinite(entry.x)) {
        asteroid.x = entry.x;
      }
      if (Number.isFinite(entry.y)) {
        asteroid.y = entry.y;
      }
      if (Number.isFinite(entry.vx)) {
        asteroid.vx = entry.vx;
      }
      if (Number.isFinite(entry.vy)) {
        asteroid.vy = entry.vy;
      }
      if (Number.isFinite(entry.radius)) {
        asteroid.radius = entry.radius;
      }
      if (Number.isFinite(entry.rotation)) {
        asteroid.rotation = entry.rotation;
      }
      if (Number.isFinite(entry.rotationSpeed)) {
        asteroid.rotationSpeed = entry.rotationSpeed;
      }

      if (entry.randomSeed != null && asteroid.random && typeof asteroid.random.reset === 'function') {
        asteroid.random.reset(entry.randomSeed);
      }

      if (entry.randomScopes && typeof entry.randomScopes === 'object') {
        asteroid.randomScopeSeeds = { ...entry.randomScopes };
        if (typeof asteroid.ensureRandomScopes === 'function') {
          asteroid.ensureRandomScopes();
        }
        if (typeof asteroid.reseedRandomScopes === 'function') {
          asteroid.reseedRandomScopes();
        }
      }

      this.registerEnemy(asteroid);
      restored += 1;
    }

    if (asteroidSnapshots.length > 0 && restored === 0) {
      return this.handleSnapshotFallback('no asteroids restored');
    }

    this.bootstrapCompleted = true;
    this.indexDirty = true;
    this.lastSpatialHashMaintenance = performance.now();
    this._snapshotFallbackWarningIssued = false;
    return true;
  }

  getSnapshotState() {
    return this.exportState();
  }

  restoreSnapshotState(snapshot) {
    return this.importState(snapshot);
  }

  update() {
    const startTime = performance.now();

    this.refreshEnemyReference();
    this.cleanupDestroyedEnemies();

    // Update spatial hash with current asteroid positions
    this.updateSpatialHash();

    if (!this.activeEnemies.size) {
      if (this.enemyIndex.size) {
        this.enemyIndex.clear();
      }
      this.indexDirty = false;
      this.spatialHash.clear();
      return;
    }

    this.indexDirty = true;
    this.ensureSpatialIndex();

    // Track performance
    this.performanceMetrics.frameTime = performance.now() - startTime;
    this.performanceMetrics.lastUpdateTime = performance.now();
  }

  getNearbyEnemies(x, y, radius) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return [];
    }

    this.performanceMetrics.spatialQueries++;

    // Use SpatialHash for efficient nearby object retrieval
    const searchRadius = Math.max(radius, this.maxEnemyRadius);
    const candidates = this.spatialHash.query(x, y, searchRadius, {
      filter: (obj) => {
        // Filter for active enemies only
        return this.activeEnemies.has(obj) && !obj.destroyed;
      },
      sorted: false
    });

    const candidateList = Array.isArray(candidates) ? candidates : [];

    if (!this.activeBosses.size) {
      return candidateList;
    }

    const enriched = candidateList.slice();
    const seen = new Set(candidateList);
    const detectionRadius = Math.max(0, radius);

    this.activeBosses.forEach((boss) => {
      if (!boss || boss.destroyed || !this.activeEnemies.has(boss)) {
        return;
      }

      if (seen.has(boss)) {
        return;
      }

      if (!Number.isFinite(boss.x) || !Number.isFinite(boss.y)) {
        return;
      }

      const effectiveRadius = this.resolveEnemySpatialRadius(boss);
      if (!Number.isFinite(effectiveRadius) || effectiveRadius <= 0) {
        return;
      }

      const dx = boss.x - x;
      const dy = boss.y - y;
      const maxDistance = detectionRadius + effectiveRadius;

      if (maxDistance <= 0) {
        return;
      }

      if (dx * dx + dy * dy <= maxDistance * maxDistance) {
        enriched.push(boss);
        seen.add(boss);
      }
    });

    return enriched;
  }

  getNearbyAsteroids(x, y, radius) {
    return this.getNearbyEnemies(x, y, radius);
  }

  forEachNearbyEnemy(position, radius, callback) {
    if (typeof callback !== 'function') {
      return;
    }

    const x = position?.x ?? 0;
    const y = position?.y ?? 0;
    const candidates = this.getNearbyEnemies(x, y, radius);
    for (let i = 0; i < candidates.length; i += 1) {
      callback(candidates[i]);
    }
  }

  forEachNearbyAsteroid(position, radius, callback) {
    this.forEachNearbyEnemy(position, radius, callback);
  }

  forEachBulletCollision(bullets, handler) {
    if (!Array.isArray(bullets) || typeof handler !== 'function') {
      return;
    }

    if (!this.activeEnemies.size) {
      return;
    }

    const bulletRadius = CONSTANTS.BULLET_SIZE || 0;
    const maxCheckRadius = bulletRadius + this.maxEnemyRadius;

    for (let i = 0; i < bullets.length; i += 1) {
      const bullet = bullets[i];
      if (!bullet || bullet.hit) {
        continue;
      }

      // Use spatial hash for efficient collision detection
      const candidates = this.spatialHash.query(bullet.x, bullet.y, maxCheckRadius, {
        filter: (obj) => this.activeEnemies.has(obj) && !obj.destroyed,
        sorted: false
      });

      this.performanceMetrics.collisionChecks += candidates.length;

      let closestMatch = null;
      let closestDistanceSq = Infinity;

      for (let j = 0; j < candidates.length; j += 1) {
        const asteroid = candidates[j];
        if (!asteroid) {
          continue;
        }

        // Precise collision detection
        if (this.checkCircleCollision(
          bullet.x, bullet.y, bulletRadius,
          asteroid.x, asteroid.y, asteroid.radius || 0
        )) {
          const dx = bullet.x - asteroid.x;
          const dy = bullet.y - asteroid.y;
          const distanceSq = dx * dx + dy * dy;

          if (distanceSq < closestDistanceSq) {
            closestDistanceSq = distanceSq;
            closestMatch = asteroid;
          }
        }
      }

      if (closestMatch) {
        if (closestMatch.type === 'boss') {
          const bossRadius = this.resolveEnemyCollisionRadius(closestMatch);
          const effectiveBossRadius = Number.isFinite(bossRadius)
            ? bossRadius
            : closestMatch.radius || 0;
          const distance = Math.sqrt(Math.max(0, closestDistanceSq));
          const hitRadius = (bulletRadius || 0) + effectiveBossRadius;

          GameDebugLogger.log('COLLISION', 'Bullet hit boss', {
            bulletPosition: {
              x: Math.round(bullet.x ?? 0),
              y: Math.round(bullet.y ?? 0),
            },
            bossPosition: {
              x: Math.round(closestMatch.x ?? 0),
              y: Math.round(closestMatch.y ?? 0),
            },
            distance: Number.isFinite(distance) ? Number(distance.toFixed(2)) : distance,
            hitRadius: Number.isFinite(hitRadius) ? Number(hitRadius.toFixed(2)) : hitRadius,
            damage: bullet.damage || 0,
            bossHealth: closestMatch.health,
            bossInvulnerable: !!closestMatch.invulnerable,
          });
        }

        handler(bullet, closestMatch);
      }
    }
  }

  /**
   * Checks collision between two circular objects.
   * Optimized circle-circle collision detection.
   */
  checkCircleCollision(x1, y1, r1, x2, y2, r2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    const totalRadius = r1 + r2;

    // Use squared distance to avoid expensive sqrt operation
    return (dx * dx + dy * dy) <= (totalRadius * totalRadius);
  }

  buildPlayerCollisionContext(player) {
    const shieldState =
      typeof player.getShieldState === 'function'
        ? player.getShieldState()
        : null;
    const shieldActive =
      shieldState?.isActive &&
      shieldState.maxHits > 0 &&
      shieldState.currentHits > 0;
    const impactProfile =
      shieldActive && typeof player.getShieldImpactProfile === 'function'
        ? player.getShieldImpactProfile()
        : { damage: 0, forceMultiplier: 1, level: shieldState?.level ?? 0 };

    const hullRadius =
      typeof player.getHullBoundingRadius === 'function'
        ? player.getHullBoundingRadius()
        : CONSTANTS.SHIP_SIZE;
    const padding =
      shieldActive && typeof player.getShieldPadding === 'function'
        ? player.getShieldPadding()
        : 0;

    const collisionRadius = Math.max(0, hullRadius + padding);

    return {
      shieldState,
      shieldActive,
      impactProfile,
      hullRadius,
      padding,
      collisionRadius,
    };
  }

  handlePlayerAsteroidCollision(player, asteroid, enemiesSystem, options = {}) {
    const result = { collided: false, playerDied: false };

    if (!asteroid || asteroid.destroyed || !player) {
      return result;
    }

    const {
      damageOverride = null,
      extraKnockback = 0,
      bossVelocityDamp = 0,
      damageBonus = 0,
      collisionType = null,
      radiusOverride = null,
      screenShake = null,
    } = options || {};

    const isBoss = this.isBossEnemy(asteroid);
    const collisionLabel = collisionType || (isBoss ? 'boss-contact' : 'enemy-contact');

    result.collisionType = collisionLabel;
    result.enemy = asteroid || null;
    result.isBossCollision = isBoss;

    const position = player.position;
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      return result;
    }

    const context = this.buildPlayerCollisionContext(player);
    result.playerContext = context;

    const collisionRadius = context.collisionRadius;
    let asteroidRadius = this.resolveEnemyCollisionRadius(asteroid);
    if (Number.isFinite(radiusOverride)) {
      asteroidRadius = Math.max(asteroidRadius, Math.max(0, radiusOverride));
    }

    if (collisionRadius <= 0) {
      return result;
    }

    const dx = position.x - asteroid.x;
    const dy = position.y - asteroid.y;
    const maxDistance = collisionRadius + asteroidRadius;
    const distanceSq = dx * dx + dy * dy;

    if (distanceSq >= maxDistance * maxDistance) {
      return result;
    }

    result.collided = true;
    result.enemyRadius = asteroidRadius;
    result.maxDistance = maxDistance;

    if (isBoss) {
      const contactDamage = Number.isFinite(asteroid.contactDamage)
        ? asteroid.contactDamage
        : 45;

      GameDebugLogger.log('COLLISION', 'Player collided with boss', {
        playerPosition: {
          x: Math.round(position.x ?? 0),
          y: Math.round(position.y ?? 0),
        },
        bossPosition: {
          x: Math.round(asteroid.x ?? 0),
          y: Math.round(asteroid.y ?? 0),
        },
        distance: Number.isFinite(distanceSq)
          ? Number(Math.sqrt(Math.max(0, distanceSq)).toFixed(2))
          : null,
        contactDamage,
      });
    }

    const distance = Math.sqrt(distanceSq);
    const nx = distance > 0 ? dx / distance : 0;
    const ny = distance > 0 ? dy / distance : 0;
    const overlap = maxDistance - distance;
    const overlapAmount = overlap > 0 ? overlap : 0;
    const impactX = asteroid.x + nx * asteroidRadius;
    const impactY = asteroid.y + ny * asteroidRadius;

    result.distance = distance;
    result.distanceSq = distanceSq;
    result.collisionNormal = { x: nx, y: ny };
    result.overlap = overlapAmount;
    result.impactPosition = { x: impactX, y: impactY };

    if (overlap > 0) {
      const playerPushRatio = context.shieldActive ? 0.18 : 0.5;
      const asteroidPushRatio = 1 - playerPushRatio;
      const playerShift = overlapAmount * playerPushRatio;
      const asteroidShift = overlapAmount * asteroidPushRatio;
      player.position.x += nx * playerShift;
      player.position.y += ny * playerShift;
      asteroid.x -= nx * asteroidShift;
      asteroid.y -= ny * asteroidShift;
      result.separationApplied = {
        player: playerShift,
        enemy: asteroidShift,
      };
    }

    const playerMass = context.shieldActive
      ? CONSTANTS.SHIP_MASS * Math.max(context.impactProfile.forceMultiplier, 1)
      : CONSTANTS.SHIP_MASS;
    const rvx = asteroid.vx - player.velocity.vx;
    const rvy = asteroid.vy - player.velocity.vy;
    const velAlongNormal = rvx * nx + rvy * ny;

    if (velAlongNormal < 0) {
      const bounce = context.shieldActive
        ? CONSTANTS.SHIELD_COLLISION_BOUNCE
        : 0.2;
      const invMass1 = 1 / Math.max(playerMass, 1);
      const invMass2 = 1 / Math.max(asteroid.mass || 1, 1);
      let j = (-(1 + bounce) * velAlongNormal) / (invMass1 + invMass2);
      if (context.shieldActive) {
        j *= Math.max(context.impactProfile.forceMultiplier, 1);
      }

      const jx = j * nx;
      const jy = j * ny;

      player.velocity.vx -= jx * invMass1;
      player.velocity.vy -= jy * invMass1;
      asteroid.vx += jx * invMass2;
      asteroid.vy += jy * invMass2;
    }

    if (Number.isFinite(extraKnockback) && extraKnockback !== 0) {
      const impulse = extraKnockback / Math.max(playerMass, 1);
      player.velocity.vx += nx * impulse;
      player.velocity.vy += ny * impulse;
      result.extraKnockbackApplied = extraKnockback;
    }

    if (isBoss && Number.isFinite(bossVelocityDamp) && bossVelocityDamp !== 0) {
      const mass = Math.max(asteroid.mass || 1, 1);
      const damp = bossVelocityDamp / mass;
      asteroid.vx -= nx * damp;
      asteroid.vy -= ny * damp;
      result.bossVelocityDampApplied = bossVelocityDamp;
    }

    const relSpeed = Math.hypot(
      asteroid.vx - player.velocity.vx,
      asteroid.vy - player.velocity.vy
    );
    result.relativeSpeed = relSpeed;

    const finalizeBossFeedback = (damageValue) => {
      if (!isBoss) {
        return;
      }

      this.handleBossCollisionFeedback(collisionLabel, {
        boss: asteroid,
        player,
        damage: damageValue,
        overlap: overlapAmount,
        relativeSpeed: relSpeed,
        impactPosition: result.impactPosition,
        knockback: Number.isFinite(extraKnockback) ? extraKnockback : null,
        screenShake,
      });
    };

    if (player.invulnerableTimer > 0) {
      finalizeBossFeedback(0);
      return result;
    }

    const previousShieldHits = context.shieldState?.currentHits ?? 0;
    const prevShieldActive = context.shieldActive;

    const baseDamage = 12;
    const momentumFactor = (asteroid.mass * relSpeed) / 120;
    let rawDamage = baseDamage + momentumFactor + (Number.isFinite(damageBonus) ? damageBonus : 0);
    let damage = Math.max(3, Math.floor(rawDamage));
    if (Number.isFinite(damageOverride)) {
      damage = Math.max(0, Math.floor(damageOverride));
    }
    result.damage = damage;
    const remaining =
      typeof player.takeDamage === 'function'
        ? player.takeDamage(damage)
        : undefined;
    result.remainingHealth = typeof remaining === 'number' ? remaining : null;

    const newShieldState =
      typeof player.getShieldState === 'function'
        ? player.getShieldState()
        : null;

    const shieldAbsorbedHit =
      prevShieldActive &&
      (!newShieldState?.isActive ||
        (typeof newShieldState.currentHits === 'number' &&
          newShieldState.currentHits < previousShieldHits));

    if (shieldAbsorbedHit) {
      const boost =
        CONSTANTS.SHIELD_REFLECT_SPEED *
        Math.max(context.impactProfile.forceMultiplier, 1);
      asteroid.vx -= nx * boost;
      asteroid.vy -= ny * boost;

      const cooldown = CONSTANTS.SHIELD_HIT_GRACE_TIME;
      if (
        asteroid.shieldHitCooldown === undefined ||
        !Number.isFinite(asteroid.shieldHitCooldown)
      ) {
        asteroid.shieldHitCooldown = 0;
      }

      if (asteroid.shieldHitCooldown <= 0) {
        if (
          enemiesSystem &&
          typeof enemiesSystem.applyDamage === 'function'
        ) {
          enemiesSystem.applyDamage(asteroid, context.impactProfile.damage);
        }
        asteroid.shieldHitCooldown = cooldown;
      }

      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('shield-deflected', {
          position: { x: player.position.x, y: player.position.y },
          normal: { x: nx, y: ny },
          level: context.impactProfile.level || context.shieldState?.level || 0,
          intensity: Math.max(context.impactProfile.forceMultiplier, 1),
        });
      }
    }

    if (typeof remaining !== 'number') {
      return result;
    }

    if (typeof player.setInvulnerableTimer === 'function') {
      player.setInvulnerableTimer(0.5);
    } else {
      player.invulnerableTimer = 0.5;
    }

    finalizeBossFeedback(damage);

    if (!isBoss && screenShake && Number.isFinite(screenShake.intensity) && Number.isFinite(screenShake.duration)) {
      this.triggerScreenShake(screenShake.intensity, screenShake.duration, screenShake.reason || collisionLabel, {
        playerId: player?.id ?? null,
        enemyId: asteroid?.id ?? null,
        impactPosition: result.impactPosition,
      });
    }

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('player-took-damage', {
        damage,
        remaining,
        max: player.maxHealth,
        position: { ...player.position },
        playerPosition: { x: player.position.x, y: player.position.y },
        damageSource: { x: asteroid.x, y: asteroid.y },
      });
    }

    if (remaining <= 0) {
      result.playerDied = true;
    }

    return result;
  }

  handleBossChargeCollision(payload = {}) {
    const boss = this.resolveBossEntity(payload);
    const player = payload?.player ?? payload?.target ?? null;
    const enemiesSystem = payload?.enemiesSystem ?? this.enemySystem ?? null;

    const outcome = {
      type: 'boss-charge',
      boss,
      player,
      processed: false,
      processedBy: 'physics',
    };

    if (!boss || !player) {
      outcome.reason = 'missing-actor';
      return outcome;
    }

    const options = {
      damageOverride: Number.isFinite(payload.damage) ? payload.damage : null,
      extraKnockback: this.getBossChargeKnockback(payload.knockback),
      bossVelocityDamp: this.getBossChargeBossSlow(payload.bossSlow),
      damageBonus: this.getBossChargeDamageBonus(payload.damageBonus),
      collisionType: 'boss-charge',
      radiusOverride: Number.isFinite(payload.radius)
        ? payload.radius
        : Number.isFinite(payload.collisionRadius)
        ? payload.collisionRadius
        : null,
      screenShake: payload.screenShake || null,
    };

    const collision = this.handlePlayerAsteroidCollision(
      player,
      boss,
      enemiesSystem,
      options
    );

    return {
      ...collision,
      ...outcome,
      processed: true,
    };
  }

  applyBossAreaDamage(payload = {}) {
    const boss = this.resolveBossEntity(payload);
    const basePosition = payload.position ||
      (boss
        ? { x: boss.x ?? 0, y: boss.y ?? 0 }
        : null);

    const summary = {
      type: 'boss-area',
      boss,
      position: basePosition ? { ...basePosition } : null,
      radius: null,
      damage: null,
      hits: [],
      playerHit: null,
      processed: false,
      processedBy: 'physics',
    };

    if (!basePosition || !Number.isFinite(basePosition.x) || !Number.isFinite(basePosition.y)) {
      summary.reason = 'invalid-position';
      return summary;
    }

    const radius = this.getBossAreaRadius(payload.radius, boss);
    if (!Number.isFinite(radius) || radius <= 0) {
      summary.reason = 'invalid-radius';
      return summary;
    }

    const damage = this.getBossAreaDamage(payload.damage, boss);
    const force = this.getBossAreaForce(payload.force);
    const disableFalloff = Boolean(payload.disableFalloff);
    const includePlayer = payload.includePlayer !== false;
    const player = includePlayer ? payload.player ?? null : null;
    const enemiesSystem = payload.enemiesSystem ?? this.enemySystem ?? null;

    summary.radius = radius;
    summary.damage = damage;
    summary.processed = true;

    const originX = basePosition.x;
    const originY = basePosition.y;
    const radiusSq = radius * radius;

    const candidates = this.getNearbyEnemies(originX, originY, radius);

    for (let i = 0; i < candidates.length; i += 1) {
      const enemy = candidates[i];
      if (!enemy || enemy.destroyed || enemy === boss) {
        continue;
      }

      if (!Number.isFinite(enemy.x) || !Number.isFinite(enemy.y)) {
        continue;
      }

      const dx = enemy.x - originX;
      const dy = enemy.y - originY;
      const distanceSq = dx * dx + dy * dy;
      const effectiveRadius = this.resolveEnemyCollisionRadius(enemy);
      const threshold = radius + effectiveRadius;
      if (distanceSq > threshold * threshold) {
        continue;
      }

      const distance = Math.sqrt(distanceSq);
      const falloffDistance = Math.max(0, distance - effectiveRadius);
      const falloff = disableFalloff ? 1 : 1 - Math.min(falloffDistance / radius, 1);
      const scaledDamage = Math.max(0, damage * falloff);
      if (scaledDamage <= 0) {
        continue;
      }

      if (typeof enemy.takeDamage === 'function') {
        try {
          enemy.takeDamage(scaledDamage, { source: boss, type: 'boss-area' });
        } catch (error) {
          // ignore individual enemy damage errors
        }
      } else if (enemiesSystem && typeof enemiesSystem.applyDamage === 'function') {
        enemiesSystem.applyDamage(enemy, scaledDamage);
      }

      let knockback = 0;
      if (Number.isFinite(force) && distance > 0) {
        const impulse = (force * falloff) / Math.max(enemy.mass || 1, 1);
        const nx = distance > 0 ? dx / Math.max(distance, 0.001) : 0;
        const ny = distance > 0 ? dy / Math.max(distance, 0.001) : 0;
        enemy.vx += nx * impulse;
        enemy.vy += ny * impulse;
        knockback = impulse;
      }

      summary.hits.push({
        enemy,
        damage: scaledDamage,
        distance,
        falloff,
        knockback,
      });
    }

    if (player && player.position && Number.isFinite(player.position.x) && Number.isFinite(player.position.y)) {
      const playerContext = this.buildPlayerCollisionContext(player);
      const playerRadius = playerContext.collisionRadius;
      if (playerRadius > 0) {
        const dx = player.position.x - originX;
        const dy = player.position.y - originY;
        const distanceSq = dx * dx + dy * dy;
        const threshold = radius + playerRadius;

        if (distanceSq <= threshold * threshold) {
          const distance = Math.sqrt(distanceSq);
          const falloffDistance = Math.max(0, distance - playerRadius);
          const falloff = disableFalloff ? 1 : 1 - Math.min(falloffDistance / radius, 1);
          const scaledDamage = Math.max(0, Math.floor(damage * falloff));
          const nx = distance > 0 ? dx / Math.max(distance, 0.001) : 0;
          const ny = distance > 0 ? dy / Math.max(distance, 0.001) : 0;
          const playerMass = playerContext.shieldActive
            ? CONSTANTS.SHIP_MASS * Math.max(playerContext.impactProfile.forceMultiplier, 1)
            : CONSTANTS.SHIP_MASS;

          const playerResult = {
            player,
            distance,
            falloff,
            damage: scaledDamage,
            knockback: 0,
          };

          if (Number.isFinite(force) && distance > 0) {
            const impulse = (force * falloff) / Math.max(playerMass, 1);
            player.velocity.vx += nx * impulse;
            player.velocity.vy += ny * impulse;
            playerResult.knockback = impulse;
          }

          if (
            scaledDamage > 0 &&
            (!player.invulnerableTimer || player.invulnerableTimer <= 0)
          ) {
            const remaining =
              typeof player.takeDamage === 'function'
                ? player.takeDamage(scaledDamage)
                : null;
            playerResult.remainingHealth =
              typeof remaining === 'number' ? remaining : null;

            if (typeof player.setInvulnerableTimer === 'function') {
              player.setInvulnerableTimer(0.4);
            } else {
              player.invulnerableTimer = 0.4;
            }

            if (typeof gameEvents !== 'undefined') {
              gameEvents.emit('player-took-damage', {
                damage: scaledDamage,
                remaining,
                max: player.maxHealth,
                position: { ...player.position },
                playerPosition: { x: player.position.x, y: player.position.y },
                damageSource: { x: originX, y: originY },
              });
            }

            if (typeof remaining === 'number' && remaining <= 0) {
              playerResult.playerDied = true;
            }
          } else {
            playerResult.skipped = true;
          }

          summary.playerHit = playerResult;
        }
      }
    }

    if (boss) {
      this.handleBossCollisionFeedback('boss-area', {
        boss,
        player: summary.playerHit?.player ?? player ?? null,
        damage,
        overlap: null,
        relativeSpeed: null,
        impactPosition: summary.position,
        screenShake: payload.screenShake || null,
      });
    } else {
      this.emitBossPhysicsEvent('boss-area-damage', {
        type: 'boss-area',
        position: summary.position,
        radius,
        damage,
        hits: summary.hits.length,
      });
    }

    return summary;
  }

  processPlayerCollisions(player, enemiesSystem) {
    const summary = { collisions: 0, playerDied: false };

    if (!player) {
      return summary;
    }

    const position = player.position;
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      return summary;
    }

    this.ensureSpatialIndex();

    const context = this.buildPlayerCollisionContext(player);
    const queryRadius = Math.max(
      0,
      context.collisionRadius + (this.maxEnemyRadius || 0)
    );

    if (queryRadius <= 0) {
      return summary;
    }

    const candidates = this.getNearbyEnemies(
      position.x,
      position.y,
      queryRadius
    );

    if (!candidates.length) {
      return summary;
    }

    for (let i = 0; i < candidates.length; i += 1) {
      const asteroid = candidates[i];
      const collision = this.handlePlayerAsteroidCollision(
        player,
        asteroid,
        enemiesSystem
      );

      if (collision.collided) {
        summary.collisions += 1;
      }

      if (collision.playerDied) {
        summary.playerDied = true;
        break;
      }
    }

    return summary;
  }

  reset() {
    this.activeEnemies.clear();
    this.enemyIndex.clear();
    this.spatialHash.clear();
    this.indexDirty = false;
    this.bootstrapCompleted = false;
    this.lastSpatialHashMaintenance = performance.now();
    this.missingEnemyWarningLogged = false;
    this._snapshotFallbackWarningIssued = false;
    this._handledMineExplosions = new WeakSet();
    this._handledMineExplosionIds.clear();
    this.activeBosses.clear();
    this.bossCollisionState.clear();
    this.effectsService = this.dependencies.effects || null;
    this.refreshEnemyReference({ force: true });

    // Reset performance metrics
    this.performanceMetrics = {
      lastUpdateTime: 0,
      collisionChecks: 0,
      spatialQueries: 0,
      frameTime: 0
    };

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('physics-reset');
    }

    console.log('[PhysicsSystem] Reset');
  }

  /**
   * Gets performance metrics for debugging and optimization.
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      spatialHashStats: this.spatialHash.getStats(),
      activeEnemies: this.activeEnemies.size,
      activeAsteroids: this.activeEnemies.size,
      indexCells: this.enemyIndex.size
    };
  }

  /**
   * Validates spatial hash consistency with active asteroids.
   */
  validateSpatialHash() {
    const validation = this.spatialHash.validate();
    const errors = [...validation.errors];

    // Check if all active asteroids are in spatial hash
    for (const asteroid of this.activeEnemies) {
      if (!asteroid.destroyed && !this.spatialHash.objects.has(asteroid)) {
        errors.push(`Active asteroid not in spatial hash: ${asteroid.id || 'unknown'}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      spatialHashValidation: validation
    };
  }

  destroy() {
    this.activeEnemies.clear();
    this.enemyIndex.clear();
    this.indexDirty = false;
    this.enemySystem = null;
    this.bootstrapCompleted = false;
    this.missingEnemyWarningLogged = false;
    console.log('[PhysicsSystem] Destroyed');
  }
}

export default PhysicsSystem;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PhysicsSystem;
}
