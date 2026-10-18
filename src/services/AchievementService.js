// src/services/AchievementService.js

import { ACHIEVEMENTS } from '../data/achievements.js';
import UPGRADE_LIBRARY from '../data/upgrades/index.js';
import { loadJSON, saveJSON } from '../core/storage.js';

export const ACHIEVEMENTS_STORAGE_KEY = 'roguefield:achievements:v1';

const BY_ID = new Map(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
const CURSED_UPGRADES = new Set(
  UPGRADE_LIBRARY.filter((upgrade) => upgrade.cursed).map(
    (upgrade) => upgrade.id
  )
);
const WARDEN_ACHIEVEMENTS = {
  prime: 'ring-breaker',
  choir: 'choir-silenced',
  null: 'null-and-void',
};
const DEEP_FIELD_LAYER = 20;

/**
 * Local achievements: `unlocked[id] = isoDate`, `progress[id] = n` for the
 * countable ones, kept in localStorage. An unlock emits
 * 'achievement-unlocked' { id, title }.
 */
export default class AchievementService {
  constructor({ eventBus } = {}) {
    this.eventBus = eventBus;
    const stored = loadJSON(ACHIEVEMENTS_STORAGE_KEY) ?? {};
    this.unlocked = stored.unlocked ?? {};
    this.progress = stored.progress ?? {};
    this.hullClean = true;
    this.cursedHeld = false;

    eventBus.on('game-started', () => {
      this.cursedHeld = false;
      this.count('survivor');
    });
    eventBus.on('wave-started', (payload = {}) => {
      this.hullClean = true;
      if (Number(payload.wave) >= DEEP_FIELD_LAYER) this.unlock('deep-field');
    });
    eventBus.on('wave-complete', (payload = {}) => {
      if (Number(payload.wave) >= 1) this.unlock('first-light');
    });
    eventBus.on('player-took-damage', (payload = {}) => {
      if ((payload.healthDamage ?? payload.damage) > 0) this.hullClean = false;
    });
    eventBus.on('boss-defeated', (payload = {}) => {
      const kind = payload.bossKind ?? payload.enemy?.bossKind;
      if (WARDEN_ACHIEVEMENTS[kind]) this.unlock(WARDEN_ACHIEVEMENTS[kind]);
      if (this.hullClean) this.unlock('untouchable');
    });
    eventBus.on('run-won', () => {
      this.unlock('null-and-void');
      if (this.cursedHeld) this.unlock('cursed-run');
    });
    eventBus.on('synergy-unlocked', () => this.unlock('full-set'));
    eventBus.on('apex-unlocked', () => this.unlock('apex-predator'));
    eventBus.on('weapon-beam-fired', () => this.count('harmonic'));
    eventBus.on('enemy-destroyed', (payload = {}) => {
      if (payload.enemy?.elite) this.count('elite-hunter');
    });
    eventBus.on('pickup-collected', () => this.count('scrapper'));
    eventBus.on('upgrade-applied', (payload = {}) => {
      if (CURSED_UPGRADES.has(payload.upgradeId)) this.cursedHeld = true;
    });
  }

  /** Adds one to a countable achievement; unlocks it at its target. */
  count(id) {
    if (this.unlocked[id]) return;
    this.progress[id] = (this.progress[id] ?? 0) + 1;
    if (this.progress[id] >= BY_ID.get(id).target) {
      this.unlock(id);
    } else {
      this.persist();
    }
  }

  unlock(id) {
    if (this.unlocked[id]) return;
    this.unlocked[id] = new Date().toISOString();
    this.persist();
    this.eventBus.emit('achievement-unlocked', {
      id,
      title: BY_ID.get(id).title,
    });
  }

  persist() {
    saveJSON(ACHIEVEMENTS_STORAGE_KEY, {
      unlocked: this.unlocked,
      progress: this.progress,
    });
  }

  /** Every achievement in list order, with `unlockedAt` (null if locked) and `progress`. */
  getEntries() {
    return ACHIEVEMENTS.map((entry) => ({
      ...entry,
      unlockedAt: this.unlocked[entry.id] ?? null,
      progress: Math.min(this.progress[entry.id] ?? 0, entry.target ?? 0),
    }));
  }
}
