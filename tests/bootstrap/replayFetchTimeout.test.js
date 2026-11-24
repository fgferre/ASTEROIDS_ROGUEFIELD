import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecorder } from '../../src/core/replay.js';
import {
  REPLAY_FETCH_TIMEOUT_MS,
  REPLAY_MAX_BYTES,
  fetchRecording,
} from '../../src/bootstrap/replaySession.js';

const stubPage = () =>
  vi.stubGlobal('window', {
    location: { href: 'https://game.test/play/', origin: 'https://game.test' },
  });

describe('fetchRecording', () => {
  beforeEach(stubPage);

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('rejects when the link never answers, instead of waiting forever', async () => {
    vi.useFakeTimers();
    // A fetch that only ends when it is aborted.
    vi.stubGlobal(
      'fetch',
      (url, { signal } = {}) =>
        new Promise((resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    const result = fetchRecording('https://example.test/r.json');
    const settled = expect(result).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(REPLAY_FETCH_TIMEOUT_MS + 1);
    await settled;
  });
});

describe('fetchRecording guards', () => {
  beforeEach(stubPage);

  const recording = JSON.stringify(
    createRecorder({ seed: 1, hull: 'default' }).toJSON()
  );

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const answer = (body, headers = {}) => {
    const fetchSpy = vi.fn(async () => new Response(body, { headers }));
    vi.stubGlobal('fetch', fetchSpy);
    return fetchSpy;
  };

  it('resolves a relative link against the page', async () => {
    const fetchSpy = answer(recording);
    await fetchRecording('r.json');
    expect(fetchSpy.mock.calls[0][0]).toBe('https://game.test/play/r.json');
  });

  it('reads a link on another site over https', async () => {
    answer(recording);
    await expect(
      fetchRecording('https://example.test/r.json')
    ).resolves.toMatchObject({ seed: 1 });
  });

  it.each(['http://example.test/r.json', 'data:text/plain,{}', 'file:///r'])(
    'refuses %s without fetching',
    async (url) => {
      const fetchSpy = answer(recording);
      await expect(fetchRecording(url)).rejects.toThrow(/replay/);
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it('refuses a body that declares more than 5 MB', async () => {
    answer(recording, { 'content-length': String(REPLAY_MAX_BYTES + 1) });
    await expect(fetchRecording('https://example.test/r')).rejects.toThrow(
      /too large/
    );
  });

  it('stops reading a body that grows past 5 MB without declaring it', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const body = new ReadableStream({
      pull(controller) {
        sent += 1;
        if (sent > 20) controller.close();
        else controller.enqueue(chunk);
      },
    });
    answer(body);
    await expect(fetchRecording('https://example.test/r')).rejects.toThrow(
      /too large/
    );
    expect(sent).toBeLessThan(10);
  });
});
