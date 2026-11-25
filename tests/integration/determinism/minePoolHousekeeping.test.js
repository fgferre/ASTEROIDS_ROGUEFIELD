/**
 * Pool housekeeping (GamePools.autoManageAll, on the wall clock in the game)
 * decides which pooled mine the next spawn gets: a run's outcome must not
 * depend on when it ran, so a reused mine behaves like a new one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import {
  freezeSpawner,
  spawnViaFactory,
} from '../../../src/bootstrap/contentScene.js';
import { createHeadlessGame } from '../../__helpers__/headlessGame.js';
import { installDomStubs } from '../../__helpers__/domStubs.js';

const FAR = [
  { x: 60, y: 60 },
  { x: 900, y: 60 },
  { x: 60, y: 660 },
  { x: 900, y: 660 },
  { x: 480, y: 60 },
  { x: 480, y: 660 },
];
const STEPS = 240;
// After the garbage collector's own first pass (step 1), which then finds
// the pool idle and leaves it.
const FIRST_MINES_STEP = 10;
const SECOND_MINE_STEP = 120;

// Six mines far off empty the pool; a seventh arms beside the ship, goes off
// (about step 40) and goes back to it. Housekeeping at step 20 grows the pool
// under that used mine, at step 100 over it: the mine spawned beside the ship
// at step 120 is then the used one or a new one.
function playMines(housekeepingStep) {
  const game = createHeadlessGame();
  const { player, enemies } = game.services;
  // Both plays start from the same new mines in the pool.
  const minePool = GamePools.enemyPools.get('mine');
  minePool.clear();
  minePool.expand(5);
  game.session.startNewRun({ source: 'test' });
  player.setInvulnerableTimer(1e9);
  enemies.releaseAllAsteroidsToPool();
  freezeSpawner(enemies.waveManager);

  // Out of reach of the ship's guns: they go off only by themselves.
  const mine = (at) => {
    spawnViaFactory(enemies, 'mine', at).health = 1e6;
  };
  const onShip = () => ({ x: player.position.x + 40, y: player.position.y });

  for (let step = 1; step <= STEPS; step += 1) {
    if (step === housekeepingStep) GamePools.autoManageAll();
    if (step === FIRST_MINES_STEP) {
      FAR.forEach(mine);
      mine(onShip());
    }
    if (step === SECOND_MINE_STEP) mine(onShip());
    game.step();
  }

  const mines = [];
  enemies.forEachActiveEnemy((enemy) =>
    mines.push(`${enemy.type},${enemy.x},${enemy.y},${enemy.health}`)
  );
  return { ...game.snapshot(), health: player.health, mines: mines.sort() };
}

describe('mine pool housekeeping', () => {
  beforeEach(() => {
    const restoreDom = installDomStubs();
    // The wall clock stands still: housekeeping runs only where a play asks.
    vi.spyOn(performance, 'now').mockReturnValue(0);
    return restoreDom;
  });
  afterEach(() => vi.restoreAllMocks());

  it('ends the same whether housekeeping ran before or after a mine went back to the pool', () => {
    const early = playMines(20);
    const late = playMines(100);

    expect(late).toEqual(early);
  });
});
