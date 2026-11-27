import { describe, expect, it, vi } from 'vitest';
import { installDomStubs } from '../../__helpers__/domStubs.js';
import { inputLayers } from '../../../src/modules/input/inputLayers.js';
import { updateRecords } from '../../../src/services/runRecords.js';
import {
  CampaignMap,
  campaignChapters,
  campaignMarkup,
  defaultSectorRow,
  sectorRowsMarkup,
  wakeLogEntries,
  wakeTranscript,
} from '../../../src/modules/ui/CampaignMap.js';
import { SECTORS, sectorById } from '../../../src/data/sectors.js';

const records = (
  sectorsWon = [],
  sectorTimes = {},
  bestLayer = 0,
  endings = []
) => ({
  sectorsWon,
  sectorTimes,
  bestLayer,
  endings,
});

const CHAPTER_ONE = ['debris-wake', 'salvage-lanes', 'prime-gate'];

describe('campaign map', () => {
  it('reads each chapter cleared, open or locked from its sectors, then two chapters with no signal', () => {
    const states = (won) =>
      campaignChapters(records(won)).map(({ numeral, state }) => [
        numeral,
        state,
      ]);
    expect(states(['debris-wake'])).toEqual([
      ['I', 'open'],
      ['II', 'locked'],
      ['III', 'locked'],
      ['IV', 'locked'],
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
    const [one, two, three, four] = campaignChapters(
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
    expect(two.sectors).toHaveLength(3);
    expect(two.sectors[0]).toMatchObject({
      code: 'A',
      name: 'FURNACE DRIFT',
      boss: 'Sentinel: Kiln Engine',
      lock: 'Defeat Warden Prime to unlock',
    });
    expect(two.sectors[1]).toMatchObject({
      code: 'B',
      name: 'CRYSTAL CHOIR',
      boss: 'Sentinel: Prism Crown',
      lock: 'Defeat Sentinel Kiln Engine to unlock',
    });
    expect(two.sectors[2]).toMatchObject({
      code: 'C',
      name: 'RESONANCE CHAMBER',
      boss: 'Warden: Choir',
      lock: 'Defeat Sentinel Prism Crown to unlock',
    });
    expect(three.sectors).toHaveLength(3);
    expect(three.sectors[0]).toMatchObject({
      code: 'A',
      name: 'ASSEMBLY GRAVEYARD',
      boss: 'Sentinel: Foundry Mother',
      lock: 'Defeat Warden Choir to unlock',
    });
    expect(three.sectors[1]).toMatchObject({
      code: 'B',
      name: 'QUARANTINE GRID',
      boss: 'Sentinel: Interdictor',
      lock: 'Defeat Sentinel Foundry Mother to unlock',
    });
    expect(three.sectors[2]).toMatchObject({
      code: 'C',
      name: 'NULL BOUNDARY',
      boss: 'Warden: Null',
      lock: 'Defeat Sentinel Interdictor to unlock',
    });
    expect(four.title).toBe('FINALE — THE CRUCIBLE');
    expect(four.name).toBe('THE CRUCIBLE');
    expect(four.sectors).toEqual([
      expect.objectContaining({
        code: 'A',
        name: 'THE CRUCIBLE',
        boss: 'Sovereign',
        layers: 5,
        state: 'locked',
        lock: 'Defeat Warden Null to unlock',
      }),
    ]);

    const rows = sectorRowsMarkup(one.sectors);
    expect(rows).toContain('id="campaign-sector-debris-wake"');
    expect(rows).toContain('Cleared 4:12');
    expect(rows).toContain(
      'Locked<span class="campaign-sector__why">Defeat Sentinel Gatekeeper to unlock</span>'
    );
  });

  it('lets only the first open chapter call, however many are open', () => {
    // A profile from before the campaign: past two Wardens in the Descent.
    const markup = campaignMarkup(campaignChapters(records([], {}, 12)));
    expect(markup.match(/is-open/g).length).toBeGreaterThan(1);
    expect(markup.match(/is-next/g)).toHaveLength(1);
    expect(markup).toMatch(/id="campaign-chapter-1" class="[^"]*is-next/);
  });

  it('opens on the first open sector, else the last cleared', () => {
    const rowsOf = (won) =>
      campaignChapters(records(won)).flatMap((node) => node.sectors);
    expect(defaultSectorRow(rowsOf(['debris-wake'])).id).toBe('salvage-lanes');
    const all = [
      ...CHAPTER_ONE,
      'furnace-drift',
      'crystal-choir',
      'dense-core',
      'assembly-graveyard',
      'quarantine-grid',
      'wardens-reach',
    ];
    expect(defaultSectorRow(rowsOf(all)).id).toBe('the-crucible');
    expect(defaultSectorRow(rowsOf([...all, 'the-crucible'])).id).toBe(
      'the-crucible'
    );
  });

  it('marks the endings reached on the last sector, which stays open to play again like every sector', () => {
    const all = [
      ...CHAPTER_ONE,
      'furnace-drift',
      'crystal-choir',
      'dense-core',
      'assembly-graveyard',
      'quarantine-grid',
      'wardens-reach',
      'the-crucible',
    ];
    const rows = campaignChapters(records(all, {}, 0, ['stewardship'])).flatMap(
      (node) => node.sectors
    );
    expect(rows.filter((row) => row.endings).map((row) => row.id)).toEqual([
      'the-crucible',
    ]);
    expect(rows.at(-1).endings).toEqual([
      { id: 'severance', title: 'Severance', reached: false },
      { id: 'stewardship', title: 'Stewardship', reached: true },
    ]);
    expect(rows.every((row) => row.state === 'cleared')).toBe(true);
    const markup = sectorRowsMarkup(rows.slice(-1));
    expect(markup).toContain(
      'class="campaign-ending is-reached" data-ending="stewardship"'
    );
    expect(markup).toContain('class="campaign-ending" data-ending="severance"');
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
    const prepareTravel = vi.fn();
    const map = new CampaignMap({ refs, prepareTravel });
    map.chapters = campaignChapters(records(['debris-wake']));

    map.selectSector('salvage-lanes');
    // The journey this Launch would fly readies its voices now.
    expect(prepareTravel).toHaveBeenCalledWith({
      sector: 'salvage-lanes',
      source: 'campaign-launch-btn',
    });
    expect(refs.detailTitle.textContent).toBe('CHAPTER I / THE OUTER RING');
    expect(refs.sectors.innerHTML.match(/data-campaign-row=/g)).toHaveLength(3);
    expect(refs.launchBtn).toEqual({
      dataset: { sector: 'salvage-lanes' },
      disabled: false,
    });

    map.selectSector('prime-gate');
    expect(refs.launchBtn.disabled).toBe(true);

    map.selectChapter(2);
    expect(refs.detailTitle.textContent).toBe('CHAPTER II / THE DENSE CORE');
    expect(refs.launchBtn.dataset.sector).toBe('furnace-drift');
    expect(refs.launchBtn.disabled).toBe(true);
    expect(refs.detailHeadStart.textContent).toBe(
      `Starts with ${sectorById('furnace-drift').headStart} card picks`
    );
  });

  it('Enter, Space or the pad confirm on the selected row launches it; a mouse click only selects', () => {
    vi.stubGlobal('document', { addEventListener: () => {} });
    const list = () => ({ innerHTML: '', querySelectorAll: () => [] });
    const text = () => ({ textContent: '', hidden: false });
    let onClick;
    const refs = {
      root: {
        addEventListener: (name, fn) => {
          if (name === 'click') onClick = fn;
        },
      },
      nodes: list(),
      sectors: list(),
      detailTitle: text(),
      detailHeadStart: text(),
      launchBtn: { dataset: {}, disabled: false, click: vi.fn() },
    };
    const map = new CampaignMap({ refs, prepareTravel: () => {} });
    map.bindCampaignControls();
    map.chapters = campaignChapters(records(['debris-wake']));
    const click = (id, detail) =>
      onClick({
        detail,
        target: {
          closest: (selector) =>
            selector === '[data-campaign-row]'
              ? { dataset: { campaignRow: id } }
              : null,
        },
      });

    map.selectSector('debris-wake');
    click('salvage-lanes', 1);
    expect(map.selectedId).toBe('salvage-lanes');
    click('salvage-lanes', 1);
    expect(refs.launchBtn.click).not.toHaveBeenCalled();
    click('salvage-lanes', 0);
    expect(refs.launchBtn.click).toHaveBeenCalledTimes(1);

    map.selectSector('prime-gate');
    click('prime-gate', 0);
    expect(refs.launchBtn.click).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('the down arrow goes from the chapter to its selected row, then down the rows, heard before InputSystem can stop it', () => {
    // The node holding the focus: inside a chapter, or inside a sector row.
    const focusOn = (kind) => ({
      closest: (selector) =>
        selector === `[data-campaign-${kind}]` ? {} : null,
    });
    const fakeDocument = { activeElement: focusOn('chapter') };
    let onKey;
    // A menu key of the input layer stack (window capture, before
    // InputSystem's document listeners).
    vi.spyOn(inputLayers, 'addBase').mockImplementation((fn) => (onKey = fn));
    vi.stubGlobal('document', fakeDocument);
    const list = () => ({ innerHTML: '', querySelectorAll: () => [] });
    const text = () => ({ textContent: '', hidden: false });
    const refs = {
      root: { addEventListener: () => {} },
      nodes: list(),
      sectors: { ...list(), checkVisibility: () => true },
      detailTitle: text(),
      detailHeadStart: text(),
      launchBtn: { dataset: {}, disabled: false },
    };
    const focused = [];
    // A row that takes the focus is the selection, as focusin makes it.
    refs.sectors.querySelector = (selector) => ({
      focus: () => {
        const id = selector.match(/"(.+)"/)[1];
        focused.push(id);
        fakeDocument.activeElement = focusOn('row');
        map.selectSector(id);
      },
    });
    const map = new CampaignMap({ refs, prepareTravel: () => {} });
    map.bindCampaignControls();
    map.chapters = campaignChapters(records(['debris-wake']));
    map.selectSector('salvage-lanes');
    const press = (key) => onKey({ key, preventDefault: () => {} });
    expect(inputLayers.addBase).toHaveBeenCalledTimes(1);

    press('ArrowDown');
    press('ArrowDown');
    expect(focused).toEqual(['salvage-lanes', 'prime-gate']);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is drawn in the menu, not opened: no overlay, Escape does nothing, and the arrows only count while the panel is in view', () => {
    const fakeDocument = { activeElement: null };
    let onKey;
    vi.spyOn(inputLayers, 'addBase').mockImplementation((fn) => (onKey = fn));
    vi.stubGlobal('document', fakeDocument);
    const list = () => ({ innerHTML: '', querySelectorAll: () => [] });
    const text = () => ({ textContent: '', hidden: false });
    let visible = true;
    const refs = {
      root: { addEventListener: () => {} },
      nodes: list(),
      sectors: { ...list(), checkVisibility: () => visible },
      detailTitle: text(),
      detailHeadStart: text(),
      launchBtn: { dataset: {}, disabled: false },
    };
    const map = new CampaignMap({ refs, prepareTravel: () => {} });
    map.bindCampaignControls();
    expect(map.openMap).toBeUndefined();
    expect(map.closeMap).toBeUndefined();
    map.chapters = campaignChapters(records(['debris-wake']));
    map.selectSector('salvage-lanes');
    const focused = [];
    refs.sectors.querySelector = (selector) => ({
      focus: () => focused.push(selector.match(/"(.+)"/)[1]),
    });
    fakeDocument.activeElement = {
      closest: (selector) => (selector === '[data-campaign-row]' ? {} : null),
    };
    const preventDefault = vi.fn();
    onKey({ key: 'Escape', preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    visible = false;
    onKey({ key: 'ArrowDown', preventDefault });
    expect(focused).toEqual([]);
    visible = true;
    onKey({ key: 'ArrowDown', preventDefault });
    expect(focused).toEqual(['prime-gate']);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('draws the panel each time the menu is shown; after a sector run it also shows the Campaign tab and focuses the next sector', async () => {
    const restoreDom = installDomStubs();
    updateRecords({ sectorWon: 'debris-wake', sectorTime: 250 });
    const list = () => ({
      innerHTML: '',
      querySelectorAll: () => [],
      querySelector: () => ({ focus }),
    });
    const text = () => ({
      textContent: '',
      hidden: false,
      replaceChildren() {},
    });
    const focus = vi.fn();
    const refs = {
      root: { addEventListener: () => {} },
      nodes: list(),
      sectors: list(),
      detailTitle: text(),
      detailHeadStart: text(),
      launchBtn: { dataset: {}, disabled: false },
    };
    const showTab = vi.fn();
    const map = new CampaignMap({ refs, showTab, prepareTravel: () => {} });
    vi.spyOn(map, 'renderLog').mockImplementation(() => {});

    map.menuShown();
    expect(refs.nodes.innerHTML).toContain('data-campaign-chapter="1"');
    expect(refs.launchBtn.dataset.sector).toBe('salvage-lanes');
    expect(showTab).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();

    map.noteRunStart('debris-wake');
    map.menuShown();
    map.menuShown();
    await Promise.resolve();
    expect(showTab).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(map.returnToMap).toBe(false);
    restoreDom();
  });

  it("logs the prologue, an entry per sector won and the next one, and the lines said so far under the speaker's label", () => {
    expect(wakeLogEntries(records())).toEqual({
      entries: [expect.objectContaining({ title: 'Before launch' })],
      next: { title: '1 · Debris Wake' },
    });
    expect(wakeTranscript(records())).toEqual([]);
    const won = records(['debris-wake']);
    const { entries, next } = wakeLogEntries(won);
    expect(entries.map(({ title }) => title)).toEqual([
      'Before launch',
      '1 · Debris Wake',
    ]);
    expect(next).toEqual({ title: '2 · Salvage Lanes' });
    const [debris] = wakeTranscript(won);
    expect(debris.sector).toBe('Debris Wake');
    expect(debris.lines).toContainEqual({
      speaker: 'WAKE · YOUR SHIP',
      text: 'That signal could keep our lights on. Bring back what you can.',
    });
    expect(debris.lines.map(({ text }) => text)).toContain(
      'Debris Wake. What the Ring let go of. All of it is still counted.'
    );
    expect(
      wakeLogEntries(records(SECTORS.map(({ id }) => id))).next
    ).toBeNull();
  });
});

describe('campaign map focus', () => {
  it('a pad passing over a locked row leaves Launch alone; the keyboard still selects it', () => {
    const body = { dataset: { inputDevice: 'gamepad' } };
    vi.stubGlobal('document', { body, addEventListener: () => {} });
    const list = () => ({ innerHTML: '', querySelectorAll: () => [] });
    const text = () => ({ textContent: '', hidden: false });
    let onFocusIn;
    const refs = {
      root: {
        addEventListener: (name, fn) => {
          if (name === 'focusin') onFocusIn = fn;
        },
      },
      nodes: list(),
      sectors: list(),
      detailTitle: text(),
      detailHeadStart: text(),
      launchBtn: { dataset: {}, disabled: false },
    };
    const map = new CampaignMap({ refs, prepareTravel: () => {} });
    map.bindCampaignControls();
    map.chapters = campaignChapters(records(['debris-wake']));
    const focusRow = (id, locked) =>
      onFocusIn({
        target: {
          closest: () => ({
            dataset: { campaignRow: id },
            classList: { contains: (name) => locked && name === 'is-locked' },
          }),
        },
      });

    map.selectSector('salvage-lanes');
    focusRow('prime-gate', true);
    expect(refs.launchBtn.dataset.sector).toBe('salvage-lanes');
    expect(refs.launchBtn.disabled).toBe(false);

    body.dataset.inputDevice = 'keyboard';
    focusRow('prime-gate', true);
    expect(refs.launchBtn.dataset.sector).toBe('prime-gate');
    expect(refs.launchBtn.disabled).toBe(true);
    vi.unstubAllGlobals();
  });
});
