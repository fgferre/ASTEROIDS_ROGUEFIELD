// Enemy shot (docs/NORTE.md §3): a red splinter — a short emissive core
// pointed along its flight — with a light trail in the shot's own color.

import { BULLET_SIZE } from '../core/GameConstants.js';
import { getRenderScale } from '../core/viewport.js';
import { getEmissive } from '../core/bloomLayer.js';
import { LINE, PALETTE, withAlpha } from '../data/constants/palette.js';

const BASE_RADIUS = Number.isFinite(BULLET_SIZE) ? Math.max(1, BULLET_SIZE) : 3;
// Splinter core at the base radius, in logical px.
const SPLINTER_LENGTH = 4;
const SPLINTER_WIDTH = 1.5;
const SPLINTER_PAD = 4;

function resolveTrailColor(bullet) {
  if (typeof bullet?.color === 'string' && bullet.color.trim().length > 0) {
    return bullet.color;
  }
  return bullet?.isBossProjectile ? PALETTE.boss : PALETTE.threat;
}

function resolveSizeFactor(bullet) {
  const radius =
    Number.isFinite(bullet?.radius) && bullet.radius > 0
      ? bullet.radius
      : BASE_RADIUS;
  return Math.max(1, radius / BASE_RADIUS);
}

// Splinter sprites keyed by size factor and render scale.
const SPLINTER_CACHE = new Map();

function ensureSplinter(factor) {
  const scale = getRenderScale();
  const key = `${factor}|${scale}`;
  const cached = SPLINTER_CACHE.get(key);
  if (cached) return cached;
  if (typeof document === 'undefined') return null;

  const length = SPLINTER_LENGTH * factor;
  const width = SPLINTER_WIDTH * factor;
  const w = length + SPLINTER_PAD * 2;
  const h = width + SPLINTER_PAD * 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(scale, scale);
  ctx.translate(w / 2, h / 2);
  ctx.shadowBlur = 3 * scale; // shadowBlur ignores the transform
  ctx.shadowColor = PALETTE.threat;
  ctx.fillStyle = PALETTE.threat;
  ctx.beginPath();
  ctx.moveTo(length / 2, 0);
  ctx.lineTo(length * 0.1, width / 2);
  ctx.lineTo(-length / 2, 0);
  ctx.lineTo(length * 0.1, -width / 2);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = withAlpha(PALETTE.text, 0.85);
  ctx.lineWidth = width * 0.35;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-length * 0.15, 0);
  ctx.lineTo(length * 0.38, 0);
  ctx.stroke();

  const entry = { canvas, width: w, height: h };
  SPLINTER_CACHE.set(key, entry);
  return entry;
}

function drawTrail(ctx, bullet, color, factor) {
  const trail = bullet.trail;
  if (!Array.isArray(trail) || trail.length === 0) return;

  const points = trail.length;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 0; i < points; i += 1) {
    const from = trail[i];
    const to = trail[i + 1] ?? bullet;
    if (!from || !to) continue;
    const t = (i + 1) / points;
    ctx.globalAlpha = t * (bullet.isBossProjectile ? 0.75 : 0.6);
    ctx.lineWidth = LINE.thin * factor * (0.35 + t * 0.65);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x ?? from.x, to.y ?? from.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawSplinter(ctx, bullet, sprite, factor) {
  const angle = Math.atan2(bullet.vy || 0, bullet.vx || 1);
  ctx.translate(bullet.x ?? 0, bullet.y ?? 0);
  ctx.rotate(angle);
  if (sprite) {
    ctx.drawImage(
      sprite.canvas,
      -sprite.width / 2,
      -sprite.height / 2,
      sprite.width,
      sprite.height
    );
    return;
  }
  ctx.fillStyle = PALETTE.threat;
  ctx.fillRect(
    (-SPLINTER_LENGTH * factor) / 2,
    (-SPLINTER_WIDTH * factor) / 2,
    SPLINTER_LENGTH * factor,
    SPLINTER_WIDTH * factor
  );
}

export function drawEnemyProjectile(ctx, bullet) {
  if (!ctx || !bullet || bullet.hit) {
    return;
  }

  const factor = resolveSizeFactor(bullet);
  const color = resolveTrailColor(bullet);
  const sprite = ensureSplinter(factor);
  const emissive = getEmissive();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawTrail(ctx, bullet, color, factor);
  ctx.globalCompositeOperation = 'source-over';
  drawSplinter(ctx, bullet, sprite, factor);
  ctx.restore();

  if (!emissive) return;
  emissive.save();
  drawTrail(emissive, bullet, color, factor);
  drawSplinter(emissive, bullet, sprite, factor);
  emissive.restore();
}

export function warmupProjectileCache() {
  ensureSplinter(1); // minion shots
  ensureSplinter(resolveSizeFactor({ radius: 6 })); // boss shots
}
