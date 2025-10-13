import { describe, expect, it, vi } from 'vitest';
import RandomService from '../../src/core/RandomService.js';
import MenuBackgroundSystem from '../../src/modules/MenuBackgroundSystem.js';

describe('MenuBackgroundSystem deterministic THREE random overrides', () => {
  it('replaces THREE.MathUtils random helpers without using Math.random', () => {
    const random = new RandomService(123456);
    const system = new MenuBackgroundSystem({ random });

    const mathRandomSpy = vi.spyOn(Math, 'random');

    try {
      const threeStub = {
        MathUtils: {
          randFloat: vi.fn(),
          randInt: vi.fn(),
          randFloatSpread: vi.fn(),
          seededRandom: vi.fn(),
          generateUUID: vi.fn(),
        },
        Math: {},
      };

      system.THREE = threeStub;
      system.installDeterministicThreeRandom();

      const firstFloat = threeStub.MathUtils.randFloat(10, 20);
      const firstUuid = threeStub.MathUtils.generateUUID();

      expect(mathRandomSpy).not.toHaveBeenCalled();
      expect(firstFloat).toBeGreaterThanOrEqual(10);
      expect(firstFloat).toBeLessThanOrEqual(20);
      expect(firstUuid).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);

      system.reseedRandomForks();

      const resetFloat = threeStub.MathUtils.randFloat(10, 20);
      const resetUuid = threeStub.MathUtils.generateUUID();

      expect(resetFloat).toBe(firstFloat);
      expect(resetUuid).toBe(firstUuid);
    } finally {
      mathRandomSpy.mockRestore();
    }
  });
});
