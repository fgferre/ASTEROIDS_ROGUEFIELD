import { describe, expect, it, vi } from 'vitest';
import { createSfxSynthPort } from '../../../src/modules/audio/SfxSynthPort.js';
import AudioSystem from '../../../src/modules/AudioSystem.js';
import AudioBatcher from '../../../src/modules/AudioBatcher.js';
import { createTestContainer } from '../../__helpers__/setup.js';

/**
 * 02.04 — SfxSynthPort + AudioBatcher cycle-break regression lock.
 *
 * Suite 0 (this file, Task 1): the port factory validates an EXPLICIT
 * functions object, freezes its surface, and late-binds pool/context.
 * Suites 1-3 (Task 3) add output-equivalence, per-mode API contract, and the
 * paranoia cycle assertion (batcher.audioSystem === undefined).
 */

function makeFns(overrides = {}) {
  return {
    playDroneFireDirect: vi.fn(),
    playHunterBurstDirect: vi.fn(),
    playMineExplosionDirect: vi.fn(),
    safePlay: vi.fn((fn) => fn && fn()),
    connectGainNode: vi.fn(),
    executeImmediate: vi.fn(),
    getPool: vi.fn(() => ({ pool: true })),
    getContext: vi.fn(() => ({ currentTime: 0 })),
    ...overrides,
  };
}

describe('createSfxSynthPort — explicit-functions factory', () => {
  const REQUIRED_KEYS = [
    'playDroneFireDirect',
    'playHunterBurstDirect',
    'playMineExplosionDirect',
    'safePlay',
    'connectGainNode',
    'executeImmediate',
    'getPool',
    'getContext',
  ];

  it('throws a descriptive error when called with a non-object', () => {
    expect(() => createSfxSynthPort(undefined)).toThrow(
      /requires an explicit functions object/
    );
    expect(() => createSfxSynthPort(null)).toThrow(
      /requires an explicit functions object/
    );
    expect(() => createSfxSynthPort('system')).toThrow(
      /requires an explicit functions object/
    );
  });

  it.each(REQUIRED_KEYS)(
    'throws naming the missing key when "%s" is absent',
    (missingKey) => {
      const fns = makeFns();
      delete fns[missingKey];
      expect(() => createSfxSynthPort(fns)).toThrow(
        new RegExp(`"${missingKey}"`)
      );
    }
  );

  it('throws naming the key when a required member is not a function', () => {
    const fns = makeFns({ safePlay: 'not-a-function' });
    expect(() => createSfxSynthPort(fns)).toThrow(/"safePlay"/);
  });

  it('returns a frozen surface', () => {
    const port = createSfxSynthPort(makeFns());
    expect(Object.isFrozen(port)).toBe(true);
  });

  it('exposes ONLY the 6 functions plus pool/context getters — no system, no underscore members', () => {
    const port = createSfxSynthPort(makeFns());
    const keys = Object.keys(port).sort();
    expect(keys).toEqual(
      [
        'connectGainNode',
        'context',
        'executeImmediate',
        'playDroneFireDirect',
        'playHunterBurstDirect',
        'playMineExplosionDirect',
        'pool',
        'safePlay',
      ].sort()
    );
    // Paranoia: the system must be structurally unreachable through the port.
    expect(keys).not.toContain('system');
    expect(keys.some((key) => key.startsWith('_'))).toBe(false);
  });

  it('forwards the 5 call-through functions to the supplied callbacks', () => {
    const fns = makeFns();
    const port = createSfxSynthPort(fns);

    const drone = { frequency: 680 };
    const hunter = { concurrency: 2 };
    const mine = { clusterSize: 3 };
    const playFn = () => {};
    const gainNode = { connect: () => {} };

    port.playDroneFireDirect(drone);
    port.playHunterBurstDirect(hunter);
    port.playMineExplosionDirect(mine);
    port.safePlay(playFn);
    port.connectGainNode(gainNode);

    expect(fns.playDroneFireDirect).toHaveBeenCalledWith(drone);
    expect(fns.playHunterBurstDirect).toHaveBeenCalledWith(hunter);
    expect(fns.playMineExplosionDirect).toHaveBeenCalledWith(mine);
    expect(fns.safePlay).toHaveBeenCalledWith(playFn);
    expect(fns.connectGainNode).toHaveBeenCalledWith(gainNode);
  });

  it('late-binds pool/context — reflects CURRENT getPool()/getContext() values after they change', () => {
    let currentPool = { id: 'pool-1' };
    let currentContext = { id: 'ctx-1' };

    const port = createSfxSynthPort(
      makeFns({
        getPool: () => currentPool,
        getContext: () => currentContext,
      })
    );

    expect(port.pool).toBe(currentPool);
    expect(port.context).toBe(currentContext);

    // pool/context are assigned during AudioSystem.init — the port must reflect
    // the new values, not a snapshot taken at construction time.
    currentPool = { id: 'pool-2' };
    currentContext = { id: 'ctx-2' };

    expect(port.pool).toEqual({ id: 'pool-2' });
    expect(port.context).toEqual({ id: 'ctx-2' });
  });
});

/**
 * Synth-param capture harness.
 *
 * Records EVERY synth parameter touched during playback — oscillator type,
 * frequency setValueAtTime / exponentialRampToValueAtTime, and gain
 * setValueAtTime / exponentialRampToValueAtTime — into a flat, rounded log.
 * Equivalence is asserted on this full log (not just the initial frequency),
 * so the proof is genuinely byte-identical synth output, not mere routing.
 */
function createSynthHarness(seed) {
  const container = createTestContainer(seed);
  const random = container.resolve('random');

  const audioSystem = new AudioSystem({
    random,
    settings: { get: () => null, set: () => {} },
  });

  const log = [];
  const round = (v) => (typeof v === 'number' ? Number(v.toFixed(6)) : v);

  function recordingOscillator() {
    const osc = {
      _type: 'sine',
      get type() {
        return osc._type;
      },
      set type(value) {
        osc._type = value;
        log.push(['osc.type', value]);
      },
      connect: () => {},
      disconnect: () => {},
      start: () => {},
      stop: () => {},
      detune: { setValueAtTime: () => {} },
      frequency: {
        setValueAtTime: (value) => log.push(['osc.freq.set', round(value)]),
        linearRampToValueAtTime: (value) =>
          log.push(['osc.freq.lramp', round(value)]),
        exponentialRampToValueAtTime: (value) =>
          log.push(['osc.freq.eramp', round(value)]),
      },
    };
    return osc;
  }

  function recordingGain() {
    return {
      connect: () => {},
      disconnect: () => {},
      gain: {
        value: 0,
        setValueAtTime: (value) => log.push(['gain.set', round(value)]),
        linearRampToValueAtTime: (value) =>
          log.push(['gain.lramp', round(value)]),
        exponentialRampToValueAtTime: (value) =>
          log.push(['gain.eramp', round(value)]),
        cancelScheduledValues: () => {},
      },
    };
  }

  function recordingBufferSource() {
    return {
      buffer: null,
      loop: false,
      connect: () => {},
      disconnect: () => {},
      start: () => {},
      stop: () => {},
    };
  }

  audioSystem.context = {
    state: 'running',
    currentTime: 0,
    sampleRate: 44100,
    createBuffer: (channels, length, sampleRate) => ({
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length),
    }),
    createBiquadFilter: () => ({
      type: 'lowpass',
      connect: () => {},
      disconnect: () => {},
      frequency: { setValueAtTime: () => {} },
      Q: { setValueAtTime: () => {} },
    }),
    createBufferSource: () => recordingBufferSource(),
  };
  audioSystem.initialized = true;
  audioSystem.masterGain = recordingGain();
  audioSystem.effectsGain = recordingGain();
  audioSystem.pool = {
    getOscillator: () => recordingOscillator(),
    getGain: () => recordingGain(),
    getBufferSource: () => recordingBufferSource(),
    returnGain: () => {},
  };
  // cache disabled so mine-explosion noise buffer is synthesized through the
  // seeded RNG path (deterministic, same on both direct and port paths).
  audioSystem.cache = null;

  audioSystem.batcher = new AudioBatcher(audioSystem._createSfxSynthPort(), 0, {
    random: audioSystem.randomScopes?.batcher || random,
  });
  audioSystem.captureRandomScopes({ refreshForks: true });

  function resetSeed() {
    random.reset(random.seed);
    audioSystem.reseedRandomScopes({ refreshForks: true });
    if (audioSystem.batcher?.activeSounds?.clear) {
      audioSystem.batcher.activeSounds.clear();
    }
    audioSystem.batcher.pendingBatches?.clear?.();
    audioSystem.batcher.pendingFlushes?.clear?.();
  }

  return { audioSystem, random, log, resetSeed };
}

// The three batched SFX the port forwards, with a representative payload each.
const BATCHED_SOUNDS = [
  {
    soundType: 'playDroneFire',
    directMethod: '_playDroneFireDirect',
    payload: {
      frequency: 700,
      detune: 12,
      duration: 0.1,
      intensity: 0.7,
      gain: 0.12,
    },
  },
  {
    soundType: 'playHunterBurst',
    directMethod: '_playHunterBurstDirect',
    payload: {
      shotCount: 3,
      spacing: 0.05,
      duration: 0.09,
      concurrency: 2,
      baseFrequency: 760,
      frequencyJitter: 60,
      intensity: 0.8,
      gain: 0.15,
    },
  },
  {
    soundType: 'playMineExplosion',
    directMethod: '_playMineExplosionDirect',
    payload: {
      duration: 0.5,
      clusterSize: 2,
      intensity: 0.9,
      startFrequency: 90,
      endFrequency: 36,
      noiseGain: 0.25,
      rumbleGain: 0.24,
    },
  },
];

describe('02.04 Suite 1 — output equivalence (port path === direct path)', () => {
  it.each(BATCHED_SOUNDS)(
    'produces byte-identical synth params for $soundType through the port vs the direct method',
    async ({ soundType, directMethod, payload }) => {
      const seed = 4242;

      // DIRECT PATH: call the private synth method straight, capturing params.
      const direct = createSynthHarness(seed);
      direct.resetSeed();
      direct.audioSystem[directMethod](payload);
      await Promise.resolve();
      const directLog = [...direct.log];
      expect(directLog.length).toBeGreaterThan(0);

      // PORT PATH: schedule the SAME payload via the batcher (size-1 flush →
      // port.executeImmediate → _executeBatchedSound → same direct method).
      const ported = createSynthHarness(seed);
      ported.resetSeed();
      ported.audioSystem.batcher.scheduleSound(soundType, payload, {
        allowOverlap: true,
      });
      ported.audioSystem.batcher.flushPendingBatches();
      await Promise.resolve();
      await Promise.resolve();
      const portLog = [...ported.log];

      expect(portLog).toStrictEqual(directLog);
    }
  );

  it('produces byte-identical aggregated params for a multi-sound drone-fire batch (port path === manual aggregate)', async () => {
    const seed = 909;
    const payloads = [
      { frequency: 680, detune: 8, intensity: 0.7, gain: 0.12 },
      { frequency: 720, detune: 16, intensity: 0.6, gain: 0.1 },
      { frequency: 700, detune: 12, intensity: 0.8, gain: 0.14 },
    ];

    // Reproduce the batcher aggregation deterministically, then drive the
    // direct method with the aggregate.
    const aggregated = payloads.reduce(
      (acc, opt) => {
        acc.frequency += Number(opt.frequency) || 680;
        acc.detune = Math.max(acc.detune, Number(opt.detune) || 0);
        acc.duration = Math.max(acc.duration, Number(opt.duration) || 0.1);
        acc.intensity += Number(opt.intensity) || 0.7;
        acc.gain += Number(opt.gain) || 0.12;
        return acc;
      },
      { frequency: 0, detune: 0, duration: 0.1, intensity: 0, gain: 0 }
    );
    aggregated.count = payloads.length;
    aggregated.frequency /= payloads.length;
    aggregated.intensity /= payloads.length;
    aggregated.gain /= payloads.length;

    const direct = createSynthHarness(seed);
    direct.resetSeed();
    direct.audioSystem._playDroneFireDirect(aggregated);
    await Promise.resolve();
    const directLog = [...direct.log];

    const ported = createSynthHarness(seed);
    ported.resetSeed();
    payloads.forEach((p) =>
      ported.audioSystem.batcher.scheduleSound('playDroneFire', p, {
        allowOverlap: true,
      })
    );
    ported.audioSystem.batcher.flushPendingBatches();
    await Promise.resolve();
    await Promise.resolve();
    const portLog = [...ported.log];

    expect(portLog).toStrictEqual(directLog);
  });
});

describe('02.04 Suite 2 — API contract per batching mode', () => {
  function makeContractBatcher() {
    const calls = {
      playDroneFireDirect: [],
      playHunterBurstDirect: [],
      playMineExplosionDirect: [],
      executeImmediate: [],
    };
    const port = createSfxSynthPort(
      makeFns({
        playDroneFireDirect: vi.fn((p) => calls.playDroneFireDirect.push(p)),
        playHunterBurstDirect: vi.fn((p) =>
          calls.playHunterBurstDirect.push(p)
        ),
        playMineExplosionDirect: vi.fn((p) =>
          calls.playMineExplosionDirect.push(p)
        ),
        executeImmediate: vi.fn((soundType, args) =>
          calls.executeImmediate.push({ soundType, args })
        ),
      })
    );
    return { batcher: new AudioBatcher(port, 0), calls };
  }

  it('drone-fire batch (size>1) reaches port.playDroneFireDirect with the aggregated payload', () => {
    const { batcher, calls } = makeContractBatcher();
    batcher.scheduleSound(
      'playDroneFire',
      { frequency: 680, gain: 0.12 },
      { allowOverlap: true }
    );
    batcher.scheduleSound(
      'playDroneFire',
      { frequency: 720, gain: 0.12 },
      { allowOverlap: true }
    );
    batcher.flushPendingBatches();

    expect(calls.playDroneFireDirect).toHaveLength(1);
    const [payload] = calls.playDroneFireDirect;
    expect(payload.count).toBe(2);
    expect(payload.frequency).toBe(700); // (680 + 720) / 2
  });

  it('hunter-burst batch (size>1) reaches port.playHunterBurstDirect with concurrency aggregated', () => {
    const { batcher, calls } = makeContractBatcher();
    batcher.scheduleSound(
      'playHunterBurst',
      { burstId: 'b1', intensity: 0.8, gain: 0.15 },
      { allowOverlap: true }
    );
    batcher.scheduleSound(
      'playHunterBurst',
      { burstId: 'b1', intensity: 0.6, gain: 0.15 },
      { allowOverlap: true }
    );
    batcher.flushPendingBatches();

    expect(calls.playHunterBurstDirect).toHaveLength(1);
    expect(calls.playHunterBurstDirect[0].concurrency).toBe(2);
  });

  it('mine-explosion batch (size>1) reaches port.playMineExplosionDirect with clusterSize aggregated', () => {
    const { batcher, calls } = makeContractBatcher();
    batcher.scheduleSound(
      'playMineExplosion',
      { intensity: 0.9, duration: 0.5 },
      { allowOverlap: true }
    );
    batcher.scheduleSound(
      'playMineExplosion',
      { intensity: 0.95, duration: 0.6 },
      { allowOverlap: true }
    );
    batcher.flushPendingBatches();

    expect(calls.playMineExplosionDirect).toHaveLength(1);
    expect(calls.playMineExplosionDirect[0].clusterSize).toBe(2);
  });

  it('immediate / non-batched path (size-1 flush) reaches port.executeImmediate with the payload', () => {
    const { batcher, calls } = makeContractBatcher();
    batcher.scheduleSound(
      'playDroneFire',
      { frequency: 690 },
      { allowOverlap: true }
    );
    batcher.flushPendingBatches();

    expect(calls.executeImmediate).toHaveLength(1);
    expect(calls.executeImmediate[0].soundType).toBe('playDroneFire');
    expect(calls.executeImmediate[0].args).toStrictEqual([{ frequency: 690 }]);
    // size-1 must NOT take the aggregated batched path
    expect(calls.playDroneFireDirect).toHaveLength(0);
  });
});

describe('02.04 Suite 3 — cycle break paranoia', () => {
  it('batcher holds no audioSystem back-reference', () => {
    const { audioSystem } = createSynthHarness(7);
    expect(audioSystem.batcher.audioSystem).toBeUndefined();
    expect('audioSystem' in audioSystem.batcher).toBe(false);
  });

  it('the injected port enumerates no system / underscore keys', () => {
    const { audioSystem } = createSynthHarness(7);
    const port = audioSystem.batcher.port;
    const keys = Object.keys(port);
    expect(keys).not.toContain('system');
    expect(keys).not.toContain('audioSystem');
    expect(keys.some((key) => key.startsWith('_'))).toBe(false);
    expect(Object.isFrozen(port)).toBe(true);
  });
});
