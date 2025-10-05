/**
 * Reward Manager
 *
 * Manages XP orb drops and rewards from destroyed enemies.
 * Supports different reward strategies for different enemy types.
 *
 * Features:
 * - XP orb creation and placement
 * - Reward scaling by enemy type and wave
 * - Multiple reward strategies
 * - Bonus rewards for special conditions
 *
 * @example
 * ```javascript
 * const rewardManager = new RewardManager(enemySystem, xpOrbSystem);
 * rewardManager.dropRewards(enemy);
 * ```
 */

import * as CONSTANTS from '../../../core/GameConstants.js';

export class RewardManager {
  /**
   * Creates a new Reward Manager.
   *
   * @param {Object} enemySystem - Reference to EnemySystem
   * @param {Object} xpOrbSystem - Reference to XPOrbSystem
   */
  constructor(enemySystem, xpOrbSystem) {
    this.enemySystem = enemySystem;
    this.xpOrbSystem = xpOrbSystem;

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

    // Asteroid rewards (current implementation)
    configs.set('asteroid', {
      baseXP: (size) => {
        const xpValues = CONSTANTS.ASTEROID_XP_VALUES || {
          small: 5,
          medium: 15,
          large: 40
        };
        return xpValues[size] || 5;
      },
      orbCount: (size) => {
        const orbCounts = CONSTANTS.ASTEROID_XP_ORB_COUNTS || {
          small: 1,
          medium: 2,
          large: 4
        };
        return orbCounts[size] || 1;
      },
      variantMultiplier: (variant) => {
        const multipliers = CONSTANTS.ASTEROID_VARIANT_XP_MULTIPLIERS || {
          common: 1.0,
          iron: 1.2,
          gold: 2.0,
          crystal: 1.5,
          volatile: 1.3,
          parasite: 1.4
        };
        return multipliers[variant] || 1.0;
      }
    });

    // Future: Other enemy types
    // configs.set('drone', {
    //   baseXP: () => 30,
    //   orbCount: () => 2,
    //   variantMultiplier: () => 1.0
    // });

    // configs.set('turret', {
    //   baseXP: () => 50,
    //   orbCount: () => 3,
    //   variantMultiplier: () => 1.0
    // });

    // configs.set('boss', {
    //   baseXP: () => 500,
    //   orbCount: () => 10,
    //   variantMultiplier: () => 1.0
    // });

    return configs;
  }

  /**
   * Drops rewards for a destroyed enemy.
   *
   * @param {BaseEnemy} enemy - The destroyed enemy
   */
  dropRewards(enemy) {
    console.log('[RewardManager] dropRewards called:', {
      hasEnemy: !!enemy,
      enemyType: enemy?.type,
      enemySize: enemy?.size,
      enemyVariant: enemy?.variant,
      hasXPOrbSystem: !!this.xpOrbSystem
    });

    if (!enemy || !this.xpOrbSystem) return;

    const config = this.rewardConfigs.get(enemy.type);
    if (!config) {
      console.warn(`[RewardManager] No reward config for type: ${enemy.type}`);
      return;
    }

    // Calculate XP and orb count
    const baseXP = typeof config.baseXP === 'function'
      ? config.baseXP(enemy.size)
      : config.baseXP;

    const variantMultiplier = typeof config.variantMultiplier === 'function'
      ? config.variantMultiplier(enemy.variant)
      : 1.0;

    const orbCount = typeof config.orbCount === 'function'
      ? config.orbCount(enemy.size)
      : 1;

    const totalXP = Math.round(baseXP * variantMultiplier);
    const xpPerOrb = Math.floor(totalXP / orbCount);

    // Create XP orbs
    this.createXPOrbs(enemy, orbCount, xpPerOrb);

    // Rare health heart drop from tough enemies
    this.tryDropHealthHeart(enemy);

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
  createXPOrbs(enemy, count, xpPerOrb) {
    if (!this.xpOrbSystem || typeof this.xpOrbSystem.createXPOrb !== 'function') {
      console.warn('[RewardManager] XPOrbSystem not available or invalid');
      return;
    }

    for (let i = 0; i < count; i++) {
      // Spread orbs around the enemy position
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const distance = enemy.radius * 0.5 + Math.random() * enemy.radius;

      const orbX = enemy.x + Math.cos(angle) * distance;
      const orbY = enemy.y + Math.sin(angle) * distance;

      // Add some initial velocity for scatter effect
      const speed = 20 + Math.random() * 30;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      try {
        this.xpOrbSystem.createXPOrb(orbX, orbY, xpPerOrb, {
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
    if (!this.xpOrbSystem) return;

    const milestoneRewards = {
      'first_kill': 50,
      'wave_complete': 100,
      'perfect_wave': 200,
      'boss_kill': 500,
      'achievement': 150
    };

    const xpValue = milestoneRewards[milestone] || 100;

    try {
      this.xpOrbSystem.createXPOrb(x, y, xpValue, {
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

    if (totalBonus > 0 && this.xpOrbSystem) {
      // Create bonus orb at screen center
      const worldBounds = this.enemySystem.getCachedWorld()?.getBounds() ||
                         { width: 800, height: 600 };

      try {
        this.xpOrbSystem.createXPOrb(
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
  tryDropHealthHeart(enemy) {
    // Only from tough enemies (medium/large asteroids, special variants)
    const isToughEnemy =
      (enemy.size === 'medium' || enemy.size === 'large') ||
      (enemy.variant && ['gold', 'crystal', 'volatile', 'parasite'].includes(enemy.variant));

    if (!isToughEnemy) {
      return;
    }

    // Base drop rates:
    // - Large asteroids: 15% chance (increased for testing)
    // - Medium asteroids: 8% chance (increased for testing)
    // - Special variants: +5% bonus
    let dropChance = 0;

    if (enemy.size === 'large') {
      dropChance = 0.15; // 15%
    } else if (enemy.size === 'medium') {
      dropChance = 0.08; // 8%
    }

    // Bonus for special variants
    if (enemy.variant && ['gold', 'crystal', 'volatile', 'parasite'].includes(enemy.variant)) {
      dropChance += 0.05; // +5%
    }

    console.log(`[RewardManager] Checking heart drop: ${enemy.size} ${enemy.variant || 'common'} - chance: ${(dropChance * 100).toFixed(1)}%`);

    // Roll for drop
    if (Math.random() < dropChance) {
      const healthHeartSystem = typeof gameServices !== 'undefined'
        ? gameServices.get('healthHearts')
        : null;

      if (healthHeartSystem && typeof healthHeartSystem.spawnHeart === 'function') {
        healthHeartSystem.spawnHeart(enemy.x, enemy.y);
        console.log(`[RewardManager] ❤️ Health heart dropped from ${enemy.size} ${enemy.variant || 'common'} asteroid!`);
      } else {
        console.error('[RewardManager] HealthHeartSystem not available!');
      }
    }
  }
}
