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

// A replayed run is someone else's play: nothing is saved while it lasts
// (DifficultyService.beginRun holds saves for it).
let savesHeld = false;

export function holdSaves(hold) {
  savesHeld = hold;
}

export function saveJSON(key, value) {
  try {
    if (savesHeld || typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[storage] Failed to save "${key}":`, error);
  }
}
