// src/services/runRecords.js

import { loadJSON, saveJSON } from '../core/storage.js';
import { BOSS_RUSH_LAYERS } from '../data/layers.js';
import { SECTORS } from '../data/sectors.js';

export const RECORDS_STORAGE_KEY = 'roguefield:records:v1';

/**
 * Best layer reached, longest run (seconds) and runs started, across runs;
 * Boss Rush: the furthest Warden reached (1-3) and the fastest clear
 * (seconds, 0 before the first); sector runs: the ids won (`sectorsWon`) and
 * each one's fastest clear (`sectorTimes`, id → seconds). A sector run never
 * raises `bestLayer` or `bestTime`.
 */
export function loadRecords() {
  const stored = loadJSON(RECORDS_STORAGE_KEY) ?? {};
  return {
    bestLayer: Number(stored.bestLayer) || 0,
    bestTime: Number(stored.bestTime) || 0,
    runs: Number(stored.runs) || 0,
    bossRushStage: Number(stored.bossRushStage) || 0,
    bossRushTime: Number(stored.bossRushTime) || 0,
    sectorsWon: Array.isArray(stored.sectorsWon) ? stored.sectorsWon : [],
    sectorTimes: stored.sectorTimes ?? {},
  };
}

/**
 * Raises the records with what this run reached; returns the new records.
 * `sectorWon`: the id of a sector just won, in `sectorTime` seconds.
 */
export function updateRecords({
  layer = 0,
  time = 0,
  newRun = false,
  bossRushStage = 0,
  bossRushTime = 0,
  sectorWon = null,
  sectorTime = 0,
} = {}) {
  const records = loadRecords();
  const clear = Math.floor(Number(bossRushTime) || 0);
  const next = {
    bestLayer: Math.max(records.bestLayer, Math.floor(Number(layer) || 0)),
    bestTime: Math.max(records.bestTime, Math.floor(Number(time) || 0)),
    runs: records.runs + (newRun ? 1 : 0),
    bossRushStage: Math.max(
      records.bossRushStage,
      Math.floor(Number(bossRushStage) || 0)
    ),
    bossRushTime:
      clear > 0 && (records.bossRushTime === 0 || clear < records.bossRushTime)
        ? clear
        : records.bossRushTime,
    sectorsWon: records.sectorsWon,
    sectorTimes: records.sectorTimes,
  };
  if (sectorWon) {
    if (!next.sectorsWon.includes(sectorWon)) {
      next.sectorsWon = [...next.sectorsWon, sectorWon];
    }
    const sectorClear = Math.floor(Number(sectorTime) || 0);
    const best = Number(next.sectorTimes[sectorWon]) || 0;
    if (sectorClear > 0 && (best === 0 || sectorClear < best)) {
      next.sectorTimes = { ...next.sectorTimes, [sectorWon]: sectorClear };
    }
  }
  if (Object.keys(next).some((key) => next[key] !== records[key])) {
    saveJSON(RECORDS_STORAGE_KEY, next);
  }
  return next;
}

/** Boss Rush opens once a run has gone past Warden Prime's layer. */
export function isBossRushUnlocked(records = loadRecords()) {
  return records.bestLayer > BOSS_RUSH_LAYERS[0];
}

/**
 * The first sector is always open; the others once the sector before was won,
 * or a full run went past its Warden.
 */
export function isSectorUnlocked(sector, records = loadRecords()) {
  const previous = SECTORS[SECTORS.findIndex((s) => s.id === sector.id) - 1];
  return (
    !previous ||
    records.sectorsWon.includes(previous.id) ||
    records.bestLayer > previous.layers[1]
  );
}
