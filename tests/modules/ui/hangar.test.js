import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../../src/core/EventBus.js';
import { installDomStubs } from '../../__helpers__/headlessGame.js';
import HangarService, {
  HANGAR_STORAGE_KEY,
} from '../../../src/services/HangarService.js';
import {
  hangarItemMarkup,
  hullLockText,
  hullTraits,
  hullTraitsMarkup,
  hullUnlockText,
  licenseMarkup,
  medalRewardText,
  pressureLadderMarkup,
  salvageBalanceText,
  salvageLine,
} from '../../../src/modules/ui/hangar.js';
import { getShipModelById } from '../../../src/data/shipModels.js';

const stubs = {
  difficulty: {
    getModifiers: () => ({ salvage: 1 }),
    setPressure: () => {},
    getPressure: () => 0,
  },
  achievements: { getEntries: () => [] },
};

describe('Hangar screen', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  const cardOf = (hangar, id) =>
    hangarItemMarkup(hangar.getItems().find((item) => item.id === id));

  it('lists the seven upgrades and the Salvage balance', () => {
    localStorage.setItem(HANGAR_STORAGE_KEY, JSON.stringify({ salvage: 130 }));
    const hangar = new HangarService({ ...stubs, eventBus: new EventBus() });
    const markup = hangar.getItems().map(hangarItemMarkup).join('');

    expect(markup.match(/<li /g)).toHaveLength(7);
    expect(markup).toContain('Solar Slicer Hull');
    expect(markup).toContain('Bastion Hull');
    expect(salvageBalanceText(hangar.salvage)).toBe('Salvage 130');
    expect(cardOf(hangar, 'reinforced-plating')).toContain(
      'BUY · 120</button>'
    );
    expect(cardOf(hangar, 'spare-capacitor')).toMatch(/disabled>BUY · 150/);
  });

  it('shows OWNED once bought', () => {
    localStorage.setItem(HANGAR_STORAGE_KEY, JSON.stringify({ salvage: 120 }));
    const hangar = new HangarService({ ...stubs, eventBus: new EventBus() });
    hangar.buy('reinforced-plating');

    expect(cardOf(hangar, 'reinforced-plating')).toContain('OWNED');
    expect(cardOf(hangar, 'reinforced-plating')).not.toContain('BUY');
    expect(salvageBalanceText(hangar.salvage)).toBe('Salvage 0');
  });

  it('prices a locked hull for its preview', () => {
    expect(hullLockText('solar-slicer')).toBe('🔒 LOCKED · 400 SALVAGE');
    expect(hullLockText('bastion')).toBe('🔒 LOCKED · 520 SALVAGE');
    expect(hullUnlockText('bastion')).toBe('🔒 520 Salvage in the Hangar');
  });

  it('describes each hull from its role and stats, lower dash cooldown better', () => {
    const traits = (id) => {
      const { role, stats, plain } = hullTraits(getShipModelById(id));
      return [role, plain, ...stats.map((s) => `${s.text} ${s.better}`)];
    };
    expect(traits('default-hull')).toEqual([
      'Balanced',
      'Standard hull, speed and dash',
    ]);
    expect(traits('solar-slicer')).toEqual([
      'Fast, fragile',
      null,
      'Hull -20% false',
      'Speed +15% true',
      'Thrust +15% true',
      'Dash cooldown -15% true',
    ]);
    expect(traits('bastion')).toEqual([
      'Tough, slow',
      null,
      'Hull +35% true',
      'Speed -10% false',
      'Thrust -15% false',
      'Dash cooldown +20% false',
    ]);
    expect(hullTraitsMarkup(getShipModelById('bastion'), 'lock')).toMatch(
      /^<span class="hull-traits__name">Bastion<\/span> · <span class="hull-traits__role">Tough, slow<\/span> · <span class="hull-traits__stat is-better">Hull \+35%<\/span>.* · <span class="hull-traits__lock">lock<\/span>$/
    );
  });

  it('writes the run end salvage line', () => {
    expect(salvageLine({ amount: 99, total: 340 })).toEqual({
      amount: '+99',
      text: 'salvage · 340 to spend in the Hangar',
    });
    expect(salvageLine({ amount: 129, total: 340, multiplier: 1.3 })).toEqual({
      amount: '+129',
      text: 'salvage (×1.3 difficulty) · 340 to spend in the Hangar',
    });
    expect(
      salvageLine({
        amount: 150,
        total: 340,
        multiplier: 1.5,
        difficulty: 'Pressure I',
      }).text
    ).toBe('salvage (×1.5 Pressure I) · 340 to spend in the Hangar');
  });

  it('writes what a medal pays: Salvage, a licensed card by name, Pressure', () => {
    expect(medalRewardText({ salvage: 50 })).toBe('+50 Salvage');
    expect(medalRewardText({ license: 'arc_lattice' })).toBe(
      'License · Arc Lattice'
    );
    expect(medalRewardText({ salvage: 100, opensPressure: true })).toBe(
      'Opens Pressure · +100 Salvage'
    );
  });

  it('disables the Pressure rungs above the open one and marks the selected', () => {
    const markup = pressureLadderMarkup({ open: 2, selected: 2, best: 1 });
    const button = (n) =>
      markup.match(new RegExp(`data-hangar-pressure="${n}"[^>]*>`))[0];

    expect(button(0)).not.toContain('disabled');
    expect(button(1)).not.toContain('disabled');
    expect(button(2)).toContain('aria-pressed="true"');
    expect(button(3)).toContain('disabled');
    expect(button(5)).toContain('disabled');
    expect(markup).toContain('Pressure II · selected');
    expect(markup).toContain('Pressure I · won');
  });

  it('names the medals Salvage a run paid in its salvage line', () => {
    expect(salvageLine({ amount: 99, total: 440, medals: 100 })).toEqual({
      amount: '+99',
      text: 'salvage · +100 from medals · 440 to spend in the Hangar',
    });
  });

  it('shows what a locked control item waits for, with no BUY', () => {
    const hangar = new HangarService({ ...stubs, eventBus: new EventBus() });
    const control = (id) =>
      hangarItemMarkup(hangar.getControlItems().find((i) => i.id === id));

    expect(control('reroll-2')).toContain('🔒 After Reroll I');
    expect(control('reroll-2')).not.toContain('data-hangar-buy');
    expect(control('flight-school')).toContain('🔒 Medal · First Victory');
    expect(control('reroll-1')).toContain('BUY · 200</button>');
  });

  it('writes a licence: BUY on sale, its medal, an ON / OFF switch once held', () => {
    localStorage.setItem(HANGAR_STORAGE_KEY, JSON.stringify({ salvage: 400 }));
    const hangar = new HangarService({ ...stubs, eventBus: new EventBus() });
    const card = (id) =>
      licenseMarkup(hangar.getLicenses().find((l) => l.id === id));

    expect(card('shard_halo')).toContain('Shard Halo');
    expect(card('shard_halo')).toContain(
      'data-hangar-license-buy="shard_halo"'
    );
    expect(card('deflector_shield')).toContain('🏅 Ring Breaker');
    expect(card('deflector_shield')).not.toContain('data-hangar-license-buy');

    hangar.buyLicense('shard_halo');
    expect(card('shard_halo')).toContain('aria-pressed="true">ON</button>');
    hangar.setLicenseOn('shard_halo', false);
    expect(card('shard_halo')).toContain('aria-pressed="false">OFF</button>');
  });
});
