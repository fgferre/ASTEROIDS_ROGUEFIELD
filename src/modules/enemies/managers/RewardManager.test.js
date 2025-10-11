import { describe, expect, it, vi, afterEach } from 'vitest';
import { RewardManager } from './RewardManager.js';

function createBaseEnemy(overrides = {}) {
  return {
    type: 'asteroid',
    size: 'large',
    variant: 'common',
    radius: 24,
    x: 100,
    y: 150,
    wave: 3,
    ...overrides,
  };
}

describe('RewardManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates XP orb creation to the provided xpOrbSystem dependency', () => {
    const createXPOrb = vi.fn();
    const rewardManager = new RewardManager({
      xpOrbSystem: { createXPOrb },
    });

    rewardManager.dropRewards(createBaseEnemy());

    expect(createXPOrb).toHaveBeenCalled();
  });

  it('spawns a health heart when the drop chance check succeeds', () => {
    const spawnHeart = vi.fn();
    const createXPOrb = vi.fn();

    const deterministicRandom = {
      float: () => 0,
      range: (min) => min,
      chance: () => true,
      fork: () => deterministicRandom,
    };

    const rewardManager = new RewardManager({
      xpOrbSystem: { createXPOrb },
      healthHearts: { spawnHeart },
      random: deterministicRandom,
    });

    rewardManager.dropRewards(createBaseEnemy({ size: 'large', variant: 'gold' }));

    expect(spawnHeart).toHaveBeenCalledWith(100, 150);
  });
});
