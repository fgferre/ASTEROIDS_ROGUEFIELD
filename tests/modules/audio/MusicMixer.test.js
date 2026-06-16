import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MusicMixer from '../../../src/modules/audio/MusicMixer.js';
import { createServiceManifest } from '../../../src/bootstrap/serviceManifest.js';
import { createAudioContextStub } from '../../__helpers__/stubs.js';
import { assertManagerWired } from '../../__helpers__/audio-manifest-wiring.js';
import { MUSIC_LAYER_CONFIG } from '../../../src/core/GameConstants.js';

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
      expect(mixer.layers === null || Object.keys(mixer.layers).length === 0).toBe(
        true
      );
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
      expect(mixer.musicPauseFadeGain.connect).toHaveBeenCalledWith(slider.node);
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
      const biquadCallsAfterFirst = context.createBiquadFilter.mock.calls.length;

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

      const lowpass = mixer.lowpass;
      const pauseFade = mixer.musicPauseFadeGain;

      expect(() => mixer.dispose()).not.toThrow();

      expect(lowpass.disconnect).toHaveBeenCalled();
      expect(pauseFade.disconnect).toHaveBeenCalled();
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
      expect(() => mixer.setIntensityFromBossEvent('boss-spawned')).not.toThrow();
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
