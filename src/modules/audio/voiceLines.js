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

/** The recording ({ file, seconds, … }) of `entry` ({ key, text, speaker }), or null. */
export function voiceFor({ key, text, speaker } = {}) {
  for (const id of [key, `${key}@biome`]) {
    const line = recordings[id];
    if (
      line &&
      line.text === text &&
      (!line.only || STORY.speaker[line.only] === speaker)
    ) {
      return line;
    }
  }
  return null;
}

/**
 * `getContext()`/`getDestination()` the live AudioContext and the voice
 * bus; `duck(seconds)` lowers the music under a voice, `unduck()` lets it
 * back up when one stops early.
 */
export function createVoicePlayer({
  getContext,
  getDestination,
  duck = () => {},
  unduck = () => {},
  fetchFile = (path) => fetchAudioFile('voice', path),
}) {
  const loads = new Map(); // key → Promise<AudioBuffer | null>
  const ready = new Map(); // key → AudioBuffer
  let playing = null; // { key, source, gain }
  let waiting = null; // { key, until } a shown line whose file is not ready

  /** Fetch and decode `entry`'s recording (no-op without one). */
  function prepare(entry) {
    const line = voiceFor(entry);
    const context = getContext();
    if (!line || !context || loads.has(entry.key)) return;
    const { key } = entry;
    const load = fetchFile(line.file)
      .then((response) => response.arrayBuffer())
      .then((bytes) => context.decodeAudioData(bytes))
      .then((buffer) => {
        if (loads.get(key) === load) ready.set(key, buffer);
        return buffer;
      })
      .catch((error) => {
        console.warn(`[Voice] "${key}" did not load; it stays silent.`, error);
        return null;
      });
    loads.set(key, load);
  }

  function start(key, buffer) {
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
    playing = { key, source, gain };
    duck(buffer.duration);
  }

  /**
   * `entry` shows: its recording plays (the one before stops). True when it
   * has one (even if it ends up silent, not ready in time), else false.
   */
  function play(entry) {
    stop();
    const context = getContext();
    if (!context || !voiceFor(entry)) return false;
    const { key } = entry;
    prepare(entry);
    if (ready.has(key)) {
      start(key, ready.get(key));
      return true;
    }
    const ask = { key, until: context.currentTime + LATE_START_S };
    waiting = ask;
    loads.get(key)?.then((buffer) => {
      if (waiting !== ask) return;
      waiting = null;
      if (buffer && context.currentTime <= ask.until) start(key, buffer);
    });
    return true;
  }

  /** Fades out the voice (only `key`'s, when given). */
  function stop(key = null) {
    if (key === null || waiting?.key === key) waiting = null;
    if (!playing || (key !== null && playing.key !== key)) return;
    const { source, gain } = playing;
    playing = null;
    const now = getContext().currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + FADE_S);
    source.stop(now + FADE_S);
    unduck();
  }

  /** `key`'s line is done for good: its voice stops and its buffer goes. */
  function release(key) {
    stop(key);
    loads.delete(key);
    ready.delete(key);
  }

  return Object.freeze({ prepare, play, stop, release });
}
