import {
  WEAVER_COMPONENTS,
  WEAVER_CONFIG,
  WEAVER_LAY_INTERVAL,
  WEAVER_MAX_TETHERS,
  WEAVER_SPIN_SPEED,
} from '../../../data/enemies/weaver.js';
import { BaseEnemy } from '../base/BaseEnemy.js';

// How long the arms stay lit after laying a Tether.
const LAY_GLOW_SECONDS = 0.35;

/** Orbits the player without shooting and lays a Tether every few seconds. */
export class Weaver extends BaseEnemy {
  constructor(system, config = {}) {
    super(system, config);
    this.type = 'weaver';
    this.random = null;
    this.layTimer = WEAVER_LAY_INTERVAL;
    this.layGlow = 0;
    this.spin = 0;
    this.tethers = [];
    this.orbitDirection = 1;
    this.destroyed = false;
    this.movementStrategy = 'orbit';
    this.renderStrategy = 'procedural';

    if (Object.keys(config).length > 0) {
      this.initialize(config);
    }
  }

  initialize(config = {}) {
    this.resetForPool();
    super.initialize(config);

    this.radius = config.radius ?? WEAVER_CONFIG.radius;
    this.maxHealth = config.maxHealth ?? config.health ?? WEAVER_CONFIG.health;
    this.health = this.maxHealth;
    this.movementStrategy = (
      config.components ?? WEAVER_COMPONENTS
    ).movement.strategy;
    this.random = this.resolveRandom({ ...config, id: this.id });
    this.orbitDirection = this.random.chance(0.5) ? 1 : -1;
    this.spin = this.random.range(0, Math.PI * 2);
    this.layTimer = WEAVER_LAY_INTERVAL;
    this.destroyed = false;
    return this;
  }

  /** Tethers this Weaver laid that are still on the field. */
  get liveTetherCount() {
    this.tethers = this.tethers.filter(
      ({ mine, id }) => mine.alive && mine.id === id
    );
    return this.tethers.length;
  }

  onUpdate(deltaTime) {
    if (!(deltaTime > 0) || !this.alive) return;

    this.spin += WEAVER_SPIN_SPEED * deltaTime * this.orbitDirection;
    this.layGlow = Math.max(0, this.layGlow - deltaTime / LAY_GLOW_SECONDS);
    this.layTimer -= deltaTime;
    if (this.layTimer > 0) return;

    this.layTimer += WEAVER_LAY_INTERVAL;
    if (this.liveTetherCount >= WEAVER_MAX_TETHERS) return;

    const mine = this.spawnChild('mine', {
      x: this.x,
      y: this.y,
      random: this.random.fork(`weaver:tether:${this.tethers.length}`),
    });
    if (!mine) return;
    this.tethers.push({ mine, id: mine.id });
    this.layGlow = 1;
    this.getEventBus()?.emit?.('weaver-tether-laid', {
      enemy: this,
      enemyId: this.id,
      position: { x: this.x, y: this.y },
    });
  }

  onDestroyed(source, context = {}) {
    this.destroyed = true;
    super.onDestroyed(source, context);
  }

  resetForPool() {
    super.resetForPool();
    this.random = null;
    this.layTimer = WEAVER_LAY_INTERVAL;
    this.layGlow = 0;
    this.spin = 0;
    this.tethers = [];
    this.orbitDirection = 1;
    this.destroyed = false;
  }
}

export default Weaver;
