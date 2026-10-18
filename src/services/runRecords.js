// src/services/runRecords.js

import { loadJSON, saveJSON } from '../core/storage.js';

export const RECORDS_STORAGE_KEY = 'roguefield:records:v1';

/** Best layer reached, longest run (seconds) and runs started, across runs. */
export function loadRecords() {
  const stored = loadJSON(RECORDS_STORAGE_KEY) ?? {};
  return {
    bestLayer: Number(stored.bestLayer) || 0,
    bestTime: Number(stored.bestTime) || 0,
    runs: Number(stored.runs) || 0,
  };
}

/** Raises the records with what this run reached; returns the new records. */
export function updateRecords({ layer = 0, time = 0, newRun = false } = {}) {
  const records = loadRecords();
  const next = {
    bestLayer: Math.max(records.bestLayer, Math.floor(Number(layer) || 0)),
    bestTime: Math.max(records.bestTime, Math.floor(Number(time) || 0)),
    runs: records.runs + (newRun ? 1 : 0),
  };
  if (
    next.bestLayer !== records.bestLayer ||
    next.bestTime !== records.bestTime ||
    next.runs !== records.runs
  ) {
    saveJSON(RECORDS_STORAGE_KEY, next);
  }
  return next;
}
