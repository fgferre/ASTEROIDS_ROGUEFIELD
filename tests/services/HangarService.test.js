import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';
import { GamePools } from '../../src/core/GamePools.js';
import { PROGRESSION_UPGRADE_REROLLS_PER_RUN } from '../../src/core/GameConstants.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../__helpers__/headlessGame.js';
import HangarService, {
  HANGAR_STORAGE_KEY,
} from '../../src/services/HangarService.js';
import {
  BASTION_HULL_ID,
  DEFAULT_HULL_ID,
  SOLAR_SLICER_HULL_ID,
} from '../../src/data/shipModels.js';

const atRate = (salvage) => ({ getModifiers: () => ({ salvage }) });

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
    const hangar = new HangarService({ eventBus, difficulty: atRate(1) });
    const awarded = [];
    eventBus.on('salvage-awarded', ({ amount }) => awarded.push(amount));

    eventBus.emit('game-started', {});
    eventBus.emit('player-died', summary(9, 47));
    expect(hangar.lastAward).toEqual({ amount: 99, total: 99, multiplier: 1 });

    eventBus.emit('player-died', summary(11, 60)); // after a retry
    expect(hangar.lastAward).toEqual({
      amount: 122,
      total: 122,
      multiplier: 1,
    });
    expect(awarded).toEqual([99, 23]);
  });

  it('adds 150 for a victory and 25 per endless layer', () => {
    const eventBus = new EventBus();
    const hangar = new HangarService({ eventBus, difficulty: atRate(1) });
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

  it('scales the payout by the difficulty salvage multiplier', () => {
    const eventBus = new EventBus();
    const hangar = new HangarService({ eventBus, difficulty: atRate(1.3) });
    eventBus.emit('game-started', {});
    eventBus.emit('player-died', summary(9, 47)); // 99 at Veteran
    expect(hangar.lastAward).toEqual({
      amount: 129,
      total: 129,
      multiplier: 1.3,
    });
  });

  it('buys once with enough Salvage and persists through storage', () => {
    stock(200);
    const eventBus = new EventBus();
    const hangar = new HangarService({ eventBus });
    const bought = [];
    eventBus.on('hangar-purchased', ({ id }) => bought.push(id));

    expect(hangar.buy('salvage-magnet')).toBe(true);
    expect(hangar.buy('salvage-magnet')).toBe(false);
    expect(hangar.buy('reinforced-plating')).toBe(false); // 0 left
    expect(bought).toEqual(['salvage-magnet']);

    const next = new HangarService({ eventBus: new EventBus() });
    expect(next.salvage).toBe(0);
    expect(next.owned).toEqual({ 'salvage-magnet': true });
  });

  it('turns owned items into run modifiers and gates the bought hulls', () => {
    const none = new HangarService({ eventBus: new EventBus() });
    expect(none.getModifiers()).toEqual({
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
    const all = new HangarService({ eventBus: new EventBus() });
    expect(all.getModifiers()).toEqual({
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
});
