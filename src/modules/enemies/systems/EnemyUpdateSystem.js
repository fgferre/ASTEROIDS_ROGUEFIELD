/**
 * Coordinates the per-frame update responsibilities that historically lived
 * directly inside EnemySystem. EnemyUpdateSystem intentionally remains a pure
 * orchestrator: it owns no gameplay state and simply delegates back to the
 * facade (EnemySystem) for persistence, spawning, rewards, and event emission.
 *
 * Responsibilities handled here:
 * - Run the WaveManager's rock trickle and layer clock each frame
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
import { GAME_WIDTH, GAME_HEIGHT } from '../../../core/GameConstants.js';
import {
  ASTEROID_ENTRY_ANGLE_VARIANCE,
  ASTEROID_OFFSCREEN_RECOVERY_TIME,
  COLLISION_BOUNCE,
} from '../../../data/constants/gameplay.js';
import { ASTEROID_SPEEDS } from '../../../data/constants/physics.js';
import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';
import { requireRandom } from '../../../utils/randomHelpers.js';

export class EnemyUpdateSystem {
  /**
   * @param {{
   *   facade: import('../../EnemySystem.js').EnemySystem,
   *   spawnSystem?: import('./EnemySpawnSystem.js').EnemySpawnSystem,
   *   damageSystem?: import('./EnemyDamageSystem.js').EnemyDamageSystem,
   *   asteroids?: import('../../EnemySystem.js').EnemySystem['asteroids'],
   *   sessionStats?: import('../../EnemySystem.js').EnemySystem['sessionStats'],
   *   useComponents?: import('../../EnemySystem.js').EnemySystem['useComponents'],
   *   movementComponent?: import('../../EnemySystem.js').EnemySystem['movementComponent'],
   *   collisionComponent?: import('../../EnemySystem.js').EnemySystem['collisionComponent'],
   *   waveManager?: import('../../EnemySystem.js').EnemySystem['waveManager'],
   *   refreshServiceState?: import('../../EnemySystem.js').EnemySystem['refreshServiceState'],
   *   getCachedPlayer?: import('../../EnemySystem.js').EnemySystem['getCachedPlayer'],
   *   getCachedWorld?: import('../../EnemySystem.js').EnemySystem['getCachedWorld'],
   *   getCachedPhysics?: import('../../EnemySystem.js').EnemySystem['getCachedPhysics'],
   *   getRandomScope?: import('../../EnemySystem.js').EnemySystem['getRandomScope'],
   *   getRandomService?: import('../../EnemySystem.js').EnemySystem['getRandomService'],
   *   getActiveEnemyCount?: import('../../EnemySystem.js').EnemySystem['getActiveEnemyCount'],
   *   invalidateActiveEnemyCache?: import('../../EnemySystem.js').EnemySystem['invalidateActiveEnemyCache'],
   *   releaseAsteroid?: import('../../EnemySystem.js').EnemySystem['releaseAsteroid'],
   *   emitWaveStateUpdate?: import('../../EnemySystem.js').EnemySystem['emitWaveStateUpdate'],
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

    if (typeof this.ctx.refreshServiceState === 'function') {
      this.ctx.refreshServiceState();
    }

    const sessionStats = this.ctx?.sessionStats;
    if (sessionStats) {
      sessionStats.timeElapsed += deltaTime;
    }

    this.updateWaveManagerLogic(deltaTime);
    this.updateAsteroids(deltaTime);

    this.updateSupportEnemies(deltaTime);
    this.cleanupDestroyed();

    if (typeof this.ctx.emitWaveStateUpdate === 'function') {
      this.ctx.emitWaveStateUpdate();
    } else {
      facade.emitWaveStateUpdate();
    }
  }

  /**
   * The WaveManager's rock trickle, then its layer clock (the order every
   * replay depends on).
   * @param {number} deltaTime
   */
  updateWaveManagerLogic(deltaTime) {
    const waveManager = this.ctx.waveManager;
    waveManager.updateRockTrickle(deltaTime);
    waveManager.update(deltaTime);
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
    const movementComponent = this.ctx?.genericMovement;
    const movementContext =
      useComponents && movementComponent
        ? {
            player:
              typeof this.ctx?.getCachedPlayer === 'function'
                ? this.ctx.getCachedPlayer()
                : undefined,
            worldBounds: {
              width: GAME_WIDTH,
              height: GAME_HEIGHT,
            },
            random: this.ctx?.getRandomScope?.('movement'),
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
        movementComponent.update({
          enemy,
          deltaTime,
          player: movementContext.player,
          playerPosition: movementContext.player?.position,
          worldBounds: movementContext.worldBounds,
          random: movementContext.random,
        });

        if (typeof enemy.updateVisualState === 'function') {
          enemy.updateVisualState(deltaTime);
        }

        if (
          enemy.behavior?.type === 'volatile' &&
          typeof enemy.updateVolatileBehavior === 'function'
        ) {
          enemy.updateVolatileBehavior(deltaTime);
        }

        if (
          enemy.behavior?.type === 'parasite' &&
          typeof enemy.updateParasiteAttack === 'function'
        ) {
          enemy.updateParasiteAttack(deltaTime);
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
        this.applyAsteroidOffscreenRecovery(enemy, deltaTime);
        continue;
      }

      if (typeof enemy.update === 'function') {
        enemy.update(deltaTime);
      }

      this.applyAsteroidOffscreenRecovery(enemy, deltaTime);
    }

    this.handleAsteroidCollisions();
  }

  /**
   * Updates non-asteroid support enemies (drones, hunters, mines, bosses).
   * @param {number} deltaTime
   */
  updateSupportEnemies(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    const asteroids = this.ctx?.asteroids ?? [];
    const useComponents = Boolean(this.ctx?.useComponents);

    for (let i = 0; i < asteroids.length; i += 1) {
      const enemy = asteroids[i];
      if (!enemy || enemy.destroyed || enemy.type === 'asteroid') {
        continue;
      }
      // Stunned (Solar Flare): frozen in place, no AI, no fire.
      if (enemy.stunTimer > 0) {
        enemy.stunTimer -= deltaTime;
        continue;
      }

      const shouldUseComponents =
        useComponents &&
        enemy.useComponents &&
        enemy.components &&
        enemy.components.size > 0 &&
        typeof enemy.update === 'function';

      if (shouldUseComponents) {
        enemy.update(deltaTime);
      } else if (typeof enemy.onUpdate === 'function') {
        enemy.onUpdate(deltaTime);
      }
    }
  }

  applyAsteroidOffscreenRecovery(asteroid, deltaTime) {
    if (!asteroid || asteroid.type !== 'asteroid') {
      return;
    }

    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    const margin = Math.max(0, Number(asteroid.radius) || 0);
    const width = Number.isFinite(GAME_WIDTH) ? GAME_WIDTH : 0;
    const height = Number.isFinite(GAME_HEIGHT) ? GAME_HEIGHT : 0;
    const isOffscreen =
      asteroid.x < -margin ||
      asteroid.x > width + margin ||
      asteroid.y < -margin ||
      asteroid.y > height + margin;

    if (!isOffscreen) {
      asteroid.offscreenTimer = 0;
      return;
    }

    asteroid.offscreenTimer =
      (Number(asteroid.offscreenTimer) || 0) + deltaTime;

    const velocitySpeed = Math.hypot(asteroid.vx ?? 0, asteroid.vy ?? 0);
    const fallbackSpeed =
      ASTEROID_SPEEDS?.[asteroid.size] || ASTEROID_SPEEDS?.medium || 45;
    const speed = velocitySpeed > 0 ? velocitySpeed : fallbackSpeed;
    const travelTime =
      (margin + (Number(asteroid.radius) || 0)) / Math.max(speed, 1);
    const recoveryTime = Math.max(
      Number(ASTEROID_OFFSCREEN_RECOVERY_TIME) || 4,
      travelTime + 0.5
    );

    if (asteroid.offscreenTimer < recoveryTime) {
      return;
    }

    const random =
      typeof asteroid.getRandomFor === 'function'
        ? asteroid.getRandomFor('movement')
        : null;
    const variance = Number.isFinite(ASTEROID_ENTRY_ANGLE_VARIANCE)
      ? ASTEROID_ENTRY_ANGLE_VARIANCE
      : Math.PI / 4;
    const offset =
      random && typeof random.range === 'function'
        ? random.range(-variance, variance)
        : requireRandom(random, 'enemy.asteroid.entry-angle').float() *
            2 *
            variance -
          variance;

    const angle = Math.atan2(height / 2 - asteroid.y, width / 2 - asteroid.x);
    const nextVx = Math.cos(angle + offset) * speed;
    const nextVy = Math.sin(angle + offset) * speed;

    asteroid.vx = nextVx;
    asteroid.vy = nextVy;
    asteroid.velocity = { vx: nextVx, vy: nextVy };
    asteroid.offscreenTimer = 0;
  }

  /**
   * Performs asteroid-asteroid collision handling using a reusable buffer.
   */
  handleAsteroidCollisions() {
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
        (typeof a1?.getRandomFor === 'function' &&
          a1.getRandomFor('collision')) ||
        (typeof a2?.getRandomFor === 'function' &&
          a2.getRandomFor('collision')) ||
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
   * Handles wave completion event from WaveManager: grants the wave rewards
   * (WaveManager already closed the layer's rocks and counted the wave).
   * @param {{
   *   wave?: number,
   *   asteroidsKilled?: number,
   *   totalAsteroids?: number,
   * }} data
   */
  handleWaveManagerWaveComplete(data) {
    const facade = this.facade;

    if (typeof facade?.grantWaveRewards === 'function') {
      facade.grantWaveRewards();
    }

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
