import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../__helpers__/headlessGame.js';

// The run's moments for the end screens, in the run's session stats.
describe('run timeline', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    restoreDom();
    GamePools.releaseAll();
  });

  it('records evolutions, Apex, Warden kills, the best combo and the death in order', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    const { enemies, progression, world } = game.services;
    const at = (seconds) => {
      enemies.sessionStats.timeElapsed = seconds;
    };

    progression.level = 5; // every thermal card unlocked
    at(40);
    ['heat_sink', 'plasma', 'afterburn_lance'].forEach((id) =>
      progression.applyUpgrade(id)
    );
    at(60);
    progression.incrementCombo();
    progression.incrementCombo();
    at(90);
    game.eventBus.emit('boss-arrived', { enemyId: 'w1' });
    at(138);
    game.eventBus.emit('boss-defeated', {
      enemy: { id: 'w1', displayName: 'Warden Prime' },
    });
    at(150);
    ['reactor_bleed', 'thermal_lens'].forEach((id) =>
      progression.applyUpgrade(id)
    );
    // A retry re-sends the synergies it re-applies: kept once.
    game.eventBus.emit('synergy-unlocked', { family: 'thermal' });
    at(200);
    progression.resetCombo({ force: true, silent: true });
    for (let i = 0; i < 5; i += 1) progression.incrementCombo();
    at(260);
    world.handlePlayerDeath();

    const timeline = world.buildRunSummary().stats.timeline;
    expect(timeline.map(({ kind }) => kind)).toEqual([
      'evolution',
      'warden',
      'apex',
      'combo',
      'death',
    ]);
    expect(timeline.map(({ time }) => time)).toEqual([40, 138, 150, 200, 260]);
    expect(timeline[0]).toMatchObject({
      family: 'thermal',
      layer: 1,
      weaponId: 'lance',
      name: 'Incendiary Lance',
    });
    expect(timeline[1]).toMatchObject({ name: 'Warden Prime', fight: 48 });
    expect(timeline[3].combo).toBe(5);
  });

  it('names an evolution by the weapon held when it happened', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    const { world } = game.services;

    game.eventBus.emit('synergy-unlocked', { family: 'thermal' });
    game.eventBus.emit('upgrade-weapon', { weaponId: 'furnace-corona' });
    game.eventBus.emit('apex-unlocked', { family: 'thermal' });

    const timeline = world.buildRunSummary().stats.timeline;
    expect(timeline.map(({ name, weaponId }) => [name, weaponId])).toEqual([
      ['Incendiary Lance', 'lance'],
      ['Sunheart', 'furnace-corona'],
    ]);
  });
});
