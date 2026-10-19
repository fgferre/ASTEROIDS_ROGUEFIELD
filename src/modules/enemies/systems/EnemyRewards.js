// src/modules/enemies/systems/EnemyRewards.js
// What the field pays out beyond the drop tables: the orbs around the player
// when a layer ends, and a defeated Warden's XP, milestone drop and loot.
import { ORB_VALUE } from '../../../data/enemies/asteroid-configs.js';

export class EnemyRewards {
  /**
   * @param {object} kit What the payouts read on EnemySystem: getEventBus,
   *   getRewardManager, getWaveState, getXPOrbs and getPlayer.
   */
  constructor(kit) {
    this.kit = kit;
  }

  // EnemySystem's state, under the names the reward code uses.
  get eventBus() {
    return this.kit.getEventBus();
  }

  get rewardManager() {
    return this.kit.getRewardManager();
  }

  get waveState() {
    return this.kit.getWaveState();
  }

  get xpOrbs() {
    return this.kit.getXPOrbs();
  }

  get player() {
    return this.kit.getPlayer();
  }

  emitBossSystemEvent(channel, eventName, payload) {
    if (!eventName || !channel) {
      return;
    }

    this.eventBus.emit(`${channel}-${eventName}`, payload);
  }

  mergeBossRewards(boss, override = {}) {
    const baseRewards =
      boss && boss.rewards && typeof boss.rewards === 'object'
        ? { ...boss.rewards }
        : {};

    if (override && typeof override === 'object') {
      if (override.xp != null) {
        baseRewards.xp = override.xp;
      }

      if (Array.isArray(override.lootTable)) {
        baseRewards.lootTable = [...override.lootTable];
      }
    }

    return baseRewards;
  }

  dropBossRewards(boss, rewards = {}) {
    if (!boss) {
      return;
    }

    const mergedRewards = this.mergeBossRewards(boss, rewards);
    const xpReward = Number.isFinite(mergedRewards.xp) ? mergedRewards.xp : 0;

    if (xpReward > 0) {
      this.spawnBossXPOrbs(boss, xpReward);
    }

    if (this.rewardManager.rewardConfigs.has('boss')) {
      this.rewardManager.dropRewards(boss);
    } else {
      this.rewardManager.createMilestoneReward(
        boss.x ?? 0,
        boss.y ?? 0,
        'boss_kill'
      );
    }

    if (
      Array.isArray(mergedRewards.lootTable) &&
      mergedRewards.lootTable.length > 0
    ) {
      this.emitBossSystemEvent('boss', 'loot-dropped', {
        enemy: boss,
        loot: [...mergedRewards.lootTable],
        wave: boss.wave ?? this.waveState?.current ?? null,
      });
    }

    return mergedRewards;
  }

  spawnBossXPOrbs(boss, xpAmount) {
    if (!boss || !Number.isFinite(xpAmount) || xpAmount <= 0) {
      return;
    }

    const xpOrbs = this.xpOrbs;
    const baseValue = ORB_VALUE || 5;
    const safeBaseValue = Math.max(1, baseValue);
    const orbCount = Math.max(1, Math.round(xpAmount / safeBaseValue));
    const valuePerOrb = Math.max(1, Math.floor(xpAmount / orbCount));
    let remainder = Math.max(0, Math.round(xpAmount - valuePerOrb * orbCount));

    const radius = Math.max(80, (boss.radius || 60) + 24);
    const originX = boss.x ?? 0;
    const originY = boss.y ?? 0;

    for (let i = 0; i < orbCount; i += 1) {
      const angle = (Math.PI * 2 * i) / orbCount;
      let value = valuePerOrb;
      if (remainder > 0) {
        value += 1;
        remainder -= 1;
      }

      const x = originX + Math.cos(angle) * radius;
      const y = originY + Math.sin(angle) * radius;

      try {
        xpOrbs.createXPOrb(x, y, value, {
          source: 'boss-reward',
          special: true,
          clusterId: boss.id ? `boss-${boss.id}` : 'boss-reward',
        });
      } catch (error) {
        console.warn('[EnemySystem] Failed to create boss XP orb', error);
        break;
      }
    }
  }

  grantWaveRewards() {
    const xpOrbs = this.xpOrbs;
    const player = this.player;
    const { current } = this.waveState;

    const orbCount = 4 + Math.floor(current / 2);

    for (let i = 0; i < orbCount; i++) {
      const angle = (i / orbCount) * Math.PI * 2;
      const distance = 100;
      xpOrbs.createXPOrb(
        player.position.x + Math.cos(angle) * distance,
        player.position.y + Math.sin(angle) * distance,
        20 + current * 5
      );
    }
  }
}
