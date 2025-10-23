import { describe, expect, it } from 'vitest';
import RandomService from '../../../src/core/RandomService.js';
import { ScreenShake } from '../../../src/utils/ScreenShake.js';

describe('ScreenShake random seed behaviour', () => {
  // Note: vi.restoreAllMocks() handled by global setup (tests/__helpers__/global-setup.js)
  // Optimization: it.concurrent (tests are independent)
  const sampleCount = 8;

  it.concurrent('produces deterministic seeds when provided with the same RandomService seed', () => {
    const baseSeed = 13579;
    const first = new ScreenShake(new RandomService(baseSeed));
    const second = new ScreenShake(new RandomService(baseSeed));

    const seqA = Array.from({ length: sampleCount }, () => first.getRandomSeed());
    const seqB = Array.from({ length: sampleCount }, () => second.getRandomSeed());

    expect(seqA).toStrictEqual(seqB);
  });

  it.concurrent('uses a deterministic fallback generator when none is provided', () => {
    const first = new ScreenShake();
    const second = new ScreenShake();

    const seqA = Array.from({ length: sampleCount }, () => first.getRandomSeed());
    const seqB = Array.from({ length: sampleCount }, () => second.getRandomSeed());

    expect(seqA).toStrictEqual(seqB);
  });

  it.concurrent('restores captured seed state when reseeded with a stored snapshot', () => {
    const baseSeed = 24680;
    const generator = new RandomService(baseSeed);
    const shake = new ScreenShake(generator);
    const snapshot = shake.captureSeedState();

    // Advance generator state to ensure reseeding relies on the snapshot
    Array.from({ length: sampleCount }, () => shake.getRandomSeed());

    generator.reset(baseSeed);
    const restoredSnapshot = shake.reseed(generator, { seedState: snapshot });
    expect(restoredSnapshot).toStrictEqual(snapshot);

    const restoredSequence = Array.from({ length: sampleCount }, () => shake.getRandomSeed());
    const expectedGenerator = new RandomService(baseSeed);
    const expectedSequence = Array.from({ length: sampleCount }, () =>
      expectedGenerator.range(0, 1000)
    );

    expect(restoredSequence).toStrictEqual(expectedSequence);
  });
});
