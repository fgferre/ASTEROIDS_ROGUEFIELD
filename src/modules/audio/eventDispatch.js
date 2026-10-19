// Reads the event → sound table (src/data/audio/eventCues.js; its header
// documents every row field) and registers one AudioSystem listener per event
// that runs the event's rows in order.
import { getContent } from '../../content/registry.js';
import { AUDIO_EVENT_CUES } from '../../data/audio/eventCues.js';
import { resolveStereoPan } from './SFXBus.js';
import { AUDIO_EVENT_HANDLERS, sourceSpatial } from './eventHandlers.js';

const OPTION_FIELDS = ['at', 'panX', 'toPanX', 'fields', 'set'];

/** The payload value at a dotted path; [path, fallback] falls back with ||. */
function read(payload, spec) {
  if (Array.isArray(spec)) {
    return read(payload, spec[0]) || spec[1];
  }
  return spec.split('.').reduce((value, key) => value?.[key], payload);
}

function enemyTypeOf(payload) {
  return String(payload?.enemyType || payload?.enemy?.type || '').toLowerCase();
}

/** A `cueOf` row's cue for the payload's enemy item; undefined for other types. */
function enemyCue(row, payload) {
  const enemy = getContent('enemies', enemyTypeOf(payload));
  return enemy && (enemy.cues?.[row.cueOf] ?? row.cue);
}

function typeMatches(row, type) {
  if (row.type === '*') {
    return Boolean(type) && !(row.except || []).includes(type);
  }
  return row.type === type;
}

function conditionsHold(row, payload) {
  if (typeof row.when === 'string' && !read(payload, row.when)) return false;
  if (
    typeof row.when === 'object' &&
    !Object.entries(row.when).every(
      ([path, value]) => read(payload, path) === value
    )
  ) {
    return false;
  }
  return !(row.unless && read(payload, row.unless));
}

function cueOptions(audio, row, payload) {
  const options = row.payload ? { ...payload } : {};
  if (row.at) {
    const source = row.at === 'payload' ? { position: payload } : payload;
    Object.assign(options, sourceSpatial(audio, source));
  }
  if (row.panX) {
    options.pan = resolveStereoPan(read(payload, row.panX), audio.listenerX);
  }
  if (row.toPanX) {
    options.toPan = resolveStereoPan(
      read(payload, row.toPanX),
      audio.listenerX
    );
  }
  Object.entries(row.fields || {}).forEach(([key, spec]) => {
    options[key] = read(payload, spec);
  });
  return Object.assign(options, row.set);
}

function cueArgs(audio, row, payload) {
  const args = 'first' in row ? [row.first] : [];
  if ('arg' in row) {
    args.push(read(payload, row.arg));
  } else if (OPTION_FIELDS.some((field) => field in row)) {
    args.push(cueOptions(audio, row, payload));
  } else if (row.payload) {
    args.push(payload || {});
  }
  return args;
}

/**
 * One listener per event of the table, through the AudioSystem's
 * registerEventListener (so BaseSystem removes them on destroy).
 */
export function registerAudioEventCues(audio) {
  const rowsByEvent = new Map();
  AUDIO_EVENT_CUES.forEach((row) => {
    if (!rowsByEvent.has(row.on)) rowsByEvent.set(row.on, []);
    rowsByEvent.get(row.on).push(row);
  });
  const lastPlayedAt = new Map();

  rowsByEvent.forEach((eventRows, eventName) => {
    audio.registerEventListener(eventName, (payload) => {
      let typePlayed = false;
      eventRows.forEach((row) => {
        const typed = row.type !== undefined || row.cueOf !== undefined;
        if (typed && typePlayed) return;
        if (row.type !== undefined && !typeMatches(row, enemyTypeOf(payload))) {
          return;
        }
        const cue = row.cueOf ? enemyCue(row, payload) : row.cue;
        if (row.cueOf && !cue) return;
        if (!conditionsHold(row, payload)) return;
        if (row.throttleMs !== undefined) {
          const now = performance.now();
          if (now - (lastPlayedAt.get(row) ?? 0) <= row.throttleMs) return;
          lastPlayedAt.set(row, now);
        }
        if (typed) typePlayed = true;

        if (row.run) {
          AUDIO_EVENT_HANDLERS[row.run](audio, payload, eventName);
          return;
        }
        const target = row.facade ? audio : audio.sfxBus;
        target[cue](...cueArgs(audio, row, payload));
        if (row.duck) {
          audio._duckBigMoment();
        }
      });
    });
  });
}
