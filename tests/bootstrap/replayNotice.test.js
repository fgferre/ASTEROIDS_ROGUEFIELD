import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showReplayNotice } from '../../src/bootstrap/replaySession.js';

describe('showReplayNotice', () => {
  let shown;
  let window;
  let press;

  beforeEach(() => {
    shown = [];
    const listeners = {};
    window = { addEventListener: (type, fn) => (listeners[type] = fn) };
    press = (type) => listeners[type]?.();
    // The test environment is node: a minimal stand-in for the page.
    vi.stubGlobal('document', {
      createElement: () => ({
        style: {},
        remove() {
          shown.splice(shown.indexOf(this), 1);
        },
      }),
      body: { appendChild: (el) => shown.push(el) },
    });
    vi.stubGlobal('window', window);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('says an old recording is too old, until the first key', () => {
    showReplayNotice(new Error('[replay] Unsupported recording version 7'));
    expect(shown.map((el) => el.textContent)).toEqual([
      "This replay was made with an older version of the game and can't be played.",
    ]);
    press('keydown');
    expect(shown).toEqual([]);
  });

  it('says any other failure could not be loaded', () => {
    showReplayNotice(new Error('[replay] x: HTTP 404'));
    expect(shown.map((el) => el.textContent)).toEqual([
      "This replay couldn't be loaded.",
    ]);
  });
});
