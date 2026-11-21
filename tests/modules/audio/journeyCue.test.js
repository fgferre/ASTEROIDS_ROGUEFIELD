import { describe, expect, it, vi } from 'vitest';
import { createJourneyCue } from '../../../src/modules/audio/journeyCue.js';
import {
  JOURNEY_CUES,
  JOURNEY_CUE_HIT_SECONDS,
} from '../../../src/data/audio/sectorScores.js';

function setup() {
  const sources = [];
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const context = {
    currentTime: 10,
    state: 'running',
    createGain: () => ({
      ...node(),
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      },
    }),
    createBufferSource: () => {
      const source = { ...node(), start: vi.fn(), stop: vi.fn() };
      sources.push(source);
      return source;
    },
  };
  const load = vi.fn(async () => ({ duration: 18 }));
  const cue = createJourneyCue({
    getContext: () => context,
    getDestination: () => node(),
    load,
  });
  return { cue, sources, load, context };
}

describe('journeyCue: the recording of the destination chapter', () => {
  it('a jump journey to chapter 2 plays journey-dense-core with its hit on the leap', async () => {
    const { cue, sources, load } = setup();
    const L = 4.5;
    expect(
      cue.play({ chapter: 2, moments: [{ id: 'leap', at: L }], duration: 21 })
    ).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(load.mock.calls[0][1]).toBe(JOURNEY_CUES[2]);
    expect(JOURNEY_CUES[2]).toMatch(/journey-dense-core\.mp3$/);
    expect(sources[0].start).toHaveBeenCalledWith(
      10,
      JOURNEY_CUE_HIT_SECONDS - L
    );
  });

  it('a hop (no leap) starts the file at 0, and a skip fades it fast', async () => {
    const { cue, sources, context } = setup();
    cue.play({ chapter: 1, moments: [], duration: 10 });
    await Promise.resolve();
    await Promise.resolve();
    expect(sources[0].start).toHaveBeenCalledWith(10, 0);
    cue.end();
    expect(sources[0].stop).toHaveBeenCalledWith(context.currentTime + 0.15);
  });

  it('plays any recording by its url, fetched once when prefetched', async () => {
    const { cue, load } = setup();
    const url = 'https://example.test/story.mp3';

    cue.prefetch({ url });
    expect(cue.play({ url, duration: 0 })).toBe(true);
    await Promise.resolve();

    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][1]).toBe(url);
  });

  it('prefetched before the audio wakes, the file is fetched then and decoded once it plays', async () => {
    const { context, sources } = setup();
    let awake = null;
    const bytes = new ArrayBuffer(8);
    const fetchBytes = vi.fn(async () => bytes);
    const load = vi.fn(async () => ({ duration: 18 }));
    const cue = createJourneyCue({
      getContext: () => awake,
      getDestination: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
      load,
      fetchBytes,
    });
    const url = 'https://example.test/story.mp3';

    cue.prefetch({ url });
    expect(fetchBytes).toHaveBeenCalledWith(url);
    expect(load).not.toHaveBeenCalled();

    awake = context;
    expect(cue.play({ url, duration: 0 })).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchBytes).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await load.mock.calls[0][2]).toBe(bytes);
    expect(sources[0].start).toHaveBeenCalled();
  });
});
