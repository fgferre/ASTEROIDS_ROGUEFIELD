import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDomStubs } from '../__helpers__/headlessGame.js';
import { sectorById } from '../../src/data/sectors.js';
import {
  isBossRushUnlocked,
  isSectorUnlocked,
  loadRecords,
  updateRecords,
} from '../../src/services/runRecords.js';

describe('run records', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  it('keeps the furthest Boss Rush Warden and the fastest clear, beside the layer records', () => {
    updateRecords({ layer: 9, time: 600 });
    updateRecords({ bossRushStage: 2 });
    updateRecords({ bossRushStage: 1, bossRushTime: 500 });
    updateRecords({ bossRushStage: 3, bossRushTime: 420 });
    updateRecords({ bossRushTime: 480 });

    expect(loadRecords()).toEqual({
      bestLayer: 9,
      bestTime: 600,
      runs: 0,
      bossRushStage: 3,
      bossRushTime: 420,
      sectorsWon: [],
      sectorTimes: {},
    });
  });

  it('opens Boss Rush once a run has gone past Warden Prime', () => {
    expect(isBossRushUnlocked()).toBe(false);
    updateRecords({ layer: 5 });
    expect(isBossRushUnlocked()).toBe(false);
    updateRecords({ layer: 6 });
    expect(isBossRushUnlocked()).toBe(true);
  });

  it('keeps each sector won and its fastest clear, without touching the layer records', () => {
    updateRecords({ sectorWon: 'dense-core', sectorTime: 300 });
    updateRecords({ sectorWon: 'dense-core', sectorTime: 360 });
    updateRecords({ sectorWon: 'dense-core', sectorTime: 280 });

    expect(loadRecords()).toMatchObject({
      bestLayer: 0,
      bestTime: 0,
      sectorsWon: ['dense-core'],
      sectorTimes: { 'dense-core': 280 },
    });
  });

  it('opens a sector once the one before is won or a full run went past its Warden', () => {
    const [outer, dense, reach] = [
      'outer-ring',
      'dense-core',
      'wardens-reach',
    ].map(sectorById);
    expect(isSectorUnlocked(outer)).toBe(true);
    expect(isSectorUnlocked(dense)).toBe(false);
    updateRecords({ sectorWon: 'outer-ring', sectorTime: 200 });
    expect(isSectorUnlocked(dense)).toBe(true);
    expect(isSectorUnlocked(reach)).toBe(false);
    updateRecords({ layer: 10 });
    expect(isSectorUnlocked(reach)).toBe(false);
    updateRecords({ layer: 11 });
    expect(isSectorUnlocked(reach)).toBe(true);
  });
});
