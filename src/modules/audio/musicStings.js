// The recorded one-shots of the run (MUSIC_STINGS, data/audio/sectorScores.js):
// the elite chord, the surge and the deep-field entry. Played on the music
// path (the music slider, Mute All and the voices' duck apply), in any run.
// Each file is fetched and decoded on its first use (or `prefetch`).
import { MUSIC_STINGS } from '../../data/audio/sectorScores.js';

async function fetchAndDecode(context, url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return context.decodeAudioData(await response.arrayBuffer());
}

export function createMusicStings({
  getContext,
  getDestination,
  load = fetchAndDecode,
}) {
  const buffers = new Map(); // name -> Promise<AudioBuffer | null>

  function buffer(name) {
    const context = getContext();
    if (!MUSIC_STINGS[name] || !context) return null;
    if (!buffers.has(name)) {
      buffers.set(
        name,
        load(context, MUSIC_STINGS[name]).catch((error) => {
          buffers.delete(name);
          console.warn('[musicStings] could not load the sting:', error);
          return null;
        })
      );
    }
    return buffers.get(name);
  }

  /** Every sting is fetched ahead, so the first one need not wait. */
  function prefetch() {
    Object.keys(MUSIC_STINGS).forEach(buffer);
  }

  function play(name) {
    const context = getContext();
    const pending = buffer(name);
    if (!pending || context.state !== 'running') return;
    pending.then((decoded) => {
      const destination = getDestination();
      if (!decoded || !destination) return;
      const source = context.createBufferSource();
      source.buffer = decoded;
      source.connect(destination);
      source.onended = () => source.disconnect();
      source.start();
    });
  }

  return { play, prefetch };
}
