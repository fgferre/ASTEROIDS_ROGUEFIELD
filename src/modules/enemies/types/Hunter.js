import { ENEMY_TYPES } from '../../../core/GameConstants.js';
import RandomService from '../../../core/RandomService.js';
import { BaseEnemy } from '../base/BaseEnemy.js';

const HUNTER_DEFAULTS = ENEMY_TYPES?.hunter ?? {};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalize(x, y) {
  const length = Math.hypot(x, y);
  if (length === 0) {
    return { length: 0, nx: 0, ny: 0 };
  }
  return { length, nx: x / length, ny: y / length };
}

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

    if (Object.keys(config).length > 0) {
      this.initialize(config);
    }
  }

  initialize(config = {}) {
    this.resetForPool();
    super.initialize(config);

    const defaults = ENEMY_TYPES?.hunter ?? {};

    this.radius = config.radius ?? defaults.radius ?? 16;
    this.maxHealth = config.maxHealth ?? config.health ?? defaults.health ?? 48;
    this.health = config.health ?? this.maxHealth;

    this.preferredDistance =
      config.preferredDistance ?? defaults.preferredDistance ?? 175;
    this.maxSpeed = config.maxSpeed ?? defaults.speed ?? 120;
    this.acceleration = config.acceleration ?? defaults.acceleration ?? 220;
    this.projectileSpeed =
      config.projectileSpeed ?? defaults.projectileSpeed ?? 420;
    this.projectileDamage =
      config.projectileDamage ?? defaults.projectileDamage ?? 12;
    this.fireRange = config.fireRange ?? defaults.fireRange ?? 520;
    this.fireSpread = config.fireSpread ?? defaults.fireSpread ?? 0;

    this.burstCount = config.burstCount ?? defaults.burstCount ?? 3;
    this.burstInterval = config.burstInterval ?? defaults.burstInterval ?? 3.5;
    this.burstDelay = config.burstDelay ?? defaults.burstDelay ?? 0.15;
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

    const player =
      this.system && typeof this.system.getCachedPlayer === 'function'
        ? this.system.getCachedPlayer()
        : null;
    const playerPosition =
      this.system && typeof this.system.getPlayerPositionSnapshot === 'function'
        ? this.system.getPlayerPositionSnapshot(player)
        : player?.position;

    if (!playerPosition) {
      this.applyIdleDamping(deltaTime);
      return;
    }

    const dx = playerPosition.x - this.x;
    const dy = playerPosition.y - this.y;
    const { length: distance, nx, ny } = normalize(dx, dy);

    this.updateOrbitVelocity(nx, ny, distance, deltaTime);
    this.updateRotationTowardsVelocity(nx, ny);
    this.updateBurstCycle(deltaTime, player, playerPosition, distance);
  }

  applyIdleDamping(deltaTime) {
    const damping = 0.98 ** deltaTime;
    this.vx *= damping;
    this.vy *= damping;
  }

  updateOrbitVelocity(nx, ny, distance, deltaTime) {
    const targetDistance = this.preferredDistance;
    const radialError = distance - targetDistance;
    const radialGain = this.acceleration * 0.6;
    const tangentialGain = this.acceleration * 0.8;

    const radialAccel = clamp(radialError * 1.5, -this.acceleration, this.acceleration);
    const tangentX = -ny * this.orbitDirection;
    const tangentY = nx * this.orbitDirection;

    const ax = nx * radialAccel + tangentX * tangentialGain;
    const ay = ny * radialAccel + tangentY * tangentialGain;

    this.vx += ax * deltaTime;
    this.vy += ay * deltaTime;

    const speed = Math.hypot(this.vx, this.vy);
    const maxSpeed = Math.max(40, this.maxSpeed || 0);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      this.vx *= scale;
      this.vy *= scale;
    }
  }

  updateRotationTowardsVelocity(nx, ny) {
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 0.01) {
      this.rotation = Math.atan2(this.vy, this.vx);
      return;
    }

    if (nx !== 0 || ny !== 0) {
      const desiredAngle = Math.atan2(ny, nx);
      const smoothing = 0.12;
      const angleDiff = ((desiredAngle - this.rotation + Math.PI) % (Math.PI * 2)) - Math.PI;
      this.rotation += angleDiff * smoothing;
    }
  }

  updateBurstCycle(deltaTime, player, playerPosition, distance) {
    if (this.burstShotsRemaining > 0) {
      this.burstDelayTimer -= deltaTime;
      if (this.burstDelayTimer <= 0) {
        this.fireAtPlayer(player, playerPosition, distance);
        this.burstShotsRemaining -= 1;
        if (this.burstShotsRemaining > 0) {
          this.burstDelayTimer = this.burstDelay;
        } else {
          this.burstCooldown = this.burstInterval;
        }
      }
      return;
    }

    this.burstCooldown -= deltaTime;
    if (this.burstCooldown > 0) {
      return;
    }

    if (this.fireRange && distance > this.fireRange) {
      this.burstCooldown = Math.max(this.burstInterval * 0.5, this.randomRange(0.5, 1.5) * this.burstInterval);
      return;
    }

    this.startBurst();
    this.fireAtPlayer(player, playerPosition, distance);
    this.burstShotsRemaining -= 1;
    this.burstDelayTimer = this.burstDelay;
  }

  startBurst() {
    this.burstShotsRemaining = Math.max(1, Math.floor(this.burstCount));
    this.currentBurstId += 1;
    this.orbitDirection *= this.randomDirection();
  }

  fireAtPlayer(player, playerPosition, distance) {
    const projectileSpeed = Math.max(60, this.projectileSpeed || 0);
    const playerVelocity = this.extractPlayerVelocity(player);
    const leadTime = projectileSpeed > 0 ? distance / projectileSpeed : 0;

    const predictedX = playerPosition.x + playerVelocity.vx * leadTime;
    const predictedY = playerPosition.y + playerVelocity.vy * leadTime;
    let aimX = predictedX - this.x;
    let aimY = predictedY - this.y;

    const { length: aimLength } = normalize(aimX, aimY);
    if (aimLength === 0) {
      aimX = playerPosition.x - this.x;
      aimY = playerPosition.y - this.y;
    }

    let angle = Math.atan2(aimY, aimX);
    const spread = Math.abs(this.fireSpread || 0);
    const randomSource = this.aimRandom || this.random;
    if (spread > 0 && randomSource && typeof randomSource.range === 'function') {
      angle += randomSource.range(-spread, spread);
    }

    const vx = Math.cos(angle) * projectileSpeed;
    const vy = Math.sin(angle) * projectileSpeed;

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
        burst: {
          id: this.currentBurstId,
          shotsRemaining: this.burstShotsRemaining,
          total: Math.max(1, Math.floor(this.burstCount)),
        },
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
    this.maneuverRandom = null;
    this.aimRandom = null;

    this.preferredDistance = HUNTER_DEFAULTS.preferredDistance ?? 175;
    this.maxSpeed = HUNTER_DEFAULTS.speed ?? 120;
    this.acceleration = HUNTER_DEFAULTS.acceleration ?? 220;
    this.projectileSpeed = HUNTER_DEFAULTS.projectileSpeed ?? 420;
    this.projectileDamage = HUNTER_DEFAULTS.projectileDamage ?? 12;
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
  }
}

export default Hunter;
