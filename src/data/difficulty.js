// src/data/difficulty.js

import { MAX_ASTEROIDS_ON_SCREEN } from './constants/gameplay.js';

// Difficulty presets (numbers "proposta 18/10", to be judged in play). Each
// multiplier is read at one entry point: enemyHp at spawn (EnemySpawnSystem),
// enemyDamage on hits to the player (PlayerSystem.takeDamage), spawnCount on
// the layer director (WaveManager), xp on collected XP (ProgressionSystem),
// salvage on the run payout.

export const DEFAULT_DIFFICULTY = 'veteran';
/** The Daily Field always flies this preset, so everyone's record compares. */
export const DAILY_DIFFICULTY = 'veteran';

export const DIFFICULTY_PRESETS = Object.freeze({
  pilot: Object.freeze({
    enemyHp: 0.8,
    enemyDamage: 0.7,
    spawnCount: 0.85,
    xp: 1.0,
    salvage: 0.8,
  }),
  veteran: Object.freeze({
    enemyHp: 1,
    enemyDamage: 1,
    spawnCount: 1,
    xp: 1,
    salvage: 1,
  }),
  warden: Object.freeze({
    enemyHp: 1.3,
    enemyDamage: 1.4,
    spawnCount: 1.15,
    xp: 1.15,
    salvage: 1.3,
  }),
});

export const DIFFICULTY_IDS = Object.freeze(Object.keys(DIFFICULTY_PRESETS));

export const DIFFICULTY_LABELS = Object.freeze({
  pilot: 'Pilot',
  veteran: 'Veteran',
  warden: 'Warden',
});

/** `id` when it names a preset, else null. */
export function difficultyId(id) {
  const key = String(id ?? '').toLowerCase();
  return DIFFICULTY_IDS.includes(key) ? key : null;
}

function scaleCount(count, factor) {
  return count > 0 ? Math.max(1, Math.round(count * factor)) : count;
}

/** A layer director (data/layers.js) with its spawn counts scaled. */
export function scaleDirector(director, factor) {
  if (factor === 1) return director;
  return {
    ...director,
    rocks: Math.min(
      MAX_ASTEROIDS_ON_SCREEN,
      scaleCount(director.rocks, factor)
    ),
    roster: director.roster.map((entry) => ({
      ...entry,
      count: scaleCount(entry.count, factor),
    })),
    surges: director.surges.map((surge) => ({
      ...surge,
      count: scaleCount(surge.count, factor),
    })),
    formations: director.formations.map((entry) => ({
      ...entry,
      count: scaleCount(entry.count, factor),
    })),
  };
}
