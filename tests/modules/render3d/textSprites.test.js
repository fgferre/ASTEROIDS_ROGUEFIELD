import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextSprites } from '../../../src/modules/render3d/textSprites.js';

const context = () => ({
  measureText: () => ({ width: 20 }),
  strokeText() {},
  fillText() {},
});

describe('TextSprites', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('drops numbers baked in the fallback font once the fonts load', () => {
    const listeners = {};
    vi.stubGlobal('document', {
      fonts: {
        ready: new Promise(() => {}),
        addEventListener: (name, fn) => {
          listeners[name] = fn;
        },
      },
      createElement: () => ({ getContext: context }),
    });
    const disposed = vi.fn();
    const THREE = {
      Sprite: class {},
      SpriteMaterial: class {},
      CanvasTexture: class {
        dispose() {
          disposed();
        }
      },
      sRGBEncoding: 1,
    };
    const sprites = new TextSprites(THREE, { add() {} }, (make) => make(), 0);
    const first = sprites.texture(12, '#fff');
    expect(sprites.texture(12, '#fff')).toBe(first);
    listeners.loadingdone();
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(sprites.texture(12, '#fff')).not.toBe(first);
  });

  it('works where there is no document.fonts', () => {
    vi.stubGlobal('document', {});
    expect(
      () => new TextSprites({}, { add() {} }, (make) => make(), 0)
    ).not.toThrow();
  });
});
