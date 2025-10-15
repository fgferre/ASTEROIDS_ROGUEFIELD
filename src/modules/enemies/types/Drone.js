import { ENEMY_TYPES } from '../../../core/GameConstants.js';
import RandomService from '../../../core/RandomService.js';
import { BaseEnemy } from '../base/BaseEnemy.js';

const DRONE_DEFAULTS = ENEMY_TYPES?.drone ?? {};

function resolveVectorMagnitude(x, y) {
  const magnitude = Math.hypot(x, y);
  if (magnitude === 0) {
    return { magnitude: 0, nx: 0, ny: 0 };
  }
  return { magnitude, nx: x / magnitude, ny: y / magnitude };
}

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
    this.targetingRange = DRONE_DEFAULTS.targetingRange ?? 460;
    this.maxSpeed = DRONE_DEFAULTS.speed ?? 180;
    this.acceleration = DRONE_DEFAULTS.acceleration ?? 220;
    this.contactDamage = DRONE_DEFAULTS.contactDamage ?? 12;
    this.destroyed = false;

    if (Object.keys(config).length > 0) {
      this.initialize(config);
    }
  }

  initialize(config = {}) {
    this.resetForPool();
    super.initialize(config);

    const defaults = ENEMY_TYPES?.drone ?? {};

    this.radius = config.radius ?? defaults.radius ?? 12;
    this.maxHealth = config.maxHealth ?? config.health ?? defaults.health ?? 30;
    this.health = config.health ?? this.maxHealth;
    this.contactDamage = config.contactDamage ?? defaults.contactDamage ?? 12;

    this.maxSpeed = config.maxSpeed ?? defaults.speed ?? 180;
    this.acceleration = config.acceleration ?? defaults.acceleration ?? 220;

    this.projectileSpeed =
      config.projectileSpeed ?? defaults.projectileSpeed ?? 340;
    this.projectileDamage =
      config.projectileDamage ?? defaults.projectileDamage ?? 15;

    this.fireInterval = config.fireRate ?? defaults.fireRate ?? 2;
    this.fireVariance = config.fireVariance ?? defaults.fireVariance ?? 0;
    this.fireSpread = config.fireSpread ?? defaults.fireSpread ?? 0;
    this.targetingRange =
      config.targetingRange ?? defaults.targetingRange ?? 460;

    this.random = this.resolveRandom({ ...config, id: this.id });
    this.aimRandom = this.random?.fork
      ? this.random.fork('drone:aim')
      : this.random;
    this.maneuverRandom = this.random?.fork
      ? this.random.fork('drone:maneuver')
      : this.random;

    this.fireTimer = this.computeNextFireInterval();
    this.destroyed = false;

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

  computeNextFireInterval() {
    const baseInterval = Math.max(0.15, this.fireInterval || 0);
    const variance = Math.abs(this.fireVariance || 0);

    if (!variance) {
      return baseInterval;
    }

    const randomSource = this.aimRandom || this.random;
    if (!randomSource || typeof randomSource.range !== 'function') {
      return baseInterval;
    }

    const offset = randomSource.range(-variance, variance);
    return Math.max(0.15, baseInterval + offset);
  }

  onUpdate(deltaTime) {
    const player =
      this.system && typeof this.system.getCachedPlayer === 'function'
        ? this.system.getCachedPlayer()
        : null;
    const playerPosition =
      this.system && typeof this.system.getPlayerPositionSnapshot === 'function'
        ? this.system.getPlayerPositionSnapshot(player)
        : player?.position;

    if (!playerPosition) {
      this.updateDrift(deltaTime);
      return;
    }

    const dx = playerPosition.x - this.x;
    const dy = playerPosition.y - this.y;
    const { magnitude: distance, nx, ny } = resolveVectorMagnitude(dx, dy);

    this.applyThrusters(nx, ny, distance, deltaTime);
    this.updateRotationFromVelocity();
    this.handleWeaponCycle(deltaTime, player, playerPosition, distance);
  }

  updateDrift(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    const damping = 0.98 ** deltaTime;
    this.vx *= damping;
    this.vy *= damping;
  }

  applyThrusters(nx, ny, distance, deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    const canChase = !this.targetingRange || distance <= this.targetingRange;
    if (!canChase) {
      this.updateDrift(deltaTime);
      return;
    }

    const accel = this.acceleration || 0;
    this.vx += nx * accel * deltaTime;
    this.vy += ny * accel * deltaTime;

    const speed = Math.hypot(this.vx, this.vy);
    const maxSpeed = Math.max(10, this.maxSpeed || 0);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      this.vx *= scale;
      this.vy *= scale;
    }
  }

  updateRotationFromVelocity() {
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 0.001) {
      this.rotation = Math.atan2(this.vy, this.vx);
    }
  }

  handleWeaponCycle(deltaTime, player, playerPosition, distance) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    this.fireTimer -= deltaTime;
    if (this.fireTimer > 0) {
      return;
    }

    if (this.targetingRange && distance > this.targetingRange) {
      this.fireTimer = this.computeNextFireInterval();
      return;
    }

    this.fireAtPlayer(player, playerPosition, distance);
    this.fireTimer = this.computeNextFireInterval();
  }

  fireAtPlayer(player, playerPosition, distance) {
    const projectileSpeed = Math.max(60, this.projectileSpeed || 0);
    const playerVelocity = this.extractPlayerVelocity(player);

    const leadTime = projectileSpeed > 0 ? distance / projectileSpeed : 0;
    const predictedX = playerPosition.x + playerVelocity.vx * leadTime;
    const predictedY = playerPosition.y + playerVelocity.vy * leadTime;
    let aimX = predictedX - this.x;
    let aimY = predictedY - this.y;

    const { magnitude: aimDistance } = resolveVectorMagnitude(aimX, aimY);
    if (aimDistance === 0) {
      aimX = playerPosition.x - this.x;
      aimY = playerPosition.y - this.y;
    }

    const baseAngle = Math.atan2(aimY, aimX);
    const spread = Math.abs(this.fireSpread || 0);
    let finalAngle = baseAngle;
    const randomSource = this.aimRandom || this.random;
    if (spread > 0 && randomSource && typeof randomSource.range === 'function') {
      finalAngle += randomSource.range(-spread, spread);
    }

    const vx = Math.cos(finalAngle) * projectileSpeed;
    const vy = Math.sin(finalAngle) * projectileSpeed;

    this.emitEnemyFired({ vx, vy, projectileSpeed });
  }

  extractPlayerVelocity(player) {
    if (!player) {
      return { vx: 0, vy: 0 };
    }

    if (typeof player.getVelocity === 'function') {
      const velocity = player.getVelocity();
      if (
        velocity &&
        Number.isFinite(velocity.vx) &&
        Number.isFinite(velocity.vy)
      ) {
        return { vx: velocity.vx, vy: velocity.vy };
      }
    }

    if (player.velocity) {
      const { vx = 0, vy = 0 } = player.velocity;
      return {
        vx: Number.isFinite(vx) ? vx : 0,
        vy: Number.isFinite(vy) ? vy : 0,
      };
    }

    return { vx: 0, vy: 0 };
  }

  emitEnemyFired({ vx, vy, projectileSpeed }) {
    if (typeof gameEvents === 'undefined' || !gameEvents?.emit) {
      return;
    }

    gameEvents.emit('enemy-fired', {
      enemy: this,
      enemyId: this.id,
      enemyType: this.type,
      wave: this.wave,
      position: { x: this.x, y: this.y },
      velocity: { x: vx, y: vy },
      damage: this.projectileDamage,
      projectile: {
        speed: projectileSpeed,
        spread: Math.abs(this.fireSpread || 0),
      },
      source: {
        id: this.id,
        type: this.type,
        wave: this.wave,
      },
    });
  }

  onDestroyed(source) {
    this.destroyed = true;
    super.onDestroyed(source);
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
    this.targetingRange = DRONE_DEFAULTS.targetingRange ?? 460;
    this.maxSpeed = DRONE_DEFAULTS.speed ?? 180;
    this.acceleration = DRONE_DEFAULTS.acceleration ?? 220;
    this.contactDamage = DRONE_DEFAULTS.contactDamage ?? 12;
    this.destroyed = false;
  }
}

export default Drone;
