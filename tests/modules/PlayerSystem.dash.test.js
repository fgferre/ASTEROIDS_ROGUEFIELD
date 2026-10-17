import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlayerSystem from '../../src/modules/PlayerSystem.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { cleanupGlobalState, setupGlobalMocks } from '../__helpers__/setup.js';
import {
  DASH_COOLDOWN,
  DASH_GHOST_COUNT,
  DASH_IMPULSE,
  DASH_INVULNERABILITY,
} from '../../src/data/constants/gameplay.js';
import { SHIP_MAX_SPEED } from '../../src/data/constants/physics.js';

const DELTA_TIME = 1 / 60;

describe('PlayerSystem dash', () => {
  beforeEach(() => {
    setupGlobalMocks();
  });

  afterEach(() => {
    cleanupGlobalState();
  });

  function makePlayer(held = {}) {
    const eventBus = createEventBusMock();
    const movement = { up: false, down: false, left: false, right: false };
    Object.assign(movement, held);
    const input = { getMovementInput: vi.fn(() => ({ ...movement })) };
    const player = new PlayerSystem({ eventBus, input, 'command-queue': null });
    player.position = { x: 400, y: 300 };
    player.velocity = { vx: 0, vy: 0 };
    player.angle = 0;
    return { player, eventBus };
  }

  const steps = (player, count) => {
    for (let i = 0; i < count; i += 1) player.update(DELTA_TIME);
  };

  it('bursts along the nose with brief invulnerability, then settles under max speed', () => {
    const { player, eventBus } = makePlayer();
    eventBus.emit('dash-pressed');
    player.update(DELTA_TIME);

    expect(player.velocity.vx).toBeGreaterThan(SHIP_MAX_SPEED);
    expect(player.velocity.vx).toBeLessThanOrEqual(DASH_IMPULSE);
    expect(Math.abs(player.velocity.vy)).toBeLessThan(1e-6);
    expect(player.invulnerableTimer).toBeGreaterThan(
      DASH_INVULNERABILITY - 2 * DELTA_TIME
    );
    expect(eventBus.emit).toHaveBeenCalledWith(
      'player-dashed',
      expect.objectContaining({ direction: { x: 1, y: 0 } })
    );

    steps(player, 15);
    expect(player.dashGhosts.length).toBeGreaterThan(0);
    expect(player.dashGhostsDropped).toBe(DASH_GHOST_COUNT);
    expect(
      Math.hypot(player.velocity.vx, player.velocity.vy)
    ).toBeLessThanOrEqual(SHIP_MAX_SPEED);
    expect(player.invulnerableTimer).toBe(0);
  });

  it('dashes backward while only S is held', () => {
    const { player, eventBus } = makePlayer({ down: true });
    eventBus.emit('dash-pressed');
    player.update(DELTA_TIME);
    expect(player.velocity.vx).toBeLessThan(-SHIP_MAX_SPEED);
  });

  it('ignores presses during the cooldown and while dead', () => {
    const { player, eventBus } = makePlayer();
    eventBus.emit('dash-pressed');
    player.update(DELTA_TIME);
    expect(player.getDashCooldownFraction()).toBeGreaterThan(0.95);

    steps(player, 30);
    player.velocity = { vx: 0, vy: 0 };
    eventBus.emit('dash-pressed');
    player.update(DELTA_TIME);
    expect(player.velocity.vx).toBe(0);

    steps(player, Math.ceil(DASH_COOLDOWN / DELTA_TIME));
    expect(player.getDashCooldownFraction()).toBe(0);
    player.markDead();
    eventBus.emit('dash-pressed');
    player.update(DELTA_TIME);
    expect(player.getDashCooldownFraction()).toBe(0);
  });
});
