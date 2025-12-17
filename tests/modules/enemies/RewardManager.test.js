import { describe, expect, it, vi, afterEach } from 'vitest';
import { RewardManager } from '../../../src/modules/enemies/managers/RewardManager.js';
import { createDeterministicRandom } from '../../__helpers__/stubs.js';
import { createTestEnemy } from '../../__helpers__/fixtures.js';

describe('RewardManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates XP orb creation to the provided xpOrbSystem dependency', () => {
    const createXPOrb = vi.fn();
    const rewardManager = new RewardManager({
      xpOrbSystem: { createXPOrb },
    });

    rewardManager.dropRewards(createTestEnemy('asteroid', { wave: 3 }));

    expect(createXPOrb).toHaveBeenCalled();
  });

  it('spawns a health heart when the drop chance check succeeds', () => {
    const spawnHeart = vi.fn();
    const createXPOrb = vi.fn();

    const deterministicRandom = createDeterministicRandom({
      chanceValue: true,
    });

    const rewardManager = new RewardManager({
      xpOrbSystem: { createXPOrb },
      healthHearts: { spawnHeart },
      random: deterministicRandom,
    });

    rewardManager.dropRewards(
      createTestEnemy('asteroid', { size: 'large', variant: 'gold', wave: 3 })
    );

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

      rewardManager.dropRewards(createTestEnemy('drone', { wave: 1 }));

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

      rewardManager.dropRewards(createTestEnemy('mine', { wave: 1 }));

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

      rewardManager.dropRewards(createTestEnemy('hunter', { wave: 1 }));

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

      rewardManager.dropRewards(createTestEnemy('boss', { wave: 1 }));

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

      rewardManager.dropRewards(createTestEnemy('drone', { wave: 5 }));

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

      rewardManager.dropRewards(
        createTestEnemy('asteroid', { type: 'unknown-type', wave: 3 })
      );

      expect(warnSpy).toHaveBeenCalledWith(
        '[RewardManager] No reward config for type: unknown-type'
      );
      expect(createXPOrb).not.toHaveBeenCalled();
    });

    it('allows hunters to drop health hearts when the chance check succeeds', () => {
      const createXPOrb = vi.fn();
      const spawnHeart = vi.fn();
      const deterministicRandom = createDeterministicRandom({
        intValue: 3,
        chanceValue: true,
      });

      const rewardManager = new RewardManager({
        xpOrbSystem: { createXPOrb },
        healthHearts: { spawnHeart },
        random: deterministicRandom,
      });

      rewardManager.dropRewards(createTestEnemy('hunter', { wave: 3 }));

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
