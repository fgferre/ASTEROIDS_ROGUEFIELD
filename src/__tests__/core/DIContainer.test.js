/**
 * Tests for DIContainer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DIContainer } from '../../core/DIContainer.js';

describe('DIContainer', () => {
  let container;

  beforeEach(() => {
    container = new DIContainer();
    container.verbose = false; // Disable logging in tests
  });

  describe('Registration', () => {
    it('should register a simple service', () => {
      container.register('test', () => ({ value: 42 }));

      expect(container.has('test')).toBe(true);
    });

    it('should throw error for invalid service name', () => {
      expect(() => container.register('', () => {})).toThrow();
      expect(() => container.register(null, () => {})).toThrow();
    });

    it('should throw error for non-function factory', () => {
      expect(() => container.register('test', 'not-a-function')).toThrow();
    });

    it('should throw error for duplicate registration', () => {
      container.register('test', () => ({}));
      expect(() => container.register('test', () => ({}))).toThrow();
    });

    it('should register service with dependencies', () => {
      container.register('dep', () => ({ name: 'dependency' }));
      container.register('service', (dep) => ({ dep }), {
        dependencies: ['dep']
      });

      expect(container.has('service')).toBe(true);
    });

    it('should support method chaining', () => {
      const result = container
        .register('a', () => ({}))
        .register('b', () => ({}))
        .register('c', () => ({}));

      expect(result).toBe(container);
      expect(container.getServiceNames()).toHaveLength(3);
    });
  });

  describe('Resolution', () => {
    it('should resolve a simple service', () => {
      container.register('test', () => ({ value: 42 }));
      const service = container.resolve('test');

      expect(service).toBeDefined();
      expect(service.value).toBe(42);
    });

    it('should return singleton instance on multiple resolves', () => {
      container.register('test', () => ({ value: Math.random() }), {
        singleton: true
      });

      const instance1 = container.resolve('test');
      const instance2 = container.resolve('test');

      expect(instance1).toBe(instance2);
      expect(instance1.value).toBe(instance2.value);
    });

    it('should return new instance for transient services', () => {
      let counter = 0;
      container.register('test', () => ({ id: ++counter }), {
        singleton: false
      });

      const instance1 = container.resolve('test');
      const instance2 = container.resolve('test');

      expect(instance1).not.toBe(instance2);
      expect(instance1.id).toBe(1);
      expect(instance2.id).toBe(2);
    });

    it('should resolve service with dependencies', () => {
      container.register('logger', () => ({
        log: (msg) => msg
      }));

      container.register('service', (logger) => ({
        logger,
        doSomething: () => logger.log('test')
      }), {
        dependencies: ['logger']
      });

      const service = container.resolve('service');

      expect(service.logger).toBeDefined();
      expect(service.doSomething()).toBe('test');
    });

    it('should resolve deep dependency chains', () => {
      container.register('a', () => ({ name: 'A' }));
      container.register('b', (a) => ({ name: 'B', a }), { dependencies: ['a'] });
      container.register('c', (b) => ({ name: 'C', b }), { dependencies: ['b'] });

      const c = container.resolve('c');

      expect(c.name).toBe('C');
      expect(c.b.name).toBe('B');
      expect(c.b.a.name).toBe('A');
    });

    it('should throw error for unregistered service', () => {
      expect(() => container.resolve('nonexistent')).toThrow();
    });

    it('should throw error for null/undefined factory return', () => {
      container.register('test', () => null);
      expect(() => container.resolve('test')).toThrow();
    });
  });

  describe('Circular Dependency Detection', () => {
    it('should detect direct circular dependency', () => {
      container.register('a', (b) => ({ b }), { dependencies: ['b'] });
      container.register('b', (a) => ({ a }), { dependencies: ['a'] });

      expect(() => container.resolve('a')).toThrow(/circular/i);
    });

    it('should detect indirect circular dependency', () => {
      container.register('a', (b) => ({ b }), { dependencies: ['b'] });
      container.register('b', (c) => ({ c }), { dependencies: ['c'] });
      container.register('c', (a) => ({ a }), { dependencies: ['a'] });

      expect(() => container.resolve('a')).toThrow(/circular/i);
    });

    it('should handle self-dependency as circular', () => {
      container.register('a', (a) => ({ a }), { dependencies: ['a'] });

      expect(() => container.resolve('a')).toThrow(/circular/i);
    });
  });

  describe('Validation', () => {
    it('should validate correct configuration', () => {
      container.register('a', () => ({}));
      container.register('b', (a) => ({ a }), { dependencies: ['a'] });

      const validation = container.validate();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect missing dependencies', () => {
      container.register('a', (missing) => ({ missing }), {
        dependencies: ['missing']
      });

      const validation = container.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toMatch(/missing/);
    });

    it('should detect circular dependencies in validation', () => {
      container.register('a', (b) => ({ b }), { dependencies: ['b'] });
      container.register('b', (a) => ({ a }), { dependencies: ['a'] });

      const validation = container.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.match(/circular/i))).toBe(true);
    });
  });

  describe('Lifecycle Management', () => {
    it('should check if service is instantiated', () => {
      container.register('test', () => ({}), { singleton: true });

      expect(container.isInstantiated('test')).toBe(false);

      container.resolve('test');

      expect(container.isInstantiated('test')).toBe(true);
    });

    it('should replace singleton instance', () => {
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
      container.register('test', () => ({}), { singleton: false });

      expect(() => container.replaceSingleton('test', {})).toThrow();
    });

    it('should unregister services', () => {
      container.register('test', () => ({}));

      expect(container.has('test')).toBe(true);

      const result = container.unregister('test');

      expect(result).toBe(true);
      expect(container.has('test')).toBe(false);
    });

    it('should clear all services', () => {
      container.register('a', () => ({}));
      container.register('b', () => ({}));
      container.register('c', () => ({}));

      expect(container.getServiceNames()).toHaveLength(3);

      container.clear();

      expect(container.getServiceNames()).toHaveLength(0);
    });
  });

  describe('Statistics', () => {
    it('should track registrations', () => {
      container.register('a', () => ({}));
      container.register('b', () => ({}));

      const stats = container.getStats();

      expect(stats.registrations).toBe(2);
    });

    it('should track resolutions', () => {
      container.register('test', () => ({}));

      container.resolve('test');
      container.resolve('test');

      const stats = container.getStats();

      expect(stats.resolutions).toBeGreaterThanOrEqual(1);
    });

    it('should track singleton hits', () => {
      container.register('test', () => ({}), { singleton: true });

      container.resolve('test'); // Miss
      container.resolve('test'); // Hit
      container.resolve('test'); // Hit

      const stats = container.getStats();

      expect(stats.singletonHits).toBe(2);
    });
  });

  describe('Child Containers', () => {
    it('should create child container with inherited factories', () => {
      container.register('a', () => ({ name: 'A' }));
      container.register('b', () => ({ name: 'B' }));

      const child = container.createChildContainer();

      expect(child.has('a')).toBe(true);
      expect(child.has('b')).toBe(true);
    });

    it('should have separate singleton instances in child', () => {
      container.register('test', () => ({ id: Math.random() }));

      const parentInstance = container.resolve('test');
      const child = container.createChildContainer();
      const childInstance = child.resolve('test');

      expect(parentInstance).not.toBe(childInstance);
    });
  });

  describe('Dependency Info', () => {
    it('should get dependency information', () => {
      container.register('logger', () => ({}));
      container.register('service', (logger) => ({ logger }), {
        dependencies: ['logger'],
        singleton: true
      });

      const info = container.getDependencies('service');

      expect(info).toBeDefined();
      expect(info.name).toBe('service');
      expect(info.dependencies).toContain('logger');
      expect(info.singleton).toBe(true);
    });

    it('should return null for non-existent service', () => {
      const info = container.getDependencies('nonexistent');

      expect(info).toBeNull();
    });
  });

  describe('Eager Initialization', () => {
    it('should initialize non-lazy services immediately', () => {
      let initialized = false;

      container.register('test', () => {
        initialized = true;
        return {};
      }, {
        lazy: false
      });

      expect(initialized).toBe(true);
    });

    it('should not initialize lazy services on registration', () => {
      let initialized = false;

      container.register('test', () => {
        initialized = true;
        return {};
      }, {
        lazy: true
      });

      expect(initialized).toBe(false);

      container.resolve('test');

      expect(initialized).toBe(true);
    });
  });
});
