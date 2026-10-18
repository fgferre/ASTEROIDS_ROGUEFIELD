import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../../src/core/EventBus.js';
import { installDomStubs } from '../../__helpers__/headlessGame.js';
import HangarService, {
  HANGAR_STORAGE_KEY,
} from '../../../src/services/HangarService.js';
import {
  hangarItemMarkup,
  hullLockText,
  salvageBalanceText,
  salvageLine,
} from '../../../src/modules/ui/hangar.js';

describe('Hangar screen', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  const cardOf = (hangar, id) =>
    hangarItemMarkup(hangar.getItems().find((item) => item.id === id));

  it('lists the six upgrades and the Salvage balance', () => {
    localStorage.setItem(HANGAR_STORAGE_KEY, JSON.stringify({ salvage: 130 }));
    const hangar = new HangarService({ eventBus: new EventBus() });
    const markup = hangar.getItems().map(hangarItemMarkup).join('');

    expect(markup.match(/<li /g)).toHaveLength(6);
    expect(markup).toContain('Solar Slicer Hull');
    expect(salvageBalanceText(hangar.salvage)).toBe('Salvage 130');
    expect(cardOf(hangar, 'reinforced-plating')).toContain(
      'BUY · 120</button>'
    );
    expect(cardOf(hangar, 'spare-capacitor')).toMatch(/disabled>BUY · 150/);
  });

  it('shows OWNED once bought', () => {
    localStorage.setItem(HANGAR_STORAGE_KEY, JSON.stringify({ salvage: 120 }));
    const hangar = new HangarService({ eventBus: new EventBus() });
    hangar.buy('reinforced-plating');

    expect(cardOf(hangar, 'reinforced-plating')).toContain('OWNED');
    expect(cardOf(hangar, 'reinforced-plating')).not.toContain('BUY');
    expect(salvageBalanceText(hangar.salvage)).toBe('Salvage 0');
  });

  it('prices a locked hull for its preview', () => {
    expect(hullLockText('solar-slicer')).toBe('🔒 LOCKED · 400 SALVAGE');
  });

  it('writes the recap line', () => {
    expect(salvageLine({ amount: 99, total: 340 })).toBe(
      'SALVAGE +99 (total 340)'
    );
    expect(salvageLine({ amount: 129, total: 340, multiplier: 1.3 })).toBe(
      'SALVAGE +129 (×1.3 difficulty, total 340)'
    );
  });
});
