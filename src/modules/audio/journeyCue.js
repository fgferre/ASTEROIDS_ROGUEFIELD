// The journey's score (MUSIC_JOURNEY, data/audio/music.js): synthesized
// live on the music path, so the music slider, Mute All and the voices'
// duck apply. The journey's moments come planned when it starts
// ('travel-planned', render3d/travelScene.js), seconds from then: every note
// is scheduled on the audio clock at once, so the swells arrive on their
// moment. `end` before the plan's end (a skip), a new run or the audio's
// teardown stop it over MUSIC_JOURNEY.stopSeconds. Its own seeded stream
// for the detune: nothing of the simulation is touched.
import { MUSIC_JOURNEY, MUSIC_THEMES } from '../../data/audio/music.js';
import RandomService from '../../core/RandomService.js';
import { dbToGain, midiToHz, scaleDegreeSemitones } from './MusicThemes.js';

// Nodes are released this long after the last sound ends, seconds.
const RELEASE_AFTER = 0.2;

/**
 * `getContext()`/`getDestination()` the live AudioContext and the music
 * bus's input (the duck stage).
 */
export function createJourneyCue({ getContext, getDestination }) {
  let playing = null; // { context, out, nodes, oscillators, endAt, timer }

  function release(cue) {
    clearTimeout(cue.timer);
    cue.oscillators.forEach(({ osc }) => {
      try {
        osc.stop(0);
      } catch {
        // Already stopped.
      }
      osc.disconnect();
    });
    cue.nodes.forEach((node) => node.disconnect());
    if (playing === cue) playing = null;
  }

  /**
   * Schedules the score of a journey whose `moments` ([{ id, at }]) and end
   * (`duration`) fall that many seconds from now. False when it can't play.
   */
  function play({ moments = [], duration } = {}) {
    stop();
    const context = getContext();
    const destination = getDestination();
    if (!context || !destination || context.state !== 'running') return false;
    if (!Number.isFinite(duration)) return false;

    const J = MUSIC_JOURNEY;
    const theme = MUSIC_THEMES[J.theme];
    const now = context.currentTime;
    const at = (id) => {
      const moment = moments.find((m) => m.id === id);
      return moment ? now + moment.at : null;
    };
    const T = {
      ignite: at('ignite'),
      charge: at('charge'),
      leap: at('leap'),
      dropout: at('dropout'),
      flyby: at('flyby'),
      brake: at('brake'),
      end: now + duration,
    };
    const random = new RandomService(J.seed);
    const nodes = [];
    const oscillators = [];
    let lastSound = T.end;
    const cue = { context, out: null, nodes, oscillators, endAt: T.end };

    const node = (created) => {
      nodes.push(created);
      return created;
    };
    const osc = (type, hz, start, end) => {
      const o = context.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(hz, start);
      o.onended = () => o.disconnect();
      o.start(Math.max(now, start));
      o.stop(Math.max(now, end));
      oscillators.push({ osc: o, start });
      lastSound = Math.max(lastSound, end);
      return o;
    };
    const filterOf = ({ type, frequency, Q }) => {
      const f = node(context.createBiquadFilter());
      f.type = type;
      f.frequency.setValueAtTime(frequency, now);
      f.Q.setValueAtTime(Q, now);
      return f;
    };
    const semitoneHz = (semitones) => midiToHz(theme.root + semitones);
    const degree = (d, octave) =>
      12 * octave + scaleDegreeSemitones(theme.scale, d);

    const out = node(context.createGain());
    out.gain.setValueAtTime(dbToGain(J.levelDb), now);
    out.connect(destination);
    cue.out = out;

    // A held chord (stacked oscillators → filter → equal-power level → its
    // envelope gain), sounding from `start` to `end`.
    function chord(spec, start, end, lfo = null) {
      const env = node(context.createGain());
      env.gain.setValueAtTime(0, now);
      env.connect(out);
      const level = node(context.createGain());
      level.gain.setValueAtTime(1 / Math.sqrt(spec.notes.length), now);
      level.connect(env);
      const filter = filterOf(spec.filter);
      filter.connect(level);
      spec.notes.forEach((note) => {
        const o = osc(spec.type, semitoneHz(note), start, end);
        o.detune.setValueAtTime(random.range(-1, 1) * J.detuneCents, start);
        o.connect(filter);
      });
      if (lfo) {
        const depth = node(context.createGain());
        depth.gain.setValueAtTime(lfo.depth, now);
        depth.connect(level.gain);
        osc('sine', lfo.rate, start, end).connect(depth);
      }
      return env.gain;
    }

    // The plucks: lowpass, then dry plus the feedback delay.
    const echo = filterOf({ type: 'lowpass', frequency: J.echo.lowpass, Q: 1 });
    const dry = node(context.createGain());
    dry.gain.setValueAtTime(1, now);
    echo.connect(dry);
    dry.connect(out);
    const delay = node(context.createDelay(1));
    delay.delayTime.setValueAtTime(J.echo.delay, now);
    const feedback = node(context.createGain());
    feedback.gain.setValueAtTime(J.echo.feedback, now);
    const wet = node(context.createGain());
    wet.gain.setValueAtTime(J.echo.wet, now);
    echo.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(out);

    function pluck(t, semitones, gain, decay = J.pluck.decay) {
      J.pluck.partials.forEach((partial) => {
        const env = node(context.createGain());
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(
          gain * partial.gain,
          t + J.pluck.attack
        );
        env.gain.setTargetAtTime(0, t + J.pluck.fallFrom, decay / 4);
        env.connect(echo);
        const hz = semitoneHz(semitones) * partial.ratio;
        osc(partial.type, hz, t, t + decay + 0.5).connect(env);
      });
    }
    function motif(t, spec) {
      if (t === null) return;
      const notes = spec.notes ?? theme.motif;
      notes.forEach((d, k) => {
        const last = k === notes.length - 1;
        pluck(
          t + k * spec.step,
          degree(d, spec.octave),
          spec.gain,
          last ? J.pluck.lastDecay : J.pluck.decay
        );
      });
    }

    const pad = chord(J.pad, now, T.end + 5 * J.pad.fallTau, J.pad.lfo);
    pad.setTargetAtTime(J.pad.gain, now, J.pad.riseTau);
    pad.setTargetAtTime(0, T.end, J.pad.fallTau);

    motif(T.ignite, J.motifs.ignite);
    if (T.leap !== null && T.charge !== null) {
      const { climb, bloom } = J;
      let t = T.charge;
      let step = climb.step;
      for (let k = 0; t < T.leap - climb.stopsBefore; k += 1) {
        const k01 = (t - T.charge) / (T.leap - T.charge);
        const gain = climb.gainFrom + (climb.gainTo - climb.gainFrom) * k01;
        const d = climb.notes[k % climb.notes.length];
        const octave = climb.octave + Math.floor(k / climb.octaveEvery);
        pluck(t, degree(d, octave), gain, climb.decay);
        t += step;
        step = Math.max(climb.minStep, step * climb.quicken);
      }
      const dropout = T.dropout ?? T.leap;
      const fall = dropout + bloom.fallAfter;
      const swell = chord(bloom, T.leap, fall + 5 * bloom.fallTau);
      swell.setValueAtTime(0, T.leap);
      swell.linearRampToValueAtTime(bloom.peak, dropout + bloom.peakAfter);
      swell.setTargetAtTime(0, fall, bloom.fallTau);
      motif(dropout + J.motifs.dropout.after, J.motifs.dropout);
    } else {
      motif(T.flyby, J.motifs.flyby);
    }
    motif(T.brake, J.motifs.brake);

    const { resolve } = J;
    pluck(
      T.end,
      degree(resolve.degree, resolve.octave),
      resolve.gain,
      resolve.decay
    );
    const rise = T.end + resolve.riseFrom;
    const fall = T.end + resolve.fallAfter;
    const open = chord(resolve, rise, fall + 5 * resolve.fallTau);
    open.setValueAtTime(0, rise);
    open.linearRampToValueAtTime(resolve.peak, T.end + resolve.peakAfter);
    open.setTargetAtTime(0, fall, resolve.fallTau);

    // The echo's tail rings out past the last note.
    const tail = J.echo.delay / (1 - J.echo.feedback);
    cue.timer = setTimeout(
      () => release(cue),
      (lastSound + tail + RELEASE_AFTER - now) * 1000
    );
    playing = cue;
    return true;
  }

  /** The journey ended: cut short (a skip), the score stops on a fade. */
  function end() {
    if (!playing) return;
    if (playing.context.currentTime < playing.endAt - MUSIC_JOURNEY.early) {
      stop();
    }
  }

  /** Whatever plays stops over MUSIC_JOURNEY.stopSeconds; nothing starts after. */
  function stop() {
    const cue = playing;
    if (!cue) return;
    playing = null;
    const now = cue.context.currentTime;
    const fadeEnd = now + MUSIC_JOURNEY.stopSeconds;
    const gain = cue.out.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, fadeEnd);
    // A note still to come never starts; one sounding fades out.
    cue.oscillators.forEach(({ osc, start }) => {
      try {
        osc.stop(start > now ? now : fadeEnd);
      } catch {
        // Already stopped.
      }
    });
    clearTimeout(cue.timer);
    cue.timer = setTimeout(
      () => release(cue),
      (MUSIC_JOURNEY.stopSeconds + RELEASE_AFTER) * 1000
    );
  }

  return Object.freeze({ play, end, stop });
}
