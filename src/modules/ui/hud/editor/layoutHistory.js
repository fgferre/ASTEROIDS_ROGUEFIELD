// src/modules/ui/hud/editor/layoutHistory.js
//
// The HUD editor's undo and redo over whole layouts (arrays of items, never
// mutated): every edit commits the layout it produced. Edits with the same
// `key` less than COALESCE_MS apart fold into one step — a run of arrow-key
// nudges, one slider drag — so one undo takes the whole gesture back.

export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 800;

/** Two layouts that draw the same. */
export function sameLayout(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A history standing at `present`, nothing to undo or redo. */
export function createHistory(present) {
  return { past: [], present, future: [], key: null, at: -Infinity };
}

/**
 * `next` becomes the present; the old one goes to the past unless this edit
 * folds into the last (same `key`, within COALESCE_MS of `now`). A commit
 * that changes nothing is no step; any commit drops the redo steps.
 */
export function commit(history, next, { key = null, now = 0 } = {}) {
  if (sameLayout(next, history.present)) return history;
  const fold =
    key !== null && key === history.key && now - history.at < COALESCE_MS;
  const past = fold
    ? history.past
    : [...history.past, history.present].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [], key, at: now };
}

export const canUndo = (history) => history.past.length > 0;
export const canRedo = (history) => history.future.length > 0;

/** One step back; the present waits in the redo steps. */
export function undo(history) {
  if (!canUndo(history)) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
    key: null,
    at: -Infinity,
  };
}

/** The step undone last, again. */
export function redo(history) {
  if (!canRedo(history)) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
    key: null,
    at: -Infinity,
  };
}
