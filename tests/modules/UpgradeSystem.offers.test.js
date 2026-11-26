import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ProgressionSystem from '../../src/modules/ProgressionSystem.js';
import { BASE_MODIFIERS } from '../../src/data/hangar.js';
import { createHeadlessGame } from '../__helpers__/headlessGame.js';
import { installDomStubs } from '../__helpers__/domStubs.js';
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

// `contract`: the hangar's run contract fields (openCards, sealed, holds,
// startingCard) over its base modifiers; none: no hangar at all.
const createProgression = (level, seed = 7, contract = null) => {
  const progression = new ProgressionSystem({
    random: new RandomService(seed),
    eventBus: createEventBusMock(),
    player: {},
    ui: {},
    effects: {},
    'xp-orbs': { attachProgression: () => {} },
    ...(contract && {
      hangar: { getModifiers: () => ({ ...BASE_MODIFIERS, ...contract }) },
    }),
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
      // Every trail card the way allows (the rest wait on prerequisites).
      const open = progression
        .getEligibleUpgradeDefinitions()
        .filter(({ id }) => trail.includes(id))
        .map(({ id }) => id);
      expect(open.length).toBeGreaterThan(0);
      open.forEach((id) => expect(ids).toContain(id));
      // The hull whole: the Salvage Cache, never a Hull Patch.
      expect(ids.filter((id) => !trail.includes(id))).toEqual([
        'salvage_cache',
      ]);
      // No trail card left to offer, the hull whole (no player stats count
      // as whole): Salvage Cache alone, no Hull Patch that would mend nothing.
      progression.pilotCardIds.forEach((id) =>
        progression.appliedUpgrades.set(id, 3)
      );
      progression.trailSlotIds = () => [];
      expect(offerIds(progression, 5)).toEqual(['salvage_cache']);
    });

    // A Hull Patch on a full hull repaired nothing, yet filled a place in
    // the offer (outside check of the card matrix, 25/11).
    it('offers Hull Patch only while the hull is hurt, before the Salvage Cache', () => {
      const progression = fill(createProgression(5));
      maxOut(progression);
      progression.trailSlotIds = () => [];
      progression.playerService = {
        getStats: () => ({ health: 50, maxHealth: 100 }),
      };
      expect(offerIds(progression, 5)).toEqual(['hull_patch', 'salvage_cache']);
      progression.playerService = {
        getStats: () => ({ health: 100, maxHealth: 100 }),
      };
      expect(offerIds(progression, 5)).toEqual(['salvage_cache']);
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
    const cardOf = (weaponId) =>
      listContent('weapons').find(({ id }) => id === weaponId).card.id;
    const furnaceCard = cardOf('furnace-corona');
    const haloCard = cardOf('shard-halo');
    const casterCard = cardOf('arc-caster');
    const swarmCard = cardOf('seeker-swarm');
    const eligibleIds = (progression) =>
      progression.getEligibleUpgradeDefinitions().map(({ id }) => id);

    it('no regular card is dead for any weapon now; the filter still drops a card with `deadFor` for the weapon held, never in the old flight or on the trail', () => {
      const progression = createProgression(9);
      expect(
        progression.upgradeDefinitions.filter(
          ({ id, deadFor }) =>
            deadFor.length && !progression.pilotCardIds.includes(id)
        )
      ).toEqual([]);
      [furnaceCard, haloCard, casterCard, swarmCard].forEach((card) => {
        progression.appliedUpgrades.set(card, 1);
        expect(eligibleIds(progression)).toContain('recoil_dampers');
        progression.appliedUpgrades.delete(card);
      });
      const synthetic = { id: 'synthetic', deadFor: ['seeker-swarm'] };
      progression.appliedUpgrades.set(swarmCard, 1);
      expect(progression.isDeadForWeapon(synthetic)).toBe(true);
      expect(
        progression.isDeadForWeapon({ ...synthetic, deadFor: ['lance'] })
      ).toBe(false);
      progression.pilotCardIds = [];
      expect(progression.isDeadForWeapon(synthetic)).toBe(false);
    });

    it('the trail still offers auto_aim with Furnace Corona held', () => {
      const progression = createProgression(9);
      progression.appliedUpgrades.set(furnaceCard, 1);
      progression.appliedUpgrades.set('propulsors', 1);
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

  describe('card text for the weapon in hand', () => {
    // The next rank's text the offer shows for `id`, with `weaponId` held
    // and `id` already at `rank`.
    const shown = (id, weaponId = 'lance', rank = 0) => {
      const progression = createProgression(9);
      if (weaponId !== 'lance') {
        const weapon = listContent('weapons').find((w) => w.id === weaponId);
        progression.appliedUpgrades.set(weapon.card.id, 1);
      }
      if (rank) progression.appliedUpgrades.set(id, rank);
      return progression.buildUpgradeOption(card(progression, id)).nextLevel;
    };

    it("a weapon's override replaces what it names at that rank and keeps the rest", () => {
      expect(shown('chain_capacitor', 'arc-caster')).toMatchObject({
        title: 'Spare Charge',
        description: 'Every cast jumps once more.',
        highlights: ['On top of the jumps Multishot adds.'],
      });
      const scatter = shown('chain_capacitor', 'scatter');
      expect(scatter.description).toContain('1 volley in 10 fires twice');
      expect(scatter.highlights).toEqual(shown('chain_capacitor').highlights);
      // Another weapon reads the base text.
      expect(shown('chain_capacitor', 'lance').description).toBe(
        shown('chain_capacitor').description
      );
    });

    it('Plasma Gun names every weapon, not projectiles', () => {
      expect(shown('plasma', 'furnace-corona').description).toBe(
        'Every weapon deals immediately +25% damage.'
      );
    });

    it('Arc Lattice strikes on its own, not where the cannon aims', () => {
      expect(shown('arc_lattice', 'shard-halo').highlights[0]).toBe(
        'It needs no aim: it strikes beside any weapon.'
      );
    });

    it('Multishot says what grows with each weapon', () => {
      expect(shown('multishot', 'lance', 1).description).toBe(
        'Adds a third projectile per sequence.'
      );
      expect(shown('multishot', 'furnace-corona').description).toBe(
        'The ring reaches 10 px further: 88 px.'
      );
      expect(shown('multishot', 'scatter', 2).description).toBe(
        'Another flak bolt per volley: 8 in the fan.'
      );
      expect(shown('multishot', 'harmonic').description).toContain(
        'the beam stays single'
      );
    });

    it('Thermal Lens focuses the fan with the Scatter Coil', () => {
      expect(shown('thermal_lens', 'scatter').description).toBe(
        'Focuses the fan: the bolts fly 20% closer together and deal +15% damage.'
      );
    });

    it('Targeting Matrix gives a weapon that never aims threat focus and its fire rate', () => {
      expect(shown('targeting_suite', 'shard-halo').description).toContain(
        '+10% damage to elites, heralds and bosses'
      );
      expect(shown('targeting_suite', 'shard-halo', 2).description).toBe(
        'Fire rate +9%. The cuts keep their +20% on elites, heralds and bosses.'
      );
      expect(shown('targeting_suite', 'lance', 2).description).toBe(
        'Locks one threat per shot of the volley, up to four, and fires at all of them. Fire rate +9%.'
      );
    });

    it('Afterburn Lance caps the flak bonus at the bolt range', () => {
      expect(shown('afterburn_lance', 'scatter').description).toBe(
        'Flak bolts deal +10% damage per 100 px flown: they burst by 180 px, so up to +18%. Lock-on range +15%.'
      );
    });
  });

  describe("the hangar's run contract", () => {
    const pilotLevel = UPGRADE_PILOT_OFFER_EVERY * 2;

    it('the default contract deals the same offers as no contract, seed for seed', () => {
      const defaults = {
        openCards: null,
        sealed: [],
        holds: 0,
        startingCard: null,
      };
      for (let seed = 1; seed <= 20; seed += 1) {
        [1, UPGRADE_WEAPON_OFFER_LEVELS[0], pilotLevel, 9].forEach((level) => {
          const plain = createProgression(level, seed);
          const contracted = createProgression(level, seed, defaults);
          expect(offerIds(contracted)).toEqual(offerIds(plain));
          expect(offerIds(contracted)).toEqual(offerIds(plain));
        });
      }
    });

    it('a card outside the open cards is never offered; the trail still is', () => {
      const openCards = ['shield', 'plasma', 'multishot', 'heat_sink'];
      for (let seed = 1; seed <= 30; seed += 1) {
        const progression = createProgression(pilotLevel, seed, { openCards });
        const ids = offerIds(progression);
        expect(ids.some((id) => progression.pilotCardIds.includes(id))).toBe(
          true
        );
        ids
          .filter((id) => !progression.pilotCardIds.includes(id))
          .forEach((id) => expect(openCards).toContain(id));
      }
    });

    it('a sealed card is never offered, nor drawn as a banished card replacement', () => {
      const sealed = ['shield', 'plasma'];
      for (let seed = 1; seed <= 40; seed += 1) {
        const progression = createProgression(5, seed, { sealed });
        sealed.forEach((id) => expect(offerIds(progression)).not.toContain(id));
        const [first] = progression.pendingUpgradeOptions;
        const banished = progression.banishUpgrade(first.id);
        sealed.forEach((id) =>
          expect(banished.map((option) => option.id)).not.toContain(id)
        );
      }
    });

    it('the starting card is held when the run begins, once', () => {
      const restoreDom = installDomStubs();
      vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const game = createHeadlessGame();
        const hangar = game.session.resolveServiceInstance('hangar');
        hangar.getModifiers = () => ({
          ...BASE_MODIFIERS,
          startingCard: 'propulsors',
        });
        game.session.startNewRun({ source: 'test' });
        for (let step = 0; step < 30; step += 1) game.step();
        expect(game.services.progression.getUpgradeCount('propulsors')).toBe(1);
      } finally {
        restoreDom();
        vi.restoreAllMocks();
      }
    });

    it('a starting card the trail would not offer now is ignored', () => {
      // Not a piloting card; a trail card short of its prerequisites.
      ['shield', 'flight_computer'].forEach((startingCard) => {
        const progression = createProgression(1, 7, { startingCard });
        progression.applyStartingCard();
        expect(progression.getUpgradeCount(startingCard)).toBe(0);
      });
    });

    it('a held card comes back in the next offer, and spends a hold', () => {
      let returned = 0;
      for (let seed = 1; seed <= 20; seed += 1) {
        const progression = createProgression(5, seed, { holds: 2 });
        const [, second] = offerIds(progression, 5);
        expect(progression.holdUpgrade(second)).not.toBeNull();
        expect(progression.holdsLeft).toBe(1);
        // One per screen; a reroll of that screen keeps the hold.
        expect(progression.holdUpgrade(second)).toBeNull();
        progression.rerollUpgradeOptions();
        expect(progression.heldCard).not.toBeNull();
        progression.applyUpgrade(progression.pendingUpgradeOptions[0].id);

        // Unless the pick ruled it out (another weapon card).
        const open = progression
          .getEligibleUpgradeDefinitions()
          .some(({ id }) => id === second);
        const next = offerIds(progression, 6);
        if (open) {
          expect(next).toContain(second);
          returned += 1;
        }
        expect(next).toHaveLength(3);
        expect(progression.heldCard).toBeNull();
      }
      expect(returned).toBeGreaterThan(10);
    });

    it('no hold without holds left or beside a single card', () => {
      const none = createProgression(5);
      const [first] = offerIds(none, 5);
      expect(none.holdUpgrade(first)).toBeNull();

      const single = createProgression(5, 7, { holds: 1 });
      single.prepareUpgradeOptions(1, { level: 5 });
      expect(single.holdUpgrade(single.pendingUpgradeOptions[0].id)).toBeNull();
      expect(single.holdsLeft).toBe(1);
    });
  });
});
