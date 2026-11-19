import { describe, expect, it, vi } from 'vitest';
import MenuBackgroundSystem from '../../src/modules/MenuBackgroundSystem.js';
import { createTestContainer } from '../__helpers__/setup.js';

function menuWithStubs() {
  const random = createTestContainer('menu-resize').resolve('random');
  const system = new MenuBackgroundSystem({ random });
  Object.assign(system, {
    ready: true,
    isActive: false,
    loadingState: { isLoading: false, isReady: true },
    clock: { start: vi.fn(), stop: vi.fn(), getDelta: vi.fn() },
    syncHullPreview: vi.fn(),
    camera: { aspect: 1, updateProjectionMatrix: vi.fn() },
    getAspectRatio: () => 1.5,
    renderer: { setSize: vi.fn() },
    opening: { resize: vi.fn(), release: vi.fn() },
  });
  return system;
}

describe('MenuBackgroundSystem resize and stop', () => {
  it('ignores a resize while stopped, applies the size on start, and releases on stop', () => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1)
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 760 });
    try {
      const system = menuWithStubs();
      system.handleResize();
      expect(system.renderer.setSize).not.toHaveBeenCalled();
      expect(system.opening.resize).not.toHaveBeenCalled();

      system.start();
      expect(system.renderer.setSize).toHaveBeenCalledTimes(1);
      expect(system.opening.resize).toHaveBeenCalledTimes(1);

      system.stop();
      expect(system.opening.release).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
