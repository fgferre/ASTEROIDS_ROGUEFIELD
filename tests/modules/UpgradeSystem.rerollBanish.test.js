import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ProgressionSystem from '../../src/modules/ProgressionSystem.js';
import RandomService from '../../src/core/RandomService.js';
import UPGRADE_LIBRARY from '../../src/data/upgrades/index.js';
import { UPGRADE_RARITIES } from '../../src/core/GameConstants.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { setupGlobalMocks, cleanupGlobalState } from '../__helpers__/setup.js';

const createProgression = (eventBus, level = 10) => {
  const progression = new ProgressionSystem({
    random: new RandomService(7),
    eventBus,
    player: {},
    ui: {},
    effects: {},
    'xp-orbs': { attachProgression: () => {} },
  });
  progression.level = level;
  return progression;
};

const ids = (options) => options.map((option) => option.id);

describe('level-up card rarity, reroll and banish', () => {
  let eventBus;
  let progression;

  beforeEach(() => {
    setupGlobalMocks();
    eventBus = createEventBusMock();
    progression = createProgression(eventBus);
  });

  afterEach(() => cleanupGlobalState());

  it('every upgrade has a known rarity and its option carries it', () => {
    UPGRADE_LIBRARY.forEach((upgrade) => {
      expect(UPGRADE_RARITIES).toContain(upgrade.rarity);
    });
    const { options } = progression.prepareUpgradeOptions(3);
    options.forEach((option) => {
      expect(option.rarity).toBe(
        UPGRADE_LIBRARY.find(({ id }) => id === option.id).rarity
      );
    });
  });

  it('a reroll replaces all three cards with new ones and is spent', () => {
    const rerolled = vi.fn();
    eventBus.on('upgrade-rerolled', rerolled);
    const before = ids(progression.prepareUpgradeOptions(3).options);

    const after = ids(progression.rerollUpgradeOptions());

    expect(after).toHaveLength(3);
    after.forEach((id) => expect(before).not.toContain(id));
    expect(ids(progression.pendingUpgradeOptions)).toEqual(after);
    expect(progression.rerollsLeft).toBe(0);
    expect(rerolled).toHaveBeenCalledWith(
      expect.objectContaining({ rerollsLeft: 0 })
    );
    expect(progression.rerollUpgradeOptions()).toBeNull();
  });

  it('a banish rerolls only that slot, removes the upgrade for the run and is spent', () => {
    const banished = vi.fn();
    eventBus.on('upgrade-banished', banished);
    const before = ids(progression.prepareUpgradeOptions(3).options);
    const target = before[1];

    const after = ids(progression.banishUpgrade(target));

    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(before).not.toContain(after[1]);
    expect(progression.banishesLeft).toBe(0);
    expect(banished).toHaveBeenCalledWith(
      expect.objectContaining({ upgradeId: target, banishesLeft: 0 })
    );
    for (let i = 0; i < 200; i += 1) {
      expect(ids(progression.prepareUpgradeOptions(3).options)).not.toContain(
        target
      );
    }
    expect(progression.banishUpgrade(after[0])).toBeNull();

    progression.reset();
    expect(progression.banishesLeft).toBe(1);
    expect(progression.rerollsLeft).toBe(1);
    expect(progression.banishedUpgrades.size).toBe(0);
  });
});
