/**
 * `?content=<id>` on a live (headless) run, for every item of the registry:
 * the scene composes without a warning, shows the item, and the game keeps
 * running for a second.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  composeContentScene,
  spawnViaFactory,
} from '../../src/bootstrap/contentScene.js';
import { listContent } from '../../src/content/registry.js';
import { GamePools } from '../../src/core/GamePools.js';
import UPGRADE_LIBRARY from '../../src/data/upgrades/index.js';
import {
  createHeadlessGame,
  installDomStubs,
  keyEvent,
} from '../__helpers__/headlessGame.js';

const STEPS = 60;

function activeEnemies(enemies) {
  const found = [];
  enemies.forEachActiveEnemy((enemy) => found.push(enemy));
  return found;
}

const idsOf = (kind) => listContent(kind).map((item) => [item.id, item]);
// The cards a run can offer: the cards folder and the weapon cards.
const catalogCards = UPGRADE_LIBRARY.map((card) => [card.id, card]);
const getItem = (kind, id) => listContent(kind).find((item) => item.id === id);
const typesOf = (enemies) => enemies.map((enemy) => enemy.type);
const countType = (enemies, type) =>
  enemies.filter((enemy) => enemy.type === type).length;

describe('content scene on a live run', () => {
  let restoreDom;
  let game;

  // A fresh game on a started run. Booting it warns; the scenes must not.
  function startRun() {
    game = createHeadlessGame();
    // The app's service map has the bus; the headless one lists only the
    // simulation services.
    game.services['event-bus'] = game.eventBus;
    game.session.startNewRun({ source: 'test' });
    console.warn.mockClear();
  }

  beforeEach(() => {
    restoreDom = installDomStubs();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    startRun();
  });
  afterEach(() => {
    GamePools.releaseAll();
    vi.useRealTimers();
    restoreDom();
    vi.restoreAllMocks();
  });

  // Composes the scene, reads what stands in the field, then plays STEPS
  // frames. Returns the services and the first look.
  function play(kind, item, extra = {}) {
    const scene = { kind, id: item.id, item, count: 1, fire: false, ...extra };
    composeContentScene({ scene, services: game.services });
    const { enemies, combat, player, progression } = game.services;
    const first = {
      enemies: activeEnemies(enemies).map(({ type, x, displayName }) => ({
        type,
        x,
        displayName,
      })),
      weaponId: combat.weaponId,
      hullId: player.currentHull?.id,
      cardRank: progression.getUpgradeCount(item.id),
    };
    for (let step = 0; step < STEPS; step += 1) game.step();

    expect(console.warn).not.toHaveBeenCalled();
    expect(player.health).toBeGreaterThan(0);
    expect(progression.level).toBe(1);
    return { services: game.services, first };
  }

  describe.each(idsOf('enemies'))('enemy %s', (id, item) => {
    it('stands in front of the ship', () => {
      const { first } = play('enemies', item);

      expect(typesOf(first.enemies)).toEqual([id]);
      expect(first.enemies[0].x).toBeGreaterThan(300);
    });

    it('comes in a group with count', () => {
      const { first } = play('enemies', item, { count: 12 });

      expect(countType(first.enemies, id)).toBe(12);
    });
  });

  it('spawns 300 Motes and keeps running', () => {
    const { first } = play('enemies', getItem('enemies', 'drone'), {
      count: 300,
    });

    expect(countType(first.enemies, 'drone')).toBe(300);
  });

  it('holds fire at an enemy unless fire=1', () => {
    const drone = getItem('enemies', 'drone');

    const quiet = play('enemies', drone);
    expect(quiet.services.combat.bullets).toHaveLength(0);

    startRun();
    const loud = play('enemies', drone, { fire: true });
    expect(loud.services.combat.bullets.length).toBeGreaterThan(0);
  });

  describe.each(idsOf('bosses'))('boss %s', (id, item) => {
    it('stands in the field alone, the ship holding fire', () => {
      const { first, services } = play('bosses', item);
      const bosses = first.enemies.filter((enemy) =>
        ['boss', 'herald'].includes(enemy.type)
      );

      expect(bosses).toHaveLength(1);
      expect(bosses[0].displayName).toBe(item.displayName);
      expect(countType(first.enemies, 'asteroid')).toBe(0);
      expect(services.combat.bullets).toHaveLength(0);
    });

    it("shows the boss's layer in the HUD, not layer 1", () => {
      const { services } = play('bosses', item);
      const { enemies } = services;

      expect(enemies.waveState.current).toBe(enemies.waveManager.currentWave);
      expect(enemies.waveState.current).toBeGreaterThan(1);
    });
  });

  describe.each(idsOf('weapons'))('weapon %s', (id, item) => {
    it('is the ship weapon, with rocks and Motes ahead', () => {
      const { first } = play('weapons', item);

      expect(first.weaponId).toBe(id);
      expect(countType(first.enemies, 'asteroid')).toBe(6);
      expect(countType(first.enemies, 'drone')).toBe(3);
    });
  });

  describe.each(idsOf('hulls'))('hull %s', (id, item) => {
    it('is the ship hull, with three rocks ahead', () => {
      const { first } = play('hulls', item);

      expect(first.hullId).toBe(id);
      expect(countType(first.enemies, 'asteroid')).toBe(3);
    });
  });

  describe.each(catalogCards)('card %s', (id, item) => {
    it('is applied, with rocks and Motes ahead', () => {
      const { first } = play('cards', item);

      expect(first.cardRank).toBe(1);
      expect(countType(first.enemies, 'asteroid')).toBe(6);
      expect(countType(first.enemies, 'drone')).toBe(3);
    });
  });

  describe.each(idsOf('stages'))('stage %s', (id, item) => {
    it('plays the layer, its spawner running', () => {
      const { services } = play('stages', item);
      const { waveManager } = services.enemies;

      expect(waveManager.currentWave).toBe(item.order);
      expect(waveManager.waveInProgress).toBe(true);
      expect(Object.hasOwn(waveManager, 'update')).toBe(false);
    });
  });

  describe('leaving to the menu', () => {
    const drone = () => getItem('enemies', 'drone');

    // Esc > Quit to menu > Start, in the same tab.
    function leaveAndStartAgain() {
      game.session.exitToMenu({ source: 'test' });
      game.session.startNewRun({ source: 'test' });
    }

    it('gives the next run its spawner back', () => {
      play('enemies', drone());
      leaveAndStartAgain();
      const { enemies } = game.services;
      for (let step = 0; step < 600; step += 1) game.step();

      expect(Object.hasOwn(enemies.waveManager, 'update')).toBe(false);
      expect(Object.hasOwn(enemies.waveManager, 'updateRockTrickle')).toBe(
        false
      );
      expect(countType(activeEnemies(enemies), 'asteroid')).toBeGreaterThan(0);
    });

    it('gives the next run its shooting back', () => {
      play('enemies', drone());
      leaveAndStartAgain();
      const { enemies, combat, player } = game.services;
      spawnViaFactory(enemies, 'drone', {
        x: player.position.x + 250,
        y: player.position.y,
      });
      for (let step = 0; step < STEPS; step += 1) game.step();

      expect(combat.bullets.length).toBeGreaterThan(0);
    });

    it('leaves the ship of the next run free to move', () => {
      play('enemies', drone());
      leaveAndStartAgain();
      const { input, player } = game.services;
      const frame = () => {
        game.step();
        vi.advanceTimersByTime(16);
      };

      // Not put back at the scene's spot (x = 120) while the pilot holds still.
      player.position.x = 600;
      for (let step = 0; step < 10; step += 1) frame();
      expect(player.position.x).toBeGreaterThan(550);

      const before = player.position.x;
      input.onKeyDown(keyEvent('KeyD'));
      for (let step = 0; step < 30; step += 1) frame();
      input.onKeyUp(keyEvent('KeyD'));
      expect(player.position.x).toBeGreaterThan(before + 20);
    });

    it('is back to normal after a Warden scene too', () => {
      play('bosses', getItem('bosses', 'dust'));
      leaveAndStartAgain();
      const { enemies, combat } = game.services;

      expect(Object.hasOwn(enemies.waveManager, 'update')).toBe(false);
      expect(Object.hasOwn(combat.weapons, 'handleShooting')).toBe(false);
      expect(enemies.waveState.current).toBe(1);
    });
  });
});
