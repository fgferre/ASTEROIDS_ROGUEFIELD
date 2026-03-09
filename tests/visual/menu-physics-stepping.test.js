import { describe, expect, it, vi } from 'vitest';
import MenuBackgroundSystem from '../../src/modules/MenuBackgroundSystem.js';
import { createTestContainer } from '../__helpers__/setup.js';

describe('F4: Menu physics stepping', () => {
  it('uses 30Hz stepping with max 1 catch-up during animate', () => {
    const container = createTestContainer('f4-step');
    const random = container.resolve('random');
    const system = new MenuBackgroundSystem({ random });

    const hadRaf = Object.prototype.hasOwnProperty.call(
      globalThis,
      'requestAnimationFrame'
    );
    const previousRaf = globalThis.requestAnimationFrame;
    const rafSpy = vi.fn(() => 1);
    globalThis.requestAnimationFrame = rafSpy;

    try {
      system.isActive = true;
      system.clock = { getDelta: () => 1 / 60 };
      system.stats = null;
      system.updateAdaptiveQuality = vi.fn();
      system.spawnRogueAsteroid = vi.fn();
      system.spawnBeltAsteroid = vi.fn();
      system.world = { step: vi.fn() };
      system.config = {
        ...system.config,
        rogueSpawnInterval: Number.POSITIVE_INFINITY,
        baseFieldCount: 0,
        cullingDistanceSqr: Number.POSITIVE_INFINITY,
      };
      system.activeAsteroids = [];
      system.objectsToDeactivate = [];
      system.nebulas = null;
      system.dustSystem = null;
      system.starLayers = [];
      system.updateExplosions = vi.fn();
      system.impactEffect = null;
      system.hasProceduralAsteroids = false;
      system.customFX = null;
      system.composer = { render: vi.fn() };
      system.camera = {
        position: { x: 0, y: 0, z: 0 },
        lookAt: vi.fn(),
      };
      system.elapsedTime = 0;
      system.rogueSpawnTimer = 0;

      system.animate();

      expect(rafSpy).toHaveBeenCalledTimes(1);
      expect(system.world.step).toHaveBeenCalledTimes(1);
      expect(system.world.step).toHaveBeenCalledWith(1 / 30, 1 / 60, 1);
      expect(system.composer.render).toHaveBeenCalledTimes(1);
      expect(system.spawnBeltAsteroid).not.toHaveBeenCalled();
    } finally {
      if (hadRaf) {
        globalThis.requestAnimationFrame = previousRaf;
      } else {
        delete globalThis.requestAnimationFrame;
      }
    }
  });
});
