// src/modules/PhysicsSystem.js
//
// Which enemies are alive and where: tracks them from the enemy system's
// events, keeps the spatial hash up to date, answers "who is near here", and
// saves/restores that state in snapshots. The collision pairs (bullets,
// the ship's contact, the Warden's attacks, mine blasts) and their feedback
// live in ./physics/; their public methods stay here as delegates.
import { BaseSystem } from '../core/BaseSystem.js';
import { ASTEROID_SIZES, PHYSICS_CELL_SIZE } from '../core/GameConstants.js';
import { SpatialHash } from '../core/SpatialHash.js';
import { resolveService } from '../core/serviceUtils.js';
import {
  createFallbackHandler,
  validateSnapshot,
} from '../utils/StateManager.js';
import { BOSS_CONFIG } from '../data/constants/visual.js';
import { getContent, listContent } from '../content/registry.js';
import { IS_DEV } from '../core/env.js';
import {
  getBossCollisionPadding,
  getBossSpatialPadding,
  getBossSpatialRadius,
  isBossEnemy,
  resolveEnemySpatialRadius,
} from './physics/bossTuning.js';
import { MineExplosions } from './physics/MineExplosions.js';
import { ImpactFeedback } from './physics/ImpactFeedback.js';
import { BulletHits } from './physics/BulletHits.js';
import { PlayerContact } from './physics/PlayerContact.js';
import { BossAttacks } from './physics/BossAttacks.js';
import {
  ASTEROID_POOL_ID,
  applySnapshotStateToEnemy,
  serializeAsteroidForSnapshot,
} from './physics/snapshotEntries.js';

class PhysicsSystem extends BaseSystem {
  constructor(dependencies = {}) {
    super(dependencies, {
      systemName: 'PhysicsSystem',
      serviceName: 'physics',
    });
    this.enemySystem = null;
    this.cellSize = PHYSICS_CELL_SIZE || 96;
    this.maxEnemyRadius = this.computeMaxEnemyRadius();
    this.maxEnemyRadius = Math.max(this.maxEnemyRadius, getBossSpatialRadius());
    this.maxAsteroidRadius = this.maxEnemyRadius; // Legacy alias
    const activeEnemies = new Set();
    this.activeEnemies = activeEnemies;
    this.activeAsteroids = activeEnemies; // Legacy alias for backward compatibility
    this.activeBosses = new Set();
    this.bossCollisionState = new Map();

    // Each subject lives in src/modules/physics/ and gets only what it reads.
    const emit = (name, payload) => this.eventBus?.emit?.(name, payload);
    const getNearbyEnemies = (x, y, radius) =>
      this.getNearbyEnemies(x, y, radius);
    const maxEnemyRadius = () => this.maxEnemyRadius;

    this.mines = new MineExplosions({
      enemies: () => this.enemySystem ?? this.dependencies.enemies,
      emit,
      trackRadius: (payload) => this.updateMaxEnemyRadiusFromPayload(payload),
    });

    this.impacts = new ImpactFeedback({
      dependencies: this.dependencies,
      bossCollisionState: this.bossCollisionState,
      getSimulationTimeMs: () => this.getSimulationTimeMs(),
      emit,
    });

    this.bulletHits = new BulletHits({
      activeEnemies: this.activeEnemies,
      maxEnemyRadius,
      getNearbyEnemies,
      performanceMetrics: () => this.performanceMetrics,
    });

    this.contact = new PlayerContact({
      impacts: this.impacts,
      emit,
      ensureSpatialIndex: () => this.ensureSpatialIndex(),
      getNearbyEnemies,
      maxEnemyRadius,
    });

    this.bossAttacks = new BossAttacks({
      impacts: this.impacts,
      contact: this.contact,
      emit,
      resolveBossEntity: (payload) => this.resolveBossEntity(payload),
      enemySystem: () => this.enemySystem,
      getNearbyEnemies,
    });

    // New SpatialHash-based collision system
    this.spatialHash = new SpatialHash(this.cellSize, {
      maxObjects: 8,
      maxDepth: 4,
      dynamicResize: true,
    });

    // Legacy spatial index for backward compatibility
    const enemyIndex = new Map();
    this.enemyIndex = enemyIndex;
    this.asteroidIndex = enemyIndex; // Legacy alias for backward compatibility
    this.indexDirty = false;
    this.bootstrapCompleted = false;
    this.lastSpatialHashMaintenance = this.getSimulationTimeMs();
    this.missingEnemyWarningLogged = false;
    this._snapshotFallbackWarningIssued = false;
    this._handleSnapshotFallback = createFallbackHandler({
      systemName: 'PhysicsSystem',
      warningFlag: '_snapshotFallbackWarningIssued',
      onFallback: this.reset.bind(this),
    });

    // Performance tracking
    this.performanceMetrics = {
      lastUpdateTime: 0,
      collisionChecks: 0,
      spatialQueries: 0,
      frameTime: 0,
    };

    this.refreshEnemyReference({ suppressWarning: true });
  }

  attachEnemySystem(enemySystem, { force = false } = {}) {
    if (!enemySystem) {
      if (!this.missingEnemyWarningLogged) {
        console.warn(
          '[PhysicsSystem] attachEnemySystem called without enemy system instance'
        );
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

    const asteroidSizes = ASTEROID_SIZES || {};
    for (const value of Object.values(asteroidSizes)) {
      if (Number.isFinite(value)) {
        radii.push(value);
      }
    }

    for (const { config } of listContent('enemies')) {
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

    const bossRadius = BOSS_CONFIG?.radius;
    if (Number.isFinite(bossRadius)) {
      radii.push(bossRadius);
      const bossSpatialPadding = getBossSpatialPadding();
      const bossCollisionPadding = getBossCollisionPadding();
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
    this.registerEventListener('enemy-spawned', (data = {}) => {
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

    this.registerEventListener('enemy-destroyed', (data = {}) => {
      const enemy = data.enemy ?? null;

      if (enemy) {
        this.unregisterEnemy(enemy);
        if (
          getContent('enemies', enemy.type)?.explodesOnDeath &&
          data.triggerMineExplosion !== false &&
          !this.mines.hasMineExplosionBeenHandled(enemy, data.enemyId)
        ) {
          this.mines.dispatchMineExplosion(enemy, data);
        }
      }

      if (Array.isArray(data.fragments)) {
        data.fragments.forEach((fragment) => {
          this.registerEnemy(fragment);
          this.updateMaxEnemyRadiusFromPayload(fragment);
        });
      }
    });

    this.registerEventListener('mine-exploded', (payload = {}) => {
      this.mines.markMineExplosionHandled(payload.enemy, payload.enemyId);
    });

    this.registerEventListener('progression-reset', () => {
      this.reset();
    });

    this.registerEventListener('boss-defeated', (data = {}) => {
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
      enemyService = resolveService('enemies', this.dependencies);
      if (enemyService) {
        this.dependencies.enemies = enemyService;
      }
    }

    if (enemyService) {
      const changed = this.enemySystem !== enemyService;
      this.enemySystem = enemyService;
      this.bootstrapFromEnemySystem(this.enemySystem, {
        force: force || changed,
      });
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
      this.clearDerivedEnemyTrackingState();
      this.bootstrapCompleted = false;
    }

    this.enemySystem = enemySystem;

    if (this.bootstrapCompleted && !force) {
      return;
    }

    enemySystem.forEachActiveEnemy((asteroid) => {
      this.registerEnemy(asteroid);
    });
    this.bootstrapCompleted = true;
    this.warnOnBossTrackingMismatch({
      reason: 'bootstrap.forEachActiveEnemy',
    });
  }

  clearDerivedEnemyTrackingState() {
    this.activeEnemies.clear();
    this.activeBosses.clear();
    this.bossCollisionState.clear();
    this.enemyIndex.clear();
    this.spatialHash.clear();
    this.indexDirty = false;
    this.lastSpatialHashMaintenance = this.getSimulationTimeMs();
  }

  warnOnBossTrackingMismatch({ reason = 'unknown' } = {}) {
    if (!IS_DEV) {
      return;
    }

    const enemySystem = this.enemySystem;
    if (!enemySystem) {
      return;
    }

    const bosses = Array.from(enemySystem.activeBosses.values());

    const mismatches = bosses
      .filter((boss) => boss && !boss.destroyed)
      .map((boss) => ({
        id: boss.id ?? boss.bossId ?? 'unknown',
        inActiveEnemies: this.activeEnemies.has(boss),
        inActiveBosses: this.activeBosses.has(boss),
      }))
      .filter((entry) => !entry.inActiveEnemies || !entry.inActiveBosses);

    if (!mismatches.length) {
      return;
    }

    console.warn(
      `[PhysicsSystem] Boss tracking mismatch after ${reason}`,
      mismatches
    );
  }

  registerEnemy(enemy) {
    if (!enemy || enemy.destroyed) {
      return;
    }

    this.mines.clearMineExplosionTracking(enemy);

    this.updateMaxEnemyRadiusFromPayload(enemy);
    const spatialRadius = resolveEnemySpatialRadius(enemy);
    if (Number.isFinite(spatialRadius) && spatialRadius > this.maxEnemyRadius) {
      this.maxEnemyRadius = spatialRadius;
      this.maxAsteroidRadius = this.maxEnemyRadius;
    }

    if (!this.activeEnemies.has(enemy)) {
      this.activeEnemies.add(enemy);
      this.indexDirty = true;

      if (isBossEnemy(enemy)) {
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

      if (isBossEnemy(enemy)) {
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
      if (isBossEnemy(enemy)) {
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
    const radiusKeys = [
      'radius',
      'explosionRadius',
      'proximityRadius',
      'collisionRadius',
    ];

    for (let i = 0; i < radiusKeys.length; i += 1) {
      const value = payload[radiusKeys[i]];
      if (Number.isFinite(value)) {
        radiusCandidates.push(value);
      }
    }

    if (!radiusCandidates.length) {
      if (isBossEnemy(payload)) {
        const bossRadius = resolveEnemySpatialRadius(payload);
        if (Number.isFinite(bossRadius)) {
          radiusCandidates.push(bossRadius);
        }
      } else if (
        payload &&
        (payload.type === 'boss' || payload.enemyType === 'boss')
      ) {
        const bossRadius = getBossSpatialRadius();
        if (Number.isFinite(bossRadius)) {
          radiusCandidates.push(bossRadius);
        }
      }

      if (!radiusCandidates.length) {
        return;
      }
    }

    const candidateMax = Math.max(...radiusCandidates);
    if (
      !Number.isFinite(this.maxEnemyRadius) ||
      candidateMax > this.maxEnemyRadius
    ) {
      this.maxEnemyRadius = candidateMax;
      this.maxAsteroidRadius = this.maxEnemyRadius;
    }
  }

  resolveBossEntity(payload = {}) {
    if (!payload) {
      return null;
    }

    if (payload.boss && isBossEnemy(payload.boss)) {
      return payload.boss;
    }

    if (payload.enemy && isBossEnemy(payload.enemy)) {
      return payload.enemy;
    }

    if (isBossEnemy(payload)) {
      return payload;
    }

    const bossId =
      payload.bossId ??
      payload.enemyId ??
      payload.id ??
      payload.source?.bossId ??
      payload.source?.id ??
      null;

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

  /**
   * Simulation clock in milliseconds: the session time the enemy system
   * accumulates from fixed steps. Never reads the wall clock.
   */
  getSimulationTimeMs() {
    return (this.enemySystem?.sessionStats?.timeElapsed ?? 0) * 1000;
  }

  clearBossPhysicsState(reference) {
    this.impacts.clearBossPhysicsState(reference);
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
    const now = this.getSimulationTimeMs();

    for (const asteroid of this.activeEnemies) {
      if (asteroid.destroyed) {
        continue;
      }

      // Update asteroid position in spatial hash
      const spatialRadius = resolveEnemySpatialRadius(asteroid);
      if (
        Number.isFinite(asteroid.x) &&
        Number.isFinite(asteroid.y) &&
        Number.isFinite(spatialRadius)
      ) {
        this.spatialHash.update(
          asteroid,
          asteroid.x,
          asteroid.y,
          spatialRadius
        );
      }
    }

    // Cleanup the spatial hash on a fixed cadence
    if (
      now < this.lastSpatialHashMaintenance ||
      now - this.lastSpatialHashMaintenance >= 1000
    ) {
      this.spatialHash.cleanup();
      this.lastSpatialHashMaintenance = now;
    }
  }

  exportState() {
    const asteroids = [];
    for (const asteroid of this.activeEnemies) {
      const snapshot = serializeAsteroidForSnapshot(asteroid);
      if (snapshot) {
        asteroids.push(snapshot);
      }
    }

    return {
      version: 1,
      asteroids,
    };
  }

  importState(snapshot) {
    if (!validateSnapshot(snapshot, ['asteroids'])) {
      return this._handleSnapshotFallback('invalid snapshot payload');
    }

    const asteroidSnapshots = Array.isArray(snapshot.asteroids)
      ? snapshot.asteroids
      : null;

    if (!asteroidSnapshots) {
      return this._handleSnapshotFallback('missing asteroid list');
    }

    this.refreshEnemyReference({ suppressWarning: true });
    const enemySystem = this.enemySystem;
    if (!enemySystem) {
      return this._handleSnapshotFallback('enemy system unavailable');
    }

    const availableEnemies = enemySystem.getAllAsteroids();

    const enemyByPoolId = new Map();
    const liveEnemies = [];
    for (let i = 0; i < availableEnemies.length; i += 1) {
      const enemy = availableEnemies[i];
      if (!enemy || enemy.destroyed) {
        continue;
      }

      liveEnemies.push(enemy);

      const poolId = enemy[ASTEROID_POOL_ID];
      if (poolId != null) {
        enemyByPoolId.set(poolId, enemy);
      }
    }

    this.clearDerivedEnemyTrackingState();

    for (let i = 0; i < asteroidSnapshots.length; i += 1) {
      const entry = asteroidSnapshots[i];
      if (!entry || entry.poolId == null) {
        continue;
      }

      const enemy = enemyByPoolId.get(entry.poolId);
      if (!enemy || enemy.destroyed) {
        continue;
      }

      applySnapshotStateToEnemy(enemy, entry);
    }

    if (asteroidSnapshots.length > 0 && liveEnemies.length === 0) {
      return this._handleSnapshotFallback('no asteroids restored');
    }

    for (let i = 0; i < liveEnemies.length; i += 1) {
      this.registerEnemy(liveEnemies[i]);
    }

    this.bootstrapCompleted = true;
    this.indexDirty = true;
    this.lastSpatialHashMaintenance = this.getSimulationTimeMs();
    this._snapshotFallbackWarningIssued = false;
    this.warnOnBossTrackingMismatch({ reason: 'snapshot-import' });
    return true;
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

  getNearbyEnemies(x, y, radius, { includeIntangible = false } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return [];
    }

    this.performanceMetrics.spatialQueries++;

    // Use SpatialHash for efficient nearby object retrieval
    const searchRadius = Math.max(radius, this.maxEnemyRadius);
    const candidates = this.spatialHash.query(x, y, searchRadius, {
      filter: (obj) => {
        // Active enemies only; a phased Shade (`intangible`) touches nothing
        // (the radar still asks for it with `includeIntangible`).
        return (
          this.activeEnemies.has(obj) &&
          !obj.destroyed &&
          (includeIntangible || !obj.intangible)
        );
      },
      sorted: false,
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

      const effectiveRadius = resolveEnemySpatialRadius(boss);
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
    this.bulletHits.forEachBulletCollision(bullets, handler);
  }

  checkCircleCollision(x1, y1, r1, x2, y2, r2) {
    return this.bulletHits.checkCircleCollision(x1, y1, r1, x2, y2, r2);
  }

  buildPlayerCollisionContext(player) {
    return this.contact.buildPlayerCollisionContext(player);
  }

  handlePlayerAsteroidCollision(player, asteroid, enemiesSystem, options) {
    return this.contact.handlePlayerAsteroidCollision(
      player,
      asteroid,
      enemiesSystem,
      options
    );
  }

  processPlayerCollisions(player, enemiesSystem) {
    return this.contact.processPlayerCollisions(player, enemiesSystem);
  }

  handleBossChargeCollision(payload) {
    return this.bossAttacks.handleBossChargeCollision(payload);
  }

  applyBossAreaDamage(payload) {
    return this.bossAttacks.applyBossAreaDamage(payload);
  }

  reset() {
    super.reset();
    this.clearDerivedEnemyTrackingState();
    this.bootstrapCompleted = false;
    this.missingEnemyWarningLogged = false;
    this._snapshotFallbackWarningIssued = false;
    this.mines.reset();
    this.impacts.reset();
    this.refreshEnemyReference({ force: true });

    // Reset performance metrics
    this.performanceMetrics = {
      lastUpdateTime: 0,
      collisionChecks: 0,
      spatialQueries: 0,
      frameTime: 0,
    };
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
      indexCells: this.enemyIndex.size,
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
        errors.push(
          `Active asteroid not in spatial hash: ${asteroid.id || 'unknown'}`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      spatialHashValidation: validation,
    };
  }

  destroy() {
    this.clearDerivedEnemyTrackingState();
    this.enemySystem = null;
    this.bootstrapCompleted = false;
    this.missingEnemyWarningLogged = false;
    console.log('[PhysicsSystem] Destroyed');
  }
}

export default PhysicsSystem;
