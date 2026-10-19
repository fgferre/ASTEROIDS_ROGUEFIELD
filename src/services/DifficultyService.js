// src/services/DifficultyService.js

import { loadJSON, saveJSON } from '../core/storage.js';
import {
  DAILY_DIFFICULTY,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_LABELS,
  DIFFICULTY_PRESETS,
  difficultyId,
} from '../data/difficulty.js';

export const DAILY_STORAGE_KEY = 'roguefield:daily:v1';

/**
 * Boot seed sources drawn at random. Any other source (`?seed=`, the stored
 * override, a replay, a harness) pins the seed for every run.
 */
const RANDOM_SEED_SOURCES = ['crypto', 'clock'];

const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

/** 'YYYY-MM-DD' of `date` in UTC. */
export function utcDateKey(date) {
  return date.toISOString().slice(0, 10);
}

/** The Daily Field seed: FNV-1a (32-bit) of the UTC date key. */
export function dailySeed(dateKey) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < dateKey.length; i += 1) {
    hash ^= dateKey.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 'DAILY FIELD · 18 OCT' for '2026-10-18'. */
export function dailyLabel(dateKey) {
  const [, month, day] = dateKey.split('-').map(Number);
  return `DAILY FIELD · ${day} ${MONTHS[month - 1]}`;
}

/** The shareable link that replays `seed` at `difficulty`. */
export function seedLink(origin, base, seed, difficulty) {
  return `${origin}${base}?seed=${seed}&difficulty=${difficulty}`;
}

/** Today's Daily Field record; an older day's record reads as empty. */
export function loadDailyRecord(dateKey) {
  const stored = loadJSON(DAILY_STORAGE_KEY);
  if (stored?.date !== dateKey) {
    return { date: dateKey, bestLayer: 0, bestTime: 0 };
  }
  return {
    date: dateKey,
    bestLayer: Number(stored.bestLayer) || 0,
    bestTime: Number(stored.bestTime) || 0,
  };
}

/** Raises today's Daily Field record; returns it. */
export function updateDailyRecord({ dateKey, layer = 0, time = 0 }) {
  const record = loadDailyRecord(dateKey);
  const next = {
    date: dateKey,
    bestLayer: Math.max(record.bestLayer, Math.floor(Number(layer) || 0)),
    bestTime: Math.max(record.bestTime, Math.floor(Number(time) || 0)),
  };
  saveJSON(DAILY_STORAGE_KEY, next);
  return next;
}

function urlParam(name) {
  if (typeof window === 'undefined' || !window.location) return null;
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * The run's difficulty and seed. The preset comes from, in order: a replay
 * being played, the Daily Field (always Veteran), `?difficulty=` and the
 * `gameplay.difficulty` setting. It is locked when a run begins, so changing
 * the setting mid-run applies from the next run. The seed is the boot seed
 * (`?seed=`, else the random source; see GameSessionService) for the first
 * normal run and a fresh one for each later run, unless the boot seed was
 * pinned; or, on the Daily Field, the hash of today's UTC date.
 */
export default class DifficultyService {
  constructor({ settings, bootSeed, bootSeedSource, now = () => new Date() }) {
    this.settings = settings;
    this.pinnedSeed = !RANDOM_SEED_SOURCES.includes(bootSeedSource);
    this.runSeed = bootSeed;
    this.bootSeedSpent = false;
    this.now = now;
    this.urlDifficulty = difficultyId(urlParam('difficulty'));
    this.replayDifficulty = null;
    this.daily = false;
    this.dateKey = null;
    this.runDifficulty = null;
  }

  /** The preset the next run would fly. */
  getSelectedDifficulty() {
    if (this.replayDifficulty) return this.replayDifficulty;
    if (this.daily) return DAILY_DIFFICULTY;
    return (
      this.urlDifficulty ??
      difficultyId(this.settings.getSetting('gameplay', 'difficulty')) ??
      DEFAULT_DIFFICULTY
    );
  }

  /** The current run's preset (the selected one before any run). */
  getDifficulty() {
    return this.runDifficulty ?? this.getSelectedDifficulty();
  }

  getModifiers() {
    return DIFFICULTY_PRESETS[this.getDifficulty()];
  }

  /** A replay plays at the difficulty it was recorded at. */
  useReplay(recording) {
    this.replayDifficulty =
      difficultyId(recording.difficulty) ?? DEFAULT_DIFFICULTY;
  }

  /**
   * Locks the preset for a new run and returns its seed. `daily` true starts
   * the Daily Field, false a normal run; undefined keeps the last mode (New
   * Mission after a Daily Field flies today's field again).
   */
  beginRun({ daily } = {}) {
    if (daily !== undefined) this.daily = daily;
    this.dateKey = this.daily ? this.todayKey() : null;
    this.runDifficulty = this.getSelectedDifficulty();
    if (!this.daily) {
      if (this.bootSeedSpent && !this.pinnedSeed) {
        this.runSeed = crypto.getRandomValues(new Uint32Array(1))[0];
      }
      this.bootSeedSpent = true;
    }
    return this.getRunSeed();
  }

  getRunSeed() {
    return this.daily ? dailySeed(this.dateKey) : this.runSeed;
  }

  isDaily() {
    return this.daily;
  }

  todayKey() {
    return utcDateKey(this.now());
  }

  /** 'SEED 2229850880 · VETERAN' or 'DAILY FIELD · 18 OCT · SEED 1234'. */
  runLabel() {
    const seed = `SEED ${this.getRunSeed()}`;
    return this.daily
      ? `${dailyLabel(this.dateKey)} · ${seed}`
      : `${seed} · ${DIFFICULTY_LABELS[this.getDifficulty()].toUpperCase()}`;
  }

  /** The link that replays this run's seed and preset. */
  shareLink(origin, base) {
    return seedLink(origin, base, this.getRunSeed(), this.getDifficulty());
  }

  /** Raises today's record when the run was a Daily Field. */
  recordRun({ layer, time }) {
    if (!this.daily) return null;
    return updateDailyRecord({ dateKey: this.dateKey, layer, time });
  }

  /** Today's Daily Field best, for the menu. */
  getDailyRecord() {
    return loadDailyRecord(this.todayKey());
  }
}
