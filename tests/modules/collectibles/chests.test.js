import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import RandomService from '../../../src/core/RandomService.js';
import { LEVEL_UP_SCREEN_DELAY_SECONDS } from '../../../src/core/GameConstants.js';
import { CHEST } from '../../../src/data/pickups.js';
import { WEAPON_CARD_IDS } from '../../../src/data/upgrades/index.js';
import ProgressionSystem from '../../../src/modules/ProgressionSystem.js';
import { pickChestCard } from '../../../src/modules/collectibles/chestRewards.js';
import { createEventBusMock } from '../../__helpers__/mocks.js';
import {
  STEP_SECONDS,
  createHeadlessGame,
  installDomStubs,
} from '../../__helpers__/headlessGame.js';

const kill = (elite, type = 'drone') => ({
  enemy: { id: 'test-kill', type, elite, x: 200, y: 200 },
  position: { x: 200, y: 200 },
});

function startGame() {
  const game = createHeadlessGame();
  game.session.startNewRun({ source: 'test' });
  game.services.player.setInvulnerableTimer(1e9);
  return game;
}

// Only the pickups and the clock (with its slow motion) run: no XP, no
// level-up of its own.
function tick(game, seconds) {
  const steps = Math.ceil(seconds / STEP_SECONDS);
  for (let i = 0; i < steps; i += 1) {
    game.services.effects.update(STEP_SECONDS);
    game.services.pickups.update(STEP_SECONDS);
  }
}

function chestAtShip(game, tier) {
  const { x, y } = game.services.player.getPosition();
  return game.services.pickups.chests.spawn(tier, x, y);
}

function grantedCards(game) {
  const cards = [];
  game.eventBus.on('chest-card', (card) => cards.push(card));
  return cards;
}

const progressionAt = (level) => {
  const progression = new ProgressionSystem({
    random: new RandomService(11),
    eventBus: createEventBusMock(),
    player: {},
    ui: {},
    effects: {},
    'xp-orbs': { attachProgression: () => {} },
  });
  progression.level = level;
  return progression;
};

describe('chests', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    restoreDom();
    GamePools.releaseAll();
  });

  it('every Warden drops one, an Elite about one time in four, a plain kill never', () => {
    const game = startGame();
    const list = () => game.services.pickups.chests.list;

    for (let i = 0; i < 50; i += 1) {
      game.eventBus.emit('enemy-destroyed', kill(false));
    }
    expect(list()).toHaveLength(0);

    for (let i = 0; i < 6; i += 1) {
      game.eventBus.emit('boss-defeated', { position: { x: 400, y: 300 } });
    }
    expect(list().map(({ tier }) => tier)).toEqual(Array(6).fill('warden'));

    for (let i = 0; i < 400; i += 1) {
      game.eventBus.emit('enemy-destroyed', kill(true));
    }
    const elite = list().filter(({ tier }) => tier === 'elite').length;
    expect(elite).toBeGreaterThan(400 * CHEST.eliteChance * 0.7);
    expect(elite).toBeLessThan(400 * CHEST.eliteChance * 1.3);
  });

  it('a chest stays until touched: no magnet pulls it, it never expires', () => {
    const game = startGame();
    const { player, pickups } = game.services;
    const { x, y } = player.getPosition();
    const far = x > 400 ? 80 : 720;
    const chest = pickups.chests.spawn('elite', far, y);

    pickups.collect({ kind: 'magnet', x, y });
    for (let i = 0; i < 3 / STEP_SECONDS; i += 1) game.step();
    tick(game, 60);
    expect(pickups.chests.list).toEqual([chest]);
    expect(chest.state).toBe('closed');
    expect([chest.x, chest.y]).toEqual([far, y]);
  });

  it('opens on touch in slow motion with the ship safe, then grants an Elite 1 card, a Warden 3, a jackpot 5', () => {
    const game = startGame();
    const { pickups, player, effects, progression } = game.services;
    progression.level = 10;
    const cards = grantedCards(game);
    player.setInvulnerableTimer(0);

    chestAtShip(game, 'elite');
    tick(game, STEP_SECONDS);
    expect(effects.gameTime.timeDilation.holdScale).toBe(CHEST.slowScale);
    expect(player.invulnerableTimer).toBeGreaterThan(0.3);
    tick(game, 1);
    expect(cards).toHaveLength(1);

    vi.spyOn(pickups.chestRandom, 'chance').mockReturnValueOnce(false);
    chestAtShip(game, 'warden');
    tick(game, 2);
    expect(cards).toHaveLength(4);
    vi.restoreAllMocks();

    vi.spyOn(pickups.chestRandom, 'chance').mockReturnValueOnce(true);
    chestAtShip(game, 'warden');
    tick(game, 3);
    expect(cards).toHaveLength(9);
    expect(cards.slice(4).map(({ index, total }) => [index, total])).toEqual([
      [0, 5],
      [1, 5],
      [2, 5],
      [3, 5],
      [4, 5],
    ]);
    tick(game, CHEST.spentTime);
    expect(pickups.chests.list).toHaveLength(0);
  });

  it("waits out a Warden's arrival slow motion, then opens in its own", () => {
    const game = startGame();
    const { effects } = game.services;
    const arrival = { travel: 1.1, close: 0.25, world: 0.25, recover: 0.5 };
    const warden = { id: 'warden', x: 400, y: 84 };
    game.eventBus.emit('boss-spawned', {
      enemy: warden,
      position: { ...warden },
      arrival,
    });
    const chest = chestAtShip(game, 'elite');

    tick(game, arrival.travel);
    expect(chest.state).toBe('claimed');
    expect(effects.gameTime.timeDilation.holdScale).toBe(arrival.world);

    tick(game, arrival.close + arrival.recover + 0.05);
    expect(chest.state).toBe('opening');
    expect(effects.gameTime.timeDilation.holdScale).toBe(CHEST.slowScale);
  });

  it('a rank-up of an owned card first, then a new card of an owned family, else any card a level-up could offer', () => {
    const random = new RandomService(3);
    const progression = progressionAt(10);
    for (let i = 0; i < 40; i += 1) {
      const card = pickChestCard(progression, random);
      expect(card.cursed).toBe(false);
      expect(WEAPON_CARD_IDS).not.toContain(card.id);
    }

    progression.applyUpgrade('shield'); // field, rank 1 of 3
    progression.applyUpgrade('chain_capacitor'); // arc, its one rank
    for (let i = 0; i < 20; i += 1) {
      expect(pickChestCard(progression, random).id).toBe('shield');
    }

    progression.applyUpgrade('shield');
    progression.applyUpgrade('shield');
    for (let i = 0; i < 20; i += 1) {
      const card = pickChestCard(progression, random);
      expect(progression.getUpgradeCount(card.id)).toBe(0);
      expect(['field', 'arc']).toContain(card.family);
    }
  });

  it('waits while a card choice is queued or on screen, then opens', () => {
    const game = startGame();
    const { progression } = game.services;
    const cards = grantedCards(game);

    progression.collectXP(progression.experienceToNext);
    expect(progression.pendingLevelUpScreens).toHaveLength(1);
    const chest = chestAtShip(game, 'warden');
    tick(game, 1);
    expect(chest.state).toBe('claimed');

    progression.update(LEVEL_UP_SCREEN_DELAY_SECONDS + STEP_SECONDS);
    expect(progression.pendingUpgradeOptions.length).toBeGreaterThan(0);
    tick(game, 1);
    expect(chest.state).toBe('claimed');
    expect(cards).toHaveLength(0);

    progression.applyUpgrade(progression.pendingUpgradeOptions[0].id);
    tick(game, 0.5);
    expect(cards.length).toBeGreaterThan(0);

    // A card choice that comes up mid-grant holds the rest.
    progression.collectXP(progression.experienceToNext);
    expect(progression.pendingLevelUpScreens).toHaveLength(1);
    const held = cards.length;
    tick(game, 1);
    expect(cards).toHaveLength(held);
    progression.pendingLevelUpScreens.length = 0;
    tick(game, 1);
    expect(cards).toHaveLength(chest.cards);
  });
});
