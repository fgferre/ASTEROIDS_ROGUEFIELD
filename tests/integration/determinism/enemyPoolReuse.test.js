/**
 * Which pooled enemy the next spawn gets is decided by pool housekeeping
 * (GamePools.autoManageAll, on the wall clock in the game): an enemy taken
 * from the pool again must be the same, field by field, as a new one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import { listContent } from '../../../src/content/registry.js';
import { AFFIX_IDS } from '../../../src/data/enemies/affixes.js';
import {
  freezeSpawner,
  spawnViaFactory,
} from '../../../src/bootstrap/contentScene.js';
import { createHeadlessGame } from '../../__helpers__/headlessGame.js';
import { installDomStubs } from '../../__helpers__/domStubs.js';

const KINDS = ['asteroid', ...listContent('enemies').map((item) => item.id)];
const FIRST_LIFE_STEPS = 90;
const MAX_KILL_STEPS = 600;

const placeOf = (index) => ({
  x: 120 + (index % 6) * 140,
  y: 120 + Math.floor(index / 6) * 180,
});
const poolOf = (kind) =>
  kind === 'asteroid' ? GamePools.asteroids : GamePools.enemyPools.get(kind);

// Every own field, at depth: the system and functions left out, a loop back
// to an object already seen written as such.
function fields(enemy) {
  const seen = new WeakSet();
  return JSON.parse(
    JSON.stringify(enemy, (key, value) => {
      if (key === 'system' || typeof value === 'function') return undefined;
      if (typeof value === 'number' && !Number.isFinite(value)) {
        return String(value);
      }
      if (value && typeof value === 'object') {
        if (seen.has(value)) return '[seen]';
        seen.add(value);
        if (value instanceof Map) return [...value.entries()];
        if (value instanceof Set) return [...value];
      }
      return value;
    })
  );
}

// Each kind's first life with every option on (an Elite with every affix,
// marked as a Warden's minion the way boss/minions.js does), flown, shot at
// and killed back into the pool; then each kind spawned plain again, from
// the pool (`fresh` false) or as a new object (`fresh` true).
function secondLives(fresh) {
  const game = createHeadlessGame();
  const { player, enemies } = game.services;
  game.session.startNewRun({ source: 'test' });
  player.setInvulnerableTimer(1e9);
  enemies.releaseAllAsteroidsToPool();
  freezeSpawner(enemies.waveManager);

  KINDS.forEach((kind, index) => {
    const enemy = spawnViaFactory(enemies, kind, {
      ...placeOf(index),
      elite: true,
      affixes: AFFIX_IDS,
    });
    enemy.addTag('minion');
    enemy.spawnSource = 'boss-minion';
    enemy.spawnedByBossId = 'boss-1';
    enemy.isBossMinion = true;
    enemy.metadata = { spawnSource: 'boss-minion', spawnedByBossId: 'boss-1' };
  });
  for (let step = 0; step < FIRST_LIFE_STEPS; step += 1) game.step();

  // Frontal hits until nothing is left (fuses, fragments and Motes too).
  for (let step = 0; step < MAX_KILL_STEPS; step += 1) {
    const alive = [];
    enemies.forEachActiveEnemy((enemy) => alive.push(enemy));
    if (!alive.length) break;
    for (const enemy of alive) {
      enemies.applyDamage(enemy, 1e6, {
        cause: 'test',
        source: { hitPosition: player.position },
      });
    }
    game.step();
  }

  if (fresh) KINDS.forEach((kind) => poolOf(kind).clear());
  return KINDS.map((kind, index) => {
    const pool = poolOf(kind);
    const reused = pool.objectUsage.has(pool.available.at(-1));
    const enemy = spawnViaFactory(enemies, kind, placeOf(index));
    return { kind, reused, fields: fields(enemy) };
  });
}

describe('enemy pool reuse', () => {
  beforeEach(() => {
    const restoreDom = installDomStubs();
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.spyOn(Date, 'now').mockReturnValue(0);
    return restoreDom;
  });
  afterEach(() => vi.restoreAllMocks());

  it('spawns a reused enemy of every kind the same as a new one', () => {
    const reused = secondLives(false);
    const fresh = secondLives(true);

    expect(reused.map(({ kind, reused: used }) => [kind, used])).toEqual(
      KINDS.map((kind) => [kind, true])
    );
    const byKind = (lives) =>
      lives.map(({ kind, fields: own }) => ({ kind, ...own }));
    expect(byKind(reused)).toEqual(byKind(fresh));
  });
});
