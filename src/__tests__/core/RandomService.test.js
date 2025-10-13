import { describe, it, expect } from 'vitest';
import RandomService from '../../core/RandomService.js';

function createTwinRandomServices(seed) {
  return [new RandomService(seed), new RandomService(seed)];
}

function sampleSequence(random, count, sampler) {
  return Array.from({ length: count }, (_, index) => sampler(random, index));
}

describe('RandomService determinism', () => {
  it('produces identical float sequences for the same seed', () => {
    const [first, second] = createTwinRandomServices(987654321);

    const floatsA = sampleSequence(first, 8, (rng) => Number(rng.float().toFixed(12)));
    const floatsB = sampleSequence(second, 8, (rng) => Number(rng.float().toFixed(12)));

    expect(floatsB).toEqual(floatsA);
  });

  it('produces identical range sequences for the same seed', () => {
    const [first, second] = createTwinRandomServices(13579);

    const rangesA = sampleSequence(first, 6, (rng) => Number(rng.range(-25, 42).toFixed(10)));
    const rangesB = sampleSequence(second, 6, (rng) => Number(rng.range(-25, 42).toFixed(10)));

    expect(rangesB).toEqual(rangesA);
  });

  it('selects identical elements with pick for the same seed', () => {
    const [first, second] = createTwinRandomServices(424242);
    const values = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];

    const picksA = sampleSequence(first, 10, (rng) => rng.pick(values));
    const picksB = sampleSequence(second, 10, (rng) => rng.pick(values));

    expect(picksB).toEqual(picksA);
  });

  it('selects identical elements with weightedPick for the same seed', () => {
    const [first, second] = createTwinRandomServices(777);
    const weights = [
      { value: 'common', weight: 70 },
      { value: 'iron', weight: 20 },
      { value: 'gold', weight: 8 },
      { value: 'crystal', weight: 2 }
    ];

    const picksA = sampleSequence(first, 10, (rng) => rng.weightedPick(weights));
    const picksB = sampleSequence(second, 10, (rng) => rng.weightedPick(weights));

    expect(picksB).toEqual(picksA);
  });

  it('generates identical UUIDs for the same seed', () => {
    const [first, second] = createTwinRandomServices(314159265);

    const uuidsA = sampleSequence(first, 5, (rng, index) => rng.uuid(`scope-${index}`));
    const uuidsB = sampleSequence(second, 5, (rng, index) => rng.uuid(`scope-${index}`));

    expect(uuidsB).toEqual(uuidsA);
  });

  it('fork produces deterministic child generators', () => {
    const [first, second] = createTwinRandomServices(24680);

    const captureForkData = (rng) => {
      const spawnFork = rng.fork('enemy.spawn');
      const lootFork = rng.fork('enemy.loot');

      const spawnFloats = sampleSequence(spawnFork, 4, (forked) => Number(forked.float().toFixed(12)));
      const spawnUuids = sampleSequence(spawnFork, 2, (forked, index) => forked.uuid(`spawn-${index}`));

      const lootRanges = sampleSequence(lootFork, 3, (forked) => Number(forked.range(0, 100).toFixed(8)));
      const nestedFork = lootFork.fork('nested');
      const nestedFloats = sampleSequence(nestedFork, 3, (forked) => Number(forked.float().toFixed(12)));

      const rootContinuation = sampleSequence(rng, 3, (base) => Number(base.float().toFixed(12)));

      return {
        spawnFloats,
        spawnUuids,
        lootRanges,
        nestedFloats,
        rootContinuation
      };
    };

    const forkDataA = captureForkData(first);
    const forkDataB = captureForkData(second);

    expect(forkDataB).toEqual(forkDataA);
  });
});
