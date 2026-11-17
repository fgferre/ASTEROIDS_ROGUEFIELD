/**
 * The level-up card draw follows the run's seed: another seed offers other
 * cards, the same seed the same cards, in a fresh game or a later run of the
 * same session.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../__helpers__/headlessGame.js';

let restoreDom;
beforeEach(() => {
  restoreDom = installDomStubs();
});
afterEach(() => {
  GamePools.releaseAll();
  restoreDom();
});

function offersOfRun(game, seed) {
  game.services.difficulty.runSeed = seed;
  game.session.startNewRun({ source: 'test' });
  const { progression } = game.services;
  return [2, 3, 4, 5, 6].map((level) =>
    progression
      .prepareUpgradeOptions(3, { level })
      .options.map(({ id }) => id)
      .join('+')
  );
}

describe('level-up offers follow the run seed', () => {
  it('the same seed offers the same cards, in another game too', () => {
    expect(offersOfRun(createHeadlessGame(), 1)).toEqual(
      offersOfRun(createHeadlessGame(), 1)
    );
  });

  it('another seed offers other cards', () => {
    expect(offersOfRun(createHeadlessGame(), 1)).not.toEqual(
      offersOfRun(createHeadlessGame(), 2)
    );
  });

  it('runs of one session with different seeds differ, and a seed repeats', () => {
    const game = createHeadlessGame();
    const first = offersOfRun(game, 1);
    expect(offersOfRun(game, 2)).not.toEqual(first);
    expect(offersOfRun(game, 1)).toEqual(first);
  });
});
