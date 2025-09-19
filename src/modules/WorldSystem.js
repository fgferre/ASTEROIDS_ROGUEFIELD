import * as CONSTANTS from '../core/GameConstants.js';

class WorldSystem {
  constructor() {
    if (typeof gameServices !== 'undefined') {
      gameServices.register('world', this);
    }

    this.playerAlive = true;
    console.log('[WorldSystem] Initialized');
  }

  update(deltaTime) {
    if (!this.playerAlive) {
      return;
    }

    const player = gameServices.get('player');
    const enemies = gameServices.get('enemies');

    if (!player || !enemies) {
      return;
    }

    this.handlePlayerAsteroidCollisions(player, enemies.getAsteroids(), enemies);
  }

  handlePlayerAsteroidCollisions(player, asteroids, enemiesSystem) {
    if (!Array.isArray(asteroids)) return;

    asteroids.forEach((asteroid) => {
      if (asteroid.destroyed) return;

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
      const collisionRadius = hullRadius + padding;

      const dx = player.position.x - asteroid.x;
      const dy = player.position.y - asteroid.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance >= collisionRadius + asteroid.radius) {
        return;
      }

      const nx = dx / Math.max(distance, 1);
      const ny = dy / Math.max(distance, 1);
      const overlap = collisionRadius + asteroid.radius - distance;

      if (overlap > 0) {
        const playerPushRatio = shieldActive ? 0.18 : 0.5;
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
        const bounce = shieldActive
          ? CONSTANTS.SHIELD_COLLISION_BOUNCE
          : 0.2;
        const playerMass = shieldActive
          ? CONSTANTS.SHIP_MASS * Math.max(impactProfile.forceMultiplier, 1)
          : CONSTANTS.SHIP_MASS;
        const invMass1 = 1 / playerMass;
        const invMass2 = 1 / asteroid.mass;
        let j = (-(1 + bounce) * velAlongNormal) / (invMass1 + invMass2);
        if (shieldActive) {
          j *= Math.max(impactProfile.forceMultiplier, 1);
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

      const previousShieldHits = shieldState?.currentHits ?? 0;
      const prevShieldActive = shieldActive;

      const relSpeed = Math.sqrt(
        (asteroid.vx - player.velocity.vx) ** 2 +
          (asteroid.vy - player.velocity.vy) ** 2
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
          Math.max(impactProfile.forceMultiplier, 1);
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
          if (enemiesSystem && typeof enemiesSystem.applyDamage === 'function') {
            enemiesSystem.applyDamage(asteroid, impactProfile.damage);
          }
          asteroid.shieldHitCooldown = cooldown;
        }

        if (typeof gameEvents !== 'undefined') {
          gameEvents.emit('shield-deflected', {
            position: { x: player.position.x, y: player.position.y },
            normal: { x: nx, y: ny },
            level: impactProfile.level || shieldState?.level || 0,
            intensity: Math.max(impactProfile.forceMultiplier, 1),
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
    });
  }

  handlePlayerDeath() {
    if (!this.playerAlive) return;
    this.playerAlive = false;

    const progression = gameServices.get('progression');
    const enemies = gameServices.get('enemies');

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
  }
}

export default WorldSystem;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WorldSystem;
}
