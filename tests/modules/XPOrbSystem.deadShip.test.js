/**
 * Between the ship's death and the game over screen the field plays on, but
 * the wreck pulls in and collects no XP orb (as with pickups and hearts).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../__helpers__/headlessGame.js';

const DEATH_STEPS = 3 * 60;

describe('XPOrbSystem with the ship dead', () => {
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

  it('leaves an orb within the pull radius where it is', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    const { player, progression, world, 'xp-orbs': xpOrbs } = game.services;
    const { x, y } = player.getPosition();
    const orb = xpOrbs.createXPOrb(x + 60, y, 5);
    const experience = progression.totalExperience;

    world.handlePlayerDeath();
    for (let step = 0; step < DEATH_STEPS; step += 1) game.step();

    expect(progression.totalExperience).toBe(experience);
    expect(xpOrbs.getActiveOrbs()).toEqual([orb]);
    expect(orb).toMatchObject({ x: x + 60, y });
  });
});
