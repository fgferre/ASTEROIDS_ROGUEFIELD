import {
  BULWARK_COMPONENTS,
  BULWARK_CONFIG,
  BULWARK_SHIELD_HALF_ARC,
} from '../../../data/enemies/bulwark.js';
import { BaseEnemy } from '../base/BaseEnemy.js';

const angleBetween = (a, b) => {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
};

/**
 * Slow approach behind a frontal shield plate (±BULWARK_SHIELD_HALF_ARC around
 * its facing, which tracks the player). Hits on the plate drain the shield
 * first; hits from behind go straight to the hull. A broken plate stays broken.
 */
export class Bulwark extends BaseEnemy {
  constructor(system, config = {}) {
    super(system, config);
    this.type = 'bulwark';
    this.facing = 0;
    this.shieldHealth = BULWARK_CONFIG.shieldHealth;
    this.maxShieldHealth = BULWARK_CONFIG.shieldHealth;
    this.shieldBroken = false;
    this.destroyed = false;
    this.movementStrategy = 'tracking';
    this.renderStrategy = 'procedural';

    if (Object.keys(config).length > 0) {
      this.initialize(config);
    }
  }

  initialize(config = {}) {
    this.resetForPool();
    super.initialize(config);

    this.radius = config.radius ?? BULWARK_CONFIG.radius;
    this.maxHealth = config.maxHealth ?? config.health ?? BULWARK_CONFIG.health;
    this.health = this.maxHealth;
    this.contactDamage = config.contactDamage ?? BULWARK_CONFIG.contactDamage;
    this.maxShieldHealth = config.shieldHealth ?? BULWARK_CONFIG.shieldHealth;
    this.shieldHealth = this.maxShieldHealth;
    this.shieldBroken = false;
    this.movementStrategy = (
      config.components ?? BULWARK_COMPONENTS
    ).movement.strategy;
    this.random = this.resolveRandom({ ...config, id: this.id });
    this.destroyed = false;
    return this;
  }

  onUpdate() {
    const target = this.system?.getCachedPlayer?.()?.position;
    if (target) {
      this.facing = Math.atan2(target.y - this.y, target.x - this.x);
    }
  }

  /** True when a hit from `point` lands on the intact shield plate. */
  isShielded(point) {
    if (this.shieldBroken || !point) return false;
    const angle = Math.atan2(point.y - this.y, point.x - this.x);
    return angleBetween(angle, this.facing) <= BULWARK_SHIELD_HALF_ARC;
  }

  /**
   * `source.hitPosition` (the bullet's position, from CombatSystem) decides
   * front or back. Damage with no position goes to the hull.
   */
  takeDamage(amount, source = null) {
    const hit = source?.hitPosition;
    if (!this.alive || !(amount > 0) || !this.isShielded(hit)) {
      return super.takeDamage(amount, source);
    }

    const absorbed = Math.min(this.shieldHealth, amount);
    this.shieldHealth -= absorbed;
    if (this.shieldHealth <= 0) {
      this.shieldHealth = 0;
      this.shieldBroken = true;
    }
    this.getEventBus()?.emit?.('shield-deflected', {
      position: { x: hit.x, y: hit.y },
      normal: { x: Math.cos(this.facing), y: Math.sin(this.facing) },
      level: 0,
      intensity: this.shieldBroken ? 2 : 0.8,
    });

    const overflow = amount - absorbed;
    return overflow > 0 ? super.takeDamage(overflow, source) : false;
  }

  onDestroyed(source, context = {}) {
    this.destroyed = true;
    super.onDestroyed(source, context);
  }

  resetForPool() {
    super.resetForPool();
    this.facing = 0;
    this.shieldHealth = BULWARK_CONFIG.shieldHealth;
    this.maxShieldHealth = BULWARK_CONFIG.shieldHealth;
    this.shieldBroken = false;
    this.destroyed = false;
  }
}

export default Bulwark;
