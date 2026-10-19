// src/modules/physics/bossTuning.js
//
// How physics sizes and tunes enemies, read from the constants: the radius an
// enemy takes in the spatial hash and in collisions (a Warden's padded), what
// counts as a boss, and the Warden's impact tuning (contact cooldowns, charge
// knockback, area blast, screen shake). Pure functions, no state.

import {
  BOSS_CONFIG,
  BOSS_PHYSICS_CONFIG,
} from '../../data/constants/visual.js';

export function getBossPhysicsConfig() {
  return BOSS_PHYSICS_CONFIG || {};
}

export function getBossBaseRadius(boss = null) {
  const bossRadius =
    boss && Number.isFinite(boss.radius) ? Math.max(0, boss.radius) : NaN;
  if (Number.isFinite(bossRadius)) {
    return bossRadius;
  }

  const configRadius = BOSS_CONFIG?.radius;
  if (Number.isFinite(configRadius)) {
    return configRadius;
  }

  return 60;
}

export function getBossSpatialPadding() {
  const config = getBossPhysicsConfig();
  return Number.isFinite(config.spatialPadding) ? config.spatialPadding : 0;
}

export function getBossCollisionPadding() {
  const config = getBossPhysicsConfig();
  return Number.isFinite(config.collisionPadding) ? config.collisionPadding : 0;
}

export function getBossSpatialRadius(boss = null) {
  const base = getBossBaseRadius(boss);
  return base + getBossSpatialPadding();
}

export function resolveEnemySpatialRadius(enemy) {
  if (!enemy) {
    return 0;
  }

  if (isBossEnemy(enemy)) {
    const base = Math.max(
      getBossBaseRadius(enemy),
      Number.isFinite(enemy.radius) ? Math.max(0, enemy.radius) : 0
    );
    return base + getBossSpatialPadding();
  }

  if (Number.isFinite(enemy.radius)) {
    return Math.max(0, enemy.radius);
  }

  return 0;
}

export function resolveEnemyCollisionRadius(
  enemy,
  { includeBossPadding = true } = {}
) {
  if (!enemy) {
    return 0;
  }

  if (isBossEnemy(enemy) && includeBossPadding) {
    const base = Math.max(
      getBossBaseRadius(enemy),
      Number.isFinite(enemy.radius) ? Math.max(0, enemy.radius) : 0
    );
    return base + getBossCollisionPadding();
  }

  if (Number.isFinite(enemy.radius)) {
    return Math.max(0, enemy.radius);
  }

  return 0;
}

export function isBossEnemy(enemy) {
  if (!enemy) {
    return false;
  }

  if (enemy.type === 'boss' || enemy.enemyType === 'boss') {
    return true;
  }

  if (typeof enemy.hasTag === 'function') {
    try {
      if (enemy.hasTag('boss')) {
        return true;
      }
    } catch (error) {
      // ignore
    }
  }

  const { tags } = enemy;
  if (tags) {
    if (tags instanceof Set) {
      return tags.has('boss');
    }
    if (Array.isArray(tags)) {
      return tags.includes('boss');
    }
  }

  return Boolean(enemy.isBoss);
}

export function getBossCollisionCooldown(type) {
  const config = getBossPhysicsConfig();
  if (type === 'boss-charge') {
    return Number.isFinite(config.chargeCooldownMs)
      ? config.chargeCooldownMs
      : 240;
  }

  if (type === 'boss-area') {
    return Number.isFinite(config.areaCooldownMs) ? config.areaCooldownMs : 300;
  }

  return Number.isFinite(config.contactCooldownMs)
    ? config.contactCooldownMs
    : 120;
}

export function getBossChargeKnockback(value) {
  if (Number.isFinite(value)) {
    return value;
  }

  const config = getBossPhysicsConfig();
  return Number.isFinite(config.chargeKnockback) ? config.chargeKnockback : 0;
}

export function getBossChargeBossSlow(value) {
  if (Number.isFinite(value)) {
    return value;
  }

  const config = getBossPhysicsConfig();
  return Number.isFinite(config.chargeBossSlow) ? config.chargeBossSlow : 0;
}

export function getBossChargeDamageBonus(value) {
  if (Number.isFinite(value)) {
    return value;
  }

  const config = getBossPhysicsConfig();
  return Number.isFinite(config.chargeDamageBonus)
    ? config.chargeDamageBonus
    : 0;
}

export function getBossChargeShake(override) {
  if (
    override &&
    Number.isFinite(override.intensity) &&
    Number.isFinite(override.duration)
  ) {
    return override;
  }

  const config = getBossPhysicsConfig();
  const shake = config.chargeShake;
  if (
    shake &&
    Number.isFinite(shake.intensity) &&
    Number.isFinite(shake.duration)
  ) {
    return shake;
  }

  return null;
}

export function getBossAreaDamage(value, boss = null) {
  if (Number.isFinite(value)) {
    return value;
  }

  const config = getBossPhysicsConfig();
  if (Number.isFinite(config.areaDamage)) {
    return config.areaDamage;
  }

  const base = boss?.contactDamage ?? BOSS_CONFIG?.contactDamage;
  if (Number.isFinite(base)) {
    return base * 1.1;
  }

  return 45;
}

export function getBossAreaForce(value) {
  if (Number.isFinite(value)) {
    return value;
  }

  const config = getBossPhysicsConfig();
  return Number.isFinite(config.areaForce) ? config.areaForce : 280;
}

export function getBossAreaRadius(value, boss = null) {
  if (Number.isFinite(value)) {
    return value;
  }

  const baseRadius = getBossBaseRadius(boss);
  const config = getBossPhysicsConfig();
  const multiplier = Number.isFinite(config.areaRadiusMultiplier)
    ? config.areaRadiusMultiplier
    : 2.2;
  return baseRadius * multiplier;
}

export function getBossAreaShake(override) {
  if (
    override &&
    Number.isFinite(override.intensity) &&
    Number.isFinite(override.duration)
  ) {
    return override;
  }

  const config = getBossPhysicsConfig();
  const shake = config.areaShake;
  if (
    shake &&
    Number.isFinite(shake.intensity) &&
    Number.isFinite(shake.duration)
  ) {
    return shake;
  }

  return null;
}

export function getBossContactShake(override) {
  if (
    override &&
    Number.isFinite(override.intensity) &&
    Number.isFinite(override.duration)
  ) {
    return override;
  }

  const config = getBossPhysicsConfig();
  const shake = config.contactShake;
  if (
    shake &&
    Number.isFinite(shake.intensity) &&
    Number.isFinite(shake.duration)
  ) {
    return shake;
  }

  return null;
}
