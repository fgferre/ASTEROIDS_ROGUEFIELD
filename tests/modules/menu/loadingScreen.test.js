import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MENU_IDLE_MS,
  START_FAILED_LINE,
  setupLoadingScreen,
  showStartFailure,
} from '../../../src/modules/menu/loadingScreen.js';
import { morphIntoTitle } from '../../../src/modules/menu/openingMorph.js';
import { openPilotSelect } from '../../../src/modules/menu/pilotSelect.js';
import { isPilotStale } from '../../../src/core/storage.js';
import { inputLayers } from '../../../src/modules/input/inputLayers.js';

// The morph draws on a real page; here it either declines (null) or hands
// back a stand-in overlay.
vi.mock('../../../src/modules/menu/openingMorph.js', () => ({
  MORPH_MS: 2000,
  morphIntoTitle: vi.fn(() => null),
}));
// The pilots screen draws on a real page; here the pilot in play goes on.
vi.mock('../../../src/core/storage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  isPilotStale: vi.fn(() => false),
}));
vi.mock('../../../src/modules/menu/pilotSelect.js', () => ({
  openPilotSelect: vi.fn((onContinue) => onContinue()),
}));

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
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
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
  { awake = true, onStart, onLeave, device, via = 'click' } = {}
) {
  const screen = fakeElement();
  const hint = { textContent: 'Enter, click or Ⓐ to begin' };
  const line = fakeElement();
  screen.querySelector.mockImplementation((sel) =>
    sel === '.opening__line' ? line : hint
  );
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
  const winListeners = {};
  // What is open over the menu (panelOpen in loadingScreen.js).
  const page = { overlays: [] };
  vi.stubGlobal('window', {
    location: { search },
    addEventListener: (type, fn) => (winListeners[type] = fn),
    removeEventListener: () => {},
  });
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
    querySelector: () => null,
    querySelectorAll: () => page.overlays,
  });
  // A key, as the page hands it over: to the input layer stack, which gives
  // it to the step of the loading screen on top, or to the menu's keys.
  inputLayers.install(null);
  const press = (event) => inputLayers.onKeyDown(event);
  let complete;
  let progress;
  const gate = setupLoadingScreen(
    (onProgress, onComplete) => {
      progress = onProgress;
      complete = onComplete;
    },
    onStart,
    onLeave
  );
  if (via === 'loading')
    return { screen, line, menu, press, progress, complete };
  complete();
  // The opening: a click (a gesture) or a pad press goes on to the gate.
  if (via === 'click') screen.listeners.click();
  if (via === 'pad') {
    const idle = pad.pads;
    pad.pads = [{ buttons: [{ pressed: true }], axes: [] }];
    pad.frame();
    pad.pads = idle;
  }
  if (via !== 'none') vi.advanceTimersByTime(600);
  return {
    gate,
    screen,
    menu,
    menuButton,
    button,
    docListeners,
    winListeners,
    press,
    page,
    hint,
    pad,
  };
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
    const { screen, press } = boot('', undefined, { via: 'none' });
    press({ key: 'Shift', preventDefault: vi.fn() });
    expect(screen.classes.has('loading-screen--leaving')).toBe(false);
    press({ key: 'x', preventDefault: vi.fn() });
    vi.advanceTimersByTime(600);
    expect(screen.classes.has('loading-screen--gate')).toBe(true);
  });

  it('with the morph, waits for it; a press meanwhile skips to the gate', () => {
    const overlay = { classList: fakeElement().classList, remove: vi.fn() };
    morphIntoTitle.mockReturnValueOnce(overlay).mockReturnValueOnce(overlay);
    let { screen } = boot('', undefined, { via: 'none' });
    screen.listeners.click();
    vi.advanceTimersByTime(600);
    expect(screen.classes.has('loading-screen--gate')).toBe(false);
    vi.advanceTimersByTime(1400);
    expect(screen.classes.has('loading-screen--gate')).toBe(true);
    expect(overlay.classList.contains('opening-morph--gone')).toBe(true);
    vi.advanceTimersByTime(600);
    expect(overlay.remove).toHaveBeenCalled();

    ({ screen } = boot('', undefined, { via: 'none' }));
    screen.listeners.click();
    screen.listeners.click(); // the impatient second press
    expect(screen.classes.has('loading-screen--gate')).toBe(true);
    expect(screen.classes.has('loading-screen--starting')).toBe(false);
  });

  it('a pad press goes on, and the gate sleeps (no music from a pad)', () => {
    const { screen } = boot('', { pads: [] }, { awake: false, via: 'pad' });
    expect(screen.classes.has('loading-screen--gate')).toBe(true);
    expect(screen.classes.has('loading-screen--asleep')).toBe(true);
  });

  it('a start-up failure stays on its line and never opens the menu', () => {
    const { screen, line, menu, progress, complete } = boot('', undefined, {
      via: 'loading',
    });
    showStartFailure();
    progress(0.5);
    vi.advanceTimersByTime(5000);
    complete();
    vi.advanceTimersByTime(1000);
    expect(line.textContent).toBe(START_FAILED_LINE);
    expect(screen.classes.has('loading-screen--ready')).toBe(false);
    expect(screen.classes.has('hidden')).toBe(false);
    expect(menu.classes.has('hidden')).toBe(true);
    // The screen keeps the keys, and none goes on.
    expect(inputLayers.top().name).toBe('loading');
  });
});

describe('loading screen line', () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('names the true step, a joke between, the new step at once', () => {
    const { line, progress, complete } = boot('', undefined, {
      via: 'loading',
    });
    expect(line.textContent).toBe('Building the asteroid field');
    expect(line.classes.has('is-real')).toBe(true);
    vi.advanceTimersByTime(2400);
    expect(line.classes.has('is-real')).toBe(false);
    progress(0.3);
    expect(line.textContent).toBe('Lighting the field and painting the nebula');
    progress(0.7);
    expect(line.textContent).toBe(
      'Preparing the battle effects for your graphics card · 25%'
    );
    complete();
    const shown = line.textContent;
    vi.advanceTimersByTime(10000);
    expect(line.textContent).toBe(shown); // the turns stop once loaded
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
    const { screen, menu, menuButton, press } = boot('');
    const event = enter();
    press(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(screen.classes.has('loading-screen--starting')).toBe(true);
    expect(menu.classes.has('menu-screen--gated')).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(menu.classes.has('menu-screen--gated')).toBe(false);
    expect(menu.classes.has('hidden')).toBe(false);
    expect(screen.classes.has('hidden')).toBe(true);
    expect(menuButton.focus).toHaveBeenCalledTimes(1);
    expect(inputLayers.top()).toBe(null);
  });

  it('asks for the pilot before the menu opens', () => {
    let goOn = null;
    openPilotSelect.mockImplementationOnce((onContinue) => (goOn = onContinue));
    const { screen, menu, menuButton, press } = boot('');
    press(enter());
    vi.advanceTimersByTime(1000);
    expect(screen.classes.has('hidden')).toBe(true);
    expect(menu.classes.has('menu-screen--gated')).toBe(true);
    expect(menuButton.focus).not.toHaveBeenCalled();
    goOn();
    expect(menu.classes.has('menu-screen--gated')).toBe(false);
    expect(menuButton.focus).toHaveBeenCalledTimes(1);
  });

  it('back from the pilots shows the gate again, whose press reopens them', () => {
    let goBack = null;
    openPilotSelect.mockImplementationOnce((_, onBack) => (goBack = onBack));
    const { screen, menu, press } = boot('');
    press(enter());
    vi.advanceTimersByTime(1000);
    goBack();
    expect(screen.classes.has('hidden')).toBe(false);
    expect(screen.classes.has('loading-screen--starting')).toBe(false);
    expect(menu.classes.has('menu-screen--gated')).toBe(true);
    openPilotSelect.mockClear();
    press(enter());
    vi.advanceTimersByTime(1000);
    expect(openPilotSelect).toHaveBeenCalledTimes(1);
    expect(menu.classes.has('menu-screen--gated')).toBe(false);
  });

  it('opens the menu on a click', () => {
    const { screen, menu } = boot('');
    screen.listeners.click();
    vi.advanceTimersByTime(1000);
    expect(menu.classes.has('hidden')).toBe(false);
  });

  it('opens the menu on pad A or Start, once', () => {
    const pad = { pads: [{ buttons: [{ pressed: false }], axes: [] }] };
    const { menu, menuButton } = boot('', pad);
    pad.frame();
    expect(menu.classes.has('menu-screen--gated')).toBe(true);
    pad.pads = [{ buttons: [{ pressed: true }], axes: [] }];
    pad.frame();
    vi.advanceTimersByTime(1000);
    expect(menu.classes.has('menu-screen--gated')).toBe(false);
    expect(menuButton.focus).toHaveBeenCalledTimes(1);
  });

  it('ignores a pad button already held when the gate appears', () => {
    const held = Array(10).fill({ pressed: false });
    held[9] = { pressed: true };
    const pad = { pads: [{ buttons: held, axes: [] }] };
    const { menu } = boot('', pad);
    pad.frame();
    expect(menu.classes.has('menu-screen--gated')).toBe(true);
    pad.pads = [{ buttons: [{ pressed: false }], axes: [] }];
    pad.frame();
    pad.pads = [{ buttons: [{ pressed: true }], axes: [] }];
    pad.frame();
    vi.advanceTimersByTime(1000);
    expect(menu.classes.has('menu-screen--gated')).toBe(false);
  });

  it('asleep before any gesture: the first key wakes it, a later one starts', () => {
    const onStart = vi.fn();
    const { screen, press } = boot('', undefined, {
      awake: false,
      onStart,
      via: 'pad',
    });
    expect(screen.classes.has('loading-screen--asleep')).toBe(true);
    // The gate's own key wakes it (as the audio unlock hears it).
    press(enter());
    expect(screen.classes.has('loading-screen--asleep')).toBe(false);
    clock.now = 300;
    press(enter());
    expect(onStart).not.toHaveBeenCalled();
    clock.now = 600;
    press(enter());
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

  it('lets the music in only on the press that leaves the opening', () => {
    const onLeave = vi.fn();
    const { screen, progress, complete } = boot('', undefined, {
      onLeave,
      via: 'loading',
    });
    progress(0.5);
    complete();
    expect(onLeave).not.toHaveBeenCalled();
    screen.listeners.click();
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  // Into the menu through the gate and the pilots.
  function inMenu() {
    const game = boot('');
    game.press(enter());
    vi.advanceTimersByTime(1000);
    return game;
  }
  const escape = () => ({ key: 'Escape' });

  it('Escape on the menu brings the gate back, and its press goes through the pilots again', () => {
    const { screen, menu, button, press } = inMenu();
    openPilotSelect.mockClear();
    press(escape());
    expect(menu.classes.has('menu-screen--gated')).toBe(true);
    expect(screen.classes.has('hidden')).toBe(false);
    expect(screen.classes.has('loading-screen--starting')).toBe(false);
    expect(button.focus).toHaveBeenCalledTimes(2);
    press(enter());
    vi.advanceTimersByTime(1000);
    expect(openPilotSelect).toHaveBeenCalledTimes(1);
    expect(menu.classes.has('menu-screen--gated')).toBe(false);
  });

  it('Escape and pad B leave the menu alone while the remote link covers it', () => {
    const { gate, menu, press } = inMenu();
    menu.inert = true; // remoteLink.js, until the run starts
    press(escape());
    gate.leaveMenu();
    expect(menu.classes.has('menu-screen--gated')).toBe(false);
  });

  it('Escape with a panel open leaves the menu to the panel', () => {
    const { menu, page, press } = inMenu();
    page.overlays = [{ closest: () => null }];
    press(escape());
    expect(menu.classes.has('menu-screen--gated')).toBe(false);
  });

  it('Escape held to close a panel does not go on to the gate (key repeat)', () => {
    const { menu, page, press } = inMenu();
    page.overlays = [{ closest: () => null }];
    press({ key: 'Escape', repeat: false });
    page.overlays = []; // the panel's own Escape closed it
    press({ key: 'Escape', repeat: true });
    expect(menu.classes.has('menu-screen--gated')).toBe(false);
    press({ key: 'Escape', repeat: false });
    expect(menu.classes.has('menu-screen--gated')).toBe(true);
  });

  it("the game's name on the menu brings the gate back, by touch or click, unless a panel is open", () => {
    const { menu, menuButton, page } = inMenu();
    page.overlays = [{ closest: () => null }];
    menuButton.listeners.click();
    expect(menu.classes.has('menu-screen--gated')).toBe(false);
    page.overlays = [];
    menuButton.listeners.click();
    expect(menu.classes.has('menu-screen--gated')).toBe(true);
  });

  it('the menu left idle goes back to the gate; any input restarts the wait', () => {
    const { menu, winListeners } = inMenu();
    clock.now += MENU_IDLE_MS - 1000;
    winListeners.pointermove();
    clock.now += MENU_IDLE_MS - 1000;
    vi.advanceTimersByTime(1000);
    expect(menu.classes.has('menu-screen--gated')).toBe(false);
    clock.now += 1000;
    vi.advanceTimersByTime(1000);
    expect(menu.classes.has('menu-screen--gated')).toBe(true);
  });

  it('a pilot another tab deleted or wrote takes the menu back to the gate', () => {
    const { menu } = inMenu();
    vi.advanceTimersByTime(1000);
    expect(menu.classes.has('menu-screen--gated')).toBe(false);
    isPilotStale.mockReturnValue(true);
    vi.advanceTimersByTime(1000);
    isPilotStale.mockReturnValue(false);
    expect(menu.classes.has('menu-screen--gated')).toBe(true);
  });

  it('a pad press on the menu restarts the idle wait, even one quicker than the idle check', () => {
    const { gate, menu } = inMenu();
    clock.now += MENU_IDLE_MS - 500;
    gate.noteInput();
    clock.now += 1000;
    vi.advanceTimersByTime(1000);
    expect(menu.classes.has('menu-screen--gated')).toBe(false);
  });

  it.each(['?profile=x', '?scene=ring', '?content=a', '?replay=u'])(
    'shows the menu directly with %s',
    (search) => {
      const onLeave = vi.fn();
      const { screen, menu } = boot(search, undefined, {
        onLeave,
        via: 'none',
      });
      expect(onLeave).toHaveBeenCalledTimes(1);
      expect(menu.classes.has('hidden')).toBe(false);
      expect(screen.classes.has('hidden')).toBe(true);
      expect(inputLayers.top()).toBe(null);
    }
  );
});
