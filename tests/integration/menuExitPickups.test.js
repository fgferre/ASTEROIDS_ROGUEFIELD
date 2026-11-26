import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import { BOSS_RUSH_LAYERS } from '../../src/data/layers.js';
import { sectorById } from '../../src/data/sectors.js';
import { createHeadlessGame } from '../__helpers__/headlessGame.js';
import { installDomStubs } from '../__helpers__/domStubs.js';

// Leaving a run for the menu left its pickups, chests and Overcharge in the
// pickup system, and the layer its drops use stayed the old run's until the
// next one's first layer started, which a head start's picks hold back
// (outside audit 8, verdict A5). The layer is the mode's first: a plain 1
// would be wrong in the Boss Rush.
describe('the pickups when a run ends', () => {
  beforeEach(() => {
    const restoreDom = installDomStubs();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
      vi.spyOn(console, m).mockImplementation(() => {});
    }
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.spyOn(Date, 'now').mockReturnValue(0);
    return restoreDom;
  });
  afterEach(() => {
    vi.useRealTimers();
    GamePools.releaseAll();
    vi.restoreAllMocks();
  });

  // A run on layer 12 with two pickups, a chest and an Overcharge on.
  const playedRun = (game) => {
    game.session.startNewRun({ source: 'test' });
    const { player, enemies, pickups } = game.services;
    player.setInvulnerableTimer(1e9);
    enemies.releaseAllAsteroidsToPool();
    enemies.waveManager.currentWave = 11;
    enemies.waveManager.waveInProgress = false;
    enemies.startNextWave();
    for (let i = 0; i < 60; i += 1) game.step();
    pickups.spawnPickup('repair', 300, 300);
    pickups.spawnPickup('salvage', 340, 300);
    pickups.chests.spawn('elite', 380, 300);
    pickups.collect({ kind: 'overcharge', x: 0, y: 0 });
  };
  const quit = (game) => {
    game.session.exitToMenu({ source: 'test' });
    vi.advanceTimersByTime(4000);
  };

  it('takes them off at the menu', () => {
    const game = createHeadlessGame();
    playedRun(game);
    const { pickups } = game.services;
    expect(pickups.pickups.length).toBeGreaterThan(0);
    quit(game);
    expect({
      pickups: pickups.pickups.length,
      chests: pickups.chests.list.length,
      overcharge: pickups.overchargeRemaining,
    }).toEqual({ pickups: 0, chests: 0, overcharge: 0 });
  });

  it.each([
    ['the Boss Rush', { bossRush: true }, BOSS_RUSH_LAYERS[0]],
    [
      'a sector with a head start',
      { sector: 'furnace-drift' },
      sectorById('furnace-drift').layers[0],
    ],
  ])('drops by the first layer of %s from its start', (_, start, first) => {
    const game = createHeadlessGame();
    playedRun(game);
    quit(game);
    game.session.startNewRun({ source: 'test', ...start });
    expect(game.services.pickups.layer).toBe(first);
  });

  it("drops by the next sector's first layer when a build is carried there", () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test', sector: 'salvage-lanes' });
    game.services.progression.level = 20;
    game.session.startNewRun({
      source: 'test',
      sector: 'furnace-drift',
      carry: true,
    });
    expect(game.services.pickups.layer).toBe(
      sectorById('furnace-drift').layers[0]
    );
  });
});
