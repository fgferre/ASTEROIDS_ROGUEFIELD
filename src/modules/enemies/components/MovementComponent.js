import {
  GAME_HEIGHT,
  GAME_WIDTH,
  SHIP_SIZE,
} from '../../../core/GameConstants.js';
import { clamp, lerp } from '../../../utils/mathHelpers.js';
import {
  length,
  normalizeSimple as normalize,
} from '../../../utils/vectorHelpers.js';

const DEFAULT_BOUNDS = Object.freeze({
  left: 0,
  top: 0,
  right: GAME_WIDTH,
  bottom: GAME_HEIGHT,
});

const createDefaultStrategies = () => ({
  linear: ({ enemy, deltaTime, bounds }) => {
    // Always sync velocity from vx/vy properties to handle external modifications
    // (e.g., shield explosions, impulses, etc.)
    const vx = enemy.vx ?? 0;
    const vy = enemy.vy ?? 0;

    // Keep velocity object in sync for components that read it
    enemy.velocity = { vx, vy };

    enemy.x += vx * deltaTime;
    enemy.y += vy * deltaTime;

    if (!enemy.rotationLocked) {
      enemy.rotation += (enemy.rotationSpeed || 0) * deltaTime;
    }

    wrapScreenEdges(enemy, bounds);
  },
  tracking: ({
    enemy,
    deltaTime,
    player,
    playerPosition,
    random,
    config,
    bounds,
  }) => {
    const targetPosition = playerPosition || player?.position || player || null;
    if (!targetPosition) {
      // fallback to linear drift
      return defaultStrategies.linear({ enemy, deltaTime, bounds });
    }

    const movement = enemy.velocity || { vx: enemy.vx ?? 0, vy: enemy.vy ?? 0 };
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
      const acceleration =
        stats.acceleration + variance * (config.variance ?? 12);
      movement.vx += dir.x * acceleration * deltaTime;
      movement.vy += dir.y * acceleration * deltaTime;
    }

    const speed = length(movement.vx, movement.vy);
    const maxSpeed = stats.maxSpeed;
    if (speed > maxSpeed) {
      const dir = normalize(movement.vx, movement.vy);
      movement.vx = dir.x * maxSpeed;
      movement.vy = dir.y * maxSpeed;
    }

    enemy.velocity = movement;
    enemy.vx = movement.vx;
    enemy.vy = movement.vy;

    enemy.x += movement.vx * deltaTime;
    enemy.y += movement.vy * deltaTime;

    enemy.rotation = Math.atan2(movement.vy, movement.vx);
    wrapScreenEdges(enemy, bounds);
  },
  orbit: ({
    enemy,
    deltaTime,
    player,
    playerPosition,
    random,
    config,
    bounds,
  }) => {
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
      const directionSeed =
        random?.range?.(-1, 1) ?? random?.float?.() ?? Math.random();
      enemy.orbitDirection = directionSeed > 0.5 ? 1 : -1;
    }

    const pos = { x: enemy.x ?? 0, y: enemy.y ?? 0 };
    const toCenter = { x: center.x - pos.x, y: center.y - pos.y };
    const distance = length(toCenter.x, toCenter.y);
    const dirToCenter = normalize(toCenter.x, toCenter.y);
    const tangent = { x: -dirToCenter.y, y: dirToCenter.x };

    const radialError = distance - options.preferredDistance;
    const radialAdjustment = clamp(
      radialError / Math.max(options.preferredDistance, 1),
      -1,
      1
    );

    const movement = enemy.velocity || { vx: enemy.vx ?? 0, vy: enemy.vy ?? 0 };

    // Apply tangential orbit force
    movement.vx +=
      tangent.x * options.acceleration * enemy.orbitDirection * deltaTime;
    movement.vy +=
      tangent.y * options.acceleration * enemy.orbitDirection * deltaTime;

    // Apply radial correction to maintain preferred distance
    movement.vx +=
      dirToCenter.x *
      options.acceleration *
      -radialAdjustment *
      0.65 *
      deltaTime;
    movement.vy +=
      dirToCenter.y *
      options.acceleration *
      -radialAdjustment *
      0.65 *
      deltaTime;

    const speed = length(movement.vx, movement.vy);
    if (speed > options.maxSpeed) {
      const dir = normalize(movement.vx, movement.vy);
      movement.vx = dir.x * options.maxSpeed;
      movement.vy = dir.y * options.maxSpeed;
    }

    enemy.velocity = movement;
    enemy.vx = movement.vx;
    enemy.vy = movement.vy;

    enemy.x += movement.vx * deltaTime;
    enemy.y += movement.vy * deltaTime;

    enemy.rotation = Math.atan2(movement.vy, movement.vx);
    wrapScreenEdges(enemy, bounds);
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
  seeking: ({
    enemy,
    deltaTime,
    player,
    playerPosition,
    random,
    config,
    bounds,
  }) => {
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

    const velocity = enemy.velocity || { vx: enemy.vx ?? 0, vy: enemy.vy ?? 0 };
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
    const jitter = {
      x: Math.cos(jitterAngle) * jitterAmount,
      y: Math.sin(jitterAngle) * jitterAmount,
    };

    const desiredVelocity = {
      x: desired.x * desiredSpeed + jitter.x,
      y: desired.y * desiredSpeed + jitter.y,
    };

    velocity.vx = lerp(
      velocity.vx,
      desiredVelocity.x,
      clamp(
        (options.acceleration * deltaTime) / Math.max(options.maxSpeed, 1),
        0,
        1
      )
    );
    velocity.vy = lerp(
      velocity.vy,
      desiredVelocity.y,
      clamp(
        (options.acceleration * deltaTime) / Math.max(options.maxSpeed, 1),
        0,
        1
      )
    );

    velocity.vx *= options.damping;
    velocity.vy *= options.damping;

    const speed = length(velocity.vx, velocity.vy);
    if (speed > options.maxSpeed) {
      const dir = normalize(velocity.vx, velocity.vy);
      velocity.vx = dir.x * options.maxSpeed;
      velocity.vy = dir.y * options.maxSpeed;
    }

    enemy.velocity = velocity;
    enemy.vx = velocity.vx;
    enemy.vy = velocity.vy;

    enemy.x += velocity.vx * deltaTime;
    enemy.y += velocity.vy * deltaTime;

    enemy.rotation = Math.atan2(velocity.vy, velocity.vx);
    wrapScreenEdges(enemy, bounds);
  },

  // Parasite movement: tracking with repulsion when too close
  // Ported from AsteroidMovement.parasiteMovement (lines 89-131)
  parasite: ({
    enemy,
    deltaTime,
    player,
    playerPosition,
    random,
    config,
    bounds,
  }) => {
    // Initialize velocity properties to prevent NaN
    enemy.vx = enemy.vx ?? 0;
    enemy.vy = enemy.vy ?? 0;

    const targetPos = playerPosition || player?.position || player;
    if (!targetPos) {
      // Fallback to linear if no target
      enemy.x += enemy.vx * deltaTime;
      enemy.y += enemy.vy * deltaTime;

      if (!enemy.rotationLocked) {
        enemy.rotation += (enemy.rotationSpeed || 0) * deltaTime;
      }

      enemy.velocity = { vx: enemy.vx, vy: enemy.vy };
      wrapScreenEdges(enemy, bounds);
      return;
    }

    // Calculate direction to player
    const dx = targetPos.x - enemy.x;
    const dy = targetPos.y - enemy.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      const dirX = dx / distance;
      const dirY = dy / distance;

      // Apply acceleration toward player
      const acceleration = config.acceleration || 180;
      enemy.vx += dirX * acceleration * deltaTime;
      enemy.vy += dirY * acceleration * deltaTime;

      // Limit speed to maxSpeed
      const maxSpeed = config.maxSpeed || 160;
      const currentSpeed = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
      if (currentSpeed > maxSpeed) {
        enemy.vx = (enemy.vx / currentSpeed) * maxSpeed;
        enemy.vy = (enemy.vy / currentSpeed) * maxSpeed;
      }

      // Apply repulsion when too close to prevent sticking
      const minDistance = config.minDistance || 60;
      if (distance < minDistance) {
        const repelStrength = (minDistance - distance) / minDistance;
        enemy.vx -= dirX * acceleration * repelStrength * 1.2 * deltaTime;
        enemy.vy -= dirY * acceleration * repelStrength * 1.2 * deltaTime;
      }
    }

    // Apply movement
    enemy.x += enemy.vx * deltaTime;
    enemy.y += enemy.vy * deltaTime;
    enemy.rotation += (enemy.rotationSpeed || 0) * deltaTime;

    // Sync velocity object
    enemy.velocity = { vx: enemy.vx, vy: enemy.vy };

    wrapScreenEdges(enemy, bounds);
  },

  // Volatile movement: linear with rotation jitter when armed
  // Ported from AsteroidMovement.volatileMovement (lines 141-161)
  volatile: ({
    enemy,
    deltaTime,
    player,
    playerPosition,
    random,
    config,
    bounds,
  }) => {
    // Initialize velocity properties to prevent NaN
    enemy.vx = enemy.vx ?? 0;
    enemy.vy = enemy.vy ?? 0;

    // Apply linear movement
    enemy.x += enemy.vx * deltaTime;
    enemy.y += enemy.vy * deltaTime;

    // Add rotation jitter if armed (only with deterministic RNG)
    if (enemy.variantState?.armed && random?.range) {
      const jitterChance = random.range(-0.5, 0.5);
      if (Math.abs(jitterChance) > 0.3) {
        const jitter = jitterChance * 0.3;
        enemy.rotationSpeed = (enemy.rotationSpeed || 0) + jitter;
      }
    }

    enemy.rotation += (enemy.rotationSpeed || 0) * deltaTime;

    // Sync velocity object
    enemy.velocity = { vx: enemy.vx, vy: enemy.vy };

    wrapScreenEdges(enemy, bounds);
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
    const handler =
      this.strategies.get(strategyName) || this.strategies.get('linear');

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

  const left = bounds.left ?? 0;
  const top = bounds.top ?? 0;
  const right = bounds.right ?? bounds.width ?? GAME_WIDTH;
  const bottom = bounds.bottom ?? bounds.height ?? GAME_HEIGHT;

  // Use larger wrap threshold to prevent immediate wrapping after spawn (asteroids spawn at ±80px)
  const wrapThreshold =
    enemy.wrapMargin ?? Math.max(enemy.radius ?? enemy.size ?? 40, 100);

  // Wrap destination should be close to visible edge so asteroids can drift into view
  const wrapDestination = enemy.radius ?? enemy.size ?? 40;

  // Wrap horizontally: if goes off left, appear on right (and vice versa)
  if (enemy.x < left - wrapThreshold) enemy.x = right + wrapDestination;
  if (enemy.x > right + wrapThreshold) enemy.x = left - wrapDestination;

  // Wrap vertically: if goes off top, appear on bottom (and vice versa)
  if (enemy.y < top - wrapThreshold) enemy.y = bottom + wrapDestination;
  if (enemy.y > bottom + wrapThreshold) enemy.y = top - wrapDestination;
};

const resolveBounds = (worldBounds) => {
  if (!worldBounds) {
    return DEFAULT_BOUNDS;
  }

  if (
    typeof worldBounds.width === 'number' &&
    typeof worldBounds.height === 'number'
  ) {
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
