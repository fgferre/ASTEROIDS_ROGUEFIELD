import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import { createHeadlessGame } from '../__helpers__/headlessGame.js';
import { installDomStubs, keyEvent } from '../__helpers__/domStubs.js';

describe('InputSystem combat presses while paused', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    GamePools.releaseAll();
    restoreDom();
  });

  it.each([
    ['ShiftLeft', 'dash-pressed'],
    ['KeyE', 'activate-shield-pressed'],
  ])('does not fire %s pressed during pause once resumed', (code, event) => {
    const game = createHeadlessGame();
    const { eventBus, services, session } = game;
    session.startNewRun({ source: 'test' });
    game.step();
    const fired = vi.fn();
    eventBus.on(event, fired);

    session.togglePause();
    expect(services['game-state'].isPaused()).toBe(true);
    services.input.onKeyDown(keyEvent(code));
    services.input.onKeyUp(keyEvent(code));
    session.togglePause();
    game.step();

    expect(fired).not.toHaveBeenCalled();
  });
});
