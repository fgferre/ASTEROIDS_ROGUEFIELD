import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  setupGlobalMocks,
  cleanupGlobalState,
} from '../../__helpers__/setup.js';
import { createHeadlessGame } from '../../__helpers__/headlessGame.js';
import { installDomStubs } from '../../__helpers__/domStubs.js';

let restore;
beforeEach(() => {
  setupGlobalMocks();
  restore = installDomStubs();
});
afterEach(() => {
  restore();
  cleanupGlobalState();
});

const kill = (enemies, enemy) =>
  enemies.applyDamage(enemy, enemy.maxHealth * 10, {
    source: { hitPosition: { x: 300, y: 300 } },
  });

it('a machine and a rock each count one kill, a machine once however often it is hit', () => {
  const game = createHeadlessGame();
  game.session.startNewRun({ source: 'test' });
  const { enemies } = game.services;
  const stats = enemies.sessionStats;
  const at = { x: 300, y: 300, wave: 1 };

  const hunter = enemies.acquireEnemyViaFactory('hunter', at);
  kill(enemies, hunter);
  expect(stats.totalKills).toBe(1);
  kill(enemies, hunter);
  expect(stats.totalKills).toBe(1);

  const rock = enemies.acquireEnemyViaFactory('asteroid', {
    ...at,
    size: 'small',
  });
  kill(enemies, rock);
  expect(stats.totalKills).toBe(2);
});
