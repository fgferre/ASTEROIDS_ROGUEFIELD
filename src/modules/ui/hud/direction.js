// src/modules/ui/hud/direction.js

import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import { replay } from './hudCommon.js';

// Screen points arrive as worldToScreen gives them: 800 × 600 whatever the
// screen's aspect. Placement works in HUD units instead, square ones: the
// screen is GAME_HEIGHT tall and GAME_HEIGHT × its aspect wide (800 at 4:3),
// so angles and margins keep real proportions. `stretch` is HUD units per
// screen-point unit across.

// proposta 18/10 (PLAN R6.5): damage arcs on an ellipse just inside the
// screen edge, one per direction (hits within ~17° refresh the same arc).
export const DAMAGE_ARC_MS = 600;
const DAMAGE_ARC_MAX = 4;
const DAMAGE_ARC_MERGE = 0.3;
// The ellipse's radii, as shares of the screen's width and height.
const DAMAGE_ARC_RX = 0.46;
const DAMAGE_ARC_RY = 0.44;
// Off-screen arrows: pooled, inset from the edge, distance rounded to 10.
const EDGE_ARROW_MAX = 8;
const EDGE_ARROW_MARGIN = 28;
const EDGE_ARROW_GAP = 28;
const EDGE_ARROW_STEP = 30;

/** Screen angle (rad) from the ship to the damage source; null when unknown. */
export function damageArcAngle(ship, source, stretch = 1) {
  if (!ship || !source) return null;
  const dx = (source.x - ship.x) * stretch;
  const dy = source.y - ship.y;
  if (!(Math.hypot(dx, dy) > 1)) return null;
  return Math.atan2(dy, dx);
}

const clampToTrack = (value, min, max) =>
  min > max ? (min + max) / 2 : Math.min(max, Math.max(min, value));

/**
 * Where an off-screen marker sits for a screen point: null inside the
 * width×height view, else the point on the inset edge toward it, the
 * pointing angle and which edge ('left' | 'right' | 'top' | 'bottom').
 * `corners` ({ topLeft, topRight, bottomLeft, bottomRight } as { w, h }
 * boxes from each screen corner) keeps the point off the HUD panels by
 * sliding it along its edge.
 */
export function edgeArrow(
  point,
  width = GAME_WIDTH,
  height = GAME_HEIGHT,
  margin = EDGE_ARROW_MARGIN,
  corners = null
) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return null;
  }
  if (point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height) {
    return null;
  }
  const dx = point.x - width / 2;
  const dy = point.y - height / 2;
  const sx = (width / 2 - margin) / Math.abs(dx);
  const sy = (height / 2 - margin) / Math.abs(dy);
  const scale = Math.min(sx, sy);
  let edge = dy > 0 ? 'bottom' : 'top';
  if (sx <= sy) edge = dx > 0 ? 'right' : 'left';
  let x = width / 2 + dx * scale;
  let y = height / 2 + dy * scale;
  if (corners) {
    const { topLeft, topRight, bottomLeft, bottomRight } = corners;
    if (edge === 'left' || edge === 'right') {
      const top = edge === 'left' ? topLeft : topRight;
      const bottom = edge === 'left' ? bottomLeft : bottomRight;
      y = clampToTrack(y, top.h + margin, height - bottom.h - margin);
    } else {
      const left = edge === 'top' ? topLeft : bottomLeft;
      const right = edge === 'top' ? topRight : bottomRight;
      x = clampToTrack(x, left.w + margin, width - right.w - margin);
    }
  }
  return { x, y, angle: Math.atan2(dy, dx), edge };
}

/**
 * Keeps edgeArrow results from stacking: nearest first (`distance`, missing
 * = farthest), an arrow within EDGE_ARROW_GAP px of a placed one on the
 * same edge steps EDGE_ARROW_STEP px along it, toward the edge's middle
 * (away from the corner panel it was pushed against). Mutates the arrows.
 */
export function spreadEdgeArrows(
  arrows,
  width = GAME_WIDTH,
  height = GAME_HEIGHT
) {
  const near = (arrow) =>
    Number.isFinite(arrow.distance) ? arrow.distance : Infinity;
  const placed = [];
  for (const arrow of [...arrows].sort((a, b) => near(a) - near(b) || 0)) {
    const axis = arrow.edge === 'left' || arrow.edge === 'right' ? 'y' : 'x';
    const middle = axis === 'y' ? height / 2 : width / 2;
    const step = arrow[axis] <= middle ? EDGE_ARROW_STEP : -EDGE_ARROW_STEP;
    while (
      placed.some(
        (other) =>
          other.edge === arrow.edge &&
          Math.abs(other[axis] - arrow[axis]) < EDGE_ARROW_GAP
      )
    ) {
      arrow[axis] += step;
    }
    placed.push(arrow);
  }
  return arrows;
}

/** The damage-arc and edge-arrow element pools inside the direction layer. */
export function createDirectionPools(layer) {
  const arcPool = Array.from({ length: DAMAGE_ARC_MAX }, () => {
    const el = document.createElement('div');
    el.className = 'damage-arc';
    layer.appendChild(el);
    return { el, angle: 0, until: 0, timer: null };
  });
  const arrowPool = Array.from({ length: EDGE_ARROW_MAX }, () => {
    const el = document.createElement('div');
    el.className = 'edge-arrow';
    el.style.display = 'none';
    const glyph = document.createElement('div');
    glyph.className = 'edge-arrow__glyph';
    const label = document.createElement('div');
    label.className = 'edge-arrow__label';
    el.appendChild(glyph);
    el.appendChild(label);
    layer.appendChild(el);
    return { el, glyph, label, kind: null, color: null, text: '' };
  });
  return { arcPool, arrowPool };
}

/**
 * Red arc on the screen edge toward a hit's source (screen points of the
 * ship and the source), DAMAGE_ARC_MS long; up to DAMAGE_ARC_MAX at once.
 * Reduced motion: shown without the fade (CSS). `timers` is { later, cancel };
 * `width` the screen's in HUD units (measurePanelCorners).
 */
export function showDamageArc(
  arcPool,
  ship,
  source,
  { later, cancel },
  width = GAME_WIDTH
) {
  const angle = damageArcAngle(ship, source, width / GAME_WIDTH);
  if (angle === null || !arcPool.length) {
    return;
  }
  const now = performance.now();
  const same = arcPool.find(
    (arc) =>
      arc.until > now &&
      Math.abs(
        Math.atan2(Math.sin(arc.angle - angle), Math.cos(arc.angle - angle))
      ) < DAMAGE_ARC_MERGE
  );
  const arc =
    same ||
    arcPool.reduce((oldest, entry) =>
      entry.until < oldest.until ? entry : oldest
    );
  arc.angle = angle;
  arc.until = now + DAMAGE_ARC_MS;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const r =
    1 /
    Math.hypot(
      cos / (width * DAMAGE_ARC_RX),
      sin / (GAME_HEIGHT * DAMAGE_ARC_RY)
    );
  arc.el.style.left = `${(50 + ((cos * r) / width) * 100).toFixed(2)}%`;
  arc.el.style.top = `${(50 + ((sin * r) / GAME_HEIGHT) * 100).toFixed(2)}%`;
  arc.el.style.transform = `translate(-50%, -50%) rotate(${(angle + Math.PI / 2).toFixed(3)}rad)`;
  replay(arc.el, 'is-on');
  if (arc.timer) {
    cancel(arc.timer);
  }
  arc.timer = later(() => {
    arc.timer = null;
    arc.el.classList.remove('is-on');
  }, DAMAGE_ARC_MS);
}

/**
 * Edge arrows for targets off the screen: [{ kind: 'warden' | 'herald' |
 * 'pickup', x, y (800×600 screen point), color?, distance? }], in priority
 * order; the first EDGE_ARROW_MAX off-screen ones get an arrow. `corners`
 * is measurePanelCorners() (null while the HUD has no layout: 4:3 then).
 */
export function placeEdgeArrows(arrowPool, targets, corners) {
  const width = corners?.width ?? GAME_WIDTH;
  const stretch = width / GAME_WIDTH;
  const point = { x: 0, y: 0 };
  const shown = [];
  for (
    let i = 0;
    i < targets.length && shown.length < arrowPool.length;
    i += 1
  ) {
    point.x = targets[i].x * stretch;
    point.y = targets[i].y;
    const arrow = edgeArrow(
      point,
      width,
      GAME_HEIGHT,
      EDGE_ARROW_MARGIN,
      corners
    );
    if (arrow) {
      arrow.target = targets[i];
      arrow.distance = targets[i].distance;
      shown.push(arrow);
    }
  }
  spreadEdgeArrows(shown, width, GAME_HEIGHT);
  const used = shown.length;
  for (let i = 0; i < used; i += 1) {
    const arrow = shown[i];
    const { target } = arrow;
    const slot = arrowPool[i];
    const { el } = slot;
    if (slot.kind !== target.kind || slot.color !== target.color) {
      slot.kind = target.kind;
      slot.color = target.color;
      el.dataset.kind = target.kind;
      el.style.setProperty('--arrow-color', target.color || '');
    }
    el.dataset.edge = arrow.edge;
    el.style.left = `${((arrow.x / width) * 100).toFixed(2)}%`;
    el.style.top = `${((arrow.y / GAME_HEIGHT) * 100).toFixed(2)}%`;
    slot.glyph.style.transform = `rotate(${arrow.angle.toFixed(3)}rad)`;
    const text = Number.isFinite(target.distance)
      ? `${Math.round(target.distance / 10) * 10}m`
      : '';
    if (slot.text !== text) {
      slot.text = text;
      slot.label.textContent = text;
    }
    if (el.style.display === 'none') el.style.display = '';
  }
  for (let i = used; i < arrowPool.length; i += 1) {
    const { el } = arrowPool[i];
    if (el.style.display !== 'none') el.style.display = 'none';
  }
}

/**
 * The screen's `width` and the four corner panels as { w, h } boxes from
 * their screen corner, in HUD units (above); null while the HUD has no
 * layout (hidden). `root` holds the panels, `layer` is the full-screen
 * direction layer they are measured in.
 */
export function measurePanelCorners(root, layer) {
  const view = layer?.getBoundingClientRect?.();
  if (!view || !(view.width > 0) || !(view.height > 0)) {
    return null;
  }
  const scale = GAME_HEIGHT / view.height;
  // Every element the selector matches, joined into one box.
  const box = (selector, fromRight, fromBottom) => {
    const out = { w: 0, h: 0 };
    root.querySelectorAll(selector).forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (!(rect.width > 0)) return;
      const w = fromRight ? view.right - rect.left : rect.right - view.left;
      const h = fromBottom ? view.bottom - rect.top : rect.bottom - view.top;
      out.w = Math.max(out.w, w * scale);
      out.h = Math.max(out.h, h * scale);
    });
    return out;
  };
  return {
    width: view.width * scale,
    topLeft: box('.stats-area', false, false),
    // The kill feed hangs under the radar (its min-height holds the rows).
    topRight: box('.radar-area, .hud-feed', true, false),
    bottomLeft: box('.status-area', false, true),
    bottomRight: box('.systems-area', true, true),
  };
}
