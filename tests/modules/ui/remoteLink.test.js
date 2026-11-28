import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playRemoteLink } from '../../../src/modules/ui/remoteLink.js';
import { inputLayers } from '../../../src/modules/input/inputLayers.js';

// Just enough of a page for the link's static and lines.
const node = () => ({
  style: { setProperty() {} },
  classList: { add() {}, remove() {} },
  append() {},
  addEventListener() {},
  remove() {},
  getContext: () => ({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
  }),
  toDataURL: () => 'data:,',
});

describe('remote link', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', {
      createElement: node,
      body: { append() {}, classList: { add() {}, remove() {} } },
    });
    // The skip key's listener (skipHold.js).
    vi.stubGlobal('window', {
      addEventListener() {},
      removeEventListener() {},
      requestAnimationFrame: () => 1,
      cancelAnimationFrame() {},
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps Settings closed while it plays: it is drawn over every screen', () => {
    const onConnect = vi.fn();
    playRemoteLink({ lines: [], onConnect });
    expect(inputLayers.passes('openSettings')).toBe(false);
    vi.runAllTimers();
    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(inputLayers.passes('openSettings')).toBe(true);
  });

  it('keeps the menu under it from taking input until the run starts', () => {
    const menu = { inert: false };
    const button = { ...node(), closest: () => menu };
    let inertAtConnect = null;
    const onConnect = () => (inertAtConnect = menu.inert);
    playRemoteLink({ lines: [['WAKE · REMOTE LINK']], button, onConnect });
    expect(menu.inert).toBe(true);
    vi.advanceTimersByTime(1400);
    expect(inertAtConnect).toBe(false);
  });
});
