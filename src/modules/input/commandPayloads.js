// src/modules/input/commandPayloads.js
// The commands InputSystem puts on the command queue: the per-step move
// command and the shield/fire action commands.

export const MOVEMENT_ACTIONS = new Set([
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
]);
const MOVEMENT_ACTION_LIST = Array.from(MOVEMENT_ACTIONS);

function sanitizeCommandContext(context = {}) {
  if (!context || typeof context !== 'object') {
    return {};
  }

  const { event: _event, ...rest } = context;
  return { ...rest };
}

function getCurrentTimestamp() {
  if (
    typeof performance !== 'undefined' &&
    typeof performance.now === 'function'
  ) {
    return performance.now();
  }

  return Date.now();
}

function collectMovementBindingDetails({
  activeKeyboardActions,
  activeGamepadActions,
  keyboardActionInputs,
}) {
  let hasKeyboard = false;
  let hasGamepad = false;
  const keyboardInputs = new Set();

  for (const action of MOVEMENT_ACTION_LIST) {
    if (activeKeyboardActions.has(action)) {
      hasKeyboard = true;
    }
    if (activeGamepadActions.has(action)) {
      hasGamepad = true;
    }

    const inputs = keyboardActionInputs.get(action);
    if (inputs) {
      inputs.forEach((inputId) => keyboardInputs.add(inputId));
    }
  }

  const source =
    hasKeyboard && hasGamepad
      ? 'mixed'
      : hasGamepad
        ? 'gamepad'
        : hasKeyboard
          ? 'keyboard'
          : 'none';

  return {
    source,
    devices: {
      keyboard: hasKeyboard,
      gamepad: hasGamepad,
    },
    rawInputs: {
      keyboard: Array.from(keyboardInputs),
    },
  };
}

function computeMovementVector(binary) {
  let x = 0;
  let y = 0;

  if (binary.left) {
    x -= 1;
  }
  if (binary.right) {
    x += 1;
  }
  if (binary.up) {
    y -= 1;
  }
  if (binary.down) {
    y += 1;
  }

  const rawMagnitude = Math.hypot(x, y);
  const divisor = rawMagnitude > 1 ? rawMagnitude : 1;
  const normalizedX = rawMagnitude > 0 ? x / divisor : 0;
  const normalizedY = rawMagnitude > 0 ? y / divisor : 0;

  return {
    axes: { x: normalizedX, y: normalizedY },
    rawMagnitude,
    normalizedMagnitude: rawMagnitude > 1 ? 1 : rawMagnitude,
  };
}

/**
 * `bindingState` is the held-action bookkeeping of InputSystem:
 * { activeKeyboardActions, activeGamepadActions, keyboardActionInputs }.
 */
export function buildMovementCommandPayload(frame, bindingState) {
  const binary = {
    up: frame.up,
    down: frame.down,
    left: frame.left,
    right: frame.right,
  };
  const analog = {
    moveX: frame.moveX,
    moveY: frame.moveY,
    aimX: frame.aimX,
    aimY: frame.aimY,
  };
  const stick = Math.hypot(analog.moveX, analog.moveY);
  const vector =
    stick > 0
      ? {
          axes: { x: analog.moveX, y: analog.moveY },
          rawMagnitude: stick,
          normalizedMagnitude: Math.min(1, stick),
        }
      : computeMovementVector(binary);
  const details = collectMovementBindingDetails(bindingState);
  const timestamp = getCurrentTimestamp();

  const command = {
    type: 'move',
    source: details.source,
    axes: vector.axes,
    binary,
    analog,
    magnitude: vector.normalizedMagnitude,
    timestamp,
  };

  return {
    command,
    metadata: {
      source: command.source,
      metadata: {
        devices: details.devices,
        rawInputs: details.rawInputs,
        rawMagnitude: vector.rawMagnitude,
        timestamp,
      },
    },
  };
}

export function enqueueActionCommand(
  queue,
  action,
  phase,
  source,
  context = {}
) {
  if (!queue) {
    return;
  }

  const sanitizedContext = sanitizeCommandContext(context);
  const hasContext = Object.keys(sanitizedContext).length > 0;
  const normalizedSource = sanitizedContext.device || source || 'input';
  const timestamp = getCurrentTimestamp();

  if (action === 'activateShield' && phase === 'pressed') {
    const command = {
      type: 'ability',
      abilityId: 'shield',
      phase: 'pressed',
      source: normalizedSource,
      timestamp,
    };

    if (hasContext) {
      command.context = sanitizedContext;
    }

    const metadata = {
      source: normalizedSource,
      metadata: {
        action,
        phase,
        abilityId: 'shield',
      },
    };

    if (hasContext) {
      metadata.metadata.context = sanitizedContext;
    }

    try {
      queue.enqueue(command, metadata);
    } catch (error) {
      console.warn('[InputSystem] Failed to enqueue shield command:', error);
    }

    return;
  }

  if (action === 'firePrimary') {
    const command = {
      type: 'firePrimary',
      phase,
      source: normalizedSource,
      timestamp,
    };

    if (hasContext) {
      command.context = sanitizedContext;
    }

    const metadata = {
      source: normalizedSource,
      metadata: {
        action,
        phase,
      },
    };

    if (hasContext) {
      metadata.metadata.context = sanitizedContext;
    }

    try {
      queue.enqueue(command, metadata);
    } catch (error) {
      console.warn('[InputSystem] Failed to enqueue fire command:', error);
    }
  }
}
