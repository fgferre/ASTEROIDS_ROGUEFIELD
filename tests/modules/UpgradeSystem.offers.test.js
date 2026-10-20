import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import ProgressionSystem from '../../src/modules/ProgressionSystem.js';
import RandomService from '../../src/core/RandomService.js';
import { WEAPON_CARD_IDS } from '../../src/data/upgrades/index.js';
import {
  UPGRADE_RARITY_BASE_WEIGHTS,
  UPGRADE_RARITY_WEIGHT_CAPS,
  UPGRADE_FAMILY_STEER_PER_CARD,
  UPGRADE_WEAPON_OFFER_LEVELS,
} from '../../src/core/GameConstants.js';
import { FAMILY_APEX_THRESHOLD } from '../../src/data/upgrades/families.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { setupGlobalMocks, cleanupGlobalState } from '../__helpers__/setup.js';

const createProgression = (level, seed = 7) => {
  const progression = new ProgressionSystem({
    random: new RandomService(seed),
    eventBus: createEventBusMock(),
    player: {},
    ui: {},
    effects: {},
    'xp-orbs': { attachProgression: () => {} },
  });
  progression.level = level;
  return progression;
};

const card = (progression, id) => progression.upgradeLookup.get(id);
const ofFamily = (progression, family) =>
  progression.upgradeDefinitions
    .filter((definition) => definition.family === family)
    .map(({ id }) => id);
const offerIds = (progression, level = progression.level) =>
  progression.prepareUpgradeOptions(3, { level }).options.map(({ id }) => id);

describe('level-up offers', () => {
  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());

  it("each card weighs its rarity's weight, not split by how many cards share the tier", () => {
    const progression = createProgression(1);
    // Fresh run: no family steering, so a card weighs its rarity alone.
    expect(progression.getDrawWeight(card(progression, 'shield'))).toBe(
      UPGRADE_RARITY_BASE_WEIGHTS.common
    );
    expect(progression.getDrawWeight(card(progression, 'plasma'))).toBe(
      UPGRADE_RARITY_BASE_WEIGHTS.rare
    );
    expect(progression.getDrawWeight(card(progression, 'multishot'))).toBe(
      UPGRADE_RARITY_BASE_WEIGHTS.epic
    );
    // Higher levels lift rare and epic up to their caps; common stays put.
    progression.level = 11;
    expect(
      progression.getDrawWeight(card(progression, 'multishot'))
    ).toBeCloseTo(0.45, 10);
    expect(progression.getDrawWeight(card(progression, 'plasma'))).toBeCloseTo(
      0.65,
      10
    );
    progression.level = 60;
    expect(progression.getDrawWeight(card(progression, 'multishot'))).toBe(
      UPGRADE_RARITY_WEIGHT_CAPS.epic
    );
    expect(progression.getDrawWeight(card(progression, 'plasma'))).toBe(
      UPGRADE_RARITY_WEIGHT_CAPS.rare
    );
    expect(progression.getDrawWeight(card(progression, 'shield'))).toBe(
      UPGRADE_RARITY_BASE_WEIGHTS.common
    );

    // A tier comes up in proportion to its cards × their weight.
    progression.level = 1;
    const pool = progression.getEligibleUpgradeDefinitions();
    const total = pool.reduce(
      (sum, d) => sum + progression.getDrawWeight(d),
      0
    );
    const expectedCommon =
      pool.filter(({ rarity }) => rarity === 'common').length / total;
    let commons = 0;
    const rolls = 4000;
    for (let i = 0; i < rolls; i += 1) {
      const [option] = progression.prepareUpgradeOptions(1).options;
      if (option.rarity === 'common') commons += 1;
    }
    expect(commons / rolls).toBeCloseTo(expectedCommon, 1);
  });

  it('a card weighs ×(1 + 0.5k) while the run holds k = 1..4 distinct cards of its family, ×1 from the Apex on', () => {
    const progression = createProgression(10);
    const thermal = ofFamily(progression, 'thermal');
    const heatSink = card(progression, 'heat_sink');
    const shield = card(progression, 'shield');
    const base = progression.getDrawWeight(heatSink);

    for (let k = 1; k < FAMILY_APEX_THRESHOLD; k += 1) {
      progression.appliedUpgrades.set(
        thermal.filter((id) => id !== 'heat_sink')[k - 1],
        1
      );
      expect(progression.getDrawWeight(heatSink)).toBeCloseTo(
        base * (1 + UPGRADE_FAMILY_STEER_PER_CARD * k),
        10
      );
    }
    // Owning a rank of the card itself counts it among the family's cards.
    progression.appliedUpgrades.set('heat_sink', 1);
    expect(progression.getFamilyCounts().thermal).toBe(FAMILY_APEX_THRESHOLD);
    expect(progression.getDrawWeight(heatSink)).toBe(base);
    // Another family's card is not steered.
    expect(progression.getDrawWeight(shield)).toBe(
      UPGRADE_RARITY_BASE_WEIGHTS.common
    );
  });

  it('every offer holds a card the run does not own yet, while any remain', () => {
    const progression = createProgression(10);
    // Own one rank of every card but Magnetic Field (one weapon card, which
    // rules the other out).
    progression.upgradeDefinitions
      .filter(({ id }) => id !== 'magfield' && id !== WEAPON_CARD_IDS[1])
      .forEach(({ id }) => progression.appliedUpgrades.set(id, 1));
    expect(
      progression
        .getEligibleUpgradeDefinitions()
        .filter(({ id }) => progression.getUpgradeCount(id) === 0)
        .map(({ id }) => id)
    ).toEqual(['magfield']);

    for (let i = 0; i < 100; i += 1) {
      expect(offerIds(progression)).toContain('magfield');
    }

    // None left to find: offers still fill with owned cards.
    progression.appliedUpgrades.set('magfield', 1);
    expect(offerIds(progression)).toHaveLength(3);
  });

  it('the level-3 offer holds a weapon card while the run has none; if declined, the level-7 offer again', () => {
    const [first, second] = UPGRADE_WEAPON_OFFER_LEVELS;
    const hasWeapon = (ids) => ids.some((id) => WEAPON_CARD_IDS.includes(id));
    const slots = new Set();
    for (let seed = 1; seed <= 40; seed += 1) {
      const progression = createProgression(first, seed);
      const ids = offerIds(progression);
      expect(hasWeapon(ids)).toBe(true);
      slots.add(ids.findIndex((id) => WEAPON_CARD_IDS.includes(id)));

      // Declined: still none owned at the second chance.
      progression.level = second;
      expect(hasWeapon(offerIds(progression))).toBe(true);
    }
    // The weapon card lands in any slot, not always the first.
    expect(slots.size).toBe(3);

    // Between and after, weapon cards draw as normal: some offers have none.
    const later = createProgression(first + 1);
    const plain = Array.from({ length: 60 }, () => offerIds(later));
    expect(plain.some((ids) => !hasWeapon(ids))).toBe(true);

    // Taken at level 3: the level-7 offer holds no weapon card.
    const armed = createProgression(second);
    armed.appliedUpgrades.set(WEAPON_CARD_IDS[0], 1);
    for (let i = 0; i < 40; i += 1) {
      expect(hasWeapon(offerIds(armed))).toBe(false);
    }
  });
});
