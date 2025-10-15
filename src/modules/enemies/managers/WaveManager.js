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
import RandomService from '../../../core/RandomService.js';
import { normalizeDependencies, resolveService } from '../../../core/serviceUtils.js';

export class WaveManager {
  /**
   * Creates a new Wave Manager.
   *
   * @param {Object} enemySystem - Reference to EnemySystem
   * @param {Object} eventBus - Event bus for wave events
   */
  constructor(dependenciesOrEnemySystem = {}, legacyEventBus) {
    const isLegacySignature =
      arguments.length > 1 ||
      !dependenciesOrEnemySystem ||
      (typeof dependenciesOrEnemySystem === 'object' &&
        dependenciesOrEnemySystem !== null &&
        !('enemySystem' in dependenciesOrEnemySystem) &&
        !('eventBus' in dependenciesOrEnemySystem) &&
        !('random' in dependenciesOrEnemySystem));

    const dependencies = isLegacySignature
      ? {
          enemySystem: dependenciesOrEnemySystem,
          eventBus: legacyEventBus,
        }
      : dependenciesOrEnemySystem;

    this.dependencies = normalizeDependencies(dependencies);

    this.enemySystem =
      this.dependencies.enemySystem ||
      resolveService('enemies', this.dependencies) ||
      null;

    this.eventBus =
      this.dependencies.eventBus ||
      legacyEventBus ||
      resolveService('event-bus', this.dependencies) ||
      null;

    let resolvedRandom =
      this.dependencies.random ||
      (this.enemySystem &&
        typeof this.enemySystem.getRandomScope === 'function'
        ? this.enemySystem.getRandomScope('wave-manager', {
            label: 'wave-manager',
          })
        : null) ||
      resolveService('random', this.dependencies) ||
      null;

    if (!resolvedRandom || typeof resolvedRandom.float !== 'function') {
      resolvedRandom = new RandomService();
    }

    this.random = resolvedRandom;
    this.randomScopeLabels = {
      spawn: 'wave-manager:spawn',
      variants: 'wave-manager:variants',
      fragments: 'wave-manager:fragments',
    };
    this.randomScopeSeeds = {};
    this.randomScopes = this.createRandomScopes(this.random);
    this.captureRandomScopeSeeds();
    this.randomSequences = { spawn: 0, variants: 0, fragments: 0 };
    this._fallbackRandom = null;

    const enemyTypes = CONSTANTS.ENEMY_TYPES || {};
    this.enemyTypeKeys = {
      asteroid: 'asteroid',
      drone: enemyTypes.drone?.key || 'drone',
      mine: enemyTypes.mine?.key || 'mine',
      hunter: enemyTypes.hunter?.key || 'hunter',
    };
    this.enemyTypeDefaults = {
      drone: enemyTypes.drone || {},
      mine: enemyTypes.mine || {},
      hunter: enemyTypes.hunter || {},
    };

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

    // Later waves: Introduce variants and combatants
    for (let i = 7; i <= 12; i++) {
      const baseGroups = [
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
      ];

      const baseCount = this.computeBaseEnemyCount(i);

      if (i >= 8) {
        const droneCount = this.computeSupportCount('drone', i, baseCount);
        const droneGroup = this.createSupportGroup('drone', droneCount);
        if (droneGroup) {
          baseGroups.push(droneGroup);
        }
      }

      if (i >= 10) {
        const mineCount = this.computeSupportCount('mine', i, baseCount);
        const mineGroup = this.createSupportGroup('mine', mineCount);
        if (mineGroup) {
          baseGroups.push(mineGroup);
        }
      }

      configs.set(i, { enemies: baseGroups });
    }

    // Waves 13+: Dynamic generation
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
    const baseCount = this.computeBaseEnemyCount(waveNumber);

    // Variant distribution by difficulty
    const variants = ['common', 'iron', 'gold', 'crystal'];
    if (waveNumber >= 7) variants.push('volatile');
    if (waveNumber >= 10) variants.push('parasite');

    const enemies = [];
    const variantRandom = this.getRandomScope('variants');

    // Large asteroids
    enemies.push({
      type: 'asteroid',
      count: Math.max(1, Math.floor(baseCount * 0.3)),
      size: 'large',
      variant: this.selectRandomVariant(variants, waveNumber, variantRandom)
    });

    // Medium asteroids
    enemies.push({
      type: 'asteroid',
      count: Math.floor(baseCount * 0.4),
      size: 'medium',
      variant: this.selectRandomVariant(variants, waveNumber, variantRandom)
    });

    // Small asteroids
    enemies.push({
      type: 'asteroid',
      count: Math.floor(baseCount * 0.3),
      size: 'small',
      variant: this.selectRandomVariant(variants, waveNumber, variantRandom)
    });

    const supportWeights = this.computeSupportWeights(waveNumber);
    for (const support of supportWeights) {
      const supportCount = this.computeSupportCount(
        support.key,
        waveNumber,
        baseCount,
        support.weight
      );
      const supportGroup = this.createSupportGroup(support.key, supportCount);
      if (supportGroup) {
        enemies.push(supportGroup);
      }
    }

    return { enemies };
  }

  computeBaseEnemyCount(waveNumber) {
    const difficulty = Math.floor(waveNumber / 5);
    return 5 + difficulty * 2;
  }

  computeSupportWeights(waveNumber) {
    const weights = [];

    if (waveNumber >= 8) {
      const droneWeight = 1 + Math.max(0, (waveNumber - 8) * 0.08);
      weights.push({ key: 'drone', weight: droneWeight });
    }

    if (waveNumber >= 10) {
      const mineWeight = 1 + Math.max(0, (waveNumber - 10) * 0.07);
      weights.push({ key: 'mine', weight: mineWeight });
    }

    if (waveNumber >= 13) {
      const hunterWeight = 1 + Math.max(0, (waveNumber - 13) * 0.1);
      weights.push({ key: 'hunter', weight: hunterWeight });
    }

    return weights;
  }

  getBaselineSupportCount(kind, waveNumber, baseCount = this.computeBaseEnemyCount(waveNumber)) {
    switch (kind) {
      case 'drone':
        if (waveNumber < 8) return 0;
        if (waveNumber === 8) return 2;
        if (waveNumber === 9) return 3;
        if (waveNumber === 10) return 3;
        if (waveNumber === 11) return 4;
        if (waveNumber === 12) return 4;
        return Math.max(
          3 + Math.floor((waveNumber - 12) / 2),
          Math.max(2, Math.round(baseCount * 0.35))
        );
      case 'mine':
        if (waveNumber < 10) return 0;
        if (waveNumber === 10) return 2;
        if (waveNumber === 11) return 3;
        if (waveNumber === 12) return 3;
        return Math.max(
          3 + Math.floor((waveNumber - 12) / 3),
          Math.max(2, Math.round(baseCount * 0.25))
        );
      case 'hunter':
        if (waveNumber < 13) return 0;
        if (waveNumber === 13) return 1;
        if (waveNumber === 14) return 1;
        return Math.max(
          1 + Math.floor((waveNumber - 13) / 2),
          Math.max(1, Math.round(baseCount * 0.18))
        );
      default:
        return 0;
    }
  }

  computeSupportCount(
    kind,
    waveNumber,
    baseCount = this.computeBaseEnemyCount(waveNumber),
    weight = 1
  ) {
    const baseline = this.getBaselineSupportCount(kind, waveNumber, baseCount);
    if (baseline <= 0) {
      return 0;
    }

    const appliedWeight = Math.max(1, Number.isFinite(weight) ? weight : 1);
    const weighted = Math.round(baseline * appliedWeight);

    return Math.max(baseline, weighted);
  }

  createSupportGroup(kind, count) {
    if (!count || count <= 0) {
      return null;
    }

    const defaults = this.enemyTypeDefaults || {};

    switch (kind) {
      case 'drone': {
        const droneDefaults = defaults.drone || {};
        return {
          type: this.enemyTypeKeys?.drone || 'drone',
          count,
          fireRate: droneDefaults.fireRate,
          fireVariance: droneDefaults.fireVariance,
          fireSpread: droneDefaults.fireSpread,
          projectileSpeed: droneDefaults.projectileSpeed,
          projectileDamage: droneDefaults.projectileDamage,
          targetingRange: droneDefaults.targetingRange,
          speed: droneDefaults.speed,
          acceleration: droneDefaults.acceleration,
        };
      }
      case 'mine': {
        const mineDefaults = defaults.mine || {};
        return {
          type: this.enemyTypeKeys?.mine || 'mine',
          count,
          armTime: mineDefaults.armTime,
          proximityRadius: mineDefaults.proximityRadius,
          explosionRadius: mineDefaults.explosionRadius,
          explosionDamage: mineDefaults.explosionDamage,
          pulseSpeed: mineDefaults.pulseSpeed,
          pulseAmount: mineDefaults.pulseAmount,
          lifetime: mineDefaults.lifetime,
        };
      }
      case 'hunter': {
        const hunterDefaults = defaults.hunter || {};
        return {
          type: this.enemyTypeKeys?.hunter || 'hunter',
          count,
          preferredDistance: hunterDefaults.preferredDistance,
          burstCount: hunterDefaults.burstCount,
          burstInterval: hunterDefaults.burstInterval,
          burstDelay: hunterDefaults.burstDelay,
          fireSpread: hunterDefaults.fireSpread,
          projectileSpeed: hunterDefaults.projectileSpeed,
          projectileDamage: hunterDefaults.projectileDamage,
          fireRange: hunterDefaults.fireRange,
          speed: hunterDefaults.speed,
          acceleration: hunterDefaults.acceleration,
        };
      }
      default:
        return null;
    }
  }

  /**
   * Selects a random variant weighted by wave number.
   *
   * @param {Array<string>} variants - Available variants
   * @param {number} waveNumber - Current wave
   * @returns {string} Selected variant
   */
  selectRandomVariant(variants, waveNumber, random = this.getRandomScope('variants')) {
    const variantRandom = this.resolveScopedRandom(random, 'variants', 'variant-roll');

    // Higher waves have more chance of rare variants
    const roll = variantRandom.float();

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
        const spawnContext = this.createScopedRandom('spawn', 'wave-spawn');
        // Calculate safe spawn position
        const position = this.calculateSafeSpawnPosition(
          worldBounds,
          player,
          safeDistance,
          spawnContext.random
        );

        // Create enemy configuration
        const enemyConfig = {
          ...enemyGroup,
          x: position.x,
          y: position.y,
          wave: this.currentWave,
          spawnIndex: i
        };

        if (spawnContext.random?.fork) {
          enemyConfig.random = spawnContext.random.fork('asteroid-core');
          enemyConfig.randomScope = 'spawn';
        }

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
  calculateSafeSpawnPosition(bounds, player, safeDistance, random = this.getRandomScope('spawn')) {
    const spawnRandom = this.resolveScopedRandom(random, 'spawn', 'spawn-position');
    const margin = 50;
    let x, y, attempts = 0;
    const maxAttempts = 10;

    do {
      // Random position at screen edges
      const edge = spawnRandom.int(0, 3);

      switch (edge) {
        case 0: // Top
          x = spawnRandom.range(0, bounds.width);
          y = -margin;
          break;
        case 1: // Right
          x = bounds.width + margin;
          y = spawnRandom.range(0, bounds.height);
          break;
        case 2: // Bottom
          x = spawnRandom.range(0, bounds.width);
          y = bounds.height + margin;
          break;
        case 3: // Left
          x = -margin;
          y = spawnRandom.range(0, bounds.height);
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

  resolveScopedRandom(random, scope = 'base', label = scope) {
    if (random && typeof random.float === 'function') {
      return random;
    }

    const scoped = this.createScopedRandom(scope, label);
    if (scoped?.random && typeof scoped.random.float === 'function') {
      return scoped.random;
    }

    if (!this._fallbackRandom) {
      this._fallbackRandom = new RandomService('wave-manager:fallback');
    }

    return this._fallbackRandom;
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
    if (this.randomSequences) {
      this.randomSequences.spawn = 0;
      this.randomSequences.variants = 0;
      this.randomSequences.fragments = 0;
    }

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

  createRandomScopes(random) {
    let baseRandom = random;
    if (!baseRandom || typeof baseRandom.fork !== 'function') {
      baseRandom = new RandomService();
      this._fallbackRandom = baseRandom;
    }

    const spawnLabel = this.randomScopeLabels?.spawn || 'wave-manager:spawn';
    const variantLabel = this.randomScopeLabels?.variants || 'wave-manager:variants';
    const fragmentLabel = this.randomScopeLabels?.fragments || 'wave-manager:fragments';

    const scopes = {
      base: baseRandom,
      spawn: baseRandom.fork(spawnLabel),
      variants: baseRandom.fork(variantLabel),
      fragments: baseRandom.fork(fragmentLabel),
    };

    this.captureRandomScopeSeeds(scopes);

    return scopes;
  }

  getRandomService() {
    if (!this.randomScopes) {
      this.randomScopes = this.createRandomScopes(this.random);
      this.captureRandomScopeSeeds();
    }
    return this.randomScopes.base;
  }

  getRandomScope(scope) {
    if (!this.randomScopes) {
      this.randomScopes = this.createRandomScopes(this.random);
      this.captureRandomScopeSeeds();
    }

    return this.randomScopes[scope] || this.randomScopes.base;
  }

  nextRandomSequence(scope) {
    if (!this.randomSequences) {
      this.randomSequences = {};
    }

    if (typeof this.randomSequences[scope] !== 'number') {
      this.randomSequences[scope] = 0;
    }

    const sequence = this.randomSequences[scope];
    this.randomSequences[scope] += 1;
    return sequence;
  }

  createScopedRandom(scope = 'spawn', label = scope) {
    const generator = this.getRandomScope(scope);
    const sequence = this.nextRandomSequence(scope);

    if (generator && typeof generator.fork === 'function') {
      return {
        random: generator.fork(`wave-manager:${label}:${sequence}`),
        sequence,
      };
    }

    const fallback = this._fallbackRandom || new RandomService();
    this._fallbackRandom = fallback;

    return {
      random: fallback.fork(`wave-manager:${label}:${sequence}`),
      sequence,
    };
  }

  captureRandomScopeSeed(scope, generator) {
    if (!generator || typeof generator.seed !== 'number') {
      return;
    }

    if (!this.randomScopeSeeds) {
      this.randomScopeSeeds = {};
    }

    this.randomScopeSeeds[scope] = generator.seed >>> 0;
  }

  captureRandomScopeSeeds(scopes = this.randomScopes) {
    if (!scopes) {
      return;
    }

    Object.entries(scopes).forEach(([scope, generator]) => {
      this.captureRandomScopeSeed(scope, generator);
    });
  }

  reseedRandomScopes({ resetSequences = false } = {}) {
    if (!this.randomScopes) {
      this.randomScopes = this.createRandomScopes(this.random);
    }

    if (!this.randomScopeSeeds) {
      this.randomScopeSeeds = {};
      this.captureRandomScopeSeeds();
    }

    Object.entries(this.randomScopes).forEach(([scope, generator]) => {
      if (scope === 'base' || !generator || typeof generator.reset !== 'function') {
        return;
      }

      const storedSeed = this.randomScopeSeeds?.[scope];
      if (storedSeed !== undefined) {
        generator.reset(storedSeed);
      }
    });

    if (resetSequences && this.randomSequences) {
      Object.keys(this.randomSequences).forEach((scope) => {
        this.randomSequences[scope] = 0;
      });
    }
  }
}
