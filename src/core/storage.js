// src/core/storage.js

// The one localStorage wrapper: JSON in and out, never throws (private mode,
// full quota and no `window` all read as "nothing stored").

export function loadJSON(key) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    const raw = window.localStorage.getItem(key);
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

/** saveJSON for progress: records, medals, Codex, Hangar, story, daily. */
export function saveProgress(key, value) {
  if (!progressHeld) saveJSON(key, value);
}

export function saveJSON(key, value) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[storage] Failed to save "${key}":`, error);
  }
}
