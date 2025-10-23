import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import AudioBatcher from '../../src/modules/AudioBatcher.js';
import RandomService from '../../src/core/RandomService.js';
import { createAudioSystemStub } from '../__helpers__/mocks.js';
import { setupGlobalMocks, cleanupGlobalState } from '../__helpers__/setup.js';

describe('AudioBatcher random range determinism', () => {
  beforeEach(() => {
    setupGlobalMocks();
  });

  afterEach(() => {
    cleanupGlobalState();
  });

  it('restores identical random range sequence after reseed when base RandomService resets', () => {
    const baseRandom = new RandomService('audio-batcher:test-seed');
    const batcher = new AudioBatcher(createAudioSystemStub(), 0, {
      random: baseRandom,
    });

    const firstSequence = Array.from({ length: 5 }, () =>
      batcher._getRandomRange('asteroid', -1, 1)
    );

    baseRandom.reset('audio-batcher:test-seed');
    batcher.reseedRandomForks();

    const secondSequence = Array.from({ length: 5 }, () =>
      batcher._getRandomRange('asteroid', -1, 1)
    );

    expect(secondSequence).toEqual(firstSequence);
  });

  it('uses deterministic fallback generator when no random service is provided', () => {
    const batcher = new AudioBatcher(createAudioSystemStub(), 0);

    const firstSequence = Array.from({ length: 5 }, () =>
      batcher._getRandomRange('shield', 0, 10)
    );

    batcher.captureRandomForkSeeds();
    batcher.reseedRandomForks();

    const secondSequence = Array.from({ length: 5 }, () =>
      batcher._getRandomRange('shield', 0, 10)
    );

    expect(secondSequence).toEqual(firstSequence);
  });
});
