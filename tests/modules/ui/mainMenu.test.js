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
