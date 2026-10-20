/**
 * EnemyDamageSystem
 * ------------------
 * Centralizes all damage-handling responsibilities for the EnemySystem facade.
 *
 * Responsibilities:
 * - Apply direct damage to enemies and resolve destruction/fragmentation.
 * - Handle volatile variant explosions and self-destruct timers.
 * - Process indirect damage sources such as mines and shield explosions.
 * - Apply damage to the player while preserving invulnerability timers and events.
 *
 * Design Pattern:
 * - Stateless sub-system that operates entirely on the EnemySystem facade state.
 * - Uses a context object to access shared services (spawn system, physics, player, etc.).
 * - Emits events via the facade to keep RewardManager integrations untouched.
 * - Mirrors the delegation strategy used by EnemySpawnSystem.
 *
 * Usage:
 * ```js
 * const damageSystem = new EnemyDamageSystem({ facade, spawnSystem });
 * damageSystem.applyDamage(enemy, amount, { cause: 'collision' });
 * ```
 */

import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';
import { ASTEROID_VARIANTS } from '../../../data/enemies/asteroid-configs.js';
import { ELITE_AFFIXES } from '../../../data/enemies/affixes.js';
import { resolveEventBus } from '../../../core/serviceUtils.js';
import { requireRandom } from '../../../utils/randomHelpers.js';

class EnemyDamageSystem {
  /**
   * @param {Object} context
   * @param {import('../../EnemySystem.js').default} context.facade
   * @param {import('./EnemySpawnSystem.js').EnemySpawnSystem} [context.spawnSystem]
   */
  constructor(context = {}) {
    const { facade = null, spawnSystem = null } = context;

    if (!facade) {
      GameDebugLogger.log(
        'ERROR',
        'EnemyDamageSystem missing facade reference'
      );
      throw new Error('EnemyDamageSystem requires a facade reference');
    }

    this.facade = facade;
    this.spawnSystem = spawnSystem || facade.spawnSystem || null;

    this.context = {
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
      emitEvent: (...args) => facade.emitEvent?.(...args),
    };

    GameDebugLogger.log('INIT', 'EnemyDamageSystem initialized', {
      hasSpawnSystem: Boolean(this.spawnSystem),
    });
  }

  /**
   * Applies raw damage to the provided enemy instance.
   *
   * @param {Object} asteroid
   * @param {number} damage
   * @param {Object} [options]
   * @returns {{ killed: boolean, remainingHealth: number, fragments: Array }}
   */
  applyDamage(asteroid, damage, options = {}) {
    if (!asteroid || typeof asteroid.takeDamage !== 'function') {
      return { killed: false, remainingHealth: 0, fragments: [] };
    }

    if (asteroid.destroyed) {
      return { killed: false, remainingHealth: 0, fragments: [] };
    }

    // options.source carries the hit position for direction-aware enemies (Bulwark).
    const killed = asteroid.takeDamage(damage, options.source);
    const remainingHealth = Math.max(0, asteroid.health);

    if (killed) {
      const fragments = this.destroyAsteroid(asteroid, {
        cause: options.cause || 'damage',
        createFragments: options.createFragments !== false,
        triggerExplosion: options.triggerExplosion,
        source: options.source,
      });
      return { killed: true, remainingHealth: 0, fragments };
    }

    return { killed: false, remainingHealth, fragments: [] };
  }

  /**
   * Handles complete destruction of an asteroid, including fragmentation and
   * wave bookkeeping.
   *
   * @param {Object} asteroid
   * @param {Object} [options]
   * @returns {Array}
   */
  destroyAsteroid(asteroid, options = {}) {
    if (!asteroid || asteroid.destroyed) return [];

    const waveNumber = this.context.waveState?.current || asteroid.wave || 1;
    const createFragments = options.createFragments !== false;

    asteroid.destroyed = true;
    this.context.invalidateActiveEnemyCache?.();

    const fragmentDescriptors = createFragments
      ? asteroid.generateFragments?.() || []
      : [];
    const fragments = [];

    if (fragmentDescriptors.length > 0) {
      let fragmentVariants = [];
      if (
        this.spawnSystem &&
        typeof this.spawnSystem.assignVariantsToFragments === 'function'
      ) {
        fragmentVariants = this.spawnSystem.assignVariantsToFragments(
          fragmentDescriptors,
          asteroid,
          waveNumber
        );
      } else if (typeof this.facade.assignVariantsToFragments === 'function') {
        fragmentVariants = this.facade.assignVariantsToFragments(
          fragmentDescriptors,
          asteroid,
          waveNumber
        );
      }

      fragmentDescriptors.forEach((descriptor, index) => {
        const fragmentRandom = this.context.createScopedRandom?.(
          'fragments',
          'fragment'
        );

        let fragment = null;
        if (
          this.spawnSystem &&
          typeof this.spawnSystem.acquireAsteroid === 'function'
        ) {
          fragment = this.spawnSystem.acquireAsteroid({
            ...descriptor,
            variant: fragmentVariants?.[index],
            wave: descriptor.wave || waveNumber,
            random: fragmentRandom?.random,
            randomScope: 'fragments',
          });
        } else if (typeof this.facade.acquireAsteroid === 'function') {
          fragment = this.facade.acquireAsteroid({
            ...descriptor,
            variant: fragmentVariants?.[index],
            wave: descriptor.wave || waveNumber,
            random: fragmentRandom?.random,
            randomScope: 'fragments',
          });
        }

        if (!fragment) {
          return;
        }

        let registrationResult = null;
        if (
          this.spawnSystem &&
          typeof this.spawnSystem.registerActiveEnemy === 'function'
        ) {
          registrationResult = this.spawnSystem.registerActiveEnemy(fragment);
        } else if (typeof this.facade.registerActiveEnemy === 'function') {
          registrationResult = this.facade.registerActiveEnemy(fragment);
        }

        if (
          this.spawnSystem &&
          typeof this.spawnSystem.warnIfWaveManagerRegistrationFailed ===
            'function'
        ) {
          this.spawnSystem.warnIfWaveManagerRegistrationFailed(
            registrationResult,
            'fragment-spawn',
            fragment
          );
        } else if (
          typeof this.facade.warnIfWaveManagerRegistrationFailed === 'function'
        ) {
          this.facade.warnIfWaveManagerRegistrationFailed(
            registrationResult,
            'fragment-spawn',
            fragment
          );
        }

        fragments.push(fragment);
      });

      this.facade.waveManager.addExtraRocks(fragments.length);
    }

    if (this.context.sessionStats) {
      this.context.sessionStats.totalKills += 1;
    }

    const shouldExplode =
      options.triggerExplosion === true ||
      (options.triggerExplosion !== false && this.isVolatileVariant(asteroid));

    if (shouldExplode) {
      this.triggerVolatileExplosion(asteroid, options.cause || 'destroyed');
    }

    const bus =
      this.facade.eventBus || resolveEventBus(this.facade?.dependencies);

    const payload = {
      enemy: asteroid,
      fragments,
      position: { x: asteroid.x, y: asteroid.y },
      size: asteroid.size,
      variant: asteroid.variant,
      maxHealth: asteroid.maxHealth,
      cause: options.cause || 'destroyed',
      // The killing hit, when known: its orbs burst away from it.
      source: options.source ?? null,
      wave: waveNumber,
      spawnedBy: asteroid.spawnedBy,
    };

    if (bus && typeof bus.emit === 'function') {
      bus.emit('enemy-destroyed', payload);
    } else if (typeof this.context.emitEvent === 'function') {
      this.context.emitEvent('enemy-destroyed', payload);
    }

    return fragments;
  }

  /**
   * Determines if the provided asteroid uses the volatile behavior variant.
   *
   * @param {Object} asteroid
   * @returns {boolean}
   */
  isVolatileVariant(asteroid) {
    if (!asteroid) return false;
    const variant =
      ASTEROID_VARIANTS?.[asteroid.variant] || ASTEROID_VARIANTS?.common;
    return variant?.behavior?.type === 'volatile';
  }

  /**
   * Triggers volatile explosion area damage and event emission.
   *
   * @param {Object} asteroid
   * @param {string} [cause='destroyed']
   */
  triggerVolatileExplosion(asteroid, cause = 'destroyed') {
    if (!asteroid) return;

    const variant =
      ASTEROID_VARIANTS?.[asteroid.variant] || ASTEROID_VARIANTS?.common;
    // A Volatile Elite (BaseEnemy.onDestroyed) blows with its affix's numbers.
    const explosion = asteroid.affixes?.includes('volatile')
      ? ELITE_AFFIXES.volatile
      : variant?.behavior?.explosion;

    if (!explosion) {
      return;
    }

    const radius = explosion.radius ?? 0;
    const damage = explosion.damage ?? 0;
    if (radius <= 0 || damage <= 0) {
      return;
    }

    const radiusSq = radius * radius;

    this.context.asteroids?.forEach((target) => {
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

    const player = this.context.getCachedPlayer?.();
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
        source: asteroid,
      });
    }

    const bus =
      this.facade.eventBus || resolveEventBus(this.facade?.dependencies);

    const payload = {
      asteroid,
      position: { x: asteroid.x, y: asteroid.y },
      radius,
      damage,
      cause,
    };

    if (bus && typeof bus.emit === 'function') {
      bus.emit('asteroid-volatile-exploded', payload);
    } else if (typeof this.context.emitEvent === 'function') {
      this.context.emitEvent('asteroid-volatile-exploded', payload);
    }
  }

  /**
   * Forces a volatile asteroid to explode when its timer expires.
   *
   * @param {Object} asteroid
   */
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

  /**
   * Applies direct damage to the player, respecting blast radius and
   * invulnerability windows.
   *
   * @param {number} amount
   * @param {Object} [context]
   * @returns {Object}
   */
  applyDirectDamageToPlayer(amount, context = {}) {
    const player = this.context.getCachedPlayer?.();
    if (!player || typeof player.takeDamage !== 'function') {
      return { applied: false };
    }

    const playerPosition = this.context.getPlayerPositionSnapshot?.(player);

    const hasBlastRadius =
      context &&
      context.position &&
      Number.isFinite(context.position.x) &&
      Number.isFinite(context.position.y) &&
      Number.isFinite(context.radius) &&
      context.radius > 0;

    if (hasBlastRadius && playerPosition) {
      const hullRadius = this.context.getPlayerHullRadius?.(player) ?? 0;
      const dx = playerPosition.x - context.position.x;
      const dy = playerPosition.y - context.position.y;
      const distance = Math.hypot(dx, dy);

      if (distance > context.radius + hullRadius) {
        return { applied: false };
      }
    }

    if (
      Number.isFinite(player.invulnerableTimer) &&
      player.invulnerableTimer > 0
    ) {
      return { applied: false };
    }

    const wasShieldActive = Boolean(player.isShieldActive);
    const previousShieldHP = Number.isFinite(player.shieldHP)
      ? player.shieldHP
      : 0;
    const previousHealth = Number.isFinite(player.health)
      ? player.health
      : null;

    const remaining = player.takeDamage(amount, context.source);
    const currentHealth = Number.isFinite(player.health)
      ? player.health
      : previousHealth;
    const currentShieldHP = Number.isFinite(player.shieldHP)
      ? player.shieldHP
      : 0;

    const healthChanged =
      Number.isFinite(previousHealth) && Number.isFinite(currentHealth)
        ? currentHealth < previousHealth
        : false;
    const shieldAbsorbed = wasShieldActive
      ? Math.max(0, previousShieldHP - currentShieldHP)
      : 0;

    if (healthChanged && Number.isFinite(currentHealth) && currentHealth > 0) {
      if (typeof player.setInvulnerableTimer === 'function') {
        player.setInvulnerableTimer(0.5);
      } else {
        player.invulnerableTimer = 0.5;
      }
    }

    const eventPosition = playerPosition
      ? { x: playerPosition.x, y: playerPosition.y }
      : null;
    const damageSource =
      context &&
      context.position &&
      Number.isFinite(context.position.x) &&
      Number.isFinite(context.position.y)
        ? { x: context.position.x, y: context.position.y }
        : null;
    const damageCause = context.cause || 'enemy';

    const bus =
      this.facade.eventBus || resolveEventBus(this.facade?.dependencies);

    const baseEventPayload = {
      damage: amount,
      remaining: Number.isFinite(currentHealth) ? currentHealth : remaining,
      max: Number.isFinite(player.maxHealth) ? player.maxHealth : undefined,
      position: eventPosition,
      playerPosition: eventPosition,
      damageSource,
      source: context.source || null,
      cause: damageCause,
      shieldAbsorbed,
    };

    const emit = (payload) => {
      if (bus && typeof bus.emit === 'function') {
        bus.emit('player-took-damage', payload);
      } else if (typeof this.context.emitEvent === 'function') {
        this.context.emitEvent('player-took-damage', payload);
      }
    };

    if (healthChanged) {
      const healthDamage =
        Number.isFinite(previousHealth) && Number.isFinite(currentHealth)
          ? previousHealth - currentHealth
          : amount;
      emit({
        ...baseEventPayload,
        applied: true,
        absorbed: shieldAbsorbed > 0,
        healthDamage,
      });
    } else if (shieldAbsorbed > 0) {
      emit({
        ...baseEventPayload,
        applied: false,
        absorbed: true,
        healthDamage: 0,
      });
    }

    if (healthChanged && Number.isFinite(currentHealth) && currentHealth <= 0) {
      const world = this.context.getCachedWorld?.();
      if (world && typeof world.handlePlayerDeath === 'function') {
        if (world.playerAlive !== false) {
          world.handlePlayerDeath();
        }
      }
    }

    const applied = healthChanged || shieldAbsorbed > 0;

    if (!applied) {
      return { applied: false };
    }

    return {
      applied: true,
      remaining: Number.isFinite(currentHealth) ? currentHealth : remaining,
      absorbed: !healthChanged && shieldAbsorbed > 0,
      shieldAbsorbed,
      healthDamage:
        healthChanged &&
        Number.isFinite(previousHealth) &&
        Number.isFinite(currentHealth)
          ? previousHealth - currentHealth
          : 0,
    };
  }

  /**
   * Delegates mine explosion handling to physics or falls back to shield logic.
   *
   * @param {Object|null} data
   */
  handleMineExplosion(data = null) {
    if (!data || !data.position) {
      return;
    }

    const physics = this.context.getCachedPhysics?.();
    if (physics) {
      if (typeof physics.handleMineExplosion === 'function') {
        physics.handleMineExplosion(data);
        return;
      }

      if (typeof physics.applyAreaDamage === 'function') {
        physics.applyAreaDamage(data);
        return;
      }

      if (typeof physics.queueAreaDamage === 'function') {
        physics.queueAreaDamage(data);
        return;
      }
    }

    this.handleShieldExplosionDamage({
      position: data.position,
      radius: data.radius,
      damage: data.damage,
    });
  }

  /**
   * Applies shield explosion damage (and knockback) to nearby enemies.
   *
   * @param {Object} data
   */
  handleShieldExplosionDamage(data) {
    if (!data || !data.position) {
      return;
    }

    const radius = typeof data.radius === 'number' ? data.radius : 200;
    const damage = typeof data.damage === 'number' ? data.damage : 50;

    const radiusSq = radius * radius;
    const originX = data.position.x;
    const originY = data.position.y;

    const physics = this.context.getCachedPhysics?.();
    let nearbyEnemies = null;
    if (physics) {
      if (typeof physics.getNearbyEnemies === 'function') {
        nearbyEnemies = physics.getNearbyEnemies(originX, originY, radius);
      } else if (typeof physics.getNearbyAsteroids === 'function') {
        nearbyEnemies = physics.getNearbyAsteroids(originX, originY, radius);
      }
    }

    if (!nearbyEnemies || nearbyEnemies.length === 0) {
      nearbyEnemies = this.context.asteroids;
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

      if (distanceSq > radiusSq) {
        continue;
      }

      const distance = Math.sqrt(distanceSq);
      const falloff = 1 - Math.min(distance / radius, 1);
      const actualDamage = damage * falloff;

      if (actualDamage <= 0) {
        continue;
      }

      const damageResult = this.applyDamage(asteroid, actualDamage, {
        cause: 'shield-explosion',
        createFragments: true,
        triggerExplosion: false,
      });

      if (damageResult?.killed) {
        continue;
      }

      if (distanceSq > 0) {
        const impulse = (300 * falloff) / Math.max(asteroid.mass, 1);
        const nx = dx / Math.max(distance, 0.001);
        const ny = dy / Math.max(distance, 0.001);

        asteroid.vx += nx * impulse;
        asteroid.vy += ny * impulse;
        const collisionRandom =
          typeof asteroid.getRandomFor === 'function'
            ? asteroid.getRandomFor('collision')
            : null;
        const rotationSource =
          collisionRandom ||
          this.context.getRandomScope?.('fragments') ||
          this.context.getRandomService?.();
        const rotationImpulse =
          rotationSource && typeof rotationSource.range === 'function'
            ? rotationSource.range(-1.5, 1.5)
            : requireRandom(
                rotationSource,
                'enemy.collision.rotation'
              ).float() *
                3 -
              1.5;
        asteroid.rotationSpeed += rotationImpulse * falloff;
      }
    }
  }
}

/**
 * Extra fragments from a beam kill: `count` (the beam's `extraFragments`)
 * copies of the first seam in `split.descriptors` (generateFragments, read
 * before the kill), each
 * turned half a step from it so it does not overlap its siblings, given a
 * variant, taken from the pool, registered, and added to the layer's rock
 * plan (WaveManager.addExtraRocks). `enemies` is the enemy service; `split`
 * is { x, y, wave, descriptors }.
 *
 * Mirrors the fragment half of destroyAsteroid one fragment at a time;
 * unifying the two pipelines is a later cleanup.
 */
function spawnBeamFragments(enemies, parent, split, count) {
  const { descriptors } = split;
  if (!descriptors.length) return;
  const base = descriptors[0];
  const wave = enemies.waveState?.current || split.wave || 1;
  for (let k = 0; k < count; k += 1) {
    const turn = (Math.PI * (2 * k + 1)) / descriptors.length;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const ox = base.x - split.x;
    const oy = base.y - split.y;
    const descriptor = {
      ...base,
      x: split.x + ox * cos - oy * sin,
      y: split.y + ox * sin + oy * cos,
      vx: base.vx * cos - base.vy * sin,
      vy: base.vx * sin + base.vy * cos,
    };
    const [variant] = enemies.assignVariantsToFragments(
      [descriptor],
      parent,
      wave
    );
    const fragment = enemies.acquireAsteroid({
      ...descriptor,
      variant,
      wave: descriptor.wave || wave,
      random: enemies.createScopedRandom('fragments', 'fragment')?.random,
      randomScope: 'fragments',
    });
    if (!fragment) continue;
    enemies.warnIfWaveManagerRegistrationFailed(
      enemies.registerActiveEnemy(fragment),
      'fragment-spawn',
      fragment
    );
    enemies.waveManager.addExtraRocks(1);
  }
}

export { EnemyDamageSystem, spawnBeamFragments };
