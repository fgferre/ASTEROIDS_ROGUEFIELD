import { describe, it, expect, beforeEach, vi } from 'vitest';
import AudioBatcher from '../../src/modules/AudioBatcher.js';
import RandomService from '../../src/core/RandomService.js';

const createAudioSystemStub = () => ({
  safePlay: vi.fn(fn => (typeof fn === 'function' ? fn() : undefined)),
  pool: {
    getOscillator: vi.fn(),
    getGain: vi.fn(),
    returnGain: vi.fn(),
  },
  connectGainNode: vi.fn(),
  context: {
    currentTime: 0,
  },
});

describe('AudioBatcher random range determinism', () => {
  beforeEach(() => {
    if (typeof globalThis.performance === 'undefined') {
      globalThis.performance = { now: () => 0 };
    }
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
