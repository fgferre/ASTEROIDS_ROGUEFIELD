import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';
import InputSystem from '../../src/modules/InputSystem.js';
import { splitStrafe } from '../../src/modules/player/movementInput.js';
import { installDomStubs, keyEvent } from '../__helpers__/domStubs.js';

// Space holds the strafe in flight and confirms in the menus.
describe('InputSystem Space', () => {
  let restoreDom;
  let input;
  let screen;
  let confirmed;

  const space = (repeat = false) => ({
    key: ' ',
    code: 'Space',
    repeat,
    preventDefault: vi.fn(),
    stopPropagation() {},
  });
  const blocked = (event) => event.preventDefault.mock.calls.length > 0;

  beforeEach(() => {
    restoreDom = installDomStubs();
    screen = 'playing';
    const eventBus = new EventBus();
    confirmed = vi.fn();
    eventBus.on('input-confirmed', confirmed);
    input = new InputSystem({
      eventBus,
      settings: {
        getCategoryValues: () => null,
        getSetting: () => undefined,
      },
      'game-state': { getScreen: () => screen, isPaused: () => false },
    });
  });

  afterEach(() => restoreDom());

  it('held with A or D, strafes instead of turning in both flights', () => {
    input.onKeyDown(space());
    input.onKeyDown(keyEvent('KeyA'));
    const frame = input.sampleInputFrame();
    expect(frame.strafeHold).toBe(true);
    expect(splitStrafe(frame, false).strafe).toBe(-1);
    expect(splitStrafe(frame, true).strafe).toBe(-1);

    input.onKeyUp(space());
    expect(input.sampleInputFrame().strafeHold).toBe(false);
  });

  it('pressed in flight confirms nothing, and its repeats and release press no button of a screen opened under it', () => {
    const down = space();
    input.onKeyDown(down);
    expect(confirmed).not.toHaveBeenCalled();
    expect(blocked(down)).toBe(true);

    screen = 'levelup';
    const repeat = space(true);
    input.onKeyDown(repeat);
    const up = space();
    input.onKeyUp(up);
    expect(blocked(repeat)).toBe(true);
    expect(blocked(up)).toBe(true);
    expect(confirmed).not.toHaveBeenCalled();

    const again = space();
    input.onKeyDown(again);
    const release = space();
    input.onKeyUp(release);
    expect(blocked(again)).toBe(false);
    expect(blocked(release)).toBe(false);
    expect(confirmed).toHaveBeenCalledTimes(1);
  });

  it('pressed off the run, presses the focused button but its repeats arm none (one focused late)', () => {
    screen = 'gameover';
    const down = space();
    input.onKeyDown(down);
    const repeat = space(true);
    input.onKeyDown(repeat);
    expect(blocked(down)).toBe(false);
    expect(blocked(repeat)).toBe(true);
  });

  it('a repeat after a focus loss dropped the keys confirms nothing', () => {
    screen = 'levelup';
    input.onKeyDown(space());
    input.onFocusLost();
    input.onKeyDown(space(true));
    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(input.isActionActive('strafeHold')).toBe(true);
  });
});
