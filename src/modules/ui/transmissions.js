// src/modules/ui/transmissions.js

import { STORY } from '../../data/story.js';
import { biomeForLayer } from '../../data/biomes.js';
import { BOSS_KINDS, bossKindForLayer } from '../../data/enemies/boss.js';
import { RUN_FINAL_LAYER } from '../../data/constants/gameplay.js';
import {
  BOSS_RUSH_LAYERS,
  bossRushDirectorFor,
  directorFor,
  enemiesFor,
} from '../../data/layers.js';
import { localLayer, sectorById, sectorStage } from '../../data/sectors.js';
import { voiceFor } from '../audio/voiceLines.js';

/** How long a line stays on screen once it is fully typed. */
export const TRANSMISSION_HOLD_MS = 3500;
export const TRANSMISSION_CHARS_PER_SECOND = 40;
// A recorded line stays up this long after its voice ends.
export const VOICE_TAIL_MS = 400;

/**
 * How long `entry` holds once typed (in `typingMs`): its own hold, or, with
 * a recording (audio/voiceLines.js), long enough to stay up through it.
 */
export function holdMsFor(entry, typingMs) {
  const hold = entry.holdMs ?? TRANSMISSION_HOLD_MS;
  const voice = voiceFor(entry);
  if (!voice) return hold;
  return Math.max(hold, voice.seconds * 1000 + VOICE_TAIL_MS - typingMs);
}

/** The Ring names the place: the sector's own line, else its biome's. */
export function chapterTransmission(biomeId, sectorId = null) {
  const own = STORY.sector[sectorId];
  return {
    key: `chapter:${own ? sectorId : biomeId}`,
    speaker: STORY.speaker.ring,
    text: own ?? STORY.chapter[biomeId],
  };
}

/**
 * A boss's own line (STORY.boss) for `moment`: 'warning', 'last' or
 * 'defeated'. The boss is `bossKind` (a sector's Sentinel, or the boss itself)
 * or, without one, the layer's Warden. Null when it has no line.
 */
export function wardenTransmission(layer, moment, bossKind = null) {
  const kind = bossKind ?? bossKindForLayer(layer);
  const text = STORY.boss[kind]?.[moment];
  if (!text) {
    return null;
  }
  return { key: `boss:${kind}:${moment}`, speaker: STORY.speaker[kind], text };
}

/** `moment` is 'spawned' or 'defeated'; null for an unknown kind. */
export function heraldTransmission(kind, moment) {
  const text = STORY.herald[kind]?.[moment];
  if (!text) {
    return null;
  }
  return {
    key: `herald:${kind}:${moment}`,
    speaker: STORY.speaker[kind],
    text,
  };
}

/** The Ring names a machine seen for the first time; null without a line. */
export function sightingTransmission(type) {
  const text = STORY.sighting[type];
  if (!text) {
    return null;
  }
  return { key: `sighting:${type}`, speaker: STORY.speaker.ring, text };
}

/** Warden Prime opens a Boss Rush. */
export function bossRushTransmission() {
  return {
    key: 'boss-rush',
    speaker: STORY.speaker.prime,
    text: STORY.bossRush,
  };
}

/** The Ring logs a Hangar purchase; null for an item without a line. */
export function hangarTransmission(itemId) {
  const text = STORY.hangar[itemId];
  if (!text) {
    return null;
  }
  return { key: `hangar:${itemId}`, speaker: STORY.speaker.ring, text };
}

/**
 * A death line picked with the seeded `random`, spoken by the biome's Warden;
 * by the Ring in a `sector`'s own place past the Wardens (the Crucible).
 */
export function deathTransmission(random, layer, sector = null) {
  const index = random.int(0, STORY.death.length - 1);
  const biome = biomeForLayer(layer, sector);
  return {
    key: `death:${index}`,
    speaker: biome.sectorOnly
      ? STORY.speaker.ring
      : STORY.speaker[bossKindForLayer(biome.layers[1])],
    text: STORY.death[index],
  };
}

// Lines spoken in order ({ speaker key, text }), keyed `${key}:${index}`.
const spokenInOrder = (lines, key, holdMs) =>
  lines.map(({ speaker, text }, i) => ({
    key: `${key}:${i}`,
    speaker: STORY.speaker[speaker],
    text,
    ...(holdMs && { holdMs }),
  }));

/**
 * The journey's lines to sector `to`, in order (none for a sector without
 * one). `holdMs`, when given, replaces each line's hold once typed.
 */
export function travelTransmissions(to, holdMs) {
  return spokenInOrder(STORY.travel[to] ?? [], `travel:${to}`, holdMs);
}

/** An ending's two lines (STORY.ending), in order; `holdMs` as above. */
export function endingTransmissions(ending, holdMs) {
  return spokenInOrder(STORY.ending[ending].lines, `ending:${ending}`, holdMs);
}

/** The line a sector's `stage` (1-based) opens with, or null. */
export function stageTransmission(sectorId, stage) {
  const line = STORY.stage[sectorId]?.[stage];
  if (!line) return null;
  return {
    key: `stage:${sectorId}:${stage}`,
    speaker: STORY.speaker[line.speaker],
    text: line.text,
  };
}

/**
 * What is said as a run is won: the boss's own last words (null when it has
 * none), then, after Warden Null's, the Ring's. `bossKind` is the sector's
 * Sentinel, if it ends on one: the Sentinels of Null's chapter die on the
 * same layer number and do not wake the Ring.
 */
export function winTransmissions(layer, bossKind = null) {
  const last = wardenTransmission(layer, 'defeated', bossKind);
  return layer === RUN_FINAL_LAYER && !bossKind
    ? [last, victoryTransmission()]
    : [last];
}

export function victoryTransmission() {
  return { key: 'victory', speaker: STORY.speaker.ring, text: STORY.victory };
}

// What `layer` can say in a run (`sector`, `bossRush`), as the UI says it:
// its chapter and stage lines (handleLayerStarted), its boss's, its Herald's,
// the sightings of the machines it can field (cast as LayerSchedule casts
// them, its boss's escorts too) and the death lines in its Warden's mouth.
function layerLines(layer, sector, bossRush) {
  const director = bossRush
    ? bossRushDirectorFor(layer)
    : sectorStage(sector, layer) ?? directorFor(layer);
  const biome = biomeForLayer(layer, sector);
  const kind = director.bossKind ?? bossKindForLayer(layer);
  const roles = [
    ...director.roster.map(({ role }) => role),
    ...director.surges.flatMap(({ roles }) => roles),
    ...director.formations.map(({ role }) => role),
  ];
  const types = roles.flatMap((role) =>
    enemiesFor(role, director.castLayer ?? layer).map(({ id }) => id)
  );
  if (director.warden) types.push(...(BOSS_KINDS[kind]?.minionTypes ?? []));
  const { herald, warden } = director;
  return [
    biome.layers[0] === layer && chapterTransmission(biome.id, sector?.id),
    sector && stageTransmission(sector.id, localLayer(sector, layer)),
    bossRush && layer === BOSS_RUSH_LAYERS[0] && bossRushTransmission(),
    warden && wardenTransmission(layer, 'warning', kind),
    warden && wardenTransmission(layer, 'last', kind),
    ...(warden ? winTransmissions(layer, director.bossKind) : []),
    herald && heraldTransmission(herald, 'spawned'),
    herald && heraldTransmission(herald, 'defeated'),
    ...types.map(sightingTransmission),
    ...STORY.death.map((_, i) =>
      deathTransmission({ int: () => i }, layer, sector)
    ),
  ];
}

/**
 * Every line run `start` (game-started's { sector, bossRush }) can say in
 * its fight, once each: a sector run's or Boss Rush's on all its layers; a
 * Descent's from `layer` to the end of its chapter and one layer on (asked
 * again as each layer starts). The journey and the ending are not in it.
 */
export function runVoiceLines({ sector: id, bossRush } = {}, layer = 1) {
  const sector = sectorById(id);
  const rush = Boolean(bossRush) && !sector;
  const [first, last] = sector
    ? sector.layers
    : [layer, Math.max(layer, biomeForLayer(layer).layers[1]) + 1];
  const layers = rush
    ? BOSS_RUSH_LAYERS
    : Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const lines = new Map();
  layers
    .flatMap((n) => layerLines(n, sector, rush))
    .filter(Boolean)
    .forEach((line) => lines.set(`${line.key}|${line.speaker}`, line));
  return [...lines.values()];
}

/**
 * One transmission at a time. A line waits while the HUD banner or boss intro
 * is up; a banner that opens mid-line cuts it, and it replays afterwards.
 * `view` is the HUD (isBannerBusy, showTransmission, typeTransmission,
 * hideTransmission); `onShown(entry, onScreenMs)` fires each time a line
 * starts, with how long it will stay up (typed and held),
 * `onFinished(entry)` once it is done for good: held to the end, or dropped;
 * `onCut(entry)` when a banner cuts it (it plays again afterwards);
 * `onDropped(entry)` for each line still waiting when the queue clears.
 */
export class TransmissionQueue {
  constructor(
    view,
    onShown,
    onFinished = () => {},
    onCut = () => {},
    onDropped = () => {}
  ) {
    this.view = view;
    this.onShown = onShown;
    this.onFinished = onFinished;
    this.onCut = onCut;
    this.onDropped = onDropped;
    this.pending = [];
    this.current = null;
    // A line a banner cut: still on air for whoever waits on it.
    this.cut = null;
  }

  get active() {
    return Boolean(this.current || this.pending.length);
  }

  push(entry) {
    if (entry) {
      this.pending.push(entry);
    }
  }

  /** Drops what is queued or playing and plays `entry` next. */
  interrupt(entry) {
    this.clear();
    this.push(entry);
  }

  clear() {
    const { current } = this;
    const onAir = current?.entry ?? this.cut;
    const dropped = this.pending.filter((entry) => entry !== onAir);
    this.pending = [];
    this.current = null;
    this.cut = null;
    if (current) {
      this.view.hideTransmission();
    }
    if (onAir) {
      this.onFinished(onAir);
    }
    dropped.forEach((entry) => this.onDropped(entry));
  }

  update(nowMs, reducedMotion = false) {
    if (this.current && this.view.isBannerBusy()) {
      this.view.hideTransmission();
      this.pending.unshift(this.current.entry);
      this.cut = this.current.entry;
      this.current = null;
      this.onCut(this.cut);
    }
    const typingMsOf = ({ text }) =>
      reducedMotion ? 0 : (text.length / TRANSMISSION_CHARS_PER_SECOND) * 1000;
    if (!this.current) {
      if (!this.pending.length || this.view.isBannerBusy()) {
        return;
      }
      const entry = this.pending.shift();
      this.cut = null;
      this.current = { entry, startedAt: nowMs, typed: -1 };
      this.view.showTransmission(entry.speaker);
      const typingMs = typingMsOf(entry);
      this.onShown(entry, typingMs + holdMsFor(entry, typingMs));
    }

    const { entry, startedAt } = this.current;
    const length = entry.text.length;
    const elapsed = nowMs - startedAt;
    const typingMs = typingMsOf(entry);
    const typed = reducedMotion
      ? length
      : Math.min(
          length,
          Math.floor((elapsed * TRANSMISSION_CHARS_PER_SECOND) / 1000)
        );
    if (typed !== this.current.typed) {
      this.current.typed = typed;
      this.view.typeTransmission(entry.text.slice(0, typed), typed >= length);
    }
    if (elapsed >= typingMs + holdMsFor(entry, typingMs)) {
      this.view.hideTransmission();
      this.current = null;
      this.onFinished(entry);
    }
  }
}
