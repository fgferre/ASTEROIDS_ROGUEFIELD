import RandomService from '../core/RandomService.js';
import { getRenderScale } from '../core/viewport.js';
import { LINE, PALETTE } from '../data/constants/palette.js';

class SpaceParticle {
  constructor(x, y, vx, vy, color, size, life, type = 'normal', random = null) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.life = life;
    this.maxLife = life;
    this.alpha = 1;
    this.type = type;

    const rng = SpaceParticle.resolveRandom(random);
    const float = () => rng.float();

    if (typeof rng.range === 'function') {
      this.rotation = rng.range(0, Math.PI * 2);
    } else {
      this.rotation = float() * Math.PI * 2;
    }
    this.rotationSpeed = (float() - 0.5) * 4;
  }

  update(deltaTime) {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    this.life -= deltaTime;
    this.alpha = Math.max(0, this.life / this.maxLife);
    this.rotation += this.rotationSpeed * deltaTime;

    const friction = this.type === 'thruster' ? 0.98 : 0.96;
    this.vx *= friction;
    this.vy *= friction;

    return this.life > 0;
  }

  draw(ctx, emissive = null) {
    drawParticle(ctx, this, emissive);
  }
}

SpaceParticle._fallbackRandom = null;

SpaceParticle.resolveRandom = function resolveRandom(random) {
  if (random && typeof random.float === 'function') {
    return random;
  }

  if (!SpaceParticle._fallbackRandom) {
    SpaceParticle._fallbackRandom = new RandomService(
      'effects-system:particle:fallback'
    );
  }

  return SpaceParticle._fallbackRandom;
};

// --- particle rendering (docs/NORTE.md §2) ---------------------------------
// Light particles (embers, sparks, flares, thruster, crack glints) draw
// additively and a second time into the bloom layer, which supplies the halo.
// Matte particles (rock/hull chips, smoke) draw once, source-over, no glow.
const MATTE_TYPES = new Set(['debris', 'smoke']);
const SPRITE_LIMIT = 64;
const sprites = new Map();
let spriteScale = 0;

function makeSprite(key, logicalSize, paint) {
  const scale = getRenderScale();
  if (scale !== spriteScale) {
    sprites.clear();
    spriteScale = scale;
  }
  const cached = sprites.get(key);
  if (cached !== undefined) return cached;
  if (typeof document === 'undefined') return null;
  if (sprites.size >= SPRITE_LIMIT) sprites.clear();

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(logicalSize * scale);
  canvas.height = Math.ceil(logicalSize * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  paint(ctx, logicalSize / 2);
  sprites.set(key, canvas);
  return canvas;
}

// Ember: hot core fading into one hue. No halo here; bloom adds it.
function emberSprite(color) {
  return makeSprite(`ember|${color}`, 32, (ctx, c) => {
    const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
    gradient.addColorStop(0, PALETTE.text);
    gradient.addColorStop(0.25, color);
    gradient.addColorStop(0.6, color);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, c * 2, c * 2);
  });
}

// Chip: an irregular matte shard lit by the fixed key light (upper-left).
function chipSprite(color) {
  return makeSprite(`chip|${color}`, 16, (ctx, c) => {
    const pts = [
      [-0.95, -0.35],
      [-0.2, -0.95],
      [0.8, -0.55],
      [0.9, 0.45],
      [0.05, 0.9],
      [-0.75, 0.6],
    ];
    const r = c * 0.9;
    ctx.translate(c, c);
    ctx.beginPath();
    pts.forEach(([x, y], i) =>
      i === 0 ? ctx.moveTo(x * r, y * r) : ctx.lineTo(x * r, y * r)
    );
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = PALETTE.rockLit;
    ctx.beginPath();
    ctx.moveTo(-r, -r);
    ctx.lineTo(r, -r);
    ctx.lineTo(-r, r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = LINE.hair;
    ctx.strokeStyle = PALETTE.rockShadow;
    ctx.stroke();
  });
}

function drawMatte(ctx, p) {
  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.translate(p.x, p.y);
  if (p.type === 'smoke') {
    ctx.globalAlpha = p.alpha * 0.6;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, p.size * (1.4 - p.alpha * 0.4), 0, Math.PI * 2);
    ctx.fill();
  } else {
    const s = p.size * (0.5 + p.alpha * 0.5) * 1.3;
    ctx.rotate(p.rotation);
    const sprite = chipSprite(p.color);
    if (sprite) {
      ctx.drawImage(sprite, -s / 2, -s / 2, s, s);
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(-s / 2, -s / 2, s, s);
    }
  }
  ctx.restore();
}

function strokeSpark(ctx, p, widthScale) {
  const speed = Math.hypot(p.vx, p.vy);
  ctx.strokeStyle = p.color;
  ctx.lineWidth = Math.max(LINE.hair * 0.5, p.size * p.alpha * widthScale);
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (speed > 10) {
    const stretch = Math.max(1, Math.min(3, speed * 0.01));
    ctx.rotate(Math.atan2(p.vy, p.vx) - p.rotation);
    ctx.moveTo(-p.size * stretch, 0);
    ctx.lineTo(p.size * stretch, 0);
  } else {
    ctx.moveTo(-p.size * 1.5, 0);
    ctx.lineTo(p.size * 1.5, 0);
  }
  ctx.stroke();
}

function drawLight(ctx, p, bloom) {
  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);

  if (p.type === 'spark') {
    strokeSpark(ctx, p, bloom ? 1.6 : 1);
  } else if (p.type === 'crack') {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = Math.max(0.6, p.size * 0.4);
    ctx.lineCap = 'round';
    const length = p.size * 3.2;
    ctx.beginPath();
    ctx.moveTo(-length * 0.5, 0);
    ctx.lineTo(length * 0.5, 0);
    ctx.stroke();
  } else if (p.type === 'flare') {
    // muzzle flare: small disc in one hue with a white-hot pin core
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, p.size, 0, Math.PI * 2);
    ctx.fill();
    if (!bloom) {
      ctx.fillStyle = PALETTE.text;
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (p.type === 'thruster') {
    const speed = Math.hypot(p.vx, p.vy);
    const stretch = Math.max(1, Math.min(6, speed * 0.04));
    ctx.rotate(Math.atan2(p.vy, p.vx) - p.rotation);
    ctx.scale(stretch, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, p.size * p.alpha, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const radius = p.size * p.alpha;
    if (radius > 0.5) {
      const sprite = bloom ? null : emberSprite(p.color);
      if (sprite) {
        ctx.drawImage(sprite, -radius, -radius, radius * 2, radius * 2);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}

/** Draws any effect particle (pooled or SpaceParticle); `emissive` may be null. */
function drawParticle(ctx, p, emissive = null) {
  if (!p || p.alpha <= 0) return;
  if (MATTE_TYPES.has(p.type)) {
    drawMatte(ctx, p);
    return;
  }
  drawLight(ctx, p, false);
  if (emissive) drawLight(emissive, p, true);
}

class HitMarker {
  constructor(x, y, killed, damage) {
    this.x = x;
    this.y = y;
    this.killed = killed;
    this.damage = damage;
    this.life = 0.3;
    this.maxLife = 0.3;
    this.size = killed ? 12 : 8;
    this.expansion = 0;
  }

  update(deltaTime) {
    this.life -= deltaTime;
    this.expansion += deltaTime * 20;
    return this.life > 0;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);

    const radius = this.size + this.expansion;

    ctx.strokeStyle = PALETTE.text;
    ctx.lineWidth = LINE.hair;
    ctx.lineCap = 'round';

    if (this.killed) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(-radius, 0);
      ctx.lineTo(radius, 0);
      ctx.moveTo(0, -radius);
      ctx.lineTo(0, radius);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-radius, 0);
      ctx.lineTo(radius, 0);
      ctx.moveTo(0, -radius);
      ctx.lineTo(0, radius);
      ctx.stroke();
    }

    ctx.restore();
  }
}

class DamageText {
  constructor(x, y, damage, isCritical) {
    this.x = x;
    this.y = y;
    this.damage = Math.round(damage);
    this.isCritical = isCritical;
    this.life = 0.8;
    this.maxLife = 0.8;
    this.vy = -30;
    this.scale = 1;
  }

  update(deltaTime) {
    this.life -= deltaTime;
    this.y += this.vy * deltaTime;
    this.vy *= 0.95;

    const progress = 1 - this.life / this.maxLife;
    if (progress < 0.2) {
      this.scale = progress * 5;
    } else {
      this.scale = 1;
    }

    return this.life > 0;
  }

  draw(ctx) {
    const alpha = Math.min(1, this.life * 2);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);
    const scale = this.scale * (this.isCritical ? 1.5 : 1.0);
    ctx.scale(scale, scale);

    ctx.font = `bold ${this.isCritical ? '24px' : '16px'} "Rajdhani", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = PALETTE.background;
    ctx.strokeText(String(this.damage), 0, 0);

    ctx.fillStyle = this.isCritical ? PALETTE.shot : PALETTE.text;
    ctx.fillText(String(this.damage), 0, 0);

    ctx.restore();
  }
}

export { DamageText, HitMarker, SpaceParticle, drawParticle };
