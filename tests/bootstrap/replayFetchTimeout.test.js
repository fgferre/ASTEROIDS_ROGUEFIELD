import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REPLAY_FETCH_TIMEOUT_MS,
  fetchRecording,
} from '../../src/bootstrap/replaySession.js';

describe('fetchRecording', () => {
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
