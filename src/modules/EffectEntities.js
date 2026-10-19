import RandomService from '../core/RandomService.js';
import { PALETTE } from '../data/constants/palette.js';

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
}

// Damage numbers with weight (PLAN.md R5.9, proposta 18/10): size grows with
// the log of the damage, colour steps white → amber → red, and each number
// pops in past its size before settling. Renderer3D draws them.
export const DAMAGE_TEXT_PX = 16;
const DAMAGE_SCALE_MIN = 0.8; // at DAMAGE_SCALE_LOW damage and below
const DAMAGE_SCALE_MAX = 1.6; // at DAMAGE_SCALE_HIGH damage and above
const DAMAGE_SCALE_LOW = 5;
const DAMAGE_SCALE_HIGH = 100;
const DAMAGE_AMBER_AT = 30;
const DAMAGE_RED_AT = 60;
const CRIT_SCALE = 1.25;
const POP_IN = 0.12; // fraction of life growing to the overshoot
const POP_SETTLE = 0.28; // fraction of life back down to 1
const POP_OVERSHOOT = 1.35;

/** Size multiplier and colour for a number showing `damage`. */
export function damageTextStyle(damage, isCritical = false) {
  const t = Math.min(
    1,
    Math.max(
      0,
      Math.log(Math.max(damage, 1) / DAMAGE_SCALE_LOW) /
        Math.log(DAMAGE_SCALE_HIGH / DAMAGE_SCALE_LOW)
    )
  );
  const scale =
    (DAMAGE_SCALE_MIN + (DAMAGE_SCALE_MAX - DAMAGE_SCALE_MIN) * t) *
    (isCritical ? CRIT_SCALE : 1);
  let color = PALETTE.text;
  if (damage >= DAMAGE_RED_AT) color = PALETTE.threat;
  else if (damage >= DAMAGE_AMBER_AT || isCritical) color = PALETTE.shot;
  return { scale, color };
}

/** Pop-in curve over the number's life: 0 → overshoot → 1, then holds. */
export function damageTextPop(progress) {
  if (progress < POP_IN) return (progress / POP_IN) * POP_OVERSHOOT;
  if (progress < POP_SETTLE) {
    const k = (progress - POP_IN) / (POP_SETTLE - POP_IN);
    return POP_OVERSHOOT + (1 - POP_OVERSHOOT) * k;
  }
  return 1;
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
    this.scale = 0;
    const style = damageTextStyle(this.damage, isCritical);
    this.sizeScale = style.scale;
    this.color = style.color;
  }

  update(deltaTime) {
    this.life -= deltaTime;
    this.y += this.vy * deltaTime;
    this.vy *= 0.95;
    this.scale = damageTextPop(1 - this.life / this.maxLife);
    return this.life > 0;
  }

  /** Glyph height in logical px this frame. */
  get size() {
    return DAMAGE_TEXT_PX * this.sizeScale * this.scale;
  }
}

export { DamageText, HitMarker, SpaceParticle };
