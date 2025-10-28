/**
 * Coordinates the per-frame update responsibilities that historically lived
 * directly inside EnemySystem. EnemyUpdateSystem intentionally remains a pure
 * orchestrator: it owns no gameplay state and simply delegates back to the
 * facade (EnemySystem) for persistence, spawning, rewards, and event emission.
 *
 * Responsibilities handled here:
 * - Route between legacy wave logic and the WaveManager integration
 * - Update asteroids, bosses, and support enemies each frame
 * - Execute collision detection while avoiding per-frame allocations
 * - Cleanup destroyed enemies and emit wave state snapshots
 *
 * Usage mirrors the other enemy sub-systems:
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
   *   asteroids?: import('../../EnemySystem.js').EnemySystem['asteroids'],
   *   waveState?: import('../../EnemySystem.js').EnemySystem['waveState'],
   *   sessionStats?: import('../../EnemySystem.js').EnemySystem['sessionStats'],
   *   spawnTimer?: import('../../EnemySystem.js').EnemySystem['spawnTimer'],
   *   useComponents?: import('../../EnemySystem.js').EnemySystem['useComponents'],
   *   movementComponent?: import('../../EnemySystem.js').EnemySystem['movementComponent'],
   *   collisionComponent?: import('../../EnemySystem.js').EnemySystem['collisionComponent'],
   *   waveManager?: import('../../EnemySystem.js').EnemySystem['waveManager'],
   *   useManagers?: import('../../EnemySystem.js').EnemySystem['useManagers'],
   *   refreshInjectedServices?: import('../../EnemySystem.js').EnemySystem['refreshInjectedServices'],
   *   getCachedPlayer?: import('../../EnemySystem.js').EnemySystem['getCachedPlayer'],
   *   getCachedWorld?: import('../../EnemySystem.js').EnemySystem['getCachedWorld'],
   *   getCachedPhysics?: import('../../EnemySystem.js').EnemySystem['getCachedPhysics'],
   *   getRandomScope?: import('../../EnemySystem.js').EnemySystem['getRandomScope'],
   *   getRandomService?: import('../../EnemySystem.js').EnemySystem['getRandomService'],
   *   getActiveEnemyCount?: import('../../EnemySystem.js').EnemySystem['getActiveEnemyCount'],
   *   invalidateActiveEnemyCache?: import('../../EnemySystem.js').EnemySystem['invalidateActiveEnemyCache'],
   *   releaseAsteroid?: import('../../EnemySystem.js').EnemySystem['releaseAsteroid'],
   *   emitWaveStateUpdate?: import('../../EnemySystem.js').EnemySystem['emitWaveStateUpdate'],
   *   completeCurrentWave?: import('../../EnemySystem.js').EnemySystem['completeCurrentWave'],
   *   startNextWave?: import('../../EnemySystem.js').EnemySystem['startNextWave'],
   *   spawnInitialAsteroids?: import('../../EnemySystem.js').EnemySystem['spawnInitialAsteroids'],
   */
  constructor(context = {}) {
    this.ctx = context;
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
     * Reusable buffer that stores active asteroids for collision detection to
     * avoid allocating a fresh array every frame.
     * @type {import('../../enemies/types/Asteroid.js').Asteroid[]}
     */
    this._activeAsteroidsBuffer = [];
  }

  /**
   * Main update entry point. Mirrors the original EnemySystem.update() flow
   * while delegating state reads and writes through the facade reference.
   * @param {number} deltaTime
   */
  update(deltaTime) {
    const facade = this.facade;
    if (!facade || !facade.sessionActive) {
      return;
    }

    if (typeof this.ctx.refreshInjectedServices === 'function') {
      this.ctx.refreshInjectedServices();
    }

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
    const waveManagerInstance = this.ctx?.waveManager;
    const waveManagerControlsSpawn = Boolean(
      waveManagerHandlesSpawnFlag &&
        waveManagerInstance &&
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

    const sessionStats = this.ctx?.sessionStats;
    if (sessionStats) {
      sessionStats.timeElapsed += deltaTime;
    }

    if (waveManagerEnabled) {
      this.updateWaveManagerLogic(deltaTime);
      this.updateAsteroids(deltaTime);
    } else {
      this.updateAsteroids(deltaTime);
      this.updateWaveLogic(deltaTime);
    }

    this.updateSupportEnemies(deltaTime);
    this.cleanupDestroyed();

    if (typeof this.ctx.emitWaveStateUpdate === 'function') {
      this.ctx.emitWaveStateUpdate();
    } else {
      facade.emitWaveStateUpdate();
    }
  }

  /**
   * Executes the legacy wave flow. Returns whether spawning was handled.
   * @param {number} deltaTime
   * @param {{ skipSpawning?: boolean }} [options]
   * @returns {boolean}
   */
  updateWaveLogic(deltaTime, { skipSpawning = false } = {}) {
    const facade = this.facade;
    const wave = this.ctx?.waveState;

    if (!wave) {
      return false;
    }

    let spawnHandled = false;

    const waveManagerHandlesSpawn =
      (WAVEMANAGER_HANDLES_ASTEROID_SPAWN ?? false) &&
      facade._waveManagerRuntimeEnabled &&
      this.ctx?.waveManager &&
      !facade._waveManagerFallbackWarningIssued &&
      !facade._waveManagerInvalidStateWarningIssued;

    if (wave.isActive) {
      wave.timeRemaining = Math.max(0, wave.timeRemaining - deltaTime);
      if (!skipSpawning && !waveManagerHandlesSpawn) {
        this.handleSpawning(deltaTime);
        spawnHandled = true;
      }

      const activeEnemyCount =
        typeof this.ctx?.getActiveEnemyCount === 'function'
          ? this.ctx.getActiveEnemyCount()
          : Array.isArray(this.ctx?.asteroids)
          ? this.ctx.asteroids.filter(
              (enemy) => enemy && !enemy.destroyed
            ).length
          : 0;
      const allAsteroidsKilled =
        wave.asteroidsKilled >= wave.totalAsteroids &&
        (activeEnemyCount ?? 0) === 0;

      if (wave.timeRemaining <= 0 || allAsteroidsKilled) {
        if (typeof this.ctx?.completeCurrentWave === 'function') {
          this.ctx.completeCurrentWave();
        } else {
          facade.completeCurrentWave?.();
        }
      }
    } else if (wave.breakTimer > 0) {
      wave.breakTimer = Math.max(0, wave.breakTimer - deltaTime);

      if (wave.breakTimer === 0) {
        if (typeof this.ctx?.startNextWave === 'function') {
          this.ctx.startNextWave();
        } else {
          facade.startNextWave?.();
        }
      }
    }

    return spawnHandled;
  }

  /**
   * Synchronizes state with WaveManager while keeping facade-owned flags.
   * @param {number} deltaTime
   * @returns {boolean}
   */
  updateWaveManagerLogic(deltaTime) {
    const facade = this.facade;
    const wave = this.ctx?.waveState;

    if (!wave) {
      return false;
    }

    let spawnHandled = false;
    const waveManager = this.ctx?.waveManager ?? null;

    if (!waveManager) {
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

    if (typeof waveManager.update === 'function') {
      waveManager.update(deltaTime);
    }

    const managerState =
      typeof waveManager.getState === 'function' ? waveManager.getState() : null;

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
        if (typeof this.ctx?.spawnInitialAsteroids === 'function') {
          this.ctx.spawnInitialAsteroids(4);
        } else {
          facade.spawnInitialAsteroids?.(4);
        }
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
   * Updates asteroid movement / behavior, then triggers collision handling.
   * @param {number} deltaTime
   */
  updateAsteroids(deltaTime) {
    const facade = this.facade;
    const asteroids = this.ctx?.asteroids ?? [];

    if (
      !facade?._lastEnemyUpdateLog ||
      Date.now() - facade._lastEnemyUpdateLog > 1000
    ) {
      const enemyTypes = Array.isArray(asteroids)
        ? asteroids
            .filter((enemy) => enemy && !enemy.destroyed)
            .map((enemy) => enemy.type || 'unknown')
        : [];

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

    const useComponents = Boolean(this.ctx?.useComponents);
    const movementComponent = this.ctx?.movementComponent;
    const movementContext = useComponents && movementComponent
      ? {
          player:
            typeof this.ctx?.getCachedPlayer === 'function'
              ? this.ctx.getCachedPlayer()
              : undefined,
          worldBounds: {
            width: GAME_WIDTH,
            height: GAME_HEIGHT,
          },
        }
      : null;

    if (!Array.isArray(asteroids) || asteroids.length === 0) {
      this.handleAsteroidCollisions();
      return;
    }

    for (let i = 0; i < asteroids.length; i += 1) {
      const enemy = asteroids[i];
      if (!enemy || enemy.destroyed || enemy.type !== 'asteroid') {
        continue;
      }

      if (useComponents && movementComponent) {
        movementComponent.update(enemy, deltaTime, movementContext);

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
        continue;
      }

      if (typeof enemy.update === 'function') {
        enemy.update(deltaTime);
      }
    }

    this.handleAsteroidCollisions();
  }

  /**
   * Updates non-asteroid support enemies (drones, hunters, mines, bosses).
   * @param {number} deltaTime
   */
  updateSupportEnemies(deltaTime) {
    const facade = this.facade;
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    const asteroids = this.ctx?.asteroids ?? [];

    for (let i = 0; i < asteroids.length; i += 1) {
      const enemy = asteroids[i];
      if (!enemy || enemy.destroyed || enemy.type === 'asteroid') {
        continue;
      }

      if (typeof enemy.onUpdate === 'function') {
        enemy.onUpdate(deltaTime);
      }
    }
  }

  /**
   * Performs asteroid-asteroid collision handling using a reusable buffer.
   */
  handleAsteroidCollisions() {
    const facade = this.facade;
    const buffer = this._activeAsteroidsBuffer;
    buffer.length = 0;

    const source = this.ctx?.asteroids;
    if (!Array.isArray(source) || source.length < 2) {
      return;
    }

    for (let i = 0; i < source.length; i += 1) {
      const asteroid = source[i];
      if (!asteroid || asteroid.destroyed || asteroid.type !== 'asteroid') {
        continue;
      }
      buffer.push(asteroid);
    }

    if (buffer.length < 2) {
      return;
    }

    const useComponents = Boolean(this.ctx?.useComponents);
    const collisionComponent = this.ctx?.collisionComponent;

    if (useComponents && collisionComponent) {
      collisionComponent.handleAsteroidCollisions(buffer);
      return;
    }

    for (let i = 0; i < buffer.length - 1; i += 1) {
      const a1 = buffer[i];
      if (!a1 || a1.destroyed) {
        continue;
      }

      for (let j = i + 1; j < buffer.length; j += 1) {
        const a2 = buffer[j];
        if (!a2 || a2.destroyed) {
          continue;
        }

        this.checkAsteroidCollision(a1, a2);
      }
    }
  }

  /**
   * Original collision physics between asteroids.
   * @param {import('../../enemies/types/Asteroid.js').Asteroid} a1
   * @param {import('../../enemies/types/Asteroid.js').Asteroid} a2
   */
  checkAsteroidCollision(a1, a2) {
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
        (typeof this.ctx?.getRandomScope === 'function'
          ? this.ctx.getRandomScope('fragments')
          : undefined);
      const rotationSource =
        collisionRandom ||
        (typeof this.ctx?.getRandomScope === 'function'
          ? this.ctx.getRandomScope('fragments')
          : undefined) ||
        (typeof this.ctx?.getRandomService === 'function'
          ? this.ctx.getRandomService()
          : undefined);
      const rotationDelta =
        rotationSource && typeof rotationSource.range === 'function'
          ? rotationSource.range(-0.75, 0.75)
          : rotationSource && typeof rotationSource.float === 'function'
          ? (rotationSource.float() - 0.5) * 1.5
          : 0;
      a1.rotationSpeed += rotationDelta;
      a2.rotationSpeed += rotationDelta;
    }
  }

  /**
   * Releases destroyed enemies back to pools and trims the main list.
   */
  cleanupDestroyed() {
    const facade = this.facade;
    const asteroids = this.ctx?.asteroids;

    if (!Array.isArray(asteroids) || asteroids.length === 0) {
      return;
    }

    const remaining = [];
    let removed = 0;

    for (let i = 0; i < asteroids.length; i += 1) {
      const asteroid = asteroids[i];
      if (!asteroid || asteroid.destroyed) {
        if (typeof this.ctx?.releaseAsteroid === 'function') {
          this.ctx.releaseAsteroid(asteroid);
        } else {
          facade.releaseAsteroid(asteroid);
        }
        removed += 1;
        continue;
      }

      remaining.push(asteroid);
    }

    if (removed > 0) {
      facade.asteroids = remaining;
      if (typeof this.ctx?.invalidateActiveEnemyCache === 'function') {
        this.ctx.invalidateActiveEnemyCache();
      } else {
        facade.invalidateActiveEnemyCache();
      }
    }
  }

  /**
   * Proxies spawning requests to the spawn sub-system or the facade fallback.
   * @param {number} deltaTime
   */
  handleSpawning(deltaTime) {
    const spawnSystem =
      this.spawnSystem ?? this.ctx?.spawnSystem ?? this.facade?.spawnSystem ?? null;

    if (spawnSystem && typeof spawnSystem.handleSpawning === 'function') {
      spawnSystem.handleSpawning(deltaTime);
      return;
    }

    const facade = this.facade;
    if (facade && typeof facade.handleSpawning === 'function') {
      facade.handleSpawning(deltaTime);
    }
  }

  /**
   * Handles wave completion event from WaveManager.
   * Grants rewards and updates wave state when WaveManager completes a wave.
   * @param {{
   *   wave?: number,
   *   asteroidsKilled?: number,
   *   totalAsteroids?: number,
   * }} data
   */
  handleWaveManagerWaveComplete(data) {
    const facade = this.facade;
    const wave = this.ctx?.waveState;

    if (!wave) {
      console.warn('[EnemyUpdateSystem] Cannot handle wave completion - no wave state');
      return;
    }

    if (typeof facade?.grantWaveRewards === 'function') {
      facade.grantWaveRewards();
    }

    wave.isActive = false;
    wave.breakTimer = Number.isFinite(data?.countdown)
      ? Math.max(0, data.countdown)
      : WAVE_BREAK_TIME;
    wave.completedWaves = (Number.isFinite(wave.completedWaves)
      ? wave.completedWaves
      : 0) + 1;

    if (typeof this.ctx?.emitWaveStateUpdate === 'function') {
      this.ctx.emitWaveStateUpdate(true);
    } else if (typeof facade?.emitWaveStateUpdate === 'function') {
      facade.emitWaveStateUpdate(true);
    }

    GameDebugLogger.log('WAVE', 'Wave complete handled by UpdateSystem', {
      wave: data?.wave,
      asteroidsKilled: data?.asteroidsKilled,
      totalAsteroids: data?.totalAsteroids,
    });
  }
}
