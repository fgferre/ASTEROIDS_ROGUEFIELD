import { describe, expect, it } from 'vitest';
import RandomService from '../../src/core/RandomService.js';

describe('RandomService deterministic behaviour', () => {
  const sampleCount = 8;

  it('produces identical float sequences for identical seeds', () => {
    const seed = 987654321;
    const first = new RandomService(seed);
    const second = new RandomService(seed);

    const seqA = Array.from({ length: sampleCount }, () => first.float());
    const seqB = Array.from({ length: sampleCount }, () => second.float());

    expect(seqA).toStrictEqual(seqB);
  });

  it('produces identical range sequences for identical seeds', () => {
    const seed = 24680;
    const first = new RandomService(seed);
    const second = new RandomService(seed);

    const seqA = Array.from({ length: sampleCount }, () => first.range(-10, 10));
    const seqB = Array.from({ length: sampleCount }, () => second.range(-10, 10));

    expect(seqA).toStrictEqual(seqB);
  });

  it('picks identical array items for identical seeds', () => {
    const seed = 'pick-seed';
    const items = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    const first = new RandomService(seed);
    const second = new RandomService(seed);

    const seqA = Array.from({ length: sampleCount }, () => first.pick(items));
    const seqB = Array.from({ length: sampleCount }, () => second.pick(items));

    expect(seqA).toStrictEqual(seqB);
  });

  it('generates identical UUIDs for identical seeds and scopes', () => {
    const seed = 11223344;
    const scope = 'test-scope';
    const first = new RandomService(seed);
    const second = new RandomService(seed);

    const seqA = Array.from({ length: sampleCount }, () => first.uuid(scope));
    const seqB = Array.from({ length: sampleCount }, () => second.uuid(scope));

    expect(seqA).toStrictEqual(seqB);
  });

  it('repeats sequences after resetting to the same seed', () => {
    const seed = 55555;
    const items = ['north', 'south', 'east', 'west'];
    const random = new RandomService(seed);

    const firstRun = {
      floats: Array.from({ length: sampleCount }, () => random.float()),
      ranges: Array.from({ length: sampleCount }, () => random.range(0, 100)),
      picks: Array.from({ length: sampleCount }, () => random.pick(items)),
      uuids: Array.from({ length: sampleCount }, () => random.uuid('reset')), 
    };

    random.reset(seed);

    const secondRun = {
      floats: Array.from({ length: sampleCount }, () => random.float()),
      ranges: Array.from({ length: sampleCount }, () => random.range(0, 100)),
      picks: Array.from({ length: sampleCount }, () => random.pick(items)),
      uuids: Array.from({ length: sampleCount }, () => random.uuid('reset')),
    };

    expect(secondRun).toStrictEqual(firstRun);
  });
});
