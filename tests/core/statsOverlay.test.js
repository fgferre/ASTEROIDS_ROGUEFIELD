import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStatsOverlay } from '../../src/core/statsOverlay.js';

describe('statsOverlay', () => {
  const makeNode = () => ({ style: {} });
  let appended;

  beforeEach(() => {
    appended = [];
    vi.stubGlobal('document', {
      body: { appendChild: (node) => appended.push(node) },
    });
  });

  afterEach(() => {
    delete globalThis.Stats;
    vi.unstubAllGlobals();
  });

  it('creates nothing when off', () => {
    const overlay = createStatsOverlay({ enabled: false });
    overlay.begin();
    overlay.end();
    expect(appended.length).toBe(0);
  });

  it('creates the panel and forwards begin/end when on', () => {
    const begin = vi.fn();
    const end = vi.fn();
    globalThis.Stats = function () {
      this.dom = makeNode();
      this.showPanel = vi.fn();
      this.begin = begin;
      this.end = end;
    };
    const overlay = createStatsOverlay({ enabled: true });
    overlay.begin();
    overlay.end();
    expect(appended.length).toBe(1);
    expect(begin).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });
});
