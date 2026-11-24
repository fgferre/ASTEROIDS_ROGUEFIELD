import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAD_BUTTON } from '../../../src/data/constants/gamepad.js';
import {
  HOLD_MS,
  listenForHold,
  padFamily,
  setSkipPad,
} from '../../../src/modules/ui/skipHold.js';

// Just enough page for the hint; window capture listeners run in the order
// they were added, as in the browser.
function node() {
  const classes = new Set();
  return {
    dataset: {},
    innerHTML: '',
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
    },
    setAttribute() {},
    querySelector: () => node(),
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 64, height: 30 }),
    append() {},
  };
}

describe('holding the skip key', () => {
  let listeners;
  let hint;
  let unbind;
  const pad = {
    id: 'Xbox Wireless Controller',
    buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
  };
  const fire = (type, code = 'Space', repeat = false) => {
    const event = {
      type,
      code,
      repeat,
      preventDefault() {},
      stopImmediatePropagation: vi.fn(),
    };
    (listeners.get(type) ?? []).forEach((fn) => fn(event));
    return event.stopImmediatePropagation.mock.calls.length > 0;
  };
  const bind = (onSkip = vi.fn(), onNext = vi.fn()) => {
    unbind = listenForHold(onSkip, onNext);
    return { onSkip, onNext };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    listeners = new Map();
    hint = null;
    vi.stubGlobal('performance', { now: () => Date.now() });
    vi.stubGlobal('document', {
      body: node(),
      createElement: () => (hint = node()),
    });
    vi.stubGlobal('window', {
      addEventListener: (type, fn) =>
        listeners.set(type, [...(listeners.get(type) ?? []), fn]),
      removeEventListener: (type, fn) =>
        listeners.set(
          type,
          (listeners.get(type) ?? []).filter((other) => other !== fn)
        ),
      requestAnimationFrame: (fn) => setTimeout(fn, 16),
      cancelAnimationFrame: (id) => clearTimeout(id),
    });
    pad.buttons[PAD_BUTTON.START].pressed = false;
    setSkipPad(() => pad);
  });
  afterEach(() => {
    unbind?.();
    vi.advanceTimersByTime(1);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('any other key only shows the hint; Space held 1.5 s skips once, until let go', () => {
    const { onSkip, onNext } = bind();
    fire('keydown', 'KeyW');
    fire('keyup', 'KeyW');
    expect(hint.classList.contains('is-showing')).toBe(true);

    fire('keydown');
    vi.advanceTimersByTime(HOLD_MS - 100);
    expect(onSkip).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onSkip).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(HOLD_MS * 2);
    fire('keyup');
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('let go early, nothing skips and the next hold counts from zero', () => {
    const { onSkip, onNext } = bind();
    fire('keydown');
    vi.advanceTimersByTime(1000);
    fire('keyup');
    fire('keydown');
    vi.advanceTimersByTime(1000);
    expect(onSkip).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('a hold no frame came to fill still skips when let go after 1.5 s', () => {
    window.requestAnimationFrame = () => 0;
    const { onSkip, onNext } = bind();
    fire('keydown');
    vi.advanceTimersByTime(HOLD_MS + 10);
    fire('keyup');
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('a quick tap of Space goes to the next line; one of another key does not', () => {
    const { onSkip, onNext } = bind();
    fire('keydown', 'Enter');
    fire('keyup', 'Enter');
    fire('keydown');
    vi.advanceTimersByTime(100);
    fire('keyup');
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('a Space already held as the scene starts (the strafe) skips nothing until pressed again', () => {
    const { onSkip, onNext } = bind();
    fire('keydown', 'Space', true);
    vi.advanceTimersByTime(HOLD_MS + 50);
    fire('keydown', 'Space', true);
    fire('keyup');
    expect(onSkip).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();

    fire('keydown');
    vi.advanceTimersByTime(100);
    fire('keyup');
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("reads Start on the game's pad, held or tapped, and names the pad's own button", () => {
    const { onSkip, onNext } = bind();
    const start = pad.buttons[PAD_BUTTON.START];
    start.pressed = true;
    vi.advanceTimersByTime(HOLD_MS + 50);
    expect(onSkip).toHaveBeenCalledTimes(1);
    start.pressed = false;
    vi.advanceTimersByTime(50);
    start.pressed = true;
    vi.advanceTimersByTime(100);
    start.pressed = false;
    vi.advanceTimersByTime(50);
    expect(onNext).toHaveBeenCalledTimes(1);

    expect(padFamily(pad)).toBe('xbox');
    expect(padFamily({ id: 'DualSense Wireless Controller' })).toBe(
      'playstation'
    );
    expect(
      padFamily({
        id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
      })
    ).toBe('playstation');
  });

  it("swallows a held key's repeats after the unbind until it is released", () => {
    bind(() => unbind());
    fire('keydown');
    vi.advanceTimersByTime(HOLD_MS + 50);
    expect(fire('keydown', 'Space', true)).toBe(true);
    fire('keyup');
    expect(listeners.get('keydown')).toEqual([]);
  });
});
