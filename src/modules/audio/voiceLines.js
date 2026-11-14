// The recorded story lines (src/public/audio/voice/: manifest.json and one
// mp3 per line). The manifest loads with the boot (a few KB; the lines play
// text-only until it has); a line is voiced only when a recording says its
// exact text (under its key, else `<key>@biome`, the biome's line kept apart
// from a sector's own under the same key) and, with `only`, in that
// speaker's mouth: a stale recording never plays over an edited line. One
// voice at a time: a line fetches and decodes when it is queued, plays as it
// shows (a recording not ready within LATE_START_S of that stays silent),
// and stops on a fade when cut, replaced or dropped.
import { STORY } from '../../data/story.js';
import { fetchAudioFile } from './samplePlayer.js';

const LATE_START_S = 0.3;
const FADE_S = 0.08;

let recordings = {}; // manifest.lines once loaded

/** Fetch the manifest (the boot); never throws. */
export async function loadVoiceManifest(
  fetchFile = (path) => fetchAudioFile('voice', path)
) {
  try {
    recordings = (await (await fetchFile('manifest.json')).json()).lines ?? {};
  } catch (error) {
    console.warn(
      '[Voice] The manifest did not load; lines stay silent.',
      error
    );
  }
}

// The manifest id of `entry`'s recording, or null.
function recordingId({ key, text, speaker } = {}) {
  for (const id of [key, `${key}@biome`]) {
    const line = recordings[id];
    if (
      line &&
      line.text === text &&
      (!line.only || STORY.speaker[line.only] === speaker)
    ) {
      return id;
    }
  }
  return null;
}

/** The recording ({ file, seconds, … }) of `entry` ({ key, text, speaker }), or null. */
export function voiceFor(entry) {
  const id = recordingId(entry);
  return id ? recordings[id] : null;
}

/**
 * `getContext()`/`getDestination()` the live AudioContext and the voice
 * bus; `audible()` false while the voices are off (no duck then);
 * `duck(seconds)` lowers the music under a voice, `unduck()` lets it back up
 * when one stops early. Recordings are cached by their manifest id, never by
 * a line's key (a sector's chapter line and its biome's share one), and kept
 * only while a queued line or the coming set (`expect`) wants them.
 */
export function createVoicePlayer({
  getContext,
  getDestination,
  audible = () => true,
  duck = () => {},
  unduck = () => {},
  fetchFile = (path) => fetchAudioFile('voice', path),
}) {
  const loads = new Map(); // id → Promise<AudioBuffer | null>
  const ready = new Map(); // id → AudioBuffer
  const queued = new Map(); // id → how many queued lines say it
  let coming = new Set(); // ids readied for lines about to be queued
  let playing = null; // { id, source, gain }
  let waiting = null; // { id, until } a shown line whose file is not ready

  // Fetch and decode recording `id`; a failed load is tried again next time.
  function load(id) {
    const context = getContext();
    if (!id || !context || loads.has(id)) return;
    const load = fetchFile(recordings[id].file)
      .then((response) => response.arrayBuffer())
      .then((bytes) => context.decodeAudioData(bytes))
      .then((buffer) => {
        if (loads.get(id) === load) ready.set(id, buffer);
        return buffer;
      })
      .catch((error) => {
        if (loads.get(id) === load) loads.delete(id);
        console.warn(`[Voice] "${id}" did not load; it stays silent.`, error);
        return null;
      });
    loads.set(id, load);
  }

  // Lets go of `id`'s buffer unless a queued line or the coming set wants it.
  function drop(id) {
    if (queued.has(id) || coming.has(id)) return;
    loads.delete(id);
    ready.delete(id);
  }

  /** `entry` is queued: its recording loads and is kept until it is done. */
  function queue(entry) {
    const id = recordingId(entry);
    if (!id) return;
    queued.set(id, (queued.get(id) ?? 0) + 1);
    coming.delete(id);
    load(id);
  }

  /**
   * Lines about to be queued (a journey offered) load ahead; they replace
   * the previous set, whose lines not queued since are let go (`[]` lets
   * them all go).
   */
  function expect(entries = []) {
    const before = coming;
    coming = new Set(entries.map(recordingId).filter(Boolean));
    before.forEach(drop);
    coming.forEach(load);
  }

  function start(id, buffer) {
    const context = getContext();
    const destination = getDestination();
    if (!context || !destination) return;
    const gain = context.createGain();
    gain.connect(destination);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.onended = () => {
      if (playing?.source === source) playing = null;
    };
    source.start();
    playing = { id, source, gain };
    if (audible()) duck(buffer.duration);
  }

  /**
   * `entry` shows: its recording plays (the one before stops). True when it
   * has one (even if it ends up silent: not ready in time, or no longer
   * queued, a line left over from a run that ended), else false.
   */
  function play(entry) {
    stop();
    const context = getContext();
    const id = recordingId(entry);
    if (!id) return false;
    if (!context || !queued.has(id)) return true;
    load(id);
    if (ready.has(id)) {
      start(id, ready.get(id));
      return true;
    }
    const ask = { id, until: context.currentTime + LATE_START_S };
    waiting = ask;
    loads.get(id)?.then((buffer) => {
      if (waiting !== ask) return;
      waiting = null;
      if (buffer && context.currentTime <= ask.until) start(id, buffer);
    });
    return true;
  }

  /** Fades out the voice (only `entry`'s, when given). */
  function stop(entry = null) {
    const id = entry && recordingId(entry);
    if (entry && !id) return;
    if (!entry || waiting?.id === id) waiting = null;
    if (!playing || (entry && playing.id !== id)) return;
    const { source, gain } = playing;
    playing = null;
    const now = getContext().currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + FADE_S);
    source.stop(now + FADE_S);
    unduck();
  }

  /** `entry` is done for good (shown, or dropped): its voice stops and its buffer goes. */
  function release(entry) {
    stop(entry);
    const id = recordingId(entry);
    if (!id) return;
    const left = (queued.get(id) ?? 0) - 1;
    if (left > 0) queued.set(id, left);
    else queued.delete(id);
    drop(id);
  }

  /**
   * A run is left: the voice fades and every queued line is let go (the
   * coming set stays, for the run it readies).
   */
  function clear() {
    stop();
    queued.clear();
    [...loads.keys()].forEach(drop);
  }

  return Object.freeze({ queue, expect, play, stop, release, clear });
}
