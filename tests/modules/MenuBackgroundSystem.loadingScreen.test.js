import { describe, expect, it, vi } from 'vitest';
import MenuBackgroundSystem from '../../src/modules/MenuBackgroundSystem.js';
import { createTestContainer } from '../__helpers__/test-container.js';

function menuReadyToAnimate() {
  const random = createTestContainer('menu-loading').resolve('random');
  const system = new MenuBackgroundSystem({ random });
  Object.assign(system, {
    isActive: true,
    clock: { getDelta: () => 1 / 60 },
    stats: null,
    updateAdaptiveQuality: vi.fn(),
    opening: { update: vi.fn(), render: vi.fn() },
    hullPreview: { update: vi.fn(), useSky: vi.fn() },
    camera: { position: { x: 0, y: 0, z: 0 }, lookAt: vi.fn() },
  });
  return system;
}

describe('MenuBackgroundSystem behind the loading screen', () => {
  it('moves but does not draw until the loading screen goes, then draws before it hides', () => {
    const previousRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn(() => 1);
    try {
      const system = menuReadyToAnimate();
      const order = [];
      system.opening.render = vi.fn(() => order.push('render'));
      // The loading screen's element: hiding it adds the `hidden` class.
      const screen = {
        classList: { add: () => order.push('hide'), remove: () => {} },
        // the loading line
        querySelector: () => ({ classList: { toggle: () => {} } }),
      };
      vi.stubGlobal('document', { getElementById: () => screen });
      system.setupLoadingScreen();

      system.animate();
      system.animate();
      expect(system.opening.update).toHaveBeenCalledTimes(2);
      expect(order).toEqual([]);

      system.loadingState.onComplete();
      expect(order).toEqual(['render', 'hide']);

      system.animate();
      expect(order).toEqual(['render', 'hide', 'render']);
    } finally {
      globalThis.requestAnimationFrame = previousRaf;
      vi.unstubAllGlobals();
    }
  });
});
