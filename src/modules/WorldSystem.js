import { normalizeDependencies, resolveService } from '../core/serviceUtils.js';

class WorldSystem {
  constructor(dependencies = {}) {
    this.dependencies = normalizeDependencies(dependencies);
    if (typeof gameServices !== 'undefined') {
      gameServices.register('world', this);
    }

    this.playerAlive = true;
    this.services = {
      player: null,
      enemies: null,
      physics: null,
      progression: null
    };

    this.setupEventListeners();
    this.refreshInjectedServices(true);

    console.log('[WorldSystem] Initialized');
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') {
      return;
    }

    gameEvents.on('player-reset', () => {
      this.refreshInjectedServices(true);
    });

    gameEvents.on('progression-reset', () => {
      this.refreshInjectedServices(true);
    });

    gameEvents.on('physics-reset', () => {
      this.refreshInjectedServices(true);
    });
  }

  refreshInjectedServices(force = false) {
    if (force) {
      this.services.player = null;
      this.services.enemies = null;
      this.services.physics = null;
      this.services.progression = null;
    }

    if (!this.services.player) {
      this.services.player = resolveService('player', this.dependencies);
    }

    if (!this.services.enemies) {
      this.services.enemies = resolveService('enemies', this.dependencies);
    }

    if (!this.services.physics) {
      this.services.physics = resolveService('physics', this.dependencies);
    }

    if (!this.services.progression) {
      this.services.progression = resolveService('progression', this.dependencies);
    }
  }

  update(deltaTime) {
    // DON'T return early - let game keep running even when player is dead
    // This allows asteroids to keep wandering while player is in death state

    this.refreshInjectedServices();

    const player = this.services.player;
    const enemies = this.services.enemies;

    if (!player || !enemies) {
      return;
    }

    // Skip collision detection if player is dead or retrying
    if (!this.playerAlive || player.isDead || player.isRetrying) {
      return;
    }

    const physics = this.services.physics;

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

    this.refreshInjectedServices();

    const player = this.services.player;
    const progression = this.services.progression;
    const enemies = this.services.enemies;

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
    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('player-died', data);
    }

    // Mark world state as player not alive (but DON'T stop enemies - they keep wandering)
    this.playerAlive = false;

    // DON'T stop enemies - let them keep moving while player is dead/retrying
  }

  reset() {
    this.playerAlive = true;
    this.refreshInjectedServices(true);
  }
}

export default WorldSystem;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WorldSystem;
}
