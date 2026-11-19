/**
 * A sector's first layer opens on its own plan: the rocks its layer director
 * asks for, born at that layer (the seven sectors deeper than layer 1 used to
 * open with layer 1's six rocks, the first born at layer 1's health).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import { SECTORS } from '../../../src/data/sectors.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../../__helpers__/headlessGame.js';

const PICK_STEPS = 60 * 120;

let restoreDom;
beforeEach(() => {
  restoreDom = installDomStubs();
});
afterEach(() => {
  GamePools.releaseAll();
  restoreDom();
});

// The first card offered, each time, until the head start lets the layer in.
function openFirstLayer(game) {
  const { enemies, progression } = game.services;
  for (let step = 0; step < PICK_STEPS; step += 1) {
    if (enemies.waveManager.currentWave > 0) return;
    game.step();
    const id = game.takeOfferedUpgrade();
    if (id) progression.applyUpgrade(id);
  }
}

describe("a sector's first layer", () => {
  it.each(SECTORS.map((sector) => [sector.id, sector.layers[0]]))(
    '%s opens layer %i on its own rock plan',
    (id, layer) => {
      const game = createHeadlessGame();
      game.session.startNewRun({ source: 'test', sector: id });
      openFirstLayer(game);
      const waves = game.services.enemies.waveManager;
      expect(waves.currentWave).toBe(layer);
      expect(waves.rocksTotal).toBe(waves.layerDirector(layer).rocks);
      expect(waves.rockLayer).toBe(layer);
    }
  );
});
