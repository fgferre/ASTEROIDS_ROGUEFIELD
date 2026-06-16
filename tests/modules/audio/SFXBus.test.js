import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import SFXBus from '../../../src/modules/audio/SFXBus.js';
import RandomService from '../../../src/core/RandomService.js';
import {
  createAudioContextStub,
  createGainStub,
  createOscillatorStub,
  createBufferSourceStub,
} from '../../__helpers__/stubs.js';

// ---------------------------------------------------------------------------
// SFXBus extraction lock (plan 02.07).
//
// SFXBus owns ALL SFX synthesis + the pool/cache/batcher/thruster INSTANCES (the
// four helper FILES stay at src/modules/ — AGENTS.md:7). These tests lock:
//   - two-phase lifecycle (constructor = config only; init builds; dispose idempotent)
//   - the ambient/protected bus split (player sounds bypass the duck — D-14)
//   - per-sound bus ROUTING (a player sound → protectedBus; a world sound → ambientBus)
//   - the batcher port is built from SFXBus's OWN methods (cycle closes locally;
//     zero this.audioSystem back-reference)
//   - delegation observable outcomes (a play* call reaches synthesis), not formulas
// ---------------------------------------------------------------------------

/**
 * Build a fully-initialized SFXBus on stub nodes with dedicated effectsDuckGain
 * (the ambient duck) and effectsGain (the slider). A controllable pool feeds an
 * oscillator/gain so we can observe which destination a node connects to.
 */
function makeInitializedBus({ seed = 'sfx-bus:test' } = {}) {
  const context = createAudioContextStub({ state: 'running' });
  const effectsDuckGain = createGainStub();
  const effectsGain = createGainStub();

  // A pool whose getGain returns a fresh recording gain each call so we can
  // inspect which bus the synthesis connected each voice into.
  const gains = [];
  const pool = {
    getOscillator: () => createOscillatorStub(),
    getGain: () => {
      const g = createGainStub();
      gains.push(g);
      return g;
    },
    getBufferSource: () => createBufferSourceStub(),
    getFilter: () => context.createBiquadFilter(),
    returnGain: () => {},
    returnFilter: () => {},
    cleanup: vi.fn(),
    getStats: () => ({}),
    resetStats: () => {},
  };

  const random = new RandomService(seed);
  const scopes = buildScopes(random);

  const bus = new SFXBus();
  // Inject seams the way the facade does (live getters + a pass-through gate).
  bus.init(context, {
    effectsDuckGain,
    effectsGain,
    getContext: () => context,
    getRandomScopes: () => scopes,
    safePlay: (fn) => fn(),
    trackPerformance: () => {},
    getEffectsFallbackDestination: () => effectsGain,
    randomScopes: scopes,
  });
  // Replace the pool with the recording pool so routing is observable.
  bus.pool = pool;

  return { bus, context, effectsDuckGain, effectsGain, pool, gains, scopes };
}

function buildScopes(random) {
  const fork = (name) => random.fork(name);
  const families = {
    laser: fork('audio:family:laser'),
    explosion: fork('audio:family:explosion'),
    shield: fork('audio:family:shield'),
    asteroid: fork('audio:family:asteroid'),
    music: fork('audio:family:music'),
    uiStartGame: fork('audio:family:ui:startgame'),
    thruster: fork('audio:family:thruster'),
  };
  const bufferFamilies = Object.fromEntries(
    Object.entries({ ...families }).map(([n, r]) => [n, r.fork(`buf:${n}`)])
  );
  return {
    base: random,
    cache: fork('audio:cache'),
    batcher: fork('audio:batcher'),
    families,
    bufferFamilies,
  };
}

describe('SFXBus two-phase lifecycle', () => {
  it('constructor does NO AudioContext work (no buses, no pool/cache/batcher)', () => {
    const bus = new SFXBus();
    expect(bus.initialized).toBe(false);
    expect(bus.ambientBus).toBeNull();
    expect(bus.protectedBus).toBeNull();
    expect(bus.pool).toBeNull();
    expect(bus.cache).toBeNull();
    expect(bus.batcher).toBeNull();
    // The thruster manager instance exists (no context work in its ctor either).
    expect(bus.thrusterLoops).toBeDefined();
  });

  it('init builds the buses + owns pool/cache/batcher; second init is a no-op', () => {
    const { bus } = makeInitializedBus();
    expect(bus.initialized).toBe(true);
    expect(bus.ambientBus).not.toBeNull();
    expect(bus.protectedBus).not.toBeNull();
    expect(bus.cache).not.toBeNull();
    expect(bus.batcher).not.toBeNull();

    const ambientBefore = bus.ambientBus;
    bus.init({ createGain: () => createGainStub() }, {});
    // Idempotent: the existing bus is untouched by a second init.
    expect(bus.ambientBus).toBe(ambientBefore);
  });

  it('dispose disconnects the buses and is idempotent (double-call safe)', () => {
    const { bus } = makeInitializedBus();
    const ambient = bus.ambientBus;
    const protectedBus = bus.protectedBus;

    bus.dispose();
    expect(ambient.disconnect).toHaveBeenCalled();
    expect(protectedBus.disconnect).toHaveBeenCalled();
    expect(bus.ambientBus).toBeNull();
    expect(bus.protectedBus).toBeNull();
    expect(bus.initialized).toBe(false);

    // Second dispose must not throw.
    expect(() => bus.dispose()).not.toThrow();
  });
});

describe('SFXBus ambient/protected bus topology (D-14: player sounds never duck)', () => {
  it('ambientBus connects to effectsDuckGain (world/enemy SFX duck with the music)', () => {
    const { bus, effectsDuckGain } = makeInitializedBus();
    expect(bus.ambientBus.connect).toHaveBeenCalledWith(effectsDuckGain);
  });

  it('protectedBus connects to effectsGain DIRECTLY (bypasses the duck)', () => {
    const { bus, effectsGain } = makeInitializedBus();
    expect(bus.protectedBus.connect).toHaveBeenCalledWith(effectsGain);
    // It must NOT route through the duck node.
    expect(bus.protectedBus.connect).not.toHaveBeenCalledWith(
      bus.ambientBus
    );
  });

  it('the protected destination is NOT the effectsDuckGain node', () => {
    const { bus, effectsDuckGain } = makeInitializedBus();
    expect(bus.getProtectedDestination()).toBe(bus.protectedBus);
    expect(bus.getProtectedDestination()).not.toBe(effectsDuckGain);
  });
});

describe('SFXBus per-sound routing (player → protected; world → ambient)', () => {
  it('a player shot (laser) routes its voice into the PROTECTED bus, not the duck', () => {
    const { bus, gains } = makeInitializedBus();
    bus._playLaserShotDirect({ pitchMultiplier: 1 });

    // The synthesis created exactly one voice gain and connected it to the
    // protected bus (player feedback bypasses the duck).
    const voiceGain = gains[gains.length - 1];
    expect(voiceGain.connect).toHaveBeenCalledWith(bus.protectedBus);
    expect(voiceGain.connect).not.toHaveBeenCalledWith(bus.ambientBus);
  });

  it('a world sound (drone fire) routes its voice into the AMBIENT bus (ducks)', () => {
    const { bus, gains } = makeInitializedBus();
    bus._playDroneFireDirect({ frequency: 680, duration: 0.1, gain: 0.12 });

    const voiceGain = gains[gains.length - 1];
    expect(voiceGain.connect).toHaveBeenCalledWith(bus.ambientBus);
    expect(voiceGain.connect).not.toHaveBeenCalledWith(bus.protectedBus);
  });

  it('player damage taken (ship hit) routes into the PROTECTED bus', () => {
    const { bus, context } = makeInitializedBus();
    // playShipHit uses raw context.createGain (not the pool); capture it.
    const created = [];
    const realCreate = context.createGain;
    context.createGain = vi.fn(() => {
      const g = realCreate();
      created.push(g);
      return g;
    });

    bus.playShipHit();

    const voiceGain = created[created.length - 1];
    expect(voiceGain.connect).toHaveBeenCalledWith(bus.protectedBus);
  });
});

describe('SFXBus owns the batcher port (cycle closes locally — no facade back-ref)', () => {
  it('createSfxSynthPort builds a working frozen port from the bus own methods', () => {
    const { bus } = makeInitializedBus();
    const port = bus.createSfxSynthPort();
    expect(Object.isFrozen(port)).toBe(true);
    // Late-bound pool/context reflect the bus current values.
    expect(port.pool).toBe(bus.pool);
    expect(port.context).toBe(bus.context);
  });

  it('the constructed batcher holds NO audioSystem back-reference', () => {
    const { bus } = makeInitializedBus();
    expect(bus.batcher.audioSystem).toBeUndefined();
    expect('audioSystem' in bus.batcher).toBe(false);
    // The batcher reaches synthesis only through the frozen port.
    expect(bus.batcher.port).toBeDefined();
  });

  it('delegating a batched sound through the port reaches the bus synthesis', () => {
    const { bus } = makeInitializedBus();
    const spy = vi.spyOn(bus, '_playDroneFireDirect');
    // Size-1 immediate flush path drives executeImmediate → bus synthesis.
    bus.batcher.scheduleSound(
      'playDroneFire',
      { frequency: 680, duration: 0.1, gain: 0.12 },
      { allowOverlap: true, priority: 1 }
    );
    bus.batcher.flushPendingBatches();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('SFXBus has zero god-class coupling (T-02-12)', () => {
  it('the SFXBus source contains no this.audioSystem reference', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../../src/modules/audio/SFXBus.js', import.meta.url)),
      'utf8'
    );
    expect(src.includes('this.audioSystem')).toBe(false);
  });

  it('the SFXBus source builds the port via createSfxSynthPort from its own methods', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../../src/modules/audio/SFXBus.js', import.meta.url)),
      'utf8'
    );
    expect(src).toMatch(/createSfxSynthPort\(\{/);
    // The port's direct-method members are this-bound to the bus' own methods.
    expect(src).toMatch(/this\._playDroneFireDirect/);
  });
});
