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

// The Pressure ladder above Warden (progression plan H4, numbers "proposta
// 16/11"): rung 1 opens with the First Victory medal, a run won on a rung
// opens the next. Chosen in the Hangar, never offered by the Settings
// difficulty picker; the Daily Field never flies it. A rung is a run
// difficulty of its own ('pressure-2'), so labels, share links and replays
// carry it like a preset.
export const PRESSURE_RUNGS = Object.freeze([
  Object.freeze({
    enemyHp: 1.45,
    enemyDamage: 1.55,
    spawnCount: 1.25,
    xp: 1.15,
    salvage: 1.5,
  }),
  Object.freeze({
    enemyHp: 1.6,
    enemyDamage: 1.7,
    spawnCount: 1.35,
    xp: 1.15,
    salvage: 1.75,
  }),
  Object.freeze({
    enemyHp: 1.8,
    enemyDamage: 1.85,
    spawnCount: 1.45,
    xp: 1.15,
    salvage: 2,
  }),
  Object.freeze({
    enemyHp: 2,
    enemyDamage: 2,
    spawnCount: 1.55,
    xp: 1.15,
    salvage: 2.3,
  }),
  Object.freeze({
    enemyHp: 2.25,
    enemyDamage: 2.2,
    spawnCount: 1.65,
    xp: 1.15,
    salvage: 2.6,
  }),
]);

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/** 'II' for rung 2. */
export const pressureNumeral = (rung) => ROMAN[rung - 1];

/** The run difficulty id of a Pressure rung (1-based): 'pressure-2'. */
export const pressureId = (rung) => `pressure-${rung}`;

/** The rung of a run difficulty id, 0 when it is a preset. */
export function pressureRung(id) {
  const match = /^pressure-(\d)$/.exec(String(id ?? ''));
  const rung = match ? Number(match[1]) : 0;
  return rung >= 1 && rung <= PRESSURE_RUNGS.length ? rung : 0;
}

/** Every difficulty a run can fly: the presets, then the Pressure rungs. */
export const RUN_DIFFICULTIES = Object.freeze({
  ...DIFFICULTY_PRESETS,
  ...Object.fromEntries(
    PRESSURE_RUNGS.map((rung, index) => [pressureId(index + 1), rung])
  ),
});

export const DIFFICULTY_LABELS = Object.freeze({
  pilot: 'Pilot',
  veteran: 'Veteran',
  warden: 'Warden',
  ...Object.fromEntries(
    PRESSURE_RUNGS.map((rung, index) => [
      pressureId(index + 1),
      `Pressure ${pressureNumeral(index + 1)}`,
    ])
  ),
});

/** `id` when it names a run difficulty (a preset or a Pressure rung), else null. */
export function difficultyId(id) {
  const key = String(id ?? '').toLowerCase();
  return Object.hasOwn(RUN_DIFFICULTIES, key) ? key : null;
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
