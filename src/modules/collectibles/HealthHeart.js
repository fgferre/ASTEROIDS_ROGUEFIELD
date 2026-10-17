import RandomService from '../../core/RandomService.js';
import { getEmissive } from '../../core/bloomLayer.js';
import { PALETTE, withAlpha } from '../../data/constants/palette.js';

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

  // Lime capsule with a soft core (docs/NORTE.md §3, status light).
  render(ctx) {
    if (this.collected) return;

    const pulse = 1 + Math.sin(this.pulsePhase) * 0.12;
    const length = this.radius * 0.95 * pulse;
    const width = this.radius * 0.5 * pulse;
    const emissive = getEmissive();

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.sin(this.pulsePhase * 0.35) * 0.35);

    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, length * 1.4);
    halo.addColorStop(0, withAlpha(PALETTE.status, 0.3));
    halo.addColorStop(1, withAlpha(PALETTE.status, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, length * 1.4, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createLinearGradient(0, -width, 0, width);
    body.addColorStop(0, PALETTE.status);
    body.addColorStop(1, withAlpha(PALETTE.status, 0.55));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(-length / 2, -width / 2, length, width, width / 2);
    ctx.fill();

    // heal cross, cut dark into the capsule
    ctx.fillStyle = withAlpha(PALETTE.background, 0.75);
    const cross = width * 0.7;
    const bar = cross * 0.3;
    ctx.fillRect(-bar / 2, -cross / 2, bar, cross);
    ctx.fillRect(-cross / 2, -bar / 2, cross, bar);

    if (emissive) {
      emissive.save();
      emissive.setTransform(ctx.getTransform());
      const core = emissive.createRadialGradient(0, 0, 0, 0, 0, length * 0.7);
      core.addColorStop(0, PALETTE.text);
      core.addColorStop(0.4, PALETTE.status);
      core.addColorStop(1, withAlpha(PALETTE.status, 0));
      emissive.fillStyle = core;
      emissive.beginPath();
      emissive.arc(0, 0, length * 0.7, 0, Math.PI * 2);
      emissive.fill();
      emissive.restore();
    }

    ctx.restore();
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
