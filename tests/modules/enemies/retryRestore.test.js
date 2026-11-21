/**
 * A retry puts the fight back as it was: a boss re-enters the phases it had
 * reached (the Sovereign splits, the Null's shell stays shed), a Herald keeps
 * its kind and an Elite its affixes (they used to come back as phase-1
 * bosses, Heralds of Dust and plain enemies).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../../__helpers__/headlessGame.js';

let restoreDom;
beforeEach(() => {
  restoreDom = installDomStubs();
});
afterEach(() => {
  GamePools.releaseAll();
  restoreDom();
});

function newGame() {
  const game = createHeadlessGame();
  game.session.startNewRun({ source: 'test' });
  game.services.player.setInvulnerableTimer(1e9);
  return game;
}

const alive = (game, type) =>
  game.services.enemies.asteroids.filter(
    (enemy) => enemy && !enemy.destroyed && enemy.type === type
  );

function retry(game) {
  const { snapshots } = game.session;
  const snapshot = snapshots.createDeathSnapshot();
  expect(snapshots.restoreFromSnapshot({ snapshot })).toBe(true);
}

function bossInLastPhase(game, bossKind, wave) {
  game.services.enemies.spawnBoss({ bossKind, wave, x: 400, y: 300 });
  const [boss] = alive(game, 'boss');
  boss.health = boss.maxHealth * 0.1;
  while (boss.currentPhase < boss.phaseCount - 1) boss.advancePhase();
  for (let step = 0; step < 400; step += 1) game.step();
  return alive(game, 'boss')[0];
}

function onlyEnemy(game, type, config) {
  const { enemies } = game.services;
  enemies.releaseAllAsteroidsToPool();
  enemies.asteroids = [];
  enemies.acquireEnemyViaFactory(type, { wave: 10, x: 300, y: 200, ...config });
}

describe('retry restore', () => {
  it('the Sovereign in its last phase splits again', () => {
    const game = newGame();
    const boss = bossInLastPhase(game, 'sovereign', 20);
    expect([boss.currentPhase, boss.order]).toEqual([2, 'both']);
    retry(game);
    const restored = alive(game, 'boss')[0];
    expect(restored.currentPhase).toBe(2);
    expect(restored.order).toBe('both');
    expect(restored.split).toBeTruthy();
  });

  it("the Null in its last phase keeps its shell shed and its finale's charge", () => {
    const game = newGame();
    const boss = bossInLastPhase(game, 'null', 15);
    const pick = (b) => [b.currentPhase, b.shellShed, b.chargeWindup];
    const before = pick(boss);
    expect(before[1]).toBe(true);
    retry(game);
    expect(pick(alive(game, 'boss')[0])).toEqual(before);
  });

  it.each(['heat', 'silence'])('a Herald of %s keeps its kind', (kind) => {
    const game = newGame();
    onlyEnemy(game, 'herald', { heraldKind: kind });
    retry(game);
    expect(alive(game, 'herald').map((h) => h.heraldKind)).toEqual([kind]);
  });

  it('an Elite keeps its affixes, name and size', () => {
    const game = newGame();
    onlyEnemy(game, 'hunter', { elite: true, affixes: ['swift', 'shielded'] });
    const pick = (e) => ({
      elite: e.elite,
      affixes: [...e.affixes],
      name: e.displayName,
      maxHealth: e.maxHealth,
      radius: e.radius,
    });
    const before = alive(game, 'hunter').map(pick);
    retry(game);
    expect(alive(game, 'hunter').map(pick)).toEqual(before);
  });

  it('a broken Elite shield stays broken, a worn one keeps its points', () => {
    const game = newGame();
    onlyEnemy(game, 'hunter', { elite: true, affixes: ['shielded'] });
    const [hunter] = alive(game, 'hunter');
    hunter.shieldHealth = 0;
    hunter.shieldBroken = true;
    retry(game);
    const [broken] = alive(game, 'hunter');
    expect(broken.shieldHealth).toBe(0);
    expect(broken.shieldBroken).toBe(true);

    broken.shieldHealth = 25;
    retry(game);
    expect(alive(game, 'hunter')[0].shieldHealth).toBe(25);
  });
});
