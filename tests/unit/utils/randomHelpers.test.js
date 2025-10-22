import { describe, expect, it, vi } from 'vitest';
import { createRandomHelpers } from '../../../src/utils/randomHelpers.js';

const createForkStub = () => ({
  float: vi.fn(() => 0.42),
  range: vi.fn((min, max) => (min + max) / 2),
  int: vi.fn((min, max) => Math.floor((min + max) / 2)),
  chance: vi.fn(() => true),
  pick: vi.fn((array) => array[0]),
});

describe('createRandomHelpers', () => {
  it('returns bound helper methods that can be assigned directly', () => {
    const fork = createForkStub();
    const helpers = createRandomHelpers({
      getRandomFork: () => fork,
    });

    const target = {};
    Object.assign(target, helpers);

    expect(target.randomFloat).toBe(helpers.randomFloat);
    expect(target.randomRange).toBe(helpers.randomRange);
    expect(target.randomInt).toBe(helpers.randomInt);
    expect(target.randomChance).toBe(helpers.randomChance);
    expect(target.randomCentered).toBe(helpers.randomCentered);
    expect(target.randomPick).toBe(helpers.randomPick);

    expect(target.randomFloat()).toBeCloseTo(0.42);
    expect(fork.float).toHaveBeenCalled();

    expect(target.randomRange(2, 6)).toBe(4);
    expect(fork.range).toHaveBeenCalledWith(2, 6);

    expect(target.randomInt(1, 9)).toBe(5);
    expect(fork.int).toHaveBeenCalledWith(1, 9);

    expect(target.randomChance(0.3)).toBe(true);
    expect(fork.chance).toHaveBeenCalledWith(0.3);

    expect(target.randomCentered(2)).toBeCloseTo(-0.16);
    expect(target.randomPick(['a', 'b'])).toBe('a');
    expect(fork.pick).toHaveBeenCalledWith(['a', 'b']);
  });
});
