/**
 * NeonGraphics - Utility for "AAA" Vector Graphics Rendering
 * Uses additive blending and multi-pass stroking to create intense neon effects.
 */

export const NeonGraphics = {
  /**
   * Draw a path with neon glow effects
   * @param {CanvasRenderingContext2D} ctx
   * @param {Path2D} path
   * @param {string} color - CSS color string (hex or rgb)
   * @param {number} width - Base line width
   * @param {number} intensity - Glow intensity multiplier (0-1+)
   */
  drawPath(ctx, path, color, width, intensity = 1.0) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Enable additive blending for "light accumulation"
    ctx.globalCompositeOperation = 'lighter';

    // 1. Outer Glow (Wide, Transparent)
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.2 * intensity;
    ctx.lineWidth = width * 6;
    ctx.stroke(path);

    // 2. Inner Glow (Medium, Brighter)
    ctx.globalAlpha = 0.4 * intensity;
    ctx.lineWidth = width * 2.5;
    ctx.stroke(path);

    // 3. Core (Thin, Near White/Bright)
    // We keep the original color but with high alpha, or mix white overlay
    ctx.globalAlpha = 1.0;
    ctx.lineWidth = width;
    ctx.stroke(path);

    // Optional: Hot White Core for very intense effects
    if (intensity > 1.2) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = width * 0.5;
      ctx.stroke(path);
    }

    ctx.restore();
  },

  /**
   * Draw a filled shape with neon glow border
   * @param {CanvasRenderingContext2D} ctx
   * @param {Path2D} path
   * @param {string} color
   * @param {number} intensity
   */
  drawShape(ctx, path, color, intensity = 1.0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Fill with very low opacity to show "volume"
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.1 * intensity;
    ctx.fill(path);

    // Use drawPath for the border
    this.drawPath(ctx, path, color, 2, intensity);

    ctx.restore();
  },
};
