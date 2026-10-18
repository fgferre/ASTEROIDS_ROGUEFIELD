import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import PlayerSystem from '../../src/modules/PlayerSystem.js';
import { SHOT_RECOIL_IMPULSE } from '../../src/data/constants/gameplay.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { cleanupGlobalState, setupGlobalMocks } from '../__helpers__/setup.js';

describe('PlayerSystem shot recoil', () => {
  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());

  it('kicks the hull against the aim once per weapon-fired', () => {
    const eventBus = createEventBusMock();
    const player = new PlayerSystem({
      eventBus,
      input: { getMovementInput: () => ({}) },
      'command-queue': null,
    });
    player.velocity = { vx: 0, vy: 0 };
    const shot = {
      position: { x: 400, y: 300 },
      target: { x: 400, y: 0 },
      centerlineTarget: { x: 700, y: 300 },
    };

    eventBus.emit('weapon-fired', shot);
    expect(player.velocity.vx).toBeCloseTo(-SHOT_RECOIL_IMPULSE, 6);
    expect(player.velocity.vy).toBeCloseTo(0, 6);

    eventBus.emit('weapon-fired', shot);
    expect(player.velocity.vx).toBeCloseTo(-2 * SHOT_RECOIL_IMPULSE, 6);
  });
});
