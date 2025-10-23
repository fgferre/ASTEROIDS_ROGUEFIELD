import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import PlayerSystem from '../../src/modules/PlayerSystem.js';
import CommandQueueService from '../../src/services/CommandQueueService.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { setupGlobalMocks, cleanupGlobalState } from '../__helpers__/setup.js';

const DELTA_TIME = 1 / 60;

describe('PlayerSystem command queue integration', () => {
  let gameEventsMock;

  beforeEach(() => {
    setupGlobalMocks({ gameEvents: createEventBusMock() });
    gameEventsMock = globalThis.gameEvents;
  });

  afterEach(() => {
    cleanupGlobalState();
  });

  it('consumes move commands and matches legacy movement vectors and thruster output', () => {
    const baselineInput = { up: true, down: false, left: true, right: false };

    const legacyQueue = new CommandQueueService();
    const legacyInputService = { getMovementInput: vi.fn(() => ({ ...baselineInput })) };

    const baselinePlayer = new PlayerSystem({
      input: legacyInputService,
      'command-queue': legacyQueue,
    });

    baselinePlayer.position = { x: 320, y: 240 };
    baselinePlayer.velocity = { vx: 1, vy: -0.5 };
    baselinePlayer.angle = Math.PI / 3;
    baselinePlayer.angularVelocity = 0.07;
    baselinePlayer.driftFactor = 0.2;

    const thrusterEventsLegacy = [];
    gameEventsMock.emit.mockImplementation((eventName, payload) => {
      if (eventName === 'thruster-effect') {
        thrusterEventsLegacy.push({
          type: payload.type,
          intensity: payload.intensity,
          position: { ...payload.position },
          direction: { ...payload.direction },
          visualLevel: payload.visualLevel,
        });
      }
    });

    baselinePlayer.updateMovement(DELTA_TIME, baselineInput);
    baselinePlayer.updatePosition(DELTA_TIME);

    const legacyState = {
      velocity: { ...baselinePlayer.velocity },
      angularVelocity: baselinePlayer.angularVelocity,
      angle: baselinePlayer.angle,
      position: { ...baselinePlayer.position },
    };

    const commandQueue = new CommandQueueService();
    const commandInputService = {
      getMovementInput: vi.fn(() => ({ up: false, down: false, left: false, right: false })),
    };

    const queuePlayer = new PlayerSystem({
      input: commandInputService,
      'command-queue': commandQueue,
    });

    queuePlayer.position = { x: 320, y: 240 };
    queuePlayer.velocity = { vx: 1, vy: -0.5 };
    queuePlayer.angle = Math.PI / 3;
    queuePlayer.angularVelocity = 0.07;
    queuePlayer.driftFactor = 0.2;

    commandQueue.enqueue({
      type: 'move',
      binary: { ...baselineInput },
      axes: {
        x: baselineInput.right ? 1 : baselineInput.left ? -1 : 0,
        y: baselineInput.down ? 1 : baselineInput.up ? -1 : 0,
      },
      source: 'test',
    });

    const thrusterEventsQueue = [];
    gameEventsMock.emit.mockImplementation((eventName, payload) => {
      if (eventName === 'thruster-effect') {
        thrusterEventsQueue.push({
          type: payload.type,
          intensity: payload.intensity,
          position: { ...payload.position },
          direction: { ...payload.direction },
          visualLevel: payload.visualLevel,
        });
      }
    });

    queuePlayer.update(DELTA_TIME);

    expect(queuePlayer.velocity).toEqual(legacyState.velocity);
    expect(queuePlayer.angularVelocity).toBeCloseTo(legacyState.angularVelocity, 10);
    expect(queuePlayer.angle).toBeCloseTo(legacyState.angle, 10);
    expect(queuePlayer.position).toEqual(legacyState.position);
    expect(thrusterEventsQueue).toEqual(thrusterEventsLegacy);
    expect(commandInputService.getMovementInput).not.toHaveBeenCalled();
  });

  it('falls back to cached movement when no command is available', () => {
    const commandQueue = new CommandQueueService();
    const inputService = {
      getMovementInput: vi.fn(() => ({ up: false, down: false, left: false, right: false })),
    };

    const player = new PlayerSystem({
      input: inputService,
      'command-queue': commandQueue,
    });

    player.angle = 0;
    player.position = { x: 200, y: 180 };
    player.velocity = { vx: 0, vy: 0 };

    commandQueue.enqueue({
      type: 'move',
      binary: { up: true, down: false, left: false, right: false },
      axes: { x: 0, y: -1 },
      source: 'test',
    });

    player.update(DELTA_TIME);
    const velocityAfterCommand = { ...player.velocity };

    gameEventsMock.emit.mockClear();
    const thrusterEvents = [];
    gameEventsMock.emit.mockImplementation((eventName, payload) => {
      if (eventName === 'thruster-effect') {
        thrusterEvents.push(payload);
      }
    });

    player.update(DELTA_TIME);

    expect(player.velocity.vx).toBeGreaterThan(velocityAfterCommand.vx);
    expect(thrusterEvents.length).toBeGreaterThan(0);
    expect(player.cachedMovementInput.up).toBe(true);
  });
});
