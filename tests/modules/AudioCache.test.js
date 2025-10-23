import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AudioCache from '../../src/modules/AudioCache.js';
import RandomService from '../../src/core/RandomService.js';
import { createAudioContextStub } from '../__helpers__/stubs.js';

describe('AudioCache deterministic noise buffers', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates identical buffers across consecutive reseeds with the same base seed', () => {
    const context = createAudioContextStub();
    const baseRandom = new RandomService('audio-cache:test-seed');
    const audioCache = new AudioCache(context, 8, { random: baseRandom });

    audioCache.clearCache('noise');

    const createSnapshotAndBuffer = () => {
      const buffer = audioCache.getNoiseBuffer(0.05, true, 'exponential', { family: 'test' });
      const clone = new Float32Array(buffer.getChannelData(0));
      const snapshot = audioCache.captureNoiseSeeds();
      return { snapshot, clone };
    };

    const firstRun = createSnapshotAndBuffer();

    const runWithReset = previousSnapshot => {
      audioCache.clearCache('noise');
      baseRandom.reset('audio-cache:test-seed');
      audioCache.reseedNoiseGenerators(previousSnapshot);
      return createSnapshotAndBuffer();
    };

    const secondRun = runWithReset(firstRun.snapshot);
    const thirdRun = runWithReset(secondRun.snapshot);

    expect(secondRun.clone).toEqual(firstRun.clone);
    expect(thirdRun.clone).toEqual(firstRun.clone);
  });
});
