import {
  RAM_APPROACH_SPEED,
  RAM_CHARGE_SECONDS,
  RAM_CHARGE_SPEED,
  RAM_COMPONENTS,
  RAM_CONFIG,
  RAM_ENGAGE_DISTANCE,
  RAM_RECOVER_SECONDS,
  RAM_WINDUP_SECONDS,
} from '../../../data/enemies/ram.js';
import { BaseEnemy } from '../base/BaseEnemy.js';

// Speed lost per second while recovering (exponential drift-out).
const RECOVER_DRAG = 2.5;

/**
 * Closes to RAM_ENGAGE_DISTANCE, stops and winds up behind a charge lane
 * telegraph, charges straight, then drifts while it recovers.
 * States: approach → windup → charge → recover → approach.
 */
export class Ram extends BaseEnemy {
  constructor(system, config = {}) {
    super(system, config);
    this.type = 'ram';
    this.state = 'approach';
    this.stateTimer = 0;
    this.chargeAngle = 0;
    this.telegraph = null;
    this.destroyed = false;
    this.movementStrategy = 'linear';

    if (Object.keys(config).length > 0) {
      this.initialize(config);
    }
  }

  initialize(config = {}) {
    this.resetForPool();
    super.initialize(config);

    this.radius = config.radius ?? RAM_CONFIG.radius;
    this.maxHealth = config.maxHealth ?? config.health ?? RAM_CONFIG.health;
    this.health = this.maxHealth;
    this.contactDamage = config.contactDamage ?? RAM_CONFIG.contactDamage;
    this.movementStrategy = (
      config.components ?? RAM_COMPONENTS
    ).movement.strategy;
    this.destroyed = false;
    return this;
  }

  get approachSpeed() {
    return this.movementConfig?.maxSpeed ?? RAM_APPROACH_SPEED;
  }

  get chargeSpeed() {
    return this.movementConfig?.chargeSpeed ?? RAM_CHARGE_SPEED;
  }

  /** 0..1: how lit the lens is — rises through the windup, full in the charge. */
  get telegraphRatio() {
    if (this.state === 'charge') return 1;
    if (this.state !== 'windup') return 0;
    return Math.min(1, 1 - this.stateTimer / RAM_WINDUP_SECONDS);
  }

  onUpdate(deltaTime) {
    if (!(deltaTime > 0) || !this.alive) return;

    const target = this.system?.getCachedPlayer?.()?.position ?? null;
    this.stateTimer -= deltaTime;

    switch (this.state) {
      case 'approach':
        this.updateApproach(target);
        break;
      case 'windup':
        this.updateWindup(target, deltaTime);
        break;
      case 'charge':
        if (this.stateTimer <= 0) this.setState('recover', RAM_RECOVER_SECONDS);
        break;
      case 'recover': {
        const drag = Math.exp(-RECOVER_DRAG * deltaTime);
        this.vx *= drag;
        this.vy *= drag;
        if (this.stateTimer <= 0) this.setState('approach', 0);
        break;
      }
      default:
        this.setState('approach', 0);
    }
  }

  updateApproach(target) {
    if (!target) return;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.hypot(dx, dy) || 1;
    this.rotation = Math.atan2(dy, dx);

    if (distance <= RAM_ENGAGE_DISTANCE) {
      this.beginWindup();
      return;
    }
    this.vx = (dx / distance) * this.approachSpeed;
    this.vy = (dy / distance) * this.approachSpeed;
  }

  beginWindup() {
    this.vx = 0;
    this.vy = 0;
    this.chargeAngle = this.rotation;
    this.setState('windup', RAM_WINDUP_SECONDS);
    // Same lane telegraph as the Warden's charge (render3d/enemies/telegraph.js).
    this.telegraph = {
      type: 'charge',
      angle: this.chargeAngle,
      length: this.chargeSpeed * RAM_CHARGE_SECONDS,
      duration: RAM_WINDUP_SECONDS,
      timer: RAM_WINDUP_SECONDS,
    };
    this.getEventBus()?.emit?.('boss-telegraph', {
      enemy: this,
      enemyId: this.id,
      telegraph: this.telegraph,
    });
  }

  updateWindup(target, deltaTime) {
    // Keep aiming through the windup; the lane follows the player.
    if (target) {
      this.chargeAngle = Math.atan2(target.y - this.y, target.x - this.x);
      this.rotation = this.chargeAngle;
    }
    if (this.telegraph) {
      this.telegraph.angle = this.chargeAngle;
      this.telegraph.timer = Math.max(0, this.telegraph.timer - deltaTime);
    }
    if (this.stateTimer > 0) return;

    this.telegraph = null;
    this.vx = Math.cos(this.chargeAngle) * this.chargeSpeed;
    this.vy = Math.sin(this.chargeAngle) * this.chargeSpeed;
    this.setState('charge', RAM_CHARGE_SECONDS);
    this.getEventBus()?.emit?.('ram-charged', {
      enemy: this,
      enemyId: this.id,
      position: { x: this.x, y: this.y },
    });
  }

  setState(state, duration) {
    this.state = state;
    this.stateTimer = duration;
  }

  onDestroyed(source, context = {}) {
    this.destroyed = true;
    this.telegraph = null;
    super.onDestroyed(source, context);
  }

  resetForPool() {
    super.resetForPool();
    this.state = 'approach';
    this.stateTimer = 0;
    this.chargeAngle = 0;
    this.telegraph = null;
    this.destroyed = false;
  }
}

export default Ram;
