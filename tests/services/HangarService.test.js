import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';
import { GamePools } from '../../src/core/GamePools.js';
import { PROGRESSION_UPGRADE_REROLLS_PER_RUN } from '../../src/core/GameConstants.js';
import { createHeadlessGame } from '../__helpers__/headlessGame.js';
import { installDomStubs } from '../__helpers__/domStubs.js';
import { holdProgress } from '../../src/core/storage.js';
import HangarService, {
  HANGAR_STORAGE_KEY,
  HANGAR_STORAGE_KEY_V1,
} from '../../src/services/HangarService.js';
import {
  LICENSES,
  PILOT_TRACK,
  SALVAGE_PER_CARD_CACHE,
  STARTING_DRAW,
} from '../../src/data/hangar.js';
import { ACHIEVEMENTS } from '../../src/data/achievements.js';
import UPGRADE_LIBRARY from '../../src/data/upgrades/index.js';
import {
  BASTION_HULL_ID,
  DEFAULT_HULL_ID,
  SOLAR_SLICER_HULL_ID,
} from '../../src/data/shipModels.js';

const atRate = (salvage) => ({
  getModifiers: () => ({ salvage }),
  setPressure: () => {},
  getPressure: () => 0,
  getDifficulty: () => 'veteran',
});

const base = {
  difficulty: atRate(1),
  achievements: { getEntries: () => [] },
};

const summary = (layer, kills) => ({
  wave: { current: layer },
  stats: { totalKills: kills },
});

describe('HangarService', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => {
    GamePools.releaseAll();
    restoreDom();
  });

  const stock = (salvage, owned = {}) =>
    localStorage.setItem(
      HANGAR_STORAGE_KEY,
      JSON.stringify({ salvage, owned })
    );

  it('pays 10 per layer and 1 per 5 kills, a retried run only its difference', () => {
    const eventBus = new EventBus();
    const hangar = new HangarService({
      ...base,
      eventBus,
      difficulty: atRate(1),
    });
    const awarded = [];
    eventBus.on('salvage-awarded', ({ amount }) => awarded.push(amount));

    eventBus.emit('game-started', {});
    eventBus.emit('player-died', summary(9, 47));
    expect(hangar.lastAward).toEqual({
      amount: 99,
      total: 99,
      multiplier: 1,
      difficulty: 'Veteran',
      medals: 0,
    });

    eventBus.emit('player-died', summary(11, 60)); // after a retry
    expect(hangar.lastAward).toEqual({
      amount: 122,
      total: 122,
      multiplier: 1,
      difficulty: 'Veteran',
      medals: 0,
    });
    expect(awarded).toEqual([99, 23]);
  });

  it('pays each Salvage Cache card with the run, at its rate', () => {
    const eventBus = new EventBus();
    const hangar = new HangarService({ ...base, eventBus });
    eventBus.emit('game-started', {});
    eventBus.emit('card-salvage', {});
    eventBus.emit('card-salvage', {});
    eventBus.emit('player-died', summary(0, 0));
    expect(hangar.lastAward.amount).toBe(2 * SALVAGE_PER_CARD_CACHE);
  });

  it('pays a quit from the pause menu its cleared layers and kills, once', () => {
    const eventBus = new EventBus();
    const hangar = new HangarService({
      ...base,
      eventBus,
      difficulty: atRate(1),
    });
    const awarded = [];
    eventBus.on('salvage-awarded', ({ amount }) => awarded.push(amount));

    eventBus.emit('game-started', {});
    eventBus.emit('run-abandoned', summary(9, 47));
    expect(hangar.salvage).toBe(89);
    eventBus.emit('run-abandoned', summary(9, 47));
    expect(awarded).toEqual([89]);

    // A quit in the first layer pays its kills only; a death there, the layer.
    eventBus.emit('game-started', {});
    eventBus.emit('run-abandoned', summary(1, 12));
    expect(hangar.lastAward.amount).toBe(2);
    eventBus.emit('game-started', {});
    eventBus.emit('player-died', summary(1, 12));
    expect(hangar.lastAward.amount).toBe(12);
  });

  it('pays nothing for a replay that is quit', () => {
    const eventBus = new EventBus();
    const hangar = new HangarService({
      ...base,
      eventBus,
      difficulty: atRate(1),
    });

    holdProgress(true);
    eventBus.emit('game-started', {});
    eventBus.emit('run-abandoned', summary(9, 47));
    expect(hangar.salvage).toBe(0);
  });

  it('pays a sector run the layers it played and its victory', () => {
    const eventBus = new EventBus();
    const hangar = new HangarService({
      ...base,
      eventBus,
      difficulty: atRate(1),
    });

    eventBus.emit('game-started', { sector: 'dense-core' });
    eventBus.emit('run-won', { wave: 10, sector: 'dense-core' });
    eventBus.emit('screen-changed', {
      screen: 'victory',
      data: summary(10, 50),
    });
    expect(hangar.lastAward.amount).toBe(5 * 10 + 10 + 150);
  });

  it('adds each Salvage Cache picked up to the run', () => {
    const eventBus = new EventBus();
    const hangar = new HangarService({
      ...base,
      eventBus,
      difficulty: atRate(2),
    });
    eventBus.emit('game-started', {});
    eventBus.emit('pickup-collected', { kind: 'salvage' });
    eventBus.emit('pickup-collected', { kind: 'magnet' });
    eventBus.emit('pickup-collected', { kind: 'salvage' });
    eventBus.emit('player-died', summary(3, 0));
    expect(hangar.lastAward.amount).toBe((30 + 2 * 10) * 2);

    eventBus.emit('game-started', {});
    eventBus.emit('player-died', summary(3, 0));
    expect(hangar.lastAward.amount).toBe(30 * 2);
  });

  it('adds 150 for a victory and 25 per endless layer', () => {
    const eventBus = new EventBus();
    const hangar = new HangarService({
      ...base,
      eventBus,
      difficulty: atRate(1),
    });
    eventBus.emit('game-started', {});
    eventBus.emit('run-won', { wave: 15 });
    eventBus.emit('screen-changed', {
      screen: 'victory',
      data: summary(15, 0),
    });
    expect(hangar.salvage).toBe(150 + 150);

    eventBus.emit('player-died', summary(18, 0));
    expect(hangar.salvage).toBe(180 + 150 + 3 * 25);
  });

  it('pays a Boss Rush clear 15 per Warden plus 150, not the layer-15 pay', () => {
    const eventBus = new EventBus();
    const hangar = new HangarService({
      ...base,
      eventBus,
      difficulty: atRate(1),
    });
    eventBus.emit('game-started', { bossRush: true });
    [5, 10, 15].forEach((wave) => eventBus.emit('boss-defeated', { wave }));
    eventBus.emit('run-won', { wave: 15 });
    eventBus.emit('screen-changed', {
      screen: 'victory',
      data: summary(15, 40),
    });
    expect(hangar.salvage).toBe(3 * 15 + 150);
  });

  it('pays a Boss Rush death per Warden felled, then a normal run pays by layer again', () => {
    const eventBus = new EventBus();
    const hangar = new HangarService({
      ...base,
      eventBus,
      difficulty: atRate(1),
    });
    eventBus.emit('game-started', { bossRush: true });
    eventBus.emit('boss-defeated', { wave: 5 });
    eventBus.emit('player-died', summary(10, 40)); // died at the second Warden
    expect(hangar.salvage).toBe(15);

    eventBus.emit('game-started', { bossRush: false });
    eventBus.emit('boss-defeated', { wave: 5 });
    eventBus.emit('player-died', summary(9, 47));
    expect(hangar.salvage).toBe(15 + 99);
  });

  it("pays a replayed run nothing, then the viewer's own run in full", () => {
    stock(40);
    const eventBus = new EventBus();
    const hangar = new HangarService({
      ...base,
      eventBus,
      difficulty: atRate(1),
    });
    const awarded = [];
    eventBus.on('salvage-awarded', ({ amount }) => awarded.push(amount));

    holdProgress(true);
    eventBus.emit('game-started', {});
    eventBus.emit('player-died', summary(9, 47));
    expect(hangar.salvage).toBe(40);
    expect(hangar.lastAward).toEqual({
      amount: 0,
      total: 40,
      multiplier: 1,
      medals: 0,
    });
    expect(JSON.parse(localStorage.getItem(HANGAR_STORAGE_KEY)).salvage).toBe(
      40
    );

    holdProgress(true);
    eventBus.emit('game-started', {});
    eventBus.emit('run-won', { wave: 15 });
    eventBus.emit('screen-changed', {
      screen: 'victory',
      data: summary(15, 0),
    });
    expect(hangar.salvage).toBe(40);

    holdProgress(false);
    eventBus.emit('game-started', {});
    eventBus.emit('player-died', summary(9, 47));
    expect(hangar.salvage).toBe(40 + 99);
    expect(awarded).toEqual([99]);
  });

  it('scales the payout by the difficulty salvage multiplier', () => {
    const eventBus = new EventBus();
    const hangar = new HangarService({
      ...base,
      eventBus,
      difficulty: atRate(1.3),
    });
    eventBus.emit('game-started', {});
    eventBus.emit('player-died', summary(9, 47)); // 99 at Veteran
    expect(hangar.lastAward).toEqual({
      amount: 129,
      total: 129,
      multiplier: 1.3,
      difficulty: 'Veteran',
      medals: 0,
    });
  });

  it('buys once with enough Salvage and persists through storage', () => {
    stock(200);
    const eventBus = new EventBus();
    const hangar = new HangarService({ ...base, eventBus });
    const bought = [];
    eventBus.on('hangar-purchased', ({ id }) => bought.push(id));

    expect(hangar.buy('salvage-magnet')).toBe(true);
    expect(hangar.buy('salvage-magnet')).toBe(false);
    expect(hangar.buy('reinforced-plating')).toBe(false); // 0 left
    expect(bought).toEqual(['salvage-magnet']);

    const next = new HangarService({ ...base, eventBus: new EventBus() });
    expect(next.salvage).toBe(0);
    expect(next.owned).toEqual({ 'salvage-magnet': true });
  });

  it('tells the menu whether a first purchase is made, or within reach', () => {
    const state = (salvage, owned) => {
      stock(salvage, owned);
      return new HangarService({
        ...base,
        eventBus: new EventBus(),
      }).purchaseState();
    };
    expect(state(119)).toEqual({ bought: false, affordable: false });
    expect(state(120)).toEqual({ bought: false, affordable: true });
    expect(state(0, { 'reinforced-plating': true })).toEqual({
      bought: true,
      affordable: false,
    });
  });

  it('turns owned items into run modifiers and gates the bought hulls', () => {
    const none = new HangarService({ ...base, eventBus: new EventBus() });
    expect(none.getModifiers()).toMatchObject({
      hullMultiplier: 1,
      extraRerolls: 0,
      extraBanishes: 0,
      dashCooldownMultiplier: 1,
      pickupRadiusMultiplier: 1,
    });
    expect(none.hullFor(SOLAR_SLICER_HULL_ID)).toBe(DEFAULT_HULL_ID);
    expect(none.hullFor(BASTION_HULL_ID)).toBe(DEFAULT_HULL_ID);

    stock(0, {
      'reinforced-plating': true,
      'spare-capacitor': true,
      'field-ledger': true,
      'dash-coils': true,
      'salvage-magnet': true,
      'solar-slicer-hull': true,
      'bastion-hull': true,
    });
    const all = new HangarService({ ...base, eventBus: new EventBus() });
    expect(all.getModifiers()).toMatchObject({
      hullMultiplier: 1.05,
      extraRerolls: 1,
      extraBanishes: 1,
      dashCooldownMultiplier: 0.9,
      pickupRadiusMultiplier: 1.15,
    });
    expect(all.hullFor(SOLAR_SLICER_HULL_ID)).toBe(SOLAR_SLICER_HULL_ID);
    expect(all.hullFor(BASTION_HULL_ID)).toBe(BASTION_HULL_ID);
  });

  it('applies owned items at run start in the booted game', () => {
    stock(0, { 'reinforced-plating': true, 'spare-capacitor': true });
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    const { player, progression } = game.services;

    expect(player.maxHealth).toBe(105);
    expect(player.health).toBe(105);
    expect(progression.rerollsLeft).toBe(
      PROGRESSION_UPGRADE_REROLLS_PER_RUN + 1
    );
  });

  describe('medals and Pressure', () => {
    const medal = (id, reward, unlockedAt = '2026-11-01T00:00:00.000Z') => ({
      id,
      reward,
      unlockedAt,
    });
    const withMedals = (entries) => ({ getEntries: () => entries });
    const pressureAt = (initial = 0) => {
      const difficulty = {
        ...atRate(1),
        rung: initial,
        setPressure: vi.fn((rung) => {
          difficulty.rung = rung;
        }),
        getPressure: () => difficulty.rung,
      };
      return difficulty;
    };
    const stockV2 = (extra) =>
      localStorage.setItem(
        HANGAR_STORAGE_KEY,
        JSON.stringify({ salvage: 0, owned: {}, ...extra })
      );
    const saved = () => JSON.parse(localStorage.getItem(HANGAR_STORAGE_KEY));
    const openRung = (open, selected, difficulty = pressureAt(selected)) => {
      stockV2({ pressure: { open, selected, best: 0 } });
      const eventBus = new EventBus();
      const hangar = new HangarService({
        ...base,
        eventBus,
        difficulty,
      });
      return { eventBus, hangar, difficulty };
    };

    it('moves a v1 save to v2 with nothing lost, leaving the v1 key alone', () => {
      const v1 = JSON.stringify({
        salvage: 75,
        owned: { 'dash-coils': true, 'retired-item': true },
      });
      localStorage.setItem(HANGAR_STORAGE_KEY_V1, v1);
      const hangar = new HangarService({
        ...base,
        eventBus: new EventBus(),
      });
      expect(hangar.salvage).toBe(75);
      expect(hangar.owned).toEqual({
        'dash-coils': true,
        'retired-item': true,
      });
      expect(hangar.pressure).toEqual({ open: 0, selected: 0, best: 0 });
      expect(localStorage.getItem(HANGAR_STORAGE_KEY)).toBeNull();

      hangar.persist();
      expect(saved()).toMatchObject({
        version: 2,
        salvage: 75,
        owned: { 'dash-coils': true, 'retired-item': true },
      });
      expect(localStorage.getItem(HANGAR_STORAGE_KEY_V1)).toBe(v1);
    });

    it('pays the medals an old save already holds once, at load', () => {
      localStorage.setItem(
        HANGAR_STORAGE_KEY_V1,
        JSON.stringify({ salvage: 10, owned: {} })
      );
      const achievements = withMedals([
        medal('first-light', { salvage: 25 }),
        medal('ring-breaker', { license: 'deflector_shield' }),
        medal('deep-field', { salvage: 250 }, null),
      ]);
      const first = new HangarService({
        ...base,
        eventBus: new EventBus(),
        achievements,
      });
      expect(first.salvage).toBe(35);
      expect(first.licenses).toEqual({ deflector_shield: true });
      expect(first.medalsPaid).toEqual({
        'first-light': true,
        'ring-breaker': true,
      });

      const second = new HangarService({
        ...base,
        eventBus: new EventBus(),
        achievements,
      });
      expect(second.salvage).toBe(35);
      expect(second.licenses).toEqual({ deflector_shield: true });
    });

    it('pays a medal unlocked in play once and counts it in the run award', () => {
      const eventBus = new EventBus();
      const hangar = new HangarService({
        ...base,
        eventBus,
        achievements: withMedals([]),
      });
      eventBus.emit('game-started', {});
      eventBus.emit('achievement-unlocked', { id: 'first-light' });
      eventBus.emit('achievement-unlocked', { id: 'first-light' });
      expect(hangar.salvage).toBe(25);

      eventBus.emit('player-died', summary(3, 0));
      expect(hangar.lastAward.medals).toBe(25);
      expect(hangar.lastAward.total).toBe(25 + 30);
      expect(saved().medalsPaid).toEqual({ 'first-light': true });
    });

    it('opens rung 1 with First Victory, refuses a rung above the open one, flies the saved rung', () => {
      const eventBus = new EventBus();
      const hangar = new HangarService({
        ...base,
        eventBus,
        achievements: withMedals([]),
      });
      expect(hangar.setPressure(1)).toBe(false);

      eventBus.emit('achievement-unlocked', { id: 'first-victory' });
      expect(hangar.salvage).toBe(100);
      expect(hangar.pressure.open).toBe(1);
      expect(hangar.setPressure(2)).toBe(false);
      expect(hangar.setPressure(1)).toBe(true);
      expect(saved().pressure.selected).toBe(1);

      const { difficulty } = openRung(3, 2);
      expect(difficulty.setPressure).toHaveBeenCalledWith(2);
    });

    it('opens the next rung on a win at the highest open one, caps at 5', () => {
      const { eventBus, hangar, difficulty } = openRung(2, 2);
      eventBus.emit('run-won', { wave: 15 });
      expect(hangar.pressure).toEqual({ open: 3, selected: 2, best: 2 });
      expect(saved().pressure).toEqual({ open: 3, selected: 2, best: 2 });

      difficulty.rung = 1;
      eventBus.emit('run-won', { wave: 15 });
      expect(hangar.pressure).toEqual({ open: 3, selected: 2, best: 2 });

      difficulty.rung = 5;
      hangar.pressure.open = 5;
      eventBus.emit('run-won', { wave: 15 });
      expect(hangar.pressure).toMatchObject({ open: 5, best: 5 });
    });

    it('counts nothing for a win in Boss Rush, a replay, or on a rung not yet open', () => {
      const { eventBus, hangar, difficulty } = openRung(2, 2);
      eventBus.emit('game-started', { bossRush: true });
      eventBus.emit('run-won', { wave: 15 });
      holdProgress(true);
      eventBus.emit('game-started', {});
      eventBus.emit('run-won', { wave: 15 });
      holdProgress(false);
      eventBus.emit('game-started', {});
      difficulty.rung = 4;
      eventBus.emit('run-won', { wave: 15 });
      expect(hangar.pressure).toEqual({ open: 2, selected: 2, best: 0 });
    });
  });

  describe('control and licences', () => {
    const open = (salvage) => {
      stock(salvage);
      const eventBus = new EventBus();
      return { eventBus, hangar: new HangarService({ ...base, eventBus }) };
    };

    it('sells a reroll rung only after the one before it; owned rungs add up', () => {
      const { hangar } = open(1000);
      expect(hangar.buy('reroll-2')).toBe(false);
      expect(hangar.salvage).toBe(1000);
      expect(hangar.buy('reroll-1')).toBe(true);
      expect(hangar.buy('reroll-2')).toBe(true);
      expect(hangar.salvage).toBe(400);
      expect(hangar.getModifiers().extraRerolls).toBe(2);
    });

    it('holds the Flight School until the First Victory medal is paid', () => {
      const { eventBus, hangar } = open(1000);
      const school = hangar
        .getControlItems()
        .find((i) => i.id === 'flight-school');
      expect(school.lock).toEqual({ medal: 'First Victory' });
      expect(hangar.buy('flight-school')).toBe(false);

      eventBus.emit('achievement-unlocked', { id: 'first-victory' });
      expect(hangar.lockOf(school)).toBeNull();
      expect(hangar.buy('flight-school')).toBe(true);
    });

    it('buys a licence once, switched on; the switch survives a reload', () => {
      const { hangar } = open(500);
      expect(hangar.buyLicense('shard_halo')).toBe(true);
      expect(hangar.buyLicense('shard_halo')).toBe(false);
      expect(hangar.salvage).toBe(175);
      expect(hangar.getLicenses().find((l) => l.id === 'shard_halo').on).toBe(
        true
      );

      expect(hangar.setLicenseOn('shard_halo', false)).toBe(true);
      const again = new HangarService({ ...base, eventBus: new EventBus() });
      const held = again.getLicenses().find((l) => l.id === 'shard_halo');
      expect(held).toMatchObject({ owned: true, on: false });
      again.setLicenseOn('shard_halo', true);
      expect(again.licensesOff).toEqual({});
    });

    it('refuses to switch a licence it does not hold', () => {
      const { hangar } = open(500);
      expect(hangar.setLicenseOn('shard_halo', false)).toBe(false);
      expect(hangar.licensesOff).toEqual({});
    });

    it('lists the eleven licences on sale, then the seven medals pay', () => {
      const { eventBus, hangar } = open(0);
      const list = hangar.getLicenses();
      expect(list.slice(0, 11).every((l) => l.cost && !l.medal)).toBe(true);
      expect(list.slice(11)).toHaveLength(7);
      expect(list.slice(11).every((l) => l.medal && !l.owned)).toBe(true);

      eventBus.emit('achievement-unlocked', { id: 'ring-breaker' });
      const paid = hangar
        .getLicenses()
        .find((l) => l.id === 'deflector_shield');
      expect(paid).toMatchObject({ owned: true, on: true });
    });
  });

  describe('the contract the card draw reads', () => {
    const open = (salvage, owned = {}) => {
      stock(salvage, owned);
      const eventBus = new EventBus();
      return { eventBus, hangar: new HangarService({ ...base, eventBus }) };
    };

    it('places every card once: starting draw, a licence, the track or a fallback', () => {
      const medalLicenses = ACHIEVEMENTS.map((a) => a.reward?.license).filter(
        Boolean
      );
      const places = [
        ...STARTING_DRAW,
        ...LICENSES.map((l) => l.id),
        ...medalLicenses,
        ...PILOT_TRACK,
        ...UPGRADE_LIBRARY.filter((card) => card.fallback).map((c) => c.id),
      ];
      expect(new Set(places).size).toBe(places.length);
      expect([...places].sort()).toEqual(
        UPGRADE_LIBRARY.map((card) => card.id).sort()
      );
    });

    it('opens only the starting draw with nothing bought, nothing extra', () => {
      const { hangar } = open(0);
      expect(hangar.getModifiers()).toMatchObject({
        openCards: new Set(STARTING_DRAW),
        sealed: new Set(),
        holds: 0,
        startingCard: null,
      });
    });

    it('opens a licensed card while it is on, and closes it when off', () => {
      const { hangar } = open(500);
      hangar.buyLicense('shard_halo');
      expect(hangar.getModifiers().openCards.has('shard_halo')).toBe(true);
      hangar.setLicenseOn('shard_halo', false);
      expect(hangar.getModifiers().openCards.has('shard_halo')).toBe(false);
    });

    it('seals open cards up to the Seal rungs owned, and keeps them', () => {
      const { hangar } = open(0, { 'seal-1': true });
      expect(hangar.toggleSeal('shard_halo')).toBe(false);
      expect(hangar.toggleSeal('plasma')).toBe(true);
      expect(hangar.toggleSeal('multishot')).toBe(false);
      const again = new HangarService({ ...base, eventBus: new EventBus() });
      expect(again.getModifiers().sealed).toEqual(new Set(['plasma']));
      expect(again.toggleSeal('plasma')).toBe(true);
      expect(again.getModifiers().sealed).toEqual(new Set());
    });

    it('counts a Hold per item and launches the Flight School card', () => {
      const { hangar } = open(0, { hold: true });
      expect(hangar.getModifiers().holds).toBe(1);
      expect(hangar.setStartingCard('propulsors')).toBe(false);

      const { hangar: school } = open(0, { 'flight-school': true });
      expect(school.getFlightSchoolCards()).toEqual(['propulsors']);
      expect(school.setStartingCard('braking_system')).toBe(false);
      expect(school.setStartingCard('auto_aim')).toBe(false);
      expect(school.setStartingCard('propulsors')).toBe(true);
      expect(school.getModifiers().startingCard).toBe('propulsors');
    });
  });
});
