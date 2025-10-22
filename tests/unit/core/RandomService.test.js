import { describe, it, expect } from 'vitest';
import RandomService from '../../../src/core/RandomService.js';
import { expectDeterministicSequence } from '../../__helpers__/assertions.js';

function sampleSequence(random, count, sampler) {
  return Array.from({ length: count }, (_, index) => sampler(random, index));
}

describe('RandomService determinism', () => {
  it('produces identical float sequences for the same seed', () => {
    const seed = 987654321;
    const randomA = new RandomService(seed);
    const randomB = new RandomService(seed);

    const floatsA = sampleSequence(randomA, 8, (rng) => rng.float()).map((value) => Number(value.toFixed(12)));
    const floatsB = sampleSequence(randomB, 8, (rng) => rng.float()).map((value) => Number(value.toFixed(12)));

    expectDeterministicSequence(floatsA, floatsB);
    expect(floatsB).toEqual(floatsA);
  });

  it('produces identical range sequences for the same seed', () => {
    const seed = 13579;
    const randomA = new RandomService(seed);
    const randomB = new RandomService(seed);

    const rangesA = sampleSequence(randomA, 6, (rng) => rng.range(-25, 42)).map((value) => Number(value.toFixed(10)));
    const rangesB = sampleSequence(randomB, 6, (rng) => rng.range(-25, 42)).map((value) => Number(value.toFixed(10)));

    expectDeterministicSequence(rangesA, rangesB);
    expect(rangesB).toEqual(rangesA);
  });

  it('produces identical int sequences for the same seed', () => {
    const seed = 111222;
    const randomA = new RandomService(seed);
    const randomB = new RandomService(seed);

    const intsA = sampleSequence(randomA, 10, (rng) => rng.int(1, 100));
    const intsB = sampleSequence(randomB, 10, (rng) => rng.int(1, 100));

    expect(intsB).toEqual(intsA);
    intsA.concat(intsB).forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(100);
    });
  });

  it('produces identical chance results for the same seed', () => {
    const seed = 333444;
    const randomA = new RandomService(seed);
    const randomB = new RandomService(seed);

    const chancesA = sampleSequence(randomA, 12, (rng) => rng.chance(0.7));
    const chancesB = sampleSequence(randomB, 12, (rng) => rng.chance(0.7));

    expect(chancesB).toEqual(chancesA);
    chancesA.concat(chancesB).forEach((value) => {
      expect(typeof value).toBe('boolean');
    });
  });

  it('selects identical elements with pick for the same seed', () => {
    const seed = 424242;
    const randomA = new RandomService(seed);
    const randomB = new RandomService(seed);
    const items = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];

    const picksA = sampleSequence(randomA, 10, (rng) => rng.pick(items));
    const picksB = sampleSequence(randomB, 10, (rng) => rng.pick(items));

    expect(picksB).toEqual(picksA);
  });

  it('selects identical elements with weightedPick for the same seed', () => {
    const seed = 777;
    const randomA = new RandomService(seed);
    const randomB = new RandomService(seed);
    const weights = [
      { value: 'common', weight: 70 },
      { value: 'iron', weight: 20 },
      { value: 'gold', weight: 8 },
      { value: 'crystal', weight: 2 },
    ];

    const picksA = sampleSequence(randomA, 10, (rng) => rng.weightedPick(weights));
    const picksB = sampleSequence(randomB, 10, (rng) => rng.weightedPick(weights));

    expect(picksB).toEqual(picksA);
  });

  it('generates identical UUIDs for the same seed', () => {
    const seed = 314159265;
    const randomA = new RandomService(seed);
    const randomB = new RandomService(seed);

    const uuidsA = sampleSequence(randomA, 5, (rng, index) => rng.uuid(`scope-${index}`));
    const uuidsB = sampleSequence(randomB, 5, (rng, index) => rng.uuid(`scope-${index}`));

    expect(uuidsB).toEqual(uuidsA);
  });

  it('fork produces deterministic child generators', () => {
    const seed = 24680;
    const randomA = new RandomService(seed);
    const randomB = new RandomService(seed);

    const captureForkData = (rng) => {
      const spawnFork = rng.fork('enemy.spawn');
      const lootFork = rng.fork('enemy.loot');

      const spawnData = {
        floats: sampleSequence(spawnFork, 4, (fork) => fork.float()).map((value) => Number(value.toFixed(8))),
        uuids: sampleSequence(spawnFork, 2, (fork, index) => fork.uuid(`spawn-${index}`)),
      };

      const nestedFork = lootFork.fork('drops.special');
      const lootData = {
        ranges: sampleSequence(lootFork, 3, (fork) => fork.range(0, 100)).map((value) => Number(value.toFixed(8))),
        nestedFloats: sampleSequence(nestedFork, 3, (fork) => fork.float()).map((value) => Number(value.toFixed(8))),
      };

      const rootContinuation = sampleSequence(rng, 3, (root) => root.float()).map((value) => Number(value.toFixed(8)));

      return {
        spawnData,
        lootData,
        rootContinuation,
      };
    };

    const forkDataA = captureForkData(randomA);
    const forkDataB = captureForkData(randomB);

    expect(forkDataB).toEqual(forkDataA);
  });

  it('repeats sequences after resetting to the same seed', () => {
    const seed = 55555;
    const random = new RandomService(seed);
    const values = ['north', 'south', 'east', 'west'];

    const executeRun = (rng) => ({
      floats: sampleSequence(rng, 8, (service) => Number(service.float().toFixed(12))),
      ranges: sampleSequence(rng, 8, (service) => Number(service.range(0, 100).toFixed(10))),
      picks: sampleSequence(rng, 8, (service) => service.pick(values)),
      uuids: sampleSequence(rng, 8, (service, index) => service.uuid(`reset-${index}`)),
    });

    const firstRun = executeRun(random);
    random.reset(seed);
    const secondRun = executeRun(random);

    expect(secondRun).toStrictEqual(firstRun);
  });

  it('serialize and restore preserves deterministic state', () => {
    const seed = 999888;
    const random = new RandomService(seed);

    const consumedFloats = sampleSequence(random, 5, (rng) => rng.float()).map((value) => Number(value.toFixed(12)));
    expect(consumedFloats.length).toBe(5);

    const snapshot = random.serialize();
    expect(snapshot).toHaveProperty('seed');
    expect(snapshot).toHaveProperty('state');
    expect(snapshot).toHaveProperty('stats');

    sampleSequence(random, 3, (rng) => rng.float());

    const restored = new RandomService(0);
    restored.restore(snapshot);

    const restoredFloats = sampleSequence(restored, 5, (rng) => Number(rng.float().toFixed(12)));

    const reference = new RandomService(seed);
    sampleSequence(reference, 5, (rng) => rng.float());
    const referenceFloats = sampleSequence(reference, 5, (rng) => Number(rng.float().toFixed(12)));

    expect(restoredFloats).toEqual(referenceFloats);
  });
});
