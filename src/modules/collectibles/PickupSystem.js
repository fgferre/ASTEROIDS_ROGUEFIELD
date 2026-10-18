/**
 * Pickup System
 *
 * Field pickups (Magnet, Pulse, Overcharge) dropped by Elites and Wardens.
 * They drift, blink before expiring and apply their effect on contact.
 * Catalogue and drop rules: src/data/pickups.js.
 */

import { BaseSystem } from '../../core/BaseSystem.js';
import { requireService } from '../../core/serviceUtils.js';
import { getEmissive } from '../../core/bloomLayer.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../../core/GameConstants.js';
import { PALETTE, LINE, withAlpha } from '../../data/constants/palette.js';
import {
  PICKUP_KINDS,
  PICKUP_TOKEN,
  PICKUP_DROPS,
} from '../../data/pickups.js';

const TWO_PI = Math.PI * 2;
// Salt for the pickup stream: a numeric fork leaves the root sequence intact.
const RANDOM_SALT = 0x9e3779b9;
const KIND_WEIGHTS = Object.values(PICKUP_KINDS).map((kind) => ({
  value: kind.id,
  weight: kind.weight,
}));
// Tuning key CombatSystem stores the Overcharge multiplier under.
const OVERCHARGE_TUNING = { upgradeId: 'pickup-overcharge', level: 1 };

export class PickupSystem extends BaseSystem {
  constructor(dependencies = {}) {
    super(dependencies, { systemName: 'PickupSystem', serviceName: 'pickups' });
    this.player = requireService('player', this.dependencies, 'PickupSystem');
    this.xpOrbs = requireService('xp-orbs', this.dependencies, 'PickupSystem');
    this.enemies = requireService('enemies', this.dependencies, 'PickupSystem');
    this.effects = requireService('effects', this.dependencies, 'PickupSystem');
    this.rootRandom = requireService(
      'random',
      this.dependencies,
      'PickupSystem'
    );
    this.pickups = [];
    this.overchargeRemaining = 0;
    this.rockDropChance = 0;
    this.reseedRandom();
  }

  setupEventListeners() {
    // Elites drop at their chance; plain rocks only with Lucky Fragment.
    this.registerEventListener('enemy-destroyed', (payload = {}) => {
      const enemy = payload.enemy;
      if (!enemy || enemy.type === 'boss') return;
      const chance = enemy.elite
        ? PICKUP_DROPS.eliteChance
        : enemy.type === 'asteroid'
          ? this.rockDropChance
          : 0;
      if (chance <= 0 || !this.random.chance(chance)) return;
      const { x, y } = payload.position || enemy;
      this.spawnPickup(this.rollKind(), x, y);
    });

    this.registerEventListener('boss-defeated', (payload = {}) => {
      const { x, y } = payload.position || payload.enemy || {};
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const half = PICKUP_TOKEN.wardenSpread / 2;
      this.spawnPickup(PICKUP_DROPS.wardenGuaranteed, x - half, y);
      this.spawnPickup(this.rollKind(), x + half, y);
    });

    this.registerEventListener('upgrade-lucky-fragment', (data) => {
      this.rockDropChance = data.chance;
    });
    this.registerEventListener('progression-reset', () => {
      this.rockDropChance = 0;
    });

    this.registerEventListener('game-started', () => this.reset());
  }

  reseedRandom() {
    this.random = this.rootRandom.fork(
      ((this.rootRandom.seed ?? 0) ^ RANDOM_SALT) >>> 0
    );
  }

  rollKind() {
    return this.random.weightedPick(KIND_WEIGHTS);
  }

  spawnPickup(kind, x, y) {
    const definition = PICKUP_KINDS[kind];
    const angle = this.random.range(0, TWO_PI);
    const pickup = {
      kind,
      x,
      y,
      vx: Math.cos(angle) * PICKUP_TOKEN.driftSpeed,
      vy: Math.sin(angle) * PICKUP_TOKEN.driftSpeed,
      radius: PICKUP_TOKEN.radius,
      age: 0,
      lifetime: PICKUP_TOKEN.lifetime,
      color: definition.color,
      phase: this.random.range(0, TWO_PI),
    };
    this.pickups.push(pickup);
    this.eventBus.emit('pickup-spawned', { kind, x, y });
    return pickup;
  }

  update(deltaTime) {
    if (this.overchargeRemaining > 0) {
      this.overchargeRemaining -= deltaTime;
      if (this.overchargeRemaining <= 0) {
        this.setOvercharge(1);
      }
    }
    if (!this.pickups.length) return;

    const player = this.player;
    const canCollect =
      !player.isDead && !player.isRetrying && !player._quitExplosionHidden;
    const position = player.getPosition();
    const reachSq = PICKUP_TOKEN.pickupRadius * PICKUP_TOKEN.pickupRadius;
    const damping = Math.max(0, 1 - PICKUP_TOKEN.driftDamping * deltaTime);
    const margin = PICKUP_TOKEN.fieldMargin;

    this.pickups = this.pickups.filter((pickup) => {
      pickup.age += deltaTime;
      if (pickup.age >= pickup.lifetime) return false;

      pickup.vx *= damping;
      pickup.vy *= damping;
      pickup.x += pickup.vx * deltaTime;
      pickup.y += pickup.vy * deltaTime;
      if (pickup.x < margin || pickup.x > GAME_WIDTH - margin) {
        pickup.vx = -pickup.vx;
        pickup.x = Math.min(GAME_WIDTH - margin, Math.max(margin, pickup.x));
      }
      if (pickup.y < margin || pickup.y > GAME_HEIGHT - margin) {
        pickup.vy = -pickup.vy;
        pickup.y = Math.min(GAME_HEIGHT - margin, Math.max(margin, pickup.y));
      }

      const dx = pickup.x - position.x;
      const dy = pickup.y - position.y;
      if (canCollect && dx * dx + dy * dy <= reachSq) {
        this.collect(pickup);
        return false;
      }
      return true;
    });
  }

  collect(pickup) {
    const { kind, x, y } = pickup;
    if (kind === 'magnet') {
      const { duration, pullSpeed, pullAcceleration } = PICKUP_KINDS.magnet;
      this.xpOrbs.startGlobalPull(duration, pullSpeed, pullAcceleration);
    } else if (kind === 'pulse') {
      this.firePulse();
    } else if (kind === 'overcharge') {
      this.overchargeRemaining = PICKUP_KINDS.overcharge.duration;
      this.setOvercharge(PICKUP_KINDS.overcharge.cooldownMultiplier);
    }
    this.eventBus.emit('pickup-collected', { kind, x, y });
  }

  firePulse() {
    const { damage, bossDamageScale, shockwaveRadius, color } =
      PICKUP_KINDS.pulse;
    // Copy: kills during the loop rebuild the enemy cache.
    const targets = [...this.enemies.getActiveEnemies()];
    for (const enemy of targets) {
      const amount = enemy.type === 'boss' ? damage * bossDamageScale : damage;
      this.enemies.applyDamage(enemy, amount, { cause: 'pickup-pulse' });
    }
    const position = this.player.getPosition();
    this.effects.createShockwaveEffect({
      position: { x: position.x, y: position.y },
      radius: shockwaveRadius,
      duration: 0.6,
      baseWidth: 14,
      color: withAlpha(color, 0.7),
    });
    this.effects.addScreenFlash(withAlpha(color, 0.35), 0.25, 0.22);
  }

  // Fire-rate multiplier through CombatSystem's weapon-tuning channel; the
  // same key set back to 1 ends the boost.
  setOvercharge(cooldownMultiplier) {
    if (cooldownMultiplier === 1) this.overchargeRemaining = 0;
    this.eventBus.emit('upgrade-weapon-tuning', {
      ...OVERCHARGE_TUNING,
      cooldownMultiplier,
    });
  }

  /** Plain snapshot for other renderers (3D mirror). */
  getActivePickups() {
    return this.pickups.map(({ kind, x, y, radius, age, lifetime, color }) => ({
      kind,
      x,
      y,
      radius,
      age,
      lifetime,
      color,
    }));
  }

  // Matte token, colored rim, emissive glyph; blinks in its last seconds.
  render(ctx) {
    if (!this.pickups.length) return;
    const emissive = getEmissive();
    for (const pickup of this.pickups) {
      const remaining = pickup.lifetime - pickup.age;
      if (
        remaining < PICKUP_TOKEN.blinkTime &&
        Math.floor(remaining * 8) % 2 === 0
      ) {
        continue;
      }
      const pulse = 1 + Math.sin(pickup.age * 4 + pickup.phase) * 0.08;
      const r = pickup.radius * pulse;

      ctx.save();
      ctx.translate(pickup.x, pickup.y);

      const halo = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 2);
      halo.addColorStop(0, withAlpha(pickup.color, 0.25));
      halo.addColorStop(1, withAlpha(pickup.color, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2, 0, TWO_PI);
      ctx.fill();

      const body = ctx.createLinearGradient(-r, -r, r, r);
      body.addColorStop(0, PALETTE.hullLit);
      body.addColorStop(1, PALETTE.hull);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TWO_PI);
      ctx.fill();
      ctx.lineWidth = LINE.thin;
      ctx.strokeStyle = pickup.color;
      ctx.stroke();

      drawGlyph(ctx, pickup.kind, r * 0.55, pickup.color);
      ctx.restore();

      if (emissive) {
        emissive.save();
        emissive.setTransform(ctx.getTransform());
        emissive.translate(pickup.x, pickup.y);
        drawGlyph(emissive, pickup.kind, r * 0.55, pickup.color);
        emissive.restore();
      }
    }
  }

  onReset() {
    this.pickups = [];
    this.overchargeRemaining = 0;
    this.reseedRandom();
  }
}

function drawGlyph(ctx, kind, s, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = LINE.base;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (kind === 'magnet') {
    // horseshoe, open side up
    ctx.moveTo(-s * 0.7, -s * 0.8);
    ctx.lineTo(-s * 0.7, 0);
    ctx.arc(0, 0, s * 0.7, Math.PI, 0, true);
    ctx.lineTo(s * 0.7, -s * 0.8);
    ctx.stroke();
  } else if (kind === 'pulse') {
    // core dot inside a ring
    ctx.arc(0, 0, s * 0.85, 0, TWO_PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.3, 0, TWO_PI);
    ctx.fill();
  } else {
    // lightning bolt
    ctx.moveTo(s * 0.25, -s);
    ctx.lineTo(-s * 0.45, s * 0.1);
    ctx.lineTo(s * 0.05, s * 0.1);
    ctx.lineTo(-s * 0.25, s);
    ctx.lineTo(s * 0.45, -s * 0.1);
    ctx.lineTo(-s * 0.05, -s * 0.1);
    ctx.closePath();
    ctx.fill();
  }
}

export default PickupSystem;
