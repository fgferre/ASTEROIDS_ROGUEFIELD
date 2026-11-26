/**
 * Retry rewinds the run to the moment of death: the layer picks up with the
 * field and counts it had then (and still completes once that field is
 * cleared), and the build is the one the ship died with, however many times
 * it retries.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import { createHeadlessGame } from '../__helpers__/headlessGame.js';
import { installDomStubs } from '../__helpers__/domStubs.js';

const LAYER_STEPS = 90 * 60;
const DEATH_STEPS = 3 * 60;

function clearField(enemies) {
  enemies.getActiveEnemies().forEach((enemy) => {
    if (enemy.type === 'asteroid') {
      enemies.destroyAsteroid(enemy, { createFragments: false });
    } else {
      enemy.takeDamage(1e9);
    }
  });
}

// Dies, plays out the death until the game over screen, then retries. The
// retry count and countdown live in the DOM, absent here.
function dieAndRetry(game) {
  game.services.world.handlePlayerDeath();
  retryDeadShip(game);
}

function retryDeadShip(game) {
  for (let step = 0; step < DEATH_STEPS; step += 1) game.step();
  vi.advanceTimersByTime(3000);
  expect(game.session.getScreen()).toBe('gameover');

  // A run has one Retry; this test grants each of its two.
  game.session.retry.setRetryCount(1);
  game.session.retry.retryCountdownElement = {
    textContent: '',
    isConnected: true,
    classList: { add() {}, remove() {} },
  };
  expect(game.session.retry.requestRetry({ source: 'test' })).toBe(true);
  vi.advanceTimersByTime(3000);
  expect(game.session.getScreen()).toBe('playing');
}

function readBuild({ player, combat, 'xp-orbs': xpOrbs }) {
  return {
    maxHealth: player.maxHealth,
    damage: player.damage,
    maxSpeed: player.maxSpeed,
    magnetismRadius: player.magnetismRadius,
    orbPull: xpOrbs.getMagnetismForce(),
    orbReach: xpOrbs.getMagnetismRadius(),
    shootCooldown: combat.weapons.shootCooldown,
  };
}

describe('retry after death', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    GamePools.releaseAll();
    restoreDom();
    vi.restoreAllMocks();
  });

  it('completes the layer once the field held at death is cleared', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    const { player, enemies } = game.services;
    const waveManager = enemies.waveManager;
    player.setInvulnerableTimer(1e9);
    const completed = [];
    game.eventBus.on('wave-complete', (payload) => completed.push(payload));
    const warn = vi.spyOn(console, 'warn');

    // Clear layer 1 until it has nothing left to spawn (its rocks, the
    // Rockfall): the ship then dies with the last spawns on the field.
    for (
      let step = 0;
      step < LAYER_STEPS &&
      (waveManager.rocksPending() || waveManager.layerSchedule.length > 0);
      step += 1
    ) {
      clearField(enemies);
      game.step();
    }
    expect(waveManager.layerSchedule).toHaveLength(0);
    expect(enemies.getActiveEnemyCount()).toBeGreaterThan(0);

    dieAndRetry(game);
    player.setInvulnerableTimer(1e9);
    expect(enemies.getActiveEnemyCount()).toBeGreaterThan(0);
    for (
      let step = 0;
      step < LAYER_STEPS && completed.length === 0;
      step += 1
    ) {
      clearField(enemies);
      game.step();
    }

    expect(completed.map(({ wave }) => wave)).toEqual([1]);
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('Accounting discrepancy')
    );
  });

  // The blast goes off between the enemy's death and its kill being counted:
  // the death snapshot must count that kill, or the layer stays one short.
  it.each([
    [
      'a Volatile rock',
      ({ enemies }, at) => {
        const rock = enemies.acquireAsteroid({
          size: 'small',
          variant: 'volatile',
          wave: 1,
          vx: 0,
          vy: 0,
          ...at,
        });
        enemies.registerActiveEnemy(rock);
        return rock;
      },
    ],
    [
      'a Tether',
      ({ enemies }, at) => {
        const mine = enemies.acquireEnemyViaFactory('mine', { wave: 1, ...at });
        enemies.waveManager.registerDynamicMinion(mine);
        return mine;
      },
    ],
  ])('completes the layer after %s blew up the ship', (_, place) => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    const { player, enemies } = game.services;
    const waveManager = enemies.waveManager;
    player.setInvulnerableTimer(1e9);
    const completed = [];
    game.eventBus.on('wave-complete', (payload) => completed.push(payload));

    for (
      let step = 0;
      step < LAYER_STEPS &&
      (waveManager.rocksPending() || waveManager.layerSchedule.length > 0);
      step += 1
    ) {
      clearField(enemies);
      game.step();
    }

    const enemy = place(game.services, {
      x: player.position.x + 10,
      y: player.position.y,
    });
    player.setInvulnerableTimer(0);
    player.health = 1;
    enemies.applyDamage(enemy, 1e6);
    expect(player.isDead).toBe(true);

    retryDeadShip(game);
    player.setInvulnerableTimer(1e9);
    for (
      let step = 0;
      step < LAYER_STEPS && completed.length === 0;
      step += 1
    ) {
      clearField(enemies);
      game.step();
    }

    expect(completed.map(({ wave }) => wave)).toEqual([1]);
  });

  it('keeps the build the ship died with across two retries, at full hull', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    const { progression, player } = game.services;
    progression.level = 5;
    for (const id of [
      'shield',
      'magfield',
      'shield',
      'plasma',
      'magfield',
      'propulsors',
      'heat_sink',
    ]) {
      expect(progression.applyUpgrade(id)).toBe(true);
    }
    const build = readBuild(game.services);

    dieAndRetry(game);
    expect(readBuild(game.services)).toEqual(build);
    expect(player.health).toBe(build.maxHealth);

    dieAndRetry(game);
    expect(readBuild(game.services)).toEqual(build);
    expect(player.health).toBe(build.maxHealth);
  });
});

// The Retries left were read back from the game over screen's text, so a run
// without that screen (or with its text rewritten) had none, or more
// (outside audit 8, verdict A7): the session keeps the number.
describe('the Retries left', () => {
  beforeEach(() => {
    const restoreDom = installDomStubs();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    return restoreDom;
  });
  afterEach(() => {
    vi.useRealTimers();
    GamePools.releaseAll();
    vi.restoreAllMocks();
  });

  it('are the session number, whatever the screen shows', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    expect(game.session.retry.getRetryCount()).toBe(1);
    game.session.retry.retryCountElement = {
      textContent: '7',
      isConnected: true,
    };
    expect(game.session.retry.getRetryCount()).toBe(1);
  });
});
