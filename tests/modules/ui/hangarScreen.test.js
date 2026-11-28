import { describe, expect, it, vi } from 'vitest';
import { isPilotStale } from '../../../src/core/storage.js';
import { HangarScreen } from '../../../src/modules/ui/HangarScreen.js';
import { hangarTransmission } from '../../../src/modules/ui/transmissions.js';

vi.mock('../../../src/core/storage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  isPilotStale: vi.fn(() => false),
}));

describe('Hangar screen', () => {
  it('a purchase line speaks through the transmission events; leaving the Hangar ends it', () => {
    const emit = vi.fn();
    const hullLock = { textContent: '', hidden: true, scrollIntoView: vi.fn() };
    const screen = new HangarScreen({
      refs: { hullLock, overlay: { setAttribute: vi.fn() } },
      emit,
      showScreen: vi.fn(),
      announceVisibility: vi.fn(),
      refreshShipSelector: vi.fn(),
    });
    const line = hangarTransmission('bastion-hull');

    screen.showPurchaseLine(line);
    expect(hullLock.textContent).toBe(`${line.speaker}: ${line.text}`);
    expect(emit.mock.calls).toEqual([
      ['transmission-queued', line],
      ['transmission-shown', line],
    ]);

    screen.hangarState.isOpen = true;
    screen.closeHangar();
    screen.closeHangar();
    expect(emit.mock.calls.slice(2)).toEqual([['transmission-finished', line]]);
  });

  it('shows what the hovered or focused hull does, else the selected one', () => {
    const listeners = {};
    const hulls = {
      addEventListener: (type, fn) => (listeners[type] = fn),
    };
    const hullInfo = { innerHTML: '' };
    const screen = new HangarScreen({
      refs: {
        overlay: { addEventListener: vi.fn() },
        hulls,
        hullInfo,
        hullLock: { hidden: true, textContent: '' },
      },
      emit: vi.fn(),
      selectedHullId: () => 'default-hull',
    });
    vi.stubGlobal('document', { addEventListener: vi.fn() });
    screen.bindHangarControls();
    vi.unstubAllGlobals();
    const button = { dataset: { hangarHull: 'bastion' }, disabled: true };
    button.closest = () => button;

    listeners.pointerover({ target: button });
    expect(hullInfo.innerHTML).toContain('Tough, slow');
    listeners.focusin({
      target: {
        ...button,
        dataset: { hangarHull: 'solar-slicer' },
        closest() {
          return this;
        },
      },
    });
    expect(hullInfo.innerHTML).toContain('Fast, fragile');
    listeners.pointerleave();
    expect(hullInfo.innerHTML).toContain('Balanced');
  });

  it('a tab click shows only its panel; a rung click picks that rung', () => {
    let click;
    const panel = (name) => ({ dataset: { hangarPanel: name }, hidden: false });
    const tab = (name) => ({
      dataset: { hangarTab: name },
      classList: { toggle: vi.fn() },
      setAttribute: vi.fn(),
      textContent: '',
    });
    const panels = ['ship', 'medals', 'pressure'].map(panel);
    const medalsTab = tab('medals');
    const rungButton = { dataset: { hangarPressure: '2' } };
    const hangar = {
      salvage: 0,
      pressure: { open: 2, selected: 0, best: 0 },
      getMedals: () => [{ id: 'first-light', unlockedAt: null, reward: {} }],
      getItems: () => [],
      getControlItems: () => [],
      getLicenses: () => [],
      contractTotal: () => 0,
      getSealed: () => [],
      getOpenCards: () => new Set(),
      owned: {},
      getFlightSchoolCards: () => [],
      startingCard: null,
      isHullUnlocked: () => true,
      setPressure: vi.fn(),
    };
    const screen = new HangarScreen({
      refs: {
        overlay: {
          addEventListener: (type, fn) => type === 'click' && (click = fn),
        },
        tabs: [tab('ship'), medalsTab, tab('pressure')],
        panels,
        medals: { innerHTML: '' },
        pressure: { innerHTML: '', querySelector: () => null },
        pressureNote: { textContent: '' },
        list: { innerHTML: '' },
        licenses: { innerHTML: '' },
        control: { innerHTML: '' },
        launch: { innerHTML: '', querySelector: () => null },
        hulls: { innerHTML: '', addEventListener: vi.fn() },
        hullInfo: { innerHTML: '' },
        hullLock: { hidden: true, textContent: '' },
        balance: { textContent: '' },
      },
      hangar: () => hangar,
      selectedHullId: () => 'default-hull',
      hullName: (hull) => hull.id,
      emit: vi.fn(),
    });
    vi.stubGlobal('document', { addEventListener: vi.fn() });
    screen.bindHangarControls();
    vi.unstubAllGlobals();

    click({
      target: { closest: (sel) => (sel.includes('tab') ? medalsTab : null) },
    });
    expect(panels.map((p) => p.hidden)).toEqual([true, false, true]);
    expect(medalsTab.textContent).toBe('Medals · 0/1');

    click({
      target: {
        closest: (sel) => (sel.includes('pressure') ? rungButton : null),
      },
    });
    expect(hangar.setPressure).toHaveBeenCalledWith(2);
  });

  it('a licence BUY click buys it, ON switches it off; a chip seals or picks', () => {
    let click;
    const hangar = {
      salvage: 0,
      pressure: { open: 0, selected: 0, best: 0 },
      getMedals: () => [],
      getItems: () => [],
      getControlItems: () => [],
      getLicenses: () => [],
      contractTotal: () => 0,
      getSealed: () => [],
      getOpenCards: () => new Set(),
      owned: {},
      getFlightSchoolCards: () => [],
      startingCard: null,
      isHullUnlocked: () => true,
      buyLicense: vi.fn(),
      setLicenseOn: vi.fn(),
      toggleSeal: vi.fn(),
      setStartingCard: vi.fn(),
    };
    const screen = new HangarScreen({
      refs: {
        overlay: {
          addEventListener: (type, fn) => type === 'click' && (click = fn),
        },
        tabs: [],
        panels: [],
        medals: { innerHTML: '' },
        pressure: { innerHTML: '', querySelector: () => null },
        pressureNote: { textContent: '' },
        list: { innerHTML: '' },
        licenses: { innerHTML: '', querySelector: () => null },
        control: { innerHTML: '' },
        launch: { innerHTML: '', querySelector: () => null },
        hulls: { innerHTML: '', addEventListener: vi.fn() },
        hullInfo: { innerHTML: '' },
        hullLock: { hidden: true, textContent: '' },
        balance: { textContent: '' },
      },
      hangar: () => hangar,
      selectedHullId: () => 'default-hull',
      hullName: (hull) => hull.id,
      emit: vi.fn(),
    });
    vi.stubGlobal('document', { addEventListener: vi.fn() });
    screen.bindHangarControls();
    vi.unstubAllGlobals();
    const hit = (attr, button) => ({
      target: { closest: (sel) => (sel.includes(attr) ? button : null) },
    });

    click(
      hit('data-hangar-license-buy', {
        dataset: { hangarLicenseBuy: 'shard_halo' },
      })
    );
    expect(hangar.buyLicense).toHaveBeenCalledWith('shard_halo');

    click(
      hit('data-hangar-license-on', {
        dataset: { hangarLicenseOn: 'shard_halo' },
        getAttribute: () => 'true',
      })
    );
    expect(hangar.setLicenseOn).toHaveBeenCalledWith('shard_halo', false);

    click(hit('data-hangar-seal', { dataset: { hangarSeal: 'plasma' } }));
    expect(hangar.toggleSeal).toHaveBeenCalledWith('plasma');
    click(hit('data-hangar-start', { dataset: { hangarStart: 'none' } }));
    expect(hangar.setStartingCard).toHaveBeenCalledWith(null);
  });
});

describe('Hangar pad tabs', () => {
  it('LB/RB click and focus the next shown tab, wrapping and skipping a hidden one', () => {
    const tab = (hangarTab, shown = true) => ({
      dataset: { hangarTab },
      getClientRects: () => (shown ? [{}] : []),
      click: vi.fn(),
      focus: vi.fn(),
    });
    const [ship, hidden, cards, stats] = [
      tab('ship'),
      tab('lab', false),
      tab('cards'),
      tab('stats'),
    ];
    const screen = new HangarScreen({
      refs: { tabs: [ship, hidden, cards, stats] },
      emit: vi.fn(),
    });

    screen.cycleTab(1);
    expect(hidden.click).not.toHaveBeenCalled();
    expect(cards.click).toHaveBeenCalledTimes(1);
    expect(cards.focus).toHaveBeenCalledWith({ preventScroll: true });

    screen.tab = 'stats';
    screen.cycleTab(1);
    expect(ship.click).toHaveBeenCalledTimes(1);
    expect(ship.focus).toHaveBeenCalled();
  });

  it('a BUY click with a stale pilot closes the Hangar and shows nothing as bought', () => {
    let click;
    const hangar = { buy: vi.fn(() => false), owned: {} };
    const screen = new HangarScreen({
      refs: {
        overlay: {
          addEventListener: (type, fn) => type === 'click' && (click = fn),
        },
        hulls: { addEventListener: vi.fn() },
      },
      hangar: () => hangar,
      emit: vi.fn(),
    });
    vi.stubGlobal('document', { addEventListener: vi.fn() });
    screen.bindHangarControls();
    vi.unstubAllGlobals();
    screen.renderHangar = vi.fn();
    screen.closeHangar = vi.fn();
    const target = {
      closest: (sel) =>
        sel.includes('data-hangar-buy')
          ? {
              dataset: { hangarBuy: 'x' },
              closest: () => ({ querySelector: () => null }),
            }
          : null,
    };

    click({ target });
    expect(screen.closeHangar).not.toHaveBeenCalled(); // refused for Salvage
    expect(screen.renderHangar).toHaveBeenCalledTimes(1);
    isPilotStale.mockReturnValue(true);
    click({ target });
    isPilotStale.mockReturnValue(false);
    expect(screen.closeHangar).toHaveBeenCalledTimes(1);
    expect(screen.renderHangar).toHaveBeenCalledTimes(1);
    expect(hangar.owned).toEqual({});
  });

  it('a click on any pilot-changing button with a stale pilot closes the Hangar and changes nothing', () => {
    let click;
    const hangar = {
      setPressure: vi.fn(),
      buyLicense: vi.fn(),
      setLicenseOn: vi.fn(),
      toggleSeal: vi.fn(),
      setStartingCard: vi.fn(),
      buy: vi.fn(),
    };
    const screen = new HangarScreen({
      refs: {
        overlay: {
          addEventListener: (type, fn) => type === 'click' && (click = fn),
        },
        hulls: { addEventListener: vi.fn() },
      },
      hangar: () => hangar,
      emit: vi.fn(),
    });
    vi.stubGlobal('document', { addEventListener: vi.fn() });
    screen.bindHangarControls();
    vi.unstubAllGlobals();
    screen.renderHangar = vi.fn();
    screen.closeHangar = vi.fn();
    const buttons = [
      ['data-hangar-pressure', { hangarPressure: '1' }],
      ['data-hangar-license-buy', { hangarLicenseBuy: 'shard_halo' }],
      ['data-hangar-license-on', { hangarLicenseOn: 'shard_halo' }],
      ['data-hangar-seal', { hangarSeal: 'plasma' }],
      ['data-hangar-start', { hangarStart: 'propulsors' }],
      ['data-hangar-buy', { hangarBuy: 'x' }],
    ];
    isPilotStale.mockReturnValue(true);
    buttons.forEach(([attr, dataset]) =>
      click({
        target: {
          closest: (sel) =>
            sel.includes(attr)
              ? { dataset, getAttribute: () => 'false', closest: () => null }
              : null,
        },
      })
    );
    isPilotStale.mockReturnValue(false);
    expect(screen.closeHangar).toHaveBeenCalledTimes(buttons.length);
    expect(screen.renderHangar).not.toHaveBeenCalled();
    Object.values(hangar).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });
});
