import * as CONSTANTS from '../core/GameConstants.js';

class RenderingSystem {
  constructor() {
    this.stars = this.generateStarField();

    if (typeof gameServices !== 'undefined') {
      gameServices.register('renderer', this);
    }

    console.log('[RenderingSystem] Initialized');
  }

  generateStarField(count = 80) {
    const stars = [];
    for (let i = 0; i < count; i++) {
      const x = (i * 123.456) % CONSTANTS.GAME_WIDTH;
      const y = (i * 234.567) % CONSTANTS.GAME_HEIGHT;
      const size = Math.floor(i % 3) + 1;
      stars.push({ x, y, size });
    }
    return stars;
  }

  render(ctx) {
    if (!ctx) return;

    ctx.save();

    const effects = gameServices.get('effects');
    if (effects && typeof effects.applyScreenShake === 'function') {
      effects.applyScreenShake(ctx);
    }

    this.drawBackground(ctx);
    this.drawStars(ctx);

    const progression = gameServices.get('progression');
    if (progression && typeof progression.render === 'function') {
      progression.render(ctx);
    }

    const combat = gameServices.get('combat');
    if (combat && typeof combat.render === 'function') {
      combat.render(ctx);
    }

    const enemies = gameServices.get('enemies');
    if (enemies && typeof enemies.render === 'function') {
      enemies.render(ctx);
    }

    const player = gameServices.get('player');
    if (player && typeof player.render === 'function') {
      player.render(ctx);
    }

    this.drawMagnetismField(ctx, player, progression);

    if (effects && typeof effects.draw === 'function') {
      effects.draw(ctx);
    }

    ctx.restore();
  }

  drawBackground(ctx) {
    const gradient = ctx.createRadialGradient(
      CONSTANTS.GAME_WIDTH / 2,
      CONSTANTS.GAME_HEIGHT / 2,
      0,
      CONSTANTS.GAME_WIDTH / 2,
      CONSTANTS.GAME_HEIGHT / 2,
      Math.max(CONSTANTS.GAME_WIDTH, CONSTANTS.GAME_HEIGHT)
    );
    gradient.addColorStop(0, '#0a0a1a');
    gradient.addColorStop(0.6, '#000510');
    gradient.addColorStop(1, '#000000');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CONSTANTS.GAME_WIDTH, CONSTANTS.GAME_HEIGHT);
  }

  drawStars(ctx) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    this.stars.forEach((star) => {
      ctx.fillRect(star.x, star.y, star.size, star.size);
    });
  }

  drawMagnetismField(ctx, player, progression) {
    if (!player || !progression) return;

    const orbs = progression.getXPOrbs ? progression.getXPOrbs() : [];
    const hasActiveOrb = orbs.some((orb) => !orb.collected);
    if (!hasActiveOrb) return;

    const playerPosition =
      typeof player.getPosition === 'function'
        ? player.getPosition()
        : player.position;
    if (!playerPosition) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 221, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(
      playerPosition.x,
      playerPosition.y,
      player.getMagnetismRadius
        ? player.getMagnetismRadius()
        : CONSTANTS.MAGNETISM_RADIUS,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.restore();
  }
}

export default RenderingSystem;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RenderingSystem;
}
