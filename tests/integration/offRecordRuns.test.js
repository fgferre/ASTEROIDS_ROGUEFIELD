import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import { createHeadlessGame } from '../__helpers__/headlessGame.js';
import { installDomStubs } from '../__helpers__/domStubs.js';
import CodexService from '../../src/services/CodexService.js';
import { HANGAR_STORAGE_KEY } from '../../src/services/HangarService.js';
import { ACHIEVEMENTS_STORAGE_KEY } from '../../src/services/AchievementService.js';
import { deserialize, serialize } from '../../src/core/replay.js';
import { chooseSlot, resolveActiveSlot } from '../../src/core/storage.js';
import { BASTION_HULL_ID } from '../../src/data/shipModels.js';

let restoreDom;

beforeEach(() => {
  restoreDom = installDomStubs();
});
afterEach(() => {
  GamePools.releaseAll();
  restoreDom();
  resolveActiveSlot();
});

const savedKeys = (setItem) =>
  setItem.mock.calls
    .map(([key]) => key)
    .filter((key) => key.startsWith('roguefield:'));

describe('runs that keep no progress', () => {
  // A replayed run of 60 steps, from a 120-step recording.
  const playReplay = () => {
    const live = createHeadlessGame();
    live.session.startNewRun({ source: 'test' });
    for (let i = 0; i < 120; i += 1) live.step();
    const recording = deserialize(
      serialize(live.session.replayRecorder.toJSON())
    );
    const game = createHeadlessGame();
    game.controller.arm(recording);
    game.session.startNewRun({ source: 'test' });
    for (let i = 0; i < 60; i += 1) {
      game.controller.tick();
      game.step();
    }
    return game;
  };

  it('saves a Hangar purchase made after a replay', () => {
    const game = playReplay();
    const hangar = game.session.resolveServiceInstance('hangar');
    game.session.exitToMenu({ source: 'test' });
    hangar.salvage = 400;

    expect(hangar.buy('spare-capacitor')).toBe(true);
    const stored = JSON.parse(localStorage.getItem(HANGAR_STORAGE_KEY));
    expect(stored.owned['spare-capacitor']).toBe(true);
    expect(stored.salvage).toBe(hangar.salvage);
  });

  it('saves a setting the viewer changes during a replay', () => {
    const game = playReplay();
    const setItem = vi.spyOn(window.localStorage, 'setItem');
    game.services.settings.setSetting('gameplay', 'difficulty', 'pilot');
    expect(setItem.mock.calls.map(([key]) => key)).toContain(
      'astro:settings:v1'
    );
  });

  it('a demo scene writes no record, medal, Codex entry or Salvage', () => {
    // Survivor one run short of its medal (and its 50 Salvage).
    localStorage.setItem(
      ACHIEVEMENTS_STORAGE_KEY,
      JSON.stringify({ unlocked: {}, progress: { survivor: 9 } })
    );
    const game = createHeadlessGame({ seedSource: 'profile-harness' });
    const hangar = game.session.resolveServiceInstance('hangar');
    const codex = new CodexService({ eventBus: game.eventBus });
    const salvage = hangar.salvage;
    const setItem = vi.spyOn(window.localStorage, 'setItem');

    game.session.startNewRun({ source: 'test' });
    for (let i = 0; i < 60; i += 1) game.step();
    // What a layer-15 scene emits as it plays, then a quit from the pause.
    const { eventBus } = game;
    eventBus.emit('wave-started', { wave: 15 });
    eventBus.emit('boss-spawned', {
      enemy: { type: 'boss', bossKind: 'null' },
    });
    eventBus.emit('run-abandoned', { wave: 15, stats: { totalKills: 40 } });

    expect(savedKeys(setItem)).toEqual([]);
    expect(hangar.salvage).toBe(salvage);
    expect(hangar.achievements.unlocked.survivor).toBeUndefined();
    expect(codex.seen).toEqual({});
  });

  it('an empty pilot flies the default hull and leaves the shared settings as they were', () => {
    // Slot 1 owns the Bastion and picked it; the settings are everyone's.
    localStorage.setItem(
      'roguefield:hangar:v2',
      JSON.stringify({
        version: 2,
        salvage: 0,
        owned: { 'bastion-hull': true },
      })
    );
    localStorage.setItem(
      'astro:settings:v1',
      JSON.stringify({
        gameplay: { selectedHull: BASTION_HULL_ID, difficulty: 'pilot' },
        controls: { hullControl: 'modern' },
      })
    );
    expect(createHeadlessGame().session.getConfiguredHullId()).toBe(
      BASTION_HULL_ID
    );
    chooseSlot(2);
    resolveActiveSlot();
    const settings = localStorage.getItem('astro:settings:v1');

    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    for (let i = 0; i < 120; i += 1) game.step();
    game.session.exitToMenu({ source: 'test' });

    expect(game.session.getConfiguredHullId()).not.toBe(BASTION_HULL_ID);
    expect(localStorage.getItem('astro:settings:v1')).toBe(settings);
    expect(localStorage.getItem('roguefield:hangar:v2')).toContain(
      'bastion-hull'
    );
  });

  it('a demo scene on pilot 2 writes nothing to pilot 2 nor pilot 1', () => {
    chooseSlot(2);
    resolveActiveSlot();
    const game = createHeadlessGame({ seedSource: 'profile-harness' });
    const setItem = vi.spyOn(window.localStorage, 'setItem');
    game.session.startNewRun({ source: 'test' });
    for (let i = 0; i < 60; i += 1) game.step();
    game.eventBus.emit('wave-started', { wave: 15 });
    game.eventBus.emit('run-abandoned', {
      wave: 15,
      stats: { totalKills: 40 },
    });
    expect(savedKeys(setItem)).toEqual([]);
  });
});
