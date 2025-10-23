// src/__tests__/core/ObjectPool.test.js
import { describe, test, expect, beforeAll, afterEach, vi } from 'vitest';
import { ObjectPool, TTLObjectPool } from '../../src/core/ObjectPool.js';

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
      const newObj = pool.acquire();
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

    test('should shrink pool', () => {
      const pool = createPool();
      pool.shrink(2);

      expect(pool.getStats().available).toBe(3);
    });

    test('should release all objects', () => {
      const pool = createPool();
      const obj1 = pool.acquire();
      const obj2 = pool.acquire();

      pool.releaseAll();

      expect(pool.getStats().inUse).toBe(0);
      expect(pool.getStats().available).toBe(5);
    });

    test('should clear pool', () => {
      const pool = createPool();
      const obj = pool.acquire();
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

  describe.concurrent('Auto Management', () => {
    test('should auto-expand when utilization is high', () => {
      const pool = createPool();
      // Acquire most objects to create high utilization
      for (let i = 0; i < 4; i++) {
        pool.acquire();
      }

      const initialSize = pool.getStats().totalSize;
      pool.autoManage({ targetUtilization: 0.5 });

      expect(pool.getStats().totalSize).toBeGreaterThan(initialSize);
    });

    test('should auto-shrink when utilization is low', () => {
      const pool = createPool();
      // Create many available objects
      pool.expand(10);

      const initialAvailable = pool.getStats().available;
      pool.autoManage({ targetUtilization: 0.7 });

      expect(pool.getStats().available).toBeLessThan(initialAvailable);
    });
  });
});


// Note: TTLObjectPool tests require sequential execution due to fake timer usage
describe.sequential('TTLObjectPool', () => {
  let ttlPool;

  beforeEach(() => {
    vi.useFakeTimers();
    ttlPool = new TTLObjectPool(
      () => ({ data: null }),
      (obj) => { obj.data = null; },
      3,
      10
    );
  });

  afterEach(() => {
    try {
      // no-op: pool state reset happens per test through fresh instantiation
    } finally {
      vi.useRealTimers();
    }
  });

  test('should acquire object with TTL', () => {
    const obj = ttlPool.acquire(1000); // 1 second TTL
    expect(obj).toBeDefined();
    expect(ttlPool.getStats().objectsWithTTL).toBe(1);
  });

  // Optimization: vi.useFakeTimers() to avoid real delays (60ms → instant)
  test('should release expired objects on update', () => {
    const obj = ttlPool.acquire(50); // 50ms TTL

    // Wait for expiration
    vi.advanceTimersByTime(60);

    ttlPool.update();

    expect(ttlPool.getStats().inUse).toBe(0);
    expect(ttlPool.getStats().objectsWithTTL).toBe(0);
  });

  test('should clear TTL tracking on manual release', () => {
    const obj = ttlPool.acquire(1000);
    ttlPool.release(obj);

    expect(ttlPool.getStats().objectsWithTTL).toBe(0);
  });
});