import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SectorScore from '../../../src/modules/audio/SectorScore.js';
import {
  SECTOR_SCORES,
  chapterScoreForLayer,
} from '../../../src/data/audio/sectorScores.js';
import { AUDIO_EVENT_HANDLERS } from '../../../src/modules/audio/eventHandlers.js';

// A Web Audio stand-in recording the sources made and the gain params written.
function fakeContext() {
  const sources = [];
  const param = (value = 1) => ({
    value,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    setValueCurveAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const node = (extra) => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    ...extra,
  });
  const context = {
    currentTime: 5,
    createGain: () => node({ gain: param() }),
    createBiquadFilter: () => node({ frequency: param(), Q: param() }),
    createBufferSource: () => {
      const source = node({ start: vi.fn(), stop: vi.fn(), loop: false });
      sources.push(source);
      return source;
    },
  };
  return { context, sources };
}

// 0.01 s of padding, then sound.
const buffer = () => {
  const data = new Float32Array(1000);
  data.fill(0.5, 441);
  return {
    length: 1000,
    sampleRate: 44100,
    numberOfChannels: 1,
    getChannelData: () => data,
  };
};

describe('SectorScore', () => {
  let rec;
  let mixer;
  let target;
  let score;
  beforeEach(() => {
    vi.useFakeTimers();
    rec = fakeContext();
    mixer = { runIntensity: 0 };
    target = {};
    score = new SectorScore({ mixer, load: async () => buffer() });
    score.init(rec.context, target);
  });
  afterEach(() => vi.useRealTimers());

  it('a sector without a score plays nothing', async () => {
    await score.start('no-such-sector');
    expect(rec.sources).toHaveLength(0);
  });

  it('a run with no sector plays the score of the layer chapter and switches with it; a sector run ignores that', async () => {
    const chapter = (layer) => score.playChapter(chapterScoreForLayer(layer));
    const load = vi.fn(async (_context, url) => ({ ...buffer(), url }));
    score = new SectorScore({ mixer, load });
    score.init(rec.context, target);
    await score.start(undefined);
    await chapter(1);
    const played = () =>
      load.mock.calls.map(([, url]) => url).filter((u) => /stage/.test(u));
    expect(played().at(-1)).toBe(SECTOR_SCORES['prime-gate'].stage);
    await chapter(5);
    expect(played()).toHaveLength(1);
    await chapter(6);
    expect(played().at(-1)).toBe(SECTOR_SCORES['dense-core'].stage);
    await chapter(16);
    expect(played().at(-1)).toBe(SECTOR_SCORES['the-crucible'].stage);
    expect(chapterScoreForLayer(11)).toBe('wardens-reach');

    load.mockClear();
    await score.start('debris-wake');
    await chapter(6);
    expect(played()).toEqual([SECTOR_SCORES['debris-wake'].stage]);
  });

  it('a sectorless run whose first wave started the chapter score keeps it when the run start arrives', async () => {
    await score.playChapter(chapterScoreForLayer(1));
    const sources = [...rec.sources];
    await score.start(undefined);
    expect(score.active).toBe(true);
    sources.forEach((source) => expect(source.stop).not.toHaveBeenCalled());
  });

  it('a campaign run whose first wave asks for the chapter score just before its start never fetches it', async () => {
    const load = vi.fn(async () => buffer());
    score = new SectorScore({ mixer, load });
    score.init(rec.context, target);
    const chapter = score.playChapter(chapterScoreForLayer(1));
    await Promise.all([chapter, score.start('debris-wake')]);
    const loaded = load.mock.calls.map(([, url]) => url);
    const { stage, boss } = SECTOR_SCORES['prime-gate'];
    expect(loaded).not.toContain(stage);
    expect(loaded).not.toContain(boss);
    expect(loaded).toContain(SECTOR_SCORES['debris-wake'].stage);
  });

  it('debris-wake: two looping sources start together, loop as long as the track', async () => {
    await score.start('debris-wake');
    const [stage, boss] = rec.sources;
    expect(rec.sources).toHaveLength(2);
    expect(stage.loop && boss.loop).toBe(true);
    expect(stage.start.mock.calls[0][0]).toBe(boss.start.mock.calls[0][0]);
    expect(stage.start.mock.calls[0][0]).toBeGreaterThanOrEqual(5.1);
    expect(stage.loopStart).toBeCloseTo(0.01, 4);
    expect(stage.loopEnd - stage.loopStart).toBeCloseTo(
      SECTOR_SCORES['debris-wake'].loopSeconds,
      6
    );
  });

  it('start() decodes the bytes prefetched when the sector was picked, without fetching again', async () => {
    const fetchBytes = vi.fn(async (url) => new ArrayBuffer(url.length));
    const load = vi.fn(async () => buffer());
    score = new SectorScore({ mixer, load, fetchBytes });
    score.init(rec.context, target);
    score.prefetch('debris-wake');
    await score.start('debris-wake');
    const { stage, boss } = SECTOR_SCORES['debris-wake'];
    expect(fetchBytes.mock.calls.map(([url]) => url)).toEqual([stage, boss]);
    expect(load).toHaveBeenCalledWith(
      rec.context,
      stage,
      expect.any(ArrayBuffer)
    );
    expect(rec.sources).toHaveLength(2);
  });

  it("two quick picks on the map keep the second sector's music, even when the first pick's journey cue arrives last", async () => {
    const fetchBytes = vi.fn(async (url) => new ArrayBuffer(url.length));
    const load = vi.fn(async () => buffer());
    score = new SectorScore({ mixer, load, fetchBytes });
    score.init(rec.context, target);
    // Each chapter's journey cue lands when the test says; the story's at once.
    const arrive = {};
    const cues = {};
    const audio = {
      _afterMenuMusic: (prefetch) => prefetch(),
      sectorScore: score,
      journeyCue: {
        prefetch: ({ chapter, url }) => {
          if (url) return Promise.resolve(null);
          cues[chapter] ??= new Promise((done) => (arrive[chapter] = done));
          return cues[chapter];
        },
      },
    };
    AUDIO_EVENT_HANDLERS.sectorScorePrefetch(audio, { sector: 'debris-wake' });
    AUDIO_EVENT_HANDLERS.sectorScorePrefetch(audio, { sector: 'dense-core' });
    arrive[2](null); // Dense Core's chapter cue first
    await vi.advanceTimersByTimeAsync(0);
    arrive[1](null); // then Debris Wake's, late
    await vi.advanceTimersByTimeAsync(0);

    const fetched = () => fetchBytes.mock.calls.map(([url]) => url);
    const dense = SECTOR_SCORES['dense-core'];
    expect(fetched()).toEqual([dense.stage, dense.boss]);
    await score.start('dense-core');
    // The launch decodes the prefetched bytes: nothing is fetched again.
    expect(load).toHaveBeenCalledWith(
      rec.context,
      dense.stage,
      expect.any(ArrayBuffer)
    );
    expect(rec.sources).toHaveLength(2);
  });

  it('boss-warning plays the stinger and crossfades the boss in, the stage out', async () => {
    await score.start('debris-wake');
    const { bossFade, stageFade } = score._nodes;
    const before = rec.sources.length;
    score.onBossEvent('boss-warning');
    expect(rec.sources).toHaveLength(before + 1);
    expect(
      bossFade.gain.setValueCurveAtTime.mock.calls[0][0].at(-1)
    ).toBeCloseTo(1);
    expect(
      stageFade.gain.setValueCurveAtTime.mock.calls[0][0].at(-1)
    ).toBeCloseTo(0);
  });

  it('stop() stops the sources', async () => {
    await score.start('debris-wake');
    const sources = [...rec.sources];
    score.stop();
    sources.forEach((source) => expect(source.stop).toHaveBeenCalled());
    expect(score.active).toBe(false);
  });

  it('a sectorless run that died plays its chapter score again on the retry and on the next wave', async () => {
    const chapter = (layer) => score.playChapter(chapterScoreForLayer(layer));
    // A retry comes back on the layer the ship died on, not the first.
    expect(chapterScoreForLayer(12)).not.toBe(chapterScoreForLayer(1));
    await chapter(12);
    score.stop();
    expect(score.active).toBe(false);
    AUDIO_EVENT_HANDLERS.screen(
      {
        sectorScore: score,
        voiceLines: { expect() {} },
        _handleScreenChanged() {},
      },
      { screen: 'playing', source: 'retry-complete' }
    );
    await vi.waitFor(() => expect(score.active).toBe(true));
    expect(score._chapterId).toBe(chapterScoreForLayer(12));
    score.stop();
    await chapter(12);
    expect(score.active).toBe(true);
  });

  it('a boss that spawned while the score was still loading comes in when it is ready, warning or not', async () => {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    score = new SectorScore({
      mixer,
      load: async () => {
        await gate;
        return buffer();
      },
    });
    score.init(rec.context, target);
    const loading = score.playChapter(chapterScoreForLayer(1));
    score.onBossEvent('boss-spawned');
    release();
    await loading;
    const { bossFade, stageFade } = score._nodes;
    expect(
      bossFade.gain.setValueCurveAtTime.mock.calls[0][0].at(-1)
    ).toBeCloseTo(1);
    expect(
      stageFade.gain.setValueCurveAtTime.mock.calls[0][0].at(-1)
    ).toBeCloseTo(0);
  });

  it('a boss that spawns with no warning before it brings the boss layer in, without the stinger', async () => {
    await score.start('debris-wake');
    const before = rec.sources.length;
    score.onBossEvent('boss-spawned');
    expect(rec.sources).toHaveLength(before);
    expect(
      score._nodes.bossFade.gain.setValueCurveAtTime.mock.calls[0][0].at(-1)
    ).toBeCloseTo(1);
  });

  it('a stinger that fails to load only loses that stinger: the music still starts', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    score = new SectorScore({
      mixer,
      load: async (_context, url) => {
        if (/sting-boss-warning/.test(url)) throw new Error('404');
        return buffer();
      },
    });
    score.init(rec.context, target);
    await score.start('prime-gate');
    expect(score.active).toBe(true);
    expect(rec.sources).toHaveLength(2);
  });

  it('a slow stinger does not hold the music back; asked for before it arrived, it is skipped', async () => {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    score = new SectorScore({
      mixer,
      load: async (_context, url) => {
        if (/sting-boss-warning/.test(url)) await gate;
        return buffer();
      },
    });
    score.init(rec.context, target);
    await score.start('prime-gate');
    expect(score.active).toBe(true);
    expect(rec.sources).toHaveLength(2);
    score.onBossEvent('boss-warning');
    expect(rec.sources).toHaveLength(2);
    release();
    await vi.advanceTimersByTimeAsync(0);
    score.onBossEvent('boss-warning');
    expect(rec.sources).toHaveLength(3);
  });
});
