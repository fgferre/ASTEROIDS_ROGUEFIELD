import { BaseSystem } from '../core/BaseSystem.js';

const WORLD_SERVICE_MAP = {
  player: 'player',
  enemies: 'enemies',
  physics: 'physics',
  progression: 'progression',
};

class WorldSystem extends BaseSystem {
  constructor(dependencies = {}) {
    super(dependencies, {
      systemName: 'WorldSystem',
      serviceName: 'world',
      enableRandomManagement: false,
    });

    this.playerAlive = true;

    this.setupEventListeners();
    this.resolveCachedServices(WORLD_SERVICE_MAP, { force: true });
  }

  setupEventListeners() {
    this.registerEventListener('player-reset', () => {
      this.resolveCachedServices(WORLD_SERVICE_MAP, { force: true });
    });

    this.registerEventListener('progression-reset', () => {
      this.resolveCachedServices(WORLD_SERVICE_MAP, { force: true });
    });

    this.registerEventListener('physics-reset', () => {
      this.resolveCachedServices(WORLD_SERVICE_MAP, { force: true });
    });
  }

  update(deltaTime) {
    // DON'T return early - let game keep running even when player is dead
    // This allows asteroids to keep wandering while player is in death state

    this.resolveCachedServices(WORLD_SERVICE_MAP);

    const player = this.player;
    const enemies = this.enemies;

    if (!player || !enemies) {
      return;
    }

    // Skip collision detection if player is dead or retrying
    if (!this.playerAlive || player.isDead || player.isRetrying) {
      return;
    }

    const physics = this.physics;

    if (
      physics &&
      typeof physics.processPlayerCollisions === 'function'
    ) {
      const collisionSummary = physics.processPlayerCollisions(player, enemies);
      if (collisionSummary?.playerDied) {
        this.handlePlayerDeath();
      }
      return;
    }

    if (
      physics &&
      typeof physics.handlePlayerAsteroidCollision === 'function' &&
      (typeof enemies.forEachActiveEnemy === 'function' ||
        typeof enemies.forEachActiveAsteroid === 'function')
    ) {
      const iterateEnemies =
        typeof enemies.forEachActiveEnemy === 'function'
          ? enemies.forEachActiveEnemy.bind(enemies)
          : enemies.forEachActiveAsteroid.bind(enemies);

      iterateEnemies((asteroid) => {
        if (!this.playerAlive) {
          return;
        }
        const outcome = physics.handlePlayerAsteroidCollision(
          player,
          asteroid,
          enemies
        );
        if (outcome?.playerDied) {
          this.handlePlayerDeath();
        }
      });
      return;
    }

    if (
      physics &&
      typeof physics.handlePlayerAsteroidCollision === 'function' &&
      (
        typeof enemies.getActiveEnemies === 'function' ||
        typeof enemies.getAsteroids === 'function'
      )
    ) {
      const asteroids =
        typeof enemies.getActiveEnemies === 'function'
          ? enemies.getActiveEnemies()
          : typeof enemies.getAsteroids === 'function'
          ? enemies.getAsteroids()
          : [];
      if (Array.isArray(asteroids)) {
        for (let i = 0; i < asteroids.length; i += 1) {
          if (!this.playerAlive) {
            break;
          }
          const asteroid = asteroids[i];
          const outcome = physics.handlePlayerAsteroidCollision(
            player,
            asteroid,
            enemies
          );
          if (outcome?.playerDied) {
            this.handlePlayerDeath();
            break;
          }
        }
      }
    }
  }

  handlePlayerDeath() {
    if (!this.playerAlive) return;

    console.log('[WorldSystem] Player died - triggering explosion');

    this.resolveCachedServices(WORLD_SERVICE_MAP);

    const player = this.player;
    const progression = this.progression;
    const enemies = this.enemies;

    // Get player position BEFORE marking as dead
    const playerPosition = player && typeof player.getPosition === 'function'
      ? player.getPosition()
      : (player ? player.position : { x: 960, y: 540 }); // Fallback to center

    // Mark player as dead (but keep game running)
    if (player && typeof player.markDead === 'function') {
      player.markDead();
    }

    const data = {
      player: { level: progression ? progression.getLevel() : 1 },
      stats: enemies
        ? enemies.getSessionStats()
        : { totalKills: 0, timeElapsed: 0 },
      wave: enemies ? enemies.getWaveState() : { completedWaves: 0 },
      position: playerPosition, // CRITICAL: Add position for explosion!
    };

    // Emit player-died FIRST so explosion triggers
    gameEvents.emit('player-died', data);

    // Mark world state as player not alive (but DON'T stop enemies - they keep wandering)
    this.playerAlive = false;

    // DON'T stop enemies - let them keep moving while player is dead/retrying
  }

  reset(options) {
    super.reset(options);
    this.playerAlive = true;
    this.resolveCachedServices(WORLD_SERVICE_MAP, { force: true });
  }
}

export default WorldSystem;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WorldSystem;
}
