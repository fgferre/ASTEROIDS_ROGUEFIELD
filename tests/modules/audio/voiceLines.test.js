import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import manifest from '../../../src/public/audio/voice/manifest.json' with { type: 'json' };
import { STORY } from '../../../src/data/story.js';
import { SECTORS } from '../../../src/data/sectors.js';
import { TRAVEL } from '../../../src/core/cinematics.js';
import {
  createVoicePlayer,
  loadVoiceManifest,
  voiceFor,
} from '../../../src/modules/audio/voiceLines.js';
import { travelDurationMs } from '../../../src/modules/ui/runCinematics.js';
import {
  TRANSMISSION_CHARS_PER_SECOND,
  TRANSMISSION_HOLD_MS,
  TransmissionQueue,
  VOICE_TAIL_MS,
  bossRushTransmission,
  chapterTransmission,
  deathTransmission,
  endingTransmissions,
  hangarTransmission,
  heraldTransmission,
  holdMsFor,
  sightingTransmission,
  stageTransmission,
  travelTransmissions,
  victoryTransmission,
  wardenTransmission,
} from '../../../src/modules/ui/transmissions.js';
import { createAudioContextStub } from '../../__helpers__/stubs.js';

const VOICE_DIR = new URL('../../../src/public/audio/voice/', import.meta.url)
  .pathname;
const VOICE_BUDGET_BYTES = 6 * 1024 * 1024;

// Every line the game can say, through the same builders it uses.
function everyLine() {
  const lines = [];
  Object.keys(STORY.chapter).forEach((biome) =>
    lines.push(chapterTransmission(biome))
  );
  SECTORS.forEach((sector) => {
    lines.push(chapterTransmission(sector.biome, sector.id));
    lines.push(...travelTransmissions(sector.id));
    for (let layer = sector.layers[0]; layer <= sector.layers[1]; layer += 1) {
      STORY.death.forEach((_, i) =>
        lines.push(deathTransmission({ int: () => i }, layer, sector))
      );
    }
  });
  Object.entries(STORY.boss).forEach(([kind, said]) =>
    Object.keys(said).forEach((moment) =>
      lines.push(wardenTransmission(0, moment, kind))
    )
  );
  Object.entries(STORY.herald).forEach(([kind, said]) =>
    Object.keys(said).forEach((moment) =>
      lines.push(heraldTransmission(kind, moment))
    )
  );
  Object.keys(STORY.sighting).forEach((type) =>
    lines.push(sightingTransmission(type))
  );
  Object.keys(STORY.hangar).forEach((id) => lines.push(hangarTransmission(id)));
  Object.entries(STORY.stage).forEach(([sector, stages]) =>
    Object.keys(stages).forEach((stage) =>
      lines.push(stageTransmission(sector, Number(stage)))
    )
  );
  Object.keys(STORY.ending).forEach((ending) =>
    lines.push(...endingTransmissions(ending))
  );
  lines.push(bossRushTransmission(), victoryTransmission());
  return lines.filter(Boolean);
}

function folderBytes(dir) {
  return readdirSync(dir).reduce((sum, name) => {
    const path = join(dir, name);
    const stat = statSync(path);
    return sum + (stat.isDirectory() ? folderBytes(path) : stat.size);
  }, 0);
}

beforeAll(() =>
  loadVoiceManifest(async () => ({ json: async () => manifest }))
);

const typingMs = (text) => (text.length / TRANSMISSION_CHARS_PER_SECOND) * 1000;

describe('recorded lines (src/public/audio/voice)', () => {
  it('every recording says a line the game can say under its key', () => {
    const lines = everyLine();
    const stale = Object.entries(manifest.lines)
      .filter(([, recording]) => !lines.some((l) => voiceFor(l) === recording))
      .map(([id]) => id);
    expect(stale).toEqual([]);
  });

  it('the voice folder stays within its size budget', () => {
    expect(folderBytes(VOICE_DIR)).toBeLessThanOrEqual(VOICE_BUDGET_BYTES);
  });
});

describe('voiceFor', () => {
  const ring = STORY.speaker.ring;

  it('matches a recording only on its exact text', () => {
    const line = chapterTransmission('outer-ring');
    expect(voiceFor(line)).toBe(manifest.lines['chapter:outer-ring']);
    expect(voiceFor({ ...line, text: `${line.text}!` })).toBeNull();
  });

  it("falls back to the biome's recording under the same key", () => {
    const sector = chapterTransmission('dense-core', 'dense-core');
    const biome = chapterTransmission('dense-core');
    expect(sector.key).toBe(biome.key);
    expect(voiceFor(sector)).toBe(manifest.lines['chapter:dense-core']);
    expect(voiceFor(biome)).toBe(manifest.lines['chapter:dense-core@biome']);
  });

  it("keeps a speaker-only recording to that speaker's mouth", () => {
    const text = STORY.death[0];
    expect(voiceFor({ key: 'death:0', speaker: ring, text })).toBeTruthy();
    expect(
      voiceFor({ key: 'death:0', speaker: STORY.speaker.prime, text })
    ).toBeNull();
  });
});

describe('a recorded line holds through its voice', () => {
  const line = chapterTransmission('outer-ring');
  const voiced = () => voiceFor(line).seconds * 1000 + VOICE_TAIL_MS;

  it('holds at least its voice plus the tail, whatever the typing', () => {
    [0, typingMs(line.text)].forEach((typed) =>
      expect(typed + holdMsFor(line, typed)).toBeGreaterThanOrEqual(voiced())
    );
  });

  it('a line without a recording keeps its hold', () => {
    // every speaker is recorded now: a line whose words were edited has none
    const plain = {
      ...wardenTransmission(0, 'warning', 'prime'),
      text: 'An edited line.',
    };
    expect(voiceFor(plain)).toBeNull();
    expect(holdMsFor(plain, 0)).toBe(TRANSMISSION_HOLD_MS);
    expect(holdMsFor({ ...plain, holdMs: 1234 }, 0)).toBe(1234);
  });

  it('the queue keeps it on screen until then (reduced motion too)', () => {
    const hud = {
      isBannerBusy: () => false,
      showTransmission() {},
      typeTransmission() {},
      hideTransmission: vi.fn(),
    };
    const queue = new TransmissionQueue(hud, () => {});
    queue.push({ ...line, holdMs: 100 });
    queue.update(0, true);
    queue.update(voiced() - 1, true);
    expect(hud.hideTransmission).not.toHaveBeenCalled();
    queue.update(voiced(), true);
    expect(hud.hideTransmission).toHaveBeenCalledTimes(1);
  });
});

describe('the journey fits its spoken lines', () => {
  it('lasts its lines one after the other, never shorter than before', () => {
    SECTORS.forEach(({ id }) => {
      const lines = travelTransmissions(id, TRAVEL.lineHoldMs);
      const spoken = lines.reduce((sum, line) => {
        const typed = typingMs(line.text);
        const voice = voiceFor(line);
        const onScreen = typed + holdMsFor(line, typed);
        if (voice) {
          expect(onScreen).toBeGreaterThanOrEqual(
            voice.seconds * 1000 + VOICE_TAIL_MS
          );
        }
        return sum + onScreen;
      }, 0);
      const before = Math.min(
        TRAVEL.maxMs,
        Math.max(
          TRAVEL.minMs,
          lines.reduce(
            (sum, line) => sum + typingMs(line.text) + TRAVEL.lineHoldMs,
            TRAVEL.leadMs
          )
        )
      );
      const duration = travelDurationMs(lines);
      expect(duration).toBeGreaterThanOrEqual(spoken);
      expect(duration).toBeGreaterThanOrEqual(before);
    });
  });
});

describe('createVoicePlayer', () => {
  const line = chapterTransmission('outer-ring');
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  // A player whose decoded buffers name the file they came from.
  function makePlayer({ audible = () => true, fail = () => false } = {}) {
    const context = createAudioContextStub();
    context.decodeAudioData = vi.fn(async (file) => ({ file, duration: 2 }));
    const sources = [];
    context.createBufferSource = vi.fn(() => {
      const source = { connect() {}, start: vi.fn(), stop: vi.fn() };
      sources.push(source);
      return source;
    });
    const fetched = [];
    const duck = vi.fn();
    const unduck = vi.fn();
    const player = createVoicePlayer({
      getContext: () => context,
      getDestination: () => ({}),
      audible,
      duck,
      unduck,
      fetchFile: async (file) => {
        fetched.push(file);
        if (fail(file)) throw new Error('offline');
        return { arrayBuffer: async () => file };
      },
    });
    return { player, sources, fetched, duck, unduck };
  }

  async function readyPlayer(options) {
    const made = makePlayer(options);
    made.player.queue(line);
    await settle();
    return made;
  }

  it('plays a queued line and ducks the music', async () => {
    const { player, sources, duck } = await readyPlayer();
    expect(player.play(line)).toBe(true);
    expect(sources).toHaveLength(1);
    expect(sources[0].start).toHaveBeenCalled();
    expect(duck).toHaveBeenCalled();
  });

  it('a cleared line stops its voice and lets the music back up', async () => {
    const { player, sources, unduck } = await readyPlayer();
    player.play(line);
    player.release(line);
    expect(sources[0].stop).toHaveBeenCalled();
    expect(unduck).toHaveBeenCalled();
  });

  it("another line's end leaves the voice playing", async () => {
    const { player, sources } = await readyPlayer();
    player.play(line);
    player.stop(chapterTransmission('dense-core'));
    expect(sources[0].stop).not.toHaveBeenCalled();
  });

  it('says nothing for a line without a recording', async () => {
    const { player, sources } = await readyPlayer();
    const edited = {
      ...wardenTransmission(0, 'warning', 'prime'),
      text: 'An edited line.',
    };
    expect(player.play(edited)).toBe(false);
    expect(sources).toHaveLength(0);
  });

  it("a line under a shared key plays its own recording, never the other's", async () => {
    const sector = chapterTransmission('dense-core', 'dense-core');
    const biome = chapterTransmission('dense-core');
    const { player, sources } = makePlayer();
    // The map readies the sector's line; Descent then says the biome's.
    player.expect([sector]);
    player.queue(biome);
    await settle();
    player.play(biome);
    expect(sources[0].buffer.file).toBe(
      manifest.lines['chapter:dense-core@biome'].file
    );
    player.queue(sector);
    await settle();
    player.play(sector);
    expect(sources[1].buffer.file).toBe(
      manifest.lines['chapter:dense-core'].file
    );
  });

  it('lets go of what it readied once nothing wants it, and retries a failed load', async () => {
    // As the map offers it: the journey's lines, then the sector's chapter.
    const journey = [
      ...travelTransmissions('dense-core'),
      chapterTransmission('dense-core', 'dense-core'),
    ];
    const offline = { file: voiceFor(journey[0]).file };
    const { player, fetched } = makePlayer({
      fail: (file) => file === offline.file,
    });
    const fetches = (entry) =>
      fetched.filter((file) => file === voiceFor(entry).file).length;
    player.expect(journey);
    await settle();
    // A failed line is fetched again when asked for again.
    offline.file = null;
    player.queue(journey[0]);
    expect(fetches(journey[0])).toBe(2);
    // Asked again while kept: no new fetch.
    player.queue(journey[1]);
    expect(fetches(journey[1])).toBe(1);
    await settle();
    // Another offer replaces this one: its lines not queued go.
    player.expect([line]);
    player.queue(journey[2]);
    expect(fetches(journey[2])).toBe(2);
    // A queued line dropped unshown goes too (journey[1] was queued once).
    player.release(journey[1]);
    player.queue(journey[1]);
    expect(fetches(journey[1])).toBe(2);
  });

  it('with the voices off a line ducks nothing (its source still plays)', async () => {
    const { player, sources, duck } = await readyPlayer({
      audible: () => false,
    });
    expect(player.play(line)).toBe(true);
    expect(sources).toHaveLength(1);
    expect(duck).not.toHaveBeenCalled();
  });

  it('leaving a run fades the voice, and a line left over from it stays silent', async () => {
    const { player, sources } = await readyPlayer();
    player.play(line);
    player.clear();
    expect(sources[0].stop).toHaveBeenCalled();
    expect(player.play(line)).toBe(true);
    expect(sources).toHaveLength(1);
  });
});
