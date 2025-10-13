import { describe, expect, it, vi } from 'vitest';
import { ServiceRegistry } from '../../core/ServiceRegistry.js';
import MenuBackgroundSystem from '../../modules/MenuBackgroundSystem.js';

function createFrozenMathUtilsStub() {
  const mathUtils = {
    DEG2RAD: Math.PI / 180,
    RAD2DEG: 180 / Math.PI,
  };

  const originalGenerator = vi.fn(() => `cdn-${Math.random().toString(16).slice(2)}`);

  Object.defineProperty(mathUtils, 'generateUUID', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: originalGenerator,
  });

  Object.freeze(mathUtils);

  return { mathUtils, originalGenerator };
}

function createConfigurableMathUtilsStub() {
  const mathUtils = {
    DEG2RAD: Math.PI / 180,
    RAD2DEG: 180 / Math.PI,
  };

  const originalGenerator = vi.fn(() => `module-${Math.random().toString(16).slice(2)}`);

  Object.defineProperty(mathUtils, 'generateUUID', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: originalGenerator,
  });

  return { mathUtils, originalGenerator };
}

describe('MenuBackgroundSystem THREE UUID determinism', () => {
  it('replaces non-configurable MathUtils.generateUUID with deterministic generator', () => {
    const container = ServiceRegistry.createTestContainer({ randomSeed: 314159 });
    const random = container.resolve('random');
    const system = new MenuBackgroundSystem({ random });

    const { mathUtils, originalGenerator } = createFrozenMathUtilsStub();
    const threeStub = {
      MathUtils: mathUtils,
      Math: mathUtils,
    };

    system.THREE = threeStub;
    system.ready = true;

    const mathRandomSpy = vi.spyOn(Math, 'random');

    try {
      system.applyDeterministicThreeUuidGenerator();

      const patchedMathUtils = system.THREE.MathUtils;

      expect(patchedMathUtils).not.toBe(mathUtils);
      expect(Object.isFrozen(patchedMathUtils)).toBe(true);
      expect(patchedMathUtils.DEG2RAD).toBe(mathUtils.DEG2RAD);
      expect(system.THREE.Math).toBe(patchedMathUtils);

      const baseUuidSpy = vi.spyOn(system.random, 'uuid');
      const forkUuidSpy = vi.spyOn(system.randomForks.threeUuid, 'uuid');

      try {
        const first = patchedMathUtils.generateUUID();
        const second = patchedMathUtils.generateUUID();

        expect(first).not.toEqual(second);
        expect(forkUuidSpy).toHaveBeenCalledTimes(2);
        expect(baseUuidSpy).not.toHaveBeenCalled();
        expect(mathRandomSpy).not.toHaveBeenCalled();

        forkUuidSpy.mockClear();

        system.reset();

        expect(system.THREE.MathUtils).toBe(patchedMathUtils);
        patchedMathUtils.generateUUID();

        expect(forkUuidSpy).toHaveBeenCalledTimes(1);
        expect(baseUuidSpy).not.toHaveBeenCalled();
        expect(mathRandomSpy).not.toHaveBeenCalled();

        forkUuidSpy.mockClear();

        system.randomForks.threeUuid = null;
        const ensureSpy = vi.spyOn(system, 'ensureThreeUuidRandom');

        patchedMathUtils.generateUUID();

        expect(ensureSpy).toHaveBeenCalledTimes(1);
        ensureSpy.mockRestore();
        expect(system.randomForks.threeUuid).not.toBeNull();
        expect(forkUuidSpy).not.toHaveBeenCalled();
        expect(baseUuidSpy).not.toHaveBeenCalled();
        expect(mathRandomSpy).not.toHaveBeenCalled();
      } finally {
        baseUuidSpy.mockRestore();
        forkUuidSpy.mockRestore();
      }

      system.destroy();

      expect(system.THREE.MathUtils).toBe(mathUtils);
      expect(system.THREE.Math).toBe(mathUtils);

      system.THREE.MathUtils.generateUUID();

      expect(originalGenerator).toHaveBeenCalledTimes(1);
      expect(mathRandomSpy).toHaveBeenCalled();
    } finally {
      mathRandomSpy.mockRestore();
    }
  });
  it('patches configurable MathUtils.generateUUID in place without using Math.random', () => {
    const container = ServiceRegistry.createTestContainer({ randomSeed: 424242 });
    const random = container.resolve('random');
    const system = new MenuBackgroundSystem({ random });

    const { mathUtils, originalGenerator } = createConfigurableMathUtilsStub();
    const threeStub = {
      MathUtils: mathUtils,
      Math: mathUtils,
    };

    system.THREE = threeStub;
    system.ready = true;

    const mathRandomSpy = vi.spyOn(Math, 'random');

    try {
      system.applyDeterministicThreeUuidGenerator();

      expect(system.THREE.MathUtils).toBe(mathUtils);
      expect(system.THREE.Math).toBe(mathUtils);

      const forkUuidSpy = vi.spyOn(system.randomForks.threeUuid, 'uuid');

      try {
        const first = system.THREE.MathUtils.generateUUID();
        const second = system.THREE.MathUtils.generateUUID();

        expect(first).not.toEqual(second);
        expect(forkUuidSpy).toHaveBeenCalledTimes(2);
        expect(originalGenerator).not.toHaveBeenCalled();
        expect(mathRandomSpy).not.toHaveBeenCalled();
      } finally {
        forkUuidSpy.mockRestore();
      }

      system.destroy();

      mathRandomSpy.mockClear();
      system.THREE.MathUtils.generateUUID();

      expect(originalGenerator).toHaveBeenCalledTimes(1);
      expect(mathRandomSpy).toHaveBeenCalled();
    } finally {
      mathRandomSpy.mockRestore();
    }
  });
});
