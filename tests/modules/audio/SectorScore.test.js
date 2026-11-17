import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SectorScore from '../../../src/modules/audio/SectorScore.js';
import { SECTOR_SCORES } from '../../../src/data/audio/sectorScores.js';

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
    mixer = { runIntensity: 0, setSilenced: vi.fn() };
    target = {};
    score = new SectorScore({ mixer, load: async () => buffer() });
    score.init(rec.context, target);
  });
  afterEach(() => vi.useRealTimers());

  it('a sector without a score plays nothing and leaves the mixer alone', async () => {
    await score.start('no-such-sector');
    expect(rec.sources).toHaveLength(0);
    expect(mixer.setSilenced).not.toHaveBeenCalledWith(true, expect.anything());
  });

  it('debris-wake: two looping sources start together, loop as long as the track, mixer silenced', async () => {
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
    expect(mixer.setSilenced).toHaveBeenCalledWith(true, expect.any(Number));
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

  it('crystal-choir has no boss track: one source, the Warden opens the stage fully', async () => {
    await score.start('crystal-choir');
    expect(rec.sources).toHaveLength(1);
    const { lowpass, dangerGain } = score._nodes;
    const before = rec.sources.length;
    score.onBossEvent('boss-warning');
    expect(rec.sources).toHaveLength(before + 1); // the stinger
    score._followDanger(true);
    expect(lowpass.frequency.setTargetAtTime.mock.calls.at(-1)[0]).toBe(18000);
    expect(dangerGain.gain.setTargetAtTime.mock.calls.at(-1)[0]).toBe(1);
    score.onBossEvent('boss-defeated');
    score._followDanger(true);
    expect(lowpass.frequency.setTargetAtTime.mock.calls.at(-1)[0]).toBe(900);
  });

  it('stop() gives the mixer back and stops the sources', async () => {
    await score.start('debris-wake');
    const sources = [...rec.sources];
    score.stop();
    expect(mixer.setSilenced).toHaveBeenLastCalledWith(
      false,
      expect.any(Number)
    );
    sources.forEach((source) => expect(source.stop).toHaveBeenCalled());
    expect(score.active).toBe(false);
  });
});
