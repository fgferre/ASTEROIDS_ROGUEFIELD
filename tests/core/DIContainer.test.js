/**
 * Tests for DIContainer
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { DIContainer } from '../../src/core/DIContainer.js';

describe('DIContainer', () => {
  const createContainer = () => {
    const container = new DIContainer();
    container.verbose = false; // Disable logging in tests
    return container;
  };

  // Note: vi.restoreAllMocks() handled by global setup (tests/__helpers__/setup.js)

  // Optimization: describe.concurrent (all describes are independent)
  describe.concurrent('Registration', () => {
    it('should register a simple service', () => {
      const container = createContainer();
      container.register('test', () => ({ value: 42 }));

      expect(container.has('test')).toBe(true);
    });

    it('should throw error for invalid service name', () => {
      const container = createContainer();
      expect(() => container.register('', () => {})).toThrow();
      expect(() => container.register(null, () => {})).toThrow();
    });

    it('should support legacy instance registration (non-function)', () => {
      const container = createContainer();
      const instance = { value: 42, type: 'legacy' };
      const result = container.register('test', instance);

      // Legacy registration also returns 'this' for method chaining
      expect(result).toBe(container);
      expect(container.has('test')).toBe(true);
      expect(container.get('test')).toBe(instance);
    });

    it('should throw error for duplicate registration', () => {
      const container = createContainer();
      container.register('test', () => ({}));
      expect(() => container.register('test', () => ({}))).toThrow();
    });

    it('should register service with dependencies', () => {
      const container = createContainer();
      container.register('dep', () => ({ name: 'dependency' }));
      container.register('service', (dep) => ({ dep }), {
        dependencies: ['dep'],
      });

      expect(container.has('service')).toBe(true);
    });

    it('should support method chaining', () => {
      const container = createContainer();
      const result = container
        .register('a', () => ({}))
        .register('b', () => ({}))
        .register('c', () => ({}));

      expect(result).toBe(container);
      expect(container.getServiceNames()).toHaveLength(3);
    });
  });

  describe.concurrent('Resolution', () => {
    it('should resolve a simple service', () => {
      const container = createContainer();
      container.register('test', () => ({ value: 42 }));
      const service = container.resolve('test');

      expect(service).toBeDefined();
      expect(service.value).toBe(42);
    });

    it('should return singleton instance on multiple resolves', () => {
      const container = createContainer();
      container.register('test', () => ({ value: Math.random() }), {
        singleton: true,
      });

      const instance1 = container.resolve('test');
      const instance2 = container.resolve('test');

      expect(instance1).toBe(instance2);
      expect(instance1.value).toBe(instance2.value);
    });

    it('should return new instance for transient services', () => {
      const container = createContainer();
      let counter = 0;
      container.register('test', () => ({ id: ++counter }), {
        singleton: false,
      });

      const instance1 = container.resolve('test');
      const instance2 = container.resolve('test');

      expect(instance1).not.toBe(instance2);
      expect(instance1.id).toBe(1);
      expect(instance2.id).toBe(2);
    });

    it('should resolve service with dependencies', () => {
      const container = createContainer();
      container.register('logger', () => ({
        log: (msg) => msg,
      }));

      container.register(
        'service',
        (logger) => ({
          logger,
          doSomething: () => logger.log('test'),
        }),
        {
          dependencies: ['logger'],
        }
      );

      const service = container.resolve('service');

      expect(service.logger).toBeDefined();
      expect(service.doSomething()).toBe('test');
    });

    it('should resolve deep dependency chains', () => {
      const container = createContainer();
      container.register('a', () => ({ name: 'A' }));
      container.register('b', (a) => ({ name: 'B', a }), {
        dependencies: ['a'],
      });
      container.register('c', (b) => ({ name: 'C', b }), {
        dependencies: ['b'],
      });

      const c = container.resolve('c');

      expect(c.name).toBe('C');
      expect(c.b.name).toBe('B');
      expect(c.b.a.name).toBe('A');
    });

    it('should throw error for unregistered service', () => {
      const container = createContainer();
      expect(() => container.resolve('nonexistent')).toThrow();
    });

    it('should throw error for null/undefined factory return', () => {
      const container = createContainer();
      container.register('test', () => null);
      expect(() => container.resolve('test')).toThrow();
    });
  });

  describe.concurrent('Circular Dependency Detection', () => {
    it('should detect direct circular dependency', () => {
      const container = createContainer();
      container.register('a', (b) => ({ b }), { dependencies: ['b'] });
      container.register('b', (a) => ({ a }), { dependencies: ['a'] });

      expect(() => container.resolve('a')).toThrow(/circular/i);
    });

    it('should detect indirect circular dependency', () => {
      const container = createContainer();
      container.register('a', (b) => ({ b }), { dependencies: ['b'] });
      container.register('b', (c) => ({ c }), { dependencies: ['c'] });
      container.register('c', (a) => ({ a }), { dependencies: ['a'] });

      expect(() => container.resolve('a')).toThrow(/circular/i);
    });

    it('should handle self-dependency as circular', () => {
      const container = createContainer();
      container.register('a', (a) => ({ a }), { dependencies: ['a'] });

      expect(() => container.resolve('a')).toThrow(/circular/i);
    });
  });

  describe.concurrent('Validation', () => {
    it('should validate correct configuration', () => {
      const container = createContainer();
      container.register('a', () => ({}));
      container.register('b', (a) => ({ a }), { dependencies: ['a'] });

      const validation = container.validate();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect missing dependencies', () => {
      const container = createContainer();
      container.register('a', (missing) => ({ missing }), {
        dependencies: ['missing'],
      });

      const validation = container.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toMatch(/missing/);
    });

    it('should detect circular dependencies in validation', () => {
      const container = createContainer();
      container.register('a', (b) => ({ b }), { dependencies: ['b'] });
      container.register('b', (a) => ({ a }), { dependencies: ['a'] });

      const validation = container.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.match(/circular/i))).toBe(true);
    });
  });

  describe.concurrent('Lifecycle Management', () => {
    it('should check if service is instantiated', () => {
      const container = createContainer();
      container.register('test', () => ({}), { singleton: true });

      expect(container.isInstantiated('test')).toBe(false);

      container.resolve('test');

      expect(container.isInstantiated('test')).toBe(true);
    });

    it('should replace singleton instance', () => {
      const container = createContainer();
      container.register('test', () => ({ value: 1 }), { singleton: true });

      const original = container.resolve('test');
      expect(original.value).toBe(1);

      const replacement = { value: 2 };
      container.replaceSingleton('test', replacement);

      const updated = container.resolve('test');
      expect(updated.value).toBe(2);
      expect(updated).toBe(replacement);
    });

    it('should not allow replacing non-singleton', () => {
      const container = createContainer();
      container.register('test', () => ({}), { singleton: false });

      expect(() => container.replaceSingleton('test', {})).toThrow();
    });

    it('should unregister services', () => {
      const container = createContainer();
      container.register('test', () => ({}));

      expect(container.has('test')).toBe(true);

      const result = container.unregister('test');

      expect(result).toBe(true);
      expect(container.has('test')).toBe(false);
    });

    it('should clear all services', () => {
      const container = createContainer();
      container.register('a', () => ({}));
      container.register('b', () => ({}));
      container.register('c', () => ({}));

      expect(container.getServiceNames()).toHaveLength(3);

      container.clear();

      expect(container.getServiceNames()).toHaveLength(0);
    });
  });

  describe.concurrent('Statistics', () => {
    // Optimization: beforeAll instead of beforeEach (immutable setup for read-only tests)
    let statsAfterRegistrations;
    let statsAfterResolutions;
    let statsAfterSingletonHits;

    beforeAll(() => {
      const registrationsContainer = createContainer();
      registrationsContainer.register('a', () => ({}));
      registrationsContainer.register('b', () => ({}));
      statsAfterRegistrations = registrationsContainer.getStats();

      const resolutionsContainer = createContainer();
      resolutionsContainer.register('test', () => ({}));
      resolutionsContainer.resolve('test');
      resolutionsContainer.resolve('test');
      statsAfterResolutions = resolutionsContainer.getStats();

      const singletonContainer = createContainer();
      singletonContainer.register('test', () => ({}), { singleton: true });
      singletonContainer.resolve('test');
      singletonContainer.resolve('test');
      singletonContainer.resolve('test');
      statsAfterSingletonHits = singletonContainer.getStats();
    });

    it('should track registrations', () => {
      expect(statsAfterRegistrations.registrations).toBe(2);
    });

    it('should track resolutions', () => {
      expect(statsAfterResolutions.resolutions).toBeGreaterThanOrEqual(1);
    });

    it('should track singleton hits', () => {
      expect(statsAfterSingletonHits.singletonHits).toBe(2);
    });
  });

  describe.concurrent('Child Containers', () => {
    it('should create child container with inherited factories', () => {
      const container = createContainer();
      container.register('a', () => ({ name: 'A' }));
      container.register('b', () => ({ name: 'B' }));

      const child = container.createChildContainer();

      expect(child.has('a')).toBe(true);
      expect(child.has('b')).toBe(true);
    });

    it('should have separate singleton instances in child', () => {
      const container = createContainer();
      container.register('test', () => ({ id: Math.random() }));

      const parentInstance = container.resolve('test');
      const child = container.createChildContainer();
      const childInstance = child.resolve('test');

      expect(parentInstance).not.toBe(childInstance);
    });
  });

  describe.concurrent('Dependency Info', () => {
    // Optimization: beforeAll instead of beforeEach (immutable setup for read-only tests)
    let dependencyInfo;
    let missingInfo;

    beforeAll(() => {
      const infoContainer = createContainer();
      infoContainer.register('logger', () => ({}));
      infoContainer.register('service', (logger) => ({ logger }), {
        dependencies: ['logger'],
        singleton: true,
      });
      dependencyInfo = infoContainer.getDependencies('service');

      const missingContainer = createContainer();
      missingInfo = missingContainer.getDependencies('nonexistent');
    });

    it('should get dependency information', () => {
      expect(dependencyInfo).toBeDefined();
      expect(dependencyInfo.name).toBe('service');
      expect(dependencyInfo.dependencies).toContain('logger');
      expect(dependencyInfo.singleton).toBe(true);
    });

    it('should return null for non-existent service', () => {
      expect(missingInfo).toBeNull();
    });
  });

  describe.concurrent('Eager Initialization', () => {
    it('should initialize non-lazy services immediately', () => {
      const container = createContainer();
      let initialized = false;

      container.register(
        'test',
        () => {
          initialized = true;
          return {};
        },
        {
          lazy: false,
        }
      );

      expect(initialized).toBe(true);
    });

    it('should not initialize lazy services on registration', () => {
      const container = createContainer();
      let initialized = false;

      container.register(
        'test',
        () => {
          initialized = true;
          return {};
        },
        {
          lazy: true,
        }
      );

      expect(initialized).toBe(false);

      container.resolve('test');

      expect(initialized).toBe(true);
    });
  });

  describe.concurrent('Legacy Compatibility - syncInstance', () => {
    it('should sync instance for unregistered service', () => {
      const container = createContainer();
      const legacyInstance = { value: 42, legacy: true };

      container.syncInstance('legacyService', legacyInstance);

      expect(container.has('legacyService')).toBe(true);
      expect(container.isInstantiated('legacyService')).toBe(true);
      expect(container.resolve('legacyService')).toBe(legacyInstance);
      expect(container.resolve('legacyService').value).toBe(42);
    });

    it('should replace singleton instance when service already registered as singleton', () => {
      const container = createContainer();
      const originalInstance = { value: 1 };
      const legacyInstance = { value: 42, legacy: true };

      container.register('test', () => originalInstance, { singleton: true });
      container.resolve('test'); // Initialize singleton

      expect(container.resolve('test').value).toBe(1);

      container.syncInstance('test', legacyInstance);

      expect(container.resolve('test')).toBe(legacyInstance);
      expect(container.resolve('test').value).toBe(42);
    });

    it('should not override transient service factory', () => {
      const container = createContainer();
      let factoryCallCount = 0;

      container.register(
        'transient',
        () => {
          factoryCallCount++;
          return { id: factoryCallCount };
        },
        {
          singleton: false,
        }
      );

      const legacyInstance = { id: 999, legacy: true };
      container.syncInstance('transient', legacyInstance);

      // Factory should still be called, not the synced instance
      const instance1 = container.resolve('transient');
      const instance2 = container.resolve('transient');

      expect(instance1).not.toBe(legacyInstance);
      expect(instance2).not.toBe(legacyInstance);
      expect(instance1.id).toBe(1);
      expect(instance2.id).toBe(2);
      expect(factoryCallCount).toBe(2);
    });

    it('should throw error for invalid service name', () => {
      const container = createContainer();
      const instance = {};

      expect(() => container.syncInstance('', instance)).toThrow();
      expect(() => container.syncInstance(null, instance)).toThrow();
    });

    it('should throw error for null/undefined instance', () => {
      const container = createContainer();

      expect(() => container.syncInstance('test', null)).toThrow(
        /null\/undefined/i
      );
      expect(() => container.syncInstance('test', undefined)).toThrow(
        /null\/undefined/i
      );
    });

    it('should update stats when syncing new service', () => {
      const container = createContainer();
      const initialStats = container.getStats();

      container.syncInstance('legacy', { value: 1 });

      const updatedStats = container.getStats();

      expect(updatedStats.registrations).toBe(initialStats.registrations + 1);
      expect(updatedStats.totalServices).toBe(initialStats.totalServices + 1);
    });
  });

  describe.concurrent('Legacy Compatibility - get', () => {
    it('should resolve service via get() method', () => {
      const container = createContainer();
      container.register('test', () => ({ value: 42 }));

      const instance = container.get('test');

      expect(instance).toBeDefined();
      expect(instance.value).toBe(42);
    });

    it('should return same instance as resolve()', () => {
      const container = createContainer();
      container.register('test', () => ({ value: 42 }), { singleton: true });

      const viaResolve = container.resolve('test');
      const viaGet = container.get('test');

      expect(viaGet).toBe(viaResolve);
    });
  });

  describe.concurrent('Migration Report', () => {
    it('should generate migration report', () => {
      const container = createContainer();
      container.register('a', () => ({}), { singleton: true });
      container.register('b', (a) => ({ a }), {
        dependencies: ['a'],
        singleton: true,
      });
      container.resolve('a'); // Instantiate only 'a'

      const report = container.getMigrationReport();

      // New structure includes summary, legacyServices, containerServices, recommendations
      expect(report.summary).toBeDefined();
      expect(report.summary.totalServices).toBe(2);
      expect(report.summary.instantiatedServices).toBe(1);
      expect(report.legacyServices).toBeDefined();
      expect(report.containerServices).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(report.services).toHaveLength(2);
      expect(report.services[0].name).toBe('a');
      expect(report.services[0].instantiated).toBe(true);
      expect(report.services[1].name).toBe('b');
      expect(report.services[1].instantiated).toBe(false);
    });

    it('should include dependency information in report', () => {
      const container = createContainer();
      container.register('logger', () => ({}));
      container.register('service', (logger) => ({ logger }), {
        dependencies: ['logger'],
      });

      const report = container.getMigrationReport();
      const serviceInfo = report.services.find((s) => s.name === 'service');

      expect(serviceInfo).toBeDefined();
      expect(serviceInfo.dependencies).toContain('logger');
      expect(serviceInfo.singleton).toBe(true);
    });
  });
});
