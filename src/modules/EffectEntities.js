import RandomService from '../core/RandomService.js';

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

  draw(ctx) {
    if (this.alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.globalCompositeOperation = 'lighter';

    if (this.type === 'spark') {
      const speed = Math.hypot(this.vx, this.vy);

      if (speed > 10) {
        const angle = Math.atan2(this.vy, this.vx);
        const stretch = Math.max(1, Math.min(3, speed * 0.01));

        ctx.beginPath();
        ctx.rotate(angle - this.rotation);
        ctx.scale(stretch, 1);

        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.size * this.alpha;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;

        ctx.moveTo(-this.size, 0);
        ctx.lineTo(this.size, 0);
        ctx.stroke();
      } else {
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.size * this.alpha;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.moveTo(-this.size * 1.5, 0);
        ctx.lineTo(this.size * 1.5, 0);
        ctx.stroke();
      }
    } else if (this.type === 'crack') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = Math.max(0.6, this.size * 0.4);
      ctx.lineCap = 'round';
      ctx.beginPath();
      const length = this.size * 3.2;
      ctx.moveTo(-length * 0.5, 0);
      ctx.lineTo(length * 0.5, 0);
      ctx.stroke();
    } else if (this.type === 'debris') {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      const s = this.size * this.alpha;
      ctx.rect(-s / 2, -s / 2, s, s);
      ctx.fill();
    } else if (this.type === 'thruster') {
      const speed = Math.hypot(this.vx, this.vy);
      const angle = Math.atan2(this.vy, this.vx);
      const stretch = Math.max(1, Math.min(6, speed * 0.04));

      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.translate(0, 0);
      ctx.rotate(angle);
      ctx.scale(stretch, 1);
      ctx.arc(0, 0, this.size * this.alpha, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const radius = this.size * this.alpha;
      if (radius > 0.5) {
        const sprite = SpaceParticle.ensureSpriteCache();
        if (sprite) {
          ctx.drawImage(sprite, -radius, -radius, radius * 2, radius * 2);
          ctx.fillStyle = this.color;
          ctx.globalAlpha = this.alpha * 0.6;
          ctx.beginPath();
          ctx.arc(0, 0, radius * 0.6, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
          gradient.addColorStop(0, '#FFFFFF');
          gradient.addColorStop(0.4, this.color);
          gradient.addColorStop(1, 'transparent');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }
}

SpaceParticle._fallbackRandom = null;
SpaceParticle.spriteCache = null;

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

SpaceParticle.ensureSpriteCache = function ensureSpriteCache() {
  if (SpaceParticle.spriteCache) return SpaceParticle.spriteCache;

  if (typeof document === 'undefined') return null;

  const size = 64;
  const center = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (!ctx) return null;

  const gradient = ctx.createRadialGradient(
    center,
    center,
    0,
    center,
    center,
    center
  );
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  SpaceParticle.spriteCache = canvas;
  return SpaceParticle.spriteCache;
};

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

    const color = this.killed ? '#FF4444' : '#FFFF88';
    const lineWidth = this.killed ? 2.5 : 2;
    const radius = this.size + this.expansion;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
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
    ctx.strokeStyle = '#000000';
    ctx.strokeText(String(this.damage), 0, 0);

    ctx.fillStyle = this.isCritical ? '#FFBB00' : '#FFFFFF';
    ctx.fillText(String(this.damage), 0, 0);

    ctx.restore();
  }
}

export { DamageText, HitMarker, SpaceParticle };
