import { describe, expect, it, vi } from 'vitest';
import { registerAudioEventCues } from '../../../src/modules/audio/eventDispatch.js';
import { sampleIdFor } from '../../../src/modules/audio/samplePlayer.js';
import { FILE_TRACK_IDS } from '../../../src/modules/audio/FileTrackManager.js';
import { ENDING_SECTOR } from '../../../src/data/story.js';

// The ending's sound: its music from act 1, three beats with a sample each.
function setup() {
  const listeners = new Map();
  const audio = {
    playFileTrack: vi.fn(),
    stopFileTrack: vi.fn(),
    sectorScore: { stop: vi.fn() },
    sfxBus: { playEndingBeat: vi.fn() },
    registerEventListener: (name, fn) =>
      listeners.set(name, [...(listeners.get(name) ?? []), fn]),
  };
  registerAudioEventCues(audio);
  const emit = (name, payload) =>
    listeners.get(name)?.forEach((fn) => fn(payload));
  return { audio, emit };
}

describe('the ending music', () => {
  it("plays the choice's track as act 1 starts", () => {
    const { audio, emit } = setup();
    emit('cinematic-started', { kind: 'revelation' });
    expect(audio.playFileTrack).toHaveBeenCalledWith(
      FILE_TRACK_IDS.ENDING_CHOICE
    );
  });

  it("keeps the victory's track silent on the win that opens act 1", () => {
    // the game's order: the screens hear 'run-won' first and start act 1
    const { audio, emit } = setup();
    emit('cinematic-started', { kind: 'revelation' });
    emit('run-won', { sector: ENDING_SECTOR });
    expect(audio.playFileTrack.mock.calls).toEqual([
      [FILE_TRACK_IDS.ENDING_CHOICE],
    ]);
  });

  it("stops the victory's track if the audio heard the win first", () => {
    const { audio, emit } = setup();
    emit('run-won', { sector: ENDING_SECTOR });
    emit('cinematic-started', { kind: 'revelation' });
    expect(audio.stopFileTrack).toHaveBeenCalledWith(
      FILE_TRACK_IDS.VICTORY_FINAL,
      { immediate: true }
    );
    expect(audio.playFileTrack).toHaveBeenLastCalledWith(
      FILE_TRACK_IDS.ENDING_CHOICE
    );
  });

  it('gives the victory back its track once act 1 is over', () => {
    const { audio, emit } = setup();
    emit('cinematic-started', { kind: 'revelation' });
    emit('run-won', { sector: ENDING_SECTOR });
    emit('cinematic-ended', { kind: 'revelation' });
    audio.playFileTrack.mockClear();
    emit('run-won', { sector: ENDING_SECTOR });
    expect(audio.playFileTrack).toHaveBeenCalledWith(
      FILE_TRACK_IDS.VICTORY_FINAL
    );
  });

  it('leaves the other cinematics to their own music', () => {
    const { audio, emit } = setup();
    emit('cinematic-started', { kind: 'ending' });
    emit('cinematic-started', { kind: 'epilogue' });
    expect(audio.playFileTrack).not.toHaveBeenCalled();
  });

  it('a win that opens no choice still plays the victory', () => {
    const { audio, emit } = setup();
    emit('run-won', { sector: ENDING_SECTOR });
    expect(audio.playFileTrack).toHaveBeenCalledWith(
      FILE_TRACK_IDS.VICTORY_FINAL
    );
    audio.playFileTrack.mockClear();
    emit('run-won', { sector: 'debris-wake' });
    expect(audio.playFileTrack).not.toHaveBeenCalled();
  });
});

describe('the ending beats', () => {
  it.each([
    ['opens', 'sovereign-protect'],
    ['return', 'hatch-open'],
    ['depart', 'travel-ignite'],
  ])('beat %s plays %s once', (id, sample) => {
    const { audio, emit } = setup();
    emit('ending-beat', { id, ending: 'severance' });
    expect(audio.sfxBus.playEndingBeat).toHaveBeenCalledTimes(1);
    expect(sampleIdFor('playEndingBeat', [id])).toBe(sample);
  });

  it('every other beat is silent, twin included', () => {
    const { audio, emit } = setup();
    ['known', 'twin', 'watch'].forEach((id) => emit('ending-beat', { id }));
    expect(audio.sfxBus.playEndingBeat).not.toHaveBeenCalled();
    expect(sampleIdFor('playEndingBeat', ['twin'])).toBeNull();
  });
});
