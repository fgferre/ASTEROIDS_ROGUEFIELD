import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';
import InputSystem from '../../src/modules/InputSystem.js';
import { PAD_BUTTON } from '../../src/data/constants/gamepad.js';
import { installDomStubs, keyEvent } from '../__helpers__/headlessGame.js';
import { installFakeGamepad } from '../__helpers__/fakeGamepad.js';

describe('InputSystem gamepad', () => {
  let restoreDom;
  let fake;
  let eventBus;
  let gameState;
  let settingValues;
  let input;

  beforeEach(() => {
    restoreDom = installDomStubs();
    fake = installFakeGamepad();
    eventBus = new EventBus();
    gameState = { screen: 'playing', paused: false };
    settingValues = { controls: {}, accessibility: {} };
    input = new InputSystem({
      eventBus,
      'game-state': {
        getScreen: () => gameState.screen,
        isPaused: () => gameState.paused,
      },
      settings: {
        getCategoryValues: () => null,
        getSetting: (category, key) => settingValues[category][key],
      },
    });
  });

  afterEach(() => {
    fake.restore();
    restoreDom();
  });

  // One fixed step; returns the frame the simulation consumed.
  const step = (state) => {
    if (state) fake.set(state);
    let frame = null;
    input.setInputSource((live) => {
      frame = live;
    });
    input.update(1 / 60);
    return frame;
  };

  it('drops stick values inside the radial deadzone', () => {
    const frame = step({ axes: [0.12, -0.12, 0.1, 0.15] });
    expect([frame.moveX, frame.moveY, frame.aimX, frame.aimY]).toEqual([
      0, 0, 0, 0,
    ]);
    expect(frame.right || frame.up).toBe(false);
  });

  it('rescales and quantizes the sticks past the deadzone', () => {
    // (0.41 - 0.2) / 0.8 = 0.2625, quantized to 1/100.
    let frame = step({ axes: [0.41, 0, 0, 0] });
    expect(frame.moveX).toBe(0.26);
    expect(frame.right).toBe(false);

    frame = step({ axes: [1, 0, 0, -1] });
    expect(frame.moveX).toBe(1);
    expect(frame.right).toBe(true);
    expect([frame.aimX, frame.aimY]).toEqual([0, -1]);

    // The movement command carries the stick for PlayerSystem.
    expect(input.lastMovementCommand.analog).toEqual({
      moveX: 1,
      moveY: 0,
      aimX: 0,
      aimY: -1,
    });
  });

  it('maps RT to dash, LT to shield and X/Y to the toggles, once per press', () => {
    let frame = step({ pressed: [PAD_BUTTON.RT, PAD_BUTTON.LT] });
    expect(frame.dash && frame.shield).toBe(true);
    frame = step({ pressed: [PAD_BUTTON.RT, PAD_BUTTON.LT] });
    expect(frame.dash || frame.shield).toBe(false);

    frame = step({ pressed: [PAD_BUTTON.X, PAD_BUTTON.Y] });
    expect(frame.spread && frame.aim).toBe(true);
  });

  it('ignores pad presses on the pause screen', () => {
    gameState.paused = true;
    input.pollGamepad();
    fake.set({ pressed: [PAD_BUTTON.RT] });
    input.pollGamepad();
    gameState.paused = false;
    expect(step({ pressed: [PAD_BUTTON.RT] }).dash).toBe(false);
  });

  it('follows the last device used and says so on change', () => {
    const devices = [];
    eventBus.on('input-device-changed', ({ device }) => devices.push(device));
    expect(input.getActiveDevice()).toBe('keyboard');

    step({ pressed: [PAD_BUTTON.A] });
    expect(input.getActiveDevice()).toBe('gamepad');
    input.onKeyDown(keyEvent('KeyW'));
    expect(input.getActiveDevice()).toBe('keyboard');
    step({ axes: [0, 0.9, 0, 0] });
    expect(devices).toEqual(['gamepad', 'keyboard', 'gamepad']);
  });

  it('navigates menus with the d-pad, stick and face buttons, not during play', () => {
    const nav = [];
    eventBus.on('gamepad-ui-nav', ({ action }) => nav.push(action));

    input.pollGamepad();
    fake.set({ pressed: [PAD_BUTTON.DOWN] });
    input.pollGamepad();
    expect(nav).toEqual([]);

    gameState.screen = 'menu';
    fake.set();
    input.pollGamepad();
    fake.set({ pressed: [PAD_BUTTON.DOWN] });
    input.pollGamepad();
    input.pollGamepad();
    fake.set({ pressed: [PAD_BUTTON.B, PAD_BUTTON.RB] });
    input.pollGamepad();
    // The stick moves once per push, then again after it comes back.
    fake.set({ axes: [0, -0.9, 0, 0] });
    input.pollGamepad();
    input.pollGamepad();
    fake.set();
    input.pollGamepad();
    fake.set({ axes: [0.8, 0.1, 0, 0] });
    input.pollGamepad();
    expect(nav).toEqual(['down', 'back', 'tabNext', 'up', 'right']);
  });

  it('rumbles on hull damage, Warden arrival and dash, unless turned off', () => {
    step();
    eventBus.emit('player-took-damage', { damage: 0 });
    eventBus.emit('player-took-damage', { damage: 10 });
    eventBus.emit('boss-spawned', {});
    eventBus.emit('player-dashed', {});
    expect(fake.effects).toEqual([
      {
        type: 'dual-rumble',
        startDelay: 0,
        duration: 120,
        weakMagnitude: 0.6,
        strongMagnitude: 0,
      },
      {
        type: 'dual-rumble',
        startDelay: 0,
        duration: 400,
        weakMagnitude: 0,
        strongMagnitude: 0.8,
      },
      {
        type: 'dual-rumble',
        startDelay: 0,
        duration: 60,
        weakMagnitude: 0.3,
        strongMagnitude: 0,
      },
    ]);

    fake.effects.length = 0;
    settingValues.accessibility.reducedMotion = true;
    eventBus.emit('player-dashed', {});
    settingValues.accessibility.reducedMotion = false;
    settingValues.controls.vibration = false;
    eventBus.emit('player-dashed', {});
    expect(fake.effects).toEqual([]);
  });

  it("keeps the pad quiet through a replayed run, not the viewer's own", () => {
    step();
    eventBus.emit('game-started', { replay: true });
    eventBus.emit('player-took-damage', { damage: 10 });
    eventBus.emit('boss-spawned', {});
    eventBus.emit('player-dashed', {});
    expect(fake.effects).toEqual([]);

    eventBus.emit('game-started', {});
    eventBus.emit('player-dashed', {});
    expect(fake.effects).toHaveLength(1);
  });
});
