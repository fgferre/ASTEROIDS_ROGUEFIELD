import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';
import InputSystem from '../../src/modules/InputSystem.js';
import PlayerSystem from '../../src/modules/PlayerSystem.js';
import { installDomStubs, keyEvent } from '../__helpers__/domStubs.js';
import { installFakeGamepad } from '../__helpers__/fakeGamepad.js';

// The ship flies by the input's frame of each step, taken once (the command
// queue that stood between them is gone, 25/11): every field of the frame
// reaches it, and a step with no new frame keeps the last movement, as the
// scripted drivers that step the ship alone expect.
describe('PlayerSystem flies by the step frame', () => {
  let restoreDom;
  let fake;
  let input;
  let player;

  beforeEach(() => {
    restoreDom = installDomStubs();
    fake = installFakeGamepad();
    const eventBus = new EventBus();
    input = new InputSystem({
      eventBus,
      settings: { getCategoryValues: () => null, getSetting: () => undefined },
      'game-state': { getScreen: () => 'playing', isPaused: () => false },
    });
    player = new PlayerSystem({ eventBus, input });
  });

  afterEach(() => {
    fake.restore();
    restoreDom();
  });

  const step = () => {
    input.update(1 / 60);
    player.update(1 / 60);
  };

  it('gets the strafe hold and the sticks, not only the four move keys', () => {
    input.onKeyDown(keyEvent('Space'));
    input.onKeyDown(keyEvent('KeyD'));
    step();
    expect(player.cachedMovementInput).toMatchObject({
      right: true,
      strafeHold: true,
    });

    input.onKeyUp(keyEvent('Space'));
    input.onKeyUp(keyEvent('KeyD'));
    fake.set({ axes: [1, 0, 0, -1] });
    step();
    expect(player.cachedMovementInput).toEqual({
      up: false,
      down: false,
      left: false,
      right: false,
      strafeLeft: false,
      strafeRight: false,
      strafeHold: false,
      moveX: 1,
      moveY: 0,
      aimX: 0,
      aimY: -1,
      pad: true,
    });
  });

  it('keeps the last movement on a step with no new frame', () => {
    input.onKeyDown(keyEvent('KeyW'));
    step();
    // A driver steering the ship between steps (profileHarness.js).
    player.cachedMovementInput.right = true;
    player.update(1 / 60);
    expect(player.cachedMovementInput).toMatchObject({ up: true, right: true });

    step();
    expect(player.cachedMovementInput).toMatchObject({
      up: true,
      right: false,
    });
  });
});
