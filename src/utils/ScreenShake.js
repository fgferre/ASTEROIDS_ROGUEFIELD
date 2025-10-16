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

import RandomService from '../core/RandomService.js';

export class ScreenShake {
  constructor(randomGenerator = null) {
    this._fallbackRandom = new RandomService('screen-shake:fallback');
    this._fallbackSeed = this._fallbackRandom.seed >>> 0;
    this._seedSnapshot = null;
    this.random = null;

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
    this.seedX = 0;
    this.seedY = 0;
    this.seedAngle = 0;

    // Time tracking
    this.time = 0;
    this.frequency = 15; // Shake frequency multiplier

    this.reseed(randomGenerator);

    console.log('[ScreenShake] Initialized');
  }

  _resolveRandom(randomGenerator, { resetFallback = false } = {}) {
    if (randomGenerator && typeof randomGenerator.float === 'function') {
      if (randomGenerator === this._fallbackRandom && resetFallback) {
        this._fallbackRandom.reset(this._fallbackSeed);
      }
      return randomGenerator;
    }

    if (!this._fallbackRandom) {
      this._fallbackRandom = new RandomService('screen-shake:fallback');
      this._fallbackSeed = this._fallbackRandom.seed >>> 0;
    } else if (resetFallback && typeof this._fallbackRandom.reset === 'function') {
      this._fallbackRandom.reset(this._fallbackSeed);
    }

    return this._fallbackRandom;
  }

  _isValidSeedState(seedState) {
    return (
      seedState &&
      typeof seedState === 'object' &&
      Number.isFinite(seedState.x) &&
      Number.isFinite(seedState.y) &&
      Number.isFinite(seedState.angle)
    );
  }

  reseed(randomGenerator = this.random, options = {}) {
    const { seedState = null } = options ?? {};
    this.random = this._resolveRandom(randomGenerator, { resetFallback: true });

    const seeds = this._isValidSeedState(seedState)
      ? { ...seedState }
      : {
          x: this.getRandomSeed(),
          y: this.getRandomSeed(),
          angle: this.getRandomSeed(),
        };

    this.seedX = seeds.x;
    this.seedY = seeds.y;
    this.seedAngle = seeds.angle;
    this._seedSnapshot = { ...seeds };
    return { ...this._seedSnapshot };
  }

  getRandomSeed() {
    const source =
      this.random && typeof this.random.float === 'function'
        ? this.random
        : this._fallbackRandom;

    if (source && typeof source.range === 'function') {
      return source.range(0, 1000);
    }

    if (source && typeof source.float === 'function') {
      return source.float() * 1000;
    }

    const emergency = this._resolveRandom(null);
    if (typeof emergency.range === 'function') {
      return emergency.range(0, 1000);
    }

    return emergency.float() * 1000;
  }

  captureSeedState() {
    const snapshot = {
      x: Number.isFinite(this.seedX) ? this.seedX : 0,
      y: Number.isFinite(this.seedY) ? this.seedY : 0,
      angle: Number.isFinite(this.seedAngle) ? this.seedAngle : 0,
    };
    this._seedSnapshot = { ...snapshot };
    return { ...this._seedSnapshot };
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

  // Enemy - drone destroyed
  droneDestroyed: {
    trauma: 0.23,
    duration: 0.18,
  },

  // Enemy - mine explosion
  mineExplosion: {
    trauma: 0.6,
    duration: 0.36,
  },

  // Enemy - hunter destroyed
  hunterDestroyed: {
    trauma: 0.35,
    duration: 0.22,
  },

  // Boss events
  bossSpawn: {
    trauma: 1,
    duration: 0.65,
  },

  bossPhaseChange: {
    trauma: 0.93,
    duration: 0.5,
  },

  bossDefeated: {
    trauma: 1,
    duration: 0.85,
  },

  bossAttack: {
    trauma: 0.28,
    duration: 0.18,
  },
};
