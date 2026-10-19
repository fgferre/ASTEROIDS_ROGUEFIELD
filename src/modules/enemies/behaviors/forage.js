import { ORB_VALUE } from '../../../data/enemies/asteroid-configs.js';
import { PICKUP_TOKEN } from '../../../data/pickups.js';
import { holdOnField } from './field.js';

// The nearer of the nearest orb and the nearest pickup within `sense` px.
function findMeal(enemy, sense) {
  const { x, y } = enemy;
  const orb = enemy.system?.getCachedXPOrbs?.()?.nearestOrb(x, y, sense);
  const pickup = enemy.system?.getCachedPickups?.()?.nearestPickup(x, y, sense);
  const distanceSq = (item) =>
    item ? (item.x - x) ** 2 + (item.y - y) ** 2 : Infinity;
  const orbSq = distanceSq(orb);
  const pickupSq = distanceSq(pickup);
  if (orbSq === Infinity && pickupSq === Infinity) return null;
  return orbSq <= pickupSq
    ? { item: orb, pickup: false, distanceSq: orbSq }
    : { item: pickup, pickup: true, distanceSq: pickupSq };
}

/** Each orb's worth eaten: radius and health, up to their caps. */
export function grow(enemy, params, orbs) {
  enemy.meals += orbs;
  enemy.radius =
    enemy.baseRadius + Math.min(params.maxGrowth, enemy.meals * params.growth);
  const gain = Math.min(
    params.maxHealthGain,
    enemy.meals * params.healthPerOrb
  );
  enemy.maxHealth += gain - enemy.healthGain;
  enemy.health += gain - enemy.healthGain;
  enemy.healthGain = gain;
}

function eat(enemy, params, { item, pickup }) {
  let xp = 0;
  let orbs = 1;
  if (pickup) {
    const kind = enemy.system.getCachedPickups().takePickup(item);
    if (!kind) return;
    enemy.storedPickups.push(kind);
    orbs = params.pickupOrbs;
    xp = params.pickupOrbs * ORB_VALUE;
  } else {
    xp = enemy.system.getCachedXPOrbs().consumeOrb(item);
    if (!(xp > 0)) return;
    enemy.stored.push(xp);
  }
  enemy.eaten += xp;
  grow(enemy, params, orbs);
  enemy.emitEvent(params.ateEvent, { xp, pickup });
  if (enemy.eaten >= params.fullXP) {
    enemy.full = true;
    enemy.digestTimer = params.digest;
  }
}

// Full: the oldest stored orb is gone for good every `digest` s; with none
// left it hunts again.
function digest(enemy, params, deltaTime) {
  enemy.digestTimer -= deltaTime;
  if (enemy.digestTimer > 0) return;
  enemy.digestTimer += params.digest;
  enemy.eaten -= enemy.stored.shift() ?? 0;
  if (!enemy.stored.length) enemy.full = false;
}

// Toward `target` at `pace` px/s (away from it when negative); never moves
// further off the field; the maw leads.
function steerAt(enemy, params, target, pace) {
  if (!target) {
    enemy.vx = 0;
    enemy.vy = 0;
    return;
  }
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  const speed = pace * enemy.paceScale;
  enemy.vx = (dx / distance) * speed;
  enemy.vy = (dy / distance) * speed;
  holdOnField(enemy, params.margin);
  if (enemy.vx || enemy.vy) enemy.rotation = Math.atan2(enemy.vy, enemy.vx);
}

// Everything it holds comes back around it, the orbs with a bonus orb.
function burst(enemy, params) {
  const xp = enemy.stored.reduce((sum, value) => sum + value, 0);
  const bonus = Math.round(xp * params.bonus);
  const values = bonus > 0 ? [...enemy.stored, bonus] : [...enemy.stored];
  const kinds = enemy.storedPickups;
  if (!values.length && !kinds.length) return;
  if (values.length) {
    enemy.system?.rewardManager?.createXPOrbs(enemy, values.length, values);
  }
  const pickups = enemy.system?.getCachedPickups?.();
  kinds.forEach((kind, i) => {
    const offset = (i - (kinds.length - 1) / 2) * PICKUP_TOKEN.wardenSpread;
    pickups?.spawnPickup(kind, enemy.x + offset, enemy.y);
  });
  enemy.emitEvent(params.burstEvent, {
    orbs: values.length,
    xp: xp + bonus,
    pickups: kinds.length,
  });
}

/**
 * Scavenger. Hunts the nearest loose XP orb or pickup within `sense` px at
 * `hunt` px/s and eats it within `bite` px past its radius: the orb's XP goes
 * into `stored` (a pickup into `storedPickups`, worth `pickupOrbs` orbs), and
 * each orb's worth adds `growth` px of radius and `healthPerOrb` health, up to
 * `maxGrowth` and `maxHealthGain`. With nothing to eat it drifts toward the
 * ship at `drift`. Once `eaten` reaches `fullXP` it is `full`: it flees the
 * ship at `flee`, staying `margin` px on the field, and digests one stored orb
 * for good every `digest` s until none are left. Destroyed, it gives back
 * every stored orb plus `bonus` of their XP as one more orb, and its pickups.
 * Paces scale with its movement speed (`paceScale`: Swift, Elite); `fullness`
 * lights its belly. Emits `ateEvent` and `burstEvent`.
 */
export default {
  params: {
    sense: 'number',
    bite: 'number',
    hunt: 'number',
    drift: 'number',
    flee: 'number',
    growth: 'number',
    maxGrowth: 'number',
    healthPerOrb: 'number',
    maxHealthGain: 'number',
    pickupOrbs: 'number',
    fullXP: 'number',
    digest: 'number',
    bonus: 'number',
    margin: 'number',
    ateEvent: 'string',
    burstEvent: 'string',
  },
  getters: {
    paceScale: (enemy) =>
      enemy.movementValue('maxSpeed') /
      enemy.recipe.components.movement.maxSpeed,
    /** 0..1 of `fullXP` held: the belly's light. */
    fullness: (enemy, { fullXP }) => Math.min(1, enemy.eaten / fullXP),
  },
  reset(enemy, { digest: interval }) {
    enemy.baseRadius = enemy.recipe.config.radius;
    enemy.stored = [];
    enemy.storedPickups = [];
    enemy.eaten = 0;
    enemy.meals = 0;
    enemy.healthGain = 0;
    enemy.full = false;
    enemy.digestTimer = interval;
  },
  init(enemy, params, config) {
    enemy.baseRadius = config.radius ?? enemy.recipe.config.radius;
    enemy.radius = enemy.baseRadius;
  },
  steer(enemy, params, deltaTime, { live, target }) {
    if (!live) return;
    if (enemy.full) {
      digest(enemy, params, deltaTime);
      steerAt(enemy, params, target, -params.flee);
      return;
    }
    const meal = findMeal(enemy, params.sense);
    if (!meal) {
      steerAt(enemy, params, target, params.drift);
      return;
    }
    const reach = enemy.radius + params.bite;
    if (meal.distanceSq <= reach * reach) eat(enemy, params, meal);
    steerAt(enemy, params, meal.item, params.hunt);
  },
  dying(enemy, params) {
    burst(enemy, params);
    enemy.stored = [];
    enemy.storedPickups = [];
    enemy.eaten = 0;
    enemy.full = false;
  },
};
