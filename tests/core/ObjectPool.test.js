// src/__tests__/core/ObjectPool.test.js
import { describe, test, expect, beforeAll } from 'vitest';
import { ObjectPool } from '../../src/core/ObjectPool.js';

describe('ObjectPool', () => {
  const createPool = () =>
    new ObjectPool(
      () => ({ x: 0, y: 0, active: true }),
      (obj) => {
        obj.x = 0;
        obj.y = 0;
        obj.active = true;
      },
      5,
      20
    );

  // Optimization: describe.concurrent for suites without fake timers
  describe.concurrent('Initialization', () => {
    // Optimization: beforeAll instead of beforeEach (immutable setup for read-only tests)
    let initializationPool;

    beforeAll(() => {
      initializationPool = createPool();
    });

    test('should create pool with initial objects', () => {
      expect(initializationPool.getStats().available).toBe(5);
      expect(initializationPool.getStats().inUse).toBe(0);
      expect(initializationPool.getStats().totalCreated).toBe(5);
    });

    test('should throw error with invalid factory function', () => {
      expect(() => {
        new ObjectPool(null, () => {});
      }).toThrow('createFn must be a function');
    });

    test('should throw error with invalid reset function', () => {
      expect(() => {
        new ObjectPool(() => {}, null);
      }).toThrow('resetFn must be a function');
    });
  });

  describe.concurrent('Object Lifecycle', () => {
    test('should acquire object from pool', () => {
      const pool = createPool();
      const obj = pool.acquire();

      expect(obj).toBeDefined();
      expect(obj.x).toBe(0);
      expect(obj.y).toBe(0);
      expect(pool.getStats().available).toBe(4);
      expect(pool.getStats().inUse).toBe(1);
    });

    test('should reuse objects when released', () => {
      const pool = createPool();
      const obj1 = pool.acquire();
      obj1.x = 100;
      obj1.y = 200;

      pool.release(obj1);

      const obj2 = pool.acquire();

      // Should be same object, but reset
      expect(obj2).toBe(obj1);
      expect(obj2.x).toBe(0); // Reset by resetFn
      expect(obj2.y).toBe(0); // Reset by resetFn
    });

    test('should create new object when pool exhausted', () => {
      const pool = createPool();
      const objects = [];

      // Exhaust initial pool
      for (let i = 0; i < 5; i++) {
        objects.push(pool.acquire());
      }

      // This should create a new object
      pool.acquire();
      expect(pool.getStats().totalCreated).toBe(6);
      expect(pool.getStats().inUse).toBe(6);
    });

    test('should not release object not from this pool', () => {
      const pool = createPool();
      const foreignObj = { x: 0, y: 0 };
      const result = pool.release(foreignObj);

      expect(result).toBe(false);
    });
  });

  describe.concurrent('Pool Management', () => {
    test('should expand pool', () => {
      const pool = createPool();
      const initialSize = pool.getStats().totalSize;
      pool.expand(3);

      expect(pool.getStats().totalSize).toBe(initialSize + 3);
      expect(pool.getStats().available).toBe(8);
    });

    test('should release all objects', () => {
      const pool = createPool();
      pool.acquire();
      pool.acquire();

      pool.releaseAll();

      expect(pool.getStats().inUse).toBe(0);
      expect(pool.getStats().available).toBe(5);
    });

    test('should clear pool', () => {
      const pool = createPool();
      pool.acquire();
      pool.clear();

      expect(pool.getStats().available).toBe(0);
      expect(pool.getStats().inUse).toBe(0);
    });
  });

  describe.concurrent('Statistics', () => {
    // Optimization: beforeAll instead of beforeEach (immutable setup for read-only tests)
    let statsAfterHitRate;
    let validationResult;

    beforeAll(() => {
      const statsPool = new ObjectPool(
        () => ({ x: 0, y: 0, active: true }),
        (obj) => {
          obj.x = 0;
          obj.y = 0;
          obj.active = true;
        },
        5,
        20
      );

      const first = statsPool.acquire();
      statsPool.release(first);
      statsPool.acquire();
      statsAfterHitRate = statsPool.getStats();

      const validationPool = new ObjectPool(
        () => ({ x: 0, y: 0, active: true }),
        (obj) => {
          obj.x = 0;
          obj.y = 0;
          obj.active = true;
        },
        5,
        20
      );
      validationResult = validationPool.validate();
    });

    test('should track hit rate correctly', () => {
      expect(statsAfterHitRate.hitRate).toBe('50.0%'); // 1 hit out of 2 acquisitions
    });

    test('should validate pool integrity', () => {
      expect(validationResult.valid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);
    });
  });
});
