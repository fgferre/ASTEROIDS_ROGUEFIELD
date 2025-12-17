/**
 * Health Heart System
 *
 * Manages health heart collectibles.
 * Hearts persist until collected or game over (not cleared on death/retry).
 */

import {
  normalizeDependencies,
  resolveService,
} from '../../core/serviceUtils.js';
import HealthHeart from './HealthHeart.js';

export class HealthHeartSystem {
  constructor({ player } = {}) {
    this.dependencies = normalizeDependencies({ player });
    this.hearts = [];
    this.cachedPlayer = resolveService('player', this.dependencies);
    this.collectionRadius = 25;

    // Register in gameServices
    if (typeof gameServices !== 'undefined') {
      gameServices.register('healthHearts', this);
    }

    console.log('[HealthHeartSystem] Initialized');
  }

  update(deltaTime) {
    this.resolveCachedServices();

    // Update all hearts
    this.hearts.forEach((heart) => {
      heart.update(deltaTime);
    });

    // Check for collection
    const playerPosition = this.getPlayerPosition();
    if (playerPosition && this.cachedPlayer) {
      this.checkHeartCollection(playerPosition);
    }

    // Remove collected hearts
    this.hearts = this.hearts.filter((heart) => !heart.isCollected());
  }

  checkHeartCollection(playerPosition) {
    // Skip collection if player is dead
    if (
      this.cachedPlayer.isDead ||
      this.cachedPlayer.isRetrying ||
      this.cachedPlayer._quitExplosionHidden
    ) {
      return;
    }

    this.hearts.forEach((heart) => {
      if (heart.checkCollision(playerPosition, this.collectionRadius)) {
        this.collectHeart(heart);
      }
    });
  }

  collectHeart(heart) {
    heart.collect();

    // Heal player 25% of max HP
    if (this.cachedPlayer && typeof this.cachedPlayer.heal === 'function') {
      const stats = this.cachedPlayer.getStats
        ? this.cachedPlayer.getStats()
        : {};
      const maxHP = stats.maxHP || 100;
      const healAmount = Math.floor(maxHP * 0.25);

      this.cachedPlayer.heal(healAmount);

      console.log(
        `[HealthHeartSystem] Heart collected - healed ${healAmount} HP (25% of ${maxHP})`
      );

      // Emit event for effects/audio
      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('health-heart-collected', {
          healAmount,
          position: { x: heart.x, y: heart.y },
        });
      }
    }
  }

  spawnHeart(x, y, options = {}) {
    const heart = new HealthHeart(x, y, options);
    this.hearts.push(heart);
    console.log(`[HealthHeartSystem] Heart spawned at (${x}, ${y})`);
    return heart;
  }

  render(ctx) {
    this.hearts.forEach((heart) => heart.render(ctx));
  }

  getPlayerPosition() {
    if (!this.cachedPlayer) return null;

    if (typeof this.cachedPlayer.getPosition === 'function') {
      return this.cachedPlayer.getPosition();
    }

    return this.cachedPlayer.position || null;
  }

  resolveCachedServices() {
    if (!this.cachedPlayer) {
      this.cachedPlayer = resolveService('player', this.dependencies);
    }
  }

  reset() {
    // Clear all hearts on game reset (new game or quit to menu)
    this.hearts = [];
    this.cachedPlayer = null;
    console.log('[HealthHeartSystem] Reset');
  }

  destroy() {
    this.hearts = [];
    this.cachedPlayer = null;
    console.log('[HealthHeartSystem] Destroyed');
  }
}

export default HealthHeartSystem;
