import {
  HUNTER_COMPONENTS,
  HUNTER_CONFIG,
} from '../../../data/enemies/hunter.js';
import { ENEMY_EFFECT_COLORS } from '../../../core/GameConstants.js';
import RandomService from '../../../core/RandomService.js';
import { BaseEnemy } from '../base/BaseEnemy.js';
import { NeonGraphics } from '../../../utils/NeonGraphics.js';

const HUNTER_DEFAULTS = HUNTER_CONFIG ?? {};

export class Hunter extends BaseEnemy {
  constructor(system, config = {}) {
    super(system, config);
    this.type = 'hunter';

    this.random = null;
    this.maneuverRandom = null;
    this.aimRandom = null;

    this.preferredDistance = HUNTER_DEFAULTS.preferredDistance ?? 175;
    this.maxSpeed = HUNTER_DEFAULTS.speed ?? 120;
    this.acceleration = HUNTER_DEFAULTS.acceleration ?? 220;
    this.projectileSpeed = HUNTER_DEFAULTS.projectileSpeed ?? 420;
    this.projectileDamage = HUNTER_DEFAULTS.projectileDamage ?? 12;
    this.projectileLifetime = HUNTER_DEFAULTS.projectileLifetime ?? 1.5;
    this.fireRange = HUNTER_DEFAULTS.fireRange ?? 520;
    this.fireSpread = HUNTER_DEFAULTS.fireSpread ?? 0;

    this.burstCount = HUNTER_DEFAULTS.burstCount ?? 3;
    this.burstInterval = HUNTER_DEFAULTS.burstInterval ?? 3.5;
    this.burstDelay = HUNTER_DEFAULTS.burstDelay ?? 0.15;
    this.burstCooldown = this.burstInterval;
    this.burstShotsRemaining = 0;
    this.burstDelayTimer = 0;
    this.currentBurstId = 0;

    this.orbitDirection = 1;
    this.destroyed = false;
    this.turretAngle = this.rotation;
    this.weaponState = {};
    this.movementStrategy = 'orbit';
    this.renderStrategy = 'procedural-diamond';
    this.useComponents = false;

    if (Object.keys(config).length > 0) {
      this.initialize(config);
    }
  }

  initialize(config = {}) {
    this.resetForPool();
    super.initialize(config);

    const componentConfig = config.components ?? HUNTER_COMPONENTS;
    if (componentConfig) {
      this.weaponState = this.weaponState || {};
      this.movementStrategy = componentConfig?.movement?.strategy || 'orbit';
      this.renderStrategy =
        componentConfig?.render?.strategy || 'procedural-diamond';
      this.weaponPattern =
        componentConfig?.weapon?.pattern || this.weaponPattern;
      if (componentConfig?.movement?.orbitDirection) {
        this.orbitDirection = componentConfig.movement.orbitDirection;
      }
    }

    this.radius = config.radius ?? HUNTER_DEFAULTS.radius ?? 16;
    this.maxHealth =
      config.maxHealth ?? config.health ?? HUNTER_DEFAULTS.health ?? 48;
    this.health = config.health ?? this.maxHealth;

    this.preferredDistance =
      config.preferredDistance ?? HUNTER_DEFAULTS.preferredDistance ?? 175;
    this.maxSpeed = config.maxSpeed ?? HUNTER_DEFAULTS.speed ?? 120;
    this.acceleration =
      config.acceleration ?? HUNTER_DEFAULTS.acceleration ?? 220;
    this.projectileSpeed =
      config.projectileSpeed ?? HUNTER_DEFAULTS.projectileSpeed ?? 420;
    this.projectileDamage =
      config.projectileDamage ?? HUNTER_DEFAULTS.projectileDamage ?? 12;
    this.projectileLifetime =
      config.projectileLifetime ?? HUNTER_DEFAULTS.projectileLifetime ?? 1.5;
    this.fireRange = config.fireRange ?? HUNTER_DEFAULTS.fireRange ?? 520;
    this.fireSpread = config.fireSpread ?? HUNTER_DEFAULTS.fireSpread ?? 0;

    this.burstCount = config.burstCount ?? HUNTER_DEFAULTS.burstCount ?? 3;
    this.burstInterval =
      config.burstInterval ?? HUNTER_DEFAULTS.burstInterval ?? 3.5;
    this.burstDelay = config.burstDelay ?? HUNTER_DEFAULTS.burstDelay ?? 0.15;
    this.burstCooldown = this.randomRange(0.5, this.burstInterval);
    this.burstShotsRemaining = 0;
    this.burstDelayTimer = 0;
    this.currentBurstId = 0;

    this.random = this.resolveRandom({ ...config, id: this.id });
    this.aimRandom = this.random?.fork
      ? this.random.fork('hunter:aim')
      : this.random;
    this.maneuverRandom = this.random?.fork
      ? this.random.fork('hunter:maneuver')
      : this.random;

    this.orbitDirection = config.orbitDirection ?? this.randomDirection();
    this.orbitPhase = config.orbitPhase ?? this.randomPhase();
    this.destroyed = false;
    const turretAngle =
      Number.isFinite(config.turretAngle) && config.turretAngle !== null
        ? config.turretAngle
        : this.rotation;
    this.turretAngle = Number.isFinite(turretAngle) ? turretAngle : 0;

    return this;
  }

  resolveRandom(config = {}) {
    if (config.random && typeof config.random.float === 'function') {
      return config.random;
    }

    if (this.system && typeof this.system.getRandomScope === 'function') {
      const scope = config.randomScope || 'hunter';
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

  randomDirection() {
    const randomSource = this.maneuverRandom || this.random;
    if (randomSource && typeof randomSource.chance === 'function') {
      return randomSource.chance(0.5) ? 1 : -1;
    }
    return 1;
  }

  randomPhase() {
    const randomSource = this.maneuverRandom || this.random;
    if (randomSource && typeof randomSource.range === 'function') {
      return randomSource.range(0, Math.PI * 2);
    }
    return 0;
  }

  randomRange(min, max) {
    const randomSource = this.maneuverRandom || this.random;
    if (randomSource && typeof randomSource.range === 'function') {
      return randomSource.range(min, max);
    }
    return (min + max) * 0.5;
  }

  onUpdate(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    if (!this.useComponents || !this.components?.size) {
      // Fallback: Basic burst firing logic (for testing)
      const player =
        this.system?.getCachedPlayer?.() ||
        this.system?.getPlayerPositionSnapshot?.();

      if (player && player.position) {
        const dx = player.position.x - this.x;
        const dy = player.position.y - this.y;
        const distance = Math.hypot(dx, dy);

        this.turretAngle = Math.atan2(dy, dx);

        this.burstCooldown = Math.max(0, (this.burstCooldown || 0) - deltaTime);
        this.burstDelayTimer = Math.max(
          0,
          (this.burstDelayTimer || 0) - deltaTime
        );

        if (this.burstCooldown <= 0 && distance <= (this.fireRange || 400)) {
          if (this.burstShotsRemaining > 0 && this.burstDelayTimer <= 0) {
            this.burstShotsRemaining--;
            this.burstDelayTimer = this.burstInterval || 0.1;

            globalThis.gameEvents?.emit('enemy-fired', {
              source: this,
              position: { x: this.x, y: this.y },
              velocity: {
                vx: Math.cos(this.turretAngle) * (this.projectileSpeed || 400),
                vy: Math.sin(this.turretAngle) * (this.projectileSpeed || 400),
              },
              damage: this.projectileDamage || 20,
              lifetime: this.projectileLifetime || 2.5,
            });

            if (this.burstShotsRemaining <= 0) {
              this.burstCooldown = this.burstCooldownTime || 2.0;
              this.burstShotsRemaining = this.burstCount || 3;
            }
          }
        }
      }
      return;
    }
  }
  draw(ctx) {
    if (!ctx) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    // Diamond/Aggressive shape for Hunter
    const path = new Path2D();
    const r = this.radius;
    path.moveTo(r, 0);
    path.lineTo(0, r * 0.8);
    path.lineTo(-r, 0);
    path.lineTo(0, -r * 0.8);
    path.closePath();

    // Neon Red/Orange
    NeonGraphics.drawShape(ctx, path, '#FF4400', 2.0);

    ctx.restore();
  }

  onDraw(ctx) {
    if (!this.useComponents || !this.components?.size) {
      // Fallback: Generate payload without components (for testing)
      return {
        type: 'hunter',
        id: this.id,
        x: this.x,
        y: this.y,
        radius: this.radius,
        rotation: this.rotation || 0,
        turretAngle: this.turretAngle || 0,
        colors: {
          body: ENEMY_EFFECT_COLORS.hunter.body,
          turret: ENEMY_EFFECT_COLORS.hunter.turret,
        },
      };
    }

    // RenderComponent handles drawing via BaseEnemy.draw()
    return;
  }

  onDestroyed(source) {
    this.destroyed = true;
    super.onDestroyed(source);
  }

  resetForPool() {
    super.resetForPool();

    this.random = null;
    this.maneuverRandom = null;
    this.aimRandom = null;

    this.preferredDistance = HUNTER_DEFAULTS.preferredDistance ?? 175;
    this.maxSpeed = HUNTER_DEFAULTS.speed ?? 120;
    this.acceleration = HUNTER_DEFAULTS.acceleration ?? 220;
    this.projectileSpeed = HUNTER_DEFAULTS.projectileSpeed ?? 420;
    this.projectileDamage = HUNTER_DEFAULTS.projectileDamage ?? 12;
    this.projectileLifetime = HUNTER_DEFAULTS.projectileLifetime ?? 1.5;
    this.fireRange = HUNTER_DEFAULTS.fireRange ?? 520;
    this.fireSpread = HUNTER_DEFAULTS.fireSpread ?? 0;

    this.burstCount = HUNTER_DEFAULTS.burstCount ?? 3;
    this.burstInterval = HUNTER_DEFAULTS.burstInterval ?? 3.5;
    this.burstDelay = HUNTER_DEFAULTS.burstDelay ?? 0.15;
    this.burstCooldown = this.burstInterval;
    this.burstShotsRemaining = 0;
    this.burstDelayTimer = 0;
    this.currentBurstId = 0;

    this.orbitDirection = 1;
    this.orbitPhase = 0;
    this.destroyed = false;
    this.turretAngle = 0;
  }
}

export default Hunter;
