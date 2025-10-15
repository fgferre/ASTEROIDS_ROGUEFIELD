import * as CONSTANTS from '../core/GameConstants.js';

const DEFAULT_ENEMY_COLOR = 'rgba(255, 150, 110, 0.9)';
const DEFAULT_BOSS_COLOR = 'rgba(255, 120, 220, 0.95)';
const DEFAULT_RADIUS = Number.isFinite(CONSTANTS.BULLET_SIZE)
  ? Math.max(1, CONSTANTS.BULLET_SIZE)
  : 4;

function clampChannel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 255;
  }
  return Math.max(0, Math.min(255, Math.round(numeric)));
}

function parseColor(color) {
  if (typeof color !== 'string') {
    return null;
  }

  const trimmed = color.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const hexMatch = trimmed.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
      return { r, g, b, a };
    }

    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }

  const rgbaMatch = trimmed.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1]
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (parts.length >= 3) {
      const r = clampChannel(parts[0]);
      const g = clampChannel(parts[1]);
      const b = clampChannel(parts[2]);
      const a = parts.length >= 4 ? Math.max(0, Math.min(1, Number(parts[3]))) : 1;
      return { r, g, b, a: Number.isFinite(a) ? a : 1 };
    }
  }

  return null;
}

function colorWithAlpha(color, alpha, fallback) {
  const parsed = parseColor(color) || parseColor(fallback);
  const a = Math.max(0, Math.min(1, alpha));

  if (!parsed) {
    return `rgba(255, 255, 255, ${a})`;
  }

  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${a})`;
}

function resolveBaseColor(bullet) {
  if (typeof bullet?.color === 'string' && bullet.color.trim().length > 0) {
    return bullet.color;
  }

  return bullet?.isBossProjectile ? DEFAULT_BOSS_COLOR : DEFAULT_ENEMY_COLOR;
}

function resolveTrailRgb(bullet) {
  const parsed = parseColor(bullet?.color);
  if (parsed) {
    return `${parsed.r}, ${parsed.g}, ${parsed.b}`;
  }

  if (bullet?.isBossProjectile) {
    const bossParsed = parseColor(DEFAULT_BOSS_COLOR);
    return bossParsed ? `${bossParsed.r}, ${bossParsed.g}, ${bossParsed.b}` : '255, 120, 220';
  }

  const enemyParsed = parseColor(DEFAULT_ENEMY_COLOR);
  return enemyParsed ? `${enemyParsed.r}, ${enemyParsed.g}, ${enemyParsed.b}` : '255, 150, 110';
}

function resolveRadius(bullet) {
  if (Number.isFinite(bullet?.radius) && bullet.radius > 0) {
    return bullet.radius;
  }

  return DEFAULT_RADIUS;
}

function drawTrail(ctx, bullet, radius) {
  if (!Array.isArray(bullet?.trail) || bullet.trail.length < 2) {
    return;
  }

  const rgb = resolveTrailRgb(bullet);
  const segments = bullet.trail.length;
  const glowScale = bullet?.isBossProjectile ? 2 : 1.5;
  const widthBase = radius * (bullet?.isBossProjectile ? 1.35 : 0.95);

  ctx.save();
  ctx.lineCap = 'round';

  for (let i = 1; i < segments; i += 1) {
    const previous = bullet.trail[i - 1];
    const current = bullet.trail[i];
    if (!previous || !current) {
      continue;
    }

    const t = i / segments;
    const fade = Math.max(0, 1 - t);
    const alpha = (bullet?.isBossProjectile ? 0.75 : 0.55) * fade;
    const width = Math.max(1.5, widthBase * (0.75 + fade * glowScale * 0.35));

    ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;

    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
  }

  // Core highlight pass (thinner and brighter)
  for (let i = 1; i < segments; i += 1) {
    const previous = bullet.trail[i - 1];
    const current = bullet.trail[i];
    if (!previous || !current) {
      continue;
    }

    const t = i / segments;
    const fade = Math.max(0, 1 - t);
    const alpha = (bullet?.isBossProjectile ? 0.9 : 0.7) * Math.pow(fade, 0.85);
    const width = Math.max(1, radius * (bullet?.isBossProjectile ? 0.55 : 0.4));

    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;

    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawEnemyProjectile(ctx, bullet) {
  if (!ctx || !bullet || bullet.hit) {
    return;
  }

  const radius = resolveRadius(bullet);
  drawTrail(ctx, bullet, radius);

  const baseColor = resolveBaseColor(bullet);
  const glowRadius = Math.max(radius * (bullet?.isBossProjectile ? 4.5 : 3.2), radius + 6);
  const centerX = bullet.x ?? 0;
  const centerY = bullet.y ?? 0;
  const gradient = ctx.createRadialGradient(
    centerX,
    centerY,
    0,
    centerX,
    centerY,
    glowRadius
  );

  if (bullet?.isBossProjectile) {
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    gradient.addColorStop(0.35, colorWithAlpha(baseColor, 0.9, DEFAULT_BOSS_COLOR));
    gradient.addColorStop(1, colorWithAlpha(baseColor, 0, DEFAULT_BOSS_COLOR));
  } else {
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    gradient.addColorStop(0.4, colorWithAlpha(baseColor, 0.75, DEFAULT_ENEMY_COLOR));
    gradient.addColorStop(1, colorWithAlpha(baseColor, 0, DEFAULT_ENEMY_COLOR));
  }

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = baseColor;
  ctx.beginPath();
  ctx.arc(centerX, centerY, Math.max(1.5, radius), 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, Math.max(1, radius * 0.55), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export default drawEnemyProjectile;
