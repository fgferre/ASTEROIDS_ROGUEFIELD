import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJourneyCue } from '../../../src/modules/audio/journeyCue.js';
import { MUSIC_JOURNEY } from '../../../src/data/audio/music.js';

// A Web Audio stand-in that records each oscillator's type, pitch, start and
// stops, and each gain's scheduled values.
function recordingContext() {
  const oscillators = [];
  const gains = [];
  const param = (value = 1) => {
    const p = {
      value,
      events: [],
      setValueAtTime: (v, t) => p.events.push(['set', v, t]),
      linearRampToValueAtTime: (v, t) => p.events.push(['ramp', v, t]),
      setTargetAtTime: (v, t) => p.events.push(['target', v, t]),
      cancelScheduledValues: (t) => p.events.push(['cancel', null, t]),
    };
    return p;
  };
  const node = (extra) => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    ...extra,
  });
  const context = {
    currentTime: 10,
    state: 'running',
    createGain: () => {
      const gain = node({ gain: param() });
      gains.push(gain);
      return gain;
    },
    createBiquadFilter: () => node({ frequency: param(), Q: param() }),
    createDelay: () => node({ delayTime: param() }),
    createOscillator: () => {
      const osc = node({ frequency: param(), detune: param(), stops: [] });
      osc.start = (t) => (osc.startAt = t);
      osc.stop = (t) => osc.stops.push(t);
      oscillators.push(osc);
      return osc;
    },
  };
  return { context, oscillators, gains };
}

const JUMP = {
  moments: [
    { id: 'ignite', at: 1.7 },
    { id: 'burn', at: 3.6 },
    { id: 'charge', at: 5.3 },
    { id: 'flyby', at: 5.9 },
    { id: 'leap', at: 7.5 },
    { id: 'dropout', at: 7.9 },
    { id: 'brake', at: 16.8 },
  ],
  duration: 21,
};
const HOP = {
  moments: [
    { id: 'ignite', at: 1.4 },
    { id: 'burn', at: 1.6 },
    { id: 'flyby', at: 4.3 },
    { id: 'brake', at: 7.6 },
  ],
  duration: 10.2,
};

const near = (a, b) => Math.abs(a - b) < 1e-6;
const hz = (osc) => osc.frequency.events[0][1];

describe('journeyCue — the journey score (proposta 13/11)', () => {
  let rec;
  let destination;
  let cue;
  beforeEach(() => {
    vi.useFakeTimers();
    rec = recordingContext();
    destination = {};
    cue = createJourneyCue({
      getContext: () => rec.context,
      getDestination: () => destination,
    });
  });
  afterEach(() => vi.useRealTimers());

  // The plucks' fundamentals (triangles at their own pitch, not chords).
  const plucks = () =>
    rec.oscillators.filter(
      (o) => o.type === 'triangle' && o.stops[0] - o.startAt < 4
    );

  it('plucks the motif (A, E, F#) on the ignite, on the music path', () => {
    expect(cue.play(JUMP)).toBe(true);
    const ignite = 10 + 1.7;
    const motif = plucks().filter((o) => o.startAt < ignite + 1);
    expect(motif.map((o) => o.startAt)).toEqual([
      ignite,
      ignite + 0.45,
      ignite + 0.9,
    ]);
    expect(motif.map((o) => Math.round(hz(o)))).toEqual([220, 330, 370]);
    expect(rec.oscillators.every((o) => o.startAt >= 10)).toBe(true);
  });

  it('a jump climbs from the charge into the leap, where the chord swells', () => {
    cue.play(JUMP);
    const [charge, leap] = [10 + 5.3, 10 + 7.5];
    const climb = plucks().filter(
      (o) => o.startAt >= charge && o.startAt < leap
    );
    expect(climb[0].startAt).toBe(charge);
    expect(climb.length).toBeGreaterThan(8);
    const gaps = climb.slice(1).map((o, i) => o.startAt - climb[i].startAt);
    expect(gaps.every((gap, i) => i === 0 || gap <= gaps[i - 1] + 1e-9)).toBe(
      true
    ); // it quickens
    expect(climb.at(-1).startAt).toBeLessThan(
      leap - MUSIC_JOURNEY.climb.stopsBefore
    );
    expect(climb.at(-1).startAt + gaps.at(-1)).toBeGreaterThan(leap - 0.2);
    const bloom = rec.oscillators.filter((o) => o.startAt === leap);
    expect(bloom.map((o) => Math.round(hz(o) * 10) / 10)).toEqual([
      220, 329.6, 370, 440,
    ]);
  });

  it('the top A and the open chord land on the end', () => {
    cue.play(JUMP);
    const end = 10 + 21;
    const top = plucks().filter((o) => o.startAt === end);
    expect(top.map(hz)).toEqual([440]);
    const chord = rec.oscillators.filter((o) =>
      near(o.startAt, end + MUSIC_JOURNEY.resolve.riseFrom)
    );
    expect(chord).toHaveLength(MUSIC_JOURNEY.resolve.notes.length);
  });

  it('a hop has no warp material: the motif, a high echo on the fly-by, the brake, the end', () => {
    cue.play(HOP);
    const starts = plucks().map((o) => +(o.startAt - 10).toFixed(3));
    expect(starts).toEqual([1.4, 1.85, 2.3, 4.3, 4.65, 7.6, 8.05, 8.5, 10.2]);
    const held = rec.oscillators.filter((o) => o.stops[0] - o.startAt >= 4);
    expect(held.every((o) => o.type === 'sine')).toBe(true); // pad, chord, lfo
  });

  it('an early end (a skip) fades it out and nothing still to come starts', () => {
    cue.play(JUMP);
    rec.context.currentTime = 10 + 8;
    cue.end();
    const now = rec.context.currentTime;
    const coming = rec.oscillators.filter((o) => o.startAt > now);
    expect(coming.length).toBeGreaterThan(0);
    expect(coming.every((o) => o.stops.at(-1) <= o.startAt)).toBe(true);
    const sounding = rec.oscillators.filter((o) => o.startAt <= now);
    expect(
      sounding.every((o) => o.stops.at(-1) <= now + MUSIC_JOURNEY.stopSeconds)
    ).toBe(true);
    const out = rec.gains.find((g) =>
      g.connect.mock.calls.some(([to]) => to === destination)
    );
    expect(out.gain.events.at(-1)).toEqual([
      'ramp',
      0,
      now + MUSIC_JOURNEY.stopSeconds,
    ]);
    vi.runAllTimers();
    expect(rec.oscillators.every((o) => o.disconnect.mock.calls.length)).toBe(
      true
    );
  });

  it('the end on time lets the resolve ring; nothing plays without a running context', () => {
    cue.play(JUMP);
    rec.context.currentTime = 10 + 21;
    cue.end();
    expect(rec.oscillators.filter((o) => o.stops.length > 1)).toHaveLength(0);

    rec.context.state = 'suspended';
    expect(cue.play(JUMP)).toBe(false);
  });
});
