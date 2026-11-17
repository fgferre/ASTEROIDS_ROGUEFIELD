import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupLoadingScreen } from '../../../src/modules/menu/loadingScreen.js';

function fakeElement() {
  const classes = new Set();
  const listeners = {};
  return {
    classes,
    listeners,
    style: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (...names) => names.forEach((c) => classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    addEventListener: (type, fn) => (listeners[type] = fn),
    removeEventListener: (type) => delete listeners[type],
    parentNode: null,
    focus: vi.fn(),
    querySelector: vi.fn(),
  };
}

function boot(search, pad = { pads: [] }) {
  const screen = fakeElement();
  const menu = fakeElement();
  menu.classes.add('hidden');
  const menuButton = fakeElement();
  menu.querySelector.mockReturnValue(menuButton);
  const button = fakeElement();
  const byId = {
    'loading-screen': screen,
    'menu-screen': menu,
    'press-start-btn': button,
  };
  const docListeners = {};
  vi.stubGlobal('window', { location: { search } });
  vi.stubGlobal('navigator', { getGamepads: () => pad.pads });
  vi.stubGlobal('requestAnimationFrame', (fn) => {
    pad.frame = fn;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('document', {
    getElementById: (id) => byId[id] ?? null,
    addEventListener: (type, fn) => (docListeners[type] = fn),
    removeEventListener: (type) => delete docListeners[type],
  });
  let complete;
  setupLoadingScreen((_progress, onComplete) => (complete = onComplete));
  complete();
  return { screen, menu, menuButton, button, docListeners };
}

const enter = () => ({
  key: 'Enter',
  repeat: false,
  preventDefault: vi.fn(),
});

describe('loading screen PRESS START gate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps the menu hidden and shows the gate when loading ends', () => {
    const { screen, menu, button } = boot('');
    expect(screen.classes.has('loading-screen--gate')).toBe(true);
    expect(screen.classes.has('hidden')).toBe(false);
    expect(menu.classes.has('menu-screen--gated')).toBe(true);
    expect(button.focus).toHaveBeenCalled();
  });

  it('opens the menu once on Enter, without leaking the key', () => {
    const { screen, menu, menuButton, docListeners } = boot('');
    const event = enter();
    docListeners.keydown(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(menu.classes.has('menu-screen--gated')).toBe(false);
    expect(menu.classes.has('hidden')).toBe(false);
    expect(screen.classes.has('hidden')).toBe(true);
    expect(menuButton.focus).toHaveBeenCalledTimes(1);
    expect(docListeners.keydown).toBeUndefined();
  });

  it('opens the menu on a click', () => {
    const { screen, menu } = boot('');
    screen.listeners.click();
    expect(menu.classes.has('hidden')).toBe(false);
  });

  it('opens the menu on pad A or Start, once', () => {
    const pad = { pads: [{ buttons: [{ pressed: false }] }] };
    const { menu, menuButton } = boot('', pad);
    pad.frame();
    expect(menu.classes.has('menu-screen--gated')).toBe(true);
    pad.pads = [{ buttons: [{ pressed: true }] }];
    pad.frame();
    expect(menu.classes.has('menu-screen--gated')).toBe(false);
    expect(menuButton.focus).toHaveBeenCalledTimes(1);
  });

  it('ignores a pad button already held when the gate appears', () => {
    const held = Array(10).fill({ pressed: false });
    held[9] = { pressed: true };
    const pad = { pads: [{ buttons: held }] };
    const { menu } = boot('', pad);
    pad.frame();
    expect(menu.classes.has('menu-screen--gated')).toBe(true);
    pad.pads = [{ buttons: [{ pressed: false }] }];
    pad.frame();
    pad.pads = [{ buttons: [{ pressed: true }] }];
    pad.frame();
    expect(menu.classes.has('menu-screen--gated')).toBe(false);
  });

  it.each(['?profile=x', '?scene=ring', '?content=a', '?replay=u'])(
    'shows the menu directly with %s',
    (search) => {
      const { screen, menu, docListeners } = boot(search);
      expect(menu.classes.has('hidden')).toBe(false);
      expect(screen.classes.has('hidden')).toBe(true);
      expect(docListeners.keydown).toBeUndefined();
    }
  );
});
