/**
 * Defeating the layer-15 Warden Prime clears the Field: the run ends in
 * victory (screen-changed 'victory', run-won) and layer 16 never starts.
 * The layer 5 and 10 Wardens are ordinary bosses.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../../__helpers__/headlessGame.js';

const SPAWN_STEPS = 20 * 60;
const KILL_STEPS = 10 * 60;
const AFTER_STEPS = 3 * 60;

function defeatBossOnLayer(layer) {
  const game = createHeadlessGame();
  game.session.startNewRun({ source: 'test' });
  const { player, enemies } = game.services;
  player.setInvulnerableTimer(1e9);
  enemies.releaseAllAsteroidsToPool();
  enemies.waveManager.currentWave = layer - 1;
  enemies.waveManager.waveInProgress = false;
  enemies.startNextWave();

  const victories = [];
  const won = [];
  game.eventBus.on('screen-changed', (payload) => {
    if (payload.screen === 'victory') victories.push(payload);
  });
  game.eventBus.on('run-won', (payload) => won.push(payload));

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

  return { game, boss, enemies, victories, won };
}

describe('field cleared', () => {
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

  it('emits victory once when the layer 15 boss dies and starts no layer 16', () => {
    const { game, boss, enemies, victories, won } = defeatBossOnLayer(15);

    expect(boss.destroyed).toBe(true);
    expect(won).toHaveLength(1);
    expect(victories).toHaveLength(1);
    expect(victories[0].data.stats).toBeTruthy();
    expect(victories[0].data.synergies).toEqual(expect.any(Array));
    expect(game.session.getSessionState()).toBe('victory');
    expect(enemies.waveManager.currentWave).toBe(15);
  });

  it.each([5, 10])(
    'does not emit victory when the layer %i boss dies',
    (layer) => {
      const { boss, victories, won } = defeatBossOnLayer(layer);

      expect(boss.destroyed).toBe(true);
      expect(won).toHaveLength(0);
      expect(victories).toHaveLength(0);
    }
  );
});
