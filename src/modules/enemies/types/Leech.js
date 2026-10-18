import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import { ORB_VALUE } from '../../../data/enemies/asteroid-configs.js';
import {
  LEECH_BITE_REACH,
  LEECH_BURST_BONUS,
  LEECH_COMPONENTS,
  LEECH_CONFIG,
  LEECH_DIGEST_INTERVAL,
  LEECH_DRIFT_SPEED,
  LEECH_FIELD_MARGIN,
  LEECH_FLEE_SPEED,
  LEECH_FULL_XP,
  LEECH_GROWTH_PER_ORB,
  LEECH_HEALTH_PER_ORB,
  LEECH_MAX_GROWTH,
  LEECH_MAX_HEALTH_GAIN,
  LEECH_PICKUP_ORBS,
  LEECH_SENSE_RADIUS,
  LEECH_SPEED,
} from '../../../data/enemies/leech.js';
import { PICKUP_TOKEN } from '../../../data/pickups.js';
import { BaseEnemy } from '../base/BaseEnemy.js';

/**
 * Scavenger. Hunts the nearest loose XP orb or pickup within
 * LEECH_SENSE_RADIUS and eats it on contact: the orb's XP goes into `stored`
 * (a pickup into `storedPickups`, worth LEECH_PICKUP_ORBS orbs), and each
 * orb's worth adds LEECH_GROWTH_PER_ORB px of radius and LEECH_HEALTH_PER_ORB
 * health, up to their caps. With nothing to eat it drifts toward the ship.
 * Once `eaten` reaches LEECH_FULL_XP it is `full`: it flees the ship, staying
 * on the field, and digests one stored orb for good every
 * LEECH_DIGEST_INTERVAL s until none are left. Destroyed, it gives back every
 * stored orb plus LEECH_BURST_BONUS of their XP as one more orb, and its
 * pickups. Emits `leech-ate` and `leech-burst`.
 */
export class Leech extends BaseEnemy {
  constructor(system, config = {}) {
    super(system, config);
    this.type = 'leech';
    this.baseRadius = LEECH_CONFIG.radius;
    this.stored = [];
    this.storedPickups = [];
    this.eaten = 0;
    this.meals = 0;
    this.healthGain = 0;
    this.full = false;
    this.digestTimer = LEECH_DIGEST_INTERVAL;
    this.destroyed = false;
    this.movementStrategy = 'linear';
    this.renderStrategy = 'procedural';

    if (Object.keys(config).length > 0) {
      this.initialize(config);
    }
  }

  initialize(config = {}) {
    this.resetForPool();
    super.initialize(config);

    this.baseRadius = config.radius ?? LEECH_CONFIG.radius;
    this.radius = this.baseRadius;
    this.maxHealth = config.maxHealth ?? config.health ?? LEECH_CONFIG.health;
    this.health = this.maxHealth;
    this.contactDamage = config.contactDamage ?? LEECH_CONFIG.contactDamage;
    this.movementStrategy = (
      config.components ?? LEECH_COMPONENTS
    ).movement.strategy;
    this.destroyed = false;
    return this;
  }

  // Swift scales every pace alike.
  get paceScale() {
    return (this.movementConfig?.maxSpeed ?? LEECH_SPEED) / LEECH_SPEED;
  }

  /** 0..1 of LEECH_FULL_XP held: the belly's light. */
  get fullness() {
    return Math.min(1, this.eaten / LEECH_FULL_XP);
  }

  onUpdate(deltaTime) {
    if (!(deltaTime > 0) || !this.alive) return;

    const ship = this.system?.getCachedPlayer?.()?.position ?? null;
    if (this.full) {
      this.digest(deltaTime);
      this.steer(ship, -LEECH_FLEE_SPEED);
      return;
    }
    const meal = this.findMeal();
    if (!meal) {
      this.steer(ship, LEECH_DRIFT_SPEED);
      return;
    }
    const reach = this.radius + LEECH_BITE_REACH;
    if (meal.distanceSq <= reach * reach) this.eat(meal);
    this.steer(meal.item, LEECH_SPEED);
  }

  // A Leech event at its own position, plus `extra`.
  emitEvent(name, extra) {
    this.getEventBus()?.emit?.(name, {
      enemy: this,
      enemyId: this.id,
      position: { x: this.x, y: this.y },
      ...extra,
    });
  }

  // The nearer of the nearest orb and the nearest pickup in sense range.
  findMeal() {
    const { x, y } = this;
    const orb = this.system
      ?.getCachedXPOrbs?.()
      ?.nearestOrb(x, y, LEECH_SENSE_RADIUS);
    const pickup = this.system
      ?.getCachedPickups?.()
      ?.nearestPickup(x, y, LEECH_SENSE_RADIUS);
    const distanceSq = (item) =>
      item ? (item.x - x) ** 2 + (item.y - y) ** 2 : Infinity;
    const orbSq = distanceSq(orb);
    const pickupSq = distanceSq(pickup);
    if (orbSq === Infinity && pickupSq === Infinity) return null;
    return orbSq <= pickupSq
      ? { item: orb, pickup: false, distanceSq: orbSq }
      : { item: pickup, pickup: true, distanceSq: pickupSq };
  }

  eat({ item, pickup }) {
    let xp = 0;
    let orbs = 1;
    if (pickup) {
      const kind = this.system.getCachedPickups().takePickup(item);
      if (!kind) return;
      this.storedPickups.push(kind);
      orbs = LEECH_PICKUP_ORBS;
      xp = LEECH_PICKUP_ORBS * ORB_VALUE;
    } else {
      xp = this.system.getCachedXPOrbs().consumeOrb(item);
      if (!(xp > 0)) return;
      this.stored.push(xp);
    }
    this.eaten += xp;
    this.grow(orbs);
    this.emitEvent('leech-ate', { xp, pickup });
    if (this.eaten >= LEECH_FULL_XP) {
      this.full = true;
      this.digestTimer = LEECH_DIGEST_INTERVAL;
    }
  }

  grow(orbs) {
    this.meals += orbs;
    this.radius =
      this.baseRadius +
      Math.min(LEECH_MAX_GROWTH, this.meals * LEECH_GROWTH_PER_ORB);
    const gain = Math.min(
      LEECH_MAX_HEALTH_GAIN,
      this.meals * LEECH_HEALTH_PER_ORB
    );
    this.maxHealth += gain - this.healthGain;
    this.health += gain - this.healthGain;
    this.healthGain = gain;
  }

  // Full: the oldest stored orb is gone for good every LEECH_DIGEST_INTERVAL;
  // with none left it hunts again.
  digest(deltaTime) {
    this.digestTimer -= deltaTime;
    if (this.digestTimer > 0) return;
    this.digestTimer += LEECH_DIGEST_INTERVAL;
    this.eaten -= this.stored.shift() ?? 0;
    if (!this.stored.length) this.full = false;
  }

  // Toward `target` at `pace` px/s (away from it when negative); never moves
  // further off the field; the maw leads.
  steer(target, pace) {
    if (!target) {
      this.vx = 0;
      this.vy = 0;
      return;
    }
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.hypot(dx, dy) || 1;
    const speed = pace * this.paceScale;
    this.vx = (dx / distance) * speed;
    this.vy = (dy / distance) * speed;
    const margin = LEECH_FIELD_MARGIN;
    if (
      (this.x < margin && this.vx < 0) ||
      (this.x > GAME_WIDTH - margin && this.vx > 0)
    ) {
      this.vx = 0;
    }
    if (
      (this.y < margin && this.vy < 0) ||
      (this.y > GAME_HEIGHT - margin && this.vy > 0)
    ) {
      this.vy = 0;
    }
    if (this.vx || this.vy) this.rotation = Math.atan2(this.vy, this.vx);
  }

  // Everything it holds comes back around it, the orbs with a bonus orb.
  burst() {
    const xp = this.stored.reduce((sum, value) => sum + value, 0);
    const bonus = Math.round(xp * LEECH_BURST_BONUS);
    const values = bonus > 0 ? [...this.stored, bonus] : [...this.stored];
    const kinds = this.storedPickups;
    if (!values.length && !kinds.length) return;
    if (values.length) {
      this.system?.rewardManager?.createXPOrbs(this, values.length, values);
    }
    const pickups = this.system?.getCachedPickups?.();
    kinds.forEach((kind, i) => {
      const offset = (i - (kinds.length - 1) / 2) * PICKUP_TOKEN.wardenSpread;
      pickups?.spawnPickup(kind, this.x + offset, this.y);
    });
    this.emitEvent('leech-burst', {
      orbs: values.length,
      xp: xp + bonus,
      pickups: kinds.length,
    });
  }

  onDestroyed(source, context = {}) {
    this.destroyed = true;
    this.burst();
    this.stored = [];
    this.storedPickups = [];
    this.eaten = 0;
    this.full = false;
    super.onDestroyed(source, context);
  }

  resetForPool() {
    super.resetForPool();
    this.baseRadius = LEECH_CONFIG.radius;
    this.stored = [];
    this.storedPickups = [];
    this.eaten = 0;
    this.meals = 0;
    this.healthGain = 0;
    this.full = false;
    this.digestTimer = LEECH_DIGEST_INTERVAL;
    this.destroyed = false;
  }
}

export default Leech;
