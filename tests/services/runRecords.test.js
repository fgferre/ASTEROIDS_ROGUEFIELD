import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDomStubs } from '../__helpers__/headlessGame.js';
import {
  isBossRushUnlocked,
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
    });
  });

  it('opens Boss Rush once a run has gone past Warden Prime', () => {
    expect(isBossRushUnlocked()).toBe(false);
    updateRecords({ layer: 5 });
    expect(isBossRushUnlocked()).toBe(false);
    updateRecords({ layer: 6 });
    expect(isBossRushUnlocked()).toBe(true);
  });
});
