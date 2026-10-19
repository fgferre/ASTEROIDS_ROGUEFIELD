/**
 * After the layer-15 victory the player can continue: the run goes endless,
 * layers resume at 16, later Wardens bring no second victory, death ends the
 * run as usual, and the best layer reached is kept in localStorage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import { loadRecords } from '../../src/services/runRecords.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../__helpers__/headlessGame.js';

const SPAWN_STEPS = 20 * 60;
const KILL_STEPS = 10 * 60;
const AFTER_STEPS = 3 * 60;
const BREAK_STEPS = 15 * 60;

function startOnLayer(game, layer) {
  const { enemies } = game.services;
  enemies.releaseAllAsteroidsToPool();
  enemies.waveManager.currentWave = layer - 1;
  enemies.waveManager.waveInProgress = false;
  enemies.startNextWave();
}

function killBoss(game) {
  const { enemies } = game.services;
  let boss = null;
  for (let step = 0; step < SPAWN_STEPS && !boss; step += 1) {
    game.step();
    boss = enemies.getActiveEnemies().find((e) => e.type === 'boss');
  }
  for (let step = 0; step < KILL_STEPS && !boss.destroyed; step += 1) {
    boss.takeDamage(1e9);
    game.step();
  }
  for (let step = 0; step < AFTER_STEPS; step += 1) game.step();
  vi.advanceTimersByTime(3000);
  for (let step = 0; step < AFTER_STEPS; step += 1) game.step();
  return boss;
}

describe('endless run past the final Warden', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    GamePools.releaseAll();
    restoreDom();
    vi.restoreAllMocks();
  });

  it('continues into layer 16 and on, with no second victory at 20', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    const { player, enemies } = game.services;
    player.setInvulnerableTimer(1e9);

    const won = [];
    const victories = [];
    const continued = [];
    const gameovers = [];
    game.eventBus.on('run-won', (payload) => won.push(payload));
    game.eventBus.on('run-continued', (payload) => continued.push(payload));
    game.eventBus.on('screen-changed', (payload) => {
      if (payload.screen === 'victory') victories.push(payload);
      if (payload.screen === 'gameover') gameovers.push(payload);
    });

    startOnLayer(game, 15);
    killBoss(game);
    expect(game.session.getSessionState()).toBe('victory');
    expect(victories).toHaveLength(1);
    expect(victories[0].data.bestLayer).toBe(15);

    expect(game.session.continueBeyondVictory()).toBe(true);
    expect(game.session.getSessionState()).toBe('running');
    expect(game.session.getScreen()).toBe('playing');
    expect(continued).toEqual([{ fromLayer: 15 }]);

    // The rest of layer 15 (rocks, the Seeker escort) still has to be cleared.
    for (
      let step = 0;
      step < BREAK_STEPS && enemies.waveManager.currentWave < 16;
      step += 1
    ) {
      enemies.getActiveEnemies().forEach((enemy) => {
        if (enemy.type === 'asteroid') {
          enemies.destroyAsteroid(enemy, { createFragments: false });
        } else {
          enemy.takeDamage(1e9);
        }
      });
      game.step();
    }
    expect(enemies.waveManager.currentWave).toBe(16);
    expect(loadRecords().bestLayer).toBe(16);

    startOnLayer(game, 20);
    const warden = killBoss(game);
    expect(warden.destroyed).toBe(true);
    expect(won).toHaveLength(1);
    expect(victories).toHaveLength(1);
    expect(game.session.getSessionState()).toBe('running');
    expect(loadRecords().bestLayer).toBe(20);

    game.eventBus.emit('player-died', game.services.world.buildRunSummary());
    vi.advanceTimersByTime(3000);
    expect(game.session.getSessionState()).toBe('player-died');
    expect(gameovers).toHaveLength(1);
    expect(gameovers[0].data.bestLayer).toBe(20);
  });

  it('brings back a ship lost after the final Warden fell when the run goes on', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    const { player, world } = game.services;
    player.setInvulnerableTimer(1e9);
    const won = [];
    const gameovers = [];
    game.eventBus.on('run-won', (payload) => {
      won.push(payload);
      world.handlePlayerDeath();
    });
    game.eventBus.on('screen-changed', (payload) => {
      if (payload.screen === 'gameover') gameovers.push(payload);
    });

    startOnLayer(game, 15);
    killBoss(game);
    expect(player.isDead).toBe(true);
    expect(game.session.getScreen()).toBe('victory');

    expect(game.session.continueBeyondVictory()).toBe(true);
    expect(player.isDead).toBe(false);
    expect(player.health).toBe(player.maxHealth);
    expect(world.playerAlive).toBe(true);
    expect(won).toHaveLength(1);
    expect(gameovers).toHaveLength(0);
    expect(game.session.getSessionState()).toBe('running');
  });

  it('keeps the best layer across runs and counts each run', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    game.eventBus.emit('wave-started', { wave: 12 });
    game.session.startNewRun({ source: 'test' });
    game.eventBus.emit('wave-started', { wave: 3 });

    expect(loadRecords()).toMatchObject({ bestLayer: 12, runs: 2 });
  });
});
