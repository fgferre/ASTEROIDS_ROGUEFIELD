// The bot at the controls of a headless game (src/bootstrap/botPilotAdapter.js).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import {
  createBotDriver,
  readWorld,
} from '../../src/bootstrap/botPilotAdapter.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../__helpers__/headlessGame.js';
import { sectorById } from '../../src/data/sectors.js';

describe('bot driver', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    GamePools.releaseAll();
    restoreDom();
  });

  it("takes a sector's head start by its card policy and flies the ship", () => {
    const game = createHeadlessGame();
    const { services, eventBus } = game;
    const driver = createBotDriver({ services, eventBus, preset: 'good' });
    game.session.startNewRun({ source: 'test', sector: 'dense-core' });
    for (let frame = 0; frame < 14 * 60; frame += 1) {
      driver.step();
      game.step();
    }
    expect(driver.cards).toHaveLength(sectorById('dense-core').headStart);
    expect(services.enemies.waveManager.currentWave).toBe(6);
    const { x, y } = services.player.position;
    expect(Math.hypot(x - 400, y - 300)).toBeGreaterThan(20);

    const world = readWorld(services, 6);
    expect(world.ship.health).toBeGreaterThan(0);
    expect(world.movers.some((m) => m.kind === 'rock')).toBe(true);
  });
});
