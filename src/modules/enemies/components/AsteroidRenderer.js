/**
 * Asteroid Renderer Component
 *
 * Handles rendering of asteroids to canvas.
 * Coordinates batch rendering and visual effects.
 *
 * Features:
 * - Batch rendering for performance
 * - Visual state management
 * - Debug rendering options
 * - Layer-based rendering
 *
 * Design Pattern: Component Pattern + Facade
 * - Provides unified interface for asteroid rendering
 * - Can be extended for advanced rendering techniques
 *
 * @example
 * ```javascript
 * const renderer = new AsteroidRenderer();
 * renderer.renderAll(ctx, asteroids);
 * ```
 */

export class AsteroidRenderer {
  constructor(options = {}) {
    this.debugMode = options.debugMode || false;
    this.showBoundingCircles = options.showBoundingCircles || false;
    this.showVelocityVectors = options.showVelocityVectors || false;

    // Rendering statistics
    this.stats = {
      lastFrameCount: 0,
      lastFrameTime: 0
    };
  }

  /**
   * Renders all asteroids in the array.
   *
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Array<Asteroid>} asteroids - Array of asteroids to render
   */
  renderAll(ctx, asteroids) {
    if (!ctx || !Array.isArray(asteroids)) {
      return;
    }

    const startTime = performance.now();
    let rendered = 0;

    for (const asteroid of asteroids) {
      if (!asteroid || asteroid.destroyed) {
        continue;
      }

      this.render(ctx, asteroid);
      rendered++;
    }

    // Update statistics
    this.stats.lastFrameCount = rendered;
    this.stats.lastFrameTime = performance.now() - startTime;
  }

  /**
   * Renders a single asteroid.
   *
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Asteroid} asteroid - Asteroid to render
   */
  render(ctx, asteroid) {
    if (!ctx || !asteroid || asteroid.destroyed) {
      return;
    }

    // Delegate to asteroid's own draw method
    // Asteroids have complex rendering logic already implemented
    if (typeof asteroid.draw === 'function') {
      asteroid.draw(ctx);
    }

    // Debug rendering if enabled
    if (this.debugMode) {
      this.renderDebugInfo(ctx, asteroid);
    }
  }

  /**
   * Renders debug information for an asteroid.
   *
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Asteroid} asteroid - Asteroid to render debug info for
   */
  renderDebugInfo(ctx, asteroid) {
    ctx.save();

    // Bounding circle
    if (this.showBoundingCircles) {
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(asteroid.x, asteroid.y, asteroid.radius, 0, Math.PI * 2);
      ctx.stroke();

      // Center point
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(asteroid.x - 2, asteroid.y - 2, 4, 4);
    }

    // Velocity vector
    if (this.showVelocityVectors) {
      const scale = 0.5;
      const vx = asteroid.vx * scale;
      const vy = asteroid.vy * scale;

      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(asteroid.x, asteroid.y);
      ctx.lineTo(asteroid.x + vx, asteroid.y + vy);
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(vy, vx);
      const headLength = 10;
      ctx.beginPath();
      ctx.moveTo(asteroid.x + vx, asteroid.y + vy);
      ctx.lineTo(
        asteroid.x + vx - headLength * Math.cos(angle - Math.PI / 6),
        asteroid.y + vy - headLength * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(asteroid.x + vx, asteroid.y + vy);
      ctx.lineTo(
        asteroid.x + vx - headLength * Math.cos(angle + Math.PI / 6),
        asteroid.y + vy - headLength * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
    }

    // Text info (variant, size, health)
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${asteroid.variant} ${asteroid.size}`,
      asteroid.x,
      asteroid.y - asteroid.radius - 5
    );
    ctx.fillText(
      `HP: ${Math.round(asteroid.health)}/${asteroid.maxHealth}`,
      asteroid.x,
      asteroid.y - asteroid.radius - 15
    );

    ctx.restore();
  }

  /**
   * Toggles debug mode.
   *
   * @param {boolean} enabled - Enable or disable debug mode
   */
  setDebugMode(enabled) {
    this.debugMode = Boolean(enabled);
  }

  /**
   * Toggles bounding circle rendering.
   *
   * @param {boolean} enabled - Enable or disable bounding circles
   */
  setShowBoundingCircles(enabled) {
    this.showBoundingCircles = Boolean(enabled);
  }

  /**
   * Toggles velocity vector rendering.
   *
   * @param {boolean} enabled - Enable or disable velocity vectors
   */
  setShowVelocityVectors(enabled) {
    this.showVelocityVectors = Boolean(enabled);
  }

  /**
   * Gets rendering statistics for the last frame.
   *
   * @returns {Object} Statistics object
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Resets rendering statistics.
   */
  resetStats() {
    this.stats.lastFrameCount = 0;
    this.stats.lastFrameTime = 0;
  }
}
