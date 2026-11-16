// src/modules/combat/volleyLanes.js
//
// How a volley spreads over its lanes (Weapons.fireStream and fireForward):
// the Multishot fan of aim points, the parallel lanes of the rank-3 battery
// and of concentrated fire. Positions only: the caller fires.

import {
  COMBAT_AIMING_UPGRADE_CONFIG,
  COMBAT_MULTISHOT_SPREAD_STEP,
  COMBAT_BULLET_RADIUS,
} from '../../data/constants/gameplay.js';

const AIMING_CONFIG = COMBAT_AIMING_UPGRADE_CONFIG || {};

// px the outer lane keeps inside the target's hit radius (radius + bullet
// radius). Measured 15/11/2026 in the headless game: 7 is the smallest margin
// at which every lane of a 3- or 4-shot volley lands on a still mite (r 9)
// and on small rocks (r 12) crossing at 70 and 180 px/s.
const LANE_MARGIN = 7;

// The gap between parallel lanes on `enemy`: the nominal spacing, shrunk so
// the outer lanes of `count` stay LANE_MARGIN inside the hit radius. Lanes
// stay evenly spaced.
function laneStep(spacing, count, enemy) {
  const reach = Math.max(
    0,
    (enemy?.radius || 16) + COMBAT_BULLET_RADIUS - LANE_MARGIN
  );
  return Math.min(spacing, (2 * reach) / (count - 1));
}

export function applyMultishotSpread(
  playerPos,
  targetPos,
  shotIndex,
  totalShots
) {
  const spreadStep = Number.isFinite(COMBAT_MULTISHOT_SPREAD_STEP)
    ? COMBAT_MULTISHOT_SPREAD_STEP
    : 0.3;
  const spreadAngle = (shotIndex - (totalShots - 1) / 2) * spreadStep;

  const dx = targetPos.x - playerPos.x;
  const dy = targetPos.y - playerPos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance === 0) return targetPos;

  const baseAngle = Math.atan2(dy, dx);
  const finalAngle = baseAngle + spreadAngle;

  return {
    x: playerPos.x + Math.cos(finalAngle) * distance,
    y: playerPos.y + Math.sin(finalAngle) * distance,
  };
}

export function computeParallelOffset(
  playerPos,
  aimPoint,
  duplicateIndex,
  duplicateCount,
  enemy
) {
  if (!Number.isFinite(duplicateCount) || duplicateCount <= 1) {
    return { x: 0, y: 0 };
  }

  const dx = aimPoint.x - playerPos.x;
  const dy = aimPoint.y - playerPos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance === 0) {
    return { x: 0, y: 0 };
  }

  const slotCenter = (duplicateCount - 1) / 2;
  const offsetIndex = duplicateIndex - slotCenter;
  if (Math.abs(offsetIndex) < 0.0001) {
    return { x: 0, y: 0 };
  }

  const spacing = AIMING_CONFIG.multiLock?.parallelSpacing ?? 10;
  const magnitude = offsetIndex * laneStep(spacing, duplicateCount, enemy);

  const perpX = (-dy / distance) * magnitude;
  const perpY = (dx / distance) * magnitude;

  return { x: perpX, y: perpY };
}

/**
 * Concentrated-fire helper extracted from the rank-3 parallel offset code path.
 *
 * Two discriminator shapes:
 *   - `{ kind: 'target', enemy, predictedAim?, fireOrigin? }` — concentrated fire on a specific enemy.
 *   - `{ kind: 'direction', angle, originPos }` — concentrated fire in a direction from an origin.
 *
 * Returns: `Array<{ fireOrigin: {x,y}, aimPoint: {x,y} }>` of length `shotCount`.
 * For shotCount=1, returns a single entry with zero perpendicular offset.
 *
 * For `kind:'target'`, both `fireOrigin` and `aimPoint` are shifted by the same
 * perpendicular vector (parallel lanes), evenly spaced by `laneStep` so the
 * outer lanes land inside the target's hit radius.
 *
 * For `kind:'direction'`, the helper does NOT consult a target — perpendicular
 * offsets use the fixed `spacing` only; aim points sit at +1000 along the angle
 * from each fireOrigin (matching the fixed-range baseline used by `fireForward`).
 *
 * Caller spawns the bullets — this helper returns positions only.
 *
 * @param {{kind: 'target', enemy: object, predictedAim?: {x,y}, fireOrigin?: {x,y}} | {kind: 'direction', angle: number, originPos: {x,y}}} input
 * @param {number} shotCount
 * @param {object} [playerStats] — reserved for future damage-aware behavior; not consumed here.
 * @returns {Array<{ fireOrigin: {x,y}, aimPoint: {x,y} }>}
 */
export function applyConcentratedFire(w, input, shotCount) {
  if (!input || typeof input !== 'object') {
    throw new Error(
      '[CombatSystem] applyConcentratedFire requires an input object with a discriminator kind'
    );
  }

  const count = Math.max(0, Math.floor(Number(shotCount) || 0));
  if (count <= 0) {
    return [];
  }

  const spacing = AIMING_CONFIG.multiLock?.parallelSpacing ?? 10;

  if (input.kind === 'target') {
    const enemy = input.enemy;
    if (!enemy) {
      return [];
    }

    const predicted = input.predictedAim || { x: enemy.x, y: enemy.y };
    const playerPos = input.fireOrigin || w.player().getPosition();

    const baseAimX = predicted.x;
    const baseAimY = predicted.y;
    const baseOriginX = playerPos.x;
    const baseOriginY = playerPos.y;

    const dx = baseAimX - baseOriginX;
    const dy = baseAimY - baseOriginY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0 || count === 1) {
      const results = [];
      for (let i = 0; i < count; i += 1) {
        results.push({
          fireOrigin: { x: baseOriginX, y: baseOriginY },
          aimPoint: { x: baseAimX, y: baseAimY },
        });
      }
      return results;
    }

    const perpX = -dy / distance;
    const perpY = dx / distance;

    const step = laneStep(spacing, count, enemy);

    const slotCenter = (count - 1) / 2;
    const results = [];
    for (let shotIndex = 0; shotIndex < count; shotIndex += 1) {
      const magnitude = (shotIndex - slotCenter) * step;

      const shotPerpX = perpX * magnitude;
      const shotPerpY = perpY * magnitude;

      results.push({
        fireOrigin: {
          x: baseOriginX + shotPerpX,
          y: baseOriginY + shotPerpY,
        },
        aimPoint: { x: baseAimX + shotPerpX, y: baseAimY + shotPerpY },
      });
    }
    return results;
  }

  if (input.kind === 'direction') {
    const angle = Number.isFinite(input.angle) ? input.angle : 0;
    const originPos = input.originPos || { x: 0, y: 0 };
    const baseOriginX = originPos.x;
    const baseOriginY = originPos.y;
    // Fix-pass (F6): `sharedOrigin` mode keeps every shot's fireOrigin
    // anchored at `originPos` and applies the perpendicular offset only to
    // the aimPoint. Used by manual aim so all multishot lanes leave from
    // the SHIP NOSE (plan must_have), fanning out to slightly offset aim
    // points rather than sliding the spawn position laterally.
    const sharedOrigin = input.sharedOrigin === true;

    const dxUnit = Math.cos(angle);
    const dyUnit = Math.sin(angle);

    // Perpendicular unit vector (no target: lanes at the nominal spacing).
    const perpX = -dyUnit;
    const perpY = dxUnit;

    const range = 1000;
    const slotCenter = (count - 1) / 2;
    const results = [];

    for (let shotIndex = 0; shotIndex < count; shotIndex += 1) {
      const offsetIndex = shotIndex - slotCenter;
      const magnitude = offsetIndex * spacing;
      const shotPerpX = perpX * magnitude;
      const shotPerpY = perpY * magnitude;

      const fireOrigin = sharedOrigin
        ? { x: baseOriginX, y: baseOriginY }
        : { x: baseOriginX + shotPerpX, y: baseOriginY + shotPerpY };
      const aimAnchorX = sharedOrigin ? baseOriginX : fireOrigin.x;
      const aimAnchorY = sharedOrigin ? baseOriginY : fireOrigin.y;
      const aimPoint = sharedOrigin
        ? {
            // Aim point fans perpendicular from the on-axis projection so
            // bullets share the origin but fly toward different lateral
            // targets. Keeping the same `range` projection as the legacy
            // path preserves muzzle-velocity magnitude per shot.
            x: aimAnchorX + dxUnit * range + shotPerpX,
            y: aimAnchorY + dyUnit * range + shotPerpY,
          }
        : {
            x: aimAnchorX + dxUnit * range,
            y: aimAnchorY + dyUnit * range,
          };
      results.push({ fireOrigin, aimPoint });
    }
    return results;
  }

  throw new Error(
    `[CombatSystem] applyConcentratedFire: invalid kind discriminator "${input.kind}"`
  );
}
