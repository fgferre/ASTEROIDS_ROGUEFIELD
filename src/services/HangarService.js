// src/services/HangarService.js

import { BASE_MODIFIERS, HANGAR_ITEMS, runSalvage } from '../data/hangar.js';
import { DEFAULT_HULL_ID } from '../data/shipModels.js';
import { loadJSON, saveJSON } from '../core/storage.js';

export const HANGAR_STORAGE_KEY = 'roguefield:hangar:v1';

const ITEMS_BY_ID = new Map(HANGAR_ITEMS.map((item) => [item.id, item]));

/**
 * Meta-progression between runs (docs/NORTE.md §7 pillar 7, a proposal):
 * Salvage earned per run, spent in the Hangar on permanent upgrades, kept in
 * localStorage. A run pays out on each death and on victory; a retried run
 * only pays the difference, so it is never paid twice. Systems read
 * `getModifiers()` at run start; the hull stays the `selectedHull` setting,
 * gated here by `hullFor()`.
 */
export default class HangarService {
  constructor({ eventBus } = {}) {
    this.eventBus = eventBus;
    const stored = loadJSON(HANGAR_STORAGE_KEY) ?? {};
    this.salvage = Math.max(0, Math.floor(Number(stored.salvage) || 0));
    this.owned = Object.fromEntries(
      Object.keys(stored.owned ?? {})
        .filter((id) => ITEMS_BY_ID.has(id))
        .map((id) => [id, true])
    );
    this.startRun();

    eventBus.on('game-started', () => this.startRun());
    eventBus.on('run-won', () => {
      this.won = true;
    });
    eventBus.on('player-died', (summary = {}) => this.award(summary));
    eventBus.on('screen-changed', (payload = {}) => {
      if (payload.screen === 'victory') this.award(payload.data);
    });
  }

  startRun() {
    this.won = false;
    this.runAwarded = 0;
    this.lastAward = null;
  }

  /** Pays what this run is worth beyond what it was already paid. */
  award(runSummary = {}) {
    const wave = runSummary.wave;
    const worth = runSalvage({
      layer: typeof wave === 'number' ? wave : wave?.current,
      kills: runSummary.stats?.totalKills ?? runSummary.stats?.kills,
      won: this.won,
    });
    const amount = Math.max(0, worth - this.runAwarded);
    this.runAwarded += amount;
    this.salvage += amount;
    this.lastAward = { amount: this.runAwarded, total: this.salvage };
    if (amount > 0) {
      this.persist();
      this.eventBus.emit('salvage-awarded', { amount, total: this.salvage });
    }
    return this.lastAward;
  }

  buy(id) {
    const item = ITEMS_BY_ID.get(id);
    if (!item || this.owned[id] || this.salvage < item.cost) return false;
    this.salvage -= item.cost;
    this.owned[id] = true;
    this.persist();
    this.eventBus.emit('hangar-purchased', { id });
    return true;
  }

  persist() {
    saveJSON(HANGAR_STORAGE_KEY, { salvage: this.salvage, owned: this.owned });
  }

  /** Every item in shop order, with `owned` and `affordable`. */
  getItems() {
    return HANGAR_ITEMS.map((item) => ({
      ...item,
      owned: Boolean(this.owned[item.id]),
      affordable: this.salvage >= item.cost,
    }));
  }

  getModifiers() {
    const modifiers = { ...BASE_MODIFIERS };
    HANGAR_ITEMS.forEach((item) => {
      if (!this.owned[item.id]) return;
      Object.entries(item.modifiers ?? {}).forEach(([key, value]) => {
        modifiers[key] = key.endsWith('Multiplier')
          ? modifiers[key] * value
          : modifiers[key] + value;
      });
    });
    return modifiers;
  }

  isHullUnlocked(hullId) {
    const item = HANGAR_ITEMS.find((entry) => entry.unlocksHull === hullId);
    return !item || Boolean(this.owned[item.id]);
  }

  /** The hull a run flies: the selected one if unlocked, else the default. */
  hullFor(hullId) {
    return this.isHullUnlocked(hullId) ? hullId : DEFAULT_HULL_ID;
  }
}
