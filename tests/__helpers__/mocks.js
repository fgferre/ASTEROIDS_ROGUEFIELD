import { vi } from 'vitest';
import { createGainStub, createOscillatorStub, createBufferSourceStub } from './stubs.js';

/**
 * Create a lightweight in-memory EventBus mock for deterministic tests.
 *
 * @param {{ withSpies?: boolean, includeEmitSilently?: boolean }} [options]
 *        Configure whether helpers are wrapped in `vi.fn` spies and if
 *        `emitSilently` should be exposed (mirroring the legacy helper).
 * @returns {{listeners: Map<string, Set<Function>>, on: Function & ReturnType<typeof vi.fn>, off: Function & ReturnType<typeof vi.fn>, emit: Function & ReturnType<typeof vi.fn>, clear: Function & ReturnType<typeof vi.fn>, emitSilently?: Function & ReturnType<typeof vi.fn>}}
 * @example
 * const eventBus = createEventBusMock();
 * const handler = vi.fn();
 * eventBus.on('test', handler);
 * eventBus.emit('test', { value: 1 });
 * expect(handler).toHaveBeenCalledWith({ value: 1 });
 */
export function createEventBusMock(options = {}) {
  const { withSpies = true, includeEmitSilently = true } = options;
  const listeners = new Map();

  const onImpl = (event, handler) => {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event).add(handler);
  };

  const offImpl = (event, handler) => {
    if (!listeners.has(event)) {
      return;
    }
    const handlers = listeners.get(event);
    handlers.delete(handler);
    if (handlers.size === 0) {
      listeners.delete(event);
    }
  };

  const emitImpl = (event, payload) => {
    if (!listeners.has(event)) {
      return;
    }
    for (const handler of listeners.get(event)) {
      handler(payload);
    }
  };

  const clearImpl = () => {
    listeners.clear();
  };

  const createSpyWrapper = (impl) => (withSpies ? vi.fn(impl) : impl);

  const eventBus = {
    listeners,
    on: createSpyWrapper(onImpl),
    off: createSpyWrapper(offImpl),
    emit: createSpyWrapper(emitImpl),
    clear: createSpyWrapper(clearImpl),
  };

  if (includeEmitSilently) {
    const emitSilentlyImpl = (event, payload) => eventBus.emit(event, payload);
    eventBus.emitSilently = createSpyWrapper(emitSilentlyImpl);
  }

  return eventBus;
}

/**
 * Create a ServiceRegistry mock compatible with the existing tests.
 *
 * @returns {{serviceRegistry: Map<string, any>, register: ReturnType<typeof vi.fn>, get: ReturnType<typeof vi.fn>, has: ReturnType<typeof vi.fn>, resolve: (name: string) => any}}
 * @example
 * const registry = createServiceRegistryMock();
 * registry.register('physics', {});
 * expect(registry.get('physics')).toEqual({});
 * expect(registry.resolve('physics')).toEqual({});
 */
export function createServiceRegistryMock() {
  const serviceRegistry = new Map();

  const register = vi.fn((name, service) => {
    serviceRegistry.set(name, service);
    return service;
  });

  const get = vi.fn((name) => serviceRegistry.get(name));
  const has = vi.fn((name) => serviceRegistry.has(name));

  return {
    serviceRegistry,
    register,
    get,
    has,
    resolve(name) {
      return get(name);
    },
  };
}

/**
 * Create a deterministic RandomService stub based on the integration test patterns.
 *
 * @param {string} [seed] - Optional seed for documentation purposes; the stub behaves deterministically regardless of the value.
 * @returns {{fork: () => any, float: () => number, range: (min: number, max: number) => number, int: (min: number, max: number) => number, chance: (probability: number) => boolean, pick: <T>(array: T[]) => T}}
 * @example
 * const random = createRandomServiceStub('example-seed');
 * random.float(); // 0.5
 */
export function createRandomServiceStub(seed) {
  void seed;

  return {
    fork() {
      return this;
    },
    float() {
      return 0.5;
    },
    range(min, max) {
      return (min + max) / 2;
    },
    int(min, max) {
      return Math.floor((min + max) / 2);
    },
    chance(probability) {
      return probability >= 0.5;
    },
    pick(array) {
      if (!array.length) {
        throw new Error('Cannot pick from an empty array');
      }
      return array[Math.floor(array.length / 2)];
    },
  };
}

/**
 * Create a stubbed audio system matching the expectations in audio tests.
 *
 * @returns {{safePlay: ReturnType<typeof vi.fn>, pool: {getOscillator: ReturnType<typeof vi.fn>, getGain: ReturnType<typeof vi.fn>, getBufferSource: ReturnType<typeof vi.fn>, returnGain: ReturnType<typeof vi.fn>}, connectGainNode: ReturnType<typeof vi.fn>, context: {currentTime: number}, masterGain: ReturnType<typeof createGainStub>, effectsGain: ReturnType<typeof createGainStub>, batcher: {enqueue: ReturnType<typeof vi.fn>, flush: ReturnType<typeof vi.fn>}}}
 * @example
 * const audioSystem = createAudioSystemStub();
 * audioSystem.safePlay(() => {});
 */
export function createAudioSystemStub() {
  const safePlay = vi.fn((callback) => {
    if (typeof callback === 'function') {
      callback();
    }
  });

  const masterGain = createGainStub();
  const effectsGain = createGainStub();

  return {
    safePlay,
    pool: {
      getOscillator: vi.fn(() => createOscillatorStub()),
      getGain: vi.fn(() => createGainStub()),
      getBufferSource: vi.fn(() => createBufferSourceStub()),
      returnGain: vi.fn(),
    },
    connectGainNode: vi.fn(),
    context: { currentTime: 0 },
    masterGain,
    effectsGain,
    batcher: {
      enqueue: vi.fn(),
      flush: vi.fn(),
    },
  };
}

/**
 * Create a spy-friendly game events mock backed by the event bus helpers.
 *
 * @returns {{listeners: Map<string, Set<Function>>, on: ReturnType<typeof vi.spyOn>, emit: ReturnType<typeof vi.spyOn>, off: ReturnType<typeof vi.spyOn>, clear: ReturnType<typeof vi.spyOn>, emitSilently: ReturnType<typeof vi.spyOn>}}
 * @example
 * const gameEvents = createGameEventsMock();
 * gameEvents.emit('player-moved', { x: 10 });
 */
export function createGameEventsMock() {
  return createEventBusMock({ includeEmitSilently: true, withSpies: true });
}
