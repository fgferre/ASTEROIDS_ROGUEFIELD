import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import { PICKUP_KINDS, PICKUP_TOKEN } from '../../../src/data/pickups.js';
import {
  STEP_SECONDS,
  createHeadlessGame,
  installDomStubs,
} from '../../__helpers__/headlessGame.js';

const secondsToSteps = (seconds) => Math.ceil(seconds / STEP_SECONDS);

function startGame() {
  const game = createHeadlessGame();
  game.session.startNewRun({ source: 'test' });
  game.services.player.setInvulnerableTimer(1e9);
  return game;
}

function stepFor(game, seconds) {
  for (let i = 0; i < secondsToSteps(seconds); i += 1) game.step();
}

function dropOnPlayer(game, kind) {
  const { x, y } = game.services.player.getPosition();
  game.services.pickups.spawnPickup(kind, x, y);
  game.step();
}

function killPayload(elite) {
  return {
    enemy: { id: 'test-kill', type: 'drone', elite, x: 120, y: 120 },
    position: { x: 120, y: 120 },
  };
}

describe('PickupSystem', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    restoreDom();
    GamePools.releaseAll();
  });

  it('drops pickups from elite deaths and never from plain ones', () => {
    const game = startGame();
    const { pickups } = game.services;

    for (let i = 0; i < 20; i += 1) {
      game.eventBus.emit('enemy-destroyed', killPayload(false));
    }
    expect(pickups.getActivePickups()).toHaveLength(0);

    for (let i = 0; i < 20; i += 1) {
      game.eventBus.emit('enemy-destroyed', killPayload(true));
    }
    expect(pickups.getActivePickups().length).toBeGreaterThan(0);
  });

  it('Motherlode: every Elite death drops a pickup until the run resets', () => {
    const game = startGame();
    const { pickups } = game.services;
    game.eventBus.emit('apex-unlocked', { family: 'salvage' });

    for (let i = 0; i < 10; i += 1) {
      game.eventBus.emit('enemy-destroyed', killPayload(true));
    }
    expect(pickups.getActivePickups()).toHaveLength(10);

    game.eventBus.emit('progression-reset');
    expect(pickups.eliteAlwaysDrops).toBe(false);
  });

  it('expires a pickup at its lifetime', () => {
    const game = startGame();
    const { pickups, player } = game.services;
    const { x, y } = player.getPosition();
    pickups.spawnPickup('pulse', x > 400 ? 60 : 740, y > 300 ? 60 : 540);

    // Hit-stop slows the simulated clock, so check well inside each side.
    stepFor(game, PICKUP_TOKEN.lifetime - 2);
    expect(pickups.getActivePickups()).toHaveLength(1);
    stepFor(game, 4);
    expect(pickups.getActivePickups()).toHaveLength(0);
  });

  it('Magnet pulls every XP orb to the ship', () => {
    const game = startGame();
    const { player } = game.services;
    const xpOrbs = game.services['xp-orbs'];
    const collect = vi.spyOn(xpOrbs, 'collectOrb');
    const { x, y } = player.getPosition();
    const orbs = [
      xpOrbs.createXPOrb(x - 350, y - 250, 5),
      xpOrbs.createXPOrb(x + 350, y + 250, 5),
    ];
    const distance = () =>
      orbs.reduce((sum, orb) => sum + Math.hypot(orb.x - x, orb.y - y), 0);

    dropOnPlayer(game, 'magnet');
    const samples = [distance()];
    for (let i = 0; i < 3; i += 1) {
      stepFor(game, 0.15);
      samples.push(distance());
    }

    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeLessThan(samples[i - 1]);
    }
    stepFor(game, PICKUP_KINDS.magnet.duration);
    const collected = collect.mock.calls.map(([orb]) => orb);
    expect(orbs.every((orb) => collected.includes(orb))).toBe(true);
  });

  it('Pulse damages every enemy on the field', () => {
    const game = startGame();
    const { enemies } = game.services;
    enemies.startNextWave();
    stepFor(game, 3);
    const targets = enemies.getActiveEnemies().map((enemy) => ({
      enemy,
      health: enemy.health,
    }));
    expect(targets.length).toBeGreaterThan(1);

    dropOnPlayer(game, 'pulse');

    for (const { enemy, health } of targets) {
      const hit = enemy.destroyed || enemy.health <= health - 1;
      expect(hit).toBe(true);
    }
  });

  it('Overcharge halves the fire interval for 8 s', () => {
    const game = startGame();
    const { combat } = game.services;
    const base = combat.shootCooldown;

    dropOnPlayer(game, 'overcharge');
    expect(combat.shootCooldown).toBeCloseTo(base / 2);

    stepFor(game, PICKUP_KINDS.overcharge.duration - 0.5);
    expect(combat.shootCooldown).toBeCloseTo(base / 2);
    stepFor(game, 1);
    expect(combat.shootCooldown).toBeCloseTo(base);
  });
});
