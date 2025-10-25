import { HUNTER_CONFIG } from '../../../data/enemies/hunter.js';
import {
  ENEMY_EFFECT_COLORS,
  ENEMY_RENDER_PRESETS,
} from '../../../data/constants/visual.js';
import RandomService from '../../../core/RandomService.js';
import { BaseEnemy } from '../base/BaseEnemy.js';

const HUNTER_DEFAULTS = HUNTER_CONFIG ?? {};

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

function normalizeAngle(angle) {
  if (!Number.isFinite(angle)) {
    return 0;
  }

  const twoPi = Math.PI * 2;
  let normalized = angle % twoPi;
  if (normalized <= -Math.PI) {
    normalized += twoPi;
  } else if (normalized > Math.PI) {
    normalized -= twoPi;
  }

  return normalized;
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
    this._hullGradient = null;
    this._hullGradientKey = null;

    if (Object.keys(config).length > 0) {
      this.initialize(config);
    }
  }

  initialize(config = {}) {
    this.resetForPool();
    super.initialize(config);

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
    this.turretAngle = normalizeAngle(config.turretAngle ?? this.rotation);
    this._hullGradient = null;
    this._hullGradientKey = null;

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
    const aimSolution =
      playerPosition && Number.isFinite(distance)
        ? this.computeAimSolution(player, playerPosition, distance)
        : null;
    const withinRange = !this.fireRange || distance <= this.fireRange;
    if (withinRange && aimSolution) {
      this.turretAngle = normalizeAngle(aimSolution.angle);
    }

    if (this.burstShotsRemaining > 0) {
      this.burstDelayTimer -= deltaTime;
      if (this.burstDelayTimer <= 0) {
        this.fireAtPlayer(player, playerPosition, distance, aimSolution);
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
    this.fireAtPlayer(player, playerPosition, distance, aimSolution);
    this.burstShotsRemaining -= 1;
    this.burstDelayTimer = this.burstDelay;
  }

  startBurst() {
    this.burstShotsRemaining = Math.max(1, Math.floor(this.burstCount));
    this.currentBurstId += 1;
    this.orbitDirection *= this.randomDirection();
  }

  computeAimSolution(player, playerPosition, distance) {
    if (!playerPosition) {
      return null;
    }

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

    if (aimX === 0 && aimY === 0) {
      return null;
    }

    return {
      angle: Math.atan2(aimY, aimX),
      projectileSpeed,
    };
  }

  fireAtPlayer(player, playerPosition, distance, cachedAim = null) {
    const solution =
      cachedAim || this.computeAimSolution(player, playerPosition, distance);
    if (!solution) {
      return;
    }

    const { angle: baseAngle, projectileSpeed } = solution;
    this.turretAngle = normalizeAngle(baseAngle);

    let angle = baseAngle;
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
        lifetime: this.projectileLifetime,
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

  onDraw(ctx) {
    const palette = ENEMY_EFFECT_COLORS?.hunter ?? {};
    const presets = ENEMY_RENDER_PRESETS?.hunter ?? {};
    const hullPreset = presets.hull ?? {};
    const turretPreset = presets.turret ?? {};
    const shadingPreset = presets.shading ?? {};
    const baseRadius = this.radius || HUNTER_CONFIG?.radius || 16;

    const front = baseRadius * (hullPreset.lengthMultiplier ?? 1.9);
    const rear = -front * (hullPreset.tailLengthRatio ?? 0.72);
    const halfWidth = (baseRadius * (hullPreset.widthMultiplier ?? 1.2)) / 2;
    const accentInset = baseRadius * (hullPreset.accentInsetMultiplier ?? 0.48);

    const payload = {
      type: this.type,
      id: this.id,
      position: { x: this.x, y: this.y },
      radius: baseRadius,
      rotation: this.rotation,
      turretAngle: this.turretAngle,
      colors: {
        body: palette.body,
        highlight: palette.bodyHighlight,
        shadow: palette.bodyShadow,
        accent: palette.accent,
        turret: palette.turret,
      },
    };

    if (!ctx || typeof ctx.save !== 'function') {
      return payload;
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'transparent';

    const hullGradient = this.ensureHullGradient(
      ctx,
      front,
      rear,
      palette,
      shadingPreset,
    );

    ctx.beginPath();
    ctx.moveTo(front, 0);
    ctx.lineTo(0, halfWidth);
    ctx.lineTo(rear, 0);
    ctx.lineTo(0, -halfWidth);
    ctx.closePath();
    ctx.fillStyle = hullGradient || palette.body || '#64687a';
    ctx.fill();

    const hullStrokeWidth = baseRadius * (hullPreset.strokeWidthMultiplier ?? 0.14);
    ctx.lineWidth = hullStrokeWidth;
    ctx.strokeStyle = palette.bodyShadow || '#2c2f3b';
    ctx.globalAlpha = 1;
    ctx.stroke();

    const accentFront = front - accentInset;
    const accentRear = rear + accentInset;
    const accentHalfWidth = Math.max(0, halfWidth - accentInset);
    ctx.beginPath();
    ctx.moveTo(accentFront, 0);
    ctx.lineTo(0, accentHalfWidth);
    ctx.lineTo(accentRear, 0);
    ctx.lineTo(0, -accentHalfWidth);
    ctx.closePath();
    ctx.fillStyle = palette.bodyHighlight || palette.body || '#8f94aa';
    ctx.fill();

    const accentStrokeWidth = baseRadius * (hullPreset.accentStrokeMultiplier ?? 0.1);
    ctx.lineWidth = accentStrokeWidth;
    ctx.strokeStyle = palette.accent || '#f4b1ff';
    ctx.stroke();

    const relativeTurretAngle = normalizeAngle(this.turretAngle - this.rotation);
    ctx.save();
    ctx.rotate(relativeTurretAngle);

    const turretLength = baseRadius * (turretPreset.lengthMultiplier ?? 1.25);
    const turretHalfWidth = (baseRadius * (turretPreset.widthMultiplier ?? 0.28)) / 2;
    const turretBaseRadius = baseRadius * (turretPreset.baseRadiusMultiplier ?? 0.34);
    const turretBackset = turretBaseRadius * (turretPreset.baseBacksetMultiplier ?? 0.5);

    ctx.beginPath();
    ctx.moveTo(-turretBackset, turretHalfWidth);
    ctx.lineTo(turretLength, turretHalfWidth);
    ctx.lineTo(turretLength, -turretHalfWidth);
    ctx.lineTo(-turretBackset, -turretHalfWidth);
    ctx.closePath();
    ctx.fillStyle = palette.turret || palette.bodyHighlight || '#b7a7d9';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(-turretBackset, 0, turretBaseRadius, 0, Math.PI * 2);
    ctx.fillStyle = palette.turret || palette.bodyHighlight || '#b7a7d9';
    ctx.fill();

    const barrelWidth = baseRadius * (turretPreset.barrelWidthMultiplier ?? 0.18);
    ctx.lineWidth = barrelWidth;
    ctx.strokeStyle = palette.accent || '#f4b1ff';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(turretLength, 0);
    ctx.stroke();

    const highlightPreset = turretPreset.highlight ?? {};
    const highlightBackset = turretBackset * (highlightPreset.backsetRatio ?? 0.2);
    const highlightLength = turretLength * (highlightPreset.lengthRatio ?? 0.7);
    const highlightWidth = turretHalfWidth * (highlightPreset.widthRatio ?? 0.6);
    const highlightHeight = turretHalfWidth * (highlightPreset.heightRatio ?? 0.4);
    const highlightAlpha = highlightPreset.alpha ?? 0.45;
    ctx.globalAlpha = highlightAlpha;
    ctx.fillStyle = palette.bodyHighlight || '#8f94aa';
    ctx.beginPath();
    ctx.moveTo(-highlightBackset, -highlightWidth);
    ctx.lineTo(highlightLength, -highlightHeight);
    ctx.lineTo(-highlightBackset, 0);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'transparent';

    ctx.restore();

    return payload;
  }

  ensureHullGradient(ctx, front, rear, palette, shadingPreset) {
    if (!ctx || typeof ctx.createLinearGradient !== 'function') {
      return null;
    }

    const key = [
      front,
      rear,
      palette.body,
      palette.bodyHighlight,
      palette.bodyShadow,
      shadingPreset.shadowStop,
      shadingPreset.midStop,
      shadingPreset.highlightStop,
    ].join(':');

    if (this._hullGradient && this._hullGradientKey === key) {
      return this._hullGradient;
    }

    const gradient = ctx.createLinearGradient(rear, 0, front, 0);
    const shadowStop = Math.min(1, Math.max(0, shadingPreset.shadowStop ?? 0.12));
    const midStop = Math.min(1, Math.max(shadowStop, shadingPreset.midStop ?? 0.48));
    const highlightStop = Math.min(1, Math.max(midStop, shadingPreset.highlightStop ?? 0.88));

    gradient.addColorStop(0, palette.bodyShadow || palette.body || '#2c2f3b');
    gradient.addColorStop(shadowStop, palette.body || '#64687a');
    gradient.addColorStop(midStop, palette.body || '#64687a');
    gradient.addColorStop(highlightStop, palette.bodyHighlight || '#8f94aa');
    gradient.addColorStop(1, palette.bodyHighlight || '#8f94aa');

    this._hullGradient = gradient;
    this._hullGradientKey = key;

    return gradient;
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
    this._hullGradient = null;
    this._hullGradientKey = null;
  }
}

export default Hunter;
