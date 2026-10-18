// FROZEN (18/10/2026): the Canvas 2D gameplay renderer is an easter egg
// (`?renderer=2d`). No new features, no 2D/3D parity, no captures: new
// machines, weapons and effects are built in src/modules/render3d/ only.
// Touch this file only to keep it from breaking.
// tests/process/render2d-frozen.test.js pins its size.
import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';

/**
 * EnemyRenderSystem centralizes rendering of all hostile entities tracked by
 * EnemySystem.
 *
 * Responsibilities:
 * - Render enemies via the AsteroidRenderer component when component mode is
 *   enabled.
 * - Fallback to legacy draw() routines for enemies that do not use
 *   components.
 * - Provide an isolated, stateless façade that can be reused by future
 *   rendering pipelines.
 *
 * Usage:
 * ```js
 * const renderSystem = new EnemyRenderSystem({ facade: enemySystem });
 * renderSystem.render(ctx);
 * ```
 */
export class EnemyRenderSystem {
  /**
   * @param {{
   *   facade: import('../../EnemySystem.js').EnemySystem,
   * }} context
   */
  constructor(context = {}) {
    this.facade = context.facade ?? null;

    if (!this.facade) {
      GameDebugLogger.log(
        'ERROR',
        'EnemyRenderSystem missing facade reference'
      );
    }
  }

  /**
   * Renders all active enemies using the most appropriate strategy.
   *
   * Component Path:
   *   - Uses AsteroidRenderer.renderAll to batch render active enemies.
   * Legacy Path:
   *   - Iterates enemies and invokes their draw() routines individually.
   *
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (!ctx || !this.facade) {
      return;
    }

    const asteroids = Array.isArray(this.facade.asteroids)
      ? this.facade.asteroids
      : [];
    const rendererComponent = this.facade.rendererComponent;
    const useComponents = this.facade.useComponents;

    if (useComponents && rendererComponent) {
      rendererComponent.renderAll(ctx, asteroids);
      return;
    }

    asteroids.forEach((asteroid) => {
      if (!asteroid || asteroid.destroyed) {
        return;
      }

      if (typeof asteroid.draw === 'function') {
        asteroid.draw(ctx);
      }
    });
  }
}
