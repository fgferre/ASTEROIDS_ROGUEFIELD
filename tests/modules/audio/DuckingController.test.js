import { afterEach, describe, expect, it, vi } from 'vitest';
import DuckingController from '../../../src/modules/audio/DuckingController.js';
import { createServiceManifest } from '../../../src/bootstrap/serviceManifest.js';
import { createAudioContextStub } from '../../__helpers__/stubs.js';

// ---------------------------------------------------------------------------
// Plan 02.06 Task 2 — DuckingController (AUDIO-03 / D-11).
//
// The whole Web Audio graph is mocked. Tests assert OBSERVABLE OUTCOMES on the
// DEDICATED duck nodes — the trough depth in linear gain (≥6dB → ≤0.501), the
// recovery target (exactly 1.0), the envelope-end time (≤ startTime + 1.5s), the
// startTime scheduling seam, the splice connect/disconnect ORDER, and ZERO
// scheduled calls on the slider stages — never internal formulas (Phase 1
// LEARNING).
//
// Topology under test (multiplicative BY TOPOLOGY — the controller owns dedicated
// nodes that REST at 1.0 and never reads/writes the slider stages):
//   music:   musicPauseFadeGain → musicDuckGain (rests 1.0) → musicGain (slider)
//   effects: SFX content        → effectsDuckGain (rests 1.0) → effectsGain (slider)
// ---------------------------------------------------------------------------

/** A gain-param spy recording every scheduled write (with the time arg). */
function makeGainParamSpy(initial = 1) {
  const calls = [];
  const param = {
    value: initial,
    setValueAtTime: vi.fn((v, t) => {
      calls.push({ method: 'setValueAtTime', value: v, time: t });
      param.value = v;
    }),
    linearRampToValueAtTime: vi.fn((v, t) => {
      calls.push({ method: 'linearRampToValueAtTime', value: v, time: t });
      param.value = v;
    }),
    exponentialRampToValueAtTime: vi.fn((v, t) => {
      calls.push({ method: 'exponentialRampToValueAtTime', value: v, time: t });
      param.value = v;
    }),
    cancelScheduledValues: vi.fn((t) => {
      calls.push({ method: 'cancelScheduledValues', time: t });
    }),
  };
  return { param, calls };
}

/** A gain node stub with a spied gain param + connect/disconnect spies. */
function makeGainNode(initial = 1, label = 'node') {
  const { param, calls } = makeGainParamSpy(initial);
  const node = {
    label,
    gain: param,
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  return { node, gain: param, calls };
}

/**
 * Build the splice fixtures: the upstream music pause/fade gain, the music slider
 * stage, and the effects slider stage — plus a context whose createGain returns
 * fresh spied duck nodes (so the test can inspect their scheduled calls).
 */
function makeSpliceFixtures() {
  const context = createAudioContextStub({ currentTime: 10 });
  const createdGains = [];
  context.createGain = vi.fn(() => {
    const { node } = makeGainNode(1, `duck-${createdGains.length}`);
    createdGains.push(node);
    return node;
  });

  const musicPauseFadeGain = makeGainNode(1, 'musicPauseFadeGain');
  const musicGain = makeGainNode(0.6, 'musicGain'); // slider stage
  const effectsGain = makeGainNode(1, 'effectsGain'); // slider stage

  return {
    context,
    createdGains,
    musicPauseFadeGain,
    musicGain,
    effectsGain,
  };
}

function initController(fixtures) {
  const controller = new DuckingController();
  controller.init(fixtures.context, {
    musicSpliceFrom: fixtures.musicPauseFadeGain.node,
    musicSpliceTo: fixtures.musicGain.node,
    effectsSpliceTo: fixtures.effectsGain.node,
  });
  return controller;
}

/** Slider write calls excluding cancelScheduledValues (the actual schedules). */
function sliderWrites(calls) {
  return calls.filter((c) => c.method !== 'cancelScheduledValues');
}

describe('DuckingController — Task 2: dedicated duck nodes + SC3 envelope', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('splice: old direct connection disconnected BEFORE the duck node is connected', () => {
    it('music: musicPauseFadeGain disconnects, then routes pauseFade→duck→slider', () => {
      const fx = makeSpliceFixtures();
      initController(fx);

      // The old direct connection (pauseFade → musicGain) was disconnected.
      expect(fx.musicPauseFadeGain.node.disconnect).toHaveBeenCalled();
      // The dedicated music duck node was created and wired in.
      const musicDuck = fx.createdGains[0];
      expect(musicDuck).toBeDefined();
      // pauseFade now connects to the duck node...
      expect(fx.musicPauseFadeGain.node.connect).toHaveBeenCalledWith(
        musicDuck
      );
      // ...and the duck node connects to the slider stage.
      expect(musicDuck.connect).toHaveBeenCalledWith(fx.musicGain.node);

      // Disconnect ordering: the disconnect was invoked before the reconnect.
      const disconnectOrder =
        fx.musicPauseFadeGain.node.disconnect.mock.invocationCallOrder[0];
      const connectOrder =
        fx.musicPauseFadeGain.node.connect.mock.invocationCallOrder[0];
      expect(disconnectOrder).toBeLessThan(connectOrder);
    });

    it('duck nodes REST at 1.0 (nominal is always 1 — multiplicative by topology)', () => {
      const fx = makeSpliceFixtures();
      initController(fx);
      const musicDuck = fx.createdGains[0];
      const effectsDuck = fx.createdGains[1];
      expect(musicDuck.gain.value).toBe(1);
      expect(effectsDuck.gain.value).toBe(1);
    });
  });

  describe('duck envelope: ≥6dB trough, recovery to exactly 1.0, ≤1.5s total (SC3)', () => {
    it('depthDb=6 → trough target ≤0.501 on the duck node and recovers to 1.0', () => {
      const fx = makeSpliceFixtures();
      const controller = initController(fx);
      const musicDuck = fx.createdGains[0];

      controller.duck({ bus: 'music' });

      // The ramp targets scheduled on the duck node.
      const targets =
        musicDuck.gain.exponentialRampToValueAtTime.mock.calls.map((c) => c[0]);
      expect(targets.length).toBeGreaterThanOrEqual(2);

      // Trough ≤ 0.501 (≥6dB attenuation from nominal 1.0).
      const trough = Math.min(...targets);
      expect(trough).toBeLessThanOrEqual(0.501);
      // Never exactly 0 (≥0.0001 floor — MDN gotcha).
      expect(trough).toBeGreaterThanOrEqual(0.0001);

      // Recovery target is exactly 1.0 (back to nominal rest).
      expect(targets[targets.length - 1]).toBe(1);
    });

    it('default envelope ends within startTime + 1.5s (SC3 recovery budget)', () => {
      const fx = makeSpliceFixtures();
      const controller = initController(fx);
      const musicDuck = fx.createdGains[0];
      const start = fx.context.currentTime;

      controller.duck({ bus: 'music' });

      const allTimes = [
        ...musicDuck.gain.setValueAtTime.mock.calls.map((c) => c[1]),
        ...musicDuck.gain.exponentialRampToValueAtTime.mock.calls.map(
          (c) => c[1]
        ),
      ].filter((t) => typeof t === 'number');
      const lastTime = Math.max(...allTimes);
      expect(lastTime).toBeLessThanOrEqual(start + 1.5 + 1e-9);
    });
  });

  describe('the controller NEVER writes the slider stages (multiplicative by construction)', () => {
    it('music + effects slider gain params receive ZERO scheduled calls', () => {
      const fx = makeSpliceFixtures();
      const controller = initController(fx);

      controller.duck({ bus: 'music' });
      controller.duck({ bus: 'effects' });
      controller.duck({ bus: 'both' });

      expect(sliderWrites(fx.musicGain.calls)).toEqual([]);
      expect(sliderWrites(fx.effectsGain.calls)).toEqual([]);
    });
  });

  describe('startTime scheduling seam (02.08 co-scheduling)', () => {
    it('duck({ startTime: now+2 }) schedules no point before now+2', () => {
      const fx = makeSpliceFixtures();
      const controller = initController(fx);
      const musicDuck = fx.createdGains[0];
      const startTime = fx.context.currentTime + 2;

      controller.duck({ bus: 'music', startTime });

      const allTimes = [
        ...musicDuck.gain.setValueAtTime.mock.calls.map((c) => c[1]),
        ...musicDuck.gain.exponentialRampToValueAtTime.mock.calls.map(
          (c) => c[1]
        ),
      ].filter((t) => typeof t === 'number');
      const earliest = Math.min(...allTimes);
      expect(earliest).toBeGreaterThanOrEqual(startTime - 1e-9);
    });
  });

  describe('re-anchor on retrigger (no click, no stacking)', () => {
    it('a duck during recovery re-anchors via cancel + setValueAtTime(current)', () => {
      const fx = makeSpliceFixtures();
      const controller = initController(fx);
      const musicDuck = fx.createdGains[0];

      controller.duck({ bus: 'music' });
      // Simulate partial recovery by advancing the context clock + a re-trigger.
      fx.context.currentTime += 0.3;
      musicDuck.gain.cancelScheduledValues.mockClear();
      musicDuck.gain.setValueAtTime.mockClear();

      controller.duck({ bus: 'music' });

      // Re-anchored: cancelScheduledValues then setValueAtTime(current) first.
      expect(musicDuck.gain.cancelScheduledValues).toHaveBeenCalled();
      expect(musicDuck.gain.setValueAtTime).toHaveBeenCalled();
      const cancelOrder =
        musicDuck.gain.cancelScheduledValues.mock.invocationCallOrder[0];
      const setOrder =
        musicDuck.gain.setValueAtTime.mock.invocationCallOrder[0];
      expect(cancelOrder).toBeLessThan(setOrder);
    });
  });

  describe('dispose restores the direct connections and is idempotent', () => {
    it('dispose un-splices pauseFade→musicGain and double-dispose is safe', () => {
      const fx = makeSpliceFixtures();
      const controller = initController(fx);
      const musicDuck = fx.createdGains[0];

      fx.musicPauseFadeGain.node.connect.mockClear();
      musicDuck.disconnect.mockClear();

      controller.dispose();

      // The duck node was disconnected and the direct connection restored.
      expect(musicDuck.disconnect).toHaveBeenCalled();
      expect(fx.musicPauseFadeGain.node.connect).toHaveBeenCalledWith(
        fx.musicGain.node
      );

      // Idempotent.
      expect(() => controller.dispose()).not.toThrow();
    });
  });

  describe('no forbidden non-determinism source in the module', () => {
    it('DuckingController.js never references Math.random/Date.now/performance.now', async () => {
      const fs = await import('node:fs');
      const url = new URL(
        '../../../src/modules/audio/DuckingController.js',
        import.meta.url
      );
      const src = fs.readFileSync(url, 'utf8');
      expect(src).not.toMatch(/Math\.random/);
      expect(src).not.toMatch(/Date\.now/);
      expect(src).not.toMatch(/performance\.now/);
    });
  });
});

describe('DuckingController — composed in the audio facade (manifest wiring)', () => {
  it('the audio service composes a DuckingController instance', () => {
    const manifest = createServiceManifest();
    const entry = manifest.find((item) => item.name === 'audio');
    const eventBus = manifest
      .find((item) => item.name === 'event-bus')
      .factory({ resolved: {}, context: {} });
    const random = manifest
      .find((item) => item.name === 'random')
      .factory({ resolved: {}, context: { seed: 'duck' } });
    const settings = manifest
      .find((item) => item.name === 'settings')
      .factory({ resolved: { 'event-bus': eventBus }, context: {} });

    const audio = entry.factory({
      resolved: { 'event-bus': eventBus, settings, random },
    });
    expect(audio.duckingController).toBeInstanceOf(DuckingController);
    if (typeof audio.destroy === 'function') audio.destroy();
  });
});
