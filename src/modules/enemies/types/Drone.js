import { DRONE_COMPONENTS, DRONE_CONFIG } from '../../../data/enemies/drone.js';
import {
  ENEMY_EFFECT_COLORS,
  ENEMY_RENDER_PRESETS,
} from '../../../data/constants/visual.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../../../core/GameConstants.js';
import RandomService from '../../../core/RandomService.js';
import { BaseEnemy } from '../base/BaseEnemy.js';
import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';

const DRONE_DEFAULTS = DRONE_CONFIG ?? {};

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
    this.useComponents = Boolean(componentConfig);
    if (this.useComponents) {
      this.weaponState = this.weaponState || {};
      this.movementStrategy = componentConfig?.movement?.strategy || 'tracking';
      this.renderStrategy = componentConfig?.render?.strategy || 'procedural-triangle';
      this.weaponPattern = componentConfig?.weapon?.pattern || this.weaponPattern;
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

    this.fireTimer = this.computeNextFireInterval();
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
    if (this.useComponents) {
      if (!this._componentsInvoked) {
        const context = this.buildComponentContext(deltaTime);
        this._componentsInvoked = true;
        this.runComponentUpdate(context);
        this._componentsInvoked = false;
      }
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
        lifetime: this.projectileLifetime,
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

  onDraw(ctx) {
    if (this.useComponents) {
      return;
    }

    const palette = ENEMY_EFFECT_COLORS?.drone ?? {};
    const presets = ENEMY_RENDER_PRESETS?.drone ?? {};
    const hullPreset = presets.hull ?? {};
    const finPreset = presets.fins ?? {};
    const accentPreset = presets.accents ?? {};
    const exhaustPreset = presets.exhaust ?? {};

    const baseRadius = this.radius || DRONE_CONFIG?.radius || 12;
    const maxSpeed = Math.max(1, this.maxSpeed || DRONE_CONFIG?.speed || 1);
    const speed = Math.hypot(this.vx, this.vy);
    const targetThrust = Math.min(1, Math.max(0, speed / maxSpeed));
    const smoothing = Math.min(1, Math.max(0, exhaustPreset.smoothing ?? 0.2));
    this._renderThrust += (targetThrust - this._renderThrust) * smoothing;
    const thrust = Math.min(1, Math.max(0, this._renderThrust));

    const payload = {
      type: this.type,
      id: this.id,
      position: { x: this.x, y: this.y },
      radius: baseRadius,
      rotation: this.rotation,
      thrust,
      colors: {
        body: palette.body,
        highlight: palette.bodyHighlight,
        shadow: palette.bodyShadow,
        accent: palette.accent,
        exhaust: palette.exhaust,
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

    const nose = baseRadius * (hullPreset.noseLengthMultiplier ?? 1.6);
    const tail = -baseRadius * (hullPreset.tailLengthMultiplier ?? 1.05);
    const halfWidth = baseRadius * (hullPreset.halfWidthMultiplier ?? 0.9);
    const innerScale = hullPreset.innerScale ?? 0.58;

    if (thrust > 0.001) {
      const exhaustOffset = baseRadius * (exhaustPreset.offsetMultiplier ?? 0.5);
      const exhaustLength = baseRadius * (exhaustPreset.lengthMultiplier ?? 1.55);
      const exhaustWidth = baseRadius * (exhaustPreset.widthMultiplier ?? 1.05);
      const blur = (exhaustPreset.blurBase ?? 6) + (exhaustPreset.blurRange ?? 0) * thrust;
      const alphaMin = exhaustPreset.alphaMin ?? 0.28;
      const alphaMax = exhaustPreset.alphaMax ?? 0.72;
      const alpha = alphaMin + (alphaMax - alphaMin) * thrust;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = blur;
      ctx.shadowColor = palette.accentGlow || palette.exhaust || 'rgba(255,255,255,0.4)';
      ctx.fillStyle = palette.exhaust || 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.ellipse(
        -exhaustOffset - exhaustLength * 0.5,
        0,
        exhaustLength * 0.5,
        exhaustWidth * 0.5,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.moveTo(nose, 0);
    ctx.lineTo(tail, halfWidth);
    ctx.lineTo(tail, -halfWidth);
    ctx.closePath();
    ctx.fillStyle = palette.bodyShadow || palette.body || '#5b6b7a';
    ctx.fill();

    const innerNose = nose * innerScale;
    const innerTail = tail * innerScale;
    const innerHalfWidth = halfWidth * innerScale;
    ctx.beginPath();
    ctx.moveTo(innerNose, 0);
    ctx.lineTo(innerTail, innerHalfWidth);
    ctx.lineTo(innerTail, -innerHalfWidth);
    ctx.closePath();
    ctx.fillStyle = palette.bodyHighlight || palette.body || '#7c8d9c';
    ctx.fill();

    const hullStrokeWidth = baseRadius * (hullPreset.strokeWidthMultiplier ?? 0.12);
    ctx.lineWidth = hullStrokeWidth;
    ctx.strokeStyle = palette.body || '#5b6b7a';
    ctx.beginPath();
    ctx.moveTo(nose, 0);
    ctx.lineTo(tail, halfWidth);
    ctx.lineTo(tail, -halfWidth);
    ctx.closePath();
    ctx.stroke();

    const finLength = baseRadius * (finPreset.lengthMultiplier ?? 0.9);
    const finWidth = baseRadius * (finPreset.widthMultiplier ?? 0.35);
    const finOffset = baseRadius * (finPreset.offsetMultiplier ?? 0.55);
    const finTaper = Math.max(0, finPreset.taperMultiplier ?? 0.6);

    ctx.fillStyle = palette.body || '#5b6b7a';
    ctx.beginPath();
    ctx.moveTo(-finOffset, finWidth);
    ctx.lineTo(-finOffset - finLength, finWidth * finTaper);
    ctx.lineTo(-finOffset, 0);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-finOffset, -finWidth);
    ctx.lineTo(-finOffset - finLength, -finWidth * finTaper);
    ctx.lineTo(-finOffset, 0);
    ctx.closePath();
    ctx.fill();

    const accentStrokeWidth = baseRadius * (hullPreset.accentStrokeMultiplier ?? 0.08);
    const ridgeForwardScale = accentPreset.ridgeForwardScale ?? innerScale;
    const ridgeTailScale = accentPreset.ridgeTailScale ?? 0.85;
    const ridgeHalfWidthScale = accentPreset.ridgeHalfWidthScale ?? 0.45;

    ctx.lineWidth = accentStrokeWidth;
    ctx.strokeStyle = palette.accent || '#a6e8ff';
    ctx.beginPath();
    ctx.moveTo(nose * ridgeForwardScale, halfWidth * ridgeHalfWidthScale);
    ctx.lineTo(tail * ridgeTailScale, 0);
    ctx.lineTo(nose * ridgeForwardScale, -halfWidth * ridgeHalfWidthScale);
    ctx.stroke();

    if (palette.accentGlow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = accentPreset.glowAlpha ?? 0.45;
      ctx.shadowBlur = baseRadius * (accentPreset.glowRadiusMultiplier ?? 0.6);
      ctx.shadowColor = palette.accentGlow;
      ctx.fillStyle = palette.accent || '#a6e8ff';
      ctx.beginPath();
      ctx.moveTo(innerNose, 0);
      ctx.lineTo(innerTail, innerHalfWidth);
      ctx.lineTo(innerTail, -innerHalfWidth);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'transparent';

    ctx.restore();

    return payload;
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
