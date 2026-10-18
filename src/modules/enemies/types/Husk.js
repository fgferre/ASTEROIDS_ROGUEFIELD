import {
  HUSK_COMPONENTS,
  HUSK_CONFIG,
  HUSK_SPLIT_COUNT,
  HUSK_SPLIT_SPEED,
} from '../../../data/enemies/husk.js';
import { BaseEnemy } from '../base/BaseEnemy.js';

const TAU = Math.PI * 2;

/** Slow heavy drifter; on death it cracks open and releases Motes. */
export class Husk extends BaseEnemy {
  constructor(system, config = {}) {
    super(system, config);
    this.type = 'husk';
    this.random = null;
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

    this.radius = config.radius ?? HUSK_CONFIG.radius;
    this.maxHealth = config.maxHealth ?? config.health ?? HUSK_CONFIG.health;
    this.health = this.maxHealth;
    this.contactDamage = config.contactDamage ?? HUSK_CONFIG.contactDamage;
    this.movementStrategy = (
      config.components ?? HUSK_COMPONENTS
    ).movement.strategy;
    this.random = this.resolveRandom({ ...config, id: this.id });
    this.destroyed = false;
    return this;
  }

  /** 0 at full health, 1 near death — the seams glow brighter as it rises. */
  get damageRatio() {
    return this.maxHealth > 0 ? 1 - this.health / this.maxHealth : 0;
  }

  onDestroyed(source, context = {}) {
    if (this.destroyed) return;
    this.destroyed = true;
    super.onDestroyed(source, context);
    this.split();
  }

  split() {
    const offset = this.random.range(0, TAU);
    for (let i = 0; i < HUSK_SPLIT_COUNT; i += 1) {
      const angle = offset + (i * TAU) / HUSK_SPLIT_COUNT;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      this.spawnChild('drone', {
        x: this.x + dx * this.radius * 0.6,
        y: this.y + dy * this.radius * 0.6,
        vx: dx * HUSK_SPLIT_SPEED,
        vy: dy * HUSK_SPLIT_SPEED,
        random: this.random.fork(`husk:split:${i}`),
      });
    }
  }

  resetForPool() {
    super.resetForPool();
    this.random = null;
    this.destroyed = false;
  }
}

export default Husk;
