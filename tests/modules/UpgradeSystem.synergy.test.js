import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ProgressionSystem from '../../src/modules/ProgressionSystem.js';
import RandomService from '../../src/core/RandomService.js';
import UPGRADE_LIBRARY from '../../src/data/upgrades/index.js';
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
  it('every upgrade has one known family (cursed ones none) and every family can reach its bonus', () => {
    expect(UPGRADE_LIBRARY).toHaveLength(34);
    const counts = {};
    UPGRADE_LIBRARY.forEach((upgrade) => {
      if (upgrade.cursed) {
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
    const effects = [
      ...UPGRADE_LIBRARY.flatMap((upgrade) =>
        upgrade.levels.flatMap((level) => level.effects)
      ),
      ...Object.values(UPGRADE_FAMILIES).flatMap((f) => f.bonus.effects),
    ];
    const events = new Set(
      effects
        .filter((effect) => effect.type === 'event')
        .map((effect) => effect.event)
    );
    events.forEach((event) => {
      expect(source.includes(`registerEventListener('${event}'`), event).toBe(
        true
      );
    });
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

  it('Scavenger raises XP from orbs and a new run clears it', () => {
    ['magfield', 'core_extractor', 'wide_net'].forEach((id) =>
      progression.applyUpgrade(id)
    );
    // core_extractor rank 1 × Scavenger.
    expect(progression.xpGainMultiplier).toBeCloseTo(
      1.08 * SYNERGY_SCAVENGER_XP_MULTIPLIER,
      6
    );
    expect(progression.collectXP(10).gained).toBe(
      Math.round(10 * 1.08 * SYNERGY_SCAVENGER_XP_MULTIPLIER)
    );

    progression.reset();
    expect(progression.xpGainMultiplier).toBe(1);
    expect(progression.getSynergySnapshot().synergies).toEqual([]);
  });
});
