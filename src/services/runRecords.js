// src/services/runRecords.js

import { loadJSON, saveJSON } from '../core/storage.js';
import { BOSS_RUSH_LAYERS } from '../data/layers.js';

export const RECORDS_STORAGE_KEY = 'roguefield:records:v1';

/**
 * Best layer reached, longest run (seconds) and runs started, across runs;
 * Boss Rush: the furthest Warden reached (1-3) and the fastest clear
 * (seconds, 0 before the first).
 */
export function loadRecords() {
  const stored = loadJSON(RECORDS_STORAGE_KEY) ?? {};
  return {
    bestLayer: Number(stored.bestLayer) || 0,
    bestTime: Number(stored.bestTime) || 0,
    runs: Number(stored.runs) || 0,
    bossRushStage: Number(stored.bossRushStage) || 0,
    bossRushTime: Number(stored.bossRushTime) || 0,
  };
}

/** Raises the records with what this run reached; returns the new records. */
export function updateRecords({
  layer = 0,
  time = 0,
  newRun = false,
  bossRushStage = 0,
  bossRushTime = 0,
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
  };
  if (Object.keys(next).some((key) => next[key] !== records[key])) {
    saveJSON(RECORDS_STORAGE_KEY, next);
  }
  return next;
}

/** Boss Rush opens once a run has gone past Warden Prime's layer. */
export function isBossRushUnlocked(records = loadRecords()) {
  return records.bestLayer > BOSS_RUSH_LAYERS[0];
}
