import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import { createHeadlessGame } from '../__helpers__/headlessGame.js';
import { installDomStubs } from '../__helpers__/domStubs.js';

// A Retry went on with the layer's draws from the run's first one: the root
// stream and the enemies', waves' and rewards' scopes were sent back to their
// seeds (outside audit 8, verdict A9). They now go on from where they stood at
// the death; a rock's or a boss's own stream is not part of this.
describe("a Retry goes on with the layer's draws", () => {
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

  // A run played 20 s, its ship invulnerable, then killed.
  const playToDeath = () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    game.services.player.setInvulnerableTimer(1e9);
    game.services.progression.experienceToNext = 1e9;
    for (let i = 0; i < 1200; i += 1) game.step();
    game.services.player.setInvulnerableTimer(0);
    game.services.world.handlePlayerDeath();
    return game;
  };
  const retry = (game) => {
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
  const positions = (scopes) =>
    Object.fromEntries(
      Object.entries(scopes).map(([name, stream]) => [
        name,
        stream.serialize().state,
      ])
    );
  // The layer's streams: the run's root, the enemies' scopes (spawn,
  // variants, fragments, rewards, movement, the wave manager's) and the
  // wave manager's own.
  const layerStreams = (game) => {
    const scopes = game.services.enemies.enemyRandom;
    return {
      root: game.services.random.serialize().state,
      enemies: positions(scopes.randomScopes),
      waves: positions(scopes.waveManager.waveRandom.randomScopes),
    };
  };

  it('puts every one back where it stood at the death', () => {
    const game = playToDeath();
    const atDeath = layerStreams(game);
    retry(game);
    expect(layerStreams(game)).toEqual(atDeath);
  });

  it('gives the same Retry for the same death', () => {
    const field = (game) => ({
      streams: layerStreams(game),
      enemies: game.services.enemies.asteroids
        .filter((e) => e && !e.destroyed)
        .map((e) => [e.type, e.x.toFixed(6), e.y.toFixed(6), e.health]),
      ship: [game.services.player.position.x, game.services.player.position.y],
    });
    const play = () => {
      const game = playToDeath();
      retry(game);
      game.services.player.setInvulnerableTimer(1e9);
      for (let i = 0; i < 600; i += 1) game.step();
      return field(game);
    };
    const first = play();
    GamePools.releaseAll();
    expect(play()).toEqual(first);
  });
});
