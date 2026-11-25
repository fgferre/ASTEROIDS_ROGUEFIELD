/**
 * A retry rewinds the field's rewards to the moment of death: shots still in
 * flight while the ship lies wrecked kill enemies that the retry brings back,
 * so what those kills dropped (orbs, pickups, chests) and rolled must go, and
 * the Overcharge left keeps the time it had. Leaving to the menu clears the
 * pickups.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import { createHeadlessGame } from '../../__helpers__/headlessGame.js';
import { installDomStubs } from '../../__helpers__/domStubs.js';

const DEATH_STEPS = 3 * 60;

function readRewards({ combat, healthHearts, pickups, 'xp-orbs': xpOrbs }) {
  return {
    orbs: xpOrbs.getActiveOrbs().map(({ x, y, value }) => ({ x, y, value })),
    hearts: healthHearts.hearts.map(({ x, y }) => ({ x, y })),
    pickups: pickups.pickups.map(({ kind, x, y }) => ({ kind, x, y })),
    chests: pickups.chests.list.map(({ tier, x, y }) => ({ tier, x, y })),
    overcharge: pickups.overchargeRemaining,
    cardRolls: combat.cards.cardRolls,
  };
}

// An elite rock of 1 HP just ahead of each shot in flight: the shots kill
// them after the death.
function plantInShotPaths({ combat, enemies }) {
  combat.bullets.slice(0, 4).forEach((bullet) => {
    const rock = enemies.acquireAsteroid({
      size: 'small',
      wave: 1,
      vx: 0,
      vy: 0,
      x: bullet.x + bullet.vx * 0.05,
      y: bullet.y + bullet.vy * 0.05,
    });
    enemies.registerActiveEnemy(rock);
    rock.health = 1;
    rock.elite = true;
  });
}

describe('death snapshot of the field rewards', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    GamePools.releaseAll();
    restoreDom();
    vi.restoreAllMocks();
  });

  it('puts back the rewards held at death on a retry', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    const { player, progression, pickups, combat } = game.services;
    player.setInvulnerableTimer(1e9);
    progression.level = 10;
    ['chain_capacitor', 'lucky_fragment'].forEach((id) =>
      expect(progression.applyUpgrade(id)).toBe(true)
    );
    pickups.rockDropChance = 1;
    for (let i = 0; i < 10 * 60; i += 1) game.step();
    for (let i = 0; i < 120 && combat.bullets.length < 3; i += 1) game.step();
    pickups.collect({ kind: 'overcharge', x: 0, y: 0 });

    plantInShotPaths(game.services);
    game.services.world.handlePlayerDeath();
    const atDeath = readRewards(game.services);
    for (let i = 0; i < DEATH_STEPS; i += 1) game.step();
    const window = readRewards(game.services);
    expect(window.orbs.length).toBeGreaterThan(atDeath.orbs.length);
    expect(window.chests.length).toBeGreaterThan(atDeath.chests.length);
    expect(window.cardRolls).toBeGreaterThan(atDeath.cardRolls);
    expect(window.overcharge).toBeLessThan(atDeath.overcharge);

    vi.advanceTimersByTime(3000);
    expect(game.session.getScreen()).toBe('gameover');
    game.session.retry.retryCountElement = { textContent: '1', isConnected: true };
    game.session.retry.retryCountdownElement = {
      textContent: '',
      isConnected: true,
      classList: { add() {}, remove() {} },
    };
    expect(game.session.retry.requestRetry({ source: 'test' })).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(game.session.getScreen()).toBe('playing');

    expect(readRewards(game.services)).toEqual(atDeath);
  });

  it('ends an Overcharge started after the snapshot when it is put back', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    const { pickups, combat } = game.services;
    const snapshot = pickups.getSnapshotState();
    expect(snapshot.overchargeRemaining).toBe(0);

    pickups.collect({ kind: 'overcharge', x: 0, y: 0 });
    expect(combat.cards.cooldownTuning).toBeLessThan(1);

    pickups.restoreSnapshotState(snapshot);
    expect(pickups.overchargeRemaining).toBe(0);
    expect(combat.cards.cooldownTuning).toBe(1);
  });
});
