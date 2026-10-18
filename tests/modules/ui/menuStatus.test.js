import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDomStubs } from '../../__helpers__/headlessGame.js';
import UISystem from '../../../src/modules/UISystem.js';
import { RECORDS_STORAGE_KEY } from '../../../src/services/runRecords.js';
import {
  menuStatusItems,
  menuStatusMarkup,
  qualityLabel,
} from '../../../src/modules/ui/menuStatus.js';

const fakeServices = () => ({
  hangar: { salvage: 470 },
  difficulty: {
    getDailyRecord: () => ({ bestLayer: 3 }),
    getSelectedDifficulty: () => 'warden',
  },
  codex: {
    getEntries: () => [{ seen: { kills: 3 } }, { seen: null }, { seen: {} }],
  },
  achievements: {
    getEntries: () =>
      Array.from({ length: 12 }, (_, i) => ({
        unlockedAt: i < 2 ? '2026-10-18T00:00:00.000Z' : null,
      })),
  },
});

describe('Main menu status strip', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  it('reads best layer, Daily best, Salvage, Codex, achievements, difficulty and quality', () => {
    const items = menuStatusItems({
      records: { bestLayer: 7 },
      quality: 'auto',
      ...fakeServices(),
    });

    expect(items).toEqual([
      ['Best layer', '7'],
      ['Daily best', '3'],
      ['Salvage', '470'],
      ['Codex', '2/3'],
      ['Achievements', '2/12'],
      ['Difficulty', 'WARDEN'],
      ['Quality', 'AUTO'],
    ]);
    expect(menuStatusMarkup(items)).toContain(
      'Achievements <span class="menu-status__value">2/12</span>'
    );
  });

  it("names Auto's live preset, or the pinned one", () => {
    expect(qualityLabel('auto', 'medium')).toBe('AUTO · MEDIUM');
    expect(qualityLabel('low', 'medium')).toBe('LOW');
    expect(qualityLabel('high')).toBe('HIGH');
  });

  it('UISystem fills the strip from the services and the stored records', () => {
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify({ bestLayer: 4 }));
    const services = fakeServices();
    const strip = { innerHTML: '' };
    const ui = {
      domRefs: { menu: { status: strip } },
      getService: (name) => services[name],
      settings: { getCategoryValues: () => ({ quality: 'high' }) },
      liveQualityPreset: null,
    };

    UISystem.prototype.refreshMenuStatus.call(ui);

    const text = strip.innerHTML.replace(/<[^>]+>/g, '');
    expect(text).toBe(
      'Best layer 4Daily best 3Salvage 470Codex 2/3Achievements 2/12Difficulty WARDENQuality HIGH'
    );
  });
});
