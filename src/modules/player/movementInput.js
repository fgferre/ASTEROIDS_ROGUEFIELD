// src/modules/player/movementInput.js
//
// The move keys and sticks the ship flies by each step: the newest 'move'
// command on the command queue, else the input system's own reading (no
// queue), else the last ones held, and what the sticks point at. PlayerSystem
// owns one.

import { resolveService } from '../../core/serviceUtils.js';
import { GAMEPAD_AIM_ENGAGE } from '../../data/constants/gamepad.js';

/**
 * Modern WASD, or the left stick's direction, as a unit vector on the
 * screen axes (W up), or null. The stick steers at full thrust like a key.
 */
export function getModernMove(input) {
  const stickX = Number(input.moveX) || 0;
  const stickY = Number(input.moveY) || 0;
  const stick = Math.hypot(stickX, stickY);
  if (stick > 0) {
    return { x: stickX / stick, y: stickY / stick };
  }
  const x = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const y = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const length = Math.hypot(x, y);
  return length > 0 ? { x: x / length, y: y / length } : null;
}

/** The right stick's unit direction past the engage, or null. */
export function getAimStickDirection(input) {
  const x = Number(input.aimX) || 0;
  const y = Number(input.aimY) || 0;
  const magnitude = Math.hypot(x, y);
  if (magnitude <= GAMEPAD_AIM_ENGAGE) {
    return null;
  }
  return { x: x / magnitude, y: y / magnitude };
}

export class MovementInput {
  /**
   * `dependencies`: the player's dependencies; the command queue is found there, and kept there once resolved.
   */
  constructor({ dependencies }) {
    this.dependencies = dependencies;
    this.commandQueue =
      this.dependencies['command-queue'] ||
      resolveService('command-queue', this.dependencies) ||
      null;
    this.commandQueueConsumerId = 'player-system';
    this.cachedMovementInput = this.getDefaultMovementBinary();
    this.lastConsumedMovementCommand = null;
  }

  // This step's movement, once per update: `commandQueue` is this step's
  // getCommandQueue(); without one, `inputSystem` is read directly.
  readMovement(commandQueue, inputSystem) {
    const { consumed, binary } = this.consumeMovementCommands();
    let movement = null;

    if (consumed && binary) {
      movement = { ...binary };
    } else if (!commandQueue) {
      const legacyMovement = this.pullLegacyMovementFromInput(inputSystem);
      if (legacyMovement) {
        this.cachedMovementInput = { ...legacyMovement };
        movement = { ...legacyMovement };
      }
    }

    if (!movement) {
      movement = { ...this.cachedMovementInput };
    }
    return movement;
  }

  getCommandQueue() {
    if (this.commandQueue) {
      return this.commandQueue;
    }

    if (this.dependencies && this.dependencies['command-queue']) {
      this.commandQueue = this.dependencies['command-queue'];
      return this.commandQueue;
    }

    this.commandQueue =
      resolveService('command-queue', this.dependencies) || null;

    if (this.commandQueue && this.dependencies) {
      this.dependencies['command-queue'] = this.commandQueue;
    }

    return this.commandQueue;
  }

  consumeMovementCommands() {
    const queue = this.getCommandQueue();

    if (!queue || typeof queue.consume !== 'function') {
      return { consumed: false, binary: null };
    }

    let entries;

    try {
      entries = queue.consume({
        types: ['move'],
        consumerId: this.commandQueueConsumerId,
      });
    } catch (error) {
      console.warn('[PlayerSystem] Failed to consume move commands:', error);
      return { consumed: false, binary: null };
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return { consumed: false, binary: null };
    }

    const latestEntry = entries[entries.length - 1];
    const normalizedBinary = this.extractMovementBinary(latestEntry);

    if (!normalizedBinary) {
      this.lastConsumedMovementCommand = latestEntry || null;
      return { consumed: true, binary: null };
    }

    this.cachedMovementInput = { ...normalizedBinary };
    this.lastConsumedMovementCommand = latestEntry || null;

    return { consumed: true, binary: { ...normalizedBinary } };
  }

  extractMovementBinary(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const payload = entry.payload || null;

    if (payload && typeof payload === 'object') {
      if (payload.binary && typeof payload.binary === 'object') {
        const movement = this.normalizeMovementBinary(payload.binary);
        // Gamepad sticks (InputSystem `analog`), centred from the keyboard.
        if (payload.analog) {
          movement.moveX = Number(payload.analog.moveX) || 0;
          movement.moveY = Number(payload.analog.moveY) || 0;
          movement.aimX = Number(payload.analog.aimX) || 0;
          movement.aimY = Number(payload.analog.aimY) || 0;
        }
        return movement;
      }

      if (payload.axes && typeof payload.axes === 'object') {
        const threshold = 0.25;
        const x = Number(payload.axes.x) || 0;
        const y = Number(payload.axes.y) || 0;

        return this.normalizeMovementBinary({
          up: y < -threshold,
          down: y > threshold,
          left: x < -threshold,
          right: x > threshold,
        });
      }
    }

    return null;
  }

  normalizeMovementBinary(binary) {
    if (!binary || typeof binary !== 'object') {
      return this.getDefaultMovementBinary();
    }

    return {
      up: Boolean(binary.up),
      down: Boolean(binary.down),
      left: Boolean(binary.left),
      right: Boolean(binary.right),
    };
  }

  getDefaultMovementBinary() {
    return {
      up: false,
      down: false,
      left: false,
      right: false,
    };
  }

  pullLegacyMovementFromInput(inputSystem) {
    if (!inputSystem || typeof inputSystem.getMovementInput !== 'function') {
      return null;
    }

    try {
      const legacy = inputSystem.getMovementInput();
      if (legacy && typeof legacy === 'object') {
        return this.normalizeMovementBinary(legacy);
      }
    } catch (error) {
      console.warn(
        '[PlayerSystem] Failed to read legacy movement input:',
        error
      );
    }

    return null;
  }
}
