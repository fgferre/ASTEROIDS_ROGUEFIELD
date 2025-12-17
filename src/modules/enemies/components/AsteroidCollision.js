/**
 * Asteroid Collision Component
 *
 * Handles collision detection and physics between asteroids.
 * Implements elastic collision with mass-based impulse resolution.
 *
 * Features:
 * - Circle-circle collision detection
 * - Elastic collision physics
 * - Mass-based impulse
 * - Penetration correction
 * - Rotation effects from collisions
 *
 * Design Pattern: Component Pattern
 * - Separates collision logic from asteroid logic
 * - Reusable and testable
 *
 * @example
 * ```javascript
 * const collision = new AsteroidCollision();
 * collision.handleAsteroidCollisions(asteroids);
 * ```
 */

import { COLLISION_BOUNCE } from '../../../data/constants/gameplay.js';

export class AsteroidCollision {
  constructor() {
    this.collisionBounce = COLLISION_BOUNCE || 0.8;
  }

  /**
   * Handles collisions between all asteroids in the array.
   *
   * @param {Array<Asteroid>} asteroids - Array of asteroids
   */
  handleAsteroidCollisions(asteroids) {
    if (!Array.isArray(asteroids) || asteroids.length < 2) {
      return;
    }

    // Check each pair of asteroids
    for (let i = 0; i < asteroids.length - 1; i++) {
      const a1 = asteroids[i];
      if (!a1 || a1.destroyed) continue;

      for (let j = i + 1; j < asteroids.length; j++) {
        const a2 = asteroids[j];
        if (!a2 || a2.destroyed) continue;

        this.checkAsteroidCollision(a1, a2);
      }
    }
  }

  /**
   * Checks and resolves collision between two asteroids.
   *
   * @param {Asteroid} a1 - First asteroid
   * @param {Asteroid} a2 - Second asteroid
   */
  checkAsteroidCollision(a1, a2) {
    // Calculate distance between centers
    const dx = a2.x - a1.x;
    const dy = a2.y - a1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Check if collision occurred
    const minDistance = a1.radius + a2.radius;

    if (distance < minDistance && distance > 0) {
      // Collision detected - resolve it
      this.resolveCollision(a1, a2, dx, dy, distance, minDistance);
    }
  }

  /**
   * Resolves collision physics between two asteroids.
   *
   * @param {Asteroid} a1 - First asteroid
   * @param {Asteroid} a2 - Second asteroid
   * @param {number} dx - Delta X between centers
   * @param {number} dy - Delta Y between centers
   * @param {number} distance - Current distance between centers
   * @param {number} minDistance - Minimum distance (sum of radii)
   */
  resolveCollision(a1, a2, dx, dy, distance, minDistance) {
    // Normalize collision direction
    const nx = dx / distance;
    const ny = dy / distance;

    // === PENETRATION CORRECTION ===
    // Separate asteroids to prevent overlap
    const overlap = minDistance - distance;
    const percent = 0.5; // Split correction 50/50
    a1.x -= nx * overlap * percent;
    a1.y -= ny * overlap * percent;
    a2.x += nx * overlap * percent;
    a2.y += ny * overlap * percent;

    // === ELASTIC COLLISION PHYSICS ===
    // Calculate relative velocity
    const rvx = a2.vx - a1.vx;
    const rvy = a2.vy - a1.vy;

    // Velocity along collision normal
    const velAlongNormal = rvx * nx + rvy * ny;

    // Don't resolve if velocities are separating
    if (velAlongNormal >= 0) {
      return;
    }

    // Calculate impulse scalar
    const e = this.collisionBounce; // Coefficient of restitution (bounciness)
    const invMass1 = 1 / (a1.mass || 1);
    const invMass2 = 1 / (a2.mass || 1);
    const j = (-(1 + e) * velAlongNormal) / (invMass1 + invMass2);

    // Apply impulse to velocities
    const jx = j * nx;
    const jy = j * ny;

    a1.vx -= jx * invMass1;
    a1.vy -= jy * invMass1;
    a2.vx += jx * invMass2;
    a2.vy += jy * invMass2;

    // === ROTATION EFFECTS ===
    // Add some rotational spin from collision
    const collisionRandom =
      (typeof a1?.getRandomFor === 'function' &&
        a1.getRandomFor('collision')) ||
      (typeof a2?.getRandomFor === 'function' &&
        a2.getRandomFor('collision')) ||
      null;

    if (collisionRandom?.range) {
      const rotationImpulse = collisionRandom.range(-0.75, 0.75);
      a1.rotationSpeed += rotationImpulse;
      a2.rotationSpeed += rotationImpulse;
    }
  }

  /**
   * Checks if a point is colliding with an asteroid.
   *
   * @param {Asteroid} asteroid - The asteroid
   * @param {number} x - Point X coordinate
   * @param {number} y - Point Y coordinate
   * @returns {boolean} True if collision detected
   */
  checkPointCollision(asteroid, x, y) {
    if (!asteroid || asteroid.destroyed) {
      return false;
    }

    const dx = x - asteroid.x;
    const dy = y - asteroid.y;
    const distanceSq = dx * dx + dy * dy;
    const radiusSq = asteroid.radius * asteroid.radius;

    return distanceSq <= radiusSq;
  }

  /**
   * Checks if a circle is colliding with an asteroid.
   *
   * @param {Asteroid} asteroid - The asteroid
   * @param {number} x - Circle center X
   * @param {number} y - Circle center Y
   * @param {number} radius - Circle radius
   * @returns {boolean} True if collision detected
   */
  checkCircleCollision(asteroid, x, y, radius) {
    if (!asteroid || asteroid.destroyed) {
      return false;
    }

    const dx = x - asteroid.x;
    const dy = y - asteroid.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = asteroid.radius + radius;

    return distance < minDistance;
  }

  /**
   * Gets all asteroids within a certain radius of a point.
   *
   * @param {Array<Asteroid>} asteroids - Array of asteroids
   * @param {number} x - Point X coordinate
   * @param {number} y - Point Y coordinate
   * @param {number} radius - Search radius
   * @returns {Array<Asteroid>} Asteroids within radius
   */
  getAsteroidsInRadius(asteroids, x, y, radius) {
    if (!Array.isArray(asteroids)) {
      return [];
    }

    const radiusSq = radius * radius;
    const result = [];

    for (const asteroid of asteroids) {
      if (!asteroid || asteroid.destroyed) {
        continue;
      }

      const dx = asteroid.x - x;
      const dy = asteroid.y - y;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq <= radiusSq) {
        result.push(asteroid);
      }
    }

    return result;
  }

  /**
   * Checks if two circles are colliding (simple distance check).
   *
   * @param {number} x1 - First circle X
   * @param {number} y1 - First circle Y
   * @param {number} r1 - First circle radius
   * @param {number} x2 - Second circle X
   * @param {number} y2 - Second circle Y
   * @param {number} r2 - Second circle radius
   * @returns {boolean} True if colliding
   */
  static checkCircles(x1, y1, r1, x2, y2, r2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = r1 + r2;

    return distance < minDistance;
  }

  /**
   * Sets the collision bounce coefficient.
   *
   * @param {number} bounce - Coefficient of restitution (0-1)
   */
  setCollisionBounce(bounce) {
    this.collisionBounce = Math.max(0, Math.min(1, bounce));
  }
}
