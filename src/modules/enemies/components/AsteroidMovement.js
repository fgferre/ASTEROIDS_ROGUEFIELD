/**
 * Asteroid Movement Component
 *
 * Handles movement logic for asteroids, including:
 * - Basic linear movement
 * - Rotation
 * - Behavior-based movement (parasite tracking, volatile movement)
 * - Screen wrapping
 *
 * Design Pattern: Strategy Pattern
 * - Different movement strategies for different asteroid variants
 * - Extensible for future movement types
 *
 * @example
 * ```javascript
 * const movement = new AsteroidMovement();
 * movement.update(asteroid, deltaTime, gameContext);
 * ```
 */

import * as CONSTANTS from '../../../core/GameConstants.js';

export class AsteroidMovement {
  constructor() {
    // Movement strategies registry
    this.strategies = new Map();
    this.registerDefaultStrategies();
  }

  /**
   * Registers default movement strategies.
   */
  registerDefaultStrategies() {
    this.strategies.set('linear', this.linearMovement.bind(this));
    this.strategies.set('parasite', this.parasiteMovement.bind(this));
    this.strategies.set('volatile', this.volatileMovement.bind(this));
  }

  /**
   * Updates asteroid movement.
   *
   * @param {Asteroid} asteroid - The asteroid to update
   * @param {number} deltaTime - Time elapsed since last update
   * @param {Object} context - Game context (player position, world bounds, etc.)
   */
  update(asteroid, deltaTime, context = {}) {
    if (!asteroid || asteroid.destroyed) {
      return;
    }

    // Determine movement strategy based on behavior
    const strategyType = asteroid.behavior?.type || 'linear';
    const strategy = this.strategies.get(strategyType) || this.linearMovement;

    // Execute movement strategy
    strategy(asteroid, deltaTime, context);

    // Apply rotation
    asteroid.rotation += asteroid.rotationSpeed * deltaTime;

    // Wrap around screen edges
    this.wrapScreenEdges(asteroid, context.worldBounds);

    // Update behavior-specific state (e.g., parasite attack cooldown)
    this.updateBehaviorState(asteroid, deltaTime, context);
  }

  /**
   * Linear movement strategy (default).
   * Simply moves asteroid in its velocity direction.
   *
   * @param {Asteroid} asteroid - The asteroid
   * @param {number} deltaTime - Time delta
   * @param {Object} context - Game context
   */
  linearMovement(asteroid, deltaTime, context) {
    asteroid.x += asteroid.vx * deltaTime;
    asteroid.y += asteroid.vy * deltaTime;
  }

  /**
   * Parasite movement strategy.
   * Tracks and moves toward player position using the proven Asteroid logic.
   *
   * @param {Asteroid} asteroid - The asteroid
   * @param {number} deltaTime - Time delta
   * @param {Object} context - Game context with player
   */
  parasiteMovement(asteroid, deltaTime, context) {
    const { player } = context;
    const behavior = asteroid.behavior;

    if (!behavior || !player || !player.position) {
      // Fallback to linear movement if no player available
      this.linearMovement(asteroid, deltaTime, context);
      return;
    }

    // Calculate direction to player
    const dx = player.position.x - asteroid.x;
    const dy = player.position.y - asteroid.y;
    const distance = Math.hypot(dx, dy) || 0.0001;
    const dirX = dx / distance;
    const dirY = dy / distance;

    // Apply acceleration toward player
    const acceleration = behavior.acceleration ?? 0;
    asteroid.vx += dirX * acceleration * deltaTime;
    asteroid.vy += dirY * acceleration * deltaTime;

    // Limit maximum speed
    const maxSpeed = behavior.maxSpeed ?? Infinity;
    const currentSpeed = Math.hypot(asteroid.vx, asteroid.vy);
    if (currentSpeed > maxSpeed) {
      const scale = maxSpeed / currentSpeed;
      asteroid.vx *= scale;
      asteroid.vy *= scale;
    }

    // Repel when too close (avoid sticking to player)
    const minDistance = behavior.minDistance ?? 0;
    if (distance < minDistance) {
      const repelStrength = (minDistance - distance) / Math.max(minDistance, 1);
      asteroid.vx -= dirX * acceleration * repelStrength * deltaTime * 1.2;
      asteroid.vy -= dirY * acceleration * repelStrength * deltaTime * 1.2;
    }

    // Apply movement
    asteroid.x += asteroid.vx * deltaTime;
    asteroid.y += asteroid.vy * deltaTime;
  }

  /**
   * Volatile movement strategy.
   * Similar to linear but may have erratic behavior.
   *
   * @param {Asteroid} asteroid - The asteroid
   * @param {number} deltaTime - Time delta
   * @param {Object} context - Game context
   */
  volatileMovement(asteroid, deltaTime, context) {
    // For now, volatile movement is just linear
    // Could add jittery movement or pulsing in the future
    this.linearMovement(asteroid, deltaTime, context);

    // Optional: Add slight rotation speed variation
    const movementRandom =
      typeof asteroid?.getRandomFor === 'function'
        ? asteroid.getRandomFor('movement')
        : null;
    if (!movementRandom?.chance || !movementRandom?.range) {
      return;
    }

    if (!movementRandom.chance(0.01)) {
      return;
    }

    const delta = movementRandom.range(-0.25, 0.25);
    asteroid.rotationSpeed += delta;
  }

  /**
   * Wraps asteroid position around screen edges.
   *
   * @param {Asteroid} asteroid - The asteroid
   * @param {Object} bounds - World bounds {width, height} (optional, uses CONSTANTS as fallback)
   */
  wrapScreenEdges(asteroid, bounds) {
    // Use provided bounds or fallback to CONSTANTS
    const width = bounds?.width ?? CONSTANTS.GAME_WIDTH;
    const height = bounds?.height ?? CONSTANTS.GAME_HEIGHT;

    const margin = asteroid.radius || 30;

    if (asteroid.x < -margin) {
      asteroid.x = width + margin;
    } else if (asteroid.x > width + margin) {
      asteroid.x = -margin;
    }

    if (asteroid.y < -margin) {
      asteroid.y = height + margin;
    } else if (asteroid.y > height + margin) {
      asteroid.y = -margin;
    }
  }

  /**
   * Updates behavior-specific state that's coupled with movement.
   * Called AFTER movement is applied.
   *
   * @param {Asteroid} asteroid - The asteroid
   * @param {number} deltaTime - Time delta
   * @param {Object} context - Game context
   */
  updateBehaviorState(asteroid, deltaTime, context) {
    if (asteroid.behavior?.type === 'parasite') {
      this.updateParasiteAttack(asteroid, deltaTime, context);
    }
  }

  /**
   * Handles parasite contact attack logic.
   * Separated from movement but executed in the same update cycle.
   *
   * @param {Asteroid} asteroid - The parasite asteroid
   * @param {number} deltaTime - Time delta
   * @param {Object} context - Game context with player
   */
  updateParasiteAttack(asteroid, deltaTime, context) {
    const { player } = context;
    const behavior = asteroid.behavior;

    if (!player || !asteroid.system) {
      return;
    }

    // Initialize attack cooldown state
    if (!asteroid.variantState) {
      asteroid.variantState = { attackCooldown: 0 };
    }

    // Update attack cooldown
    asteroid.variantState.attackCooldown = Math.max(
      0,
      (asteroid.variantState.attackCooldown || 0) - deltaTime
    );

    // Calculate attack range
    const playerRadius =
      typeof player.getHullBoundingRadius === 'function'
        ? player.getHullBoundingRadius()
        : CONSTANTS.SHIP_SIZE;
    const attackRange =
      (behavior.minDistance ?? 0) + asteroid.radius + playerRadius + 6;

    // Check if in range to attack
    const dx = player.position.x - asteroid.x;
    const dy = player.position.y - asteroid.y;
    const distance = Math.hypot(dx, dy);

    if (
      distance <= attackRange &&
      asteroid.variantState.attackCooldown === 0 &&
      typeof asteroid.system.applyDirectDamageToPlayer === 'function'
    ) {
      // Execute contact attack
      const damage = behavior.contactDamage ?? 20;
      const result = asteroid.system.applyDirectDamageToPlayer(damage, {
        cause: 'parasite',
        position: { x: asteroid.x, y: asteroid.y },
      });

      // Set cooldown if attack was successful
      if (result?.applied) {
        asteroid.variantState.attackCooldown = behavior.cooldown ?? 1.2;
      }
    }
  }

  /**
   * Registers a custom movement strategy.
   *
   * @param {string} name - Strategy name
   * @param {Function} strategy - Strategy function (asteroid, deltaTime, context) => void
   */
  registerStrategy(name, strategy) {
    if (typeof strategy !== 'function') {
      console.error(`[AsteroidMovement] Strategy must be a function: ${name}`);
      return;
    }

    this.strategies.set(name, strategy);
    console.log(`[AsteroidMovement] Registered strategy: ${name}`);
  }

  /**
   * Gets all registered strategy names.
   *
   * @returns {Array<string>} Strategy names
   */
  getStrategyNames() {
    return Array.from(this.strategies.keys());
  }
}
