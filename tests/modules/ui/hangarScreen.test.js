import { describe, expect, it, vi } from 'vitest';
import { HangarScreen } from '../../../src/modules/ui/HangarScreen.js';
import { hangarTransmission } from '../../../src/modules/ui/transmissions.js';

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
