import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  POINTER_SNAP,
  POINTER_SPEED,
  PadPointer,
} from '../../../src/modules/ui/padPointer.js';

// A stand-in element: it records the events it hears.
function element(tagName, rect = { left: 0, top: 0, width: 100, height: 40 }) {
  const el = {
    tagName,
    type: tagName === 'INPUT' ? 'range' : undefined,
    events: [],
    value: '0',
    min: '0',
    max: '100',
    dispatchEvent: (event) => el.events.push(event.type),
    focus: vi.fn(),
    contains: (other) => other === el,
    closest: () => (tagName === 'DIV' ? null : el),
    getBoundingClientRect: () => rect,
  };
  return el;
}

describe('the pad pointer', () => {
  let listeners;
  let under; // what document.elementFromPoint finds
  let menu; // a menu screen is up
  let ui;
  const pad = (x = 0, y = 0, a = false) => ({
    axes: [x, y, 0, 0],
    buttons: [{ pressed: a }],
  });

  beforeEach(() => {
    listeners = {};
    under = element('DIV');
    menu = true;
    class FakeEvent {
      constructor(type, init = {}) {
        Object.assign(this, init, { type });
      }
    }
    vi.stubGlobal('Event', FakeEvent);
    vi.stubGlobal('MouseEvent', FakeEvent);
    vi.stubGlobal('PointerEvent', FakeEvent);
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('window', {
      innerWidth: 1000,
      innerHeight: 800,
      addEventListener: (type, fn) => (listeners[type] = fn),
    });
    vi.stubGlobal('document', {
      body: { appendChild() {}, dataset: {} },
      createElement: () => ({ style: {}, hidden: true }),
      getElementById: () => null,
      querySelector: () => null,
      activeElement: null,
      elementFromPoint: () => under,
    });
    ui = {
      padNav: { screen: () => (menu ? { id: 'menu' } : null), handle: vi.fn() },
      hudEditor: { isOpen: false },
    };
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows on the left stick and crosses the screen height in 0.9 s; slower over a control', () => {
    const pointer = new PadPointer(ui);
    pointer.step(pad(1, 0), 0.1);
    expect(pointer.shown).toBe(true);
    expect(document.body.dataset.padPointer).toBe('shown');
    expect(pointer.x).toBeCloseTo(500 + POINTER_SPEED * 800 * 0.1);
    expect(1 / POINTER_SPEED).toBeCloseTo(0.9, 1);
    under = element('BUTTON');
    pointer.step(pad(1, 0), 0.001); // it reaches the button
    const x = pointer.x;
    pointer.step(pad(1, 0), 0.1);
    expect(pointer.x - x).toBeCloseTo(POINTER_SPEED * 800 * 0.1 * POINTER_SNAP);
    // A light lean moves it far less than a full one (tilt squared).
    const before = pointer.y;
    pointer.step(pad(0, 0.4), 0.1);
    expect(pointer.y - before).toBeLessThan(POINTER_SPEED * 800 * 0.1 * 0.1);
  });

  it('A clicks what it went down on when it comes up, and nothing if it slid off', () => {
    const pointer = new PadPointer(ui);
    const button = (under = element('BUTTON'));
    pointer.step(pad(0.5, 0), 0.01);
    pointer.step(pad(0, 0, true), 0.01);
    pointer.step(pad(0, 0, false), 0.01);
    expect(button.events.filter((t) => t === 'click')).toHaveLength(1);
    expect(button.events).toContain('pointerdown');
    expect(button.events).toContain('mousedown');

    pointer.step(pad(0, 0, true), 0.01);
    under = element('DIV');
    pointer.step(pad(0.5, 0, true), 0.01);
    pointer.step(pad(0, 0, false), 0.01);
    expect(button.events.filter((t) => t === 'click')).toHaveLength(1);
  });

  it('A held on a slider moves its value with the pointer', () => {
    const pointer = new PadPointer(ui);
    const slider = (under = element('INPUT', {
      left: 0,
      top: 0,
      width: 1000,
      height: 20,
    }));
    pointer.step(pad(0.3, 0), 0.01);
    pointer.step(pad(0, 0, true), 0.01);
    const first = Number(slider.value);
    expect(first).toBeCloseTo(pointer.x / 10, 0);
    pointer.step(pad(1, 0, true), 0.1);
    expect(Number(slider.value)).toBeGreaterThan(first);
    pointer.step(pad(0, 0, false), 0.01);
    expect(slider.events).toContain('change');
  });

  it('the mouse, a key or a touch hides it, and so does the flight', () => {
    const pointer = new PadPointer(ui);
    for (const type of ['mousemove', 'keydown', 'touchstart']) {
      pointer.step(pad(1, 0), 0.01);
      listeners[type]({ isTrusted: false });
      expect(pointer.shown).toBe(true);
      listeners[type]({ isTrusted: true });
      expect(pointer.shown).toBe(false);
      expect(document.body.dataset.padPointer).toBeUndefined();
    }
    pointer.step(pad(1, 0), 0.01);
    menu = false;
    pointer.step(pad(1, 0), 0.01);
    expect(pointer.shown).toBe(false);
  });

  it("follows the pad the game reads, not the first in the browser's list", () => {
    // A PC can list an idle device first (the owner's Xbox pad, 23/11).
    const idle = pad();
    const played = pad(1, 0);
    vi.stubGlobal('navigator', { getGamepads: () => [idle, played] });
    vi.stubGlobal('performance', { now: () => 0 });
    ui.getService = (name) => (name === 'input' ? { gamepad: played } : null);
    const pointer = new PadPointer(ui);
    pointer.tick();
    expect(pointer.shown).toBe(true);
  });

  it('stays hidden without a pad, or while A alone is pressed', () => {
    const pointer = new PadPointer(ui);
    pointer.step(undefined, 0.01);
    pointer.step(pad(0, 0, true), 0.01);
    expect(pointer.shown).toBe(false);
    expect(under.events).toEqual([]);
  });
});
