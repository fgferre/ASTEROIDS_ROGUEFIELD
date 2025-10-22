import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import AudioSystem from '../../../src/modules/AudioSystem.js';
import RandomService from '../../../src/core/RandomService.js';
import { setupGlobalMocks, cleanupGlobalState } from '../../__helpers__/setup.js';
import { createSettingsStub } from '../../__helpers__/stubs.js';

describe('AudioSystem random scope synchronization', () => {
  beforeEach(() => {
    setupGlobalMocks();
  });

  afterEach(() => {
    cleanupGlobalState();
  });

  it('reseedRandomScopes during reset reseeds cache and batcher sequences', () => {
    const random = new RandomService('audio-system:test');
    const audio = new AudioSystem({ random, settings: createSettingsStub() });

    const cacheSnapshot = {
      baseSeed: 123,
      fallbackSeed: 456,
      forks: [],
    };
    const cache = {
      clearCache: vi.fn(),
      resetStats: vi.fn(),
      captureNoiseSeeds: vi.fn(() => cacheSnapshot),
      reseedNoiseGenerators: vi.fn(),
    };
    const batcherSnapshot = { 'family:laser': 9999 };
    const batcher = {
      flushPendingBatches: vi.fn(),
      resetStats: vi.fn(),
      captureRandomForkSeeds: vi.fn(() => batcherSnapshot),
      reseedRandomForks: vi.fn(),
    };

    audio.cache = cache;
    audio.batcher = batcher;

    audio.captureRandomScopes();

    const reseedSpy = vi.spyOn(audio, 'reseedRandomScopes');

    audio.reset();

    expect(reseedSpy).toHaveBeenCalledTimes(1);
    expect(cache.clearCache).toHaveBeenCalledTimes(1);
    expect(cache.reseedNoiseGenerators).toHaveBeenCalledTimes(1);
    expect(cache.reseedNoiseGenerators).toHaveBeenCalledWith(cacheSnapshot);
    expect(cache.captureNoiseSeeds).toHaveBeenCalledTimes(2);
    expect(batcher.flushPendingBatches).toHaveBeenCalledTimes(1);
    expect(batcher.reseedRandomForks).toHaveBeenCalledTimes(1);
    expect(batcher.captureRandomForkSeeds).toHaveBeenCalledTimes(2);
  });
});
