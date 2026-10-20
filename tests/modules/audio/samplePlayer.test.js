import { describe, it, expect, vi } from 'vitest';
import SFXBus from '../../../src/modules/audio/SFXBus.js';
import { sampleIdFor } from '../../../src/modules/audio/samplePlayer.js';
import {
  SAMPLE_CUES,
  SAMPLE_PLAYBACK,
  SAMPLE_PRIORITY,
} from '../../../src/data/audio/samples.js';
import { resolveDistanceMix } from '../../../src/modules/audio/SFXBus.js';
import RandomService from '../../../src/core/RandomService.js';
import {
  createAudioContextStub,
  createGainStub,
} from '../../__helpers__/stubs.js';

// The sample layer (SOUND.md): a cue whose sample is loaded plays it, varied
// and within the voice rules, on the synthesis's bus; any other cue
// synthesizes as before.

/** A bus on stub nodes whose buffer sources record what they play. */
function makeBus() {
  const context = createAudioContextStub({ state: 'running' });
  const sources = [];
  context.createBufferSource = vi.fn(() => {
    const source = {
      buffer: null,
      playbackRate: { value: 1 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    sources.push(source);
    return source;
  });
  // A decoded file remembers its path; one second long.
  context.decodeAudioData = vi.fn(async (file) => ({
    path: file.path,
    duration: 1,
  }));

  const random = new RandomService('samples:test');
  const fork = (name) => random.fork(name);
  const scopes = {
    base: random,
    families: { impact: fork('impact'), explosion: fork('explosion') },
    bufferFamilies: { explosion: fork('buffer:explosion') },
  };
  const bus = new SFXBus();
  bus.init(context, {
    effectsDuckGain: createGainStub(),
    effectsGain: createGainStub(),
    getContext: () => context,
    getRandomScopes: () => scopes,
    safePlay: (fn) => fn(),
    randomScopes: scopes,
  });
  return { bus, context, sources };
}

/** A fetch for `manifest` whose files resolve to their own path. */
function fetchFor(manifest) {
  return async (path) =>
    path === 'manifest.json'
      ? { json: async () => manifest }
      : { arrayBuffer: async () => ({ path }) };
}

function sample(files, mix = {}) {
  return { files, gain: 0, priority: SAMPLE_PRIORITY.hit, ...mix };
}

/** The sources that started and were not stopped. */
function live(sources) {
  return sources.filter(
    (s) => s.start.mock.calls.length && !s.stop.mock.calls.length
  );
}

describe('sample layer', () => {
  it('draws variations without repeating the last, varied in pitch and gain, on the cue bus', async () => {
    const { bus, context, sources } = makeBus();
    const files = ['ship-hit/1.mp3', 'ship-hit/2.mp3', 'ship-hit/3.mp3'];
    await bus.samples.load(
      fetchFor({ 'ship-hit': sample(files, { gain: -6 }) })
    );

    for (let i = 0; i < 40; i += 1) {
      context.currentTime = i * 2;
      bus.playShipHit();
    }

    const picks = sources.map((s) => s.buffer.path);
    expect(picks).toHaveLength(40);
    expect(new Set(picks)).toEqual(new Set(files));
    picks.slice(1).forEach((path, i) => expect(path).not.toBe(picks[i]));
    sources.forEach((s) => {
      expect(Math.abs(s.playbackRate.value - 1)).toBeLessThanOrEqual(
        SAMPLE_PLAYBACK.pitchSpread
      );
      const voiceGain = s.connect.mock.calls[0][0];
      const db = 20 * Math.log10(voiceGain.gain.value);
      expect(Math.abs(db + 6)).toBeLessThanOrEqual(
        SAMPLE_PLAYBACK.gainSpreadDb + 1e-9
      );
      expect(voiceGain.connect).toHaveBeenCalledWith(bus.protectedBus);
    });
    // The sample replaced the synthesis.
    expect(context.createOscillator).not.toHaveBeenCalled();
  });

  it('drops a start inside the gap and, at the cap, stops the oldest voice of that sample', async () => {
    const { bus, context, sources } = makeBus();
    await bus.samples.load(
      fetchFor({
        'lance-shot': sample(['lance-shot/1.mp3'], { cap: 2, gap: 30 }),
      })
    );

    [0, 0.01, 0.04, 0.08].forEach((time) => {
      context.currentTime = time;
      bus.playLaserShot();
    });

    // 0.01 s fell inside the 30 ms gap; the third start took the first's place.
    expect(sources).toHaveLength(3);
    expect(sources[0].stop).toHaveBeenCalled();
    expect(live(sources)).toEqual([sources[1], sources[2]]);
  });

  it('a run of XP pickups climbs a semitone each, up to +7, and starts over after a pause', async () => {
    const { bus, context, sources } = makeBus();
    await bus.samples.load(
      fetchFor({ 'xp-collect': sample(['xp-collect/1.mp3'], { gap: 25 }) })
    );
    const { window, max } = SAMPLE_CUES.playXPCollect.climb;

    // Pickups 0.1 s apart (one inside the gap, dropped), then a pause.
    const times = [0, 0.1, 0.11, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    times.forEach((time) => {
      context.currentTime = time;
      bus.playXPCollect();
    });
    context.currentTime = 0.9 + window + 0.01;
    bus.playXPCollect();

    const semitones = sources.map((s) =>
      Math.round(12 * Math.log2(s.playbackRate.value))
    );
    expect(semitones).toEqual([0, 1, 2, 3, 4, 5, 6, 7, max, max, 0]);
    sources.forEach((s, i) =>
      expect(s.playbackRate.value).toBeCloseTo(2 ** (semitones[i] / 12), 9)
    );
  });

  it('with every voice busy, stops the oldest of the lowest priority below the new one, else drops it', async () => {
    const { bus, context, sources } = makeBus();
    await bus.samples.load(
      fetchFor({
        'ui-hover': sample(['ui-hover/1.mp3'], {
          priority: SAMPLE_PRIORITY.interface,
        }),
        'xp-collect': sample(['xp-collect/1.mp3'], {
          priority: SAMPLE_PRIORITY.reward,
        }),
        'ship-hit': sample(['ship-hit/1.mp3'], {
          priority: SAMPLE_PRIORITY.playerDamage,
        }),
      })
    );
    let time = 0;
    const at = (play) => {
      time += 0.001;
      context.currentTime = time;
      play();
    };

    at(() => bus.playUIHover());
    at(() => bus.playUIHover());
    for (let i = 2; i < SAMPLE_PLAYBACK.maxVoices; i += 1) {
      at(() => bus.playXPCollect());
    }
    const [hoverA, hoverB, firstXp] = sources;

    at(() => bus.playShipHit());
    expect(hoverA.stop).toHaveBeenCalled();
    expect(hoverB.stop).not.toHaveBeenCalled();
    at(() => bus.playShipHit());
    at(() => bus.playShipHit());
    expect(hoverB.stop).toHaveBeenCalled();
    expect(firstXp.stop).toHaveBeenCalled();

    // Nothing below an interface sound or a reward: the new one is dropped.
    const started = sources.length;
    at(() => bus.playUIHover());
    at(() => bus.playXPCollect());
    expect(sources).toHaveLength(started);
    expect(live(sources)).toHaveLength(SAMPLE_PLAYBACK.maxVoices);
  });

  it('a cue whose sample is not loaded synthesizes, and a failed manifest logs once', async () => {
    const { bus, context, sources } = makeBus();
    let finishDecode;
    context.decodeAudioData = vi.fn(
      (file) =>
        new Promise((resolve) => {
          finishDecode = () => resolve({ path: file.path, duration: 1 });
        })
    );
    const loading = bus.samples.load(
      fetchFor({ 'ship-hit': sample(['ship-hit/1.mp3']) })
    );

    await vi.waitFor(() => expect(finishDecode).toBeDefined());
    bus.playShipHit(); // still decoding
    expect(context.createOscillator).toHaveBeenCalledTimes(1);
    finishDecode();
    await loading;
    bus.playShipHit();
    bus.playShieldBreak(); // not in the manifest
    expect(sources).toHaveLength(1);
    expect(context.createOscillator).toHaveBeenCalledTimes(2);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = makeBus();
    await broken.bus.samples.load(async () => {
      throw new Error('offline');
    });
    broken.bus.playShipHit();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(broken.sources).toHaveLength(0);
    expect(broken.context.createOscillator).toHaveBeenCalledTimes(1);
  });

  it('the explosion picks its sample by size, panned and distance-mixed like its synthesis', async () => {
    expect(sampleIdFor('playExplosion', ['small'])).toBe('explosion-small');
    expect(sampleIdFor('playExplosion', ['medium'])).toBe('explosion-medium');
    expect(sampleIdFor('playExplosion', ['large'])).toBe('explosion-large');
    expect(sampleIdFor('playExplosion', ['huge'])).toBeNull();
    expect(sampleIdFor('playLaserShot', [{}])).toBe('lance-shot');
    // A weapon's own shot, else the lance's.
    expect(sampleIdFor('playLaserShot', [{ weaponId: 'arc-caster' }])).toBe(
      'arc-caster-shot'
    );
    expect(sampleIdFor('playLaserShot', [{ weaponId: 'scatter' }])).toBe(
      'lance-shot'
    );

    const { bus, context, sources } = makeBus();
    await bus.samples.load(
      fetchFor({ 'explosion-medium': sample(['explosion-medium/1.mp3']) })
    );
    const ambientInput = vi.spyOn(bus, '_ambientInput');
    const distance = resolveDistanceMix(600, 0);

    bus.playExplosion('medium', { pan: 0.4, distance });
    expect(sources).toHaveLength(1);
    expect(sources[0].buffer.path).toBe('explosion-medium/1.mp3');
    expect(ambientInput).toHaveBeenCalledWith(0.4, distance);
    expect(context.createOscillator).not.toHaveBeenCalled();

    // No small sample: the small one synthesizes.
    bus.playExplosion('small', { pan: 0, distance: null });
    expect(context.createOscillator).toHaveBeenCalled();
    expect(sources.filter((s) => s.buffer?.path)).toHaveLength(1);
  });
});
