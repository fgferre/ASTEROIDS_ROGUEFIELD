import * as CONSTANTS from '../core/GameConstants.js';

class WorldSystem {
  constructor() {
    if (typeof gameServices !== 'undefined') {
      gameServices.register('world', this);
    }

    this.playerAlive = true;
    this.cachedPlayer = null;
    this.cachedEnemies = null;
    this.cachedPhysics = null;
    this.cachedProgression = null;

    this.setupEventListeners();
    this.resolveCachedServices(true);

    console.log('[WorldSystem] Initialized');
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') {
      return;
    }

    gameEvents.on('player-reset', () => {
      this.resolveCachedServices(true);
    });

    gameEvents.on('progression-reset', () => {
      this.resolveCachedServices(true);
    });

    gameEvents.on('physics-reset', () => {
      this.resolveCachedServices(true);
    });
  }

  resolveCachedServices(force = false) {
    if (typeof gameServices === 'undefined') {
      return;
    }

    if (force || !this.cachedPlayer) {
      if (typeof gameServices.has === 'function' && gameServices.has('player')) {
        this.cachedPlayer = gameServices.get('player');
      } else {
        this.cachedPlayer = null;
      }
    }

    if (force || !this.cachedEnemies) {
      if (typeof gameServices.has === 'function' && gameServices.has('enemies')) {
        this.cachedEnemies = gameServices.get('enemies');
      } else {
        this.cachedEnemies = null;
      }
    }

    if (force || !this.cachedPhysics) {
      if (typeof gameServices.has === 'function' && gameServices.has('physics')) {
        this.cachedPhysics = gameServices.get('physics');
      } else {
        this.cachedPhysics = null;
      }
    }

    if (force || !this.cachedProgression) {
      if (
        typeof gameServices.has === 'function' &&
        gameServices.has('progression')
      ) {
        this.cachedProgression = gameServices.get('progression');
      } else {
        this.cachedProgression = null;
      }
    }
  }

  update(deltaTime) {
    if (!this.playerAlive) {
      return;
    }

    this.resolveCachedServices();

    const player = this.cachedPlayer;
    const enemies = this.cachedEnemies;

    if (!player || !enemies) {
      return;
    }

    const physics = this.cachedPhysics;
    const playerPosition = player.position;

    if (
      physics &&
      playerPosition &&
      Number.isFinite(playerPosition.x) &&
      Number.isFinite(playerPosition.y) &&
      typeof physics.forEachNearbyAsteroid === 'function'
    ) {
      const initialContext = this.buildPlayerCollisionContext(player);
      const queryRadius = Math.max(
        0,
        initialContext.collisionRadius + (physics.maxAsteroidRadius || 0)
      );

      if (queryRadius > 0) {
        physics.forEachNearbyAsteroid(
          playerPosition,
          queryRadius,
          (asteroid) => {
            this.handlePlayerAsteroidCollision(player, asteroid, enemies);
          }
        );
      }
      return;
    }

    if (typeof enemies.forEachActiveAsteroid === 'function') {
      enemies.forEachActiveAsteroid((asteroid) => {
        this.handlePlayerAsteroidCollision(player, asteroid, enemies);
      });
      return;
    }

    if (typeof enemies.getAsteroids === 'function') {
      const asteroids = enemies.getAsteroids();
      if (Array.isArray(asteroids)) {
        for (let i = 0; i < asteroids.length; i += 1) {
          this.handlePlayerAsteroidCollision(player, asteroids[i], enemies);
        }
      }
    }
  }

  buildPlayerCollisionContext(player) {
    const shieldState =
      typeof player.getShieldState === 'function'
        ? player.getShieldState()
        : null;
    const shieldActive =
      shieldState?.isActive &&
      shieldState.maxHits > 0 &&
      shieldState.currentHits > 0;
    const impactProfile =
      shieldActive && typeof player.getShieldImpactProfile === 'function'
        ? player.getShieldImpactProfile()
        : { damage: 0, forceMultiplier: 1, level: shieldState?.level ?? 0 };

    const hullRadius =
      typeof player.getHullBoundingRadius === 'function'
        ? player.getHullBoundingRadius()
        : CONSTANTS.SHIP_SIZE;
    const padding =
      shieldActive && typeof player.getShieldPadding === 'function'
        ? player.getShieldPadding()
        : 0;

    const collisionRadius = Math.max(0, hullRadius + padding);

    return {
      shieldState,
      shieldActive,
      impactProfile,
      hullRadius,
      padding,
      collisionRadius,
    };
  }

  handlePlayerAsteroidCollision(player, asteroid, enemiesSystem) {
    if (!asteroid || asteroid.destroyed || !player) {
      return;
    }

    const position = player.position;
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      return;
    }

    const context = this.buildPlayerCollisionContext(player);
    const collisionRadius = context.collisionRadius;
    const asteroidRadius = Number.isFinite(asteroid.radius)
      ? Math.max(0, asteroid.radius)
      : 0;

    if (collisionRadius <= 0) {
      return;
    }

    const dx = position.x - asteroid.x;
    const dy = position.y - asteroid.y;
    const maxDistance = collisionRadius + asteroidRadius;
    const distanceSq = dx * dx + dy * dy;

    if (distanceSq >= maxDistance * maxDistance) {
      return;
    }

    const distance = Math.sqrt(distanceSq);
    const nx = distance > 0 ? dx / distance : 0;
    const ny = distance > 0 ? dy / distance : 0;
    const overlap = maxDistance - distance;

    if (overlap > 0) {
      const playerPushRatio = context.shieldActive ? 0.18 : 0.5;
      const asteroidPushRatio = 1 - playerPushRatio;
      player.position.x += nx * overlap * playerPushRatio;
      player.position.y += ny * overlap * playerPushRatio;
      asteroid.x -= nx * overlap * asteroidPushRatio;
      asteroid.y -= ny * overlap * asteroidPushRatio;
    }

    const rvx = asteroid.vx - player.velocity.vx;
    const rvy = asteroid.vy - player.velocity.vy;
    const velAlongNormal = rvx * nx + rvy * ny;

    if (velAlongNormal < 0) {
      const bounce = context.shieldActive
        ? CONSTANTS.SHIELD_COLLISION_BOUNCE
        : 0.2;
      const playerMass = context.shieldActive
        ? CONSTANTS.SHIP_MASS * Math.max(context.impactProfile.forceMultiplier, 1)
        : CONSTANTS.SHIP_MASS;
      const invMass1 = 1 / playerMass;
      const invMass2 = 1 / asteroid.mass;
      let j = (-(1 + bounce) * velAlongNormal) / (invMass1 + invMass2);
      if (context.shieldActive) {
        j *= Math.max(context.impactProfile.forceMultiplier, 1);
      }

      const jx = j * nx;
      const jy = j * ny;

      player.velocity.vx -= jx * invMass1;
      player.velocity.vy -= jy * invMass1;
      asteroid.vx += jx * invMass2;
      asteroid.vy += jy * invMass2;
    }

    if (player.invulnerableTimer > 0) {
      return;
    }

    const previousShieldHits = context.shieldState?.currentHits ?? 0;
    const prevShieldActive = context.shieldActive;

    const relSpeed = Math.hypot(
      asteroid.vx - player.velocity.vx,
      asteroid.vy - player.velocity.vy
    );
    const baseDamage = 12;
    const momentumFactor = (asteroid.mass * relSpeed) / 120;
    const rawDamage = baseDamage + momentumFactor;
    const damage = Math.max(3, Math.floor(rawDamage));
    const remaining = player.takeDamage(damage);

    const newShieldState =
      typeof player.getShieldState === 'function'
        ? player.getShieldState()
        : null;

    const shieldAbsorbedHit =
      prevShieldActive &&
      (!newShieldState?.isActive ||
        (typeof newShieldState.currentHits === 'number' &&
          newShieldState.currentHits < previousShieldHits));

    if (shieldAbsorbedHit) {
      const boost =
        CONSTANTS.SHIELD_REFLECT_SPEED *
        Math.max(context.impactProfile.forceMultiplier, 1);
      asteroid.vx -= nx * boost;
      asteroid.vy -= ny * boost;

      const cooldown = CONSTANTS.SHIELD_HIT_GRACE_TIME;
      if (
        asteroid.shieldHitCooldown === undefined ||
        !Number.isFinite(asteroid.shieldHitCooldown)
      ) {
        asteroid.shieldHitCooldown = 0;
      }

      if (asteroid.shieldHitCooldown <= 0) {
        if (
          enemiesSystem &&
          typeof enemiesSystem.applyDamage === 'function'
        ) {
          enemiesSystem.applyDamage(asteroid, context.impactProfile.damage);
        }
        asteroid.shieldHitCooldown = cooldown;
      }

      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('shield-deflected', {
          position: { x: player.position.x, y: player.position.y },
          normal: { x: nx, y: ny },
          level: context.impactProfile.level || context.shieldState?.level || 0,
          intensity: Math.max(context.impactProfile.forceMultiplier, 1),
        });
      }
    }

    if (typeof remaining !== 'number') {
      return;
    }

    if (typeof player.setInvulnerableTimer === 'function') {
      player.setInvulnerableTimer(0.5);
    } else {
      player.invulnerableTimer = 0.5;
    }

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('player-took-damage', {
        damage,
        remaining,
        max: player.maxHealth,
        position: { ...player.position },
      });
    }

    if (remaining <= 0) {
      this.handlePlayerDeath();
    }
  }

  handlePlayerDeath() {
    if (!this.playerAlive) return;
    this.playerAlive = false;

    this.resolveCachedServices();

    const progression = this.cachedProgression;
    const enemies = this.cachedEnemies;

    const data = {
      player: { level: progression ? progression.getLevel() : 1 },
      stats: enemies
        ? enemies.getSessionStats()
        : { totalKills: 0, timeElapsed: 0 },
      wave: enemies ? enemies.getWaveState() : { completedWaves: 0 },
    };

    if (enemies && typeof enemies.stop === 'function') {
      enemies.stop();
    }

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('player-died', data);
    }
  }

  reset() {
    this.playerAlive = true;
    this.resolveCachedServices(true);
  }
}

export default WorldSystem;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WorldSystem;
}
