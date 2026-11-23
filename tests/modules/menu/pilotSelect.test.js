import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStubs } from '../../__helpers__/domStubs.js';
import {
  chooseSlot,
  deleteSlot,
  resolveActiveSlot,
} from '../../../src/core/storage.js';
import { openPilotSelect } from '../../../src/modules/menu/pilotSelect.js';

// Another tab is another page on the same storage: it writes the keys itself.
const HANGAR_2 = 'roguefield:slot2:hangar:v2';
const otherTabMakesPilot2 = (salvage) =>
  localStorage.setItem(HANGAR_2, JSON.stringify({ salvage }));

// The pilots screen on a stand-in page: clicks reach its buttons by dataset,
// keys its capture listener, and `pad.frame()` reads the stand-in pad.
function openScreen(onContinue = vi.fn(), onBack = vi.fn()) {
  let onClick = null;
  let onKey = null;
  let frame = null;
  const pad = { buttons: Array.from({ length: 16 }, () => ({})), axes: [] };
  const screen = {
    innerHTML: '',
    setAttribute() {},
    addEventListener: (type, fn) => type === 'click' && (onClick = fn),
    querySelector: () => null,
    querySelectorAll: () => [],
    remove: vi.fn(),
  };
  vi.stubGlobal('navigator', { getGamepads: () => [pad] });
  vi.stubGlobal('requestAnimationFrame', (fn) => ((frame = fn), 1));
  vi.stubGlobal('document', {
    createElement: () => screen,
    body: { appendChild() {} },
    addEventListener: (type, fn) => type === 'keydown' && (onKey = fn),
    removeEventListener() {},
    activeElement: null,
  });
  openPilotSelect(onContinue, onBack);
  return {
    screen,
    onContinue,
    onBack,
    click: (dataset) => onClick({ target: { closest: () => ({ dataset }) } }),
    key: (key) =>
      onKey({ key, preventDefault() {}, stopPropagation() {}, repeat: false }),
    padB: () => {
      pad.buttons[1] = { pressed: true };
      frame();
      pad.buttons[1] = { pressed: false };
      frame?.();
    },
  };
}

describe('pilots screen with the pilots changed in another tab', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    window.removeEventListener = () => {};
    window.location.reload = vi.fn();
    window.sessionStorage = {
      getItem: () => null,
      setItem() {},
      removeItem() {},
    };
    resolveActiveSlot();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    restoreDom();
    resolveActiveSlot();
  });

  it('a box opened before another tab replaced the pilot deletes nothing', () => {
    otherTabMakesPilot2(59);
    const page = openScreen();
    page.click({ pilotDelete: '2' });
    expect(page.screen.innerHTML).toContain('59 Salvage');
    deleteSlot(2);
    otherTabMakesPilot2(101);
    page.click({ confirm: 'delete' });
    expect(JSON.parse(localStorage.getItem(HANGAR_2))).toEqual({
      salvage: 101,
    });
    expect(page.screen.innerHTML).toContain('<dd>101</dd>');
  });

  it('a Delete shown before another tab deleted the pilot asks nothing', () => {
    otherTabMakesPilot2(59);
    const page = openScreen();
    deleteSlot(2);
    expect(() => page.click({ pilotDelete: '2' })).not.toThrow();
    expect(page.screen.innerHTML).not.toContain('pilot-confirm');
  });

  it('Continue on a pilot another tab deleted loads it again', () => {
    chooseSlot(2);
    resolveActiveSlot();
    otherTabMakesPilot2(59);
    // Another tab deletes pilot 2 and goes on to fly pilot 3.
    deleteSlot(2);
    chooseSlot(3);
    const page = openScreen();
    page.click({ pilotSlot: '2' });
    expect(page.onContinue).not.toHaveBeenCalled();
    expect(window.location.reload).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('roguefield:slots:v1')).active).toBe(
      2
    );
  });

  it('Continue on a pilot nobody else touched goes straight on', () => {
    const page = openScreen();
    page.click({ pilotSlot: '1' });
    expect(page.onContinue).toHaveBeenCalled();
    expect(window.location.reload).not.toHaveBeenCalled();
  });
});

describe('pilots screen, back to PRESS START', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    vi.stubGlobal('cancelAnimationFrame', () => {});
    window.removeEventListener = () => {};
    resolveActiveSlot();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    restoreDom();
  });

  it('Escape leaves the screen for the gate', () => {
    const page = openScreen();
    page.key('Escape');
    expect(page.onBack).toHaveBeenCalledTimes(1);
    expect(page.screen.remove).toHaveBeenCalled();
    expect(page.onContinue).not.toHaveBeenCalled();
  });

  it('pad B leaves the screen for the gate', () => {
    const page = openScreen();
    page.padB();
    expect(page.onBack).toHaveBeenCalledTimes(1);
    expect(page.screen.remove).toHaveBeenCalled();
  });

  it('with the delete box up, Escape and B only close the box', () => {
    otherTabMakesPilot2(59);
    const page = openScreen();
    page.click({ pilotDelete: '2' });
    page.key('Escape');
    expect(page.screen.innerHTML).not.toContain('pilot-confirm__veil');
    page.click({ pilotDelete: '2' });
    page.padB();
    expect(page.screen.innerHTML).not.toContain('pilot-confirm__veil');
    expect(page.onBack).not.toHaveBeenCalled();
    expect(localStorage.getItem(HANGAR_2)).not.toBeNull();
  });
});
