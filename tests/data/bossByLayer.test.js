import { describe, expect, it } from 'vitest';

import {
  BOSS_BY_LAYER,
  bossKindForLayer,
} from '../../src/data/enemies/boss.js';
import { wardenFactoryKey } from '../../src/modules/enemies/types/wardens.js';

describe('BOSS_BY_LAYER', () => {
  it('puts Prime at 5, Choir at 10 and Null at 15', () => {
    expect(BOSS_BY_LAYER).toEqual({ 5: 'prime', 10: 'choir', 15: 'null' });
    expect([5, 10, 15].map(bossKindForLayer)).toEqual([
      'prime',
      'choir',
      'null',
    ]);
  });

  it('cycles past the table and maps each kind to its factory key', () => {
    expect([20, 25, 30].map(bossKindForLayer)).toEqual([
      'prime',
      'choir',
      'null',
    ]);
    expect(['prime', 'choir', 'null'].map(wardenFactoryKey)).toEqual([
      'boss',
      'boss-choir',
      'boss-null',
    ]);
  });
});
