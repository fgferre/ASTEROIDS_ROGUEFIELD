import { describe, expect, it } from 'vitest';
import { comboTier } from '../../../src/modules/ui/AAAHudLayout.js';

describe('AAAHudLayout combo tier', () => {
  it('steps the combo color with the multiplier the progression system produces', () => {
    // ProgressionSystem: multiplier = 1 + (combo - 1) * 0.1, capped at 2.0.
    const tierAt = (combo) => comboTier(Math.min(2, 1 + (combo - 1) * 0.1));
    expect([1, 2, 3].map(tierAt)).toEqual(['text', 'text', 'text']);
    expect([4, 5, 6, 7].map(tierAt)).toEqual([
      'status',
      'status',
      'status',
      'status',
    ]);
    expect([8, 9, 10].map(tierAt)).toEqual(['xp', 'xp', 'xp']);
    expect([11, 30].map(tierAt)).toEqual(['boss', 'boss']);
  });
});
