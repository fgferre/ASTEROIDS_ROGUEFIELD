// The journey's score: a recording per destination chapter
// (JOURNEY_CUES, data/audio/sectorScores.js), played on the music path so
// the music slider, Mute All and the voices' duck apply. Each file has its
// "jump hit" JOURNEY_CUE_HIT_SECONDS in; a journey with a leap starts the
// file so the hit lands on the leap, a hop's at the start. `end` fades it
// over MUSIC_JOURNEY.fadeSeconds, or MUSIC_JOURNEY.skipFadeSeconds when the
// journey is cut short; a new run or the audio's teardown stop it too.
import { MUSIC_JOURNEY } from '../../data/audio/music.js';
import {
  JOURNEY_CUES,
  JOURNEY_CUE_HIT_SECONDS,
} from '../../data/audio/sectorScores.js';

async function fetchAndDecode(context, url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return context.decodeAudioData(await response.arrayBuffer());
}

/**
 * `getContext()`/`getDestination()` the live AudioContext and the music
 * bus's input (the duck stage).
 */
export function createJourneyCue({
  getContext,
  getDestination,
  load = fetchAndDecode,
}) {
  const buffers = new Map(); // chapter -> Promise<AudioBuffer | null>
  let playing = null; // { context, source, out, endAt, timer }
  let token = 0;

  function buffer(chapter) {
    const url = JOURNEY_CUES[chapter];
    const context = getContext();
    if (!url || !context) return null;
    if (!buffers.has(chapter)) {
      buffers.set(
        chapter,
        load(context, url).catch((error) => {
          buffers.delete(chapter);
          console.warn('[journeyCue] could not load the cue:', error);
          return null;
        })
      );
    }
    return buffers.get(chapter);
  }

  /** The destination's cue is fetched ahead, so play() need not wait. */
  function prefetch(chapter) {
    buffer(chapter);
  }

  function release(cue) {
    clearTimeout(cue.timer);
    try {
      cue.source.stop(0);
    } catch {
      // Already stopped.
    }
    cue.source.disconnect();
    cue.out.disconnect();
    if (playing === cue) playing = null;
  }

  function fadeOut(cue, seconds) {
    const now = cue.context.currentTime;
    const gain = cue.out.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + seconds);
    try {
      cue.source.stop(now + seconds);
    } catch {
      // Already stopped.
    }
    clearTimeout(cue.timer);
    cue.timer = setTimeout(() => release(cue), (seconds + 0.2) * 1000);
  }

  /**
   * Starts the recording of `chapter` for a journey whose `moments`
   * ([{ id, at }]) and end (`duration`) fall that many seconds from now.
   * False when nothing will play; true when it plays (once loaded).
   */
  function play({ moments = [], duration, chapter } = {}) {
    stop();
    const context = getContext();
    if (!context || !getDestination() || context.state !== 'running') {
      return false;
    }
    if (!Number.isFinite(duration)) return false;
    const pending = buffer(chapter);
    if (!pending) return false;

    const mine = ++token;
    const startedAt = context.currentTime;
    const leap = moments.find((m) => m.id === 'leap')?.at;
    // Where the file stands as the journey starts: negative = it waits.
    const base =
      leap === undefined ? 0 : Math.max(0, JOURNEY_CUE_HIT_SECONDS - leap);
    pending.then((decoded) => {
      if (mine !== token || !decoded) return;
      const now = context.currentTime;
      // Late by the load, the file catches up.
      const position = base + (now - startedAt);
      const source = context.createBufferSource();
      source.buffer = decoded;
      const out = context.createGain();
      source.connect(out);
      out.connect(getDestination());
      const cue = { context, source, out, endAt: startedAt + duration };
      source.onended = () => release(cue);
      source.start(now, Math.min(position, decoded.duration));
      playing = cue;
    });
    return true;
  }

  /** The journey ended: a cut short (a skip) fades fast, else gently. */
  function end() {
    token++; // a cue still loading never starts
    const cue = playing;
    if (!cue) return;
    playing = null;
    const early =
      cue.context.currentTime < cue.endAt - MUSIC_JOURNEY.earlySeconds;
    fadeOut(
      cue,
      early ? MUSIC_JOURNEY.skipFadeSeconds : MUSIC_JOURNEY.fadeSeconds
    );
  }

  /** Whatever plays stops over MUSIC_JOURNEY.skipFadeSeconds; nothing starts after. */
  function stop() {
    token++;
    const cue = playing;
    if (!cue) return;
    playing = null;
    fadeOut(cue, MUSIC_JOURNEY.skipFadeSeconds);
  }

  return Object.freeze({ play, end, stop, prefetch });
}
