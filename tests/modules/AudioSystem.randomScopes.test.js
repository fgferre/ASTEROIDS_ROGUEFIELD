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

  function createDocumentStub(audioFactory) {
    const listeners = new Map();

    const documentStub = {
      addEventListener: vi.fn((type, handler) => {
        if (!listeners.has(type)) {
          listeners.set(type, new Set());
        }
        listeners.get(type).add(handler);
      }),
      removeEventListener: vi.fn((type, handler) => {
        if (!listeners.has(type)) {
          return;
        }
        listeners.get(type).delete(handler);
        if (listeners.get(type).size === 0) {
          listeners.delete(type);
        }
      }),
      createElement: vi.fn((tagName) => {
        if (tagName === 'audio') {
          return audioFactory('');
        }
        return { tagName };
      }),
      dispatch(type, payload = {}) {
        if (!listeners.has(type)) {
          return;
        }
        for (const handler of [...listeners.get(type)]) {
          handler({ type, ...payload });
        }
      },
    };

    return documentStub;
  }

  function createMenuMusicHarness(options = {}) {
    const { contextOptions = {}, audioFactory } = options;
    const eventBus = createEventBusMock();
    const random = createRandomServiceStatefulStub();
    const settings = createSettingsStub({
      masterVolume: 0.7,
      musicVolume: 0.6,
      effectsVolume: 0.85,
      muteAll: false,
    });

    const context = createAudioContextStub({
      state: 'suspended',
      ...contextOptions,
    });
    const mediaElements = [];
    const createAudioElement = (src = '') => {
      const mediaElement = audioFactory
        ? audioFactory({ src, index: mediaElements.length })
        : createMediaElementStub({ src });
      if (!mediaElement.src) {
        mediaElement.src = src;
      }
      mediaElements.push(mediaElement);
      return mediaElement;
    };
    const documentStub = createDocumentStub(createAudioElement);
    const AudioCtor = vi.fn(function AudioCtor(src = '') {
      return createAudioElement(src);
    });
    const AudioContextCtor = vi.fn(() => context);

    vi.stubGlobal('document', documentStub);
    vi.stubGlobal('Audio', AudioCtor);
    vi.stubGlobal('AudioContext', AudioContextCtor);
    vi.stubGlobal('webkitAudioContext', undefined);
    vi.stubGlobal('window', {
      document: documentStub,
      Audio: AudioCtor,
      AudioContext: AudioContextCtor,
      webkitAudioContext: undefined,
    });

    const audio = new AudioSystem({ eventBus, random, settings });

    vi.spyOn(audio, 'initializeMusicController').mockImplementation(() => {});
    vi.spyOn(audio, '_startPerformanceMonitoring').mockImplementation(() => {});
    vi.spyOn(audio, '_startThrusterInactivityChecker').mockImplementation(
      () => {}
    );

    return {
      audio,
      AudioContextCtor,
      context,
      documentStub,
      eventBus,
      mediaElements,
    };
  }

  it('warms eager file tracks before init and initializes on pointerdown', async () => {
    const { audio, AudioContextCtor, documentStub, mediaElements } =
      createMenuMusicHarness();

    expect(mediaElements).toHaveLength(1);
    expect(mediaElements[0].load).toHaveBeenCalledTimes(1);
    expect(AudioContextCtor).not.toHaveBeenCalled();

    const initSpy = vi.spyOn(audio, 'init').mockResolvedValue(undefined);

    documentStub.dispatch('pointerdown');
    await Promise.resolve();

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(documentStub.removeEventListener).toHaveBeenCalledWith(
      'pointerdown',
      expect.any(Function),
      true
    );
  });

  it('starts the menu track after init when the menu screen was already active', async () => {
    const { audio, context, eventBus, mediaElements } = createMenuMusicHarness();

    eventBus.emit('screen-changed', { screen: 'menu' });

    await audio.init();
    await Promise.resolve();

    expect(mediaElements).toHaveLength(1);
    expect(mediaElements[0].load).toHaveBeenCalledTimes(1);
    expect(mediaElements[0].play).toHaveBeenCalledTimes(1);
    expect(audio.fileTrackState.currentScreen).toBe('menu');
    expect(audio.fileTrackState.activeTrackId).toBe('menu-opening');
    expect(audio.menuTrackState.isPlaying).toBe(true);
    expect(context.createMediaElementSource).toHaveBeenCalledTimes(1);
  });

  it('starts fade-in only after playback is ready', async () => {
    let resolvePlay;
    const playPromise = new Promise((resolve) => {
      resolvePlay = resolve;
    });
    const { audio, eventBus, mediaElements } = createMenuMusicHarness({
      audioFactory: ({ src }) =>
        createMediaElementStub({
          src,
          playImplementation: () => playPromise,
        }),
    });

    eventBus.emit('screen-changed', { screen: 'menu' });
    await audio.init();

    const trackGain = audio.menuTrackState.trackGain;

    expect(trackGain.gain.linearRampToValueAtTime).not.toHaveBeenCalled();

    mediaElements[0].dispatchEvent({ type: 'playing', target: mediaElements[0] });
    await Promise.resolve();

    expect(trackGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      1,
      expect.any(Number)
    );
    expect(audio.fileTrackState.activeTrackId).toBe('menu-opening');

    resolvePlay();
    await Promise.resolve();
  });

  it('reuses the same media graph across menu to playing to menu transitions', async () => {
    vi.useFakeTimers();

    const { audio, context, eventBus, mediaElements } = createMenuMusicHarness();

    eventBus.emit('screen-changed', { screen: 'menu' });
    await audio.init();
    await Promise.resolve();

    const firstElement = mediaElements[0];
    const firstGain = audio.menuTrackState.trackGain;

    eventBus.emit('screen-changed', { screen: 'playing' });
    vi.advanceTimersByTime(audio.menuTrackConfig.fadeOutMs);

    expect(firstElement.pause).toHaveBeenCalledTimes(1);
    expect(audio.menuTrackState.isPlaying).toBe(false);
    expect(firstGain.gain.value).toBe(0);

    eventBus.emit('screen-changed', { screen: 'menu' });
    await Promise.resolve();

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
    await Promise.resolve();

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
    expect(audio.fileTrackState.currentScreen).toBe('menu');

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
    expect(audio.fileTrackState.currentScreen).toBe('menu');
  });

  it('keeps track gain separate from master and music volume propagation', async () => {
    const { audio, eventBus } = createMenuMusicHarness();

    eventBus.emit('screen-changed', { screen: 'menu' });
    await audio.init();
    await Promise.resolve();

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
    expect(trackGain.connect).toHaveBeenCalledWith(audio.musicGain);

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

  it('supports explicit warmup for deferred tracks and crossfades handoff', async () => {
    vi.useFakeTimers();

    const { audio, context, eventBus, mediaElements } = createMenuMusicHarness();

    audio.fileTrackCatalog.boss = {
      src: 'boss-theme.mp3',
      loop: true,
      fadeInMs: 600,
      fadeOutMs: 300,
      preloadPolicy: 'deferred',
    };

    expect(mediaElements).toHaveLength(1);

    audio.warmupFileTrack('boss');

    expect(mediaElements).toHaveLength(2);
    expect(mediaElements[1].load).toHaveBeenCalledTimes(1);

    eventBus.emit('screen-changed', { screen: 'menu' });
    await audio.init();
    await Promise.resolve();

    const menuElement = mediaElements[0];

    audio.playFileTrack('boss');
    await Promise.resolve();

    expect(audio.fileTrackState.activeTrackId).toBe('boss');
    expect(mediaElements[1].play).toHaveBeenCalledTimes(1);
    expect(context.createMediaElementSource).toHaveBeenCalledTimes(2);
    expect(menuElement.pause).not.toHaveBeenCalled();

    vi.advanceTimersByTime(audio.menuTrackConfig.fadeOutMs);

    expect(menuElement.pause).toHaveBeenCalledTimes(1);
  });

  it('cleans up warmed file track resources on reset and destroy', async () => {
    const { audio, eventBus, mediaElements } = createMenuMusicHarness();

    audio.fileTrackCatalog.boss = {
      src: 'boss-theme.mp3',
      loop: true,
      fadeInMs: 600,
      fadeOutMs: 300,
      preloadPolicy: 'deferred',
    };

    audio.warmupFileTrack('boss');

    eventBus.emit('screen-changed', { screen: 'menu' });
    await audio.init();
    await Promise.resolve();

    const firstElement = mediaElements[0];
    const deferredElement = mediaElements[1];

    audio.ensureFileTrackGraph('boss');

    audio.reset();

    expect(firstElement.pause).toHaveBeenCalled();
    expect(deferredElement.pause).toHaveBeenCalled();
    expect(audio.menuTrackState.audioElement).toBeNull();
    expect(audio.menuTrackState.sourceNode).toBeNull();
    expect(audio.menuTrackState.trackGain).toBeNull();
    expect(audio.menuTrackState.isPlaying).toBe(false);
    expect(audio.fileTrackState.currentScreen).toBeNull();
    expect(audio._getFileTrackState('boss').audioElement).toBeNull();
    expect(audio._getFileTrackState('boss').sourceNode).toBeNull();
    expect(audio._getFileTrackState('boss').trackGain).toBeNull();

    eventBus.emit('screen-changed', { screen: 'menu' });
    await Promise.resolve();

    expect(mediaElements).toHaveLength(3);
    expect(audio.menuTrackState.audioElement).toBe(mediaElements[2]);

    audio.onDestroy();

    expect(mediaElements[2].pause).toHaveBeenCalled();
    expect(audio.menuTrackState.audioElement).toBeNull();
    expect(audio.menuTrackState.sourceNode).toBeNull();
    expect(audio.menuTrackState.trackGain).toBeNull();
    expect(audio.menuTrackState.isPlaying).toBe(false);
    expect(audio.fileTrackState.currentScreen).toBeNull();
  });
});
