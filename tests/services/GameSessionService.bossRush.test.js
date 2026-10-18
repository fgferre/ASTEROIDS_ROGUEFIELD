/**
 * Boss Rush: the three Wardens back to back, a breather and a card pick
 * between them, its own victory and records; New Mission keeps the mode and
 * Start clears it.
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
  return boss;
}

// Clears the rest of the layer and waits out the breather.
function clearUntilLayer(game, layer) {
  const { enemies } = game.services;
  for (
    let step = 0;
    step < BREAK_STEPS && enemies.waveManager.currentWave < layer;
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
}

const click = (game, id) =>
  game.session.handleDocumentClick({
    target: { closest: () => ({ id }) },
    preventDefault() {},
  });

describe('Boss Rush', () => {
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

  it('fights Prime, Choir and Null back to back, then clears with its own record', () => {
    const game = createHeadlessGame();
    click(game, 'boss-rush-btn');
    const { player, enemies } = game.services;
    player.setInvulnerableTimer(1e9);
    const victories = [];
    game.eventBus.on('screen-changed', (payload) => {
      if (payload.screen === 'victory') victories.push(payload);
    });

    const wardens = [];
    for (const [layer, next] of [
      [5, 10],
      [10, 15],
    ]) {
      expect(enemies.waveManager.currentWave).toBe(layer);
      wardens.push(killBoss(game).bossKind);
      clearUntilLayer(game, next);
    }
    expect(enemies.waveManager.currentWave).toBe(15);
    wardens.push(killBoss(game).bossKind);
    for (let step = 0; step < AFTER_STEPS; step += 1) game.step();
    vi.advanceTimersByTime(8000);

    expect(wardens).toEqual(['prime', 'choir', 'null']);
    expect(game.session.getSessionState()).toBe('victory');
    expect(victories).toHaveLength(1);
    const { bossRush } = victories[0].data;
    expect(bossRush.stage).toBe(3);
    expect(bossRush.bestStage).toBe(3);
    expect(bossRush.bestTime).toBeGreaterThan(0);
    expect(game.session.continueBeyondVictory()).toBe(false);
    // The layer records only count full runs.
    expect(loadRecords()).toMatchObject({
      bestLayer: 0,
      bossRushStage: 3,
      bossRushTime: bossRush.bestTime,
    });
  });

  it('grants a level for each Warden before the last', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test', bossRush: true });
    const { progression } = game.services;
    const level = progression.getLevel();

    game.eventBus.emit('boss-defeated', { wave: 5 });
    game.eventBus.emit('boss-defeated', { wave: 10 });

    expect(progression.getLevel()).toBe(level + 2);
    expect(game.session.getSessionState()).toBe('running');
  });

  it('names the Warden reached on the death screen', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test', bossRush: true });
    const gameovers = [];
    game.eventBus.on('screen-changed', (payload) => {
      if (payload.screen === 'gameover') gameovers.push(payload);
    });

    game.eventBus.emit('boss-defeated', { wave: 5 });
    game.eventBus.emit('player-died', game.services.world.buildRunSummary());
    vi.advanceTimersByTime(7000);

    expect(gameovers[0].data.bossRush).toMatchObject({
      stage: 2,
      bestTime: 0,
    });
    expect(loadRecords().bossRushTime).toBe(0);
  });

  it('keeps the mode on New Mission; Start and Daily Field clear it', () => {
    const game = createHeadlessGame();
    const { enemies } = game.services;

    click(game, 'boss-rush-btn');
    expect(enemies.waveManager.currentWave).toBe(5);
    click(game, 'restart-game-btn');
    expect(game.session.bossRush).toBe(true);
    expect(enemies.waveManager.currentWave).toBe(5);
    click(game, 'start-game-btn');
    expect(game.session.bossRush).toBe(false);
    expect(enemies.waveManager.currentWave).toBe(1);
    click(game, 'boss-rush-btn');
    click(game, 'daily-field-btn');
    expect(game.session.bossRush).toBe(false);
    expect(game.services.difficulty.isDaily()).toBe(true);
  });
});
