import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchGameBox } from '../../src/core/viewport.js';

describe('watchGameBox', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('turns a new size of the game box into a window resize once the window reports it', () => {
    let report;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback) {
          report = (width, height) =>
            callback([{ contentRect: { width, height } }]);
        }
        observe() {}
      }
    );
    const frames = [];
    const win = {
      innerWidth: 750,
      innerHeight: 402,
      dispatchEvent: vi.fn(),
      requestAnimationFrame: (fn) => frames.push(fn),
    };
    vi.stubGlobal('window', win);
    const nextFrame = () => frames.shift()();

    watchGameBox({});
    // iOS: the box is already sideways, the window still says 750 wide.
    report(874, 402);
    expect(win.dispatchEvent).not.toHaveBeenCalled();
    nextFrame();
    expect(win.dispatchEvent).not.toHaveBeenCalled();
    win.innerWidth = 874; // a moment later, with no resize of its own
    nextFrame();
    expect(win.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(win.dispatchEvent.mock.calls[0][0].type).toBe('resize');
    expect(frames).toHaveLength(0);
  });
});
