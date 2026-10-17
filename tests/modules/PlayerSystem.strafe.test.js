import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlayerSystem from '../../src/modules/PlayerSystem.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { cleanupGlobalState, setupGlobalMocks } from '../__helpers__/setup.js';

const DELTA_TIME = 1 / 60;

describe('PlayerSystem control schemes', () => {
  beforeEach(() => {
    setupGlobalMocks();
  });

  afterEach(() => {
    cleanupGlobalState();
  });

  function makePlayer(held = {}, controlScheme = 'modern') {
    const eventBus = createEventBusMock();
    const movement = { up: false, down: false, left: false, right: false };
    Object.assign(movement, held);
    const input = { getMovementInput: vi.fn(() => ({ ...movement })) };
    const player = new PlayerSystem({
      eventBus,
      input,
      'command-queue': null,
      controlScheme,
    });
    player.position = { x: 400, y: 300 };
    player.velocity = { vx: 0, vy: 0 };
    return player;
  }

  const steps = (player, count) => {
    for (let i = 0; i < count; i += 1) player.update(DELTA_TIME);
  };

  it('A strafes to port relative to the facing, without turning', () => {
    const player = makePlayer({ left: true });
    player.angle = -Math.PI / 2; // nose up the screen: port is -x
    player.setAimPoint({ x: 400, y: -1e6 });
    steps(player, 30);

    expect(player.velocity.vx).toBeLessThan(-50);
    expect(Math.abs(player.velocity.vy)).toBeLessThan(1);
    expect(player.angle).toBeCloseTo(-Math.PI / 2, 2);
  });

  it('turns the nose onto the aim point without overshooting', () => {
    const player = makePlayer();
    player.angle = 0;
    player.setAimPoint({ x: 400, y: 600 }); // straight down: +PI/2
    let maxAngle = 0;
    for (let i = 0; i < 60; i += 1) {
      player.update(DELTA_TIME);
      maxAngle = Math.max(maxAngle, player.angle);
    }

    expect(player.angle).toBeCloseTo(Math.PI / 2, 2);
    expect(maxAngle).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
  });

  it('classic still rotates on A/D instead of strafing', () => {
    const player = makePlayer({ right: true }, 'classic');
    player.angle = 0;
    steps(player, 30);

    expect(player.angle).toBeGreaterThan(0.3);
    expect(Math.hypot(player.velocity.vx, player.velocity.vy)).toBeLessThan(1);
  });
});
