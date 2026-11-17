import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ProgressionSystem from '../../src/modules/ProgressionSystem.js';
import RandomService from '../../src/core/RandomService.js';
import UPGRADE_LIBRARY, {
  cardsForFlight,
  pilotCardIds,
  trailSteps,
} from '../../src/data/upgrades/index.js';
import { normalizeUpgradeDefinition } from '../../src/modules/upgradeCatalog.js';
import { listContent } from '../../src/content/registry.js';
import {
  UPGRADE_FAMILIES,
  FAMILY_SYNERGY_THRESHOLD,
  FAMILY_APEX_THRESHOLD,
  SYNERGY_OVERHEAT_DAMAGE_MULTIPLIER,
  SYNERGY_SCAVENGER_XP_MULTIPLIER,
} from '../../src/data/upgrades/families.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { setupGlobalMocks, cleanupGlobalState } from '../__helpers__/setup.js';

const createProgression = (eventBus) => {
  const progression = new ProgressionSystem({
    random: new RandomService(7),
    eventBus,
    player: {},
    ui: {},
    effects: {},
    'xp-orbs': { attachProgression: () => {} },
  });
  progression.level = 10;
  return progression;
};

function listSourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return path.includes(join('src', 'data')) ? [] : listSourceFiles(path);
    }
    return path.endsWith('.js') ? [path] : [];
  });
}

describe('upgrade families', () => {
  it('every upgrade has one known family (cursed and fallback ones none) and every family can reach its bonus', () => {
    // Every card file plus every weapon's own card, nothing else (the new
    // flight's own cards are in the catalog by default).
    expect(UPGRADE_LIBRARY).toHaveLength(
      listContent('cards').length +
        listContent('weapons').filter((weapon) => weapon.card).length
    );
    const counts = {};
    UPGRADE_LIBRARY.forEach((upgrade) => {
      if (upgrade.cursed || upgrade.fallback) {
        expect(upgrade.family).toBeNull();
        return;
      }
      expect(UPGRADE_FAMILIES[upgrade.family]).toBeDefined();
      counts[upgrade.family] = (counts[upgrade.family] || 0) + 1;
    });
    Object.keys(UPGRADE_FAMILIES).forEach((id) => {
      expect(counts[id]).toBeGreaterThanOrEqual(FAMILY_SYNERGY_THRESHOLD);
    });
  });

  it('every event an upgrade or bonus emits has a listener in src (no inert cards)', () => {
    const source = listSourceFiles(join(process.cwd(), 'src'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    // The catalog in play: the new flight's cards are in it by default.
    const cards = UPGRADE_LIBRARY;
    const effects = [
      ...cards.flatMap((upgrade) =>
        upgrade.levels.flatMap((level) => level.effects)
      ),
      ...Object.values(UPGRADE_FAMILIES).flatMap((f) => f.bonus.effects),
    ];
    const events = new Set(
      effects
        .filter((effect) => effect.type === 'event')
        .map((effect) => effect.event)
    );
    // Salvage Cache's event waits for the hangar's token payout.
    events.delete('card-salvage');
    events.forEach((event) => {
      expect(source.includes(`registerEventListener('${event}'`), event).toBe(
        true
      );
    });
  });

  it("the new flight (the default) adds its own cards and reads the glide texts; with ?direcao=antiga the catalog is today's", () => {
    const ids = (newFlight) =>
      cardsForFlight(listContent('cards'), newFlight).map((card) => card.id);
    expect(ids(false)).not.toContain('auto_aim');
    expect(ids(false)).not.toContain('flight_computer');
    expect(ids(true)).toEqual(
      expect.arrayContaining(['auto_aim', 'flight_computer'])
    );

    const braking = (newFlight) =>
      cardsForFlight(listContent('cards'), newFlight).find(
        (card) => card.id === 'braking_system'
      ).text;
    expect(braking(false)).toBe(
      listContent('cards').find((card) => card.id === 'braking_system').text
    );
    expect(braking(true).name).toBe('Braking System');
    expect(braking(true).summary).toMatch(/glide/);
  });

  it('the piloting cards are the Flight Computer and every card on its way; none without the new flight', () => {
    const pilots = (newFlight) =>
      pilotCardIds(cardsForFlight(listContent('cards'), newFlight));
    expect(pilots(false)).toEqual([]);
    expect([...pilots(true)].sort()).toEqual([
      'auto_aim',
      'braking_system',
      'flight_computer',
      'propulsors',
      'rcs_system',
    ]);
  });

  it('the temporary trail orders move only the Auto Turret, and only in the new flight', () => {
    const turret = (newFlight, order) =>
      cardsForFlight(listContent('cards'), newFlight, order).find(
        (card) => card.id === 'auto_aim'
      );
    const today = turret(true, 'a');
    expect(turret(true)).toEqual(today);
    expect(today.rarity).toBe('common');

    const afterBrakes = turret(true, 'b');
    expect(afterBrakes.rarity).toBe('rare');
    expect(afterBrakes.prerequisites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'propulsors', level: 1 }),
        expect.objectContaining({ id: 'braking_system', level: 1 }),
      ])
    );
    const steps = trailSteps(cardsForFlight(listContent('cards'), true, 'b'));
    expect(steps.get('auto_aim')).toBe(1);
    expect(steps.get('propulsors')).toBeGreaterThanOrEqual(1);
    expect(steps.get('braking_system')).toBeGreaterThanOrEqual(1);

    const afterEngine = turret(true, 'd');
    expect(afterEngine.rarity).toBe('common');
    expect(afterEngine.prerequisites).toEqual([
      expect.objectContaining({ id: 'propulsors', level: 1 }),
    ]);

    const late = turret(true, 'c');
    expect(late).toMatchObject({ rarity: 'rare', unlockLevel: 8 });
    expect(turret(false, 'c')).toBeUndefined();
  });
});

describe('the piloting trail and the families', () => {
  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());

  it('family counts ignore the piloting cards', () => {
    const progression = createProgression(createEventBusMock());
    progression.pilotCardIds = ['magfield'];
    progression.appliedUpgrades.set('magfield', 1);
    const family = progression.upgradeLookup.get('magfield').family;
    expect(progression.getFamilyCounts()[family]).toBe(0);
    progression.pilotCardIds = [];
    expect(progression.getFamilyCounts()[family]).toBe(1);
  });

  it('the new kinetic cards exist only with the new flight', () => {
    const ids = (newFlight) =>
      cardsForFlight(listContent('cards'), newFlight).map((card) => card.id);
    expect(ids(false)).not.toContain('momentum_rounds');
    expect(ids(false)).not.toContain('close_quarters');
    expect(ids(true)).toEqual(
      expect.arrayContaining(['momentum_rounds', 'close_quarters'])
    );
  });
});

describe('3-of-a-kind synergy', () => {
  let eventBus;
  let progression;

  beforeEach(() => {
    setupGlobalMocks();
    eventBus = createEventBusMock();
    progression = createProgression(eventBus);
  });

  afterEach(() => cleanupGlobalState());

  it('switches the Thermal bonus on once, at the third distinct upgrade', () => {
    const unlocked = vi.fn();
    const damage = vi.fn();
    eventBus.on('synergy-unlocked', unlocked);
    eventBus.on('upgrade-damage-boost', damage);

    progression.applyUpgrade('plasma');
    progression.applyUpgrade('plasma');
    progression.applyUpgrade('heat_sink');
    expect(unlocked).not.toHaveBeenCalled();

    const option = progression.buildUpgradeOption(
      progression.upgradeLookup.get('afterburn_lance')
    );
    expect(option.family).toMatchObject({
      id: 'thermal',
      owned: 2,
      completesSynergy: true,
      bonusName: 'Overheat',
    });

    progression.applyUpgrade('afterburn_lance');
    progression.applyUpgrade('reactor_bleed');

    expect(unlocked).toHaveBeenCalledTimes(1);
    expect(unlocked).toHaveBeenCalledWith(
      expect.objectContaining({ family: 'thermal', name: 'Overheat' })
    );
    expect(damage).toHaveBeenCalledWith(
      expect.objectContaining({
        multiplier: SYNERGY_OVERHEAT_DAMAGE_MULTIPLIER,
        synergy: 'thermal',
      })
    );
    expect(progression.getSynergySnapshot()).toMatchObject({
      families: { thermal: 4 },
      synergies: [{ family: 'thermal', name: 'Overheat' }],
    });
  });

  it('emits apex-unlocked once, at the fifth distinct upgrade of a family, after its synergy', () => {
    const order = [];
    eventBus.on('synergy-unlocked', ({ family }) =>
      order.push(`synergy:${family}`)
    );
    eventBus.on('apex-unlocked', ({ family }) => order.push(`apex:${family}`));
    const thermal = [
      'plasma',
      'heat_sink',
      'afterburn_lance',
      'reactor_bleed',
      'harmonic_resonator',
    ];
    expect(thermal).toHaveLength(FAMILY_APEX_THRESHOLD);

    thermal.slice(0, 4).forEach((id) => progression.applyUpgrade(id));
    progression.applyUpgrade('plasma'); // a second rank is not a new card
    expect(order).toEqual(['synergy:thermal']);

    progression.applyUpgrade('harmonic_resonator');
    progression.applyUpgrade('cinder_trail');
    expect(order).toEqual(['synergy:thermal', 'apex:thermal']);

    progression.reset();
    progression.level = 10;
    thermal.forEach((id) => progression.applyUpgrade(id));
    expect(order.filter((entry) => entry === 'apex:thermal')).toHaveLength(2);
  });

  it('Maneuver reaches its Apex on five cards that need no other family', () => {
    const unlocked = vi.fn();
    eventBus.on('apex-unlocked', unlocked);
    [
      'afterburner',
      'gyro_servos',
      'inertial_dampers',
      'ram_plating',
      'phase_dash',
    ].forEach((id) => expect(progression.applyUpgrade(id), id).toBe(true));
    expect(progression.getSynergySnapshot()).toMatchObject({
      families: { maneuver: 5 },
      synergies: [{ family: 'maneuver', name: 'Afterburn' }],
    });
    expect(unlocked).toHaveBeenCalledWith({ family: 'maneuver' });
  });

  it('never offers a card beside one it rules out, whichever card lists it', () => {
    const offered = () =>
      progression.getEligibleUpgradeDefinitions().map(({ id }) => id);
    expect(offered()).toContain('scatter_coil');
    progression.applyUpgrade('harmonic_resonator');
    expect(offered()).not.toContain('scatter_coil');
    expect(progression.applyUpgrade('scatter_coil')).toBe(false);

    // Owned `loner` lists plasma; plasma does not list it back.
    const loner = normalizeUpgradeDefinition({
      id: 'loner',
      levels: [{ effects: [] }],
      excludes: ['plasma'],
    });
    progression.upgradeLookup.set('loner', loner);
    expect(offered()).toContain('plasma');
    progression.applyUpgrade('loner');
    expect(offered()).not.toContain('plasma');
  });

  it('Scavenger raises XP from orbs and a new run clears it', () => {
    ['magfield', 'core_extractor', 'wide_net'].forEach((id) =>
      progression.applyUpgrade(id)
    );
    // core_extractor rank 1 × Scavenger.
    expect(progression.xpGainMultiplier).toBeCloseTo(
      1.15 * SYNERGY_SCAVENGER_XP_MULTIPLIER,
      6
    );
    expect(progression.collectXP(10).gained).toBe(
      Math.round(10 * 1.15 * SYNERGY_SCAVENGER_XP_MULTIPLIER)
    );

    progression.reset();
    expect(progression.xpGainMultiplier).toBe(1);
    expect(progression.getSynergySnapshot().synergies).toEqual([]);
  });
});
