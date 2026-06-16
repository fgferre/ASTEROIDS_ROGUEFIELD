import { describe, expect, it, vi } from 'vitest';
import { createSfxSynthPort } from '../../../src/modules/audio/SfxSynthPort.js';

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
