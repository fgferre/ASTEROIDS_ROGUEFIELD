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
   * Tracks and moves toward player position.
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

    // Initialize tracking state
    if (!asteroid.variantState) {
      asteroid.variantState = {};
    }

    if (!asteroid.variantState.trackingStartTime) {
      asteroid.variantState.trackingStartTime = Date.now();
      asteroid.variantState.hasAccelerated = false;
    }

    const trackingDuration = (Date.now() - asteroid.variantState.trackingStartTime) / 1000;
    const trackingDelay = behavior.tracking?.delay ?? 1.5;
    const accelerationDelay = behavior.tracking?.accelerationDelay ?? 3.0;
    const targetSpeed = behavior.tracking?.targetSpeed ?? 150;
    const accelerationRate = behavior.tracking?.accelerationRate ?? 50;

    // Initial delay before tracking starts
    if (trackingDuration < trackingDelay) {
      this.linearMovement(asteroid, deltaTime, context);
      return;
    }

    // Calculate direction to player
    const dx = player.position.x - asteroid.x;
    const dy = player.position.y - asteroid.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) {
      return;
    }

    const dirX = dx / distance;
    const dirY = dy / distance;

    // Accelerate after delay
    if (trackingDuration >= accelerationDelay && !asteroid.variantState.hasAccelerated) {
      const speed = Math.sqrt(asteroid.vx * asteroid.vx + asteroid.vy * asteroid.vy);
      const newSpeed = Math.min(targetSpeed, speed + accelerationRate * deltaTime);

      asteroid.vx = dirX * newSpeed;
      asteroid.vy = dirY * newSpeed;

      if (newSpeed >= targetSpeed) {
        asteroid.variantState.hasAccelerated = true;
      }
    } else {
      // Gradual steering toward player
      const steeringStrength = 0.3;
      asteroid.vx += dirX * steeringStrength * deltaTime * 60;
      asteroid.vy += dirY * steeringStrength * deltaTime * 60;
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
    if (Math.random() < 0.01) {
      asteroid.rotationSpeed += (Math.random() - 0.5) * 0.5;
    }
  }

  /**
   * Wraps asteroid position around screen edges.
   *
   * @param {Asteroid} asteroid - The asteroid
   * @param {Object} bounds - World bounds {width, height}
   */
  wrapScreenEdges(asteroid, bounds) {
    if (!bounds) {
      return;
    }

    const margin = asteroid.radius || 30;

    if (asteroid.x < -margin) {
      asteroid.x = bounds.width + margin;
    } else if (asteroid.x > bounds.width + margin) {
      asteroid.x = -margin;
    }

    if (asteroid.y < -margin) {
      asteroid.y = bounds.height + margin;
    } else if (asteroid.y > bounds.height + margin) {
      asteroid.y = -margin;
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
