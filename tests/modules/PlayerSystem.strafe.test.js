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

  it('WASD moves on the screen axes and the hull turns onto the motion, not the aim', () => {
    const player = makePlayer({ right: true });
    player.angle = -Math.PI / 2; // nose up the screen
    player.setAimPoint({ x: 400, y: -1e6 }); // target straight up
    let maxAngle = -Math.PI / 2;
    for (let i = 0; i < 60; i += 1) {
      player.update(DELTA_TIME);
      maxAngle = Math.max(maxAngle, player.angle);
    }

    expect(player.velocity.vx).toBeGreaterThan(50);
    expect(Math.abs(player.velocity.vy)).toBeLessThan(5);
    expect(player.angle).toBeCloseTo(0, 2);
    expect(maxAngle).toBeLessThanOrEqual(1e-9);
  });

  it('W moves up the screen whatever the hull heading', () => {
    const player = makePlayer({ up: true });
    player.angle = 0;
    steps(player, 30);

    expect(player.velocity.vy).toBeLessThan(-50);
    expect(Math.abs(player.velocity.vx)).toBeLessThan(20);
    expect(player.angle).toBeCloseTo(-Math.PI / 2, 2);
  });

  it('the turret turns onto the aim point on its own, and the muzzle follows it', () => {
    const player = makePlayer({ right: true });
    player.angle = 0;
    player.setAimPoint({ x: 400, y: -1e6 }); // straight up: -PI/2
    player.update(DELTA_TIME);
    expect(player.getTurretAngle()).toBeGreaterThan(-Math.PI / 2 + 0.1);
    steps(player, 20);

    expect(player.getTurretAngle()).toBeCloseTo(-Math.PI / 2, 2);
    expect(player.angle).toBeCloseTo(0, 2);
    const pivot = player.getTurretPivot();
    const muzzle = player.getMuzzlePoint();
    expect(muzzle.x).toBeCloseTo(pivot.x, 1);
    expect(muzzle.y).toBeLessThan(pivot.y);
  });

  it('without a lock the turret settles back onto the nose', () => {
    const player = makePlayer();
    player.angle = 0.5;
    player.turretAngle = -1.5;
    steps(player, 30);

    expect(player.getTurretAngle()).toBeCloseTo(0.5, 2);
  });

  it('classic still rotates on A/D instead of strafing', () => {
    const player = makePlayer({ right: true }, 'classic');
    player.angle = 0;
    steps(player, 30);

    expect(player.angle).toBeGreaterThan(0.3);
    expect(Math.hypot(player.velocity.vx, player.velocity.vy)).toBeLessThan(1);
    expect(player.getTurretAngle()).toBe(player.angle);
  });
});
