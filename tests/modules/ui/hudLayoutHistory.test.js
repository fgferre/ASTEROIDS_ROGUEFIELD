import { describe, expect, it } from 'vitest';
import {
  COALESCE_MS,
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  commit,
  createHistory,
  redo,
  undo,
} from '../../../src/modules/ui/hud/editor/layoutHistory.js';

// A layout is any array of items; one number stands for one here.
const layout = (n) => [{ slot: 'radar', x: n }];

describe('HUD editor undo and redo', () => {
  it('undoes and redoes whole layouts, step by step', () => {
    let h = createHistory(layout(0));
    expect(canUndo(h)).toBe(false);
    h = commit(h, layout(1));
    h = commit(h, layout(2));
    h = undo(h);
    expect(h.present).toEqual(layout(1));
    h = undo(h);
    expect(h.present).toEqual(layout(0));
    expect(canUndo(h)).toBe(false);
    expect(undo(h)).toBe(h);
    h = redo(redo(h));
    expect(h.present).toEqual(layout(2));
    expect(canRedo(h)).toBe(false);
  });

  it('drops the redo steps on a new edit; an edit that changes nothing is no step', () => {
    let h = commit(commit(createHistory(layout(0)), layout(1)), layout(2));
    h = undo(h);
    expect(commit(h, layout(1))).toBe(h);
    h = commit(h, layout(5));
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toEqual(layout(1));
  });

  it('folds one gesture (same key, quick) into one step, not a slow repeat', () => {
    let h = createHistory(layout(0));
    h = commit(h, layout(1), { key: 'nudge:radar', now: 0 });
    h = commit(h, layout(2), { key: 'nudge:radar', now: 100 });
    h = commit(h, layout(3), { key: 'nudge:radar', now: 200 });
    expect(undo(h).present).toEqual(layout(0));

    h = commit(h, layout(4), { key: 'nudge:radar', now: 200 + COALESCE_MS });
    expect(undo(h).present).toEqual(layout(3));
    // Another key never folds.
    h = commit(h, layout(5), { key: 'scale:radar', now: 201 + COALESCE_MS });
    expect(undo(h).present).toEqual(layout(4));
  });

  it(`keeps the last ${HISTORY_LIMIT} steps`, () => {
    let h = createHistory(layout(0));
    for (let n = 1; n <= HISTORY_LIMIT + 10; n += 1) h = commit(h, layout(n));
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toEqual(layout(10));
  });
});
