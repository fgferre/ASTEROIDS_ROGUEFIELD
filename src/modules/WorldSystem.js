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

    this.handlePlayerAsteroidCollisions(player, enemies.getAsteroids());
  }

  handlePlayerAsteroidCollisions(player, asteroids) {
    if (!Array.isArray(asteroids)) return;

    asteroids.forEach((asteroid) => {
      if (asteroid.destroyed) return;

      const dx = player.position.x - asteroid.x;
      const dy = player.position.y - asteroid.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance >= CONSTANTS.SHIP_SIZE + asteroid.radius) {
        return;
      }

      const nx = dx / Math.max(distance, 1);
      const ny = dy / Math.max(distance, 1);
      const overlap = CONSTANTS.SHIP_SIZE + asteroid.radius - distance;

      if (overlap > 0) {
        player.position.x += nx * overlap * 0.5;
        player.position.y += ny * overlap * 0.5;
        asteroid.x -= nx * overlap * 0.5;
        asteroid.y -= ny * overlap * 0.5;
      }

      const rvx = asteroid.vx - player.velocity.vx;
      const rvy = asteroid.vy - player.velocity.vy;
      const velAlongNormal = rvx * nx + rvy * ny;
      if (velAlongNormal < 0) {
        const e = 0.2;
        const invMass1 = 1 / CONSTANTS.SHIP_MASS;
        const invMass2 = 1 / asteroid.mass;
        const j = (-(1 + e) * velAlongNormal) / (invMass1 + invMass2);
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

      const relSpeed = Math.sqrt(
        (asteroid.vx - player.velocity.vx) ** 2 +
          (asteroid.vy - player.velocity.vy) ** 2
      );
      const baseDamage = 12;
      const momentumFactor = (asteroid.mass * relSpeed) / 120;
      const rawDamage = baseDamage + momentumFactor;
      const damage = Math.max(3, Math.floor(rawDamage));
      const remaining = player.takeDamage(damage);

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
