import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlayerSystem from '../../src/modules/PlayerSystem.js';
import UPGRADE_LIBRARY from '../../src/data/upgrades/index.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { cleanupGlobalState, setupGlobalMocks } from '../__helpers__/setup.js';

// The cards that change the hull, the shot's damage and the flight, seen on
// the player (modern flight, the Flight Computer's).
const DELTA_TIME = 1 / 60;

describe('hull, shot and flight cards on the player', () => {
  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());

  function makePlayer() {
    const eventBus = createEventBusMock();
    const movement = { up: false, down: false, left: false, right: false };
    const input = { takeStepFrame: vi.fn(() => ({ ...movement })) };
    const player = new PlayerSystem({
      eventBus,
      input,
    });
    player.setFlightScheme('modern', false);
    player.position = { x: 400, y: 300 };
    player.velocity = { vx: 0, vy: 0 };
    return { player, eventBus, movement };
  }

  // Emits a card's event effects, `ranks` of them, the way UpgradeSystem does.
  function takeCard(eventBus, id, ranks) {
    const card = UPGRADE_LIBRARY.find((entry) => entry.id === id);
    card.levels
      .slice(0, ranks)
      .forEach((level) =>
        level.effects.forEach((effect) =>
          eventBus.emit(effect.event, { ...effect.payload })
        )
      );
  }

  it('Reactor Bleed 3: double damage while not thrusting (a move key thrusts in this flight)', () => {
    const { player, eventBus, movement } = makePlayer();
    const base = player.getStats().damage;
    takeCard(eventBus, 'reactor_bleed', 3);
    player.update(DELTA_TIME);
    expect(player.getStats().damage).toBe(base * 2);
    movement.right = true;
    player.update(DELTA_TIME);
    expect(player.getStats().damage).toBe(base);
  });

  it('Momentum Rounds 3: x1.45 damage from 60% of the top speed, gliding top speed included', () => {
    const { player, eventBus } = makePlayer();
    const base = player.getStats().damage;
    takeCard(eventBus, 'momentum_rounds', 3);
    const top = player.flight.maxSpeed;
    player.velocity = { vx: top * 0.59, vy: 0 };
    expect(player.getStats().damage).toBe(base);
    player.velocity = { vx: top * 0.6, vy: 0 };
    expect(player.getStats().damage).toBeCloseTo(base * 1.45, 6);
    // Gliding, the top speed it measures against is the lower one.
    player.flight.glide = true;
    player.velocity = { vx: top * 0.4, vy: 0 };
    expect(player.getStats().damage).toBeCloseTo(base * 1.45, 6);
    player.velocity = { vx: top * 0.3, vy: 0 };
    expect(player.getStats().damage).toBe(base);
  });

  it('Grav Anchor 3: hits deal half while not thrusting (a move key thrusts in this flight)', () => {
    const { player, eventBus, movement } = makePlayer();
    takeCard(eventBus, 'grav_anchor', 3);
    player.update(DELTA_TIME);
    player.takeDamage(20);
    expect(player.health).toBe(player.maxHealth - 10);
    movement.up = true;
    player.update(DELTA_TIME);
    player.takeDamage(20);
    expect(player.health).toBe(player.maxHealth - 30);
  });

  it('Ablative Plating 3: every hit on the hull loses 9, never below 1', () => {
    const { player, eventBus } = makePlayer();
    takeCard(eventBus, 'ablative_plating', 3);
    player.takeDamage(20);
    expect(player.health).toBe(player.maxHealth - 11);
    player.takeDamage(5);
    expect(player.health).toBe(player.maxHealth - 12);
  });
});
