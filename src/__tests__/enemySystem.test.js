import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnemySystem } from '../modules/EnemySystem.js';

function createPlayer() {
  const player = {
    position: { x: 0, y: 0 },
    invulnerableTimer: 0,
    maxHealth: 100,
    health: 100,
    takeDamage: vi.fn((amount) => {
      const damage = Math.max(0, amount);
      player.health = Math.max(0, player.health - damage);
      return player.health;
    }),
    setInvulnerableTimer: vi.fn(),
    getHullBoundingRadius: vi.fn(() => 12),
  };

  return player;
}

describe('EnemySystem.applyDirectDamageToPlayer', () => {
  let player;
  let enemySystem;
  let servicesStub;
  let eventsStub;

  beforeEach(() => {
    player = createPlayer();

    servicesStub = {
      register: vi.fn(),
      has: vi.fn((name) => name === 'player'),
      get: vi.fn((name) => (name === 'player' ? player : null)),
    };

    eventsStub = {
      emit: vi.fn(),
      on: vi.fn(),
    };

    globalThis.gameServices = servicesStub;
    globalThis.gameEvents = eventsStub;

    enemySystem = new EnemySystem();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.gameServices;
    delete globalThis.gameEvents;
  });

  it('skips applying damage when the explosion does not reach the player', () => {
    player.position = { x: 500, y: 0 };
    player.getHullBoundingRadius.mockReturnValue(10);

    const result = enemySystem.applyDirectDamageToPlayer(30, {
      cause: 'volatile-explosion',
      position: { x: 0, y: 0 },
      radius: 80,
    });

    expect(result.applied).toBe(false);
    expect(player.takeDamage).not.toHaveBeenCalled();
    const emitCalls = eventsStub.emit.mock.calls.filter(
      ([eventName]) => eventName === 'player-took-damage'
    );
    expect(emitCalls.length).toBe(0);
  });

  it('applies damage and emits an event when the explosion reaches the player', () => {
    player.position = { x: 20, y: 0 };
    player.getHullBoundingRadius.mockReturnValue(15);

    const result = enemySystem.applyDirectDamageToPlayer(25, {
      cause: 'volatile-explosion',
      position: { x: 0, y: 0 },
      radius: 40,
    });

    expect(result.applied).toBe(true);
    expect(player.takeDamage).toHaveBeenCalledWith(25);
    expect(result.remaining).toBe(player.health);
    expect(eventsStub.emit).toHaveBeenCalledWith(
      'player-took-damage',
      expect.objectContaining({
        damage: 25,
        remaining: player.health,
        cause: 'volatile-explosion',
      })
    );
  });

  it('maintains previous behaviour when no radius is provided', () => {
    player.position = { x: 999, y: 999 };

    const result = enemySystem.applyDirectDamageToPlayer(15, {
      cause: 'parasite',
    });

    expect(result.applied).toBe(true);
    expect(player.takeDamage).toHaveBeenCalledWith(15);
  });
});
