import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlayerSystem from '../../src/modules/PlayerSystem.js';
import UPGRADE_LIBRARY from '../../src/data/upgrades/index.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { cleanupGlobalState, setupGlobalMocks } from '../__helpers__/setup.js';

// The cards that change the hull, the shot's damage and the flight, seen on
// the player (modern scheme).
const DELTA_TIME = 1 / 60;

describe('hull, shot and flight cards on the player', () => {
  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());

  function makePlayer() {
    const eventBus = createEventBusMock();
    const movement = { up: false, down: false, left: false, right: false };
    const input = { getMovementInput: vi.fn(() => ({ ...movement })) };
    const player = new PlayerSystem({ eventBus, input, 'command-queue': null });
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

  const steps = (player, count) => {
    for (let i = 0; i < count; i += 1) player.update(DELTA_TIME);
  };

  it('Reactor Bleed 3: double damage while no movement key is held', () => {
    const { player, eventBus, movement } = makePlayer();
    const base = player.getStats().damage;
    takeCard(eventBus, 'reactor_bleed', 3);
    player.update(DELTA_TIME);
    expect(player.getStats().damage).toBe(base * 2);
    movement.right = true;
    player.update(DELTA_TIME);
    expect(player.getStats().damage).toBe(base);
  });

  it('Grav Anchor 3: hits deal half while no movement key is held', () => {
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

  it('RCS System 5: reversals 2.6 times as quick, top speed unchanged', () => {
    // Steps (s) for a ship flying right at top speed to fly left at 80% of it.
    const reversal = (ranks) => {
      const { player, eventBus, movement } = makePlayer();
      takeCard(eventBus, 'rcs_system', ranks);
      movement.right = true;
      steps(player, 180);
      const top = player.velocity.vx;
      movement.right = false;
      movement.left = true;
      let count = 0;
      while (player.velocity.vx > -0.8 * top) {
        player.update(DELTA_TIME);
        count += 1;
      }
      return { top, seconds: count * DELTA_TIME };
    };
    const base = reversal(0);
    const rcs = reversal(5);
    expect(Math.abs(rcs.top / base.top - 1)).toBeLessThan(0.001);
    expect(base.seconds / rcs.seconds).toBeGreaterThan(2.3);
    expect(base.seconds / rcs.seconds).toBeLessThan(2.9);
  });
});
