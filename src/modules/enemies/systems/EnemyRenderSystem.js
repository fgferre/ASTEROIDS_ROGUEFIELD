// src/modules/enemies/systems/EnemyRenderSystem.js
// Handles rendering for all enemy entities managed by EnemySystem.
// Supports both component-based and legacy draw() rendering paths.
// Stateless facade that operates on the EnemySystem context passed via constructor.

/**
 * EnemyRenderSystem centralizes rendering logic for every enemy managed by
 * {@link EnemySystem}. It mirrors the facade pattern adopted by other enemy
 * subsystems (wave/reward managers) to keep the main system lean.
 *
 * The renderer keeps compatibility with the component architecture by
 * delegating to {@link AsteroidRenderer} when components are enabled, while
 * preserving the legacy per-entity {@code draw(ctx)} path as a fallback.
 */
export class EnemyRenderSystem {
  /**
   * @param {{ facade: import('../../EnemySystem.js').EnemySystem }} context
   *   Dependency context containing the EnemySystem facade reference.
   */
  constructor(context) {
    this.facade = context?.facade ?? null;
  }

  /**
   * Renders all active enemy entities.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @returns {void}
   */
  render(ctx) {
    if (!ctx || !this.facade) {
      return;
    }

    const { asteroids, useComponents, rendererComponent } = this.facade;

    if (useComponents && rendererComponent) {
      rendererComponent.renderAll(ctx, asteroids);
      return;
    }

    asteroids.forEach((asteroid) => {
      if (!asteroid?.destroyed && typeof asteroid?.draw === 'function') {
        asteroid.draw(ctx);
      }
    });
  }
}

export default EnemyRenderSystem;
