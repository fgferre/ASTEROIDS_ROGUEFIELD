/**
 * Children born on the kill that would close a layer (a Husk's Motes, a
 * Splitter's Motes) belong to that layer: it stays open until they die too.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getContent } from '../../../src/content/registry.js';
import { GamePools } from '../../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../../__helpers__/headlessGame.js';

const SPAWN_STEPS = 10 * 60;

/** Layer 7 whose whole plan is one `kind` (its role): no rocks, surges or events. */
function layerOfOne(kind) {
  const [role] = getContent('enemies', kind).roles;
  const game = createHeadlessGame();
  game.session.startNewRun({ source: 'test' });
  const { player, enemies } = game.services;
  player.setInvulnerableTimer(1e9);
  const wm = enemies.waveManager;
  enemies.releaseAllAsteroidsToPool();
  vi.spyOn(wm, 'layerDirector').mockReturnValue({
    ...wm.layerDirector(7),
    roster: [{ role, count: 1, from: 0, every: 1, elite: 0 }],
    surges: [],
    events: [],
    herald: null,
    modifier: null,
    rocks: 0,
  });
  wm.currentWave = 6;
  wm.waveInProgress = false;
  wm.settleRocks();
  wm.startNextWave();

  let last = null;
  for (let step = 0; step < SPAWN_STEPS && !last; step += 1) {
    game.step();
    last = enemies.getActiveEnemies().find((e) => e.type === kind);
  }
  return { game, enemies, wm, last };
}

const shoot = (enemies, enemy) =>
  enemies.applyDamage(enemy, 1e9, {
    source: { hitPosition: { x: enemy.x + 5, y: enemy.y } },
  });

describe('death-spawned children hold the layer', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    GamePools.releaseAll();
    restoreDom();
    vi.restoreAllMocks();
  });

  it.each([
    ['husk', []],
    ['ram', ['splitter']],
  ])('the last %s dies: its Motes keep the layer open', (kind, affixes) => {
    const { game, enemies, wm, last } = layerOfOne(kind);
    last.resetAffixes(affixes);

    shoot(enemies, last);
    const motes = enemies
      .getActiveEnemies()
      .filter((e) => e.alive && e.spawnedBy === last.id);
    expect(motes.length).toBeGreaterThan(0);
    game.step();
    expect(wm.waveInProgress).toBe(true);
    expect(wm.totalEnemiesThisWave).toBe(1 + motes.length);

    for (const mote of motes) shoot(enemies, mote);
    expect(wm.waveInProgress).toBe(false);
    expect(wm.currentWave).toBe(7);
  });
});
