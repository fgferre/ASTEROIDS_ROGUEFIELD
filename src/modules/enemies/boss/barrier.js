// src/modules/enemies/boss/barrier.js
//
// A boss's barrier (the Gatekeeper's lane bar, Sovereign's PROTECT walls): a
// line across the field through (x, y) along `angle`, solid outside its gap.
// The barrier object is the telegraph the view draws: { type: 'barrier', x,
// y, angle, gapAt (px along the line from x, y), gapWidth, span: [from, to]
// (the line inside the field, px along it), solid 0..1, phase
// 'warn'|'solid'|'fade', hold (s solid), timer, duration }. Solid, it hurts
// and pushes the ship away outside the gap; rocks, enemies and bullets
// ignore it.

import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';

// The ship's hull when the player does not say (px).
export const SHIP_REACH = 16;

/**
 * The stretch [from, to] of the line through (x, y) along (ux, uy) inside the
 * field, as distances from (x, y).
 */
export function fieldSpan(x, y, ux, uy) {
  let from = -Infinity;
  let to = Infinity;
  for (const [p, u, size] of [
    [x, ux, GAME_WIDTH],
    [y, uy, GAME_HEIGHT],
  ]) {
    if (Math.abs(u) < 1e-6) continue;
    const a = (0 - p) / u;
    const b = (size - p) / u;
    from = Math.max(from, Math.min(a, b));
    to = Math.min(to, Math.max(a, b));
  }
  return from < to ? [from, to] : [-GAME_WIDTH, GAME_WIDTH];
}

/**
 * The barrier's own clock: warn → solid (`hold` s) → fade (`fade` s) → gone.
 * Returns false once it is gone.
 */
export function tickBarrier(b, deltaTime, fade) {
  b.timer -= deltaTime;
  if (b.phase === 'warn' && b.timer <= 0) {
    b.phase = 'solid';
    b.solid = 1;
    b.timer = b.duration = b.hold;
  } else if (b.phase === 'solid' && b.timer <= 0) {
    b.phase = 'fade';
    b.timer = b.duration = fade;
  } else if (b.phase === 'fade') {
    b.solid = Math.max(0, b.timer / b.duration);
    if (b.timer <= 0) return false;
  }
  return true;
}

/** Where `point` is against the barrier: along the line and off it (px). */
export function barrierOffset(b, point) {
  const dx = point.x - b.x;
  const dy = point.y - b.y;
  const ux = Math.cos(b.angle);
  const uy = Math.sin(b.angle);
  return { along: dx * ux + dy * uy, off: -dx * uy + dy * ux };
}

/**
 * True when the solid barrier `b` (lines `thickness` px wide) touches `point`
 * (a ship of `reach` px).
 */
export function barrierHits(b, point, reach, thickness) {
  if (b?.phase !== 'solid') return false;
  const { along, off } = barrierOffset(b, point);
  if (Math.abs(along - b.gapAt) <= b.gapWidth / 2) return false;
  return Math.abs(off) <= thickness / 2 + reach;
}

/**
 * The solid barrier `b` of `boss` pushes the ship it touches away from the
 * line (toward the side it is on, or comes from) at `push` px/s and hurts it
 * `damageFactor` of the boss's contact damage. `params`: { thickness, push,
 * damageFactor }.
 */
export function pressBarrier(boss, b, target, params) {
  const ship = target?.position;
  const reach = target?.player?.getHullBoundingRadius?.() ?? SHIP_REACH;
  if (!ship || !barrierHits(b, ship, reach, params.thickness)) return;
  const { along, off } = barrierOffset(b, ship);
  // The normal, toward the side the ship is on (or comes from).
  const nx = -Math.sin(b.angle);
  const ny = Math.cos(b.angle);
  const velocity = target.player?.velocity;
  const moving = velocity ? velocity.vx * nx + velocity.vy * ny : 0;
  const side = Math.sign(off) || -Math.sign(moving) || 1;
  if (velocity) {
    const away = moving * side;
    const kick = Math.max(0, params.push - away) * side;
    velocity.vx += nx * kick;
    velocity.vy += ny * kick;
  }
  const ux = Math.cos(b.angle);
  const uy = Math.sin(b.angle);
  boss.system?.applyDirectDamageToPlayer?.(
    Math.round(boss.contactDamage * params.damageFactor),
    {
      cause: 'boss-barrier',
      position: { x: b.x + ux * along, y: b.y + uy * along },
      radius: params.thickness / 2 + reach,
      source: boss,
    }
  );
}
