import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameDebugLogger } from '../../../src/utils/dev/GameDebugLogger.js';

describe('GameDebugLogger persistence', () => {
  let storage;
  let listeners;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = { setItem: vi.fn(), removeItem: vi.fn() };
    listeners = {};
    vi.stubGlobal('window', {
      localStorage: storage,
      addEventListener: (name, fn) => {
        listeners[name] = fn;
      },
    });
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: (name, fn) => {
        listeners[name] = fn;
      },
    });
    GameDebugLogger.isEnabled = false;
    GameDebugLogger.lifecycleBound = false;
    GameDebugLogger.persistTimer = null;
    GameDebugLogger.init();
  });

  afterEach(() => {
    GameDebugLogger.isEnabled = false;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('writes once after the delay no matter how many logs', () => {
    for (let i = 0; i < 50; i++) {
      GameDebugLogger.log('T', `m${i}`);
    }
    expect(storage.setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem.mock.calls[0][1]).toBe(
      GameDebugLogger.getLogContent()
    );
  });

  it('flushes immediately on pagehide', () => {
    GameDebugLogger.log('T', 'last');
    listeners.pagehide();

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem.mock.calls[0][1]).toContain('last');
  });
});
