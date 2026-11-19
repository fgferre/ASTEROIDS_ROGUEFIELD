/**
 * The Flight Computer's briefing is read once: a build carried into the next
 * sector, or restored by a retry, flies modern at once (it used to fall back
 * to the classic glide for good, the card already spent).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../../__helpers__/headlessGame.js';

function takeFlightComputer(progression) {
  const take = (id, level) => {
    const definition = progression.upgradeLookup.get(id);
    definition.prerequisites
      ?.filter((need) => need.type === 'upgrade')
      .forEach((need) => take(need.id, need.level ?? 1));
    while (progression.getUpgradeCount(id) < level) {
      if (!progression.applyUpgrade(id)) throw new Error(`cannot take ${id}`);
    }
  };
  progression.level = 20;
  take('flight_computer', 1);
}

describe('modern flight after the Flight Computer briefing', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => {
    GamePools.releaseAll();
    restoreDom();
  });

  function engagedGame() {
    const game = createHeadlessGame();
    const { player, progression } = game.services;
    game.session.startNewRun({ source: 'test', sector: 'debris-wake' });
    takeFlightComputer(progression);
    game.eventBus.emit('modern-flight-engaged');
    expect(player.controlScheme).toBe('modern');
    return game;
  }

  it('keeps it into the next sector', () => {
    const game = engagedGame();
    const { player } = game.services;
    game.session.startNewRun({
      source: 'test',
      sector: 'salvage-lanes',
      carry: true,
    });
    expect(player.controlScheme).toBe('modern');
    expect(player.flight.glide).toBe(false);
  });

  it('keeps it through a retry', () => {
    const game = engagedGame();
    const { player } = game.services;
    const snapshot = game.session.snapshots.createDeathSnapshot();
    player.reset();
    expect(player.controlScheme).toBe('classic');
    game.session.snapshots.restoreFromSnapshot({ snapshot });
    expect(player.controlScheme).toBe('modern');
    expect(player.flight.glide).toBe(false);
  });
});
