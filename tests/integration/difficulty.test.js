/**
 * The difficulty preset reaches each entry point of a real headless run:
 * enemy health at spawn, damage to the player, XP and the layer's spawn
 * counts. Veteran is the unscaled game.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../__helpers__/headlessGame.js';
import { DIFFICULTY_PRESETS } from '../../src/data/difficulty.js';

function startRun(difficulty) {
  const game = createHeadlessGame();
  game.services.settings.setSetting('gameplay', 'difficulty', difficulty);
  game.session.startNewRun({ source: 'test' });
  return game;
}

function firstRock(game) {
  for (let step = 0; step < 600; step += 1) {
    const rock = game.services.enemies
      .getAsteroids()
      .find((enemy) => enemy.type === 'asteroid');
    if (rock) {
      return {
        size: rock.size,
        variant: rock.variant,
        x: rock.x,
        y: rock.y,
        radius: rock.radius,
        maxHealth: rock.maxHealth,
        health: rock.health,
      };
    }
    game.step();
  }
  throw new Error('no rock spawned in 10 s');
}

describe('difficulty presets in a headless run', () => {
  let restoreDom;

  beforeEach(() => {
    restoreDom = installDomStubs();
  });

  afterEach(() => {
    GamePools.releaseAll();
    restoreDom();
  });

  it('Warden raises the first rock’s health ×1.3 and changes nothing else about it', () => {
    const veteran = firstRock(startRun('veteran'));
    const warden = firstRock(startRun('warden'));

    expect(warden.maxHealth).toBe(Math.round(veteran.maxHealth * 1.3));
    expect(warden.health).toBe(warden.maxHealth);
    const { maxHealth: _a, health: _b, ...vetRest } = veteran;
    const { maxHealth: _c, health: _d, ...wardenRest } = warden;
    expect(wardenRest).toEqual(vetRest);
  });

  it('scales damage taken, XP and the layer’s spawn count by the preset', () => {
    const measure = (difficulty) => {
      const game = startRun(difficulty);
      const { player, progression, enemies } = game.services;
      for (let step = 0; !enemies.waveManager.waveInProgress; step += 1) {
        if (step > 600) throw new Error('layer 1 never started');
        game.step();
      }
      const before = player.health;
      player.takeDamage(10);
      return {
        damage: before - player.health,
        xp: progression.collectXP(20).gained,
        rocks: enemies.waveState.totalAsteroids,
      };
    };
    const veteran = measure('veteran');
    const pilot = measure('pilot');
    const warden = measure('warden');

    expect(veteran.damage).toBe(10);
    expect(pilot.damage).toBeCloseTo(10 * DIFFICULTY_PRESETS.pilot.enemyDamage);
    expect(warden.damage).toBeCloseTo(
      10 * DIFFICULTY_PRESETS.warden.enemyDamage
    );
    expect(veteran.xp).toBe(20);
    expect(warden.xp).toBe(Math.round(20 * DIFFICULTY_PRESETS.warden.xp));
    expect(warden.rocks).toBe(Math.round(veteran.rocks * 1.15));
    expect(pilot.rocks).toBe(Math.round(veteran.rocks * 0.85));
  });
});
