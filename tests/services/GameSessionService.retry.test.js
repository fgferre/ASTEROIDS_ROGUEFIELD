/**
 * Retry rewinds the run to the moment of death: the layer picks up with the
 * field and counts it had then (and still completes once that field is
 * cleared), and the build is the one the ship died with, however many times
 * it retries.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../__helpers__/headlessGame.js';

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
  for (let step = 0; step < DEATH_STEPS; step += 1) game.step();
  vi.advanceTimersByTime(3000);
  expect(game.session.getScreen()).toBe('gameover');

  game.session.retryCountElement = { textContent: '1', isConnected: true };
  game.session.retryCountdownElement = {
    textContent: '',
    isConnected: true,
    classList: { add() {}, remove() {} },
  };
  expect(game.session.requestRetry({ source: 'test' })).toBe(true);
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
