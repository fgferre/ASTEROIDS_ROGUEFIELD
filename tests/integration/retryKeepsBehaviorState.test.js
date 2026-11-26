import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import {
  freezeSpawner,
  spawnViaFactory,
} from '../../src/bootstrap/contentScene.js';
import { createHeadlessGame } from '../__helpers__/headlessGame.js';
import { installDomStubs } from '../__helpers__/domStubs.js';

// A Retry brings back what a Leech has eaten and a Shade's hiding: measured
// before (outside audit 8, verdict A8), a fed Leech lost its meal (58 XP of
// orbs at its death without a Retry, 45 after one) and grew its base radius
// at each Retry, and a phased Shade came back solid at once.
describe('a Retry keeps what its behaviors hold', () => {
  beforeEach(() => {
    const restoreDom = installDomStubs();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
      vi.spyOn(console, m).mockImplementation(() => {});
    }
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.spyOn(Date, 'now').mockReturnValue(0);
    return restoreDom;
  });
  afterEach(() => {
    vi.useRealTimers();
    GamePools.releaseAll();
    vi.restoreAllMocks();
  });

  const newGame = () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    const { player, enemies } = game.services;
    player.setInvulnerableTimer(1e9);
    enemies.releaseAllAsteroidsToPool();
    freezeSpawner(enemies.waveManager);
    return game;
  };
  const alive = (game, type) =>
    game.services.enemies.asteroids.find(
      (e) => e && !e.destroyed && e.type === type
    );
  // The real path: the death, the seconds the field plays on, the end
  // screen, the Retry and its countdown.
  const retry = (game) => {
    game.services.player.setInvulnerableTimer(0);
    game.services.world.handlePlayerDeath();
    for (let i = 0; i < 180; i += 1) game.step();
    vi.advanceTimersByTime(3000);
    const flow = game.session.retry;
    flow.retryCountElement = { textContent: '1', isConnected: true };
    flow.retryCountdownElement = {
      textContent: '',
      isConnected: true,
      classList: { add() {}, remove() {} },
    };
    expect(flow.requestRetry({ source: 'test' })).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(game.session.getScreen()).toBe('playing');
  };

  it('brings back what a Leech has eaten, and keeps its base size', () => {
    const game = newGame();
    const { enemies, 'xp-orbs': orbs } = game.services;
    spawnViaFactory(enemies, 'leech', { x: 120, y: 120 });
    for (let i = 0; i < 6; i += 1) orbs.createXPOrb(150 + i * 12, 130, 10);
    let leech = alive(game, 'leech');
    for (let i = 0; i < 900 && !(leech.eaten > 0); i += 1) {
      game.step();
      leech = alive(game, 'leech');
    }
    expect(leech.eaten).toBeGreaterThan(0);
    const fed = {
      eaten: leech.eaten,
      stored: [...leech.stored],
      meals: leech.meals,
      healthGain: leech.healthGain,
      baseRadius: leech.baseRadius,
      radius: leech.radius,
      maxHealth: leech.maxHealth,
    };

    retry(game);

    const back = alive(game, 'leech');
    expect({
      eaten: back.eaten,
      stored: back.stored,
      meals: back.meals,
      healthGain: back.healthGain,
      baseRadius: back.baseRadius,
      radius: back.radius,
      maxHealth: back.maxHealth,
    }).toEqual(fed);
  });

  it('keeps a phased Shade hidden', () => {
    const game = newGame();
    spawnViaFactory(game.services.enemies, 'shade', { x: 200, y: 150 });
    let shade = alive(game, 'shade');
    for (let i = 0; i < 1200 && shade.phase !== 'phased'; i += 1) {
      game.step();
      shade = alive(game, 'shade');
    }
    expect(shade.phase).toBe('phased');
    const hidden = {
      phase: shade.phase,
      phaseTimer: shade.phaseTimer,
      intangible: shade.intangible,
      flankSide: shade.flankSide,
      flankAngle: shade.flankAngle,
    };

    retry(game);

    const back = alive(game, 'shade');
    expect({
      phase: back.phase,
      phaseTimer: back.phaseTimer,
      intangible: back.intangible,
      flankSide: back.flankSide,
      flankAngle: back.flankAngle,
    }).toEqual(hidden);
  });
});
