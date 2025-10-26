import { GAME_HEIGHT, GAME_WIDTH, SHIP_SIZE } from '../../../core/GameConstants.js';

const DEFAULT_BOUNDS = Object.freeze({
  left: 0,
  top: 0,
  right: GAME_WIDTH,
  bottom: GAME_HEIGHT,
});

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const length = (vx, vy) => Math.sqrt(vx * vx + vy * vy) || 0;

const normalize = (vx, vy) => {
  const len = length(vx, vy);
  if (!len) {
    return { x: 0, y: 0 };
  }
  return { x: vx / len, y: vy / len };
};

const lerp = (start, end, t) => start + (end - start) * clamp(t, 0, 1);

const createDefaultStrategies = () => ({
  linear: ({ enemy, deltaTime, bounds }) => {
    if (!enemy.velocity) {
      enemy.velocity = { x: enemy.vx ?? 0, y: enemy.vy ?? 0 };
    }

    const vx = enemy.velocity.x ?? enemy.vx ?? 0;
    const vy = enemy.velocity.y ?? enemy.vy ?? 0;

    enemy.x += vx * deltaTime;
    enemy.y += vy * deltaTime;

    if (!enemy.rotationLocked) {
      enemy.rotation = Math.atan2(vy, vx);
    }

    wrapScreenEdges(enemy, bounds);
  },
  tracking: ({ enemy, deltaTime, player, playerPosition, random, config, bounds }) => {
    const targetPosition = playerPosition || player?.position || player || null;
    if (!targetPosition) {
      // fallback to linear drift
      return defaultStrategies.linear({ enemy, deltaTime, bounds });
    }

    const movement = enemy.velocity || { x: enemy.vx ?? 0, y: enemy.vy ?? 0 };
    const enemyPos = { x: enemy.x ?? 0, y: enemy.y ?? 0 };
    const desired = {
      x: targetPosition.x - enemyPos.x,
      y: targetPosition.y - enemyPos.y,
    };

    const stats = {
      acceleration: config.acceleration ?? 240,
      maxSpeed: config.maxSpeed ?? config.speed ?? 180,
      targetingRange: config.targetingRange ?? 480,
    };

    const distance = length(desired.x, desired.y);
    if (distance > 1e-6 && distance <= stats.targetingRange) {
      const dir = normalize(desired.x, desired.y);
      const variance = (random?.float?.() ?? random?.() ?? Math.random()) - 0.5;
      const acceleration = stats.acceleration + variance * (config.variance ?? 12);
      movement.x += dir.x * acceleration * deltaTime;
      movement.y += dir.y * acceleration * deltaTime;
    }

    const speed = length(movement.x, movement.y);
    const maxSpeed = stats.maxSpeed;
    if (speed > maxSpeed) {
      const dir = normalize(movement.x, movement.y);
      movement.x = dir.x * maxSpeed;
      movement.y = dir.y * maxSpeed;
    }

    enemy.velocity = movement;
    enemy.vx = movement.x;
    enemy.vy = movement.y;

    enemy.x += movement.x * deltaTime;
    enemy.y += movement.y * deltaTime;

    enemy.rotation = Math.atan2(movement.y, movement.x);
    wrapScreenEdges(enemy, bounds);
  },
  orbit: ({ enemy, deltaTime, player, playerPosition, random, config }) => {
    const center = playerPosition || player?.position || player || null;
    if (!center) {
      return;
    }

    const options = {
      preferredDistance: config.preferredDistance ?? 180,
      acceleration: config.acceleration ?? 220,
      maxSpeed: config.maxSpeed ?? config.speed ?? 120,
      orbitDirection: enemy.orbitDirection ?? config.orbitDirection ?? 1,
    };

    if (enemy.orbitDirection == null) {
      const directionSeed = random?.range?.(-1, 1) ?? random?.float?.() ?? Math.random();
      enemy.orbitDirection = directionSeed > 0.5 ? 1 : -1;
    }

    const pos = { x: enemy.x ?? 0, y: enemy.y ?? 0 };
    const toCenter = { x: center.x - pos.x, y: center.y - pos.y };
    const distance = length(toCenter.x, toCenter.y);
    const dirToCenter = normalize(toCenter.x, toCenter.y);
    const tangent = { x: -dirToCenter.y, y: dirToCenter.x };

    const radialError = distance - options.preferredDistance;
    const radialAdjustment = clamp(radialError / Math.max(options.preferredDistance, 1), -1, 1);

    const movement = enemy.velocity || { x: enemy.vx ?? 0, y: enemy.vy ?? 0 };

    // Apply tangential orbit force
    movement.x += tangent.x * options.acceleration * enemy.orbitDirection * deltaTime;
    movement.y += tangent.y * options.acceleration * enemy.orbitDirection * deltaTime;

    // Apply radial correction to maintain preferred distance
    movement.x += dirToCenter.x * options.acceleration * -radialAdjustment * 0.65 * deltaTime;
    movement.y += dirToCenter.y * options.acceleration * -radialAdjustment * 0.65 * deltaTime;

    const speed = length(movement.x, movement.y);
    if (speed > options.maxSpeed) {
      const dir = normalize(movement.x, movement.y);
      movement.x = dir.x * options.maxSpeed;
      movement.y = dir.y * options.maxSpeed;
    }

    enemy.velocity = movement;
    enemy.vx = movement.x;
    enemy.vy = movement.y;

    enemy.x += movement.x * deltaTime;
    enemy.y += movement.y * deltaTime;

    enemy.rotation = Math.atan2(movement.y, movement.x);
  },
  proximity: ({ enemy, deltaTime, random, config }) => {
    const state = enemy.movementState || (enemy.movementState = {});
    const options = {
      driftSpeed: config.driftSpeed ?? 0,
      driftVariance: config.driftVariance ?? 12,
      lifetime: config.lifetime ?? Infinity,
    };

    state.elapsed = (state.elapsed || 0) + deltaTime;

    if (!state.velocity) {
      const angle = (random?.float?.() ?? Math.random()) * Math.PI * 2;
      const speed = options.driftSpeed > 0 ? options.driftSpeed : 0;
      state.velocity = {
        x: Math.cos(angle) * speed,
        y: Math.sin(angle) * speed,
      };
    }

    if (state.elapsed >= options.lifetime) {
      enemy.markForRemoval?.('lifetime-expired');
    }

    if (options.driftSpeed > 0) {
      enemy.x += state.velocity.x * deltaTime;
      enemy.y += state.velocity.y * deltaTime;
    }
  },
  seeking: ({ enemy, deltaTime, player, playerPosition, random, config }) => {
    const snapshot = playerPosition || player?.position || player || null;
    if (!snapshot) {
      return;
    }

    const options = {
      acceleration: config.acceleration ?? 120,
      maxSpeed: config.maxSpeed ?? config.speed ?? 60,
      safeDistance: config.safeDistance ?? SHIP_SIZE * 6,
      damping: config.damping ?? 0.92,
      jitter: config.jitter ?? 0.1,
    };

    const velocity = enemy.velocity || { x: enemy.vx ?? 0, y: enemy.vy ?? 0 };
    const toTarget = { x: snapshot.x - enemy.x, y: snapshot.y - enemy.y };
    const distance = length(toTarget.x, toTarget.y);
    const desired = normalize(toTarget.x, toTarget.y);

    let desiredSpeed = options.maxSpeed;
    if (distance < options.safeDistance) {
      const ratio = clamp(distance / options.safeDistance, 0.1, 1);
      desiredSpeed = lerp(0, options.maxSpeed, ratio);
    }

    const jitterAngle = (random?.float?.() ?? Math.random()) * Math.PI * 2;
    const jitterAmount = (random?.float?.() ?? Math.random()) * options.jitter;
    const jitter = { x: Math.cos(jitterAngle) * jitterAmount, y: Math.sin(jitterAngle) * jitterAmount };

    const desiredVelocity = {
      x: desired.x * desiredSpeed + jitter.x,
      y: desired.y * desiredSpeed + jitter.y,
    };

    velocity.x = lerp(velocity.x, desiredVelocity.x, clamp(options.acceleration * deltaTime / Math.max(options.maxSpeed, 1), 0, 1));
    velocity.y = lerp(velocity.y, desiredVelocity.y, clamp(options.acceleration * deltaTime / Math.max(options.maxSpeed, 1), 0, 1));

    velocity.x *= options.damping;
    velocity.y *= options.damping;

    const speed = length(velocity.x, velocity.y);
    if (speed > options.maxSpeed) {
      const dir = normalize(velocity.x, velocity.y);
      velocity.x = dir.x * options.maxSpeed;
      velocity.y = dir.y * options.maxSpeed;
    }

    enemy.velocity = velocity;
    enemy.vx = velocity.x;
    enemy.vy = velocity.y;

    enemy.x += velocity.x * deltaTime;
    enemy.y += velocity.y * deltaTime;

    enemy.rotation = Math.atan2(velocity.y, velocity.x);
  },
});

const defaultStrategies = createDefaultStrategies();

export class MovementComponent {
  constructor(config = {}) {
    this.config = { ...config };
    this.strategy = config.strategy || 'linear';
    this.strategies = new Map(Object.entries(defaultStrategies));

    if (config.customStrategies) {
      Object.entries(config.customStrategies).forEach(([name, fn]) => {
        if (typeof fn === 'function') {
          this.registerStrategy(name, fn);
        }
      });
    }
  }

  setStrategy(name) {
    this.strategy = name;
  }

  registerStrategy(name, handler) {
    if (!name || typeof handler !== 'function') {
      return;
    }
    this.strategies.set(name, handler);
  }

  update(context) {
    const strategyName = context?.enemy?.movementStrategy || this.strategy;
    const handler = this.strategies.get(strategyName) || this.strategies.get('linear');

    const bounds = resolveBounds(context?.worldBounds);

    handler?.({
      enemy: context.enemy,
      deltaTime: context.deltaTime,
      player: context.player,
      playerPosition: context.playerPosition,
      playerEntity: context.playerEntity,
      system: context.system,
      random: context.random,
      bounds,
      config: { ...this.config, ...(context.enemy?.movementConfig || {}) },
    });
  }
}

export const wrapScreenEdges = (enemy, bounds = DEFAULT_BOUNDS) => {
  if (!enemy) return;

  const width = bounds?.width ?? bounds?.right ?? GAME_WIDTH;
  const height = bounds?.height ?? bounds?.bottom ?? GAME_HEIGHT;
  const margin = enemy.wrapMargin ?? (enemy.size ?? SHIP_SIZE * 0.5);

  if (enemy.x < (bounds.left ?? 0) - margin) enemy.x = width + (bounds.left ?? 0) + margin;
  if (enemy.x > (bounds.right ?? width) + margin) enemy.x = (bounds.left ?? 0) - margin;
  if (enemy.y < (bounds.top ?? 0) - margin) enemy.y = height + (bounds.top ?? 0) + margin;
  if (enemy.y > (bounds.bottom ?? height) + margin) enemy.y = (bounds.top ?? 0) - margin;
};

const resolveBounds = (worldBounds) => {
  if (!worldBounds) {
    return DEFAULT_BOUNDS;
  }

  if (typeof worldBounds.width === 'number' && typeof worldBounds.height === 'number') {
    return {
      left: worldBounds.left ?? 0,
      top: worldBounds.top ?? 0,
      right: (worldBounds.left ?? 0) + worldBounds.width,
      bottom: (worldBounds.top ?? 0) + worldBounds.height,
      width: worldBounds.width,
      height: worldBounds.height,
    };
  }

  return {
    left: worldBounds.left ?? 0,
    top: worldBounds.top ?? 0,
    right: worldBounds.right ?? GAME_WIDTH,
    bottom: worldBounds.bottom ?? GAME_HEIGHT,
    width: (worldBounds.right ?? GAME_WIDTH) - (worldBounds.left ?? 0),
    height: (worldBounds.bottom ?? GAME_HEIGHT) - (worldBounds.top ?? 0),
  };
};
