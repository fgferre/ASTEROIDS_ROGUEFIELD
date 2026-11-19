import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PLAY_IN_BROWSER_TEXT,
  mobileGuard,
} from '../../src/bootstrap/mobileGuard.js';

describe('mobileGuard with blocked sessionStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('still offers "Play in the browser anyway" and lets the player in', async () => {
    let skip;
    const notice = {
      className: '',
      classList: { toggle() {} },
      setAttribute() {},
      appendChild(el) {
        if (el.type === 'button') skip = el;
      },
      remove() {},
    };
    const make = (tag) =>
      tag === 'div'
        ? notice
        : {
            style: {},
            listeners: {},
            addEventListener(t, f) {
              this.listeners[t] = f;
            },
          };
    vi.stubGlobal('document', {
      createElement: make,
      getElementById: () => ({ appendChild() {} }),
    });
    const window = {
      innerWidth: 300,
      innerHeight: 600,
      screen: { width: 300, height: 600 },
      location: { search: '' },
      matchMedia: (q) => ({ matches: q.includes('coarse') }),
      addEventListener() {},
      removeEventListener() {},
      ontouchstart: null,
    };
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    vi.stubGlobal('window', window);
    vi.stubGlobal('navigator', { maxTouchPoints: 5, userAgent: 'iPhone' });

    const guard = mobileGuard();
    await Promise.resolve();
    await Promise.resolve();
    expect(skip?.textContent).toBe(PLAY_IN_BROWSER_TEXT);
    window.innerWidth = 700; // the player turns the phone sideways
    skip.listeners.click();
    await expect(guard).resolves.toEqual({ touch: true });
  });
});
