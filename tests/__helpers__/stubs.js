import { vi } from 'vitest';

/**
 * Create a configurable deterministic random generator for focused unit tests.
 *
 * @param {{floatValue?: number, rangeValue?: number|((min: number, max: number) => number), intValue?: number, chanceValue?: boolean, pickValue?: any}} [options] - Overrides for the deterministic responses.
 * @returns {{float: () => number, range: (min: number, max: number) => number, int: (min: number, max: number) => number, chance: (probability: number) => boolean, fork: () => any, pick: <T>(array: T[]) => T}}
 * @example
 * const random = createDeterministicRandom({ intValue: 5, chanceValue: true });
 * random.int(0, 10); // 5
 *
 * @note The `fork()` method returns `this`, meaning all forks share the same state.
 *       This intentionally simplifies tests that don't require independent RNG sequences.
 *       For tests requiring independent forks, use `createRandomServiceStatefulStub()` instead.
 */
export function createDeterministicRandom(options = {}) {
  const {
    floatValue = 0,
    rangeValue,
    intValue = 1,
    chanceValue = false,
    pickValue,
  } = options;

  return {
    float() {
      return floatValue;
    },
    range(min, max) {
      if (typeof rangeValue === 'function') {
        return rangeValue(min, max);
      }
      if (typeof rangeValue === 'number') {
        return rangeValue;
      }
      return min;
    },
    int() {
      return intValue;
    },
    chance() {
      return Boolean(chanceValue);
    },
    fork() {
      return this;
    },
    pick(array) {
      if (Array.isArray(array) && array.length > 0) {
        return pickValue !== undefined ? pickValue : array[0];
      }
      throw new Error('Cannot pick from an empty array');
    },
  };
}

/**
 * Creates a stub of RandomService with serialize/restore/reset capabilities
 *
 * Used for tests that need to mock RandomService with state management.
 *
 * @param {Object} options - Configuration options
 * @param {number} [options.seed=123] - Initial seed value
 * @param {Object} [options.serializedState={ scope: 'stub', value: 123 }] - State returned from serialize()
 * @param {Object} [options.deterministic={}] - Overrides forwarded to createDeterministicRandom()
 * @param {string|(() => string)} [options.uuidValue='00000000-0000-0000-0000-000000000000'] - Stable UUID response or factory
 * @returns {Object} RandomService stub with vi.fn() methods
 *
 * @example
 * const random = createRandomServiceStatefulStub({ seed: 999 });
 * expect(random.serialize()).toEqual({ scope: 'stub', value: 123 });
 */
export function createRandomServiceStatefulStub(options = {}) {
  const {
    seed = 123,
    serializedState = { scope: 'stub', value: 123 },
    deterministic = {},
    uuidValue = '00000000-0000-0000-0000-000000000000',
  } = options;

  const deterministicRandom = createDeterministicRandom(deterministic);

  const stub = {
    serialize: vi.fn(() => serializedState),
    restore: vi.fn(),
    reset: vi.fn(),
    seed,
    float: vi.fn(() => deterministicRandom.float()),
    range: vi.fn((min, max) => deterministicRandom.range(min, max)),
    int: vi.fn((min, max) => deterministicRandom.int(min, max)),
    chance: vi.fn((probability) => deterministicRandom.chance(probability)),
    pick: vi.fn((array) => deterministicRandom.pick(array)),
    uuid: vi.fn(() => (typeof uuidValue === 'function' ? uuidValue() : uuidValue)),
  };

  stub.fork = vi.fn(() =>
    createRandomServiceStatefulStub({
      seed,
      serializedState,
      deterministic,
      uuidValue,
    })
  );

  return stub;
}

/**
 * Create a GainNode stub used across audio determinism tests.
 *
 * @returns {{connect: () => void, gain: {setValueAtTime: () => void, exponentialRampToValueAtTime: () => void}}}
 * @example
 * const gain = createGainStub();
 * gain.gain.setValueAtTime(0.5, 0);
 */
export function createGainStub() {
  return {
    connect() {},
    gain: {
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
    },
  };
}

/**
 * Create an OscillatorNode stub that captures frequency changes when provided.
 *
 * @param {{frequencyLog?: number[]}} [options] - Optional log array that records every frequency set call.
 * @returns {{connect: () => void, start: () => void, stop: () => void, frequency: {setValueAtTime: (value: number, time: number) => void}}}
 * @example
 * const log = [];
 * const oscillator = createOscillatorStub({ frequencyLog: log });
 * oscillator.frequency.setValueAtTime(440, 0);
 * expect(log).toContain(440);
 */
export function createOscillatorStub(options = {}) {
  const { frequencyLog } = options;

  return {
    connect() {},
    start() {},
    stop() {},
    frequency: {
      setValueAtTime(value) {
        if (Array.isArray(frequencyLog)) {
          frequencyLog.push(value);
        }
      },
      exponentialRampToValueAtTime() {},
    },
  };
}

/**
 * Create an AudioBufferSourceNode stub matching integration test expectations.
 *
 * @returns {{connect: () => void, start: () => void, stop: () => void, buffer: any}}
 * @example
 * const bufferSource = createBufferSourceStub();
 * bufferSource.start();
 */
export function createBufferSourceStub() {
  return {
    connect() {},
    start() {},
    stop() {},
    buffer: null,
  };
}

/**
 * Create a SettingsSystem stub with a deterministic getCategoryValues response.
 *
 * @param {any} [values=null] - Value returned by getCategoryValues.
 * @returns {{getCategoryValues: ReturnType<typeof vi.fn>}}
 * @example
 * const settings = createSettingsStub({ master: 0.8 });
 * expect(settings.getCategoryValues('audio')).toEqual({ master: 0.8 });
 */
export function createSettingsStub(values = null) {
  return {
    getCategoryValues: vi.fn(() => values),
  };
}

/**
 * Create an AudioContext stub compatible with the audio module tests.
 *
 * @param {{ sampleRate?: number }} [options] - Optional overrides for the stubbed context.
 * @returns {{ sampleRate: number, createBuffer: ReturnType<typeof vi.fn>, createBufferSource: ReturnType<typeof vi.fn> }}
 * @example
 * const context = createAudioContextStub({ sampleRate: 48000 });
 * const buffer = context.createBuffer(2, 256, 48000);
 */
export function createAudioContextStub(options = {}) {
  const { sampleRate = 44100 } = options;

  const createBuffer = vi.fn((channels, length, rate = sampleRate) => {
    const data = new Float32Array(length);
    return {
      numberOfChannels: channels,
      length,
      sampleRate: rate,
      getChannelData: vi.fn(() => data),
    };
  });

  const createBufferSource = vi.fn(() => ({
    buffer: null,
  }));

  return {
    sampleRate,
    createBuffer,
    createBufferSource,
  };
}
