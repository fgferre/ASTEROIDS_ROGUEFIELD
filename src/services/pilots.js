// src/services/pilots.js
//
// The three pilots (save slots, core/storage.js) as the pilots screen shows
// them: each one's summary read from its own save, whichever slot is active.

import { SLOT_COUNT, SLOT_KEYS, loadJSON } from '../core/storage.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { SECTORS } from '../data/sectors.js';
import { ACHIEVEMENTS_STORAGE_KEY } from './AchievementService.js';
import { loadHangarSave } from './HangarService.js';
import { loadRecords } from './runRecords.js';

/**
 * `slot`'s pilot, or null when the slot holds nothing (a new pilot):
 * `{ slot, layer, sectorsWon, sectors, medals, medalsTotal, salvage, lastRun }`,
 * `lastRun` the day its last run started ('YYYY-MM-DD') or null.
 */
export function pilotSummary(slot) {
  if (SLOT_KEYS.every((key) => loadJSON(key, slot) === null)) return null;
  const records = loadRecords(slot);
  const unlocked = loadJSON(ACHIEVEMENTS_STORAGE_KEY, slot)?.unlocked ?? {};
  return {
    slot,
    layer: records.bestLayer,
    sectorsWon: records.sectorsWon.length,
    sectors: SECTORS.length,
    medals: ACHIEVEMENTS.filter(({ id }) => unlocked[id]).length,
    medalsTotal: ACHIEVEMENTS.length,
    salvage: loadHangarSave(slot).salvage,
    lastRun: records.lastRun,
  };
}

/** Every slot's summary, slot 1 first. */
export function pilotSummaries() {
  return Array.from({ length: SLOT_COUNT }, (_, i) => pilotSummary(i + 1));
}
