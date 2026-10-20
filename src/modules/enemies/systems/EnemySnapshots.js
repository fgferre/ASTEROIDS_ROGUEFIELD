// src/modules/enemies/systems/EnemySnapshots.js
// EnemySystem's save and restore: each rock, support enemy and Warden on the
// field, and the whole system around them (exportState / importState).
import RandomService from '../../../core/RandomService.js';
import { ASTEROID_SIZES } from '../../../core/GameConstants.js';
import { WARDEN_CLASSES, wardenFactoryKey } from '../types/wardens.js';
import { getContent } from '../../../content/registry.js';
import { recipeEnemyClass } from '../types/RecipeEnemy.js';
import {
  safeNumber,
  deepClone,
  shallowClone,
  validateSnapshot,
} from '../../../utils/StateManager.js';

export class EnemySnapshots {
  /**
   * @param {object} kit What a snapshot reads and restores on EnemySystem:
   *   bosses, enemyRandom and field (its boss, random-scope and field
   *   modules); getters and
   *   setters for asteroids, sessionStats, sessionActive and the two
   *   restore flags; getWaveState, getWaveManager, getFactory, getUseFactory;
   *   and the calls named below, each forwarded as is.
   */
  constructor(kit) {
    this.kit = kit;
    this.bosses = kit.bosses;
    this.enemyRandom = kit.enemyRandom;
    this.field = kit.field;
  }

  // EnemySystem's state and calls, under the names the snapshot code uses.
  get asteroids() {
    return this.kit.getAsteroids();
  }

  set asteroids(asteroids) {
    this.kit.setAsteroids(asteroids);
  }

  get sessionStats() {
    return this.kit.getSessionStats();
  }

  set sessionStats(sessionStats) {
    this.kit.setSessionStats(sessionStats);
  }

  get sessionActive() {
    return this.kit.getSessionActive();
  }

  set sessionActive(sessionActive) {
    this.kit.setSessionActive(sessionActive);
  }

  set _lastWaveManagerCompletionHandled(wave) {
    this.kit.setLastWaveManagerCompletionHandled(wave);
  }

  set _snapshotFallbackWarningIssued(issued) {
    this.kit.setSnapshotFallbackWarningIssued(issued);
  }

  get waveState() {
    return this.kit.getWaveState();
  }

  get waveManager() {
    return this.kit.getWaveManager();
  }

  get factory() {
    return this.kit.getFactory();
  }

  get useFactory() {
    return this.kit.getUseFactory();
  }

  createInitialSessionStats() {
    return this.kit.createInitialSessionStats();
  }

  isBossEnemy(enemy) {
    return this.bosses.isBossEnemy(enemy);
  }

  assignAsteroidPoolId(...args) {
    return this.kit.assignAsteroidPoolId(...args);
  }

  acquireAsteroid(config) {
    return this.kit.acquireAsteroid(config);
  }

  acquireEnemyViaFactory(type, config) {
    return this.kit.acquireEnemyViaFactory(type, config);
  }

  registerActiveEnemy(...args) {
    return this.kit.registerActiveEnemy(...args);
  }

  warnIfWaveManagerRegistrationFailed(...args) {
    return this.kit.warnIfWaveManagerRegistrationFailed(...args);
  }

  releaseAllAsteroidsToPool() {
    return this.field.releaseAllAsteroidsToPool();
  }

  reseedRandomScopes(options) {
    return this.enemyRandom.reseedRandomScopes(options);
  }

  invalidateActiveEnemyCache() {
    return this.field.invalidateActiveEnemyCache();
  }

  syncPhysicsIntegration(force) {
    return this.kit.syncPhysicsIntegration(force);
  }

  _handleSnapshotFallback(reason) {
    return this.kit.handleSnapshotFallback(reason);
  }

  // Enemies built outside the factory still belong to EnemySystem.
  createEnemy(EnemyClass, config) {
    return this.kit.createEnemy(EnemyClass, config);
  }

  cloneSessionStatsForSnapshot(stats = this.sessionStats) {
    if (!stats) {
      return null;
    }

    const base = this.createInitialSessionStats();
    return {
      totalKills: safeNumber(stats.totalKills, base.totalKills),
      timeElapsed: safeNumber(stats.timeElapsed, base.timeElapsed),
      timeline: (stats.timeline ?? base.timeline).map((event) => ({
        ...event,
      })),
    };
  }

  captureAsteroidSnapshot(asteroid) {
    if (!asteroid || asteroid.destroyed) {
      return null;
    }

    const type = asteroid.type || 'asteroid';
    if (type !== 'asteroid') {
      return null;
    }

    const poolId = this.assignAsteroidPoolId(asteroid);
    const snapshot = {
      poolId,
      id: asteroid.id || null,
      type,
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
      crackSeed: Number.isFinite(asteroid.crackSeed)
        ? asteroid.crackSeed
        : null,
      crackStage: Number.isFinite(asteroid.crackStage)
        ? asteroid.crackStage
        : 0,
      randomSeed:
        asteroid.random && typeof asteroid.random.seed === 'number'
          ? asteroid.random.seed >>> 0
          : null,
      randomScopes: asteroid.randomScopeSeeds
        ? shallowClone(asteroid.randomScopeSeeds)
        : null,
      variantState: asteroid.variantState
        ? deepClone(asteroid.variantState)
        : null,
      visualState: asteroid.visualState
        ? deepClone(asteroid.visualState)
        : null,
    };

    return snapshot;
  }

  captureBossSnapshot(boss) {
    if (!boss || boss.destroyed) {
      return null;
    }

    const poolId = this.assignAsteroidPoolId(boss);
    return {
      poolId,
      id: boss.id || null,
      type: boss.type || 'boss',
      bossKind: boss.bossKind || 'prime',
      wave: safeNumber(boss.wave, this.waveState?.current || 1),
      x: safeNumber(boss.x),
      y: safeNumber(boss.y),
      vx: safeNumber(boss.vx),
      vy: safeNumber(boss.vy),
      rotation: safeNumber(boss.rotation),
      rotationSpeed: safeNumber(boss.rotationSpeed),
      radius: safeNumber(boss.radius),
      health: safeNumber(boss.health),
      maxHealth: safeNumber(boss.maxHealth),
      currentPhase: safeNumber(boss.currentPhase, 0),
      phaseCount: safeNumber(boss.phaseCount, null),
      invulnerable: Boolean(boss.invulnerable),
      invulnerabilityTimer: safeNumber(boss.invulnerabilityTimer, null),
    };
  }

  captureSupportEnemySnapshot(enemy) {
    if (!enemy || enemy.destroyed) {
      return null;
    }

    const poolId = this.assignAsteroidPoolId(enemy);
    return {
      poolId,
      id: enemy.id || null,
      type: enemy.type || null,
      wave: safeNumber(enemy.wave, this.waveState?.current || 1),
      x: safeNumber(enemy.x),
      y: safeNumber(enemy.y),
      vx: safeNumber(enemy.vx),
      vy: safeNumber(enemy.vy),
      rotation: safeNumber(enemy.rotation),
      rotationSpeed: safeNumber(enemy.rotationSpeed),
      radius: safeNumber(enemy.radius),
      health: safeNumber(enemy.health),
      maxHealth: safeNumber(enemy.maxHealth),
      spawnedBy: enemy.spawnedBy ?? null,
      spawnedByBossId: enemy.spawnedByBossId ?? null,
    };
  }

  applyAsteroidSnapshot(snapshot) {
    if (!snapshot || snapshot.destroyed) {
      return null;
    }

    const snapshotType = snapshot.type || 'asteroid';
    if (snapshotType !== 'asteroid') {
      return null;
    }

    const randomSeed = Number.isFinite(snapshot.randomSeed)
      ? snapshot.randomSeed
      : null;
    const randomInstance =
      randomSeed !== null ? new RandomService(randomSeed) : null;

    const config = {
      id: snapshot.id || undefined,
      size: snapshot.size || 'small',
      variant: snapshot.variant || 'common',
      wave: safeNumber(snapshot.wave, this.waveState?.current || 1),
      generation: safeNumber(snapshot.generation, 0),
      spawnedBy: snapshot.spawnedBy ?? null,
      x: safeNumber(snapshot.x, 0),
      y: safeNumber(snapshot.y, 0),
      vx: safeNumber(snapshot.vx, 0),
      vy: safeNumber(snapshot.vy, 0),
      rotation: safeNumber(snapshot.rotation, 0),
      rotationSpeed: safeNumber(snapshot.rotationSpeed, 0),
      random: randomInstance,
      randomScope: 'snapshot',
      poolId: snapshot.poolId,
    };

    const asteroid = this.acquireAsteroid(config);
    if (!asteroid) {
      return null;
    }

    const radius = safeNumber(snapshot.radius, null);
    if (radius !== null) {
      asteroid.radius = radius;
    }
    const maxHealth = safeNumber(snapshot.maxHealth, null);
    if (maxHealth !== null) {
      asteroid.maxHealth = maxHealth;
    }
    const health = safeNumber(snapshot.health, null);
    if (health !== null) {
      asteroid.health = health;
    }
    asteroid.destroyed = Boolean(snapshot.destroyed);

    const spawnTime = safeNumber(snapshot.spawnTime, null);
    if (spawnTime !== null) {
      asteroid.spawnTime = spawnTime;
    }

    if (Number.isFinite(snapshot.crackSeed)) {
      asteroid.crackSeed = snapshot.crackSeed;
    }

    asteroid.crackStage = safeNumber(snapshot.crackStage, 0);

    if (snapshot.variantState && typeof snapshot.variantState === 'object') {
      asteroid.variantState = deepClone(snapshot.variantState);
    }

    if (snapshot.visualState && typeof snapshot.visualState === 'object') {
      asteroid.visualState = deepClone(snapshot.visualState);
    }

    if (snapshot.randomScopes && typeof snapshot.randomScopes === 'object') {
      const randomScopesClone = shallowClone(snapshot.randomScopes);
      if (randomScopesClone) {
        asteroid.randomScopeSeeds = randomScopesClone;
        if (typeof asteroid.ensureRandomScopes === 'function') {
          asteroid.ensureRandomScopes();
        }
        if (typeof asteroid.reseedRandomScopes === 'function') {
          asteroid.reseedRandomScopes();
        }
      }
    }

    this.assignAsteroidPoolId(asteroid, snapshot.poolId);
    return asteroid;
  }

  applyBossSnapshot(snapshot) {
    if (!snapshot || snapshot.destroyed) {
      return null;
    }

    const snapshotType = snapshot.type || 'boss';
    if (snapshotType !== 'boss') {
      return null;
    }

    const config = {
      id: snapshot.id || undefined,
      wave: safeNumber(snapshot.wave, this.waveState?.current || 1),
      x: safeNumber(snapshot.x, 0),
      y: safeNumber(snapshot.y, 0),
      vx: safeNumber(snapshot.vx, 0),
      vy: safeNumber(snapshot.vy, 0),
      rotation: safeNumber(snapshot.rotation, 0),
      rotationSpeed: safeNumber(snapshot.rotationSpeed, 0),
      currentHealth: safeNumber(snapshot.health, null),
      radius: safeNumber(snapshot.radius, null),
      randomScope: 'snapshot',
      poolId: snapshot.poolId,
      bossKind: snapshot.bossKind || 'prime',
    };

    let boss = null;
    let registeredByFactory = false;

    if (this.useFactory && this.factory) {
      boss = this.acquireEnemyViaFactory(
        wardenFactoryKey(config.bossKind),
        config
      );
      if (boss) {
        registeredByFactory = true;
      }
    }

    if (!boss) {
      try {
        const WardenClass =
          WARDEN_CLASSES[config.bossKind] || WARDEN_CLASSES.prime;
        boss = this.createEnemy(WardenClass, config);
      } catch (error) {
        console.error('[EnemySystem] Failed to restore boss snapshot:', error);
        return null;
      }
    }

    if (!boss) {
      return null;
    }

    this.assignAsteroidPoolId(boss, snapshot.poolId);

    if (!registeredByFactory) {
      const registrationResult = this.registerActiveEnemy(boss, {
        skipDuplicateCheck: true,
      });
      this.warnIfWaveManagerRegistrationFailed(
        registrationResult,
        'snapshot-restore-boss',
        boss
      );
    }

    if (Number.isFinite(snapshot.radius)) {
      boss.radius = snapshot.radius;
    }
    if (Number.isFinite(snapshot.maxHealth)) {
      boss.maxHealth = snapshot.maxHealth;
    }
    if (Number.isFinite(snapshot.health)) {
      boss.health = snapshot.health;
    }
    if (Number.isFinite(snapshot.phaseCount)) {
      boss.phaseCount = Math.max(1, Math.floor(snapshot.phaseCount));
    }

    boss.syncPhaseThresholds(true);

    const phaseCount =
      Number.isFinite(boss.phaseCount) && boss.phaseCount > 0
        ? boss.phaseCount
        : 1;
    let restoredPhase = null;

    if (Number.isFinite(snapshot.currentPhase)) {
      restoredPhase = Math.min(
        Math.max(0, Math.floor(snapshot.currentPhase)),
        phaseCount - 1
      );
    } else if (
      Array.isArray(boss.phaseHealthThresholds) &&
      boss.phaseHealthThresholds.length &&
      Number.isFinite(boss.health)
    ) {
      let computed = 0;
      for (let i = 0; i < boss.phaseHealthThresholds.length; i += 1) {
        if (boss.health <= boss.phaseHealthThresholds[i]) {
          computed += 1;
        }
      }
      restoredPhase = Math.min(computed, phaseCount - 1);
    }

    if (restoredPhase !== null) {
      boss.currentPhase = restoredPhase;
      boss.nextPhaseIndex = Math.min(
        restoredPhase,
        boss.phaseHealthThresholds.length
      );
    }

    if (typeof snapshot.invulnerable === 'boolean') {
      boss.invulnerable = snapshot.invulnerable;
    }
    if (Number.isFinite(snapshot.invulnerabilityTimer)) {
      boss.invulnerabilityTimer = Math.max(
        0,
        Number(snapshot.invulnerabilityTimer)
      );
    } else if (snapshot.invulnerable === false) {
      boss.invulnerabilityTimer = 0;
    }

    boss.applyPhaseMovement(true);

    return boss;
  }

  applySupportEnemySnapshot(snapshot) {
    if (!snapshot || snapshot.destroyed) {
      return null;
    }

    const snapshotType =
      typeof snapshot.type === 'string' ? snapshot.type.toLowerCase() : null;
    if (
      !snapshotType ||
      snapshotType === 'asteroid' ||
      snapshotType === 'boss'
    ) {
      return null;
    }

    const config = {
      id: snapshot.id || undefined,
      wave: safeNumber(snapshot.wave, this.waveState?.current || 1),
      x: safeNumber(snapshot.x, 0),
      y: safeNumber(snapshot.y, 0),
      vx: safeNumber(snapshot.vx, 0),
      vy: safeNumber(snapshot.vy, 0),
      rotation: safeNumber(snapshot.rotation, 0),
      rotationSpeed: safeNumber(snapshot.rotationSpeed, 0),
      health: safeNumber(snapshot.health, null),
      maxHealth: safeNumber(snapshot.maxHealth, null),
      radius: safeNumber(snapshot.radius, null),
      spawnedBy: snapshot.spawnedBy ?? null,
      spawnedByBossId: snapshot.spawnedByBossId ?? null,
      randomScope: 'snapshot',
      poolId: snapshot.poolId,
    };

    let enemy = null;
    let registeredByFactory = false;

    if (this.useFactory && this.factory) {
      enemy = this.acquireEnemyViaFactory(snapshotType, config);
      if (enemy) {
        registeredByFactory = true;
      }
    }

    // Off the factory path: a roster enemy is built from its recipe.
    const recipe = getContent('enemies', snapshotType);
    if (!enemy && recipe) {
      try {
        enemy = this.createEnemy(recipeEnemyClass(recipe), config);
      } catch (error) {
        console.error(
          '[EnemySystem] Failed to restore support enemy snapshot:',
          error
        );
        return null;
      }
    }

    if (!enemy) {
      return null;
    }

    this.assignAsteroidPoolId(enemy, snapshot.poolId);

    if (!registeredByFactory) {
      const registrationResult = this.registerActiveEnemy(enemy, {
        skipDuplicateCheck: true,
      });
      this.warnIfWaveManagerRegistrationFailed(
        registrationResult,
        'snapshot-restore-support',
        enemy
      );
    }

    if (Number.isFinite(snapshot.radius)) {
      enemy.radius = snapshot.radius;
    }
    if (Number.isFinite(snapshot.maxHealth)) {
      enemy.maxHealth = snapshot.maxHealth;
    }
    if (Number.isFinite(snapshot.health)) {
      enemy.health = snapshot.health;
    }
    if (snapshot.spawnedBy !== undefined) {
      enemy.spawnedBy = snapshot.spawnedBy;
    }
    if (snapshot.spawnedByBossId !== undefined) {
      enemy.spawnedByBossId = snapshot.spawnedByBossId;
    }

    return enemy;
  }

  exportState() {
    const wave = this.waveState;
    const session = this.cloneSessionStatsForSnapshot();
    const asteroids = [];
    const bosses = [];
    const supportEnemies = [];

    for (let i = 0; i < this.asteroids.length; i += 1) {
      const enemy = this.asteroids[i];
      if (!enemy || enemy.destroyed) {
        continue;
      }
      if (this.isBossEnemy(enemy)) {
        const bossSnapshot = this.captureBossSnapshot(enemy);
        if (bossSnapshot) {
          bosses.push(bossSnapshot);
        }
        continue;
      }
      if (enemy.type && enemy.type !== 'asteroid') {
        const supportSnapshot = this.captureSupportEnemySnapshot(enemy);
        if (supportSnapshot) {
          supportEnemies.push(supportSnapshot);
        }
        continue;
      }

      const snapshot = this.captureAsteroidSnapshot(enemy);
      if (snapshot) {
        asteroids.push(snapshot);
      }
    }

    return {
      version: 1,
      sessionActive: Boolean(this.sessionActive),
      spawnTimer: this.waveManager.spawnTimer,
      waveState: wave,
      layerProgress: this.waveManager.captureLayerProgress(),
      sessionStats: session,
      asteroids,
      bosses,
      supportEnemies,
      random: this.enemyRandom.captureRandomSnapshot(),
    };
  }

  importState(snapshot) {
    if (
      !validateSnapshot(snapshot, ['waveState', 'sessionStats', 'asteroids'])
    ) {
      return this._handleSnapshotFallback('invalid snapshot payload');
    }

    try {
      const waveSnapshot = snapshot.waveState || null;
      const sessionSnapshot = snapshot.sessionStats || null;
      const asteroidSnapshots = Array.isArray(snapshot.asteroids)
        ? snapshot.asteroids
        : null;
      const bossSnapshots = Array.isArray(snapshot.bosses)
        ? snapshot.bosses
        : [];
      const supportSnapshots = Array.isArray(snapshot.supportEnemies)
        ? snapshot.supportEnemies
        : [];

      if (!waveSnapshot || !sessionSnapshot || !asteroidSnapshots) {
        return this._handleSnapshotFallback('missing fields');
      }

      this.releaseAllAsteroidsToPool();
      this.asteroids = [];

      const baseSession = this.createInitialSessionStats();
      this.sessionStats = {
        ...baseSession,
        ...this.cloneSessionStatsForSnapshot(sessionSnapshot),
      };

      this.sessionActive = snapshot.sessionActive !== false;
      this._lastWaveManagerCompletionHandled = null;

      if (snapshot.random) {
        this.enemyRandom.restoreRandomFromSnapshot(snapshot.random);
      } else {
        this.reseedRandomScopes({ resetSequences: true });
      }

      for (let i = 0; i < asteroidSnapshots.length; i += 1) {
        const restored = this.applyAsteroidSnapshot(asteroidSnapshots[i]);
        if (restored) {
          this.registerActiveEnemy(restored, { skipDuplicateCheck: true });
        }
      }

      for (let i = 0; i < supportSnapshots.length; i += 1) {
        this.applySupportEnemySnapshot(supportSnapshots[i]);
      }

      const restoredBosses = [];
      for (let i = 0; i < bossSnapshots.length; i += 1) {
        const restoredBoss = this.applyBossSnapshot(bossSnapshots[i]);
        if (restoredBoss) {
          restoredBosses.push(restoredBoss);
        }
      }

      // After the field: registering its rocks counted them again.
      this.waveManager.restoreRocks({
        layer: safeNumber(waveSnapshot.current, 1),
        active: Boolean(waveSnapshot.isActive),
        total: safeNumber(waveSnapshot.totalAsteroids, 0),
        spawned: safeNumber(waveSnapshot.asteroidsSpawned, 0),
        completedWaves: safeNumber(waveSnapshot.completedWaves, 0),
        spawnTimer: safeNumber(snapshot.spawnTimer, 0),
        progress: snapshot.layerProgress,
      });

      if (restoredBosses.length > 0) {
        const boss = restoredBosses[0];
        const phaseColorsSource = Array.isArray(boss.phaseColors)
          ? boss.phaseColors
          : this.bosses.bossHudState?.phaseColors;
        const phaseColors = Array.isArray(phaseColorsSource)
          ? [...phaseColorsSource]
          : [];
        const phase = boss.currentPhase ?? 0;
        const color = phaseColors.length
          ? phaseColors[Math.min(phase, phaseColors.length - 1)]
          : this.bosses.bossHudState?.color ?? null;

        this.bosses.emitBossHudUpdate({
          active: true,
          upcoming: false,
          defeated: false,
          bossId: boss.id ?? this.bosses.bossHudState?.bossId ?? null,
          name:
            boss.displayName ||
            boss.name ||
            this.bosses.bossHudState?.name ||
            'Boss',
          phase,
          phaseCount:
            boss.phaseCount ?? this.bosses.bossHudState?.phaseCount ?? 0,
          health: boss.health ?? this.bosses.bossHudState?.health ?? 0,
          maxHealth: boss.maxHealth ?? this.bosses.bossHudState?.maxHealth ?? 0,
          wave: boss.wave ?? this.waveState?.current ?? null,
          color,
          phaseColors,
          invulnerable: Boolean(
            boss.invulnerable ?? this.bosses.bossHudState?.invulnerable
          ),
          invulnerabilityTimer: Number.isFinite(boss.invulnerabilityTimer)
            ? Math.max(0, Number(boss.invulnerabilityTimer))
            : null,
          invulnerabilitySource:
            this.bosses.bossHudState?.invulnerabilitySource ?? null,
        });
      }

      this.invalidateActiveEnemyCache();
      this.syncPhysicsIntegration(true);
      this._snapshotFallbackWarningIssued = false;
      return true;
    } catch (error) {
      console.error('[EnemySystem] Failed to restore snapshot state', error);
      return this._handleSnapshotFallback('exception during restore');
    }
  }
}
