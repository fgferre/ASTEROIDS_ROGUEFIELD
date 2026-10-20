// The sample layer (SOUND.md): the chosen SFX files load at boot (fetched
// beside the music warm-up, decoded once the AudioContext exists) and play in
// place of a cue's synthesis, varied in pick, pitch and gain, on the bus, pan
// and distance mix the synthesis would get, within a voice budget. A cue
// whose sample is not loaded (no files in the manifest, still loading, failed)
// plays its synthesis, as before. Data: src/data/audio/samples.js.
import {
  SAMPLE_CUES,
  SAMPLE_PLAYBACK,
  SAMPLE_PRIORITY,
} from '../../data/audio/samples.js';
import { dbToGain } from './MusicThemes.js';

/** A public file under audio/sfx/, through the Vite base; throws when not OK. */
async function fetchSampleFile(path) {
  const response = await fetch(`${import.meta.env.BASE_URL}audio/sfx/${path}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for audio/sfx/${path}`);
  }
  return response;
}

/** The sampleId a cue call plays (SAMPLE_CUES); null when it plays none. */
export function sampleIdFor(cue, args = []) {
  const sample = SAMPLE_CUES[cue]?.sample;
  if (typeof sample === 'string') return sample;
  return sample?.[args[0]] ?? null;
}

/**
 * Point `target`'s SAMPLE_CUES methods (the bus's, or with `facade` the
 * facade's own) at the sample layer first: a loaded sample plays instead of
 * the synthesis. The one interception point.
 */
export function interceptSampleCues(target, samples, { facade = false } = {}) {
  Object.entries(SAMPLE_CUES).forEach(([cue, entry]) => {
    if (Boolean(entry.facade) !== facade) return;
    const synthesize = target[cue].bind(target);
    target[cue] = (...args) =>
      samples.play(cue, args) ? undefined : synthesize(...args);
  });
}

/**
 * @param {import('./SFXBus.js').SfxKit} sfx - the bus toolkit (live context,
 *   routing, reverb send, seeded scopes, resume gate); never the bus itself.
 */
export function createSamplePlayer(sfx) {
  const ready = new Map(); // sampleId → { entry, buffers }
  let fetched = null; // [sampleId, entry, ArrayBuffer[]] waiting for a context
  let voices = []; // live voices, oldest first
  const lastStart = new Map(); // sampleId → context time of its last start
  const lastPick = new Map(); // sampleId → index of its last variation

  async function fetchSample(fetchFile, id, entry) {
    try {
      const files = await Promise.all(
        entry.files.map(async (path) => (await fetchFile(path)).arrayBuffer())
      );
      return [id, entry, files];
    } catch (error) {
      console.warn(
        `[SFX samples] "${id}" did not load; it stays synthesized.`,
        error
      );
      return null;
    }
  }

  /** Decode what was fetched, once the AudioContext exists (no-op before). */
  async function decode() {
    const context = sfx.context;
    if (!fetched || !context) return;
    const pending = fetched;
    fetched = null;
    await Promise.all(
      pending.map(async ([id, entry, files]) => {
        try {
          const buffers = await Promise.all(
            files.map((file) => context.decodeAudioData(file))
          );
          if (buffers.length) ready.set(id, { entry, buffers });
        } catch (error) {
          console.warn(
            `[SFX samples] "${id}" did not decode; it stays synthesized.`,
            error
          );
        }
      })
    );
  }

  /** Fetch the manifest and every file (the boot warm-up); never throws. */
  async function load(fetchFile = fetchSampleFile) {
    try {
      const manifest = await (await fetchFile('manifest.json')).json();
      const loaded = await Promise.all(
        Object.entries(manifest).map(([id, entry]) =>
          fetchSample(fetchFile, id, entry)
        )
      );
      fetched = loaded.filter(Boolean);
    } catch (error) {
      console.warn(
        '[SFX samples] The manifest did not load; every cue stays synthesized.',
        error
      );
      return;
    }
    await decode();
  }

  /** A variation index, never the one this sample played last. */
  function pickVariation(id, count, rng) {
    const last = lastPick.get(id);
    const skip = count > 1 && last !== undefined;
    let index = rng.int(0, count - (skip ? 2 : 1));
    if (skip && index >= last) index += 1;
    lastPick.set(id, index);
    return index;
  }

  function stopVoice(voice, now) {
    voices.splice(voices.indexOf(voice), 1);
    const end = now + SAMPLE_PLAYBACK.stealFadeSeconds;
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, end);
    voice.source.stop(end);
  }

  /**
   * Make room for a voice of `id` at `priority`: false when it is dropped.
   * Inside the sample's gap → dropped; at its cap → its own oldest voice
   * stops; all voices busy → the oldest of the lowest priority below it
   * stops, none lower → dropped.
   */
  function makeRoom(id, entry, priority, now) {
    voices = voices.filter((voice) => voice.endsAt > now);
    if ((now - (lastStart.get(id) ?? -Infinity)) * 1000 < (entry.gap ?? 0)) {
      return false;
    }
    const own = voices.filter((voice) => voice.id === id);
    if (own.length && own.length >= entry.cap) {
      stopVoice(own[0], now);
      return true;
    }
    if (voices.length < SAMPLE_PLAYBACK.maxVoices) return true;
    const victim = voices.reduce(
      (lowest, voice) =>
        voice.priority < (lowest?.priority ?? priority) ? voice : lowest,
      null
    );
    if (!victim) return false;
    stopVoice(victim, now);
    return true;
  }

  /** Route `node` like the cue's synthesis: its bus, pan and distance mix. */
  function connectVoice(node, { bus, spatialArg }, args) {
    const spatial = (spatialArg === undefined ? null : args[spatialArg]) || {};
    const pan = Number(spatial.pan) || 0;
    if (bus === 'protected') {
      if (pan) node.connect(sfx.protectedPanner(pan));
      else sfx.connectProtected(node);
      return true;
    }
    const destination = sfx.ambientInput(pan, spatial.distance || null);
    if (!destination) return false;
    node.connect(destination);
    return true;
  }

  function startVoice(cue, id, { entry, buffers }, args) {
    const context = sfx.context;
    const now = context.currentTime;
    const priority = entry.priority ?? SAMPLE_PRIORITY.interface;
    if (!makeRoom(id, entry, priority, now)) return;

    // Variation from the audio's seeded scopes (reseeded per run): the
    // impact family, which no synthesis draws from.
    const rng = sfx.resolveRandom(sfx.randomScopes?.families?.impact);
    const buffer = buffers[pickVariation(id, buffers.length, rng)];
    const { pitchSpread, gainSpreadDb } = SAMPLE_PLAYBACK;
    const rate = 1 + rng.range(-pitchSpread, pitchSpread);
    const gain = context.createGain();
    gain.gain.value = dbToGain(
      (entry.gain ?? 0) + rng.range(-gainSpreadDb, gainSpreadDb)
    );
    if (!connectVoice(gain, SAMPLE_CUES[cue], args)) return;
    if (entry.reverb !== null && entry.reverb !== undefined) {
      sfx.sendToReverb(gain, entry.reverb);
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(gain);
    source.start(now);
    lastStart.set(id, now);
    voices.push({
      id,
      priority,
      source,
      gain,
      endsAt: now + buffer.duration / rate,
    });
  }

  /**
   * Play `cue`'s sample when it is loaded: true (it played, or the voice rules
   * dropped it), else false and the cue synthesizes.
   */
  function play(cue, args = []) {
    const id = sampleIdFor(cue, args);
    const sample = id && ready.get(id);
    if (!sample) return false;
    sfx.trackPerformance(cue);
    sfx.safePlay(() => startVoice(cue, id, sample, args));
    return true;
  }

  return Object.freeze({
    load,
    decode,
    play,
  });
}
