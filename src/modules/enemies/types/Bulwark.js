import {
  BULWARK_COMPONENTS,
  BULWARK_CONFIG,
  BULWARK_SHIELD_HALF_ARC,
} from '../../../content/enemies/bulwark.js';
import { BaseEnemy } from '../base/BaseEnemy.js';
import {
  absorbFrontalHit,
  faceTarget,
  hitsFrontalShield,
} from '../base/frontalShield.js';

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
    faceTarget(this);
  }

  /**
   * `source.hitPosition` (the bullet's position, from CombatSystem) decides
   * front or back. Damage with no position goes to the hull.
   */
  takeDamage(amount, source = null) {
    const hit = source?.hitPosition;
    if (
      !this.alive ||
      !(amount > 0) ||
      this.isDamageBlocked() ||
      !hitsFrontalShield(this, hit, BULWARK_SHIELD_HALF_ARC)
    ) {
      return super.takeDamage(amount, source);
    }

    const overflow = absorbFrontalHit(this, amount, hit);
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
