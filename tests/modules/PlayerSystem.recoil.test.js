import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import PlayerSystem from '../../src/modules/PlayerSystem.js';
import { SHOT_RECOIL_IMPULSE } from '../../src/data/constants/gameplay.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { cleanupGlobalState, setupGlobalMocks } from '../__helpers__/setup.js';

describe('PlayerSystem shot recoil', () => {
  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());

  it('kicks the hull against the aim once per shot in either flight, a slower gun harder per shot', () => {
    const eventBus = createEventBusMock();
    const player = new PlayerSystem({
      eventBus,
      input: { getMovementInput: () => ({}) },
      'command-queue': null,
    });
    const shot = (cooldownMultiplier) => ({
      cooldownMultiplier,
      position: { x: 400, y: 300 },
      target: { x: 400, y: 0 },
      centerlineTarget: { x: 700, y: 300 },
    });
    // The start's flight: nothing bleeds the kick off but the pilot.
    player.setFlightScheme('classic', true);
    player.velocity = { vx: 0, vy: 0 };
    eventBus.emit('weapon-fired', shot(1));
    expect(player.velocity.vx).toBeCloseTo(-SHOT_RECOIL_IMPULSE, 6);
    expect(player.velocity.vy).toBeCloseTo(0, 6);

    // The Scatter Coil waits 1.6× the Lance's cooldown: 1.6× the kick.
    player.setFlightScheme('modern', false);
    player.velocity = { vx: 0, vy: 0 };
    eventBus.emit('weapon-fired', shot(1.6));
    expect(player.velocity.vx).toBeCloseTo(-1.6 * SHOT_RECOIL_IMPULSE, 6);
  });
});
