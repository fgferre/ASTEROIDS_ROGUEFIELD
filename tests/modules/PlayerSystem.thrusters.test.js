import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import PlayerSystem from '../../src/modules/PlayerSystem.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { cleanupGlobalState, setupGlobalMocks } from '../__helpers__/setup.js';

// What the thrusters show (thruster-effect events): where each jet sits.
const DT = 1 / 60;
const IDLE = { up: false, down: false, left: false, right: false };

function makePlayer() {
  const eventBus = createEventBusMock();
  const player = new PlayerSystem({
    eventBus,
    input: { getMovementInput: () => ({}) },
    'command-queue': null,
  });
  player.position = { x: 400, y: 300 };
  player.velocity = { vx: 0, vy: 0 };
  player.angle = 0;
  player.angularVelocity = 0;
  const events = [];
  eventBus.on('thruster-effect', (payload) => events.push(payload));
  const fly = (input, steps) => {
    events.length = 0;
    for (let i = 0; i < steps; i += 1) {
      player.updateMovement(DT, { ...IDLE, ...input });
      player.updatePosition(DT);
    }
    return events.filter((event) => event.intensity > 0);
  };
  return { player, fly };
}

describe('PlayerSystem thrusters', () => {
  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());

  it('a classic turn shows the couple that causes it: the aft wingtip and the nose jet on opposite flanks', () => {
    const classic = makePlayer(); // a run's start: classic
    const left = classic
      .fly({ left: true }, 1)
      .filter((e) => e.type === 'side');
    expect(left.map((e) => e.side)).toEqual(['left', 'left']);
    // the aft port wingtip blows outboard to port, the nose jet to starboard
    const local = left.map((e) => ({
      x: e.position.x - classic.player.position.x,
      y: e.position.y - classic.player.position.y,
    }));
    const aft = local.find((p) => p.x < 0);
    const nose = local.find((p) => p.x > 0);
    expect(aft.y).toBeLessThan(0);
    expect(nose.y).toBeGreaterThan(0);
  });
});
