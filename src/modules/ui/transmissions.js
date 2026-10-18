// src/modules/ui/transmissions.js

import { STORY } from '../../data/story.js';
import { biomeForLayer } from '../../data/biomes.js';

/** How long a line stays on screen once it is fully typed. */
export const TRANSMISSION_HOLD_MS = 3500;
export const TRANSMISSION_CHARS_PER_SECOND = 40;

export function chapterTransmission(biomeId) {
  return {
    key: `chapter:${biomeId}`,
    speaker: STORY.speaker.ring,
    text: STORY.chapter[biomeId],
  };
}

/** `moment` is 'warning' or 'defeated'; null when the layer has no line. */
export function wardenTransmission(layer, moment) {
  const text = STORY.warden[layer]?.[moment];
  if (!text) {
    return null;
  }
  return {
    key: `warden:${layer}:${moment}`,
    speaker: STORY.speaker[layer],
    text,
  };
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
  return { key: 'boss-rush', speaker: STORY.speaker[5], text: STORY.bossRush };
}

/** The Ring logs a Hangar purchase; null for an item without a line. */
export function hangarTransmission(itemId) {
  const text = STORY.hangar[itemId];
  if (!text) {
    return null;
  }
  return { key: `hangar:${itemId}`, speaker: STORY.speaker.ring, text };
}

/** A death line picked with the seeded `random`, spoken by the biome's Warden. */
export function deathTransmission(random, layer) {
  const index = random.int(0, STORY.death.length - 1);
  return {
    key: `death:${index}`,
    speaker: STORY.speaker[biomeForLayer(layer).layers[1]],
    text: STORY.death[index],
  };
}

export function victoryTransmission() {
  return { key: 'victory', speaker: STORY.speaker.ring, text: STORY.victory };
}

/**
 * One transmission at a time. A line waits while the HUD banner or boss intro
 * is up; a banner that opens mid-line cuts it, and it replays afterwards.
 * `view` is the HUD (isBannerBusy, showTransmission, typeTransmission,
 * hideTransmission); `onShown(entry)` fires each time a line starts,
 * `onFinished(entry)` once it is done for good: held to the end, or dropped.
 */
export class TransmissionQueue {
  constructor(view, onShown, onFinished = () => {}) {
    this.view = view;
    this.onShown = onShown;
    this.onFinished = onFinished;
    this.pending = [];
    this.current = null;
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
    this.pending = [];
    this.current = null;
    if (current) {
      this.view.hideTransmission();
      this.onFinished(current.entry);
    }
  }

  update(nowMs, reducedMotion = false) {
    if (this.current && this.view.isBannerBusy()) {
      this.view.hideTransmission();
      this.pending.unshift(this.current.entry);
      this.current = null;
    }
    if (!this.current) {
      if (!this.pending.length || this.view.isBannerBusy()) {
        return;
      }
      const entry = this.pending.shift();
      this.current = { entry, startedAt: nowMs, typed: -1 };
      this.view.showTransmission(entry.speaker);
      this.onShown(entry);
    }

    const { entry, startedAt } = this.current;
    const length = entry.text.length;
    const elapsed = nowMs - startedAt;
    const typingMs = reducedMotion
      ? 0
      : (length / TRANSMISSION_CHARS_PER_SECOND) * 1000;
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
    if (elapsed >= typingMs + TRANSMISSION_HOLD_MS) {
      this.view.hideTransmission();
      this.current = null;
      this.onFinished(entry);
    }
  }
}
