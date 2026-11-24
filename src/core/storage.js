// src/core/storage.js

// The one localStorage wrapper: JSON in and out, never throws (private mode,
// full quota and no `window` all read as "nothing stored"), except
// saveProgress given a key that is not a pilot's: that is a bug, said loudly.
//
// Three pilots (save slots), each with its own progress: the keys in
// SLOT_KEYS, and only those, are the pilot's; everything else (settings, the
// slots index) is shared. Slot 1 is these keys as they are, so the save from
// before slots is slot 1 untouched; slots 2 and 3 prefix them
// ('roguefield:records:v1' → 'roguefield:slot2:records:v1'). The active slot
// is read once, as the page loads: a tab keeps its pilot until it reloads.
// Deleting a pilot is counted in the slots index (`deleted`, per slot), and a
// page keeps its own pilot's count from its load. A page whose pilot another
// tab deleted or wrote since (a 'storage' event reaches only the other tabs)
// holds an old copy of it: it writes none of it back, and going on with it
// reloads the page (pilotSelect.js, loadingScreen.js).

export const SLOT_COUNT = 3;
export const SLOTS_STORAGE_KEY = 'roguefield:slots:v1';
export const SLOT_KEYS = Object.freeze([
  'roguefield:records:v1',
  'roguefield:hangar:v2',
  'roguefield:hangar:v1', // the old Hangar, read when there is no v2
  'roguefield:achievements:v1',
  'roguefield:codex:v1',
  'roguefield:daily:v1',
  'roguefield:onboarding:v1',
]);

function browserStorage() {
  return typeof window === 'undefined' ? null : window.localStorage ?? null;
}

function readIndex() {
  try {
    const index = JSON.parse(browserStorage()?.getItem(SLOTS_STORAGE_KEY));
    return index && typeof index === 'object' ? index : {};
  } catch {
    return {};
  }
}

// A missing, broken or out-of-range index is slot 1: a player from before
// slots always opens on their own pilot.
function readActiveSlot() {
  const { active } = readIndex();
  return Number.isInteger(active) && active >= 1 && active <= SLOT_COUNT
    ? active
    : 1;
}

/** How many times `slot`'s pilot was deleted: a new count, a new pilot. */
export const slotDeletions = (slot) => readIndex().deleted?.[slot] ?? 0;

let activeSlot = readActiveSlot();
let loadedDeletions = slotDeletions(activeSlot);
let changedElsewhere = false;
if (typeof window !== 'undefined') {
  window.addEventListener?.('storage', ({ key }) => {
    // null: another tab cleared the whole storage.
    if (key === null || SLOT_KEYS.some((k) => slotStorageKey(k) === key)) {
      changedElsewhere = true;
    }
  });
}

/** True once another tab deleted or wrote the pilot this page holds. */
export function isPilotStale() {
  return changedElsewhere || slotDeletions(activeSlot) !== loadedDeletions;
}

/** The slot this page plays (1..SLOT_COUNT). */
export function getActiveSlot() {
  return activeSlot;
}

/** Reads the slots index again (a page load does it; tests call it). */
export function resolveActiveSlot() {
  activeSlot = readActiveSlot();
  loadedDeletions = slotDeletions(activeSlot);
  changedElsewhere = false;
  return activeSlot;
}

/** Where `key` lives for `slot`: shared keys and slot 1 are themselves. */
export function slotStorageKey(key, slot = activeSlot) {
  if (slot === 1 || !SLOT_KEYS.includes(key)) return key;
  return key.replace('roguefield:', `roguefield:slot${slot}:`);
}

/**
 * Makes `slot` the one the next page load plays; true when the browser kept
 * it (read back), false when storing it failed. The caller reloads: the
 * services read their pilot as they are built.
 */
export function chooseSlot(slot) {
  saveJSON(SLOTS_STORAGE_KEY, { ...readIndex(), active: slot });
  return readActiveSlot() === slot;
}

/**
 * Removes `slot`'s pilot: exactly its SLOT_KEYS, nothing shared. `seen`: the
 * pilot's deletion count when the player was asked; another tab that deleted
 * it since (and maybe made a new one there) leaves it be: false.
 */
export function deleteSlot(slot, seen = slotDeletions(slot)) {
  if (slotDeletions(slot) !== seen) return false;
  SLOT_KEYS.forEach((key) => {
    try {
      browserStorage()?.removeItem(slotStorageKey(key, slot));
    } catch (error) {
      console.warn(`[storage] Failed to delete "${key}":`, error);
    }
  });
  const index = readIndex();
  const deleted = { ...index.deleted, [slot]: slotDeletions(slot) + 1 };
  saveJSON(SLOTS_STORAGE_KEY, { ...index, deleted });
  return true;
}

/** `slot`: another pilot's copy of a pilot's key (the pilots screen). */
export function loadJSON(key, slot = activeSlot) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    const raw = window.localStorage.getItem(slotStorageKey(key, slot));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn(`[storage] Failed to load "${key}":`, error);
    return null;
  }
}

// A replayed run is someone else's play and a demo scene (`?content=`,
// `?profile=`) nobody's: neither keeps any progress. DifficultyService.beginRun
// holds it for such a run, the way back to the menu lets it go; settings and
// the rest of saveJSON are never held.
let progressHeld = false;

export function holdProgress(hold) {
  progressHeld = hold;
}

/** True while the run in play keeps no progress (medals, Codex, Salvage). */
export function isProgressHeld() {
  return progressHeld;
}

/** saveJSON for the pilot's progress: a key outside SLOT_KEYS is a bug. */
export function saveProgress(key, value) {
  if (!SLOT_KEYS.includes(key)) {
    throw new Error(`[storage] "${key}" is not a pilot's key (SLOT_KEYS)`);
  }
  if (!progressHeld) saveJSON(key, value);
}

export function saveJSON(key, value) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    if (SLOT_KEYS.includes(key) && isPilotStale()) return;
    window.localStorage.setItem(slotStorageKey(key), JSON.stringify(value));
  } catch (error) {
    console.warn(`[storage] Failed to save "${key}":`, error);
  }
}
