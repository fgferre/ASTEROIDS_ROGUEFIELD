import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameDebugLogger } from '../../../src/utils/dev/GameDebugLogger.js';

// The development log lives in memory and leaves on request (download()):
// until 26/11/2026 it was also written to localStorage every second.
describe('GameDebugLogger', () => {
  let storage;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = { setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal('window', {
      localStorage: storage,
      addEventListener: vi.fn(),
    });
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: vi.fn(),
    });
    GameDebugLogger.isEnabled = false;
    GameDebugLogger.init();
  });

  afterEach(() => {
    GameDebugLogger.isEnabled = false;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('writes nothing to the browser storage', () => {
    for (let i = 0; i < 50; i++) {
      GameDebugLogger.log('T', `m${i}`);
    }
    vi.advanceTimersByTime(5000);

    expect(storage.setItem).not.toHaveBeenCalled();
    expect(GameDebugLogger.getLogContent()).toContain('m49');
  });

  it('keeps the last 50,000 lines, oldest first', () => {
    for (let i = 0; i < 50005; i++) {
      GameDebugLogger.log('T', `m${i}`);
    }

    const lines = GameDebugLogger.getLogContent().split('\n');
    expect(lines).toHaveLength(50000);
    expect(lines[0]).toMatch(/ m5$/);
    expect(lines.at(-1)).toMatch(/ m50004$/);
  });
});
