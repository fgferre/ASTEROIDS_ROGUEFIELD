import { describe, expect, it, vi } from 'vitest';
import { registerAudioEventCues } from '../../../src/modules/audio/eventDispatch.js';
import { STORY_CUE } from '../../../src/data/audio/sectorScores.js';

// The owner's cards som-cena-1 and som-cena-2 (19/11): the story's own
// music from its first shot, on through the journey after it, with the
// sector's held until that journey ends.
function setup() {
  const listeners = new Map();
  const holds = [];
  const audio = {
    journeyCue: {
      play: vi.fn(() => true),
      prefetch: vi.fn(),
      end: vi.fn(),
    },
    sectorScore: {
      sectorId: 'debris-wake',
      holdForJourney: (held) => holds.push(held),
    },
    sfxBus: new Proxy(
      { engine: { followStory() {}, stopStory() {} } },
      { get: (bus, key) => bus[key] ?? (() => {}) }
    ),
    registerEventListener: (name, fn) =>
      listeners.set(name, [...(listeners.get(name) ?? []), fn]),
  };
  registerAudioEventCues(audio);
  const emit = (name, payload) =>
    listeners.get(name)?.forEach((fn) => fn(payload));
  return { audio, holds, emit };
}

describe('the story music', () => {
  it('starts the story cue on the first shot and keeps it for the journey', () => {
    const { audio, emit } = setup();

    emit('story-moment', { id: 'wake' });
    emit('story-moment', { id: 'hangar' });
    emit('travel-planned', { moments: [], duration: 10 });

    expect(audio.journeyCue.play).toHaveBeenCalledTimes(1);
    expect(audio.journeyCue.play.mock.calls[0][0].url).toBe(STORY_CUE);
  });

  it("holds the sector's music until the journey after the story ends", () => {
    const { holds, emit } = setup();

    emit('story-moment', { id: 'wake' });
    emit('story-moment', { id: 'end' });
    emit('travel-planned', { moments: [], duration: 10 });
    expect(holds.at(-1)).toBe(true);

    emit('travel-moment', { id: 'end' });
    expect(holds.at(-1)).toBe(false);
  });
});
