/**
 * Reward Manager
 *
 * ARCHITECTURE: Centralized reward drop system that DECIDES what to drop.
 *
 * RESPONSIBILITIES:
 * - ✅ Listens to 'enemy-destroyed' events
 * - ✅ Decides WHAT to drop (XP orbs, health hearts, coins, etc.)
 * - ✅ Delegates to specialized systems for actual creation:
 *   - XP orbs → xpOrbSystem.createXPOrb()
 *   - Health hearts → healthHeartSystem.spawnHeart()
 *   - Future: Coins → coinSystem.createCoin()
 *
 * WHAT IT DOESN'T DO:
 * - ❌ Does NOT manage orb lifecycle (fusion, magnetism, rendering)
 * - ❌ That's XPOrbSystem's job
 *
 * This separation keeps the architecture clean and extensible.
 *
 * Features:
 * - XP orb drops (delegated to XPOrbSystem)
 * - Health heart drops (rare, from tough enemies)
 * - Reward scaling by enemy type, size, and variant
 * - Multiple reward strategies for different enemy types
 * - Extensible for future collectibles (coins, powerups, etc.)
 *
 * @example
 * ```javascript
 * const rewardManager = new RewardManager({ enemySystem, xpOrbSystem });
 * rewardManager.dropRewards(enemy);
 * ```
 */

import * as CONSTANTS from '../../../core/GameConstants.js';
import RandomService from '../../../core/RandomService.js';
import { normalizeDependencies, resolveService } from '../../../core/serviceUtils.js';

const TWO_PI = Math.PI * 2;

export class RewardManager {
 /**
   * Creates a new Reward Manager.
   *
   * @param {Object} dependencies - Object containing injected services
   * @param {Object} dependencies.enemySystem - Reference to EnemySystem
   * @param {Object} dependencies.xpOrbSystem - Reference to XPOrbSystem
   * @param {Object} dependencies.healthHearts - Reference to HealthHeartSystem
   *
   * Legacy signature `new RewardManager(enemySystem, xpOrbSystem, healthHearts)`
   * remains supported for backwards compatibility.
   */
  constructor(dependenciesOrEnemySystem = {}, xpOrbSystem, healthHearts) {
    const isLegacySignature = arguments.length > 1;
    const dependencies = isLegacySignature
      ? {
          enemySystem: dependenciesOrEnemySystem,
          xpOrbSystem,
          healthHearts,
        }
      : dependenciesOrEnemySystem;

    this.dependencies = normalizeDependencies(dependencies);

    this.enemySystem =
      this.dependencies.enemySystem ||
      this.dependencies.enemies ||
      resolveService('enemies', this.dependencies);

    this.xpOrbSystem =
      this.dependencies.xpOrbSystem ||
      this.dependencies['xp-orbs'] ||
      resolveService('xp-orbs', this.dependencies);

    this.healthHeartSystem =
      this.dependencies.healthHearts ||
      resolveService('healthHearts', this.dependencies);

    this.random =
      this.dependencies.random ||
      (this.enemySystem &&
        typeof this.enemySystem.getRandomScope === 'function'
        ? this.enemySystem.getRandomScope('enemy-rewards', {
            parentScope: 'fragments',
            label: 'enemy-rewards',
          })
        : null) ||
      resolveService('random', this.dependencies) ||
      null;

    if (!this.random || typeof this.random.float !== 'function') {
      this._fallbackRandom = new RandomService();
      this.random = this._fallbackRandom;
    } else {
      this._fallbackRandom = null;
    }

    this.initialRandomSeed =
      typeof this.random?.seed === 'number' && Number.isFinite(this.random.seed)
        ? this.random.seed >>> 0
        : undefined;

    this.randomSequence = 0;

    // Reward configurations
    this.rewardConfigs = this.loadRewardConfigurations();

    // Statistics
    this.stats = {
      totalOrbsDropped: 0,
      totalXPDropped: 0,
      dropsByType: new Map()
    };

    console.log('[RewardManager] Initialized');
  }

  /**
   * Loads reward configurations for different enemy types.
   *
   * @returns {Map<string, Object>} Reward configs by enemy type
   */
  loadRewardConfigurations() {
    const configs = new Map();

    // Asteroid rewards (matches XPOrbSystem orb-based logic)
    // Uses ORB VALUE (5 XP) × ORB COUNT (based on size)
    configs.set('asteroid', {
      orbValue: CONSTANTS.ORB_VALUE || 5, // Fixed XP per orb
      baseOrbs: (size) => {
        const base = CONSTANTS.ASTEROID_BASE_ORBS?.[size] ?? 1;
        return base;
      },
      sizeFactor: (size) => {
        const factors = CONSTANTS.ASTEROID_SIZE_ORB_FACTOR || {
          large: 3.0,
          medium: 2.0,
          small: 1.0
        };
        return factors[size] || 1.0;
      },
      variantMultiplier: (variant) => {
        // Use correct orbMultiplier from GameConstants
        const variantConfig = CONSTANTS.ASTEROID_VARIANTS[variant];
        return variantConfig?.orbMultiplier ?? 1.0;
      }
    });

    const droneRewards = CONSTANTS.ENEMY_REWARDS?.drone;
    // Drone rewards: 2 orbs base (10 XP) + wave bonus
    configs.set('drone', {
      orbValue: droneRewards?.orbValue ?? CONSTANTS.ORB_VALUE ?? 5,
      baseOrbs: () => droneRewards?.baseOrbs ?? 2,
      sizeFactor: () => 1.0,
      variantMultiplier: () => 1.0, // No variant scaling (yet)
    });

    const mineRewards = CONSTANTS.ENEMY_REWARDS?.mine;
    // Mine rewards: 1-2 orbs random (5-10 XP) + wave bonus
    configs.set('mine', {
      orbValue: mineRewards?.orbValue ?? CONSTANTS.ORB_VALUE ?? 5,
      baseOrbs: () => {
        const min = mineRewards?.baseOrbsMin ?? 1;
        const max = mineRewards?.baseOrbsMax ?? min;
        const random = this.getRandomService();
        if (random && typeof random.int === 'function') {
          return random.int(min, max);
        }
        return min;
      },
      sizeFactor: () => 1.0,
      variantMultiplier: () => 1.0,
    });

    const hunterRewards = CONSTANTS.ENEMY_REWARDS?.hunter;
    // Hunter rewards: 3 orbs base (15 XP) + wave bonus
    configs.set('hunter', {
      orbValue: hunterRewards?.orbValue ?? CONSTANTS.ORB_VALUE ?? 5,
      baseOrbs: () => hunterRewards?.baseOrbs ?? 3,
      sizeFactor: () => 1.0,
      variantMultiplier: () => 1.0, // No variant scaling (yet)
    });

    const bossRewards = CONSTANTS.ENEMY_REWARDS?.boss;
    // Boss rewards: 10 orbs base (50 XP) + wave bonus. Note: BOSS_CONFIG.rewards.xp (500) is for future loot system, not orb-based XP.
    configs.set('boss', {
      orbValue: bossRewards?.orbValue ?? CONSTANTS.ORB_VALUE ?? 5,
      baseOrbs: () => bossRewards?.baseOrbs ?? 10,
      sizeFactor: () => 1.0,
      variantMultiplier: (variant) => {
        // Boss phases could have different multipliers in the future
        return 1.0;
      },
    });

    return configs;
  }

  /**
   * Drops rewards for a destroyed enemy.
   *
   * @param {BaseEnemy} enemy - The destroyed enemy
   */
  dropRewards(enemy) {
    if (!enemy) return;

    const xpOrbSystem = this.getXPOrbSystem();
    if (!xpOrbSystem) return;

    const config = this.rewardConfigs.get(enemy.type);
    if (!config) {
      console.warn(`[RewardManager] No reward config for type: ${enemy.type}`);
      return;
    }

    // Calculate orb count using orb-based system (matches XPOrbSystem logic)
    const orbValue = config.orbValue || 5;
    const baseOrbs = typeof config.baseOrbs === 'function'
      ? config.baseOrbs(enemy.size)
      : 1;
    const sizeFactor = typeof config.sizeFactor === 'function'
      ? config.sizeFactor(enemy.size)
      : 1.0;
    const variantMultiplier = typeof config.variantMultiplier === 'function'
      ? config.variantMultiplier(enemy.variant)
      : 1.0;

    // Wave scaling: +1 orb per 5 waves (same as XPOrbSystem)
    const wave = enemy.wave || 1;
    const waveBonus = wave <= 10
      ? Math.floor(wave / 5)
      : Math.floor((wave - 10) / 3) + 2;

    // Final orb count
    const orbCount = Math.max(1, Math.round(baseOrbs * sizeFactor * variantMultiplier + waveBonus));
    const totalXP = orbCount * orbValue;
    const xpPerOrb = orbValue;

    const dropRandomContext = this.createDropRandomContext(enemy);

    // Create XP orbs
    this.createXPOrbs(enemy, orbCount, xpPerOrb, dropRandomContext);

    // Rare health heart drop from tough enemies
    this.tryDropHealthHeart(enemy, dropRandomContext);

    // Update statistics
    this.updateStats(enemy.type, orbCount, totalXP);
  }

  /**
   * Creates XP orbs at the enemy's position.
   *
   * @param {BaseEnemy} enemy - The enemy
   * @param {number} count - Number of orbs to create
   * @param {number} xpPerOrb - XP value per orb
   */
  createXPOrbs(enemy, count, xpPerOrb, randomContext = null) {
    const xpOrbSystem = this.getXPOrbSystem();
    if (!xpOrbSystem || typeof xpOrbSystem.createXPOrb !== 'function') {
      console.warn('[RewardManager] XPOrbSystem not available or invalid');
      return;
    }

    const context = randomContext || this.createDropRandomContext(enemy);
    const placementRandom = context?.placement || context?.base;
    const velocityRandom = context?.velocity || context?.base;
    const radius = Number.isFinite(enemy?.radius) ? enemy.radius : 0;
    const total = Math.max(count, 1);

    for (let i = 0; i < count; i += 1) {
      const orbPlacementRandom = this.forkRandom(placementRandom, `orb-${i}`) || placementRandom;
      const orbVelocityRandom = this.forkRandom(velocityRandom, `orb-${i}`) || velocityRandom;

      const angleOffset = this.randomRange(orbPlacementRandom, 0, 0.3);
      const angle = (TWO_PI * i) / total + angleOffset;
      const distance = radius * 0.5 + this.randomRange(orbPlacementRandom, 0, radius);

      const orbX = enemy.x + Math.cos(angle) * distance;
      const orbY = enemy.y + Math.sin(angle) * distance;

      const speed = 20 + this.randomRange(orbVelocityRandom, 0, 30);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      try {
        xpOrbSystem.createXPOrb(orbX, orbY, xpPerOrb, {
          vx: vx,
          vy: vy,
          fromEnemy: enemy.type,
          enemySize: enemy.size,
          enemyVariant: enemy.variant
        });
      } catch (error) {
        console.error('[RewardManager] Failed to create XP orb:', error);
      }
    }
  }

  /**
   * Updates reward statistics.
   *
   * @param {string} type - Enemy type
   * @param {number} orbCount - Number of orbs dropped
   * @param {number} xpAmount - Total XP dropped
   */
  updateStats(type, orbCount, xpAmount) {
    this.stats.totalOrbsDropped += orbCount;
    this.stats.totalXPDropped += xpAmount;

    if (!this.stats.dropsByType.has(type)) {
      this.stats.dropsByType.set(type, {
        orbs: 0,
        xp: 0
      });
    }

    const typeStats = this.stats.dropsByType.get(type);
    typeStats.orbs += orbCount;
    typeStats.xp += xpAmount;
  }

  /**
   * Gets reward statistics.
   *
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      totalOrbsDropped: this.stats.totalOrbsDropped,
      totalXPDropped: this.stats.totalXPDropped,
      dropsByType: Object.fromEntries(this.stats.dropsByType)
    };
  }

  /**
   * Resets statistics.
   */
  resetStats() {
    this.stats.totalOrbsDropped = 0;
    this.stats.totalXPDropped = 0;
    this.stats.dropsByType.clear();

    console.log('[RewardManager] Statistics reset');
  }

  /**
   * Calculates bonus rewards for special conditions.
   *
   * @param {BaseEnemy} enemy - The enemy
   * @param {Object} context - Additional context (combo, perfect wave, etc.)
   * @returns {number} Bonus multiplier
   */
  calculateBonusMultiplier(enemy, context = {}) {
    let multiplier = 1.0;

    // Combo bonus
    if (context.combo && context.combo > 1) {
      multiplier *= Math.min(1 + (context.combo * 0.1), 2.0);
    }

    // Perfect wave bonus (no damage taken)
    if (context.perfectWave) {
      multiplier *= 1.5;
    }

    // Quick kill bonus
    if (context.killTime && context.killTime < 2.0) {
      multiplier *= 1.2;
    }

    // Boss bonus
    if (enemy.hasTag && enemy.hasTag('boss')) {
      multiplier *= 3.0;
    }

    return multiplier;
  }

  /**
   * Creates special reward for achieving milestones.
   *
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {string} milestone - Milestone type
   */
  createMilestoneReward(x, y, milestone) {
    const xpOrbSystem = this.getXPOrbSystem();
    if (!xpOrbSystem) return;

    const milestoneRewards = {
      'first_kill': 50,
      'wave_complete': 100,
      'perfect_wave': 200,
      'boss_kill': 500,
      'achievement': 150
    };

    const xpValue = milestoneRewards[milestone] || 100;

    try {
      xpOrbSystem.createXPOrb(x, y, xpValue, {
        special: true,
        milestone: milestone,
        vx: 0,
        vy: 0
      });
    } catch (error) {
      console.error('[RewardManager] Failed to create milestone reward:', error);
    }
  }

  /**
   * Handles wave completion rewards.
   *
   * @param {number} waveNumber - Completed wave number
   * @param {Object} waveStats - Wave statistics
   */
  handleWaveRewards(waveNumber, waveStats = {}) {
    // Base wave completion bonus
    const baseBonus = 50 + (waveNumber * 10);

    // Perfect wave bonus
    const perfectBonus = waveStats.damageTaken === 0 ? baseBonus : 0;

    // Time bonus (faster completion)
    const timeBonus = waveStats.duration && waveStats.duration < 30
      ? Math.floor(baseBonus * 0.5)
      : 0;

    const totalBonus = baseBonus + perfectBonus + timeBonus;

    const xpOrbSystem = this.getXPOrbSystem();
    const enemySystem = this.getEnemySystem();

    if (totalBonus > 0 && xpOrbSystem) {
      // Create bonus orb at screen center
      const worldBounds = enemySystem?.getCachedWorld()?.getBounds() ||
                         { width: 800, height: 600 };

      try {
        xpOrbSystem.createXPOrb(
          worldBounds.width / 2,
          worldBounds.height / 2,
          totalBonus,
          {
            special: true,
            waveBonus: true,
            wave: waveNumber
          }
        );
      } catch (error) {
        console.error('[RewardManager] Failed to create wave bonus:', error);
      }

      console.log(`[RewardManager] Wave ${waveNumber} bonus: ${totalXP} XP`);
    }
  }

  /**
   * Attempts to drop a rare health heart from tough enemies.
   *
   * @param {BaseEnemy} enemy - The destroyed enemy
   */
  tryDropHealthHeart(enemy, randomContext = null) {
    const specialAsteroidVariants = ['gold', 'crystal', 'volatile', 'parasite'];
    const isAsteroid = enemy.type === 'asteroid';
    const isToughAsteroid =
      isAsteroid &&
      ((enemy.size === 'medium' || enemy.size === 'large') ||
        (enemy.variant && specialAsteroidVariants.includes(enemy.variant)));

    // Tough enemies: large/medium asteroids, special variants, hunters, bosses
    const isToughEnemy =
      isToughAsteroid ||
      enemy.type === 'hunter' ||
      enemy.type === 'boss';

    if (!isToughEnemy) {
      return;
    }

    let dropChance = 0;
    const rewardConfig = CONSTANTS.ENEMY_REWARDS?.[enemy.type];
    if (rewardConfig && typeof rewardConfig.healthHeartChance === 'number') {
      dropChance = rewardConfig.healthHeartChance;
    }

    if (isAsteroid) {
      if (enemy.size === 'large') {
        dropChance = 0.05; // 5% - rare
      } else if (enemy.size === 'medium') {
        dropChance = 0.02; // 2% - very rare
      }

      if (enemy.variant && specialAsteroidVariants.includes(enemy.variant)) {
        dropChance += 0.03; // +3% bonus
      }
    }

    const sizeLabel = enemy.size || 'N/A';
    const variantLabel = enemy.variant || 'common';
    console.log(`[RewardManager] Checking heart drop: ${enemy.type} ${sizeLabel} ${variantLabel} - chance: ${(dropChance * 100).toFixed(1)}%`);

    const context = randomContext || this.createDropRandomContext(enemy);
    const heartRandom = context?.heart || context?.base;
    const shouldDrop = this.randomChance(heartRandom, dropChance);

    if (shouldDrop) {
      const healthHeartSystem = this.getHealthHeartSystem();

      if (healthHeartSystem && typeof healthHeartSystem.spawnHeart === 'function') {
        const pulsePhase = this.randomRange(heartRandom, 0, TWO_PI);
        healthHeartSystem.spawnHeart(enemy.x, enemy.y, {
          random: heartRandom,
          pulsePhase,
          source: 'enemy-drop',
          enemyType: enemy.type,
          enemySize: enemy.size,
        });
        console.log(`[RewardManager] ❤️ Health heart dropped from ${enemy.type} (${sizeLabel} ${variantLabel})!`);
      } else {
        console.error('[RewardManager] HealthHeartSystem not available!');
      }
    }
  }

  getXPOrbSystem() {
    if (!this.xpOrbSystem) {
      this.xpOrbSystem =
        this.dependencies.xpOrbSystem ||
        this.dependencies['xp-orbs'] ||
        resolveService('xp-orbs', this.dependencies);
    }

    return this.xpOrbSystem;
  }

  getHealthHeartSystem() {
    if (!this.healthHeartSystem) {
      this.healthHeartSystem =
        this.dependencies.healthHearts ||
        resolveService('healthHearts', this.dependencies);
    }

    return this.healthHeartSystem;
  }

  getEnemySystem() {
    if (!this.enemySystem) {
      this.enemySystem =
        this.dependencies.enemySystem ||
        this.dependencies.enemies ||
        resolveService('enemies', this.dependencies);
    }

    return this.enemySystem;
  }

  getRandomService() {
    if (this.random && typeof this.random.float === 'function') {
      return this.random;
    }

    if (!this._fallbackRandom) {
      this._fallbackRandom = new RandomService();
    }

    this.random = this._fallbackRandom;
    return this.random;
  }

  createDropRandom(label) {
    const baseRandom = this.getRandomService();
    const sequence = this.randomSequence++;
    const scope = `reward:${label}:${sequence}`;

    if (baseRandom && typeof baseRandom.fork === 'function') {
      return baseRandom.fork(scope);
    }

    if (!this._fallbackRandom) {
      this._fallbackRandom = new RandomService(sequence + 1);
    }

    if (typeof this._fallbackRandom.fork === 'function') {
      return this._fallbackRandom.fork(scope);
    }

    this._fallbackRandom.reset(sequence + 1);
    return this._fallbackRandom;
  }

  createDropRandomContext(enemy) {
    const sequence = this.randomSequence;
    const identifier =
      enemy?.id !== undefined && enemy?.id !== null
        ? enemy.id
        : `sequence-${sequence}`;
    const labelParts = [
      enemy?.type || 'enemy',
      enemy?.variant || 'common',
      enemy?.size || 'unknown',
      identifier,
      `wave-${enemy?.wave ?? 0}`
    ];
    const label = labelParts.filter(Boolean).join(':');
    const base = this.createDropRandom(label);

    if (!base || typeof base.fork !== 'function') {
      return {
        base,
        placement: base,
        velocity: base,
        heart: base,
      };
    }

    return {
      base,
      placement: base.fork('placement'),
      velocity: base.fork('velocity'),
      heart: base.fork('heart'),
    };
  }

  forkRandom(random, scope) {
    if (!random || typeof random.fork !== 'function') {
      return null;
    }

    if (!scope) {
      return random;
    }

    return random.fork(scope);
  }

  randomRange(random, min, max) {
    const rng = random && typeof random.range === 'function' ? random : this.getRandomService();
    if (!rng || typeof rng.range !== 'function') {
      const fallback = this.getRandomService();
      if (fallback && typeof fallback.range === 'function') {
        return fallback.range(min, max);
      }
      return min;
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return min;
    }

    if (max === min) {
      return min;
    }

    return rng.range(min, max);
  }

  randomChance(random, probability) {
    const rng = random && typeof random.chance === 'function' ? random : this.getRandomService();
    if (!rng || typeof rng.chance !== 'function') {
      if (!this._fallbackRandom) {
        this._fallbackRandom = new RandomService();
      }
      return this._fallbackRandom.chance(probability);
    }

    return rng.chance(probability);
  }

  reseedRandom(random = this.random) {
    if (random && typeof random.float === 'function') {
      this.random = random;
    } else if (this._fallbackRandom) {
      this.random = this._fallbackRandom;
    }

    if (!this.random) {
      return;
    }

    if (
      this.initialRandomSeed === undefined &&
      typeof this.random.seed === 'number' &&
      Number.isFinite(this.random.seed)
    ) {
      this.initialRandomSeed = this.random.seed >>> 0;
    }

    if (
      this.initialRandomSeed !== undefined &&
      typeof this.random.reset === 'function'
    ) {
      this.random.reset(this.initialRandomSeed);
    }

    this.randomSequence = 0;
  }
}
