import { describe, expect, it } from 'vitest';
import {
  anchorAt,
  hudFrame,
  itemAt,
  itemRect,
  nudgeItem,
  previewBox,
  snapLines,
  snapRect,
} from '../../../src/modules/ui/hud/editor/layoutMath.js';

const item = (anchor, x, y, scale = 1) => ({
  slot: 'radar',
  model: 'tactical',
  anchor,
  x,
  y,
  scale,
  opacity: 1,
  visible: true,
  plate: false,
});
const SIZE = { width: 200, height: 100 };
const FRAME = hudFrame(1920, 1080);

describe('HUD editor geometry', () => {
  it('keeps the instruments in a centred 16:9 frame at any window shape', () => {
    expect(hudFrame(1920, 1080)).toEqual({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
    });
    expect(hudFrame(2520, 1080)).toEqual({
      left: 300,
      top: 0,
      width: 1920,
      height: 1080,
    });
    expect(hudFrame(1440, 1080)).toEqual({
      left: 0,
      top: 0,
      width: 1440,
      height: 1080,
    });
  });

  it('draws each anchor where placeSlot puts it, scaled from the anchored edge', () => {
    expect(itemRect(item('top-left', 32, 24), FRAME, SIZE, 1)).toEqual({
      left: 32,
      top: 24,
      width: 200,
      height: 100,
    });
    expect(itemRect(item('top-right', 24, 24, 1.5), FRAME, SIZE, 1)).toEqual({
      left: 1920 - 24 - 300,
      top: 24,
      width: 300,
      height: 150,
    });
    expect(itemRect(item('bottom-center', 10, 24), FRAME, SIZE, 1)).toEqual({
      left: 960 + 10 - 100,
      top: 1080 - 24 - 100,
      width: 200,
      height: 100,
    });
    // A stretched slot spans the frame between its x insets.
    expect(
      itemRect(item('bottom-stretch', 236, 16), FRAME, SIZE, 1).width
    ).toBe(1920 - 2 * 236);
    // Offsets are px at 1080p: they grow with the HUD unit.
    expect(itemRect(item('top-left', 32, 24), FRAME, SIZE, 0.5)).toMatchObject({
      left: 16,
      top: 12,
    });
    expect(itemRect(item('screen', 0, 0), FRAME, SIZE, 1)).toBeNull();
  });

  it('re-anchors per aspect: an item keeps its distance to its own edge', () => {
    const radar = item('top-right', 24, 24);
    const right = (width) => {
      const frame = hudFrame(width, 1080);
      const rect = itemRect(radar, frame, SIZE, 1);
      return frame.left + frame.width - (rect.left + rect.width);
    };
    expect(right(1920)).toBe(24);
    expect(right(2520)).toBe(24);
    expect(right(1440)).toBe(24);
    // 21:9: inside the 16:9 frame, not at the window's edge.
    expect(itemRect(radar, hudFrame(2520, 1080), SIZE, 1).left).toBe(
      300 + 1920 - 24 - 200
    );
    // 4:3: a centred item stays centred in the narrower frame.
    const xp = itemRect(
      item('bottom-center', 0, 24),
      hudFrame(1440, 1080),
      SIZE,
      1
    );
    expect(xp.left + xp.width / 2).toBe(720);
  });

  it('drops a dragged rect on the nearest corner or edge, offsets from there', () => {
    const at = (left, top) => ({ left, top, width: 200, height: 100 });
    expect(anchorAt(at(100, 100), FRAME, 'top-right')).toBe('top-left');
    expect(anchorAt(at(860, 100), FRAME, 'top-left')).toBe('top-center');
    expect(anchorAt(at(1600, 900), FRAME, 'top-left')).toBe('bottom-right');
    expect(anchorAt(at(0, 900), FRAME, 'top-stretch')).toBe('bottom-stretch');

    const moved = itemAt(item('top-right', 24, 24), at(1600, 900), FRAME, 1);
    expect(moved).toMatchObject({ anchor: 'bottom-right', x: 120, y: 80 });
    const centred = itemAt(item('top-left', 0, 0), at(870, 24), FRAME, 1);
    expect(centred).toMatchObject({ anchor: 'top-center', x: 10, y: 24 });
    // Round trip: the item that draws at its own rect is itself.
    for (const anchor of ['top-left', 'top-right', 'bottom-center']) {
      const original = item(anchor, 40, 30, 1.2);
      const rect = itemRect(original, FRAME, SIZE, 1);
      expect(itemAt(original, rect, FRAME, 1)).toEqual(original);
    }
  });

  it('nudges right and down whatever the anchor; a stretched item only up and down', () => {
    expect(nudgeItem(item('top-left', 10, 10), 1, 1)).toMatchObject({
      x: 11,
      y: 11,
    });
    expect(nudgeItem(item('bottom-right', 10, 10), 10, 10)).toMatchObject({
      x: 0,
      y: 0,
    });
    expect(nudgeItem(item('top-stretch', 236, 16), 10, -1)).toMatchObject({
      x: 236,
      y: 15,
    });
    const onShip = item('screen', 0, 0);
    expect(nudgeItem(onShip, 5, 5)).toBe(onShip);
  });

  it('snaps to the edges, the margin, the centre lines and other instruments', () => {
    const other = { left: 400, top: 500, width: 100, height: 50 };
    const lines = snapLines(FRAME, [other], { margin: 24 });
    const rect = (left, top) => ({ left, top, width: 200, height: 100 });

    // Near the margin and with its middle near the centre line: onto both.
    const a = snapRect(rect(28, 493), lines, 8);
    expect(a.rect).toMatchObject({ left: 24, top: 490 });
    expect(a.guides).toEqual(
      expect.arrayContaining([
        { axis: 'x', at: 24, kind: 'margin' },
        { axis: 'y', at: 540, kind: 'centre' },
      ])
    );
    // Its right edge onto the other instrument's left edge.
    expect(snapRect(rect(196, 300), lines, 8).rect.left).toBe(200);
    // Out of reach: nothing moves, no guide.
    const free = snapRect(rect(600, 300), lines, 8);
    expect(free.rect).toMatchObject({ left: 600, top: 300 });
    expect(free.guides).toEqual([]);
  });

  it('snaps to the grid only where no frame line or instrument is in reach', () => {
    const other = { left: 403, top: 700, width: 100, height: 40 };
    const lines = snapLines(FRAME, [other], { margin: 24, grid: 24 });
    const rect = (left, top) => ({ left, top, width: 200, height: 100 });
    // Grid lines every 24 px: 605 → 600, 290 → 288; the grid draws no guide.
    const gridded = snapRect(rect(605, 290), lines, 8);
    expect(gridded.rect).toMatchObject({ left: 600, top: 288 });
    expect(gridded.guides).toEqual([]);
    // The instrument's edge at 403 wins over the nearer grid line at 408.
    expect(snapRect(rect(410, 290), lines, 8).rect.left).toBe(403);
  });

  it('previews another window shape at this height, fitted and centred', () => {
    expect(previewBox(null, 1920, 1080)).toEqual({
      width: 1920,
      height: 1080,
      left: 0,
      top: 0,
      scale: 1,
    });
    const wide = previewBox(21 / 9, 1920, 1080);
    expect(wide).toMatchObject({ width: 2520, height: 1080 });
    expect(wide.scale).toBeCloseTo(1920 / 2520);
    expect(wide.left).toBeCloseTo(0);
    expect(wide.top).toBeCloseTo((1080 - 1080 * wide.scale) / 2);
    expect(previewBox(4 / 3, 1920, 1080)).toMatchObject({
      width: 1440,
      scale: 1,
      left: 240,
      top: 0,
    });
  });
});
