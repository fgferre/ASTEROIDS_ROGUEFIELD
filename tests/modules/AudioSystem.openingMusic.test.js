import { describe, expect, it, vi } from 'vitest';
import AudioSystem from '../../src/modules/AudioSystem.js';
import { AUDIO_EVENT_HANDLERS } from '../../src/modules/audio/eventHandlers.js';
import { FILE_TRACK_IDS as FILE_TRACK_MANAGER_IDS } from '../../src/modules/audio/FileTrackManager.js';

describe('AudioSystem menu music behind the opening', () => {
  it('waits for the press that leaves the opening, even with the audio awake', () => {
    const audio = {
      openingHeld: true,
      fileTrackManager: { currentScreen: 'menu' },
      playFileTrack: vi.fn(),
      stopFileTrack: vi.fn(),
      _syncMenuTrackForCurrentScreen:
        AudioSystem.prototype._syncMenuTrackForCurrentScreen,
      _prefetchGate: null,
      _openPrefetchGate: AudioSystem.prototype._openPrefetchGate,
    };
    // An early touch woke the audio: its init syncs the menu track.
    audio._syncMenuTrackForCurrentScreen();
    expect(audio.playFileTrack).not.toHaveBeenCalled();
    AUDIO_EVENT_HANDLERS.openingLeft(audio);
    expect(audio.playFileTrack).toHaveBeenCalledWith(
      FILE_TRACK_MANAGER_IDS.MENU_OPENING
    );
  });

  it("holds the picked sector's prefetch until the menu's music can play through, the opening is left or the wait runs out", () => {
    vi.useFakeTimers();
    const gate = () => ({
      _prefetchGate: null,
      _closePrefetchGate: AudioSystem.prototype._closePrefetchGate,
      _openPrefetchGate: AudioSystem.prototype._openPrefetchGate,
      _afterMenuMusic: AudioSystem.prototype._afterMenuMusic,
    });
    const menuTrack = () => Object.assign(new EventTarget(), { readyState: 0 });

    // No menu track element (node): nothing waits.
    const bare = gate();
    bare._closePrefetchGate(null);
    const now = vi.fn();
    bare._afterMenuMusic(now);
    expect(now).toHaveBeenCalledTimes(1);

    // Only the latest pick is fetched once the menu track can play through.
    const audio = gate();
    const element = menuTrack();
    audio._closePrefetchGate(element);
    const first = vi.fn();
    const latest = vi.fn();
    audio._afterMenuMusic(first);
    audio._afterMenuMusic(latest);
    expect(latest).not.toHaveBeenCalled();
    element.dispatchEvent(new Event('canplaythrough'));
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
    const after = vi.fn();
    audio._afterMenuMusic(after);
    expect(after).toHaveBeenCalledTimes(1);

    // The press that leaves the opening opens it too.
    const pressed = gate();
    Object.assign(pressed, {
      fileTrackManager: { currentScreen: null },
      _syncMenuTrackForCurrentScreen: vi.fn(),
    });
    pressed._closePrefetchGate(menuTrack());
    const onPress = vi.fn();
    pressed._afterMenuMusic(onPress);
    AUDIO_EVENT_HANDLERS.openingLeft(pressed);
    expect(onPress).toHaveBeenCalledTimes(1);

    // A menu track that never arrives does not lose the prefetch.
    const stalled = gate();
    stalled._closePrefetchGate(menuTrack());
    const late = vi.fn();
    stalled._afterMenuMusic(late);
    vi.advanceTimersByTime(29000);
    expect(late).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(late).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
