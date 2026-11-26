// src/services/HangarService.js

import { ACHIEVEMENTS } from '../data/achievements.js';
import { DIFFICULTY_LABELS, PRESSURE_RUNGS } from '../data/difficulty.js';
import {
  BASE_MODIFIERS,
  CONTROL_ITEMS,
  HANGAR_ITEMS,
  LICENSES,
  PILOT_TRACK,
  runSalvage,
  SALVAGE_PER_CARD_CACHE,
  STARTING_DRAW,
} from '../data/hangar.js';
import UPGRADE_LIBRARY from '../data/upgrades/index.js';
import { PICKUP_KINDS } from '../data/pickups.js';
import { FIRST_RUN_MODE } from '../core/runMode.js';
import { DEFAULT_HULL_ID } from '../data/shipModels.js';
import {
  isPilotStale,
  isProgressHeld,
  loadJSON,
  saveProgress,
} from '../core/storage.js';

/** The first save: `{ salvage, owned }`. Read once, never written again. */
export const HANGAR_STORAGE_KEY_V1 = 'roguefield:hangar:v1';
export const HANGAR_STORAGE_KEY = 'roguefield:hangar:v2';

const ALL_ITEMS = [...HANGAR_ITEMS, ...CONTROL_ITEMS];
const ITEMS_BY_ID = new Map(ALL_ITEMS.map((item) => [item.id, item]));
const LICENSES_BY_ID = new Map(LICENSES.map((entry) => [entry.id, entry]));
const MEDALS_BY_ID = new Map(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
// The piloting cards the Flight School may launch with: the track's first
// steps, the ones with no prerequisite.
const FLIGHT_SCHOOL_CARDS = PILOT_TRACK.filter(
  (id) => !UPGRADE_LIBRARY.find((card) => card.id === id)?.prerequisites?.length
);

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
 *   runs fly, 0 for none) and `best` (highest rung won);
 * - `sealed`: cards sealed out of the next runs' draw; `startingCard`: the
 *   piloting card the Flight School launches with (null for none).
 */
export function loadHangarSave(slot) {
  const stored =
    loadJSON(HANGAR_STORAGE_KEY, slot) ??
    loadJSON(HANGAR_STORAGE_KEY_V1, slot) ??
    {};
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
    sealed: Array.isArray(stored.sealed)
      ? stored.sealed.filter((id) => typeof id === 'string')
      : [],
    startingCard:
      typeof stored.startingCard === 'string' ? stored.startingCard : null,
  };
}

/**
 * Meta-progression between runs (docs/NORTE.md §7 pillar 7, a proposal):
 * Salvage earned per run, spent in the Hangar on permanent upgrades, kept in
 * localStorage. A run pays out on each death, on victory and on a quit from the
 * pause menu; a retried run
 * only pays the difference, so it is never paid twice. A replayed run or a
 * demo scene pays nothing (storage.js). A Boss Rush run pays
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
    this.replaySetup = null;
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
      if (this.mode.scoredByWardens) this.bossRushWardens += 1;
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
    // The Salvage Cache card: a pick with nothing left to offer, paid with the
    // rest at the run's end, at the difficulty's rate.
    eventBus.on('card-salvage', () => {
      this.cacheSalvage += SALVAGE_PER_CARD_CACHE;
    });
    eventBus.on('player-died', (summary = {}) => this.award(summary));
    // A quit from the pause pays the layers already cleared, not the one in
    // play (the owner's call, 17/11): start-and-quit no longer earns.
    eventBus.on('run-abandoned', (summary = {}) =>
      this.award(summary, { quit: true })
    );
    eventBus.on('screen-changed', (payload = {}) => {
      if (payload.screen === 'victory') this.award(payload.data);
    });
  }

  startRun({ mode = FIRST_RUN_MODE } = {}) {
    this.won = false;
    this.mode = mode;
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
    if (isProgressHeld() || !this.mode.winClimbsPressure || rung === 0) return;
    if (rung > this.pressure.open) return;
    this.pressure.best = Math.max(this.pressure.best, rung);
    if (rung === this.pressure.open) {
      this.pressure.open = Math.min(PRESSURE_RUNGS.length, rung + 1);
    }
    this.persist();
  }

  /** The rung the next runs fly (0 for none), if it is open. */
  setPressure(rung) {
    if (isPilotStale()) return false;
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
   * multiplier, beyond what it was already paid; a `quit` leaves out the
   * layer in play.
   */
  award(runSummary = {}, { quit = false } = {}) {
    if (isProgressHeld()) {
      // A replay or a demo pays nothing: the viewer's Salvage stays as it is.
      this.lastAward = {
        amount: 0,
        total: this.salvage,
        multiplier: 1,
        medals: this.runMedalSalvage,
      };
      return this.lastAward;
    }
    const wave = runSummary.wave;
    const layer = typeof wave === 'number' ? wave : wave?.current;
    const multiplier = this.difficulty.getModifiers().salvage;
    const worth = Math.round(
      (runSalvage({
        layer: quit ? layer - 1 : layer,
        kills: runSummary.stats?.totalKills ?? runSummary.stats?.kills,
        won: this.won,
        bossRushWardens: this.mode.scoredByWardens
          ? this.bossRushWardens
          : null,
        firstLayer: this.mode.firstLayer,
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
    // Another tab changed this pilot: the write would be dropped, so sell nothing.
    if (isPilotStale()) return false;
    this.salvage -= item.cost;
    this.owned[id] = true;
    this.persist();
    this.eventBus.emit('hangar-purchased', { id, owned: { ...this.owned } });
    return true;
  }

  persist() {
    saveProgress(HANGAR_STORAGE_KEY, {
      version: 2,
      salvage: this.salvage,
      owned: this.owned,
      licenses: this.licenses,
      licensesOff: this.licensesOff,
      medalsPaid: this.medalsPaid,
      pressure: this.pressure,
      sealed: this.sealed,
      startingCard: this.startingCard,
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

  /**
   * For the menu's first-purchase lines (ui/onboarding.js): whether anything
   * on sale was bought yet, and whether the Salvage buys something on sale now.
   */
  purchaseState() {
    const onSale = [
      ...this.getItems(),
      ...this.getControlItems(),
      ...this.getLicenses().filter((entry) => entry.cost !== undefined),
    ];
    return {
      bought: onSale.some((entry) => entry.owned),
      affordable: onSale.some(
        (entry) => !entry.owned && entry.affordable && !entry.lock
      ),
    };
  }

  /** Buys a licence on sale; it starts switched on. */
  buyLicense(id) {
    if (isPilotStale()) return false;
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
    if (isPilotStale()) return false;
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

  /** The cards a run may draw: the starting draw and the licences switched on. */
  getOpenCards() {
    const licensed = Object.keys(this.licenses).filter(
      (id) => !this.licensesOff[id]
    );
    return new Set([...STARTING_DRAW, ...licensed]);
  }

  /** The total of a contract field (`seals`, `holds`) over the items owned. */
  contractTotal(key) {
    return CONTROL_ITEMS.reduce(
      (total, item) =>
        total + (this.owned[item.id] ? item.contract?.[key] ?? 0 : 0),
      0
    );
  }

  /** The cards sealed that still count: open ones, up to the Seal rungs owned. */
  getSealed() {
    const open = this.getOpenCards();
    return this.sealed
      .filter((id) => open.has(id))
      .slice(0, this.contractTotal('seals'));
  }

  /** Seals an open card out of the next runs' draw, or unseals it. */
  toggleSeal(id) {
    if (isPilotStale()) return false;
    if (this.sealed.includes(id)) {
      this.sealed = this.sealed.filter((entry) => entry !== id);
    } else if (
      this.getOpenCards().has(id) &&
      this.getSealed().length < this.contractTotal('seals')
    ) {
      this.sealed = [...this.getSealed(), id];
    } else {
      return false;
    }
    this.persist();
    return true;
  }

  /** The piloting cards the Flight School may launch with. */
  getFlightSchoolCards() {
    return FLIGHT_SCHOOL_CARDS;
  }

  /** Picks the Flight School's card (null for none); needs the item owned. */
  setStartingCard(id) {
    if (isPilotStale()) return false;
    if (!this.owned['flight-school']) return false;
    if (id !== null && !FLIGHT_SCHOOL_CARDS.includes(id)) return false;
    this.startingCard = id;
    this.persist();
    return true;
  }

  /**
   * What a run starts with: the items' numbers, then the contract the card
   * draw reads (progression plan H6): `openCards`, `sealed`, `holds` and
   * `startingCard`. The piloting track and the fallback cards stay outside
   * `openCards` and `sealed`; the draw handles them.
   */
  getModifiers() {
    if (this.replaySetup) return { ...this.replaySetup };
    const modifiers = { ...BASE_MODIFIERS };
    ALL_ITEMS.forEach((item) => {
      if (!this.owned[item.id]) return;
      Object.entries(item.modifiers ?? {}).forEach(([key, value]) => {
        modifiers[key] = key.endsWith('Multiplier')
          ? modifiers[key] * value
          : modifiers[key] + value;
      });
    });
    modifiers.openCards = this.getOpenCards();
    modifiers.sealed = new Set(this.getSealed());
    modifiers.holds = this.contractTotal('holds');
    modifiers.startingCard =
      this.owned['flight-school'] &&
      FLIGHT_SCHOOL_CARDS.includes(this.startingCard)
        ? this.startingCard
        : null;
    return modifiers;
  }

  /** The start-of-run setup, JSON-safe, for a recording. */
  getRunSetup() {
    const modifiers = this.getModifiers();
    return {
      ...modifiers,
      openCards: [...modifiers.openCards],
      sealed: [...modifiers.sealed],
    };
  }

  /**
   * A replay's recorded setup (or null) stands in for the profile's in
   * `getModifiers()`; the profile itself is never touched.
   */
  useReplaySetup(setup) {
    this.replaySetup = setup
      ? {
          ...setup,
          openCards: new Set(setup.openCards),
          sealed: new Set(setup.sealed),
        }
      : null;
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
