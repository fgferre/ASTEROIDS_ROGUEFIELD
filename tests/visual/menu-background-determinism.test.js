import { describe, expect, it, vi } from 'vitest';
import MenuBackgroundSystem from '../../src/modules/MenuBackgroundSystem.js';
import { createTestContainer } from '../__helpers__/setup.js';

function createFrozenMathUtilsStub() {
  const mathUtils = {
    DEG2RAD: Math.PI / 180,
    RAD2DEG: 180 / Math.PI,
  };

  const originalGenerator = vi.fn(
    () => `cdn-${Math.random().toString(16).slice(2)}`
  );

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

  const originalGenerator = vi.fn(
    () => `module-${Math.random().toString(16).slice(2)}`
  );

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
    const container = createTestContainer(314159);
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
    const container = createTestContainer(424242);
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

function createAtmosphereTHREEStub() {
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  }

  return {
    AdditiveBlending: 2,
    Color: class { constructor() {} },
    PlaneGeometry: class { constructor() {} },
    ShaderMaterial: class { constructor() {} },
    Mesh: class {
      constructor() {
        this.position = new Vector3();
        this.rotation = new Vector3();
        this.userData = {};
      }
    },
    BufferGeometry: class {
      constructor() { this._attrs = {}; }
      setAttribute(name, attr) { this._attrs[name] = attr; }
    },
    BufferAttribute: class {
      constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; }
    },
    PointsMaterial: class { constructor() {} },
    Points: class {
      constructor(geometry) { this.geometry = geometry; }
    },
  };
}

function createAtmosphereSystem(seed) {
  const container = createTestContainer(seed);
  const random = container.resolve('random');
  const system = new MenuBackgroundSystem({ random });

  system.THREE = createAtmosphereTHREEStub();
  system.scene = { add() {} };
  system.createStarTexture = () => ({});
  system.ready = true;

  return system;
}

function createAtmosphereRuntime(seed) {
  const container = createTestContainer(seed);
  const random = container.resolve('random');
  const system = new MenuBackgroundSystem({ random });

  system.THREE = createAtmosphereTHREEStub();
  system.scene = { add() {} };
  system.createStarTexture = () => ({});
  system.ready = true;

  return { random, system };
}

function captureAtmosphereSnapshot(system) {
  return {
    rotations: system.nebulas.map((nebula) => nebula.rotation.z),
    dust: Array.from(system.dustSystem.geometry._attrs.position.array),
  };
}

describe('MenuBackgroundSystem atmosphere determinism (HV-05)', () => {
  it('two same-seed runs produce identical nebula rotations and dust positions', () => {
    const a = createAtmosphereSystem(999);
    const b = createAtmosphereSystem(999);

    a.createAtmosphere();
    b.createAtmosphere();

    // Nebula rotations must match
    expect(a.nebulas.length).toBe(2);
    expect(b.nebulas.length).toBe(2);
    for (let i = 0; i < a.nebulas.length; i++) {
      expect(a.nebulas[i].rotation.z).toBe(b.nebulas[i].rotation.z);
    }

    // Dust positions must match
    const aDust = a.dustSystem.geometry._attrs.position.array;
    const bDust = b.dustSystem.geometry._attrs.position.array;
    expect(aDust.length).toBe(bDust.length);
    for (let i = 0; i < aDust.length; i++) {
      expect(aDust[i]).toBe(bDust[i]);
    }
  });

  it('does not call Math.random() during createAtmosphere()', () => {
    const system = createAtmosphereSystem(42);
    const spy = vi.spyOn(Math, 'random');

    try {
      system.createAtmosphere();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('uses the injected random service for atmosphere forks', () => {
    const { random, system } = createAtmosphereRuntime(42);

    expect(system.random).toBe(random);
  });

  it('replays the same atmosphere after reset({ refreshForks: true })', () => {
    const system = createAtmosphereSystem(1337);

    system.createAtmosphere();
    const firstPass = captureAtmosphereSnapshot(system);

    system.reset({ refreshForks: true });
    system.createAtmosphere();

    expect(captureAtmosphereSnapshot(system)).toEqual(firstPass);
  });

  it('produces non-zero, non-trivial rotation and dust values', () => {
    const system = createAtmosphereSystem(42);
    system.createAtmosphere();

    // Rotations should be non-zero (seeded RNG actually ran)
    const hasNonZeroRotation = system.nebulas.some((n) => n.rotation.z !== 0);
    expect(hasNonZeroRotation).toBe(true);

    // Dust positions should contain non-zero values
    const dust = system.dustSystem.geometry._attrs.position.array;
    const hasNonZeroDust = dust.some((v) => v !== 0);
    expect(hasNonZeroDust).toBe(true);
  });
});

describe('MenuBackgroundSystem NASA asset fetching', () => {
  it('retries the next base candidate when a NASA asset request times out', async () => {
    vi.useFakeTimers();

    const system = createAtmosphereSystem(7);
    const expectedBuffer = new ArrayBuffer(8);
    const fetchMock = vi.fn((url, options = {}) => {
      if (url.includes('/broken/')) {
        return new Promise((resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(new Error('request aborted'));
          });
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        arrayBuffer: vi.fn(async () => expectedBuffer),
      });
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;

    try {
      const resultPromise = system.fetchNasaBinaryAsset(
        'stars.0.bin',
        ['/broken/', '/good/'],
        5
      );

      await vi.advanceTimersByTimeAsync(5);

      await expect(resultPromise).resolves.toBe(expectedBuffer);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toBe('/broken/nasa/stars.0.bin');
      expect(fetchMock.mock.calls[1][0]).toBe('/good/nasa/stars.0.bin');
    } finally {
      vi.useRealTimers();
      if (originalFetch === undefined) {
        delete globalThis.fetch;
      } else {
        globalThis.fetch = originalFetch;
      }
    }
  });
});
