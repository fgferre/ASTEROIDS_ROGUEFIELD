/**
 * Health Heart Collectible
 *
 * Simple collectible that heals 25% of max HP.
 * Stays in place like XP orbs - no magnetism needed.
 */

export class HealthHeart {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 14;
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.collected = false;
    this.lifetime = 0;
  }

  update(deltaTime) {
    if (this.collected) return;
    this.lifetime += deltaTime;
    this.pulsePhase += deltaTime * 3;
  }

  render(ctx) {
    if (this.collected) return;

    ctx.save();
    ctx.translate(this.x, this.y);

    // Pulse effect
    const pulseScale = 1 + Math.sin(this.pulsePhase) * 0.2;
    const size = this.radius * pulseScale;

    // Outer glow
    const outerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.5);
    outerGlow.addColorStop(0, 'rgba(255, 50, 50, 0.5)');
    outerGlow.addColorStop(0.5, 'rgba(255, 50, 50, 0.25)');
    outerGlow.addColorStop(1, 'rgba(255, 50, 50, 0)');

    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(0, 0, size * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Heart body
    const heartGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
    heartGradient.addColorStop(0, '#ff6b6b');
    heartGradient.addColorStop(0.6, '#ff3838');
    heartGradient.addColorStop(1, '#cc0000');

    ctx.fillStyle = heartGradient;
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();

    // Inner highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(-size * 0.3, -size * 0.3, size * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Cross/plus symbol
    ctx.fillStyle = '#ffffff';
    const crossSize = size * 0.55;
    const crossWidth = crossSize * 0.28;

    // Vertical bar
    ctx.fillRect(-crossWidth / 2, -crossSize / 2, crossWidth, crossSize);
    // Horizontal bar
    ctx.fillRect(-crossSize / 2, -crossWidth / 2, crossSize, crossWidth);

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

export default HealthHeart;
