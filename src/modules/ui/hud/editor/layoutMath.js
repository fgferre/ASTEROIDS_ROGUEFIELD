// src/modules/ui/hud/editor/layoutMath.js
//
// The HUD editor's geometry, in the HUD layer's pixels (the window's, before
// a preview scales it): where the instruments' 16:9 frame sits in a window,
// where a layout item draws in it, the item that draws at a rect (anchored
// again to the nearest corner or edge, as World of Warcraft's Edit Mode
// does), nudges, snapping and the window shapes a preview stands for.
// `unit` is the HUD's --hud-u: item offsets are px at a 1080p window × unit.
// A rect is { left, top, width, height }.

/** The instruments' frame is 16:9 at most (hudStyles.js, .hud-frame). */
export const FRAME_ASPECT = 16 / 9;

/** The frame switcher: the real window, then the shapes it previews. */
export const PREVIEW_ASPECTS = Object.freeze([
  { id: 'window', label: 'Window', ratio: null },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '21:9', label: '21:9', ratio: 21 / 9 },
  { id: '16:10', label: '16:10', ratio: 16 / 10 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
]);

// Item offsets are whole px; Math.round(-0.4) is -0, which reads as 0.
const whole = (n) => Math.round(n) || 0;

/** The instruments' frame in a `width` × `height` window: centred, 16:9 at most. */
export function hudFrame(width, height) {
  const frameWidth = Math.min(width, height * FRAME_ASPECT);
  return { left: (width - frameWidth) / 2, top: 0, width: frameWidth, height };
}

/**
 * Where an item draws in `frame` (registry.js placeSlot): `size` is its
 * slot's unscaled box (a stretched slot's width comes from the frame), and
 * the scale grows it from the anchored edge. 'screen' items have no rect.
 */
export function itemRect({ anchor, x, y, scale = 1 }, frame, size, unit) {
  if (anchor === 'screen') return null;
  const [vertical, horizontal] = anchor.split('-');
  const boxWidth =
    horizontal === 'stretch'
      ? Math.max(0, frame.width - 2 * x * unit)
      : size.width;
  const width = boxWidth * scale;
  const height = size.height * scale;
  let left;
  if (horizontal === 'left') left = frame.left + x * unit;
  else if (horizontal === 'right') {
    left = frame.left + frame.width - x * unit - width;
  } else {
    const shift = horizontal === 'center' ? x * unit : 0;
    left = frame.left + frame.width / 2 + shift - width / 2;
  }
  const top =
    vertical === 'top'
      ? frame.top + y * unit
      : frame.top + frame.height - y * unit - height;
  return { left, top, width, height };
}

/**
 * The anchor for a rect in the frame: top or bottom by its half, left,
 * centre or right by its third; a stretched item stays stretched.
 */
export function anchorAt(rect, frame, current) {
  const cx = rect.left + rect.width / 2 - frame.left;
  const cy = rect.top + rect.height / 2 - frame.top;
  const vertical = cy < frame.height / 2 ? 'top' : 'bottom';
  if (current.endsWith('-stretch')) return `${vertical}-stretch`;
  const third = frame.width / 3;
  let horizontal = 'center';
  if (cx < third) horizontal = 'left';
  else if (cx > frame.width - third) horizontal = 'right';
  return `${vertical}-${horizontal}`;
}

/**
 * The item that draws at `rect` (same size), anchored again by anchorAt:
 * the offsets are measured from its new corner or edge, so it keeps its
 * distance to that edge in any window.
 */
export function itemAt(item, rect, frame, unit) {
  if (item.anchor === 'screen') return item;
  const anchor = anchorAt(rect, frame, item.anchor);
  const [vertical, horizontal] = anchor.split('-');
  const right = frame.left + frame.width;
  const bottom = frame.top + frame.height;
  let { x } = item;
  if (horizontal === 'left') x = (rect.left - frame.left) / unit;
  else if (horizontal === 'right') x = (right - rect.left - rect.width) / unit;
  else if (horizontal === 'center') {
    x = (rect.left + rect.width / 2 - frame.left - frame.width / 2) / unit;
  }
  const y =
    vertical === 'top'
      ? (rect.top - frame.top) / unit
      : (bottom - rect.top - rect.height) / unit;
  return { ...item, anchor, x: whole(x), y: whole(y) };
}

/**
 * `item` moved `dx`, `dy` px at a 1080p window (right and down are
 * positive) whatever its anchor; a stretched item only moves up and down,
 * one on the ship not at all.
 */
export function nudgeItem(item, dx, dy) {
  if (item.anchor === 'screen') return item;
  const [vertical, horizontal] = item.anchor.split('-');
  let { x } = item;
  if (horizontal === 'right') x -= dx;
  else if (horizontal !== 'stretch') x += dx;
  const y = vertical === 'top' ? item.y + dy : item.y - dy;
  return { ...item, x, y };
}

/**
 * The lines a dragged rect snaps to: the frame's edges, the margin inside
 * them, its centre lines, each of `others`' edges and centre, and the grid
 * when `grid` > 0. `xs` are vertical lines, `ys` horizontal ones.
 */
export function snapLines(frame, others, { margin = 0, grid = 0 } = {}) {
  const xs = [];
  const ys = [];
  const right = frame.left + frame.width;
  const bottom = frame.top + frame.height;
  const add = (list, kind, ...ats) =>
    ats.forEach((at) => list.push({ at, kind }));
  add(xs, 'edge', frame.left, right);
  add(ys, 'edge', frame.top, bottom);
  if (margin > 0) {
    add(xs, 'margin', frame.left + margin, right - margin);
    add(ys, 'margin', frame.top + margin, bottom - margin);
  }
  add(xs, 'centre', frame.left + frame.width / 2);
  add(ys, 'centre', frame.top + frame.height / 2);
  for (const r of others) {
    add(xs, 'item', r.left, r.left + r.width / 2, r.left + r.width);
    add(ys, 'item', r.top, r.top + r.height / 2, r.top + r.height);
  }
  if (grid > 0) {
    for (let at = frame.left; at <= right + 0.5; at += grid)
      add(xs, 'grid', at);
    for (let at = frame.top; at <= bottom + 0.5; at += grid)
      add(ys, 'grid', at);
  }
  return { xs, ys };
}

// The nearest line to any of `edges` within `threshold`: the frame, its
// centre and the other instruments win over the grid.
function nearest(edges, lines, threshold) {
  let best = null;
  for (const line of lines) {
    for (const edge of edges) {
      const d = line.at - edge;
      if (Math.abs(d) > threshold) continue;
      const grid = line.kind === 'grid';
      if (
        !best ||
        (best.grid && !grid) ||
        (best.grid === grid && Math.abs(d) < Math.abs(best.d))
      ) {
        best = { d, grid };
      }
    }
  }
  return best ? best.d : 0;
}

const xEdges = (r) => [r.left, r.left + r.width / 2, r.left + r.width];
const yEdges = (r) => [r.top, r.top + r.height / 2, r.top + r.height];

/**
 * `rect` pulled onto the nearest line on each axis within `threshold` px
 * (its left, centre or right edge; its top, middle or bottom), and the
 * guides to draw: every line but the grid's it now touches.
 */
export function snapRect(rect, lines, threshold) {
  const snapped = {
    ...rect,
    left: rect.left + nearest(xEdges(rect), lines.xs, threshold),
    top: rect.top + nearest(yEdges(rect), lines.ys, threshold),
  };
  const guides = [];
  const touch = (axis, edges, list) => {
    for (const line of list) {
      if (line.kind === 'grid') continue;
      if (!edges.some((edge) => Math.abs(edge - line.at) < 0.5)) continue;
      if (guides.some((g) => g.axis === axis && Math.abs(g.at - line.at) < 1))
        continue;
      guides.push({ axis, at: line.at, kind: line.kind });
    }
  };
  touch('x', xEdges(snapped), lines.xs);
  touch('y', yEdges(snapped), lines.ys);
  return { rect: snapped, guides };
}

/**
 * A preview of a window `ratio` wide (as tall as the real one, so the HUD's
 * unit stays the same) fitted into the real `viewWidth` × `viewHeight`
 * window and centred; no ratio is the real window itself.
 */
export function previewBox(ratio, viewWidth, viewHeight) {
  if (!ratio) {
    return { width: viewWidth, height: viewHeight, left: 0, top: 0, scale: 1 };
  }
  const width = Math.round(viewHeight * ratio);
  const height = viewHeight;
  const scale = Math.min(1, viewWidth / width, viewHeight / height);
  return {
    width,
    height,
    scale,
    left: (viewWidth - width * scale) / 2,
    top: (viewHeight - height * scale) / 2,
  };
}
