import * as CONSTANTS from '../core/GameConstants.js';

const MAX_VISUAL_TILT = 0.3;
const TILT_MULTIPLIER = 0.12;
const MIN_OUTLINE_POINTS = 3;
const EPSILON = 1e-6;

function normalizeVector(x, y) {
  const length = Math.hypot(x, y);
  if (length < EPSILON) {
    return { x: 0, y: 0, length: 0 };
  }

  return { x: x / length, y: y / length, length };
}

function computePolygonArea(points) {
  if (!Array.isArray(points) || points.length < MIN_OUTLINE_POINTS) {
    return 0;
  }

  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }

  return area / 2;
}

function expandHullOutline(outline, padding) {
  if (!Array.isArray(outline) || outline.length < MIN_OUTLINE_POINTS) {
    return null;
  }

  if (!padding) {
    return outline.map((point) => ({ x: point.x, y: point.y }));
  }

  const orientation = computePolygonArea(outline) >= 0 ? 1 : -1;
  const expanded = [];

  for (let i = 0; i < outline.length; i += 1) {
    const prev = outline[(i - 1 + outline.length) % outline.length];
    const curr = outline[i];
    const next = outline[(i + 1) % outline.length];

    if (!curr) {
      expanded.push({ x: 0, y: 0 });
      continue;
    }

    const edgePrev = normalizeVector(curr.x - prev.x, curr.y - prev.y);
    const edgeNext = normalizeVector(next.x - curr.x, next.y - curr.y);

    const normalPrev = {
      x: -edgePrev.y * orientation,
      y: edgePrev.x * orientation,
    };
    const normalNext = {
      x: -edgeNext.y * orientation,
      y: edgeNext.x * orientation,
    };

    const normalSum = normalizeVector(
      normalPrev.x + normalNext.x,
      normalPrev.y + normalNext.y
    );

    const cross =
      (curr.x - prev.x) * (next.y - curr.y) -
      (curr.y - prev.y) * (next.x - curr.x);
    const isConcave = orientation > 0 ? cross < 0 : cross > 0;

    let offsetDir =
      normalSum.length > EPSILON ? normalSum : normalizeVector(normalPrev.x, normalPrev.y);

    if (isConcave) {
      const radial = normalizeVector(curr.x, curr.y);
      if (radial.length > EPSILON) {
        offsetDir = radial;
      }
    }

    const denom =
      offsetDir.x * normalPrev.x + offsetDir.y * normalPrev.y;
    const safeDenom =
      Math.abs(denom) > EPSILON
        ? denom
        : denom >= 0
        ? EPSILON
        : -EPSILON;

    const scale = padding / safeDenom;

    expanded.push({
      x: curr.x + offsetDir.x * scale,
      y: curr.y + offsetDir.y * scale,
    });
  }

  return expanded;
}

function buildPathFromPoints(points) {
  if (!Array.isArray(points) || points.length < MIN_OUTLINE_POINTS) {
    return null;
  }

  const path = new Path2D();
  let moved = false;

  points.forEach((point) => {
    if (!point) return;
    if (!moved) {
      path.moveTo(point.x, point.y);
      moved = true;
    } else {
      path.lineTo(point.x, point.y);
    }
  });

  if (!moved) {
    return null;
  }

  path.closePath();
  return path;
}

function computeOutlineRadius(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return 0;
  }

  return points.reduce((max, point) => {
    if (!point) return max;
    const radius = Math.hypot(point.x, point.y);
    return radius > max ? radius : max;
  }, 0);
}

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

    const shieldState =
      typeof player.getShieldState === 'function'
        ? player.getShieldState()
        : null;
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

        const expandedOutline =
          Array.isArray(hullOutline) && hullOutline.length >= MIN_OUTLINE_POINTS
            ? expandHullOutline(hullOutline, padding)
            : null;

        const outlineToUse =
          expandedOutline && expandedOutline.length >= MIN_OUTLINE_POINTS
            ? expandedOutline
            : Array.isArray(hullOutline) && hullOutline.length >= MIN_OUTLINE_POINTS
            ? hullOutline.map((vertex) => ({ ...vertex }))
            : null;

        const hullRadius =
          typeof player.getHullBoundingRadius === 'function'
            ? player.getHullBoundingRadius()
            : Math.max(
                computeOutlineRadius(hullOutline || []),
                CONSTANTS.SHIP_SIZE
              );
        const fallbackRadius =
          typeof player.getShieldRadius === 'function'
            ? player.getShieldRadius()
            : hullRadius + padding;

        const outlineRadius = outlineToUse
          ? computeOutlineRadius(outlineToUse)
          : 0;
        const radiusForGradient = Math.max(outlineRadius, fallbackRadius);

        let shieldPath = outlineToUse
          ? buildPathFromPoints(outlineToUse)
          : null;

        if (!shieldPath) {
          shieldPath = new Path2D();
          shieldPath.arc(0, 0, fallbackRadius, 0, Math.PI * 2);
        }

        const angle =
          typeof player.getAngle === 'function'
            ? player.getAngle()
            : player.angle || 0;

        ctx.save();
        ctx.translate(position.x, position.y);
        ctx.rotate(angle);
        if (tilt !== 0) {
          ctx.transform(1, 0, tilt, 1, 0, 0);
        }

        const now =
          typeof performance !== 'undefined' &&
          typeof performance.now === 'function'
            ? performance.now()
            : Date.now();
        const pulse = 0.6 + 0.4 * Math.sin(now / 180);

        const glowGradient = ctx.createRadialGradient(
          0,
          0,
          radiusForGradient * 0.35,
          0,
          0,
          radiusForGradient * 1.25
        );
        glowGradient.addColorStop(
          0,
          `rgba(120, 240, 255, ${0.08 + ratio * 0.14})`
        );
        glowGradient.addColorStop(
          0.55,
          `rgba(0, 190, 255, ${0.25 + ratio * 0.3})`
        );
        glowGradient.addColorStop(1, 'rgba(0, 150, 255, 0)');

        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = glowGradient;
        ctx.fill(shieldPath);

        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowColor = `rgba(90, 200, 255, ${0.75 + ratio * 0.15})`;
        ctx.shadowBlur = 10 + ratio * 16 + pulse * 4;
        ctx.lineWidth = 2.4 + ratio * 2.2 + pulse * 0.35;
        ctx.strokeStyle = `rgba(160, 245, 255, ${0.52 + ratio * 0.35})`;
        ctx.stroke(shieldPath);

        ctx.shadowBlur = 0;
        ctx.lineWidth = 1 + ratio * 1.4;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.28 + ratio * 0.3})`;
        ctx.globalAlpha = 0.9;
        ctx.stroke(shieldPath);
        ctx.restore();
      }
    }

    player.render(ctx, { tilt });
  }
}

export default RenderingSystem;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RenderingSystem;
}
