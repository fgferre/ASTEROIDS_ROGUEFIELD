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

function createDeterministicRandom({ intValue = 1, chanceValue = false } = {}) {
  const random = {
    float: () => 0,
    range: (min) => min,
    int: () => intValue,
    chance: () => chanceValue,
  };

  random.fork = () => random;
  return random;
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

    const deterministicRandom = createDeterministicRandom({ chanceValue: true });

    const rewardManager = new RewardManager({
      xpOrbSystem: { createXPOrb },
      healthHearts: { spawnHeart },
      random: deterministicRandom,
    });

    rewardManager.dropRewards(createBaseEnemy({ size: 'large', variant: 'gold' }));

    expect(spawnHeart).toHaveBeenCalledWith(
      100,
      150,
      expect.objectContaining({
        random: deterministicRandom,
        pulsePhase: 0,
      })
    );
  });

  describe('New Enemy Types Rewards', () => {
    it('drops 2 XP orbs for drones at wave 1', () => {
      const createXPOrb = vi.fn();
      const deterministicRandom = createDeterministicRandom({ intValue: 2 });

      const rewardManager = new RewardManager({
        xpOrbSystem: { createXPOrb },
        random: deterministicRandom,
      });

      rewardManager.dropRewards(createBaseEnemy({ type: 'drone', size: undefined, variant: undefined, wave: 1 }));

      expect(createXPOrb).toHaveBeenCalledTimes(2);
      const xpValues = createXPOrb.mock.calls.map((call) => call[2]);
      expect(xpValues).toEqual([15, 15]);
      expect(xpValues.reduce((sum, value) => sum + value, 0)).toBe(30);
    });

    it('drops randomized XP orbs for mines using deterministic random', () => {
      const createXPOrb = vi.fn();
      const deterministicRandom = createDeterministicRandom({ intValue: 2 });

      const rewardManager = new RewardManager({
        xpOrbSystem: { createXPOrb },
        random: deterministicRandom,
      });

      rewardManager.dropRewards(createBaseEnemy({ type: 'mine', size: undefined, variant: undefined, wave: 1 }));

      expect(createXPOrb).toHaveBeenCalledTimes(2);
      const xpValues = createXPOrb.mock.calls.map((call) => call[2]);
      expect(xpValues).toEqual([12, 13]);
      expect(xpValues.reduce((sum, value) => sum + value, 0)).toBe(25);
    });

    it('drops 3 XP orbs for hunters at wave 1', () => {
      const createXPOrb = vi.fn();
      const deterministicRandom = createDeterministicRandom({ intValue: 3 });

      const rewardManager = new RewardManager({
        xpOrbSystem: { createXPOrb },
        random: deterministicRandom,
      });

      rewardManager.dropRewards(createBaseEnemy({ type: 'hunter', size: undefined, variant: undefined, wave: 1 }));

      expect(createXPOrb).toHaveBeenCalledTimes(3);
      const xpValues = createXPOrb.mock.calls.map((call) => call[2]);
      expect(xpValues).toEqual([16, 17, 17]);
      expect(xpValues.reduce((sum, value) => sum + value, 0)).toBe(50);
    });

    it('drops 10 XP orbs for bosses at wave 1', () => {
      const createXPOrb = vi.fn();
      const deterministicRandom = createDeterministicRandom({ intValue: 10 });

      const rewardManager = new RewardManager({
        xpOrbSystem: { createXPOrb },
        random: deterministicRandom,
      });

      rewardManager.dropRewards(createBaseEnemy({ type: 'boss', size: undefined, variant: undefined, wave: 1 }));

      expect(createXPOrb).toHaveBeenCalledTimes(10);
      const xpValues = createXPOrb.mock.calls.map((call) => call[2]);
      expect(xpValues.every((value) => value === 50)).toBe(true);
      expect(xpValues.reduce((sum, value) => sum + value, 0)).toBe(500);
    });

    it('applies wave bonus to drone rewards on wave 5', () => {
      const createXPOrb = vi.fn();
      const deterministicRandom = createDeterministicRandom({ intValue: 2 });

      const rewardManager = new RewardManager({
        xpOrbSystem: { createXPOrb },
        random: deterministicRandom,
      });

      rewardManager.dropRewards(createBaseEnemy({ type: 'drone', size: undefined, variant: undefined, wave: 5 }));

      expect(createXPOrb).toHaveBeenCalledTimes(3);
      const xpValues = createXPOrb.mock.calls.map((call) => call[2]);
      expect(xpValues).toEqual([15, 15, 15]);
      expect(xpValues.reduce((sum, value) => sum + value, 0)).toBe(45);
    });

    it('logs a warning when dropping rewards for unknown enemy types', () => {
      const createXPOrb = vi.fn();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const deterministicRandom = createDeterministicRandom({ intValue: 1 });

      const rewardManager = new RewardManager({
        xpOrbSystem: { createXPOrb },
        random: deterministicRandom,
      });

      rewardManager.dropRewards(createBaseEnemy({ type: 'unknown-type', size: undefined, variant: undefined }));

      expect(warnSpy).toHaveBeenCalledWith('[RewardManager] No reward config for type: unknown-type');
      expect(createXPOrb).not.toHaveBeenCalled();
    });

    it('allows hunters to drop health hearts when the chance check succeeds', () => {
      const createXPOrb = vi.fn();
      const spawnHeart = vi.fn();
      const deterministicRandom = createDeterministicRandom({ intValue: 3, chanceValue: true });

      const rewardManager = new RewardManager({
        xpOrbSystem: { createXPOrb },
        healthHearts: { spawnHeart },
        random: deterministicRandom,
      });

      rewardManager.dropRewards(createBaseEnemy({ type: 'hunter', size: undefined, variant: undefined }));

      expect(spawnHeart).toHaveBeenCalledWith(
        100,
        150,
        expect.objectContaining({
          enemyType: 'hunter',
        })
      );
    });
  });
});
