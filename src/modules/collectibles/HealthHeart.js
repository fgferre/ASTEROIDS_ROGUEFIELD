/**
 * Health Heart Collectible
 *
 * Rare drop from tough enemies that heals the player.
 * Heals 25% of max HP when collected.
 *
 * Features:
 * - Pulsating heart animation
 * - Magnetic attraction to player
 * - Persists until collected or game over
 * - Visual glow and particle effects
 */

import * as CONSTANTS from '../../core/GameConstants.js';

export class HealthHeart {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;

    // Visual properties
    this.radius = 12;
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.glowIntensity = 0;

    // State
    this.collected = false;
    this.magnetized = false;
    this.lifetime = 0;

    // Magnetism
    this.magnetismRadius = CONSTANTS.MAGNETISM_RADIUS || 150;
    this.magnetismForce = (CONSTANTS.MAGNETISM_FORCE || 200) * 0.8; // Slightly slower than XP orbs
  }

  update(deltaTime, playerPosition) {
    if (this.collected) return;

    this.lifetime += deltaTime;
    this.pulsePhase += deltaTime * 3; // Pulse speed

    // Check magnetism
    if (playerPosition) {
      const dx = playerPosition.x - this.x;
      const dy = playerPosition.y - this.y;
      const distSq = dx * dx + dy * dy;
      const magnetRadiusSq = this.magnetismRadius * this.magnetismRadius;

      if (distSq < magnetRadiusSq && distSq > 1) {
        this.magnetized = true;
        const dist = Math.sqrt(distSq);
        const force = this.magnetismForce * deltaTime;

        this.vx += (dx / dist) * force;
        this.vy += (dy / dist) * force;

        // Damping
        const damping = 0.95;
        this.vx *= damping;
        this.vy *= damping;
      } else {
        this.magnetized = false;
      }
    }

    // Update position
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;

    // Wrap around screen
    if (this.x < 0) this.x = CONSTANTS.GAME_WIDTH;
    if (this.x > CONSTANTS.GAME_WIDTH) this.x = 0;
    if (this.y < 0) this.y = CONSTANTS.GAME_HEIGHT;
    if (this.y > CONSTANTS.GAME_HEIGHT) this.y = 0;
  }

  render(ctx) {
    if (this.collected) return;

    ctx.save();
    ctx.translate(this.x, this.y);

    // Pulse effect
    const pulseScale = 1 + Math.sin(this.pulsePhase) * 0.15;
    const glowSize = this.radius * pulseScale;

    // Outer glow
    const outerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowSize * 2.5);
    outerGlow.addColorStop(0, 'rgba(255, 50, 50, 0.4)');
    outerGlow.addColorStop(0.5, 'rgba(255, 50, 50, 0.2)');
    outerGlow.addColorStop(1, 'rgba(255, 50, 50, 0)');

    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(0, 0, glowSize * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Heart shape (simplified as circle for now, can be improved)
    const heartGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, glowSize);
    heartGradient.addColorStop(0, '#ff6b6b');
    heartGradient.addColorStop(0.6, '#ff3838');
    heartGradient.addColorStop(1, '#cc0000');

    ctx.fillStyle = heartGradient;
    ctx.beginPath();
    ctx.arc(0, 0, glowSize, 0, Math.PI * 2);
    ctx.fill();

    // Inner highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(-glowSize * 0.3, -glowSize * 0.3, glowSize * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Cross/plus symbol (health icon)
    ctx.fillStyle = '#ffffff';
    const crossSize = glowSize * 0.5;
    const crossWidth = crossSize * 0.3;

    // Vertical bar
    ctx.fillRect(-crossWidth / 2, -crossSize / 2, crossWidth, crossSize);
    // Horizontal bar
    ctx.fillRect(-crossSize / 2, -crossWidth / 2, crossSize, crossWidth);

    ctx.restore();
  }

  checkCollision(playerPosition, collectionRadius = 25) {
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

export default HealthHeart;
