import { afterEach, describe, expect, it, vi } from 'vitest';
import { ViewportScaling } from '../../../src/modules/ui/viewportScaling.js';

describe('ViewportScaling', () => {
  afterEach(() => vi.unstubAllGlobals());

  // The game canvas after a resize to innerWidth × innerHeight.
  const fit = (innerWidth, innerHeight, devicePixelRatio) => {
    vi.stubGlobal('window', {
      innerWidth,
      innerHeight,
      devicePixelRatio,
      location: { search: '' },
    });
    vi.stubGlobal('document', {
      documentElement: { style: { setProperty: () => {} } },
    });
    const canvas = { width: 800, height: 600, style: {} };
    const viewport = new ViewportScaling({ refs: { canvas }, hud: () => null });
    viewport.updateViewportScaling({ force: true });
    return canvas;
  };

  it('sizes the canvas to the whole window, at any aspect', () => {
    for (const [width, height] of [
      [1024, 768],
      [1920, 1080],
      [2560, 1080],
      [900, 900],
    ]) {
      const canvas = fit(width, height, 1);
      expect(canvas.style).toEqual({
        width: `${width}px`,
        height: `${height}px`,
      });
      expect([canvas.width, canvas.height]).toEqual([width, height]);
    }
  });

  it('backs it at the device pixel ratio, capped at 2', () => {
    const retina = fit(1440, 900, 2);
    expect([retina.width, retina.height]).toEqual([2880, 1800]);
    const dense = fit(1280, 720, 3);
    expect([dense.width, dense.height]).toEqual([2560, 1440]);
    expect(dense.style.width).toBe('1280px');
  });
});
