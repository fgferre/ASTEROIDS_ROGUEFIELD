import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MusicMixer, {
  computeRunIntensity,
  percussionIntensity,
  percussionMix,
  resolveMusicLevel,
} from '../../../src/modules/audio/MusicMixer.js';
import { createServiceManifest } from '../../../src/bootstrap/serviceManifest.js';
import { createAudioContextStub } from '../../__helpers__/stubs.js';
import { assertManagerWired } from '../../__helpers__/audio-manifest-wiring.js';
import {
  MUSIC_LAYER_CONFIG,
  MUSIC_PERCUSSION,
  MUSIC_THEME_CROSSFADE,
  MUSIC_THEMES,
} from '../../../src/data/audio/music.js';

// ---------------------------------------------------------------------------
// Plan 02.05 — MusicMixer (INFRA-02 + AUDIO-01).
//
// The whole Web Audio graph is mocked. These tests assert OBSERVABLE OUTCOMES
// on the right nodes (a gain ramp scheduled on the layer gain; ZERO scheduled
// calls on the slider stage), never internal formulas — the Phase 1 LEARNING.
//
// Topology under test (single-writer per AudioParam):
//   layerGains[base|tension|danger|climax]  (writer: MusicMixer)
//     → music lowpass (pre-built; writer: MusicMixer pause frequency only)
//     → musicPauseFadeGain (writer: MusicMixer pause/fade)
//     → targetNode == musicGain SLIDER stage (writer: facade ONLY — MusicMixer
//        must NEVER schedule on it).
// ---------------------------------------------------------------------------

const LAYER_KEYS = ['base', 'tension', 'danger', 'climax'];

/**
 * Build a gain-param spy that records every scheduled write so a test can
 * assert which node the mixer wrote to (single-writer discipline).
 */
function makeGainParamSpy(initialValue = 1) {
  const calls = [];
  const param = {
    value: initialValue,
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

/**
 * A musicGain slider-stage stub whose gain param records every write — the
 * assertion target for "the mixer never touches the slider stage".
 */
function makeSliderStageStub() {
  const { param, calls } = makeGainParamSpy(0.6);
  return {
    node: {
      gain: param,
      connect: vi.fn(),
      disconnect: vi.fn(),
    },
    sliderWriteCalls: calls.filter((c) => c.method !== 'cancelScheduledValues'),
    allCalls: calls,
  };
}

function makeMixer(overrides = {}) {
  return new MusicMixer({
    randomScope: { range: () => 0, float: () => 0 },
    ...overrides,
  });
}

describe('MusicMixer — Task 1: engine + IntensityResolver + single-writer + lifecycle', () => {
  describe('constructor does NO AudioContext work (construction-timing safety)', () => {
    it('constructs with no context and creates no nodes', () => {
      const mixer = makeMixer();
      expect(mixer).toBeInstanceOf(MusicMixer);
      // No layer graph yet — only init() builds nodes.
      expect(mixer.initialized).toBe(false);
      expect(
        mixer.layers === null || Object.keys(mixer.layers).length === 0
      ).toBe(true);
    });

    it('does not throw and creates no nodes even if a context is never provided', () => {
      const context = createAudioContextStub();
      makeMixer();
      // Constructing the mixer must not have touched the (separately built) context.
      expect(context.createGain).not.toHaveBeenCalled();
      expect(context.createBiquadFilter).not.toHaveBeenCalled();
      expect(context.createOscillator).not.toHaveBeenCalled();
    });
  });

  describe('init() builds the 4-layer graph + pre-built lowpass + pauseFadeGain', () => {
    it('creates one gain per layer, the lowpass (bypass ~20kHz), and pauseFadeGain', () => {
      const context = createAudioContextStub();
      const slider = makeSliderStageStub();
      const mixer = makeMixer();

      mixer.init(context, slider.node);

      expect(mixer.initialized).toBe(true);
      // One gain object per configured layer must exist.
      for (const key of LAYER_KEYS) {
        expect(mixer.layers[key]).toBeDefined();
        expect(mixer.layers[key].gain).toBeDefined();
      }
      // Pre-built lowpass exists and sits at bypass.
      expect(mixer.lowpass).toBeDefined();
      expect(mixer.lowpass.type).toBe('lowpass');
      // musicPauseFadeGain exists, initialized to unity.
      expect(mixer.musicPauseFadeGain).toBeDefined();
      expect(mixer.musicPauseFadeGain.gain.value).toBe(1);
      // A BiquadFilter (the lowpass) was created during init.
      expect(context.createBiquadFilter).toHaveBeenCalled();
    });

    it('connects the pauseFadeGain stage to the provided targetNode (the slider stage)', () => {
      const context = createAudioContextStub();
      const slider = makeSliderStageStub();
      const mixer = makeMixer();

      mixer.init(context, slider.node);

      // pauseFadeGain → targetNode (slider stage)
      expect(mixer.musicPauseFadeGain.connect).toHaveBeenCalledWith(
        slider.node
      );
    });
  });

  describe('setIntensityFromBossEvent — boss arc drives intensity (D-04)', () => {
    let context;
    let slider;
    let mixer;

    beforeEach(() => {
      context = createAudioContextStub();
      slider = makeSliderStageStub();
      mixer = makeMixer();
      mixer.init(context, slider.node);
    });

    it('maps the 4 boss-arc events to tension/danger/climax/base targetLevels', () => {
      const maxLevel = MUSIC_LAYER_CONFIG.intensities.length - 1; // 3

      mixer.setIntensityFromBossEvent('boss-warning');
      expect(mixer.targetLevel).toBe(1); // tension

      mixer.setIntensityFromBossEvent('boss-spawned');
      expect(mixer.targetLevel).toBe(2); // danger

      mixer.setIntensityFromBossEvent('boss-phase-changed');
      expect(mixer.targetLevel).toBe(maxLevel); // climax (3)

      mixer.setIntensityFromBossEvent('boss-defeated');
      expect(mixer.targetLevel).toBe(0); // base
    });

    it('a non-boss event (player-health-changed) does NOT change targetLevel', () => {
      mixer.setIntensityFromBossEvent('boss-spawned');
      const before = mixer.targetLevel;
      mixer.setIntensityFromBossEvent('player-health-changed');
      expect(mixer.targetLevel).toBe(before);
    });

    it('crossfades a layer gain via the click-safe ramp ending at now + rampDuration', () => {
      // Replace one layer gain with a spy to capture the ramp anchoring.
      const { param, calls } = makeGainParamSpy(0);
      mixer.layers.tension.gain.gain = param;

      const now = context.currentTime;
      mixer.setIntensityFromBossEvent('boss-warning'); // → tension

      // Anchor: cancelScheduledValues + setValueAtTime BEFORE the ramp.
      const cancelIdx = calls.findIndex(
        (c) => c.method === 'cancelScheduledValues'
      );
      const anchorIdx = calls.findIndex((c) => c.method === 'setValueAtTime');
      const rampIdx = calls.findIndex(
        (c) => c.method === 'linearRampToValueAtTime'
      );
      expect(cancelIdx).toBeGreaterThanOrEqual(0);
      expect(anchorIdx).toBeGreaterThan(cancelIdx);
      expect(rampIdx).toBeGreaterThan(anchorIdx);

      // Ramp ends at now + rampDuration within the 8-15s slow-rise window (D-05).
      const ramp = calls[rampIdx];
      const rampDuration = ramp.time - now;
      expect(rampDuration).toBeGreaterThanOrEqual(8);
      expect(rampDuration).toBeLessThanOrEqual(15);
    });
  });

  describe('SINGLE-WRITER rule — the mixer NEVER writes the slider stage', () => {
    it('every boss-arc transition leaves the slider gain param untouched', () => {
      const context = createAudioContextStub();
      const slider = makeSliderStageStub();
      const mixer = makeMixer();
      mixer.init(context, slider.node);

      mixer.setIntensityFromBossEvent('boss-warning');
      mixer.setIntensityFromBossEvent('boss-spawned');
      mixer.setIntensityFromBossEvent('boss-phase-changed');
      mixer.setIntensityFromBossEvent('boss-defeated');

      // ZERO scheduled writes on the slider stage from any mixer operation.
      expect(slider.node.gain.setValueAtTime).not.toHaveBeenCalled();
      expect(slider.node.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
      expect(
        slider.node.gain.exponentialRampToValueAtTime
      ).not.toHaveBeenCalled();
      expect(slider.node.gain.cancelScheduledValues).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle — idempotent init/dispose', () => {
    it('init() twice creates no duplicate nodes (createGain count stable)', () => {
      const context = createAudioContextStub();
      const slider = makeSliderStageStub();
      const mixer = makeMixer();

      mixer.init(context, slider.node);
      const gainCallsAfterFirst = context.createGain.mock.calls.length;
      const biquadCallsAfterFirst =
        context.createBiquadFilter.mock.calls.length;

      mixer.init(context, slider.node); // second init is a no-op

      expect(context.createGain.mock.calls.length).toBe(gainCallsAfterFirst);
      expect(context.createBiquadFilter.mock.calls.length).toBe(
        biquadCallsAfterFirst
      );
    });

    it('dispose() disconnects owned nodes and is idempotent (second call no-op)', () => {
      const context = createAudioContextStub();
      const slider = makeSliderStageStub();
      const mixer = makeMixer();
      mixer.init(context, slider.node);

      // The biquad-filter stub uses a plain disconnect() (not a spy), so wrap
      // both owned nodes' disconnect with spies before tearing down.
      const lowpass = mixer.lowpass;
      const pauseFade = mixer.musicPauseFadeGain;
      const lowpassDisconnect = vi.spyOn(lowpass, 'disconnect');
      const pauseFadeDisconnect = vi.spyOn(pauseFade, 'disconnect');

      expect(() => mixer.dispose()).not.toThrow();

      expect(lowpassDisconnect).toHaveBeenCalled();
      expect(pauseFadeDisconnect).toHaveBeenCalled();
      expect(mixer.initialized).toBe(false);

      // Second dispose must not throw.
      expect(() => mixer.dispose()).not.toThrow();
    });

    it('post-dispose, a boss-arc call does not throw (no live nodes to write)', () => {
      const context = createAudioContextStub();
      const slider = makeSliderStageStub();
      const mixer = makeMixer();
      mixer.init(context, slider.node);
      mixer.dispose();
      expect(() =>
        mixer.setIntensityFromBossEvent('boss-spawned')
      ).not.toThrow();
    });
  });

  describe('manifest wiring (FIX-05 discipline)', () => {
    it('audio entry declares complete deps and flows real sentinels through', () => {
      const sentinels = {
        'event-bus': { __sentinel: 'event-bus', on() {}, off() {}, emit() {} },
        settings: { __sentinel: 'settings', getCategoryValues: () => null },
        random: { __sentinel: 'random' },
      };
      const { entry } = assertManagerWired(
        createServiceManifest(),
        'audio',
        ['event-bus', 'settings', 'random'],
        { sentinels }
      );
      expect(entry.name).toBe('audio');
    });
  });
});

// ===========================================================================
// Task 2 — bar-clock transport (D-02) + pause-freeze (D-10/SC1) + fade (D-12)
// ===========================================================================

/**
 * A context whose createOscillator returns a richer pulse-oscillator stub that
 * records start(time) onsets and exposes a settable onended callback so a test
 * can simulate the ended event and assert the cleanup. currentTime is mutable
 * via advanceTime() so the lookahead grid derives onsets from currentTime
 * (NOT Date.now) and re-anchoring on resume can be observed.
 */
function makeSchedulingContext() {
  const base = createAudioContextStub({ currentTime: 0 });
  // ALL oscillators created via this context (layer carriers + LFOs + pulses).
  const allOscillators = [];

  base.createOscillator = vi.fn(() => {
    const osc = {
      type: 'sine',
      onended: null,
      _startTimes: [],
      _stopped: false,
      _disconnected: false,
      detune: { setValueAtTime: vi.fn() },
      frequency: {
        value: 0,
        setValueAtTime: vi.fn((v) => {
          osc.frequency.value = v;
        }),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(() => {
        osc._disconnected = true;
      }),
      start: vi.fn((t) => {
        osc._startTimes.push(t);
      }),
      stop: vi.fn(() => {
        osc._stopped = true;
      }),
      /** Test helper: simulate the ended event firing. */
      fireEnded() {
        if (typeof osc.onended === 'function') osc.onended();
      },
    };
    allOscillators.push(osc);
    return osc;
  });

  return {
    context: base,
    allOscillators,
    /**
     * Pulse oscillators = those the transport creates lazily AFTER the layer
     * graph is built. `markBuilt()` snapshots the layer-carrier/LFO count so
     * `pulses()` returns only transport-scheduled oscillators (those that
     * actually call start(), i.e. onsets — not the always-running carriers).
     */
    _buildBoundary: 0,
    markBuilt() {
      this._buildBoundary = allOscillators.length;
    },
    pulses() {
      return allOscillators
        .slice(this._buildBoundary)
        .filter((o) => o.start.mock.calls.length > 0);
    },
    advanceTime(seconds) {
      base.currentTime += seconds;
    },
  };
}

function makeSliderNode() {
  const { param } = makeGainParamSpy(0.6);
  return { gain: param, connect: vi.fn(), disconnect: vi.fn() };
}

describe('MusicMixer — Task 2: transport + pause-freeze + fade', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('bar-clock transport (D-02) — quantized pulse on the next bar', () => {
    it('schedules pulse onsets via osc.start(time) derived from currentTime while in danger/climax', () => {
      const harness = makeSchedulingContext();
      const mixer = makeMixer();
      mixer.init(harness.context, makeSliderNode());
      harness.markBuilt();

      // Enter danger — rhythm layer should begin scheduling.
      mixer.setIntensityFromBossEvent('boss-spawned'); // danger
      vi.advanceTimersByTime(200); // several lookahead ticks

      const pulses = harness.pulses();
      expect(pulses.length).toBeGreaterThan(0);
      // Every onset time is a finite number >= the context currentTime baseline
      // (derived from currentTime, never Date.now/performance.now).
      for (const osc of pulses) {
        for (const time of osc._startTimes) {
          expect(Number.isFinite(time)).toBe(true);
          expect(time).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('does NOT schedule pulses for base/tension (gain-only, no grid)', () => {
      const harness = makeSchedulingContext();
      const mixer = makeMixer();
      mixer.init(harness.context, makeSliderNode());
      harness.markBuilt();

      mixer.setIntensityFromBossEvent('boss-warning'); // tension — no grid
      vi.advanceTimersByTime(200);

      expect(harness.pulses().length).toBe(0);
    });

    it('registers onended cleanup on each pulse oscillator (no leak across bars)', () => {
      const harness = makeSchedulingContext();
      const mixer = makeMixer();
      mixer.init(harness.context, makeSliderNode());
      harness.markBuilt();

      mixer.setIntensityFromBossEvent('boss-phase-changed'); // climax
      vi.advanceTimersByTime(200);

      const pulses = harness.pulses();
      expect(pulses.length).toBeGreaterThan(0);
      const osc = pulses[0];
      expect(typeof osc.onended).toBe('function');
      // Firing ended releases/disconnects the oscillator.
      osc.fireEnded();
      expect(osc.disconnect).toHaveBeenCalled();
    });
  });

  describe('pause-freeze (D-10 / SC1) — no wall-clock drift', () => {
    it('pause(true) stops the lookahead — onset count does not grow while paused', () => {
      const harness = makeSchedulingContext();
      const mixer = makeMixer();
      mixer.init(harness.context, makeSliderNode());
      harness.markBuilt();

      mixer.setIntensityFromBossEvent('boss-spawned'); // danger
      vi.advanceTimersByTime(200);
      const countBeforePause = harness.pulses().length;
      expect(countBeforePause).toBeGreaterThan(0);

      mixer.pause(true);
      vi.advanceTimersByTime(1000); // a long paused stretch
      // No NEW pulse oscillators scheduled while paused.
      expect(harness.pulses().length).toBe(countBeforePause);
    });

    it('pause(true) ramps the SAME lowpass instance down (underwater) — no new filter', () => {
      const { context } = makeSchedulingContext();
      const mixer = makeMixer();
      mixer.init(context, makeSliderNode());

      const lowpass = mixer.lowpass;
      const biquadCountAtInit = context.createBiquadFilter.mock.calls.length;

      const freqRamp = vi.spyOn(lowpass.frequency, 'linearRampToValueAtTime');
      mixer.pause(true);

      // SAME node — no new BiquadFilter created at pause time.
      expect(context.createBiquadFilter.mock.calls.length).toBe(
        biquadCountAtInit
      );
      expect(mixer.lowpass).toBe(lowpass);
      // Frequency ramped down into the underwater band (~600-1000 Hz).
      expect(freqRamp).toHaveBeenCalled();
      const lastTarget = freqRamp.mock.calls.at(-1)[0];
      expect(lastTarget).toBeGreaterThanOrEqual(400);
      expect(lastTarget).toBeLessThanOrEqual(1200);
    });

    it('pause(true) drops musicPauseFadeGain to ~50% (and never the slider stage)', () => {
      const { context } = makeSchedulingContext();
      const slider = makeSliderNode();
      const mixer = makeMixer();
      mixer.init(context, slider);

      mixer.pause(true);

      // pauseFadeGain ramped toward ~0.5.
      expect(mixer.musicPauseFadeGain.gain.value).toBeGreaterThan(0);
      expect(mixer.musicPauseFadeGain.gain.value).toBeLessThan(1);
      // Slider stage untouched.
      expect(slider.gain.setValueAtTime).not.toHaveBeenCalled();
      expect(slider.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    });

    it('pause(false) re-anchors the grid to fresh currentTime (no accumulated offset)', () => {
      const harness = makeSchedulingContext();
      const mixer = makeMixer();
      mixer.init(harness.context, makeSliderNode());
      harness.markBuilt();

      mixer.setIntensityFromBossEvent('boss-spawned'); // danger
      vi.advanceTimersByTime(100);
      mixer.pause(true);

      // Wall-clock advances a lot while paused.
      harness.advanceTime(50); // currentTime jumps to ~50s
      const countAtResume = harness.pulses().length;

      mixer.pause(false);
      vi.advanceTimersByTime(200);

      const newOscillators = harness.pulses().slice(countAtResume);
      expect(newOscillators.length).toBeGreaterThan(0);
      // New onsets derive from the POST-resume currentTime (~>=50), not from a
      // grid that kept advancing on wall-clock during the pause.
      for (const osc of newOscillators) {
        for (const time of osc._startTimes) {
          expect(time).toBeGreaterThanOrEqual(50);
        }
      }
    });

    it('pause(false) ramps the lowpass back toward bypass', () => {
      const { context } = makeSchedulingContext();
      const mixer = makeMixer();
      mixer.init(context, makeSliderNode());

      const freqRamp = vi.spyOn(
        mixer.lowpass.frequency,
        'linearRampToValueAtTime'
      );
      mixer.pause(true);
      mixer.pause(false);

      const lastTarget = freqRamp.mock.calls.at(-1)[0];
      expect(lastTarget).toBeGreaterThanOrEqual(15000); // back to bypass
    });
  });

  describe('lifecycle — transport teardown', () => {
    it('dispose() clears the lookahead — no pulse scheduled after dispose', () => {
      const harness = makeSchedulingContext();
      const mixer = makeMixer();
      mixer.init(harness.context, makeSliderNode());
      harness.markBuilt();

      mixer.setIntensityFromBossEvent('boss-spawned'); // danger
      vi.advanceTimersByTime(100);
      const countBeforeDispose = harness.pulses().length;

      mixer.dispose();
      vi.advanceTimersByTime(1000);

      expect(harness.pulses().length).toBe(countBeforeDispose);
    });

    it('init → pulse → pause → resume → dispose ×2 is leak-safe and idempotent', () => {
      const { context } = makeSchedulingContext();
      const mixer = makeMixer();
      mixer.init(context, makeSliderNode());
      mixer.setIntensityFromBossEvent('boss-phase-changed'); // climax
      vi.advanceTimersByTime(100);
      mixer.pause(true);
      vi.advanceTimersByTime(100);
      mixer.pause(false);
      vi.advanceTimersByTime(100);
      expect(() => mixer.dispose()).not.toThrow();
      expect(() => mixer.dispose()).not.toThrow();
      // No timer fires after dispose.
      expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    });
  });
});

describe('MusicMixer — run-following intensity (wave + density + HP + boss)', () => {
  const activeLayers = (state, bossLevel = null) => {
    const level = resolveMusicLevel(computeRunIntensity(state), bossLevel);
    const profile = MUSIC_LAYER_CONFIG.intensities[level];
    return LAYER_KEYS.filter((key) => profile[key] > 0);
  };

  it('maps wave progress, density, low HP and the boss floor to the expected layer set', () => {
    expect(activeLayers({ wave: 1, enemyCount: 0 })).toEqual([]);
    expect(activeLayers({ wave: 3, enemyCount: 6 })).toEqual([
      'base',
      'tension',
    ]);
    expect(activeLayers({ wave: 8, enemyCount: 14 })).toEqual([
      'base',
      'tension',
      'danger',
    ]);
    expect(activeLayers({ wave: 15, enemyCount: 20 })).toEqual(LAYER_KEYS);
    // Low HP (< 30 %) adds tension on top of the same wave/density.
    expect(activeLayers({ wave: 6, enemyCount: 10 })).toEqual([
      'base',
      'tension',
    ]);
    expect(activeLayers({ wave: 6, enemyCount: 10, healthRatio: 0.2 })).toEqual(
      ['base', 'tension', 'danger']
    );
    // The boss arc overrides upwards, never downwards.
    expect(activeLayers({ wave: 1, enemyCount: 0 }, 3)).toEqual(LAYER_KEYS);
    expect(activeLayers({ wave: 15, enemyCount: 20 }, 1)).toEqual(LAYER_KEYS);
  });
});

describe('MusicMixer — themes (crossfade between voice banks)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const lastRamp = (param) => param.linearRampToValueAtTime.mock.calls.at(-1);

  function initAt(time) {
    const harness = makeSchedulingContext();
    harness.advanceTime(time);
    const mixer = makeMixer();
    mixer.init(harness.context, makeSliderNode());
    return { harness, mixer };
  }

  it('crossfades to the new theme in ≤ 2.5 s: incoming at full level, outgoing silent and stopped', () => {
    const { mixer } = initAt(10);
    const outgoing = mixer._themeBank;

    mixer.setTheme('dense-core');
    const incoming = mixer._themeBank;
    const end = 10 + MUSIC_THEME_CROSSFADE.seconds;

    expect(MUSIC_THEME_CROSSFADE.seconds).toBeLessThanOrEqual(2.5);
    expect(incoming.themeId).toBe('dense-core');
    for (const voice of Object.values(incoming.voices)) {
      const [value, time] = lastRamp(voice.gain.gain);
      expect(value).toBeCloseTo(voice.level, 9);
      expect(time).toBeCloseTo(end, 9);
    }
    for (const [key, voice] of Object.entries(outgoing.voices)) {
      const [value, time] = lastRamp(voice.gain.gain);
      expect(value).toBe(0);
      if (key !== 'percussion') expect(time).toBeCloseTo(end, 9);
      voice.oscillators.forEach((osc) => {
        expect(osc.stop).toHaveBeenCalledWith(end);
      });
    }
  });

  it('the crossfade is equal-power (summed power constant at the midpoint)', () => {
    const { mixer } = initAt(0);
    const outgoing = mixer._themeBank.voices.base;
    const from = outgoing.gain.gain.value;

    mixer.setTheme('warden');
    const incoming = mixer._themeBank.voices.base;
    const mid = MUSIC_THEME_CROSSFADE.segments / 2;
    const inValue =
      incoming.gain.gain.linearRampToValueAtTime.mock.calls[mid - 1][0];
    const outValue =
      outgoing.gain.gain.linearRampToValueAtTime.mock.calls[mid - 1][0];

    expect(inValue / incoming.level).toBeCloseTo(Math.SQRT1_2, 9);
    expect(outValue / from).toBeCloseTo(Math.SQRT1_2, 9);
  });

  it('a theme change leaves the intensity layer gains alone; the same theme is a no-op', () => {
    const { harness, mixer } = initAt(0);
    const layerRamps = LAYER_KEYS.map(
      (key) =>
        mixer.layers[key].gain.gain.linearRampToValueAtTime.mock.calls.length
    );

    mixer.setTheme('wardens-reach');
    expect(
      LAYER_KEYS.map(
        (key) =>
          mixer.layers[key].gain.gain.linearRampToValueAtTime.mock.calls.length
      )
    ).toEqual(layerRamps);

    const oscillatorCount = harness.allOscillators.length;
    mixer.setTheme('wardens-reach');
    expect(harness.allOscillators.length).toBe(oscillatorCount);
  });

  it('resetRun cuts straight back to the default theme (no crossfade)', () => {
    const { mixer } = initAt(5);
    mixer.setTheme('warden');
    const warden = mixer._themeBank;

    mixer.resetRun();

    expect(mixer.themeId).toBe('outer-ring');
    Object.values(warden.voices).forEach((voice) => {
      voice.oscillators.forEach((osc) =>
        expect(osc.stop).toHaveBeenCalledWith(5)
      );
    });
  });

  it('the pulse follows the theme tempo (Warden: an onset every 0.25 s)', () => {
    const { harness, mixer } = initAt(0);
    mixer.setTheme('warden', { immediate: true });
    harness.markBuilt();

    mixer.setIntensityFromBossEvent('boss-spawned'); // danger → pulse grid
    expect(harness.pulses().map((osc) => osc._startTimes[0])).toEqual([0]);

    harness.advanceTime(0.3);
    vi.advanceTimersByTime(25); // one lookahead tick → horizon 0.4 s
    expect(harness.pulses().map((osc) => osc._startTimes[0])).toEqual([
      0, 0.25,
    ]);
  });
});

describe('MusicMixer — percussion layer (enters with the run intensity)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('is silent below 0.45, opens linearly and is full from 0.8', () => {
    expect(percussionMix(0)).toBe(0);
    expect(percussionMix(0.45)).toBe(0);
    expect(percussionMix(0.625)).toBeCloseTo(0.5, 9);
    expect(percussionMix(0.8)).toBe(1);
    expect(percussionMix(1)).toBe(1);
    // A boss floor counts as its level threshold, never lowers the run.
    expect(percussionIntensity(0.2, 3)).toBe(0.8);
    expect(percussionIntensity(0.2, 2)).toBe(0.45);
    expect(percussionIntensity(0.7, 1)).toBe(0.7);
    expect(percussionIntensity(0.3, null)).toBe(0.3);
  });

  it('every theme has a percussion loop whose hits fall inside it', () => {
    Object.entries(MUSIC_THEMES).forEach(([id, theme]) => {
      expect(theme.percussion, id).toBeDefined();
      theme.percussion.hits.forEach((hit) => {
        hit.steps.forEach((step) => {
          expect(step).toBeLessThan(theme.percussion.steps);
        });
      });
    });
  });

  it('the layer gain follows the intensity: closed at danger, full at climax', () => {
    const harness = makeSchedulingContext();
    const mixer = makeMixer();
    mixer.init(harness.context, makeSliderNode());
    const lastValue = () =>
      mixer.percussionGain.gain.linearRampToValueAtTime.mock.calls.at(-1)?.[0];

    mixer.setIntensityFromBossEvent('boss-spawned'); // floor 0.45
    expect(lastValue()).toBe(0);
    mixer.setIntensityFromBossEvent('boss-phase-changed'); // floor 0.8
    expect(lastValue()).toBeCloseTo(MUSIC_PERCUSSION.gain, 9);
    mixer.setIntensityFromBossEvent('boss-defeated');
    expect(lastValue()).toBe(0);
  });

  it('outer ring at full intensity: hats on the eighths, a thump on 1', () => {
    const harness = makeSchedulingContext();
    const mixer = makeMixer();
    mixer.init(harness.context, makeSliderNode());
    harness.markBuilt();

    mixer.setIntensityFromBossEvent('boss-phase-changed');
    harness.advanceTime(1);
    vi.advanceTimersByTime(25); // horizon 1.1 s → eighths at 0..1.0

    expect(harness.context.createBufferSource).toHaveBeenCalledTimes(5);
    // 3 pulses (0, 0.5, 1.0) + 1 thump on step 0.
    expect(harness.pulses()).toHaveLength(4);
  });

  it('no hits are scheduled while the layer is closed', () => {
    const harness = makeSchedulingContext();
    const mixer = makeMixer();
    mixer.init(harness.context, makeSliderNode());
    harness.markBuilt();

    mixer.setIntensityFromBossEvent('boss-spawned'); // danger, percussion 0
    harness.advanceTime(1);
    vi.advanceTimersByTime(25);

    expect(harness.context.createBufferSource).not.toHaveBeenCalled();
    expect(harness.pulses()).toHaveLength(3); // the pulse only
  });

  it('a theme change stops the old drums at once and releases the old bank after the fade', () => {
    const harness = makeSchedulingContext();
    const mixer = makeMixer();
    mixer.init(harness.context, makeSliderNode());
    mixer.setIntensityFromBossEvent('boss-phase-changed'); // climax: drums on
    const outgoing = mixer._themeBank;
    const oldDrums = outgoing.voices.percussion;

    mixer.setTheme('warden');
    const newDrums = mixer._themeBank.voices.percussion;
    const end = MUSIC_THEME_CROSSFADE.seconds;
    // The hits already scheduled ahead (≤ 0.1 s) fade out; the new drums fade in.
    const [oldTo, oldAt] =
      oldDrums.gain.gain.linearRampToValueAtTime.mock.calls.at(-1);
    expect(oldTo).toBe(0);
    expect(oldAt).toBeLessThanOrEqual(0.1);
    expect(newDrums.gain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(
      1,
      end
    );

    const gainsBefore = harness.context.createGain.mock.results.length;
    harness.advanceTime(end);
    vi.advanceTimersByTime(25);
    const hits = harness.context.createGain.mock.results
      .slice(gainsBefore)
      .map(({ value }) => value);
    const into = (drums) =>
      hits.filter((gain) =>
        gain.connect.mock.calls.some(([target]) => target === drums.gain)
      ).length;
    expect(into(newDrums)).toBeGreaterThan(0);
    expect(into(oldDrums)).toBe(0);

    const drones = Object.values(outgoing.voices).flatMap(
      (voice) => voice.oscillators
    );
    drones.forEach((osc) => osc.fireEnded());
    expect(drones.every((osc) => osc._stopped && osc._disconnected)).toBe(true);
    Object.values(outgoing.voices).forEach((voice) => {
      expect(voice.gain.disconnect).toHaveBeenCalled();
    });
    expect(
      [mixer._themeBank, ...mixer._fadingBanks].map((bank) => bank.themeId)
    ).toEqual(['warden']);
  });
});
