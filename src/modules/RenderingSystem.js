import * as CONSTANTS from '../core/GameConstants.js';

const MAX_VISUAL_TILT = 0.3;
const TILT_MULTIPLIER = 0.12;

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
    if (player) {
      this.renderPlayer(ctx, player);
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

  renderPlayer(ctx, player) {
    if (!player || typeof player.render !== 'function') return;

    const angularVelocity =
      typeof player.getAngularVelocity === 'function'
        ? player.getAngularVelocity()
        : player.angularVelocity || 0;

    const tilt = Math.max(
      -MAX_VISUAL_TILT,
      Math.min(MAX_VISUAL_TILT, angularVelocity * TILT_MULTIPLIER)
    );

    if (typeof player.getShieldState === 'function') {
      const shieldState = player.getShieldState();
      if (shieldState?.isActive && shieldState.maxHits > 0) {
        const ratio = Math.max(
          0,
          Math.min(1, shieldState.currentHits / shieldState.maxHits)
        );
        const position =
          typeof player.getPosition === 'function'
            ? player.getPosition()
            : player.position;

        if (position) {
          const hullOutline =
            typeof player.getHullOutline === 'function'
              ? player.getHullOutline()
              : null;
          const padding = Math.max(
            0,
            typeof player.getShieldPadding === 'function'
              ? player.getShieldPadding()
              : 0
          );

          let paddedOutline = null;
          if (Array.isArray(hullOutline) && hullOutline.length >= 3) {
            const angle =
              typeof player.getAngle === 'function'
                ? player.getAngle()
                : player.angle || 0;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            paddedOutline = [];

            hullOutline.forEach((vertex) => {
              if (!vertex) return;
              const length = Math.hypot(vertex.x, vertex.y);
              const safeLength = length > 0 ? length : 1;
              const scale = (safeLength + padding) / safeLength;
              const localX = vertex.x * scale;
              const localY = vertex.y * scale;

              paddedOutline.push({
                x: position.x + localX * cos - localY * sin,
                y: position.y + localX * sin + localY * cos,
              });
            });
          }

          ctx.save();
          const alpha = 0.35 + 0.4 * ratio;
          ctx.strokeStyle = `rgba(0, 191, 255, ${alpha})`;
          ctx.lineWidth = 4 + ratio * 4;
          ctx.shadowColor = 'rgba(0, 191, 255, 0.8)';
          ctx.shadowBlur = 15 + ratio * 12;
          ctx.beginPath();

          if (paddedOutline && paddedOutline.length >= 3) {
            let hasMoved = false;
            paddedOutline.forEach((point) => {
              if (!point) return;
              if (!hasMoved) {
                ctx.moveTo(point.x, point.y);
                hasMoved = true;
              } else {
                ctx.lineTo(point.x, point.y);
              }
            });

            if (hasMoved) {
              ctx.closePath();
            } else {
              const fallbackRadius = CONSTANTS.SHIP_SIZE + padding;
              ctx.arc(position.x, position.y, fallbackRadius, 0, Math.PI * 2);
            }
          } else {
            const fallbackRadius = CONSTANTS.SHIP_SIZE + padding;
            ctx.arc(position.x, position.y, fallbackRadius, 0, Math.PI * 2);
          }

          ctx.stroke();
          ctx.restore();
        }
      }
    }

    player.render(ctx, { tilt });
  }
}

export default RenderingSystem;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RenderingSystem;
}
