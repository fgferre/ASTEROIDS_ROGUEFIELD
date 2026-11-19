import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDomStubs } from '../../__helpers__/headlessGame.js';
import { MainMenu } from '../../../src/modules/ui/MainMenu.js';

// A container that keeps its listeners, so a test can fire them.
function fakeNode(children = []) {
  const listeners = {};
  return {
    children,
    addEventListener: (type, fn) => (listeners[type] = fn),
    fire: (type, event = {}) => listeners[type]?.(event),
    contains(node) {
      return Boolean(node) && children.includes(node);
    },
    querySelector() {
      return children[0];
    },
  };
}

function fakeButton(hint) {
  const button = { dataset: { hint } };
  button.closest = () => button;
  return button;
}

describe('Main menu mode line', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  it('follows the hovered or focused button and falls back to focus, then the first', () => {
    const [campaign, descent, daily] = ['Campaign', 'Descent', 'Daily'].map(
      fakeButton
    );
    const nav = fakeNode([campaign, descent, daily]);
    const hint = { textContent: '' };
    new MainMenu({ refs: { nav, hint } }).bindModeHints();
    expect(hint.textContent).toBe('Campaign');

    nav.fire('pointerover', { target: descent });
    expect(hint.textContent).toBe('Descent');

    document.activeElement = daily;
    nav.fire('focusin', { target: daily });
    expect(hint.textContent).toBe('Daily');
    nav.fire('pointerover', { target: descent });
    nav.fire('pointerleave');
    expect(hint.textContent).toBe('Daily');

    document.activeElement = null;
    nav.fire('focusout', { relatedTarget: null });
    expect(hint.textContent).toBe('Campaign');
  });

  it('the hull line follows the hovered or focused chip, else the selected hull', () => {
    const chip = (hullId) => {
      const node = { dataset: { hullId } };
      node.closest = () => node;
      return node;
    };
    const [slicer, bastion] = [chip('solar-slicer'), chip('bastion')];
    const chips = fakeNode([slicer, bastion]);
    const line = { innerHTML: '' };
    const menu = new MainMenu({
      refs: { shipSelectorOptions: chips, shipSelectorLabel: line },
      settings: {
        getCategoryValues: () => ({ selectedHull: 'default-hull' }),
      },
      hangar: () => ({
        hullFor: (id) => id,
        isHullUnlocked: (id) => id !== 'bastion',
      }),
    });
    menu.bindHullLine();
    menu.showHullLine();
    expect(line.innerHTML).toContain('Balanced');

    chips.fire('pointerover', { target: bastion });
    expect(line.innerHTML).toContain('Tough, slow');
    expect(line.innerHTML).toContain('520 Salvage in the Hangar');

    chips.fire('focusin', { target: slicer });
    expect(line.innerHTML).toContain('Fast, fragile');
    expect(line.innerHTML).not.toContain('Hangar');

    chips.fire('pointerleave');
    expect(line.innerHTML).toContain('Balanced');
  });
});

describe('Main menu mode tabs', () => {
  it('shows one tab at a time, marks it, and starts on Campaign', () => {
    const tab = (prepTab) => {
      const attrs = {};
      return {
        dataset: { prepTab },
        attrs,
        setAttribute: (name, value) => (attrs[name] = value),
        removeAttribute: (name) => delete attrs[name],
      };
    };
    const tabs = ['campaign', 'descent', 'daily', 'bossrush'].map(tab);
    const strip = fakeNode(tabs);
    strip.querySelectorAll = () => tabs;
    const nav = { dataset: {} };
    const menu = new MainMenu({ refs: { nav, tabs: strip } });
    menu.bindPrepTabs();
    expect(nav.dataset.activeTab).toBe('campaign');
    expect(tabs[0].attrs).toEqual({
      'aria-selected': 'true',
      'aria-current': 'true',
    });

    strip.fire('click', { target: { closest: () => tabs[2] } });
    expect(nav.dataset.activeTab).toBe('daily');
    expect(menu.prepTab).toBe('daily');
    expect(tabs[2].attrs['aria-current']).toBe('true');
    expect(tabs[0].attrs).toEqual({ 'aria-selected': 'false' });

    menu.setPrepTab('campaign');
    expect(nav.dataset.activeTab).toBe('campaign');
  });
});

describe('Main menu Wake log sheet', () => {
  it('opens from its button, stays open on a tap inside, closes on X or a tap elsewhere', () => {
    const nav = fakeNode();
    const open = new Set();
    nav.classList = {
      toggle: (name, on) => (on ? open.add(name) : open.delete(name)),
    };
    // A tap target: `sheet` is its data-log-sheet, `inLog` whether it sits in the log.
    const tap = (sheet, inLog = false) =>
      nav.fire('click', {
        target: {
          closest: (selector) =>
            selector === '[data-log-sheet]'
              ? sheet && { dataset: { logSheet: sheet } }
              : inLog,
        },
      });
    new MainMenu({ refs: { nav } }).bindWakeLogSheet();

    tap('open');
    expect(open.has('is-log-open')).toBe(true);
    tap(null, true);
    expect(open.has('is-log-open')).toBe(true);
    tap('close', true);
    expect(open.has('is-log-open')).toBe(false);
    tap('open');
    tap(null);
    expect(open.has('is-log-open')).toBe(false);
  });
});

describe('Main menu launch row', () => {
  const slot = () => {
    const slot = { innerHTML: '', dataset: {}, listeners: {} };
    slot.addEventListener = (type, fn) => (slot.listeners[type] = fn);
    return slot;
  };
  function build({ pressure, owned = {}, seals = 0, sealed = [], start } = {}) {
    const calls = { pressure: [], settings: [], hangarClicks: 0 };
    const hangar = {
      pressure: { open: 2, selected: 0, ...pressure },
      owned,
      startingCard: start ?? null,
      contractTotal: () => seals,
      getSealed: () => sealed,
      setPressure: (rung) => calls.pressure.push(rung),
    };
    const refs = {
      prepDifficulty: slot(),
      beforeLaunch: slot(),
      hangarBtn: { click: () => calls.hangarClicks++ },
    };
    const menu = new MainMenu({
      refs,
      settings: {
        getSetting: () => 'veteran',
        setSetting: (...args) => calls.settings.push(args),
      },
      hangar: () => hangar,
    });
    menu.refreshMenuStatus = () => menu.refreshPrepSlots();
    menu.bindPrepSlots();
    menu.refreshPrepSlots();
    return { menu, refs, calls };
  }
  const labels = (html) =>
    [...html.matchAll(/<option[^>]*>([^<]+)</g)].map((m) => m[1]);

  it('lists the presets and exactly the open rungs', () => {
    const { refs } = build();
    expect(labels(refs.prepDifficulty.innerHTML)).toEqual([
      'Pilot',
      'Veteran',
      'Warden',
      'Pressure I',
      'Pressure II',
    ]);
  });

  it('picks a rung through the Hangar, and a preset by clearing the rung', () => {
    const { refs, calls } = build({ pressure: { selected: 1 } });
    expect(refs.prepDifficulty.innerHTML).toContain(
      'value="pressure-1" selected'
    );
    refs.prepDifficulty.listeners.change({ target: { value: 'pressure-2' } });
    expect(calls.pressure).toEqual([2]);
    refs.prepDifficulty.listeners.change({ target: { value: 'warden' } });
    expect(calls.settings).toEqual([
      ['gameplay', 'difficulty', 'warden', { source: 'ui' }],
    ]);
    expect(calls.pressure).toEqual([2, 0]);
  });

  it('the Daily Field tab locks the list on Veteran', () => {
    const { menu, refs } = build({ pressure: { selected: 1 } });
    menu.prepTab = 'daily';
    menu.refreshPrepSlots();
    expect(refs.prepDifficulty.innerHTML).toContain('disabled');
    expect(refs.prepDifficulty.innerHTML).toContain('value="veteran" selected');
  });

  it('Before launch is empty without a Seal or the Flight School, then names the choices', () => {
    expect(build().refs.beforeLaunch.innerHTML).toBe('');
    const { refs, calls } = build({
      seals: 1,
      sealed: ['cinder_trail'],
      owned: { 'flight-school': true },
    });
    expect(refs.beforeLaunch.innerHTML).toContain('out of the draw');
    expect(refs.beforeLaunch.innerHTML).toContain('Flight School · no card');
    refs.beforeLaunch.listeners.click({
      target: { closest: () => ({}) },
    });
    expect(calls.hangarClicks).toBe(1);
  });
});
