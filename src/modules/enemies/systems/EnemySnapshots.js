// src/modules/enemies/systems/EnemySnapshots.js
// EnemySystem's save and restore: each rock, support enemy and Warden on the
// field, and the whole system around them (exportState / importState).
import RandomService from '../../../core/RandomService.js';
import { WARDEN_CLASSES, wardenFactoryKey } from '../types/wardens.js';
import { getContent } from '../../../content/registry.js';
import { recipeEnemyClass } from '../types/RecipeEnemy.js';
import { safeNumber, validateSnapshot } from '../../../utils/StateManager.js';

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

  // What rebuilds an enemy the way it was born (its kind, where it is, its
  // place in the pools) and its state at the death, set back once the whole
  // field is rebuilt (enemyState.js; importState).
  captureEnemySnapshot(enemy) {
    return {
      poolId: this.assignAsteroidPoolId(enemy),
      id: enemy.id || null,
      type: enemy.type,
      wave: safeNumber(enemy.wave, this.waveState?.current || 1),
      x: safeNumber(enemy.x),
      y: safeNumber(enemy.y),
      state: enemy.getSnapshotState(),
    };
  }

  captureAsteroidSnapshot(asteroid) {
    if (!asteroid || asteroid.destroyed) {
      return null;
    }

    return {
      ...this.captureEnemySnapshot(asteroid),
      size: asteroid.size || 'small',
      variant: asteroid.variant || 'common',
      generation: safeNumber(asteroid.generation, 0),
      spawnedBy: asteroid.spawnedBy ?? null,
    };
  }

  captureBossSnapshot(boss) {
    if (!boss || boss.destroyed) {
      return null;
    }

    return {
      ...this.captureEnemySnapshot(boss),
      bossKind: boss.bossKind || 'prime',
    };
  }

  captureSupportEnemySnapshot(enemy) {
    if (!enemy || enemy.destroyed) {
      return null;
    }

    return {
      ...this.captureEnemySnapshot(enemy),
      // A Twain's splits so far (behaviors/split.js).
      generation: safeNumber(enemy.generation, 0),
      spawnedBy: enemy.spawnedBy ?? null,
      spawnedByBossId: enemy.spawnedByBossId ?? null,
      // An Elite's affixes (EnemyFactory.applyElite), a Herald's kind.
      elite: Boolean(enemy.elite),
      affixes: [...(enemy.affixes ?? [])],
      heraldKind: enemy.heraldKind ?? null,
    };
  }

  // The config every rebuild starts from: its streams are set back where
  // they stood with its state, so no scope of the layer is drawn from or
  // opened to rebuild it.
  rebuildConfig(snapshot) {
    return {
      id: snapshot.id || undefined,
      wave: safeNumber(snapshot.wave, this.waveState?.current || 1),
      x: safeNumber(snapshot.x, 0),
      y: safeNumber(snapshot.y, 0),
      random: new RandomService(0),
      poolId: snapshot.poolId,
    };
  }

  applyAsteroidSnapshot(snapshot) {
    if (!snapshot || (snapshot.type || 'asteroid') !== 'asteroid') {
      return null;
    }

    const asteroid = this.acquireAsteroid({
      ...this.rebuildConfig(snapshot),
      size: snapshot.size || 'small',
      variant: snapshot.variant || 'common',
      generation: safeNumber(snapshot.generation, 0),
      spawnedBy: snapshot.spawnedBy ?? null,
    });
    if (!asteroid) {
      return null;
    }

    this.assignAsteroidPoolId(asteroid, snapshot.poolId);
    return asteroid;
  }

  applyBossSnapshot(snapshot) {
    if (!snapshot || (snapshot.type || 'boss') !== 'boss') {
      return null;
    }

    const config = {
      ...this.rebuildConfig(snapshot),
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

    return boss;
  }

  applySupportEnemySnapshot(snapshot) {
    const snapshotType =
      typeof snapshot?.type === 'string' ? snapshot.type.toLowerCase() : null;
    if (
      !snapshotType ||
      snapshotType === 'asteroid' ||
      snapshotType === 'boss'
    ) {
      return null;
    }

    const config = {
      ...this.rebuildConfig(snapshot),
      generation: safeNumber(snapshot.generation, 0),
      spawnedBy: snapshot.spawnedBy ?? null,
      spawnedByBossId: snapshot.spawnedByBossId ?? null,
      elite: snapshot.elite,
      affixes: snapshot.affixes,
      heraldKind: snapshot.heraldKind ?? undefined,
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

      // Each enemy rebuilt, with the state it had at the death.
      const rebuilt = [];
      for (let i = 0; i < asteroidSnapshots.length; i += 1) {
        const restored = this.applyAsteroidSnapshot(asteroidSnapshots[i]);
        if (restored) {
          this.registerActiveEnemy(restored, { skipDuplicateCheck: true });
          rebuilt.push([restored, asteroidSnapshots[i].state]);
        }
      }

      for (let i = 0; i < supportSnapshots.length; i += 1) {
        const restored = this.applySupportEnemySnapshot(supportSnapshots[i]);
        if (restored) rebuilt.push([restored, supportSnapshots[i].state]);
      }

      const restoredBosses = [];
      for (let i = 0; i < bossSnapshots.length; i += 1) {
        const restoredBoss = this.applyBossSnapshot(bossSnapshots[i]);
        if (restoredBoss) {
          restoredBosses.push(restoredBoss);
          rebuilt.push([restoredBoss, bossSnapshots[i].state]);
        }
      }

      // Once the whole field is back, so an escort finds its mother.
      const byId = new Map(rebuilt.map(([enemy]) => [enemy.id, enemy]));
      for (const [enemy, state] of rebuilt) {
        if (state) enemy.restoreSnapshotState(state, (id) => byId.get(id));
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
