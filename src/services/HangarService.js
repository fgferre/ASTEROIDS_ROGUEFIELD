// src/services/HangarService.js

import { ACHIEVEMENTS } from '../data/achievements.js';
import { DIFFICULTY_LABELS, PRESSURE_RUNGS } from '../data/difficulty.js';
import {
  BASE_MODIFIERS,
  CONTROL_ITEMS,
  HANGAR_ITEMS,
  LICENSES,
  runSalvage,
} from '../data/hangar.js';
import { PICKUP_KINDS } from '../data/pickups.js';
import { sectorById } from '../data/sectors.js';
import { DEFAULT_HULL_ID } from '../data/shipModels.js';
import { loadJSON, saveJSON } from '../core/storage.js';

/** The first save: `{ salvage, owned }`. Read once, never written again. */
export const HANGAR_STORAGE_KEY_V1 = 'roguefield:hangar:v1';
export const HANGAR_STORAGE_KEY = 'roguefield:hangar:v2';

const ALL_ITEMS = [...HANGAR_ITEMS, ...CONTROL_ITEMS];
const ITEMS_BY_ID = new Map(ALL_ITEMS.map((item) => [item.id, item]));
const LICENSES_BY_ID = new Map(LICENSES.map((entry) => [entry.id, entry]));
const MEDALS_BY_ID = new Map(ACHIEVEMENTS.map((entry) => [entry.id, entry]));

// id → true maps of the save; an id the game no longer sells is kept.
const idSet = (value) =>
  Object.fromEntries(
    Object.keys(value && typeof value === 'object' ? value : {}).map((id) => [
      id,
      true,
    ])
  );
const count = (value) => Math.max(0, Math.floor(Number(value) || 0));

/**
 * The v2 save from what storage holds: the v2 save itself, else the v1 one
 * moved over with nothing lost (its Salvage and every item it owned), else an
 * empty Hangar.
 * - `owned`: shop items bought (the Ship tab's and the control rungs, Seal
 *   and Flight School included); `licenses`: cards licensed, bought or paid
 *   by a medal; `licensesOff`: licensed cards switched off (free, reversible);
 * - `medalsPaid`: medals whose reward was paid, so each pays once;
 * - `pressure`: `open` (highest rung open), `selected` (the rung the next
 *   runs fly, 0 for none) and `best` (highest rung won).
 */
export function loadHangarSave() {
  const stored =
    loadJSON(HANGAR_STORAGE_KEY) ?? loadJSON(HANGAR_STORAGE_KEY_V1) ?? {};
  const pressure = stored.pressure ?? {};
  const open = Math.min(PRESSURE_RUNGS.length, count(pressure.open));
  return {
    version: 2,
    salvage: count(stored.salvage),
    owned: idSet(stored.owned),
    licenses: idSet(stored.licenses),
    licensesOff: idSet(stored.licensesOff),
    medalsPaid: idSet(stored.medalsPaid),
    pressure: {
      open,
      selected: Math.min(open, count(pressure.selected)),
      best: Math.min(PRESSURE_RUNGS.length, count(pressure.best)),
    },
  };
}

/**
 * Meta-progression between runs (docs/NORTE.md §7 pillar 7, a proposal):
 * Salvage earned per run, spent in the Hangar on permanent upgrades, kept in
 * localStorage. A run pays out on each death, on victory and on a quit from the
 * pause menu; a retried run
 * only pays the difference, so it is never paid twice. A replayed run pays
 * nothing. A Boss Rush run pays
 * per Warden felled instead of per layer, a sector run per layer it played
 * (`runSalvage`); every Salvage Cache
 * picked up adds its bonus on top. Systems read
 * `getModifiers()` at run start; the hull stays the `selectedHull` setting,
 * gated here by `hullFor()`.
 *
 * Medals (progression plan H1): each unlocked achievement pays its `reward`
 * once (`payMedal`); on load, every medal unlocked and not yet paid is paid,
 * so a save from before the medals gets them all, once. The First Victory
 * medal opens Pressure rung 1; a run won on a rung opens the next
 * (`setPressure` picks the rung the next runs fly, in DifficultyService).
 */
export default class HangarService {
  constructor({ eventBus, difficulty, achievements } = {}) {
    this.eventBus = eventBus;
    this.difficulty = difficulty;
    this.achievements = achievements;
    Object.assign(this, loadHangarSave());
    this.difficulty.setPressure(this.pressure.selected);
    this.startRun();
    const unpaid = achievements
      .getEntries()
      .filter((entry) => entry.unlockedAt && !this.medalsPaid[entry.id]);
    unpaid.forEach((entry) => this.payMedal(entry.id));
    if (unpaid.length > 0) this.persist();

    eventBus.on('game-started', (payload = {}) => this.startRun(payload));
    eventBus.on('boss-defeated', () => {
      if (this.bossRush) this.bossRushWardens += 1;
    });
    eventBus.on('run-won', () => {
      this.won = true;
      this.climbPressure();
    });
    eventBus.on('achievement-unlocked', ({ id } = {}) => {
      if (this.payMedal(id)) this.persist();
    });
    eventBus.on('pickup-collected', ({ kind } = {}) => {
      if (kind === 'salvage') this.cacheSalvage += PICKUP_KINDS.salvage.salvage;
    });
    // Salvage a run earns in play beyond pickups, e.g. a card offer with
    // nothing left to offer (progression plan H5): paid at the run's end with
    // the rest, at the difficulty's rate.
    eventBus.on('salvage-bonus', ({ amount = 0 } = {}) => {
      this.cacheSalvage += Math.max(0, Math.floor(Number(amount) || 0));
    });
    eventBus.on('player-died', (summary = {}) => this.award(summary));
    eventBus.on('run-abandoned', (summary = {}) => this.award(summary));
    eventBus.on('screen-changed', (payload = {}) => {
      if (payload.screen === 'victory') this.award(payload.data);
    });
  }

  startRun({ bossRush = false, replay = false, sector = null } = {}) {
    this.won = false;
    this.replay = replay;
    this.bossRush = bossRush;
    this.sector = sectorById(sector);
    this.bossRushWardens = 0;
    this.cacheSalvage = 0;
    this.runAwarded = 0;
    this.runMedalSalvage = 0;
    this.lastAward = null;
  }

  /** Pays a medal's reward if it was never paid; true when it paid now. */
  payMedal(id) {
    const reward = MEDALS_BY_ID.get(id)?.reward;
    if (!reward || this.medalsPaid[id]) return false;
    this.medalsPaid[id] = true;
    this.salvage += reward.salvage ?? 0;
    this.runMedalSalvage += reward.salvage ?? 0;
    if (reward.license) this.licenses[reward.license] = true;
    if (reward.opensPressure) {
      this.pressure.open = Math.max(this.pressure.open, 1);
    }
    return true;
  }

  /**
   * A run won on a rung counts as its best; won on the highest open rung, it
   * opens the next. A rung flown by link (`?difficulty=pressure-5`) before it
   * was open counts for nothing.
   */
  climbPressure() {
    const rung = this.difficulty.getPressure();
    if (this.replay || this.bossRush || rung === 0) return;
    if (rung > this.pressure.open) return;
    this.pressure.best = Math.max(this.pressure.best, rung);
    if (rung === this.pressure.open) {
      this.pressure.open = Math.min(PRESSURE_RUNGS.length, rung + 1);
    }
    this.persist();
  }

  /** The rung the next runs fly (0 for none), if it is open. */
  setPressure(rung) {
    if (rung < 0 || rung > this.pressure.open) return false;
    this.pressure.selected = rung;
    this.difficulty.setPressure(rung);
    this.persist();
    return true;
  }

  /** Every medal in list order, with `unlockedAt`, `progress` and `paid`. */
  getMedals() {
    return this.achievements.getEntries().map((entry) => ({
      ...entry,
      paid: Boolean(this.medalsPaid[entry.id]),
    }));
  }

  /**
   * Pays what this run is worth, scaled by the difficulty's salvage
   * multiplier, beyond what it was already paid.
   */
  award(runSummary = {}) {
    if (this.replay) {
      // A replay pays nothing: the viewer's Salvage stays as it is.
      this.lastAward = {
        amount: 0,
        total: this.salvage,
        multiplier: 1,
        medals: this.runMedalSalvage,
      };
      return this.lastAward;
    }
    const wave = runSummary.wave;
    const multiplier = this.difficulty.getModifiers().salvage;
    const worth = Math.round(
      (runSalvage({
        layer: typeof wave === 'number' ? wave : wave?.current,
        kills: runSummary.stats?.totalKills ?? runSummary.stats?.kills,
        won: this.won,
        bossRushWardens: this.bossRush ? this.bossRushWardens : null,
        firstLayer: this.sector?.layers[0] ?? 1,
      }) +
        this.cacheSalvage) *
        multiplier
    );
    const amount = Math.max(0, worth - this.runAwarded);
    this.runAwarded += amount;
    this.salvage += amount;
    this.lastAward = {
      amount: this.runAwarded,
      total: this.salvage,
      multiplier,
      difficulty: DIFFICULTY_LABELS[this.difficulty.getDifficulty()],
      medals: this.runMedalSalvage,
    };
    if (amount > 0) {
      this.persist();
      this.eventBus.emit('salvage-awarded', { amount, total: this.salvage });
    }
    return this.lastAward;
  }

  /** Why an item cannot be bought yet: the rung before it, or its medal. */
  lockOf(item) {
    if (item.requires && !this.owned[item.requires]) {
      return { item: ITEMS_BY_ID.get(item.requires).name };
    }
    if (item.requiresMedal && !this.medalsPaid[item.requiresMedal]) {
      return { medal: MEDALS_BY_ID.get(item.requiresMedal).title };
    }
    return null;
  }

  buy(id) {
    const item = ITEMS_BY_ID.get(id);
    if (!item || this.owned[id] || this.salvage < item.cost) return false;
    if (this.lockOf(item)) return false;
    this.salvage -= item.cost;
    this.owned[id] = true;
    this.persist();
    this.eventBus.emit('hangar-purchased', { id, owned: { ...this.owned } });
    return true;
  }

  persist() {
    saveJSON(HANGAR_STORAGE_KEY, {
      version: 2,
      salvage: this.salvage,
      owned: this.owned,
      licenses: this.licenses,
      licensesOff: this.licensesOff,
      medalsPaid: this.medalsPaid,
      pressure: this.pressure,
    });
  }

  /** Every item of `items` in shop order, with `owned`, `affordable` and `lock`. */
  getItems(items = HANGAR_ITEMS) {
    return items.map((item) => ({
      ...item,
      owned: Boolean(this.owned[item.id]),
      affordable: this.salvage >= item.cost,
      lock: this.lockOf(item),
    }));
  }

  getControlItems() {
    return this.getItems(CONTROL_ITEMS);
  }

  /** Buys a licence on sale; it starts switched on. */
  buyLicense(id) {
    const entry = LICENSES_BY_ID.get(id);
    if (!entry || this.licenses[id] || this.salvage < entry.cost) return false;
    this.salvage -= entry.cost;
    this.licenses[id] = true;
    this.persist();
    this.eventBus.emit('hangar-purchased', { id, owned: { ...this.owned } });
    return true;
  }

  /** Switches a held licence on or off, free: off takes the card out of the draw. */
  setLicenseOn(id, on) {
    if (!this.licenses[id]) return false;
    if (on) delete this.licensesOff[id];
    else this.licensesOff[id] = true;
    this.persist();
    return true;
  }

  /**
   * The licences on sale, then the ones medals pay, each with `owned`, `on`,
   * `affordable` and, for a medal's, `medal` (its title).
   */
  getLicenses() {
    const fromMedals = ACHIEVEMENTS.filter(
      (entry) => entry.reward?.license
    ).map((entry) => ({
      id: entry.reward.license,
      kind: 'card',
      medal: entry.title,
    }));
    return [...LICENSES, ...fromMedals].map((entry) => ({
      ...entry,
      owned: Boolean(this.licenses[entry.id]),
      on: Boolean(this.licenses[entry.id]) && !this.licensesOff[entry.id],
      affordable: entry.cost !== undefined && this.salvage >= entry.cost,
    }));
  }

  getModifiers() {
    const modifiers = { ...BASE_MODIFIERS };
    ALL_ITEMS.forEach((item) => {
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
