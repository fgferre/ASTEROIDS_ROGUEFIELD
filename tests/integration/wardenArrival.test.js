/**
 * A Warden's entrance through the real systems: layer 5 spawns Warden Prime
 * past the edge farther from the ship, the ship is held while it flies in, and
 * the fight starts only once it has landed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
  keyEvent,
} from '../__helpers__/headlessGame.js';

const PRIME_LAYER = 5;
const MAX_STEPS = 300;

describe('Warden entrance', () => {
  let restoreDom;

  beforeEach(() => {
    restoreDom = installDomStubs();
    for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
      vi.spyOn(console, method).mockImplementation(() => {});
    }
    // The wall clock stands still, as in the golden trace.
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.spyOn(Date, 'now').mockReturnValue(0);
    return () => {
      GamePools.releaseAll();
      restoreDom();
    };
  });

  // A run jumped to Prime's layer with the ship at `shipX`.
  function prime(shipX) {
    const game = createHeadlessGame();
    const { enemies, player, combat } = game.services;
    game.session.startNewRun({ source: 'test' });
    if (shipX !== undefined) player.position.x = shipX;
    const arrived = [];
    game.eventBus.on('boss-arrived', (payload) => arrived.push(payload));

    enemies.releaseAllAsteroidsToPool();
    enemies.waveManager.currentWave = PRIME_LAYER - 1;
    enemies.waveManager.waveInProgress = false;
    enemies.startNextWave();
    let boss = null;
    enemies.forEachActiveEnemy((enemy) => {
      if (enemy.type === 'boss') boss = enemy;
    });
    expect(boss).not.toBeNull();

    const hold = (code) => game.services.input.onKeyDown(keyEvent(code));
    return { game, boss, player, combat, arrived, hold };
  }

  it.each([
    ['right', undefined, (x) => x > 800],
    ['left', 650, (x) => x < 0],
  ])(
    'is born past the %s edge, the one farther from the ship, and untouchable',
    (edge, shipX, isPast) => {
      const { boss } = prime(shipX);

      expect(isPast(boss.x)).toBe(true);
      expect(boss.arrival).toMatchObject({ edge });
      expect(boss.intangible).toBe(true);
      // Its fight starts inside the field, on its own side.
      expect(boss.arrival.to.x > 400).toBe(edge === 'right');
      expect(boss.arrival.to.x).toBeGreaterThan(0);
      expect(boss.arrival.to.x).toBeLessThan(800);
    }
  );

  it('holds the ship and draws no blood while it flies in', () => {
    const { game, boss, player, combat, hold } = prime();
    const health = boss.health;
    const shipHealth = player.health;
    // Its first attack waits for the landing.
    const spreadTimer = boss.spreadTimer;
    const { to } = boss.arrival;

    game.step();
    expect(player.controlsHeld).toBe(true);
    hold('KeyD');
    hold('KeyW');
    const { x, y } = player.position;

    let steps = 0;
    let shot = false;
    while (boss.arrival && steps < MAX_STEPS) {
      // A shot straight into it, once it is in the field.
      if (!shot && boss.x < 780) {
        combat.createBullet({ x: boss.x - 30, y: boss.y }, boss, 500);
        shot = true;
      }
      expect(player.controlsHeld).toBe(true);
      expect(player.invulnerableTimer).toBeGreaterThan(0);
      expect(player.position).toEqual({ x, y });
      // Along its path only: in from the right edge, level with its spot.
      expect(boss.x).toBeGreaterThanOrEqual(to.x);
      expect(boss.y).toBeCloseTo(to.y, 6);
      expect(boss.spreadTimer).toBe(spreadTimer);
      expect(combat.enemyBullets).toHaveLength(0);
      expect(boss.health).toBe(health);
      expect(player.health).toBe(shipHealth);
      game.step();
      steps += 1;
    }
    expect(shot).toBe(true);
    expect(boss.arrival).toBeNull();
    expect(steps).toBeGreaterThan(10);
  });

  it('ends once: inside the field, in the fight, the ship free again', () => {
    const { game, boss, player, arrived, hold } = prime();
    hold('KeyD');

    let steps = 0;
    while (boss.arrival && steps < MAX_STEPS) {
      game.step();
      steps += 1;
    }
    expect(boss.arrival).toBeNull();
    expect(boss.intangible).toBe(false);
    expect(boss.x).toBeGreaterThan(0);
    expect(boss.x).toBeLessThan(800);
    expect(boss.y).toBeGreaterThan(0);
    expect(boss.y).toBeLessThan(600);

    // The hold runs out within a step or two of the landing.
    for (let i = 0; i < 3; i += 1) game.step();
    expect(player.controlsHeld).toBe(false);
    const { x } = player.position;
    for (let i = 0; i < 30; i += 1) game.step();
    expect(player.position.x).toBeGreaterThan(x + 5);
    expect(arrived).toHaveLength(1);
  });
});
