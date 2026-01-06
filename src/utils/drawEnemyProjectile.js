import { BULLET_SIZE } from '../core/GameConstants.js';

const DEFAULT_ENEMY_COLOR = 'rgba(255, 150, 110, 0.9)';
const DEFAULT_BOSS_COLOR = 'rgba(255, 120, 220, 0.95)';
const DEFAULT_RADIUS = Number.isFinite(BULLET_SIZE)
  ? Math.max(1, BULLET_SIZE)
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
      const a =
        parts.length >= 4 ? Math.max(0, Math.min(1, Number(parts[3]))) : 1;
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
    return bossParsed
      ? `${bossParsed.r}, ${bossParsed.g}, ${bossParsed.b}`
      : '255, 120, 220';
  }

  const enemyParsed = parseColor(DEFAULT_ENEMY_COLOR);
  return enemyParsed
    ? `${enemyParsed.r}, ${enemyParsed.g}, ${enemyParsed.b}`
    : '255, 150, 110';
}

function resolveRadius(bullet) {
  if (Number.isFinite(bullet?.radius) && bullet.radius > 0) {
    return bullet.radius;
  }

  return DEFAULT_RADIUS;
}

// Shared Glow Cache (Map<ColorKey, OffscreenCanvas>)
const GLOW_CACHE = new Map();

// Shared Trail Dot Cache (OffscreenCanvas)
let TRAIL_DOT_CACHE = null;

function ensureTrailDotCache() {
  if (TRAIL_DOT_CACHE) return TRAIL_DOT_CACHE;
  if (typeof document === 'undefined') return null;

  const size = 32;
  const center = size / 2;
  const offscreen = document.createElement('canvas');
  offscreen.width = size;
  offscreen.height = size;
  const ctx = offscreen.getContext('2d');

  if (!ctx) return null;

  // 1. Bake the Glow (Generic White/Yellow tint)
  // We tint it via globalCompositeOperation or just rely on alpha blending
  // Actually, a white core with yellowish outer is good for general use
  ctx.shadowBlur = 8;
  ctx.shadowColor = '#FFFFFF';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';

  ctx.beginPath();
  ctx.arc(center, center, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(center, center, 1.5, 0, Math.PI * 2);
  ctx.fill();

  TRAIL_DOT_CACHE = {
    canvas: offscreen,
    width: size,
    height: size,
    radius: center,
  };
  return TRAIL_DOT_CACHE;
}

function ensureGlowCache(colorKey, baseColor, radius, isBoss) {
  const cacheKey = `${colorKey}-${radius}-${isBoss ? 'boss' : 'minion'}`;

  if (GLOW_CACHE.has(cacheKey)) {
    return GLOW_CACHE.get(cacheKey);
  }

  if (typeof document === 'undefined') return null;

  const glowRadius = Math.max(radius * (isBoss ? 4.5 : 3.2), radius + 6);

  const diameter = Math.ceil(glowRadius * 2);
  const offscreen = document.createElement('canvas');
  offscreen.width = diameter;
  offscreen.height = diameter;
  const ctx = offscreen.getContext('2d');

  if (!ctx) return null;

  const gradient = ctx.createRadialGradient(
    glowRadius,
    glowRadius,
    0,
    glowRadius,
    glowRadius,
    glowRadius
  );

  if (isBoss) {
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    gradient.addColorStop(
      0.35,
      colorWithAlpha(baseColor, 0.9, DEFAULT_BOSS_COLOR)
    );
    gradient.addColorStop(1, colorWithAlpha(baseColor, 0, DEFAULT_BOSS_COLOR));
  } else {
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    gradient.addColorStop(
      0.4,
      colorWithAlpha(baseColor, 0.75, DEFAULT_ENEMY_COLOR)
    );
    gradient.addColorStop(1, colorWithAlpha(baseColor, 0, DEFAULT_ENEMY_COLOR));
  }

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(glowRadius, glowRadius, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  const cacheEntry = {
    canvas: offscreen,
    radius: glowRadius,
  };

  // Simple LRU or clear logic could be added here if memory is finding,
  // but for distinct projectile colors it's unlikely to grow large.
  GLOW_CACHE.set(cacheKey, cacheEntry);
  return cacheEntry;
}

function drawTrail(ctx, bullet, radius) {
  if (!Array.isArray(bullet?.trail) || bullet.trail.length < 2) {
    return;
  }

  const trailCache = ensureTrailDotCache();
  if (!trailCache) {
    // Fallback if caching fails (unlikely)
    return;
  }

  const parsed = parseColor(bullet?.color);
  // We can't easily tint the cached white dot without 'source-in' composite
  // which is expensive. Instead, we'll draw it with additive blending ('lighter')
  // and set strokeStyle color for tinting if we were stroking.
  // For drawImage, we rely on the dot's white/yellow color.
  // To get color: we can simple draw the dot.
  // Performance trade-off: The color might not match exact custom bullet hex,
  // but it looks "energy-like".

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const segments = bullet.trail.length;
  // const glowScale = bullet?.isBossProjectile ? 2 : 1.5;

  for (let i = 1; i < segments; i += 1) {
    const p1 = bullet.trail[i - 1];
    const p2 = bullet.trail[i];
    if (!p1 || !p2) continue;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 1) continue;

    const angle = Math.atan2(dy, dx);
    const alpha = (i / segments) * (bullet?.isBossProjectile ? 0.8 : 0.6);

    ctx.translate(p1.x, p1.y);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;

    // Optional: Tinting could be done by drawing a colored block over using source-atop
    // but that kills perf. Just drawing the generic "Energy Trail" is usually fine.

    ctx.drawImage(
      trailCache.canvas,
      -2,
      -trailCache.radius,
      dist + 4,
      trailCache.height
    );

    ctx.rotate(-angle);
    ctx.translate(-p1.x, -p1.y);
  }

  ctx.restore();
}

export function drawEnemyProjectile(ctx, bullet) {
  if (!ctx || !bullet || bullet.hit) {
    return;
  }
  ctx.save();

  const radius = resolveRadius(bullet);
  drawTrail(ctx, bullet, radius);

  const baseColor = resolveBaseColor(bullet);
  const colorKey =
    typeof bullet.color === 'string'
      ? bullet.color
      : bullet.isBossProjectile
        ? 'boss'
        : 'default';

  const glowSprite = ensureGlowCache(
    colorKey,
    baseColor,
    radius,
    !!bullet.isBossProjectile
  );

  if (glowSprite) {
    ctx.drawImage(
      glowSprite.canvas,
      (bullet.x ?? 0) - glowSprite.radius,
      (bullet.y ?? 0) - glowSprite.radius
    );
  } else {
    // Fallback
    const glowRadius = Math.max(
      radius * (bullet?.isBossProjectile ? 4.5 : 3.2),
      radius + 6
    );
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
    // ... (rest of gradient logic if needed)
  }

  // Draw Core (Simple shapes, very fast)
  const centerX = bullet.x ?? 0;
  const centerY = bullet.y ?? 0;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, Math.max(1, radius * 0.55), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function warmupProjectileCache() {
  if (typeof document === 'undefined') return;

  // Pre-bake common projectile glows
  const commonTypes = [
    { color: '#50DCFF', radius: 4, boss: false }, // Hunter (Cyan)
    { color: '#FFCC66', radius: 4, boss: false }, // Mine (Yellow)
    { color: '#FF6040', radius: 4, boss: false }, // Drone (Orange/Red)
    { color: 'default', radius: 4, boss: false }, // Generic
    { color: 'boss', radius: 8, boss: true }, // Boss generic
  ];

  commonTypes.forEach((type) => {
    const colorKey =
      type.color === 'default' || type.color === 'boss'
        ? type.color
        : type.color;
    // Resolve base color roughly if it's a hex
    const baseColor = type.color.startsWith('#')
      ? type.color
      : type.boss
        ? DEFAULT_BOSS_COLOR
        : DEFAULT_ENEMY_COLOR;
    ensureGlowCache(colorKey, baseColor, type.radius, type.boss);
  });

  ensureTrailDotCache();
}
