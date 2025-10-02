/**
 * Screen Shake Utility
 *
 * Provides camera shake effects for game juice and feedback.
 * Uses trauma-based shake for smooth, natural feeling movement.
 *
 * Features:
 * - Trauma-based shake (inspired by Squirrel Eiserloh's GDC talk)
 * - Multiple shake types (impact, constant, rumble)
 * - Configurable intensity and duration
 * - Smooth decay
 * - Direction bias support
 *
 * @example
 * ```javascript
 * const shake = new ScreenShake();
 * shake.add(0.3); // Light shake
 * shake.add(0.8, 0.5); // Heavy shake for 0.5s
 * const offset = shake.getOffset();
 * ctx.translate(offset.x, offset.y);
 * ```
 */

export class ScreenShake {
  constructor() {
    // Trauma system
    this.trauma = 0; // 0-1 range
    this.traumaDecay = 1.5; // How fast trauma decays per second
    this.maxOffset = 8; // Maximum pixel offset
    this.maxAngle = 0; // Maximum rotation in radians (DISABLED - user feedback: confusing)

    // Current shake offset
    this.offsetX = 0;
    this.offsetY = 0;
    this.angle = 0;

    // Noise seeds for smooth shake
    this.seedX = Math.random() * 1000;
    this.seedY = Math.random() * 1000;
    this.seedAngle = Math.random() * 1000;

    // Time tracking
    this.time = 0;
    this.frequency = 15; // Shake frequency multiplier

    console.log('[ScreenShake] Initialized');
  }

  /**
   * Adds trauma to the screen shake.
   *
   * @param {number} amount - Trauma amount (0-1)
   * @param {number} duration - Optional duration (0 = instant decay)
   */
  add(amount, duration = 0) {
    this.trauma = Math.min(1, this.trauma + amount);

    // If duration specified, adjust decay to match
    if (duration > 0) {
      this.traumaDecay = amount / duration;
    } else {
      this.traumaDecay = 1.5; // Default decay
    }
  }

  /**
   * Sets trauma to specific value (bypasses addition).
   *
   * @param {number} value - Trauma value (0-1)
   */
  set(value) {
    this.trauma = Math.max(0, Math.min(1, value));
  }

  /**
   * Updates the shake system.
   *
   * @param {number} deltaTime - Time elapsed in seconds
   */
  update(deltaTime) {
    // Decay trauma
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - this.traumaDecay * deltaTime);
    }

    // Update time for noise
    this.time += deltaTime;

    // Calculate shake intensity (trauma^2 for smoother falloff)
    const shake = this.trauma * this.trauma;

    if (shake > 0.001) {
      // Use Perlin-like noise for smooth shake
      const t = this.time * this.frequency;

      // Calculate offsets using smooth noise
      this.offsetX = this.maxOffset * shake * this.noise(this.seedX + t);
      this.offsetY = this.maxOffset * shake * this.noise(this.seedY + t);
      this.angle = this.maxAngle * shake * this.noise(this.seedAngle + t);
    } else {
      // Zero out shake when trauma is negligible
      this.offsetX = 0;
      this.offsetY = 0;
      this.angle = 0;
    }
  }

  /**
   * Simple noise function for smooth shake.
   * Returns value between -1 and 1.
   *
   * @param {number} t - Time/seed value
   * @returns {number} Noise value
   */
  noise(t) {
    // Simple smooth noise using sine waves
    return Math.sin(t) * 0.5 + Math.sin(t * 2.3) * 0.3 + Math.sin(t * 4.7) * 0.2;
  }

  /**
   * Gets current shake offset.
   *
   * @returns {Object} {x, y, angle} offset
   */
  getOffset() {
    return {
      x: this.offsetX,
      y: this.offsetY,
      angle: this.angle,
    };
  }

  /**
   * Applies shake to canvas context.
   *
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} centerX - Center point X for rotation
   * @param {number} centerY - Center point Y for rotation
   */
  apply(ctx, centerX = 0, centerY = 0) {
    if (this.trauma > 0.001) {
      ctx.translate(this.offsetX, this.offsetY);

      if (Math.abs(this.angle) > 0.001) {
        ctx.translate(centerX, centerY);
        ctx.rotate(this.angle);
        ctx.translate(-centerX, -centerY);
      }
    }
  }

  /**
   * Resets shake to zero.
   */
  reset() {
    this.trauma = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.angle = 0;
  }

  /**
   * Gets current trauma value.
   *
   * @returns {number} Trauma (0-1)
   */
  getTrauma() {
    return this.trauma;
  }

  /**
   * Checks if shake is active.
   *
   * @returns {boolean} True if shaking
   */
  isActive() {
    return this.trauma > 0.001;
  }
}

/**
 * Preset shake configurations for common events.
 */
export const ShakePresets = {
  // Weapon fire
  weaponFire: {
    trauma: 0.12,
    duration: 0.15,
  },

  // Weapon fire (heavy)
  weaponFireHeavy: {
    trauma: 0.25,
    duration: 0.2,
  },

  // Hit asteroid
  asteroidHit: {
    trauma: 0.08,
    duration: 0.1,
  },

  // Asteroid destroyed
  asteroidDestroyed: {
    trauma: 0.2,
    duration: 0.3,
  },

  // Large asteroid destroyed
  largeAsteroidDestroyed: {
    trauma: 0.4,
    duration: 0.4,
  },

  // Player hit
  playerHit: {
    trauma: 0.5,
    duration: 0.35,
  },

  // Shield impact
  shieldImpact: {
    trauma: 0.35,
    duration: 0.25,
  },

  // Volatile explosion
  volatileExplosion: {
    trauma: 0.6,
    duration: 0.5,
  },

  // Parasite attack
  parasiteAttack: {
    trauma: 0.3,
    duration: 0.2,
  },

  // Level up
  levelUp: {
    trauma: 0.45,
    duration: 0.6,
  },

  // Wave complete
  waveComplete: {
    trauma: 0.25,
    duration: 0.8,
  },
};
