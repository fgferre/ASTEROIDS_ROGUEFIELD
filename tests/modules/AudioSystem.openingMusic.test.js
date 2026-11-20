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
    };
    // An early touch woke the audio: its init syncs the menu track.
    audio._syncMenuTrackForCurrentScreen();
    expect(audio.playFileTrack).not.toHaveBeenCalled();
    AUDIO_EVENT_HANDLERS.openingLeft(audio);
    expect(audio.playFileTrack).toHaveBeenCalledWith(
      FILE_TRACK_MANAGER_IDS.MENU_OPENING
    );
  });
});
