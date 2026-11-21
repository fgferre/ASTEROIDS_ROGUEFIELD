import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupGlobalMocks, cleanupGlobalState } from '../__helpers__/setup.js';
import {
  INSTALLED_TEXT,
  INSTALL_TEXT_IOS,
  INSTALL_TEXT_OFFER,
  INSTALL_TEXT_OTHER,
  PLAY_IN_BROWSER_TEXT,
  mobileGuard,
  touchScreen,
} from '../../src/bootstrap/mobileGuard.js';

// Vitest runs in `environment: 'node'`: window/navigator/document are stubbed
// per test to simulate a device. A phone or tablet (coarse pointer plus a
// touch signal) plays by touch, past the door notice: turn sideways, and on a
// phone in the browser, add the game to the Home Screen (or play anyway).

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';
const IPAD_AS_MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8)';

function fakeElement(tag) {
  const classes = new Set();
  const listeners = {};
  return {
    tag,
    children: [],
    textContent: '',
    setAttribute: vi.fn(),
    remove: vi.fn(),
    appendChild(child) {
      this.children.push(child);
    },
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
    click: () => listeners.click?.(),
    classList: {
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
      contains: (name) => classes.has(name),
    },
  };
}

function stubDevice({
  touch = true,
  width = 844,
  height = 390,
  screen = { width: 844, height: 390 },
  standalone = false,
  displayMode = 'browser',
  searchString = '',
  userAgent = IPHONE_UA,
}) {
  const listeners = {};
  const session = new Map();
  const windowStub = {
    location: { search: searchString },
    innerWidth: width,
    innerHeight: height,
    screen,
    sessionStorage: {
      getItem: (key) => session.get(key) ?? null,
      setItem: (key, value) => session.set(key, value),
    },
    matchMedia: vi.fn((query) => ({
      matches:
        query === '(pointer: coarse)'
          ? touch
          : query === `(display-mode: ${displayMode})`,
    })),
    addEventListener: vi.fn((type, fn) => {
      listeners[type] = fn;
    }),
    removeEventListener: vi.fn((type) => {
      delete listeners[type];
    }),
    ontouchstart: null,
  };
  vi.stubGlobal('window', windowStub);
  vi.stubGlobal('navigator', {
    maxTouchPoints: touch ? 5 : 0,
    standalone,
    userAgent,
  });

  const created = [];
  const container = { appendChild: vi.fn() };
  vi.stubGlobal('document', {
    getElementById: vi.fn((id) => (id === 'game-container' ? container : null)),
    createElement: vi.fn((tag) => {
      const el = fakeElement(tag);
      created.push(el);
      return el;
    }),
  });

  return {
    container,
    notice: () => container.appendChild.mock.calls[0]?.[0],
    texts: () => created.map((el) => el.textContent).filter(Boolean),
    button: () => created.find((el) => el.textContent === PLAY_IN_BROWSER_TEXT),
    created,
    fire: (type, event) => listeners[type]?.(event),
    turn(w, h) {
      windowStub.innerWidth = w;
      windowStub.innerHeight = h;
      listeners.resize?.();
    },
  };
}

// The guard's promise, with whether it has resolved yet.
function track() {
  const state = { result: null };
  state.pending = mobileGuard().then((value) => {
    state.result = value;
  });
  return state;
}

// A new module copy (the visit's play-in-browser choice starts unmade), its
// door left waiting.
async function freshGuard() {
  vi.resetModules();
  const guard = await import('../../src/bootstrap/mobileGuard.js');
  void guard.mobileGuard();
}

const TABLET = {
  screen: { width: 1180, height: 820 },
  width: 1180,
  height: 820,
  userAgent: ANDROID_UA,
};

describe('mobileGuard', () => {
  beforeEach(() => {
    setupGlobalMocks();
  });

  afterEach(() => {
    cleanupGlobalState();
    vi.unstubAllGlobals();
  });

  it('keeps the desktop path without a touch device, or with ?desktop=force', async () => {
    stubDevice({ touch: false });
    expect(await mobileGuard()).toEqual({ touch: false });

    stubDevice({ searchString: '?desktop=FORCE' });
    expect(await mobileGuard()).toEqual({ touch: false });
  });

  it('names the touch screen the HUD lays out for: phone, tablet, or none', () => {
    stubDevice({});
    expect(touchScreen()).toBe('phone');
    stubDevice({ screen: { width: 1180, height: 820 } });
    expect(touchScreen()).toBe('tablet');
    stubDevice({ touch: false });
    expect(touchScreen()).toBeNull();
    stubDevice({ searchString: '?desktop=force' });
    expect(touchScreen()).toBeNull();
  });

  it('upright: the turn notice holds the boot until the device is sideways', async () => {
    const device = stubDevice({ ...TABLET, width: 820, height: 1180 });
    const guard = track();
    await Promise.resolve();
    expect(device.notice().classList.contains('is-upright')).toBe(true);
    expect(device.texts()).toEqual(['Turn your device sideways to play']);

    device.turn(1180, 820);
    await guard.pending;
    expect(guard.result).toEqual({ touch: true });
    expect(device.notice().remove).toHaveBeenCalled();
  });

  it('phone in the browser: tells how to install, lets the player through on request', async () => {
    const device = stubDevice({});
    const guard = track();
    await Promise.resolve();
    expect(device.texts()).toContain(INSTALL_TEXT_IOS);
    expect(device.notice().classList.contains('is-upright')).toBe(false);
    expect(guard.result).toBeNull();

    device.button().click();
    await guard.pending;
    expect(guard.result).toEqual({ touch: true });

    // The choice holds for the session: no notice on the next load.
    device.container.appendChild.mockClear();
    expect(await mobileGuard()).toEqual({ touch: true });
    expect(device.container.appendChild).not.toHaveBeenCalled();
  });

  it('iPad in the browser (even calling itself a Mac): the two steps, drawn', async () => {
    const device = stubDevice({ ...TABLET, userAgent: IPAD_AS_MAC_UA });
    await freshGuard();
    await Promise.resolve();
    expect(device.texts()).toContain(INSTALL_TEXT_IOS);
    const steps = device.created.filter((el) => el.className === 'door-step');
    expect(steps.map((el) => el.innerHTML)).toEqual([
      expect.stringContaining('Tap Share'),
      expect.stringContaining('Add to Home Screen'),
    ]);
  });

  it("Android phone: the browser's Install button while it offers one", async () => {
    const device = stubDevice({ userAgent: ANDROID_UA });
    await freshGuard();
    await Promise.resolve();
    const text = device.created.find(
      (el) => el.className === 'door-notice__install'
    );
    const installButton = device.created.find(
      (el) => el.textContent === 'Install'
    );
    expect([text.textContent, installButton.hidden]).toEqual([
      INSTALL_TEXT_OTHER,
      true,
    ]);

    let accept;
    const offer = {
      preventDefault: vi.fn(),
      prompt: vi.fn(),
      userChoice: new Promise((resolve) => (accept = resolve)),
    };
    device.fire('beforeinstallprompt', offer);
    expect([text.textContent, installButton.hidden]).toEqual([
      INSTALL_TEXT_OFFER,
      false,
    ]);

    installButton.click();
    expect(offer.prompt).toHaveBeenCalled();
    accept({ outcome: 'accepted' });
    await new Promise((resolve) => setTimeout(resolve));
    expect(text.textContent).toBe(INSTALLED_TEXT);
  });

  it('phone installed (iOS flag or display mode), or an Android tablet: straight in when sideways', async () => {
    for (const device of [
      { standalone: true },
      { displayMode: 'fullscreen' },
      TABLET,
    ]) {
      const { container } = stubDevice(device);
      expect(await mobileGuard()).toEqual({ touch: true });
      expect(container.appendChild).not.toHaveBeenCalled();
    }
  });
});
