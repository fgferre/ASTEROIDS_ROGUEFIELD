import { describe, expect, it, vi } from 'vitest';
import MenuBackgroundSystem from '../../src/modules/MenuBackgroundSystem.js';
import { createTestContainer } from '../__helpers__/setup.js';

function menuReadyToAnimate() {
  const random = createTestContainer('menu-loading').resolve('random');
  const system = new MenuBackgroundSystem({ random });
  Object.assign(system, {
    isActive: true,
    clock: { getDelta: () => 1 / 60 },
    stats: null,
    updateAdaptiveQuality: vi.fn(),
    spawnBeltAsteroid: vi.fn(),
    world: { step: vi.fn() },
    activeAsteroids: [],
    nebulas: null,
    dustSystem: null,
    updateExplosions: vi.fn(),
    impactEffect: null,
    hasProceduralAsteroids: false,
    customFX: null,
    composer: { render: vi.fn() },
    hullPreview: { update: vi.fn() },
    camera: { position: { x: 0, y: 0, z: 0 }, lookAt: vi.fn() },
  });
  system.config = { ...system.config, baseFieldCount: 0 };
  system.starfield = { updateStarLayers: vi.fn() };
  system.asteroidField = {
    updateAsteroids: vi.fn(),
    updateExplosions: vi.fn(),
  };
  return system;
}

describe('MenuBackgroundSystem behind the loading screen', () => {
  it('moves but does not draw until the loading screen goes, then draws before it hides', () => {
    const previousRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn(() => 1);
    try {
      const system = menuReadyToAnimate();
      const order = [];
      system.composer.render = vi.fn(() => order.push('render'));
      // The loading screen's element: hiding it adds the `hidden` class.
      const screen = {
        classList: { add: () => order.push('hide'), remove: () => {} },
      };
      vi.stubGlobal('document', { getElementById: () => screen });
      system.setupLoadingScreen();

      system.animate();
      system.animate();
      expect(system.world.step).toHaveBeenCalledTimes(2);
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
