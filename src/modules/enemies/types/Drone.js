import { DRONE_COMPONENTS, DRONE_CONFIG } from '../../../data/enemies/drone.js';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  ENEMY_EFFECT_COLORS,
  ENEMY_RENDER_PRESETS,
} from '../../../core/GameConstants.js';
import RandomService from '../../../core/RandomService.js';
import { BaseEnemy } from '../base/BaseEnemy.js';
import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';
import { NeonGraphics } from '../../../utils/NeonGraphics.js';

const DRONE_DEFAULTS = DRONE_CONFIG ?? {};

export class Drone extends BaseEnemy {
  constructor(system, config = {}) {
    super(system, config);
    this.type = 'drone';

    this.random = null;
    this.aimRandom = null;
    this.maneuverRandom = null;

    this.fireTimer = 0;
    this.fireInterval = DRONE_DEFAULTS.fireRate ?? 2;
    this.fireVariance = DRONE_DEFAULTS.fireVariance ?? 0;
    this.fireSpread = DRONE_DEFAULTS.fireSpread ?? 0;
    this.projectileSpeed = DRONE_DEFAULTS.projectileSpeed ?? 340;
    this.projectileDamage = DRONE_DEFAULTS.projectileDamage ?? 15;
    this.projectileLifetime = DRONE_DEFAULTS.projectileLifetime ?? 2.0;
    this.targetingRange = DRONE_DEFAULTS.targetingRange ?? 460;
    this.maxSpeed = DRONE_DEFAULTS.speed ?? 180;
    this.acceleration = DRONE_DEFAULTS.acceleration ?? 220;
    this.contactDamage = DRONE_DEFAULTS.contactDamage ?? 12;
    this.destroyed = false;
    this._renderThrust = 0;
    this.weaponState = {};
    this.movementStrategy = 'tracking';
    this.renderStrategy = 'procedural-triangle';
    this.useComponents = false;

    if (Object.keys(config).length > 0) {
      this.initialize(config);
    }
  }

  initialize(config = {}) {
    this.resetForPool();
    super.initialize(config);

    const componentConfig = config.components ?? DRONE_COMPONENTS;
    if (componentConfig) {
      this.weaponState = this.weaponState || {};
      this.movementStrategy = componentConfig?.movement?.strategy || 'tracking';
      this.renderStrategy =
        componentConfig?.render?.strategy || 'procedural-triangle';
      this.weaponPattern =
        componentConfig?.weapon?.pattern || this.weaponPattern;
    }

    this.radius = config.radius ?? DRONE_DEFAULTS.radius ?? 12;
    this.maxHealth =
      config.maxHealth ?? config.health ?? DRONE_DEFAULTS.health ?? 30;
    this.health = config.health ?? this.maxHealth;
    this.contactDamage =
      config.contactDamage ?? DRONE_DEFAULTS.contactDamage ?? 12;

    this.maxSpeed = config.maxSpeed ?? DRONE_DEFAULTS.speed ?? 180;
    this.acceleration =
      config.acceleration ?? DRONE_DEFAULTS.acceleration ?? 220;

    this.projectileSpeed =
      config.projectileSpeed ?? DRONE_DEFAULTS.projectileSpeed ?? 340;
    this.projectileDamage =
      config.projectileDamage ?? DRONE_DEFAULTS.projectileDamage ?? 15;
    this.projectileLifetime =
      config.projectileLifetime ?? DRONE_DEFAULTS.projectileLifetime ?? 2.0;

    this.fireInterval = config.fireRate ?? DRONE_DEFAULTS.fireRate ?? 2;
    this.fireVariance = config.fireVariance ?? DRONE_DEFAULTS.fireVariance ?? 0;
    this.fireSpread = config.fireSpread ?? DRONE_DEFAULTS.fireSpread ?? 0;
    this.targetingRange =
      config.targetingRange ?? DRONE_DEFAULTS.targetingRange ?? 460;

    this.random = this.resolveRandom({ ...config, id: this.id });
    this.aimRandom = this.random?.fork
      ? this.random.fork('drone:aim')
      : this.random;
    this.maneuverRandom = this.random?.fork
      ? this.random.fork('drone:maneuver')
      : this.random;

    this.fireTimer = 0;
    this.destroyed = false;
    this._renderThrust = 0;

    if (Number.isFinite(config.x)) {
      this.x = config.x;
    }
    if (Number.isFinite(config.y)) {
      this.y = config.y;
    }

    const boundsWidth = Number.isFinite(GAME_WIDTH) ? GAME_WIDTH : 0;
    const boundsHeight = Number.isFinite(GAME_HEIGHT) ? GAME_HEIGHT : 0;
    const inBounds =
      this.x >= 0 &&
      this.x <= boundsWidth &&
      this.y >= 0 &&
      this.y <= boundsHeight;

    GameDebugLogger.log('SPAWN', 'Drone initialized', {
      id: this.id,
      position: { x: Math.round(this.x ?? 0), y: Math.round(this.y ?? 0) },
      wave: this.wave,
      isInBounds: inBounds,
    });

    const outOfPlayableBounds =
      this.x < -100 ||
      this.x > boundsWidth + 100 ||
      this.y < -100 ||
      this.y > boundsHeight + 100;

    if (outOfPlayableBounds) {
      GameDebugLogger.log('ERROR', 'Drone spawned out of bounds', {
        position: { x: this.x, y: this.y },
        bounds: { width: boundsWidth, height: boundsHeight },
      });

      const centerX = boundsWidth > 0 ? boundsWidth / 2 : 0;
      const centerY = boundsHeight > 0 ? boundsHeight / 2 : 0;
      const offsetGenerator =
        this.random && typeof this.random.range === 'function'
          ? () => this.random.range(-100, 100)
          : () => (Math.random() - 0.5) * 200;
      this.x = centerX + offsetGenerator();
      this.y = centerY + offsetGenerator();

      GameDebugLogger.log('STATE', 'Drone position corrected to center area', {
        newPosition: {
          x: Math.round(this.x ?? 0),
          y: Math.round(this.y ?? 0),
        },
      });
    }

    return this;
  }

  resolveRandom(config = {}) {
    if (config.random && typeof config.random.float === 'function') {
      return config.random;
    }

    if (this.system && typeof this.system.getRandomScope === 'function') {
      const scope = config.randomScope || 'drone';
      const generator = this.system.getRandomScope(scope, {
        parentScope: config.randomParentScope || 'spawn',
        label: `enemy:${this.type}:${config.id || this.id || 'spawn'}`,
      });

      if (generator && typeof generator.fork === 'function') {
        return generator.fork(`${this.type}:core`);
      }

      return generator || null;
    }

    return new RandomService(`enemy:${this.type}`);
  }

  onUpdate(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    if (!this.useComponents || !this.components?.size) {
      // Fallback: Basic tracking movement and firing (for testing)
      const player =
        this.system?.getCachedPlayer?.() ||
        this.system?.getPlayerPositionSnapshot?.();

      if (player && player.position) {
        const dx = player.position.x - this.x;
        const dy = player.position.y - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 1 && distance <= (this.targetingRange || 460)) {
          const dirX = dx / distance;
          const dirY = dy / distance;
          const accel = (this.acceleration || 220) * deltaTime;

          this.vx = (this.vx || 0) + dirX * accel;
          this.vy = (this.vy || 0) + dirY * accel;

          const speed = Math.hypot(this.vx, this.vy);
          if (speed > (this.maxSpeed || 180)) {
            this.vx = (this.vx / speed) * this.maxSpeed;
            this.vy = (this.vy / speed) * this.maxSpeed;
          }
        }

        this.x += (this.vx || 0) * deltaTime;
        this.y += (this.vy || 0) * deltaTime;

        // Firing logic
        this.fireTimer = (this.fireTimer || 0) + deltaTime;
        const interval = this.fireInterval || 2;

        if (
          this.fireTimer >= interval &&
          distance <= (this.targetingRange || 460)
        ) {
          this.fireTimer = 0;

          const angle = Math.atan2(dy, dx);
          this.getEventBus()?.emit?.('enemy-fired', {
            source: this,
            position: { x: this.x, y: this.y },
            velocity: {
              vx: Math.cos(angle) * (this.projectileSpeed || 340),
              vy: Math.sin(angle) * (this.projectileSpeed || 340),
            },
            damage: this.projectileDamage || 15,
            lifetime: this.projectileLifetime || 2.0,
          });
        }
      }
      return;
    }
  }

  onDestroyed(source) {
    this.destroyed = true;
    super.onDestroyed(source);
  }

  draw(ctx) {
    if (!ctx) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    // Triangle shape for Drone
    const path = new Path2D();
    const r = this.radius;
    path.moveTo(r, 0);
    path.lineTo(-r * 0.6, r * 0.7);
    path.lineTo(-r * 0.6, -r * 0.7);
    path.closePath();

    // Neon Cyan
    NeonGraphics.drawShape(ctx, path, '#00FFFF', 2.0);

    ctx.restore();
  }

  onDraw(ctx) {
    if (!this.useComponents || !this.components?.size) {
      // Fallback: Generate payload without components (for testing)
      const speed = Math.hypot(this.vx || 0, this.vy || 0);
      const targetSpeedRatio = Math.min(
        1,
        speed / Math.max(1, this.maxSpeed || 180)
      );
      const smoothing = ENEMY_RENDER_PRESETS.drone?.exhaust?.smoothing ?? 0.15;

      this._renderThrust = this._renderThrust ?? 0;
      this._renderThrust =
        this._renderThrust +
        (targetSpeedRatio - this._renderThrust) * smoothing;

      return {
        type: 'drone',
        id: this.id,
        x: this.x,
        y: this.y,
        radius: this.radius,
        rotation: this.rotation || 0,
        thrust: this._renderThrust,
        colors: {
          body: ENEMY_EFFECT_COLORS.drone.body,
          thrust: ENEMY_EFFECT_COLORS.drone.thrust,
        },
      };
    }

    // RenderComponent handles drawing via BaseEnemy.draw()
    return;
  }

  resetForPool() {
    super.resetForPool();

    this.random = null;
    this.aimRandom = null;
    this.maneuverRandom = null;

    this.fireTimer = 0;
    this.fireInterval = DRONE_DEFAULTS.fireRate ?? 2;
    this.fireVariance = DRONE_DEFAULTS.fireVariance ?? 0;
    this.fireSpread = DRONE_DEFAULTS.fireSpread ?? 0;
    this.projectileSpeed = DRONE_DEFAULTS.projectileSpeed ?? 340;
    this.projectileDamage = DRONE_DEFAULTS.projectileDamage ?? 15;
    this.projectileLifetime = DRONE_DEFAULTS.projectileLifetime ?? 2.0;
    this.targetingRange = DRONE_DEFAULTS.targetingRange ?? 460;
    this.maxSpeed = DRONE_DEFAULTS.speed ?? 180;
    this.acceleration = DRONE_DEFAULTS.acceleration ?? 220;
    this.contactDamage = DRONE_DEFAULTS.contactDamage ?? 12;
    this.destroyed = false;
    this._renderThrust = 0;
  }
}

export default Drone;
