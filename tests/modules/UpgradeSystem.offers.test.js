import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import ProgressionSystem from '../../src/modules/ProgressionSystem.js';
import RandomService from '../../src/core/RandomService.js';
import { listContent } from '../../src/content/registry.js';
import { WEAPON_CARD_IDS } from '../../src/data/upgrades/index.js';
import {
  UPGRADE_RARITY_BASE_WEIGHTS,
  UPGRADE_RARITY_WEIGHT_CAPS,
  UPGRADE_FAMILY_STEER_PER_CARD,
  UPGRADE_WEAPON_OFFER_LEVELS,
  UPGRADE_PILOT_OFFER_EVERY,
  UPGRADE_CARD_SLOTS,
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
    // The old flight's draw: the card slots are the new flight's cap.
    progression.pilotCardIds = [];
    // Own one rank of every card but Magnetic Field (one weapon card, which
    // rules the other out).
    progression.upgradeDefinitions
      .filter(
        ({ id, fallback }) =>
          !fallback && id !== 'magfield' && id !== WEAPON_CARD_IDS[1]
      )
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
    // A reroll avoids the other current cards but keeps the only new one.
    const before = offerIds(progression);
    const rerolled = progression.rerollUpgradeOptions().map(({ id }) => id);
    expect(rerolled).toContain('magfield');
    rerolled
      .filter((id) => id !== 'magfield')
      .forEach((id) => expect(before).not.toContain(id));

    // None left to find: offers still fill with owned cards.
    progression.appliedUpgrades.set('magfield', 1);
    expect(offerIds(progression)).toHaveLength(3);
  });

  it('every UPGRADE_PILOT_OFFER_EVERY levels one slot holds a step of the piloting trail; between, none', () => {
    const level = UPGRADE_PILOT_OFFER_EVERY * 2;
    const pilots = createProgression(1).pilotCardIds;
    const holds = (progression) =>
      offerIds(progression).some((id) => pilots.includes(id));
    for (let seed = 1; seed <= 40; seed += 1) {
      expect(holds(createProgression(level, seed))).toBe(true);
    }
    const between = createProgression(level + 1);
    const plain = Array.from({ length: 60 }, () => holds(between));
    expect(plain.some((held) => held)).toBe(false);
  });

  it('the trail offers only the steps toward the Flight Computer until it is held', () => {
    const level = UPGRADE_PILOT_OFFER_EVERY * 4;
    const trailCard = (progression) =>
      offerIds(progression).find((id) => progression.pilotCardIds.includes(id));
    // Thrusters already at 1: never thrusters again while the way is open.
    for (let seed = 1; seed <= 40; seed += 1) {
      const progression = createProgression(level, seed);
      progression.appliedUpgrades.set('propulsors', 1);
      expect(trailCard(progression)).not.toBe('propulsors');
    }
    // Every step taken: the Flight Computer is the trail's card.
    const ready = createProgression(level);
    ready.appliedUpgrades.set('propulsors', 1);
    ready.appliedUpgrades.set('braking_system', 3);
    ready.appliedUpgrades.set('rcs_system', 3);
    ready.appliedUpgrades.set('auto_aim', 1);
    expect(trailCard(ready)).toBe('flight_computer');
  });

  it('a piloting card never appears outside the trail slot, over many seeds', () => {
    const pilots = ['magfield', 'shield'];
    for (let seed = 1; seed <= 60; seed += 1) {
      [1, 5, 9, 11].forEach((level) => {
        const progression = createProgression(level, seed);
        progression.pilotCardIds = pilots;
        expect(
          offerIds(progression).filter((id) => pilots.includes(id))
        ).toEqual([]);
      });
    }
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

  describe('card slots', () => {
    // Eight distinct cards held, the piloting trail and the weapons aside.
    const fill = (progression, extra = []) => {
      const ids = progression.upgradeDefinitions
        .filter(
          ({ id, fallback }) =>
            !fallback &&
            !progression.pilotCardIds.includes(id) &&
            !WEAPON_CARD_IDS.includes(id)
        )
        .slice(0, UPGRADE_CARD_SLOTS - extra.length)
        .map(({ id }) => id);
      [...ids, ...extra].forEach((id) =>
        progression.appliedUpgrades.set(id, 1)
      );
      return progression;
    };
    const maxOut = (progression) =>
      progression.appliedUpgrades.forEach((_, id) =>
        progression.appliedUpgrades.set(id, card(progression, id).levels.length)
      );

    it('with the slots full, regular offers only rank up held cards', () => {
      for (let seed = 1; seed <= 20; seed += 1) {
        const progression = fill(createProgression(5, seed));
        // Nothing held is maxed here: every held card has a rank to take.
        const held = [...progression.appliedUpgrades.keys()];
        const rankable = held.filter(
          (id) =>
            progression.getUpgradeCount(id) <
            card(progression, id).levels.length
        );
        offerIds(progression, 5)
          .filter((id) => !progression.pilotCardIds.includes(id))
          .forEach((id) => expect(rankable).toContain(id));
      }
    });

    it('with the slots full and nothing to rank, positions fill with trail cards, then the fallback', () => {
      const progression = fill(createProgression(5));
      maxOut(progression);
      const trail = progression.trailSlotIds();
      const ids = offerIds(progression, 5);
      expect(ids).toHaveLength(3);
      // Every trail card the way allows (the rest wait on prerequisites).
      const open = progression
        .getEligibleUpgradeDefinitions()
        .filter(({ id }) => trail.includes(id))
        .map(({ id }) => id);
      expect(open.length).toBeGreaterThan(0);
      open.forEach((id) => expect(ids).toContain(id));
      ids
        .filter((id) => !trail.includes(id))
        .forEach((id) => expect(['hull_patch', 'salvage_cache']).toContain(id));
      // No trail card left to offer: the offer is fallback cards alone.
      progression.pilotCardIds.forEach((id) =>
        progression.appliedUpgrades.set(id, 3)
      );
      progression.trailSlotIds = () => [];
      expect(offerIds(progression, 5).sort()).toEqual([
        'hull_patch',
        'salvage_cache',
      ]);
    });

    it('offers Hull Patch when the hull is hurt, Salvage Cache when it is full', () => {
      const progression = fill(createProgression(5));
      maxOut(progression);
      progression.trailSlotIds = () => [];
      progression.playerService = {
        getStats: () => ({ health: 50, maxHealth: 100 }),
      };
      expect(offerIds(progression, 5)[0]).toBe('hull_patch');
      progression.playerService = {
        getStats: () => ({ health: 100, maxHealth: 100 }),
      };
      expect(offerIds(progression, 5)[0]).toBe('salvage_cache');
    });

    it('a fallback pick is spent, never held, and can come again', () => {
      const progression = fill(createProgression(5));
      expect(progression.applyUpgrade('salvage_cache')).toBe(true);
      expect(progression.applyUpgrade('salvage_cache')).toBe(true);
      expect(progression.getCardSlots().used).toBe(UPGRADE_CARD_SLOTS);
    });

    it('getCardSlots ignores trail cards and counts the weapon card', () => {
      const progression = createProgression(5);
      progression.appliedUpgrades.set('propulsors', 1);
      progression.appliedUpgrades.set('shield', 1);
      progression.appliedUpgrades.set(WEAPON_CARD_IDS[0], 1);
      expect(progression.getCardSlots()).toEqual({
        used: 2,
        max: UPGRADE_CARD_SLOTS,
        ids: ['shield', WEAPON_CARD_IDS[0]],
      });
    });

    it('the old flight has no cap', () => {
      const progression = fill(createProgression(5));
      progression.pilotCardIds = [];
      expect(progression.slotsFull()).toBe(false);
      const fresh = offerIds(progression, 5).filter(
        (id) => progression.getUpgradeCount(id) === 0
      );
      expect(fresh.length).toBeGreaterThan(0);
    });
  });

  describe('cards that do nothing for the weapon in hand', () => {
    const furnaceCard = listContent('weapons').find(
      ({ id }) => id === 'furnace-corona'
    ).card.id;
    const eligibleIds = (progression) =>
      progression.getEligibleUpgradeDefinitions().map(({ id }) => id);

    it('the new flight leaves a dead card out with Furnace Corona held, not with the default cannon', () => {
      const progression = createProgression(9);
      expect(eligibleIds(progression)).toContain('overcharge_coil');
      progression.appliedUpgrades.set(furnaceCard, 1);
      expect(eligibleIds(progression)).not.toContain('overcharge_coil');
      for (let seed = 1; seed <= 30; seed += 1) {
        const held = createProgression(9, seed);
        held.appliedUpgrades.set(furnaceCard, 1);
        expect(offerIds(held)).not.toContain('overcharge_coil');
      }
    });

    it('the trail still offers auto_aim with Furnace Corona held', () => {
      const progression = createProgression(9);
      progression.appliedUpgrades.set(furnaceCard, 1);
      expect(eligibleIds(progression)).toContain('auto_aim');
    });

    it('the old flight keeps a dead card eligible', () => {
      const progression = createProgression(9);
      progression.pilotCardIds = [];
      progression.appliedUpgrades.set(furnaceCard, 1);
      expect(eligibleIds(progression)).toContain('overcharge_coil');
    });

    it('the targeting suite needs the turret first in the new flight', () => {
      const progression = createProgression(9);
      expect(eligibleIds(progression)).not.toContain('targeting_suite');
      progression.appliedUpgrades.set('auto_aim', 1);
      expect(eligibleIds(progression)).toContain('targeting_suite');
    });
  });
});
