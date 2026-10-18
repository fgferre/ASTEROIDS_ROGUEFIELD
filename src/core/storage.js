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
