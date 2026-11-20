import { describe, expect, it, vi } from 'vitest';
import { registerAudioEventCues } from '../../../src/modules/audio/eventDispatch.js';

// The owner's card som-cena-1 (19/11): the journey's music comes in under the
// story, its hit on the launch, and plays on through the journey after.
describe('the story music', () => {
  it('starts the journey cue at the hangar shot and keeps it for the journey', () => {
    const listeners = new Map();
    const journeyCue = { play: vi.fn(() => true), prefetch: vi.fn() };
    const sectorScore = { sectorId: 'debris-wake', holdForJourney: vi.fn() };
    const audio = {
      journeyCue,
      sectorScore,
      sfxBus: { playStoryMoment: vi.fn() },
      registerEventListener: (name, fn) =>
        listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    };
    registerAudioEventCues(audio);
    const emit = (name, payload) =>
      listeners.get(name)?.forEach((fn) => fn(payload));

    emit('story-moment', { id: 'hangar' });
    emit('travel-planned', { moments: [], duration: 10 });

    expect(journeyCue.play).toHaveBeenCalledTimes(1);
    expect(journeyCue.play.mock.calls[0][0].moments).toEqual([
      { id: 'leap', at: 4 },
    ]);
    expect(sectorScore.holdForJourney).toHaveBeenCalledWith(true);
  });
});
