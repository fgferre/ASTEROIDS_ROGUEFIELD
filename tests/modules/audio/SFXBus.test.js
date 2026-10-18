import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import SFXBus, {
  resolveDistanceMix,
  resolveExplosionSize,
} from '../../../src/modules/audio/SFXBus.js';
import {
  AUDIO_DISTANCE_MIX,
  TRANSMISSION_VOICE,
} from '../../../src/core/GameConstants.js';
import { STORY } from '../../../src/data/story.js';
import AudioSystem from '../../../src/modules/AudioSystem.js';
import RandomService from '../../../src/core/RandomService.js';
import {
  createAudioContextStub,
  createGainStub,
  createOscillatorStub,
  createBufferSourceStub,
  createSettingsStub,
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
    expect(bus.protectedBus.connect).not.toHaveBeenCalledWith(bus.ambientBus);
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

describe('SFXBus music stingers', () => {
  function recordOscillators(context) {
    const frequencyLog = [];
    context.createOscillator = vi.fn(() =>
      createOscillatorStub({ frequencyLog })
    );
    return frequencyLog;
  }

  it('the chapter stinger plays the theme motif in its scale (dense core: F, Gb, C)', () => {
    const { bus, context } = makeInitializedBus();
    const frequencyLog = recordOscillators(context);

    bus.playChapterStinger('dense-core');

    // Root F2 (MIDI 41) two octaves up: F4, Gb4, C5.
    const expected = [65, 66, 72].map((midi) => 440 * 2 ** ((midi - 69) / 12));
    expect(frequencyLog).toHaveLength(3);
    frequencyLog.forEach((hz, index) => {
      expect(hz).toBeCloseTo(expected[index], 3);
    });
  });

  it('the chapter stinger is silent for a theme without a motif (the Warden)', () => {
    const { bus, context } = makeInitializedBus();
    const frequencyLog = recordOscillators(context);

    bus.playChapterStinger('warden');

    expect(frequencyLog).toEqual([]);
  });

  it('the warden stinger stacks the low brass hit under a riser', () => {
    const { bus, context } = makeInitializedBus();
    const frequencyLog = recordOscillators(context);

    expect(() => bus.playWardenStinger()).not.toThrow();

    // Three hit notes × two detuned saws + the riser tone.
    expect(frequencyLog).toHaveLength(7);
    expect(Math.min(...frequencyLog)).toBeCloseTo(65.41, 1); // C2
    expect(context.createBufferSource).toHaveBeenCalledTimes(1);
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
      fileURLToPath(
        new URL('../../../src/modules/audio/SFXBus.js', import.meta.url)
      ),
      'utf8'
    );
    expect(src.includes('this.audioSystem')).toBe(false);
  });

  it('the SFXBus source builds the port via createSfxSynthPort from its own methods', () => {
    const src = readFileSync(
      fileURLToPath(
        new URL('../../../src/modules/audio/SFXBus.js', import.meta.url)
      ),
      'utf8'
    );
    expect(src).toMatch(/createSfxSynthPort\(\{/);
    // The port's direct-method members are this-bound to the bus' own methods.
    expect(src).toMatch(/this\._playDroneFireDirect/);
  });
});

// ---------------------------------------------------------------------------
// Facade API-PARITY snapshot (plan 02.07, review: facade compatibility beyond
// EventBus listeners).
//
// The SFX synthesis bodies relocated into SFXBus, but EVERY public method the
// rest of the game calls on the resolved `audio` service must remain a callable
// function on the post-extraction facade (no silent surface loss). The baseline
// below was enumerated from AudioSystem.prototype at commit bf35c23 (the HEAD
// immediately BEFORE plan 02.07) — non-underscore own function properties,
// sorted. Drift in either direction fails loudly and forces a conscious update.
// ---------------------------------------------------------------------------
const FACADE_PUBLIC_API_BASELINE = Object.freeze([
  'applyVolumeToNodes',
  'bootstrapSettings',
  'captureRandomScopes',
  'connectGainNode',
  'connectMusicNode',
  'ensureFileTrackGraph',
  'ensureRunning',
  'evictFileTrack',
  'flushAudioBatches',
  'getEffectsDestination',
  'getPerformanceStats',
  'handleBossEvent',
  'handleThrusterEffect',
  'init',
  'normalizeLaserShotOptions',
  'onDestroy',
  'playAsteroidBreak',
  'playBossDefeated',
  'playBossEvent',
  'playBossPhaseChange',
  'playBossRoar',
  'playBossShieldDeflect',
  'playBulletHit',
  'playButtonClick',
  'playChapterStinger',
  'playDroneFire',
  'playEliteSpawned',
  'playEnemyTelegraph',
  'playExplosion',
  'playFileTrack',
  'playGoldJackpot',
  'playGoldSpawn',
  'playHunterBurst',
  'playLaserShot',
  'playLevelUp',
  'playLowHealthWarning',
  'playMenuTransition',
  'playMineExplosion',
  'playOrbFusion',
  'playCardBanish',
  'playCardReroll',
  'playCodexDiscovered',
  'playHarmonicBeam',
  'playWeaponEvolved',
  'playPauseClose',
  'playPauseOpen',
  'playPickupCollected',
  'playPickupSpawned',
  'playShieldActivate',
  'playShieldBreak',
  'playShieldFail',
  'playShieldImpact',
  'playShieldRecharged',
  'playShieldShockwave',
  'playShipHit',
  'playSurgeSting',
  'playDeepFieldEntry',
  'playSalvageAwarded',
  'playHangarPurchase',
  'playTipChime',
  'playTargetLock',
  'playTransmission',
  'playTransmissionVoice',
  'playUIHover',
  'playUISelect',
  'playUIStartGame',
  'playUpgradeSelect',
  'playWardenStinger',
  'playXPCollect',
  'reseedRandomScopes',
  'reset',
  'safePlay',
  'sanitizeVolume',
  'setMusicIntensity',
  'setPerformanceMonitoring',
  'setupEventListeners',
  'stopFileTrack',
  'updateVolumeState',
  'updateWaveMusicIntensity',
  'warmupFileTrack',
]);

function enumerateFacadePublicApi() {
  const proto = AudioSystem.prototype;
  return Object.getOwnPropertyNames(proto)
    .filter((n) => n !== 'constructor' && !n.startsWith('_'))
    .filter((n) => {
      const d = Object.getOwnPropertyDescriptor(proto, n);
      return typeof d.value === 'function';
    })
    .sort();
}

describe('AudioSystem facade API parity after SFXBus extraction (02.07)', () => {
  it('every pre-extraction public method is still a callable function on the facade', () => {
    const audio = new AudioSystem({
      random: new RandomService('facade-parity'),
      settings: createSettingsStub(),
    });

    for (const name of FACADE_PUBLIC_API_BASELINE) {
      expect(
        typeof audio[name],
        `facade lost public method '${name}' (API parity break)`
      ).toBe('function');
    }
  });

  it('the live public API surface still equals the captured baseline (no drift either direction)', () => {
    const live = new Set(enumerateFacadePublicApi());
    const baseline = new Set(FACADE_PUBLIC_API_BASELINE);

    const added = [...live].filter((n) => !baseline.has(n));
    expect(
      added,
      `facade gained public methods absent from the parity baseline (update the snapshot in a reviewed diff): ${added.join(', ')}`
    ).toEqual([]);

    const dropped = [...baseline].filter((n) => !live.has(n));
    expect(
      dropped,
      `facade dropped public methods listed in the parity baseline (a parity break): ${dropped.join(', ')}`
    ).toEqual([]);
  });
});

describe('SFXBus explosion-size routing (enemy-destroyed → small/medium/large)', () => {
  it('routes rocks by size, enemies by type, bumps elites and skips mines', () => {
    const route = (payload) => resolveExplosionSize(payload);
    expect(route({ size: 'small' })).toBe('small');
    expect(route({ size: 'medium' })).toBe('medium');
    expect(route({ size: 'large' })).toBe('large');
    expect(route({ enemyType: 'mote' })).toBe('small');
    expect(route({ enemyType: 'drone' })).toBe('small');
    expect(route({ enemyType: 'seeker' })).toBe('medium');
    expect(route({ enemyType: 'husk' })).toBe('medium');
    expect(route({ enemy: { type: 'ram' } })).toBe('medium');
    expect(route({ enemyType: 'weaver' })).toBe('medium');
    expect(route({ enemyType: 'bulwark' })).toBe('large');
    expect(route({ enemyType: 'warden' })).toBe('large');
    expect(route({ enemyType: 'something-new' })).toBe('medium');
    expect(route({ enemyType: 'seeker', elite: true })).toBe('large');
    expect(route({ enemy: { type: 'mote', elite: true } })).toBe('medium');
    expect(route({ enemyType: 'warden', elite: true })).toBe('large');
    expect(route({ enemyType: 'mine' })).toBeNull();
  });
});

describe('SFXBus distance mix (enemy cues fade and darken with distance)', () => {
  it('gain and cutoff fall monotonically with distance and clamp at both ends', () => {
    const near = resolveDistanceMix(0, 0);
    expect(near.gain).toBe(1);
    expect(near.cutoff).toBeCloseTo(AUDIO_DISTANCE_MIX.nearCutoffHz, 6);
    expect(resolveDistanceMix(120, 0)).toEqual(near);

    let previous = near;
    for (let d = 150; d <= 900; d += 50) {
      const mix = resolveDistanceMix(0, d);
      expect(mix.gain).toBeLessThan(previous.gain);
      expect(mix.cutoff).toBeLessThan(previous.cutoff);
      previous = mix;
    }
    const far = resolveDistanceMix(540, 720); // 900 px
    expect(far.gain).toBeCloseTo(AUDIO_DISTANCE_MIX.farGain, 9);
    expect(far.cutoff).toBeCloseTo(AUDIO_DISTANCE_MIX.farCutoffHz, 6);
    expect(resolveDistanceMix(5000, 0)).toEqual(resolveDistanceMix(900, 0));
    expect(resolveDistanceMix(NaN, 0)).toEqual(near);
  });

  it('a far enemy cue goes through a lowpass and a gain; a near one does not', () => {
    const { bus, context } = makeInitializedBus();
    bus.playEnemyTelegraph({ distance: resolveDistanceMix(0, 0) });
    const nearFilters = context.createBiquadFilter.mock.results.length;
    expect(nearFilters).toBe(0);

    const distance = resolveDistanceMix(0, 700);
    bus.playEnemyTelegraph({ pan: 0.3, distance });
    const filters = context.createBiquadFilter.mock.results.map((r) => r.value);
    expect(filters).toHaveLength(1);
    expect(filters[0].type).toBe('lowpass');
    expect(filters[0].frequency.value).toBeCloseTo(distance.cutoff, 6);
    const distanceGain = context.createGain.mock.results
      .map((r) => r.value)
      .find((g) => g.gain.value === distance.gain);
    expect(distanceGain).toBeDefined();
  });
});

describe('SFXBus Warden transmission voice (granular)', () => {
  function playVoice(speaker) {
    const { bus, context } = makeInitializedBus();
    const frequencyLog = [];
    context.createOscillator = vi.fn(() =>
      createOscillatorStub({ frequencyLog })
    );
    const gainsBefore = context.createGain.mock.results.length;
    bus.playTransmissionVoice(speaker);
    const gains = context.createGain.mock.results
      .slice(gainsBefore)
      .map((r) => r.value);
    return { context, frequencyLog, gains };
  }
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

  it('every story speaker has a voice of 8-12 grains', () => {
    Object.values(STORY.speaker).forEach((speaker) => {
      const voice = TRANSMISSION_VOICE.speakers[speaker];
      expect(voice, speaker).toBeDefined();
      expect(voice.grains).toBeGreaterThanOrEqual(8);
      expect(voice.grains).toBeLessThanOrEqual(12);
    });
  });

  it('PRIME is low, CHOIR cycles a triad, THE RING is neutral', () => {
    const prime = playVoice('WARDEN PRIME').frequencyLog;
    expect(prime).toHaveLength(10);
    prime.forEach((f) => expect(f).toBeCloseTo(hz(31), 6));

    const choir = playVoice('THE CHOIR').frequencyLog;
    expect(choir).toHaveLength(12);
    expect(new Set(choir.map((f) => f.toFixed(3))).size).toBe(3);
    expect(choir.slice(0, 3)).toEqual([hz(48), hz(51), hz(55)]);

    const ring = playVoice('THE RING').frequencyLog;
    expect(ring).toHaveLength(9);
    ring.forEach((f) => expect(f).toBeCloseTo(hz(45), 6));
    // Unknown speakers fall back to THE RING.
    expect(playVoice('SOMEONE').frequencyLog).toEqual(ring);
  });

  it('NULL alternates a sub with whisper-noise grains', () => {
    const { context, frequencyLog } = playVoice('WARDEN NULL');
    expect(frequencyLog).toHaveLength(4);
    frequencyLog.forEach((f) => expect(f).toBeCloseTo(hz(24), 6));
    expect(context.createBufferSource).toHaveBeenCalledTimes(4);
  });

  it('Heralds: DUST grinds noise through its formant, HEAT crackles a semitone, SILENCE barely whispers', () => {
    const dust = playVoice('HERALD OF DUST');
    expect(dust.frequencyLog).toHaveLength(5);
    expect(dust.context.createBufferSource).toHaveBeenCalledTimes(5);
    // Grit adds no highpass: only the formant filter.
    expect(dust.context.createBiquadFilter).toHaveBeenCalledTimes(1);

    const heat = playVoice('HERALD OF HEAT').frequencyLog;
    expect(heat).toHaveLength(12);
    expect(heat.slice(0, 2)).toEqual([hz(57), hz(58)]);

    const silence = playVoice('HERALD OF SILENCE');
    expect(silence.frequencyLog).toHaveLength(4);
    expect(silence.gains[0].gain.value).toBeCloseTo(
      0.09 * 10 ** ((TRANSMISSION_VOICE.levelDb - 10) / 20),
      9
    );
  });

  it('sits levelDb under the squelch peak and fits in its window', () => {
    const { gains } = playVoice('THE RING');
    const [output, , ...envelopes] = gains; // output, reverb send, grains
    expect(output.gain.value).toBeCloseTo(
      0.09 * 10 ** (TRANSMISSION_VOICE.levelDb / 20),
      9
    );
    const last = TRANSMISSION_VOICE.delaySeconds + TRANSMISSION_VOICE.seconds;
    expect(envelopes).toHaveLength(9);
    envelopes.forEach((value) => {
      const times = value.gain.linearRampToValueAtTime.mock.calls.map(
        (call) => call[1]
      );
      times.forEach((t) => expect(t).toBeLessThanOrEqual(last + 1e-9));
    });
  });
});
