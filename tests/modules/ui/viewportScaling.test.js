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

  it('HUD Scale really scales the HUD at a 1080p window, 130 % included', () => {
    const scaleAt = (hudScale) => {
      const set = {};
      vi.stubGlobal('window', {
        innerWidth: 1920,
        innerHeight: 1080,
        devicePixelRatio: 1,
        location: { search: '' },
        requestAnimationFrame: () => 1,
      });
      vi.stubGlobal('document', {
        documentElement: {
          style: { setProperty: (name, value) => (set[name] = value) },
        },
      });
      const viewport = new ViewportScaling({
        refs: { canvas: { width: 800, height: 600, style: {} } },
        hud: () => null,
      });
      viewport.updateViewportScaling({ force: true });
      viewport.setHudBaseScale(hudScale);
      return set['--hud-scale-effective'];
    };
    // 1.2 is the size the instruments are drawn at (--hud-u = 1).
    expect([0.8, 1, 1.3].map(scaleAt)).toEqual(['0.960', '1.200', '1.560']);
  });
});
