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
      typeof enemies.forEachActiveAsteroid === 'function'
    ) {
      enemies.forEachActiveAsteroid((asteroid) => {
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
      typeof enemies.getAsteroids === 'function'
    ) {
      const asteroids = enemies.getAsteroids();
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

    this.resolveCachedServices();

    const player = this.cachedPlayer;
    const progression = this.cachedProgression;
    const enemies = this.cachedEnemies;

    // Get player position BEFORE marking as dead
    const playerPosition = player && typeof player.getPosition === 'function'
      ? player.getPosition()
      : (player ? player.position : { x: 960, y: 540 }); // Fallback to center

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

    // THEN mark player as dead and stop enemies AFTER a delay
    // This allows the explosion animation to play
    setTimeout(() => {
      this.playerAlive = false;
      if (enemies && typeof enemies.stop === 'function') {
        enemies.stop();
      }
    }, 100); // Small delay to ensure explosion starts
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
