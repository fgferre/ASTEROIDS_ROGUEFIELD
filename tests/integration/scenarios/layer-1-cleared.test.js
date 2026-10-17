/**
 * An invulnerable pilot thrusts in a slow circle with auto-aim firing: the
 * first layer must get cleared (kills >= its asteroid count, layer 2 starts)
 * and wrapped asteroids must never drift outside the field.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
  keyEvent,
} from '../../__helpers__/headlessGame.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../src/core/GameConstants.js';

const MAX_STEPS = 90 * 60;
const SAMPLE_EVERY = 60;
// wrapScreenEdges lets an asteroid drift max(radius, 100) px past the field.
const WRAP_SLACK = 10;

describe('layer 1 scenario', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => {
    GamePools.releaseAll();
    restoreDom();
  });

  it('clears layer 1 within 90 s and keeps asteroids inside the field', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    const { player, enemies, input } = game.services;
    player.setInvulnerableTimer(1e9);
    input.onKeyDown(keyEvent('KeyW'));
    input.onKeyDown(keyEvent('KeyA'));

    const layerCount = enemies.getWaveState().totalAsteroids;
    expect(layerCount).toBeGreaterThan(0);

    let outOfBounds = null;
    let layer = enemies.waveManager.currentWave;
    for (let step = 1; step <= MAX_STEPS && layer < 2; step += 1) {
      game.step();
      layer = enemies.waveManager.currentWave;
      if (step % SAMPLE_EVERY !== 0) continue;
      for (const enemy of enemies.getActiveEnemies()) {
        if (enemy.type !== 'asteroid') continue;
        const r = Math.max(enemy.radius ?? 0, 100) + WRAP_SLACK;
        if (
          enemy.x < -r ||
          enemy.x > GAME_WIDTH + r ||
          enemy.y < -r ||
          enemy.y > GAME_HEIGHT + r
        ) {
          outOfBounds ??= { step, x: enemy.x, y: enemy.y, r };
        }
      }
    }

    expect(outOfBounds).toBeNull();
    expect(enemies.getSessionStats().totalKills).toBeGreaterThanOrEqual(
      layerCount
    );
    expect(layer).toBeGreaterThanOrEqual(2);
  });
});
