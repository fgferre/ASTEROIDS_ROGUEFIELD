import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupLoadingScreen } from '../../../src/modules/menu/loadingScreen.js';

function fakeElement() {
  const classes = new Set();
  const listeners = {};
  return {
    classes,
    listeners,
    style: { setProperty: vi.fn() },
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

const clock = { now: 0 };

function boot(
  search,
  pad = { pads: [] },
  { awake = true, onStart, device, via = 'click' } = {}
) {
  const screen = fakeElement();
  const hint = { textContent: 'Enter, click or Ⓐ to begin' };
  screen.querySelector.mockReturnValue(hint);
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
  vi.stubGlobal('navigator', {
    getGamepads: () => pad.pads,
    userActivation: { hasBeenActive: awake },
  });
  vi.stubGlobal('performance', { now: () => clock.now });
  vi.stubGlobal('requestAnimationFrame', (fn) => {
    pad.frame = fn;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('document', {
    getElementById: (id) => byId[id] ?? null,
    addEventListener: (type, fn) => (docListeners[type] = fn),
    removeEventListener: (type) => delete docListeners[type],
    body: { dataset: { inputDevice: device } },
  });
  let complete;
  setupLoadingScreen(
    (_progress, onComplete) => (complete = onComplete),
    onStart
  );
  complete();
  // The opening: a click (a gesture) or a pad press goes on to the gate.
  if (via === 'click') screen.listeners.click();
  if (via === 'pad') {
    const idle = pad.pads;
    pad.pads = [{ buttons: [{ pressed: true }] }];
    pad.frame();
    pad.pads = idle;
  }
  if (via !== 'none') vi.advanceTimersByTime(600);
  return { screen, menu, menuButton, button, docListeners, hint, pad };
}

const enter = () => ({
  key: 'Enter',
  repeat: false,
  preventDefault: vi.fn(),
});

describe('loading screen opening', () => {
  beforeEach(() => {
    clock.now = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('asks for a press once loaded, the menu still hidden', () => {
    const { screen, menu } = boot('', undefined, { via: 'none' });
    expect(screen.classes.has('loading-screen--ready')).toBe(true);
    expect(screen.classes.has('loading-screen--gate')).toBe(false);
    expect(screen.style.setProperty).toHaveBeenCalledWith('--load', '1');
    expect(menu.classes.has('menu-screen--gated')).toBe(true);
  });

  it('a click fades it into the gate, awake even before any gesture', () => {
    const { screen } = boot('', undefined, { awake: false, via: 'none' });
    screen.listeners.click();
    expect(screen.classes.has('loading-screen--leaving')).toBe(true);
    vi.advanceTimersByTime(600);
    expect(screen.classes.has('loading-screen--gate')).toBe(true);
    expect(screen.classes.has('loading-screen--asleep')).toBe(false);
    expect(screen.classes.has('loading-screen--ready')).toBe(false);
  });

  it('any key goes on, a lone modifier does not', () => {
    const { screen, docListeners } = boot('', undefined, { via: 'none' });
    docListeners.keydown({ key: 'Shift', preventDefault: vi.fn() });
    expect(screen.classes.has('loading-screen--leaving')).toBe(false);
    docListeners.keydown({ key: 'x', preventDefault: vi.fn() });
    vi.advanceTimersByTime(600);
    expect(screen.classes.has('loading-screen--gate')).toBe(true);
  });

  it('a pad press goes on, and the gate sleeps (no music from a pad)', () => {
    const { screen } = boot('', { pads: [] }, { awake: false, via: 'pad' });
    expect(screen.classes.has('loading-screen--gate')).toBe(true);
    expect(screen.classes.has('loading-screen--asleep')).toBe(true);
  });
});

describe('loading screen PRESS START gate', () => {
  beforeEach(() => {
    clock.now = 0;
    vi.useFakeTimers();
  });

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
    expect(screen.classes.has('loading-screen--starting')).toBe(true);
    expect(menu.classes.has('menu-screen--gated')).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(menu.classes.has('menu-screen--gated')).toBe(false);
    expect(menu.classes.has('hidden')).toBe(false);
    expect(screen.classes.has('hidden')).toBe(true);
    expect(menuButton.focus).toHaveBeenCalledTimes(1);
    expect(docListeners.keydown).toBeUndefined();
  });

  it('opens the menu on a click', () => {
    const { screen, menu } = boot('');
    screen.listeners.click();
    vi.advanceTimersByTime(1000);
    expect(menu.classes.has('hidden')).toBe(false);
  });

  it('opens the menu on pad A or Start, once', () => {
    const pad = { pads: [{ buttons: [{ pressed: false }] }] };
    const { menu, menuButton } = boot('', pad);
    pad.frame();
    expect(menu.classes.has('menu-screen--gated')).toBe(true);
    pad.pads = [{ buttons: [{ pressed: true }] }];
    pad.frame();
    vi.advanceTimersByTime(1000);
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
    vi.advanceTimersByTime(1000);
    expect(menu.classes.has('menu-screen--gated')).toBe(false);
  });

  it('asleep before any gesture: the first key wakes it, a later one starts', () => {
    const onStart = vi.fn();
    const { screen, docListeners } = boot('', undefined, {
      awake: false,
      onStart,
      via: 'pad',
    });
    expect(screen.classes.has('loading-screen--asleep')).toBe(true);
    // The capture listener (the wake) and the key listener hear the same key.
    const wake = docListeners.pointerdown;
    wake();
    docListeners.keydown(enter());
    expect(screen.classes.has('loading-screen--asleep')).toBe(false);
    clock.now = 300;
    docListeners.keydown(enter());
    expect(onStart).not.toHaveBeenCalled();
    clock.now = 600;
    docListeners.keydown(enter());
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(screen.classes.has('loading-screen--starting')).toBe(true);
  });

  it('names the tap by touch, asleep and awake', () => {
    const { hint, docListeners } = boot('', undefined, {
      awake: false,
      device: 'touch',
      via: 'pad',
    });
    expect(hint.textContent).toBe('Tap the screen');
    docListeners.pointerdown();
    expect(hint.textContent).toBe('Tap to begin');
  });

  it.each(['?profile=x', '?scene=ring', '?content=a', '?replay=u'])(
    'shows the menu directly with %s',
    (search) => {
      const { screen, menu, docListeners } = boot(search, undefined, {
        via: 'none',
      });
      expect(menu.classes.has('hidden')).toBe(false);
      expect(screen.classes.has('hidden')).toBe(true);
      expect(docListeners.keydown).toBeUndefined();
    }
  );
});
