/**
 * Sector runs: one chapter on its own, from its first layer, after its head
 * start's card picks; won at its Warden with its own records, no endless
 * continue; any other start clears the sector.
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
const PICK_STEPS = 60;

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
  vi.advanceTimersByTime(8000);
  return boss;
}

// Takes each card offered; stepping opens the next (the headless game does
// not stop for the card screen).
function makePicks(game) {
  const { progression } = game.services;
  let picks = 0;
  for (let step = 0; step < PICK_STEPS; step += 1) {
    game.step();
    const id = game.takeOfferedUpgrade();
    if (!id) continue;
    progression.applyUpgrade(id);
    picks += 1;
  }
  return picks;
}

describe('sector runs', () => {
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

  it('opens on the first sector at layer 1 with no head start', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test', sector: 'outer-ring' });
    expect(game.session.sector.id).toBe('outer-ring');
    expect(game.services.enemies.waveManager.currentWave).toBe(1);
    expect(game.services.progression.getLevel()).toBe(1);
  });

  it('holds a later sector until its head start is picked, then opens on its first layer', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test', sector: 'dense-core' });
    const { enemies, progression } = game.services;
    for (let step = 0; step < 5; step += 1) game.step();
    expect(enemies.waveManager.currentWave).toBe(0);

    expect(makePicks(game)).toBe(4);
    for (let step = 0; step < 5; step += 1) game.step();
    expect(progression.getLevel()).toBe(5);
    expect(enemies.waveManager.currentWave).toBe(6);
  });

  it('is won at its Warden, with its own records and no endless continue', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test', sector: 'outer-ring' });
    game.services.player.setInvulnerableTimer(1e9);
    const won = [];
    const victories = [];
    game.eventBus.on('run-won', (payload) => won.push(payload));
    game.eventBus.on('screen-changed', (payload) => {
      if (payload.screen === 'victory') victories.push(payload);
    });

    startOnLayer(game, 5);
    killBoss(game);

    expect(game.session.getSessionState()).toBe('victory');
    expect(won).toEqual([expect.objectContaining({ sector: 'outer-ring' })]);
    expect(victories).toHaveLength(1);
    const { sector } = victories[0].data;
    expect(sector).toMatchObject({
      id: 'outer-ring',
      firstClear: true,
      next: 'dense-core',
    });
    expect(sector.bestTime).toBe(sector.time);
    expect(game.session.continueBeyondVictory()).toBe(false);
    expect(loadRecords()).toMatchObject({
      bestLayer: 0,
      bestTime: 0,
      sectorsWon: ['outer-ring'],
    });
  });

  it('keeps the sector on New Mission and a replay; a mode picked without one clears it', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test', sector: 'outer-ring' });
    game.session.startNewRun({ source: 'test' });
    expect(game.session.sector.id).toBe('outer-ring');

    game.session.startNewRun({ source: 'test', daily: false, bossRush: false });
    expect(game.session.sector).toBeNull();
    expect(game.services.enemies.waveManager.currentWave).toBe(1);

    game.session.replayStart = {
      daily: false,
      bossRush: false,
      sector: 'outer-ring',
    };
    game.session.startNewRun({ source: 'test', bossRush: true });
    expect(game.session.sector.id).toBe('outer-ring');
    expect(game.session.bossRush).toBe(false);
  });
});
