/**
 * EnemyUpdateSystem coordinates the per-frame update responsibilities that used
 * to live directly inside EnemySystem. The class acts purely as an orchestrator
 * that delegates work to the spawn/damage subsystems and keeps the facade as
 * the single source of truth for state. Responsibilities covered here:
 *
 * - Route between legacy wave logic and the WaveManager integration
 * - Update asteroids, bosses and support enemies every frame
 * - Run collision detection while avoiding per-frame allocations
 * - Cleanup destroyed enemies and emit wave state snapshots
 *
 * Usage mirrors the other sub-systems (spawn, damage, render):
 *
 * ```js
 * import { EnemyUpdateSystem } from './EnemyUpdateSystem.js';
 *
 * const updateSystem = new EnemyUpdateSystem({
 *   facade: enemySystemInstance,
 *   spawnSystem: enemySystemInstance.spawnSystem,
 *   damageSystem: enemySystemInstance.damageSystem,
 * });
 *
 * updateSystem.update(deltaTime);
 * ```
 */
import {
  GAME_WIDTH,
  GAME_HEIGHT,
} from '../../../core/GameConstants.js';
import {
  USE_WAVE_MANAGER,
  WAVEMANAGER_HANDLES_ASTEROID_SPAWN,
  ASTEROIDS_PER_WAVE_MULTIPLIER,
  ASTEROIDS_PER_WAVE_BASE,
  MAX_ASTEROIDS_ON_SCREEN,
  WAVE_DURATION,
  WAVE_BREAK_TIME,
  PRESERVE_LEGACY_SIZE_DISTRIBUTION,
  COLLISION_BOUNCE,
} from '../../../data/constants/gameplay.js';
import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';

export class EnemyUpdateSystem {
  /**
   * @param {{
   *   facade: import('../../EnemySystem.js').EnemySystem,
   *   spawnSystem?: import('./EnemySpawnSystem.js').EnemySpawnSystem,
   *   damageSystem?: import('./EnemyDamageSystem.js').EnemyDamageSystem,
   * }} context
   */
  constructor(context = {}) {
    this.facade = context.facade ?? null;
    this.spawnSystem = context.spawnSystem ?? null;
    this.damageSystem = context.damageSystem ?? null;

    if (!this.facade) {
      GameDebugLogger.log(
        'ERROR',
        'EnemyUpdateSystem initialized without facade reference'
      );
    } else {
      GameDebugLogger.log('UPDATE', 'EnemyUpdateSystem initialized');
    }

    /**
     * Reusable buffer that stores active asteroids for collision detection in
     * order to avoid allocating a new array every frame.
     * @type {import('../../enemies/types/Asteroid.js').Asteroid[]}
     */
    this._activeAsteroidsBuffer = [];
  }

  /**
    * Main update entry point. Keeps the original flow from EnemySystem while
    * delegating state reads/writes through the facade reference.
    * @param {number} deltaTime
    */
  update(deltaTime) {
    const facade = this.facade;
    if (!facade?.sessionActive) {
      return;
    }

    facade.refreshInjectedServices();

    const overrideValue =
      typeof globalThis !== 'undefined'
        ? globalThis.__USE_WAVE_MANAGER_OVERRIDE__
        : undefined;

    const constantsFlag =
      typeof USE_WAVE_MANAGER === 'boolean' ? USE_WAVE_MANAGER : false;

    let waveManagerEnabled = constantsFlag;
    if (overrideValue === true) {
      waveManagerEnabled = true;
    } else if (overrideValue === false) {
      waveManagerEnabled = false;
    }

    if (!facade._waveSystemDebugLogged) {
      console.debug(
        `[EnemySystem] Wave system: ${waveManagerEnabled ? 'WaveManager' : 'Legacy'}`
      );
      facade._waveSystemDebugLogged = true;
    }

    facade._waveManagerRuntimeEnabled = waveManagerEnabled;

    const waveManagerHandlesSpawnFlag =
      (WAVEMANAGER_HANDLES_ASTEROID_SPAWN ?? false) &&
      facade._waveManagerRuntimeEnabled;
    const waveManagerControlsSpawn = Boolean(
      waveManagerHandlesSpawnFlag &&
        facade.waveManager &&
        !facade._waveManagerFallbackWarningIssued &&
        !facade._waveManagerInvalidStateWarningIssued
    );

    if (!facade._asteroidSpawnDebugLogged) {
      console.debug(
        `[EnemySystem] Asteroid spawn: ${
          waveManagerControlsSpawn ? 'WaveManager' : 'Legacy handleSpawning()'
        }`
      );
      facade._asteroidSpawnDebugLogged = true;
    }

    facade.sessionStats.timeElapsed += deltaTime;

    if (waveManagerEnabled) {
      if (typeof facade.updateWaveManagerLogic === 'function') {
        facade.updateWaveManagerLogic(deltaTime, true);
      }
      this.updateWaveManagerLogic(deltaTime);
      this.updateAsteroids(deltaTime);
    } else {
      if (typeof facade.updateWaveLogic === 'function') {
        facade.updateWaveLogic(deltaTime, {}, true);
      }
      this.updateAsteroids(deltaTime);
      this.updateWaveLogic(deltaTime);
    }

    this.updateSupportEnemies(deltaTime);
    this.cleanupDestroyed();

    facade.emitWaveStateUpdate();
  }

  /**
   * Runs the legacy wave logic originally hosted inside EnemySystem.
   * @param {number} deltaTime
   * @param {{ skipSpawning?: boolean }} [options]
   * @returns {boolean} Whether spawning was handled during the call.
   */
  updateWaveLogic(deltaTime, { skipSpawning = false } = {}) {
    const facade = this.facade;
    const wave = facade?.waveState;

    if (!wave) {
      return false;
    }

    if (typeof facade.updateWaveLogic === 'function') {
      facade.updateWaveLogic(deltaTime, { skipSpawning }, true);
    }

    let spawnHandled = false;

    const waveManagerHandlesSpawn =
      (WAVEMANAGER_HANDLES_ASTEROID_SPAWN ?? false) &&
      facade._waveManagerRuntimeEnabled &&
      facade.waveManager &&
      !facade._waveManagerFallbackWarningIssued &&
      !facade._waveManagerInvalidStateWarningIssued;

    if (wave.isActive) {
      wave.timeRemaining = Math.max(0, wave.timeRemaining - deltaTime);
      if (!skipSpawning && !waveManagerHandlesSpawn) {
        this.handleSpawning(deltaTime);
        spawnHandled = true;
      }

      const allAsteroidsKilled =
        wave.asteroidsKilled >= wave.totalAsteroids &&
        facade.getActiveEnemyCount() === 0;

      if (wave.timeRemaining <= 0 || allAsteroidsKilled) {
        facade.completeCurrentWave();
      }
    } else if (wave.breakTimer > 0) {
      wave.breakTimer = Math.max(0, wave.breakTimer - deltaTime);

      if (wave.breakTimer === 0) {
        facade.startNextWave();
      }
    }

    return spawnHandled;
  }

  /**
   * Synchronizes state with the WaveManager when active.
   * @param {number} deltaTime
   * @returns {boolean}
   */
  updateWaveManagerLogic(deltaTime) {
    const facade = this.facade;
    const wave = facade?.waveState;

    if (!wave) {
      return false;
    }

    if (typeof facade.updateWaveManagerLogic === 'function') {
      facade.updateWaveManagerLogic(deltaTime, true);
    }

    let spawnHandled = false;

    if (!facade.waveManager) {
      if (!facade._waveManagerFallbackWarningIssued) {
        console.warn(
          '[EnemySystem] WaveManager indisponível. Recuando para updateWaveLogic() enquanto USE_WAVE_MANAGER está ativo.'
        );
        facade._waveManagerFallbackWarningIssued = true;
      }
      return this.updateWaveLogic(deltaTime);
    }

    const waveManagerHandlesAsteroids =
      (WAVEMANAGER_HANDLES_ASTEROID_SPAWN ?? false) &&
      facade._waveManagerRuntimeEnabled &&
      !facade._waveManagerFallbackWarningIssued &&
      !facade._waveManagerInvalidStateWarningIssued;

    if (!waveManagerHandlesAsteroids) {
      this.handleSpawning(deltaTime);
      spawnHandled = true;
    }

    facade.waveManager.update(deltaTime);

    const managerState =
      typeof facade.waveManager.getState === 'function'
        ? facade.waveManager.getState()
        : null;

    const managerStateValid =
      managerState &&
      managerState.currentWave !== undefined &&
      managerState.inProgress !== undefined &&
      managerState.spawned !== undefined &&
      managerState.killed !== undefined &&
      managerState.total !== undefined;

    if (!managerStateValid) {
      if (!facade._waveManagerInvalidStateWarningIssued) {
        console.warn(
          '[EnemySystem] WaveManager returned invalid state. Falling back to updateWaveLogic() while USE_WAVE_MANAGER is active.'
        );
        facade._waveManagerInvalidStateWarningIssued = true;
      }
      if (waveManagerHandlesAsteroids) {
        return spawnHandled;
      }
      return this.updateWaveLogic(deltaTime, { skipSpawning: spawnHandled });
    }

    const {
      current: previousCurrent,
      isActive: previousIsActive,
      asteroidsSpawned: previousSpawned,
      asteroidsKilled: previousKilled,
      totalAsteroids: previousTotal,
    } = wave;

    const nextWaveNumberCandidate = Number(managerState.currentWave);
    const resolvedWaveNumber = Number.isFinite(nextWaveNumberCandidate)
      ? nextWaveNumberCandidate
      : Number.isFinite(previousCurrent)
      ? previousCurrent
      : 1;

    const nextIsActive = Boolean(managerState.inProgress);
    const becameActive = !previousIsActive && nextIsActive;

    wave.current = resolvedWaveNumber;
    wave.isActive = nextIsActive;

    if (!nextIsActive) {
      const countdownValue = Number(managerState.countdown) || 0;
      wave.breakTimer = Math.max(0, countdownValue);
    }

    if (becameActive) {
      const baseMultiplier = Number.isFinite(ASTEROIDS_PER_WAVE_MULTIPLIER)
        ? ASTEROIDS_PER_WAVE_MULTIPLIER
        : 1.3;
      const baseCountValue = Number.isFinite(ASTEROIDS_PER_WAVE_BASE)
        ? ASTEROIDS_PER_WAVE_BASE
        : 4;
      const normalizedWaveIndex = Math.max(0, resolvedWaveNumber - 1);
      const computedTotal = Math.floor(
        baseCountValue * Math.pow(baseMultiplier, normalizedWaveIndex)
      );
      const capValue = Number.isFinite(MAX_ASTEROIDS_ON_SCREEN)
        ? MAX_ASTEROIDS_ON_SCREEN
        : 25;

      wave.totalAsteroids = Math.max(0, Math.min(computedTotal, capValue));
      wave.asteroidsSpawned = 0;
      wave.asteroidsKilled = 0;
      wave.timeRemaining = Number.isFinite(Number(WAVE_DURATION))
        ? Number(WAVE_DURATION)
        : 60;
      wave.spawnTimer = 0;
      wave.initialSpawnDone = false;
      wave.breakTimer = 0;

      if (waveManagerHandlesAsteroids) {
        facade.spawnInitialAsteroids(4);
      }
    }
    const legacyCompatibilityEnabled =
      (PRESERVE_LEGACY_SIZE_DISTRIBUTION ?? true) &&
      waveManagerHandlesAsteroids;

    const totals = managerState.totals || {};
    const counts = managerState.counts || {};
    const spawnedBreakdown = counts.spawned || {};
    const killedBreakdown = counts.killed || {};

    const resolvedCompatibilityMode =
      managerState.compatibilityMode ??
      (!waveManagerHandlesAsteroids || legacyCompatibilityEnabled);
    const resolvedFallbackActive =
      managerState.legacyFallbackActive ?? !waveManagerHandlesAsteroids;

    wave.compatibilityMode = Boolean(resolvedCompatibilityMode);
    wave.legacyFallbackActive = Boolean(resolvedFallbackActive);

    const coerceFiniteNumber = (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : undefined;
    };

    const selectManagerValue = (value, fallback) => {
      const numeric = coerceFiniteNumber(value);
      return numeric !== undefined ? numeric : fallback;
    };

    let nextSpawned = previousSpawned;
    let nextTotal = previousTotal;
    let nextKilled = previousKilled;

    wave.managerTotals = {
      all: selectManagerValue(totals.all, managerState.total),
      asteroids: selectManagerValue(totals.asteroids, managerState.total),
    };

    wave.managerCounts = {
      spawned: {
        all: selectManagerValue(spawnedBreakdown.all, managerState.spawned),
        asteroids: selectManagerValue(
          spawnedBreakdown.asteroids,
          managerState.spawned
        ),
      },
      killed: {
        all: selectManagerValue(killedBreakdown.all, managerState.killed),
        asteroids: selectManagerValue(
          killedBreakdown.asteroids,
          managerState.killed
        ),
      },
    };

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

    const hasAsteroidKillBreakdown = Object.prototype.hasOwnProperty.call(
      killedBreakdown,
      'asteroids'
    );
    const managerKilledSource = hasAsteroidKillBreakdown
      ? killedBreakdown.asteroids
      : managerState.killed;
    const managerKilledValue = selectManagerValue(
      managerKilledSource,
      previousKilled
    );
    const shouldSyncKilledCount = true;

    if (shouldSyncKilledCount) {
      nextKilled = managerKilledValue;
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

    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      const managerKilled = managerState.killed ?? 0;
      const systemKilled = wave.asteroidsKilled ?? 0;
      if (Math.abs(managerKilled - systemKilled) > 1) {
        console.warn(
          `[EnemySystem] Kill count mismatch: WaveManager=${managerKilled}, waveState=${systemKilled}`
        );
      }
    }

    return spawnHandled;
  }

  /**
   * Updates asteroids, support enemies and handles collision detection.
   * @param {number} deltaTime
   */
  updateAsteroids(deltaTime) {
    const facade = this.facade;

    if (typeof facade.updateAsteroids === 'function') {
      facade.updateAsteroids(deltaTime, true);
    }

    if (!facade?._lastEnemyUpdateLog || Date.now() - facade._lastEnemyUpdateLog > 1000) {
      const enemyTypes = facade.asteroids
        .filter((enemy) => enemy && !enemy.destroyed)
        .map((enemy) => enemy.type || 'unknown');

      const typeCounts = enemyTypes.reduce((acc, type) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      GameDebugLogger.log('UPDATE', 'Enemy update loop', {
        totalEnemies: enemyTypes.length,
        types: typeCounts,
      });

      facade._lastEnemyUpdateLog = Date.now();
    }

    const movementContext = facade.useComponents && facade.movementComponent
      ? {
          player: facade.getCachedPlayer(),
          worldBounds: {
            width: GAME_WIDTH,
            height: GAME_HEIGHT,
          },
        }
      : null;

    facade.asteroids.forEach((enemy) => {
      if (!enemy || enemy.destroyed) {
        return;
      }

      if (enemy.type === 'boss') {
        if (typeof enemy.onUpdate === 'function') {
          enemy.onUpdate(deltaTime);
        }
        return;
      }

      if (enemy.type !== 'asteroid') {
        if (typeof enemy.onUpdate === 'function') {
          enemy.onUpdate(deltaTime);
        }
        return;
      }

      if (facade.useComponents && facade.movementComponent) {
        facade.movementComponent.update(enemy, deltaTime, movementContext);

        if (typeof enemy.updateVisualState === 'function') {
          enemy.updateVisualState(deltaTime);
        }

        if (
          enemy.behavior?.type === 'volatile' &&
          typeof enemy.updateVolatileBehavior === 'function'
        ) {
          enemy.updateVolatileBehavior(deltaTime);
        }

        if (enemy.lastDamageTime > 0) {
          enemy.lastDamageTime = Math.max(0, enemy.lastDamageTime - deltaTime);
        }
        if (enemy.shieldHitCooldown > 0) {
          enemy.shieldHitCooldown = Math.max(
            0,
            enemy.shieldHitCooldown - deltaTime
          );
        }
        return;
      }

      if (typeof enemy.update === 'function') {
        enemy.update(deltaTime);
      }
    });

    this.handleAsteroidCollisions();
  }

  /**
   * Updates drones, hunters, mines and other support enemies.
   * @param {number} deltaTime
   */
  updateSupportEnemies(deltaTime) {
    const facade = this.facade;
    if (typeof facade.updateSupportEnemies === 'function') {
      facade.updateSupportEnemies(deltaTime, true);
    }
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    for (let i = 0; i < facade.asteroids.length; i += 1) {
      const enemy = facade.asteroids[i];
      if (!enemy || enemy.destroyed || enemy.type === 'asteroid') {
        continue;
      }

      if (typeof enemy.onUpdate === 'function') {
        enemy.onUpdate(deltaTime);
      }
    }
  }

  /**
   * Prepares a reusable list of asteroids and delegates to component or legacy
   * collision handling.
   */
  handleAsteroidCollisions() {
    const facade = this.facade;
    if (typeof facade.handleAsteroidCollisions === 'function') {
      facade.handleAsteroidCollisions(true);
    }
    const buffer = this._activeAsteroidsBuffer;
    buffer.length = 0;

    for (let i = 0; i < facade.asteroids.length; i += 1) {
      const asteroid = facade.asteroids[i];
      if (asteroid && !asteroid.destroyed && asteroid.type === 'asteroid') {
        buffer.push(asteroid);
      }
    }

    if (buffer.length < 2) {
      return;
    }

    if (facade.useComponents && facade.collisionComponent) {
      facade.collisionComponent.handleAsteroidCollisions(buffer);
    } else {
      for (let i = 0; i < buffer.length - 1; i += 1) {
        const a1 = buffer[i];
        if (!a1 || a1.destroyed) continue;

        for (let j = i + 1; j < buffer.length; j += 1) {
          const a2 = buffer[j];
          if (!a2 || a2.destroyed) continue;

          this.checkAsteroidCollision(a1, a2);
        }
      }
    }
  }

  /**
   * Original collision physics between asteroids.
   * @param {import('../../enemies/types/Asteroid.js').Asteroid} a1
   * @param {import('../../enemies/types/Asteroid.js').Asteroid} a2
   */
  checkAsteroidCollision(a1, a2) {
    const facade = this.facade;
    if (typeof facade.checkAsteroidCollision === 'function') {
      facade.checkAsteroidCollision(a1, a2, true);
    }
    const dx = a2.x - a1.x;
    const dy = a2.y - a1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = a1.radius + a2.radius;

    if (distance < minDistance && distance > 0) {
      const nx = dx / distance;
      const ny = dy / distance;

      const overlap = minDistance - distance;
      const percent = 0.5;
      a1.x -= nx * overlap * percent;
      a1.y -= ny * overlap * percent;
      a2.x += nx * overlap * percent;
      a2.y += ny * overlap * percent;

      const rvx = a2.vx - a1.vx;
      const rvy = a2.vy - a1.vy;
      const velAlongNormal = rvx * nx + rvy * ny;

      if (velAlongNormal < 0) {
        const e = COLLISION_BOUNCE;
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

      const collisionRandom =
        (typeof a1?.getRandomFor === 'function' && a1.getRandomFor('collision')) ||
        (typeof a2?.getRandomFor === 'function' && a2.getRandomFor('collision')) ||
        facade.getRandomScope('fragments');
      const rotationSource =
        collisionRandom || facade.getRandomScope('fragments') || facade.getRandomService();
      const rotationDelta =
        rotationSource && typeof rotationSource.range === 'function'
          ? rotationSource.range(-0.75, 0.75)
          : (rotationSource.float() - 0.5) * 1.5;
      a1.rotationSpeed += rotationDelta;
      a2.rotationSpeed += rotationDelta;
    }
  }

  /**
   * Releases destroyed enemies back to pools and trims the main list.
   */
  cleanupDestroyed() {
    const facade = this.facade;
    if (typeof facade.cleanupDestroyed === 'function') {
      facade.cleanupDestroyed(true);
    }
    if (!Array.isArray(facade?.asteroids) || facade.asteroids.length === 0) {
      return;
    }

    const remaining = [];
    let removed = 0;

    for (let i = 0; i < facade.asteroids.length; i += 1) {
      const asteroid = facade.asteroids[i];
      if (!asteroid || asteroid.destroyed) {
        facade.releaseAsteroid(asteroid);
        removed += 1;
        continue;
      }

      remaining.push(asteroid);
    }

    if (removed > 0) {
      facade.asteroids = remaining;
      facade.invalidateActiveEnemyCache();
    }
  }

  /**
   * Helper that proxies spawning requests to the facade or the spawn system.
   * @param {number} deltaTime
   */
  handleSpawning(deltaTime) {
    if (this.spawnSystem && typeof this.spawnSystem.handleSpawning === 'function') {
      this.spawnSystem.handleSpawning(deltaTime);
      return;
    }

    if (this.facade && typeof this.facade.handleSpawning === 'function') {
      this.facade.handleSpawning(deltaTime);
    }
  }
}
