import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';
import InputSystem from '../../src/modules/InputSystem.js';
import { installDomStubs, keyEvent } from '../__helpers__/headlessGame.js';

describe('InputSystem focus loss', () => {
  let restoreDom;
  let eventBus;
  let listeners;
  let input;

  beforeEach(() => {
    restoreDom = installDomStubs();
    listeners = {};
    const record = (type, handler) => {
      listeners[type] = handler;
    };
    window.addEventListener = record;
    document.addEventListener = record;
    eventBus = new EventBus();
    input = new InputSystem({
      eventBus,
      settings: {
        getCategoryValues: () => null,
        getSetting: () => undefined,
      },
    });
  });

  afterEach(() => restoreDom());

  const holdKeyAndMouse = () => {
    input.onKeyDown(keyEvent('KeyW'));
    input.onMouseDown({ button: 0 });
    expect(input.isActionActive('moveUp')).toBe(true);
    expect(input.isMouseButtonDown(0)).toBe(true);
  };

  it('releases every held key and mouse button when the window loses focus', () => {
    const released = [];
    const lost = [];
    eventBus.on('input-action', ({ action, phase }) => {
      if (phase === 'released') released.push(action);
    });
    eventBus.on('input-focus-lost', () => lost.push(true));
    holdKeyAndMouse();

    listeners.blur();

    expect(input.isActionActive('moveUp')).toBe(false);
    expect(input.isKeyDown('keyw')).toBe(false);
    expect(input.isMouseButtonDown(0)).toBe(false);
    expect(released).toContain('moveUp');
    expect(lost).toHaveLength(1);
  });

  it('does the same when the page is hidden, and nothing while it is visible', () => {
    holdKeyAndMouse();

    document.hidden = false;
    listeners.visibilitychange();
    expect(input.isActionActive('moveUp')).toBe(true);

    document.hidden = true;
    listeners.visibilitychange();
    expect(input.isActionActive('moveUp')).toBe(false);
  });
});

describe('InputSystem fullscreen key', () => {
  let restoreDom;
  let eventBus;
  let input;
  let toggled;

  beforeEach(() => {
    restoreDom = installDomStubs();
    eventBus = new EventBus();
    toggled = vi.fn();
    eventBus.on('toggle-fullscreen', toggled);
    input = new InputSystem({
      eventBus,
      settings: {
        getCategoryValues: () => null,
        getSetting: () => undefined,
      },
    });
  });

  afterEach(() => restoreDom());

  it('F asks for the toggle once per press, not on key repeat', () => {
    input.onKeyDown(keyEvent('KeyF'));
    input.onKeyDown(keyEvent('KeyF'));
    expect(toggled).toHaveBeenCalledTimes(1);

    input.onKeyUp(keyEvent('KeyF'));
    input.onKeyDown(keyEvent('KeyF'));
    expect(toggled).toHaveBeenCalledTimes(2);
  });

  it('F does nothing while a binding is being captured', () => {
    eventBus.emit('input-binding-capture', { state: 'start' });
    input.onKeyDown(keyEvent('KeyF'));
    expect(toggled).not.toHaveBeenCalled();
  });
});
