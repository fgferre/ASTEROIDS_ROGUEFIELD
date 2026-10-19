import RandomService from '../../core/RandomService.js';

const TWO_PI = Math.PI * 2;

/**
 * Health Heart Collectible
 *
 * Simple collectible that heals 25% of max HP.
 * Stays in place like XP orbs - no magnetism needed.
 */

export class HealthHeart {
  constructor(x, y, { random = null, pulsePhase = null } = {}) {
    this.x = x;
    this.y = y;
    this.radius = 14;
    this.random = random && typeof random.range === 'function' ? random : null;
    this.pulsePhase = this.resolvePulsePhase(pulsePhase);
    this.collected = false;
    this.lifetime = 0;
  }

  resolvePulsePhase(pulsePhase) {
    if (Number.isFinite(pulsePhase)) {
      return pulsePhase;
    }

    const rng = this.random || this.getFallbackRandom();
    if (rng && typeof rng.range === 'function') {
      return rng.range(0, TWO_PI);
    }
    const fallback = this.getFallbackRandom();
    if (typeof fallback.range === 'function') {
      return fallback.range(0, TWO_PI);
    }

    return fallback.float() * TWO_PI;
  }

  getFallbackRandom() {
    if (!HealthHeart._fallbackRandom) {
      HealthHeart._fallbackRandom = new RandomService('health-heart:fallback');
    }
    return HealthHeart._fallbackRandom;
  }

  update(deltaTime) {
    if (this.collected) return;
    this.lifetime += deltaTime;
    this.pulsePhase += deltaTime * 3;
  }

  checkCollision(playerPosition, collectionRadius = 30) {
    if (this.collected) return false;

    const dx = this.x - playerPosition.x;
    const dy = this.y - playerPosition.y;
    const distSq = dx * dx + dy * dy;
    const collRadiusSq = collectionRadius * collectionRadius;

    return distSq < collRadiusSq;
  }

  collect() {
    this.collected = true;
  }

  isCollected() {
    return this.collected;
  }
}

HealthHeart._fallbackRandom = null;

export default HealthHeart;
