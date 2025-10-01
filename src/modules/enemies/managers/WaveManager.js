/**
 * Wave Manager
 *
 * Manages wave progression, spawning, and difficulty scaling.
 * Supports multiple enemy types and complex wave compositions.
 *
 * Features:
 * - Wave configuration system
 * - Dynamic difficulty scaling
 * - Multiple enemy type support
 * - Procedural wave generation
 * - Wave state tracking
 *
 * @example
 * ```javascript
 * const waveManager = new WaveManager(enemySystem, eventBus);
 * waveManager.startNextWave();
 * waveManager.update(deltaTime);
 * ```
 */

import * as CONSTANTS from '../../../core/GameConstants.js';

export class WaveManager {
  /**
   * Creates a new Wave Manager.
   *
   * @param {Object} enemySystem - Reference to EnemySystem
   * @param {Object} eventBus - Event bus for wave events
   */
  constructor(enemySystem, eventBus) {
    this.enemySystem = enemySystem;
    this.eventBus = eventBus;

    // Wave state
    this.currentWave = 0;
    this.waveInProgress = false;
    this.wavePaused = false;
    this.waveStartTime = 0;
    this.waveEndTime = 0;

    // Spawn tracking
    this.enemiesSpawnedThisWave = 0;
    this.enemiesKilledThisWave = 0;
    this.totalEnemiesThisWave = 0;

    // Timers
    this.spawnTimer = 0;
    this.spawnDelay = CONSTANTS.WAVE_SPAWN_DELAY || 1.0;
    this.waveDelay = CONSTANTS.WAVE_START_DELAY || 3.0;
    this.waveCountdown = 0;

    // Wave configurations
    this.waveConfigs = this.loadWaveConfigurations();

    console.log('[WaveManager] Initialized');
  }

  /**
   * Loads predefined wave configurations.
   * Can be extended in the future to support multiple enemy types.
   *
   * @returns {Map<number, Object>} Wave configurations by wave number
   */
  loadWaveConfigurations() {
    const configs = new Map();

    // Early waves: Small asteroids
    for (let i = 1; i <= 3; i++) {
      configs.set(i, {
        enemies: [
          {
            type: 'asteroid',
            count: 3 + i,
            size: 'small',
            variant: 'common'
          }
        ]
      });
    }

    // Mid waves: Mixed sizes
    for (let i = 4; i <= 6; i++) {
      configs.set(i, {
        enemies: [
          {
            type: 'asteroid',
            count: 2 + i,
            size: 'medium',
            variant: 'common'
          },
          {
            type: 'asteroid',
            count: 2,
            size: 'small',
            variant: 'common'
          }
        ]
      });
    }

    // Later waves: Introduce variants
    for (let i = 7; i <= 10; i++) {
      configs.set(i, {
        enemies: [
          {
            type: 'asteroid',
            count: 3,
            size: 'large',
            variant: 'common'
          },
          {
            type: 'asteroid',
            count: 2,
            size: 'medium',
            variant: 'iron'
          },
          {
            type: 'asteroid',
            count: Math.floor(i / 3),
            size: 'small',
            variant: 'volatile'
          }
        ]
      });
    }

    // Waves 11+: Dynamic generation
    // (handled by generateDynamicWave)

    return configs;
  }

  /**
   * Generates a dynamic wave configuration based on wave number.
   * Used for waves beyond predefined configurations.
   *
   * @param {number} waveNumber - The wave number
   * @returns {Object} Wave configuration
   */
  generateDynamicWave(waveNumber) {
    const difficulty = Math.floor(waveNumber / 5);
    const baseCount = 5 + difficulty * 2;

    // Variant distribution by difficulty
    const variants = ['common', 'iron', 'gold', 'crystal'];
    if (waveNumber >= 7) variants.push('volatile');
    if (waveNumber >= 10) variants.push('parasite');

    const enemies = [];

    // Large asteroids
    enemies.push({
      type: 'asteroid',
      count: Math.max(1, Math.floor(baseCount * 0.3)),
      size: 'large',
      variant: this.selectRandomVariant(variants, waveNumber)
    });

    // Medium asteroids
    enemies.push({
      type: 'asteroid',
      count: Math.floor(baseCount * 0.4),
      size: 'medium',
      variant: this.selectRandomVariant(variants, waveNumber)
    });

    // Small asteroids
    enemies.push({
      type: 'asteroid',
      count: Math.floor(baseCount * 0.3),
      size: 'small',
      variant: this.selectRandomVariant(variants, waveNumber)
    });

    // Future: Add other enemy types here
    // if (waveNumber >= 15) {
    //   enemies.push({
    //     type: 'drone',
    //     count: 2,
    //     weapon: 'laser'
    //   });
    // }

    return { enemies };
  }

  /**
   * Selects a random variant weighted by wave number.
   *
   * @param {Array<string>} variants - Available variants
   * @param {number} waveNumber - Current wave
   * @returns {string} Selected variant
   */
  selectRandomVariant(variants, waveNumber) {
    // Higher waves have more chance of rare variants
    const roll = Math.random();

    if (waveNumber < 5) {
      return 'common'; // Early waves are mostly common
    }

    if (roll < 0.5) return 'common';
    if (roll < 0.7) return 'iron';
    if (roll < 0.85) return 'gold';
    if (roll < 0.95) return 'crystal';
    if (roll < 0.98 && variants.includes('volatile')) return 'volatile';
    if (variants.includes('parasite')) return 'parasite';

    return 'common';
  }

  /**
   * Starts the next wave.
   *
   * @returns {boolean} True if wave started successfully
   */
  startNextWave() {
    if (this.waveInProgress) {
      console.warn('[WaveManager] Cannot start wave - wave already in progress');
      return false;
    }

    this.currentWave++;
    this.waveInProgress = true;
    this.waveStartTime = Date.now();
    this.enemiesSpawnedThisWave = 0;
    this.enemiesKilledThisWave = 0;

    // Get wave configuration
    const config = this.waveConfigs.get(this.currentWave) ||
                   this.generateDynamicWave(this.currentWave);

    // Calculate total enemies for this wave
    this.totalEnemiesThisWave = config.enemies.reduce(
      (sum, group) => sum + group.count,
      0
    );

    // Emit wave start event
    if (this.eventBus) {
      this.eventBus.emit('wave-started', {
        wave: this.currentWave,
        totalEnemies: this.totalEnemiesThisWave,
        config: config
      });
    }

    // Spawn wave
    this.spawnWave(config);

    console.log(`[WaveManager] Started wave ${this.currentWave} (${this.totalEnemiesThisWave} enemies)`);
    return true;
  }

  /**
   * Spawns enemies for the current wave using the factory pattern.
   *
   * @param {Object} waveConfig - Wave configuration
   */
  spawnWave(waveConfig) {
    const worldBounds = this.enemySystem.getCachedWorld()?.getBounds() ||
                       { width: 800, height: 600 };
    const player = this.enemySystem.getCachedPlayer();
    const safeDistance = CONSTANTS.ASTEROID_SAFE_SPAWN_DISTANCE || 200;

    for (const enemyGroup of waveConfig.enemies) {
      for (let i = 0; i < enemyGroup.count; i++) {
        // Calculate safe spawn position
        const position = this.calculateSafeSpawnPosition(
          worldBounds,
          player,
          safeDistance
        );

        // Create enemy configuration
        const enemyConfig = {
          ...enemyGroup,
          x: position.x,
          y: position.y,
          wave: this.currentWave,
          spawnIndex: i
        };

        // Use factory if available, otherwise use legacy method
        let enemy;
        if (this.enemySystem.factory) {
          enemy = this.enemySystem.factory.create(enemyGroup.type, enemyConfig);
        } else {
          // Legacy: Direct Asteroid creation
          enemy = this.enemySystem.acquireAsteroid(enemyConfig);
        }

        if (enemy) {
          this.enemiesSpawnedThisWave++;
        }
      }
    }
  }

  /**
   * Calculates a safe spawn position away from player.
   *
   * @param {Object} bounds - World bounds
   * @param {Object} player - Player object
   * @param {number} safeDistance - Minimum distance from player
   * @returns {Object} {x, y} position
   */
  calculateSafeSpawnPosition(bounds, player, safeDistance) {
    const margin = 50;
    let x, y, attempts = 0;
    const maxAttempts = 10;

    do {
      // Random position at screen edges
      const edge = Math.floor(Math.random() * 4);

      switch (edge) {
        case 0: // Top
          x = Math.random() * bounds.width;
          y = -margin;
          break;
        case 1: // Right
          x = bounds.width + margin;
          y = Math.random() * bounds.height;
          break;
        case 2: // Bottom
          x = Math.random() * bounds.width;
          y = bounds.height + margin;
          break;
        case 3: // Left
          x = -margin;
          y = Math.random() * bounds.height;
          break;
      }

      attempts++;

      // Check distance from player
      if (player && player.x !== undefined && player.y !== undefined) {
        const dx = x - player.x;
        const dy = y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance >= safeDistance) {
          break;
        }
      } else {
        break; // No player, position is fine
      }

    } while (attempts < maxAttempts);

    return { x, y };
  }

  /**
   * Called when an enemy is destroyed.
   */
  onEnemyDestroyed() {
    this.enemiesKilledThisWave++;

    // Check if wave is complete
    if (this.enemiesKilledThisWave >= this.totalEnemiesThisWave) {
      this.completeWave();
    }
  }

  /**
   * Completes the current wave.
   */
  completeWave() {
    if (!this.waveInProgress) return;

    this.waveInProgress = false;
    this.waveEndTime = Date.now();
    const duration = (this.waveEndTime - this.waveStartTime) / 1000;

    // Emit wave complete event
    if (this.eventBus) {
      this.eventBus.emit('wave-complete', {
        wave: this.currentWave,
        duration: duration,
        enemiesKilled: this.enemiesKilledThisWave
      });
    }

    // Start countdown for next wave
    this.waveCountdown = this.waveDelay;

    console.log(`[WaveManager] Wave ${this.currentWave} complete in ${duration.toFixed(1)}s`);
  }

  /**
   * Updates the wave manager.
   *
   * @param {number} deltaTime - Time elapsed
   */
  update(deltaTime) {
    // Handle wave countdown
    if (!this.waveInProgress && this.waveCountdown > 0) {
      this.waveCountdown -= deltaTime;

      if (this.waveCountdown <= 0) {
        this.startNextWave();
      }
    }
  }

  /**
   * Resets the wave manager.
   */
  reset() {
    this.currentWave = 0;
    this.waveInProgress = false;
    this.wavePaused = false;
    this.waveStartTime = 0;
    this.waveEndTime = 0;
    this.enemiesSpawnedThisWave = 0;
    this.enemiesKilledThisWave = 0;
    this.totalEnemiesThisWave = 0;
    this.spawnTimer = 0;
    this.waveCountdown = 0;

    console.log('[WaveManager] Reset');
  }

  /**
   * Gets the current wave state.
   *
   * @returns {Object} Wave state
   */
  getState() {
    return {
      currentWave: this.currentWave,
      inProgress: this.waveInProgress,
      paused: this.wavePaused,
      spawned: this.enemiesSpawnedThisWave,
      killed: this.enemiesKilledThisWave,
      total: this.totalEnemiesThisWave,
      countdown: this.waveCountdown,
      progress: this.totalEnemiesThisWave > 0
        ? this.enemiesKilledThisWave / this.totalEnemiesThisWave
        : 0
    };
  }
}
