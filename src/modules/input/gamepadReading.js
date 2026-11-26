// src/modules/input/gamepadReading.js
//
// The pad, read for InputSystem (`input`): each poll turns its buttons and
// axes into held actions, the sticks past their deadzone, the menus' nav and
// scroll; the menus' own polling loop, and the rumble. The state stays on the
// input system, under the same names.

import {
  GAMEPAD_NAV_BUTTONS,
  GAMEPAD_STICK_DEADZONE,
} from '../../data/constants/gamepad.js';
import { CONTROLS_CATEGORY_ID } from './keyBindings.js';

export const DEFAULT_GAMEPAD_AXIS_THRESHOLD = 0.45;

export const CENTRED_STICKS = Object.freeze({
  moveX: 0,
  moveY: 0,
  aimX: 0,
  aimY: 0,
  pad: false,
});

/** Radial deadzone; past it the magnitude is rescaled to 0..1. */
export function applyStickDeadzone(x = 0, y = 0) {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= GAMEPAD_STICK_DEADZONE) {
    return { x: 0, y: 0 };
  }
  const scaled =
    Math.min(
      1,
      (magnitude - GAMEPAD_STICK_DEADZONE) / (1 - GAMEPAD_STICK_DEADZONE)
    ) / magnitude;
  return { x: x * scaled, y: y * scaled };
}

// The pad's pointer (ui/padPointer.js) marks the page while it shows: its
// A clicks and its right stick scrolls under it.
const padPointerShown = () =>
  globalThis.document?.body?.dataset.padPointer === 'shown';

/**
 * Off the fixed steps (menus, pause, level-up) nothing else polls the pad,
 * so a frame loop does; during play `update()` polls once per step.
 */
export function startMenuPadPolling(input) {
  if (typeof window.requestAnimationFrame !== 'function') {
    return;
  }
  const tick = () => {
    if (!input.isGameRunning()) {
      pollGamepad(input);
    }
    input.menuPollFrame = window.requestAnimationFrame(tick);
  };
  input.menuPollFrame = window.requestAnimationFrame(tick);
}

/**
 * One dual-rumble effect on the active pad, unless the player turned it off
 * or a replay is playing.
 */
export function rumble(input, effect) {
  const actuator = input.gamepad?.vibrationActuator;
  if (input.replaying || !actuator || !isVibrationEnabled(input)) {
    return;
  }
  actuator
    .playEffect('dual-rumble', { startDelay: 0, ...effect })
    .catch(() => {});
}

function isVibrationEnabled(input) {
  const settings = input.settings;
  if (!settings?.getSetting) {
    return true;
  }
  return (
    settings.getSetting(CONTROLS_CATEGORY_ID, 'vibration') !== false &&
    !settings.getSetting('accessibility', 'reducedMotion')
  );
}

function emitGamepadDetection(input, details) {
  const eventBus = input.getEventBus();
  if (!eventBus?.emit) {
    return;
  }

  eventBus.emit('gamepad-input-detected', {
    ...details,
    timestamp:
      typeof performance !== 'undefined' ? performance.now() : Date.now(),
  });
}

export function pollGamepad(input) {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.getGamepads !== 'function'
  ) {
    return;
  }

  const pads = navigator.getGamepads();
  const pad =
    pads?.[input.gamepadIndex] ||
    pads?.find((candidate) => Boolean(candidate)) ||
    null;

  if (!pad) {
    if (input.gamepadConnected || input.activeGamepadActions.size > 0) {
      clearGamepadActions(input);
    }
    input.gamepadConnected = false;
    input.gamepad = null;
    input.padSticks = CENTRED_STICKS;
    return;
  }

  input.gamepad = pad;
  input.gamepadConnected = true;
  input.gamepadIndex = pad.index;

  const activeActions = new Set();

  pad.buttons.forEach((button, index) => {
    const pressed = Boolean(button?.pressed);
    if (pressed) {
      const key = `button:${index}`;
      const mapped = input.gamepadButtonMap.get(key);
      if (mapped) {
        mapped.forEach((action) => activeActions.add(action));
      }
    }

    if (pressed && !input.previousGamepadButtons[index]) {
      input.setActiveDevice('gamepad');
      emitGamepadDetection(input, {
        type: 'button',
        index,
        value: button?.value ?? 1,
      });
      emitPadNav(input, GAMEPAD_NAV_BUTTONS[index]);
    }

    input.previousGamepadButtons[index] = pressed;
  });

  pad.axes.forEach((value, index) => {
    const positive = value >= input.gamepadAxisThreshold;
    const negative = value <= -input.gamepadAxisThreshold;
    const previous = input.previousGamepadAxes[index] || {
      positive: false,
      negative: false,
    };

    if (positive) {
      const key = `axis:${index}:positive`;
      const mapped = input.gamepadAxisMap.get(key);
      if (mapped) {
        mapped.forEach((action) => activeActions.add(action));
      }
      if (!previous.positive) {
        emitGamepadDetection(input, {
          type: 'axis',
          index,
          direction: 'positive',
          value,
        });
      }
    }

    if (negative) {
      const key = `axis:${index}:negative`;
      const mapped = input.gamepadAxisMap.get(key);
      if (mapped) {
        mapped.forEach((action) => activeActions.add(action));
      }
      if (!previous.negative) {
        emitGamepadDetection(input, {
          type: 'axis',
          index,
          direction: 'negative',
          value,
        });
      }
    }

    input.previousGamepadAxes[index] = { positive, negative };
  });

  readPadSticks(input, pad.axes);
  syncGamepadActions(input, activeActions);
}

function readPadSticks(input, axes) {
  const move = applyStickDeadzone(axes[0], axes[1]);
  const aim = applyStickDeadzone(axes[2], axes[3]);
  const pad = Boolean(move.x || move.y || aim.x || aim.y);
  input.padSticks = {
    moveX: move.x,
    moveY: move.y,
    aimX: aim.x,
    aimY: aim.y,
    pad,
  };
  if (pad) input.setActiveDevice('gamepad');

  // Off play the left stick moves the pad's pointer (ui/padPointer.js) and
  // the right stick scrolls the menu's lists (gamepadNav.js).
  if (aim.y && !input.isGameRunning() && !padPointerShown()) {
    input.getEventBus()?.emit?.('gamepad-ui-scroll', { y: aim.y });
  }
}

/** Menu/overlay navigation (UISystem); nothing to navigate during play. */
function emitPadNav(input, action) {
  if (!action || input.isGameRunning()) {
    return;
  }
  // A clicks under the pad's pointer while it shows (ui/padPointer.js).
  if (action === 'confirm' && padPointerShown()) return;
  input.getEventBus()?.emit?.('gamepad-ui-nav', { action });
}

function syncGamepadActions(input, activeActions) {
  const previous = new Set(input.activeGamepadActions);

  activeActions.forEach((action) => {
    if (!input.activeGamepadActions.has(action)) {
      input.handleActionPress(action, 'gamepad', { device: 'gamepad' });
    }
  });

  previous.forEach((action) => {
    if (!activeActions.has(action)) {
      input.handleActionRelease(action, 'gamepad', { device: 'gamepad' });
    }
  });
}

export function clearGamepadActions(input) {
  const active = Array.from(input.activeGamepadActions);
  active.forEach((action) => {
    input.handleActionRelease(action, 'gamepad', {
      device: 'gamepad',
      forced: true,
    });
  });
  input.activeGamepadActions.clear();
  input.previousGamepadButtons = [];
  input.previousGamepadAxes = [];
  input.padSticks = CENTRED_STICKS;
}
