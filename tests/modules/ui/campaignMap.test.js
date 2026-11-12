import { describe, expect, it } from 'vitest';
import {
  CampaignMap,
  campaignChapters,
  defaultSectorRow,
  sectorRowsMarkup,
} from '../../../src/modules/ui/CampaignMap.js';

const records = (sectorsWon = [], sectorTimes = {}, bestLayer = 0) => ({
  sectorsWon,
  sectorTimes,
  bestLayer,
});

const CHAPTER_ONE = ['debris-wake', 'salvage-lanes', 'prime-gate'];

describe('campaign map', () => {
  it('reads each chapter cleared, open or locked from its sectors, then three chapters with no signal', () => {
    const states = (won) =>
      campaignChapters(records(won)).map(({ numeral, state }) => [
        numeral,
        state,
      ]);
    expect(states(['debris-wake'])).toEqual([
      ['I', 'open'],
      ['II', 'locked'],
      ['III', 'locked'],
      ['IV', 'nosignal'],
      ['V', 'nosignal'],
      ['VI', 'nosignal'],
    ]);
    expect(states(CHAPTER_ONE).slice(0, 3)).toEqual([
      ['I', 'cleared'],
      ['II', 'open'],
      ['III', 'locked'],
    ]);
  });

  it("lists a chapter's sectors with code, name, end boss, layers and state", () => {
    const [one, two] = campaignChapters(
      records(['debris-wake'], { 'debris-wake': 252 })
    );
    expect(one.title).toBe('CHAPTER I — THE OUTER RING');
    expect(one.name).toBe('THE OUTER RING');
    expect(
      one.sectors.map(({ code, name, boss, layers, state, lock }) => ({
        code,
        name,
        boss,
        layers,
        state,
        lock,
      }))
    ).toEqual([
      {
        code: 'A',
        name: 'DEBRIS WAKE',
        boss: 'Sentinel: Quarry Maw',
        layers: 5,
        state: 'cleared',
        lock: '',
      },
      {
        code: 'B',
        name: 'SALVAGE LANES',
        boss: 'Sentinel: Gatekeeper',
        layers: 5,
        state: 'open',
        lock: '',
      },
      {
        code: 'C',
        name: 'PRIME GATE',
        boss: 'Warden: Prime',
        layers: 5,
        state: 'locked',
        lock: 'Defeat Sentinel Gatekeeper to unlock',
      },
    ]);
    expect(two.sectors).toHaveLength(2);
    expect(two.sectors[0]).toMatchObject({
      code: 'A',
      name: 'FURNACE DRIFT',
      boss: 'Sentinel: Kiln Engine',
      lock: 'Defeat Warden Prime to unlock',
    });
    expect(two.sectors[1]).toMatchObject({
      code: 'C',
      name: 'RESONANCE CHAMBER',
      boss: 'Warden: Choir',
      lock: 'Defeat Sentinel Kiln Engine to unlock',
    });

    const rows = sectorRowsMarkup(one.sectors);
    expect(rows).toContain('id="campaign-sector-debris-wake"');
    expect(rows).toContain('Cleared 4:12');
    expect(rows).toContain(
      'Locked<span class="campaign-sector__why">Defeat Sentinel Gatekeeper to unlock</span>'
    );
  });

  it('opens on the first open sector, else the last cleared', () => {
    const rowsOf = (won) =>
      campaignChapters(records(won)).flatMap((node) => node.sectors);
    expect(defaultSectorRow(rowsOf(['debris-wake'])).id).toBe('salvage-lanes');
    const all = [
      ...CHAPTER_ONE,
      'furnace-drift',
      'dense-core',
      'wardens-reach',
    ];
    expect(defaultSectorRow(rowsOf(all)).id).toBe('wardens-reach');
  });

  it('a chapter shows its rows; Launch carries the selected row, and a locked one cannot launch', () => {
    const list = () => ({ innerHTML: '', querySelectorAll: () => [] });
    const text = () => ({ textContent: '', hidden: false });
    const refs = {
      nodes: list(),
      sectors: list(),
      detailTitle: text(),
      detailHeadStart: text(),
      launchBtn: { dataset: {}, disabled: false },
    };
    const map = new CampaignMap({ refs });
    map.chapters = campaignChapters(records(['debris-wake']));

    map.selectSector('salvage-lanes');
    expect(refs.detailTitle.textContent).toBe('CHAPTER I — THE OUTER RING');
    expect(refs.sectors.innerHTML.match(/data-campaign-row=/g)).toHaveLength(3);
    expect(refs.launchBtn).toEqual({
      dataset: { sector: 'salvage-lanes' },
      disabled: false,
    });

    map.selectSector('prime-gate');
    expect(refs.launchBtn.disabled).toBe(true);

    map.selectChapter(2);
    expect(refs.detailTitle.textContent).toBe('CHAPTER II — THE DENSE CORE');
    expect(refs.launchBtn.dataset.sector).toBe('furnace-drift');
    expect(refs.launchBtn.disabled).toBe(true);
    expect(refs.detailHeadStart.textContent).toBe('Starts with 4 card picks');
  });
});
