import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import AudioSystem from '../../src/modules/AudioSystem.js';
import RandomService from '../../src/core/RandomService.js';
import { setupGlobalMocks, cleanupGlobalState } from '../__helpers__/setup.js';
import {
  createAudioContextStub,
  createMediaElementStub,
  createRandomServiceStatefulStub,
  createSettingsStub,
} from '../__helpers__/stubs.js';
import { createEventBusMock } from '../__helpers__/mocks.js';

describe('AudioSystem random scope synchronization', () => {
  beforeEach(() => {
    setupGlobalMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

  function createMenuMusicHarness(contextOptions = {}) {
    const eventBus = createEventBusMock();
    const random = createRandomServiceStatefulStub();
    const settings = createSettingsStub({
      masterVolume: 0.7,
      musicVolume: 0.6,
      effectsVolume: 0.85,
      muteAll: false,
    });

    const audio = new AudioSystem({ eventBus, random, settings });
    const context = createAudioContextStub({
      state: 'suspended',
      ...contextOptions,
    });
    const mediaElements = [];
    const AudioCtor = vi.fn(function AudioCtor(src = '') {
      const mediaElement = createMediaElementStub({ src });
      mediaElements.push(mediaElement);
      return mediaElement;
    });

    vi.stubGlobal('Audio', AudioCtor);
    vi.stubGlobal('AudioContext', vi.fn(() => context));
    vi.stubGlobal('webkitAudioContext', undefined);
    vi.stubGlobal('window', {
      Audio: AudioCtor,
      AudioContext: globalThis.AudioContext,
      webkitAudioContext: undefined,
    });

    vi.spyOn(audio, 'initializeMusicController').mockImplementation(() => {});
    vi.spyOn(audio, '_startPerformanceMonitoring').mockImplementation(() => {});
    vi.spyOn(audio, '_startThrusterInactivityChecker').mockImplementation(
      () => {}
    );

    return {
      audio,
      context,
      eventBus,
      mediaElements,
    };
  }

  it('starts the menu track after init when the menu screen was already active', async () => {
    const { audio, context, eventBus, mediaElements } = createMenuMusicHarness();

    eventBus.emit('screen-changed', { screen: 'menu' });

    await audio.init();

    expect(mediaElements).toHaveLength(1);
    expect(mediaElements[0].play).toHaveBeenCalledTimes(1);
    expect(audio.menuTrackState.currentScreen).toBe('menu');
    expect(audio.menuTrackState.isPlaying).toBe(true);
    expect(context.createMediaElementSource).toHaveBeenCalledTimes(1);
  });

  it('reuses the same media graph across menu to playing to menu transitions', async () => {
    vi.useFakeTimers();

    const { audio, context, eventBus, mediaElements } = createMenuMusicHarness();

    eventBus.emit('screen-changed', { screen: 'menu' });
    await audio.init();

    const firstElement = mediaElements[0];
    const firstGain = audio.menuTrackState.trackGain;

    eventBus.emit('screen-changed', { screen: 'playing' });
    vi.advanceTimersByTime(audio.menuTrackConfig.fadeOutMs);

    expect(firstElement.pause).toHaveBeenCalledTimes(1);
    expect(audio.menuTrackState.isPlaying).toBe(false);
    expect(firstGain.gain.value).toBe(0);

    eventBus.emit('screen-changed', { screen: 'menu' });

    expect(mediaElements).toHaveLength(1);
    expect(firstElement.play).toHaveBeenCalledTimes(2);
    expect(context.createMediaElementSource).toHaveBeenCalledTimes(1);
    expect(audio.menuTrackState.trackGain).toBe(firstGain);
    expect(firstGain.gain.value).toBe(1);
  });

  it('stops the menu track for settings and credits overlays opened from the menu', async () => {
    vi.useFakeTimers();

    const { audio, eventBus, mediaElements } = createMenuMusicHarness();

    eventBus.emit('screen-changed', { screen: 'menu' });
    await audio.init();

    const menuElement = mediaElements[0];

    eventBus.emit('ui-overlay-visibility-changed', {
      overlay: 'settings',
      isOpen: true,
      source: 'menu',
    });
    vi.advanceTimersByTime(audio.menuTrackConfig.fadeOutMs);

    expect(audio.menuTrackState.currentScreen).toBe('settings');
    expect(menuElement.pause).toHaveBeenCalledTimes(1);

    eventBus.emit('ui-overlay-visibility-changed', {
      overlay: 'settings',
      isOpen: false,
      source: 'menu',
    });

    expect(menuElement.play).toHaveBeenCalledTimes(2);
    expect(audio.menuTrackState.currentScreen).toBe('menu');

    eventBus.emit('ui-overlay-visibility-changed', {
      overlay: 'credits',
      isOpen: true,
      source: 'menu',
    });
    vi.advanceTimersByTime(audio.menuTrackConfig.fadeOutMs);

    expect(audio.menuTrackState.currentScreen).toBe('credits');
    expect(menuElement.pause).toHaveBeenCalledTimes(2);

    eventBus.emit('ui-overlay-visibility-changed', {
      overlay: 'credits',
      isOpen: false,
      source: 'menu',
    });

    expect(menuElement.play).toHaveBeenCalledTimes(3);
    expect(audio.menuTrackState.currentScreen).toBe('menu');
  });

  it('keeps track gain separate from master and music volume propagation', async () => {
    const { audio, eventBus } = createMenuMusicHarness();

    eventBus.emit('screen-changed', { screen: 'menu' });
    await audio.init();

    const trackGain = audio.menuTrackState.trackGain;

    audio.updateVolumeState({
      masterVolume: 0.4,
      musicVolume: 0.3,
      effectsVolume: 0.9,
      muteAll: false,
    });

    expect(audio.masterGain.gain.value).toBe(0.4);
    expect(audio.musicGain.gain.value).toBeCloseTo(0.12);
    expect(trackGain.gain.value).toBe(1);

    audio.updateVolumeState({
      masterVolume: 0.4,
      musicVolume: 0.3,
      effectsVolume: 0.9,
      muteAll: true,
    });

    expect(audio.masterGain.gain.value).toBe(0);
    expect(audio.musicGain.gain.value).toBe(0);
    expect(trackGain.gain.value).toBe(1);
  });

  it('cleans up menu track resources on reset and destroy', async () => {
    const { audio, eventBus, mediaElements } = createMenuMusicHarness();

    eventBus.emit('screen-changed', { screen: 'menu' });
    await audio.init();

    const firstElement = mediaElements[0];

    audio.reset();

    expect(firstElement.pause).toHaveBeenCalled();
    expect(audio.menuTrackState.audioElement).toBeNull();
    expect(audio.menuTrackState.sourceNode).toBeNull();
    expect(audio.menuTrackState.trackGain).toBeNull();
    expect(audio.menuTrackState.isPlaying).toBe(false);
    expect(audio.menuTrackState.currentScreen).toBeNull();

    eventBus.emit('screen-changed', { screen: 'menu' });

    expect(mediaElements).toHaveLength(2);
    expect(audio.menuTrackState.audioElement).toBe(mediaElements[1]);

    audio.onDestroy();

    expect(mediaElements[1].pause).toHaveBeenCalled();
    expect(audio.menuTrackState.audioElement).toBeNull();
    expect(audio.menuTrackState.sourceNode).toBeNull();
    expect(audio.menuTrackState.trackGain).toBeNull();
    expect(audio.menuTrackState.isPlaying).toBe(false);
    expect(audio.menuTrackState.currentScreen).toBeNull();
  });
});
