// src/modules/enemies/base/playerGeometry.js
// Where the player is and how big its hull is, read from whatever shape the
// player object has (position, getPosition(), or x/y).
import { SHIP_SIZE } from '../../../core/GameConstants.js';

export function getPlayerPositionSnapshot(player) {
  if (!player) {
    return null;
  }

  if (
    player.position &&
    Number.isFinite(player.position.x) &&
    Number.isFinite(player.position.y)
  ) {
    return { x: player.position.x, y: player.position.y };
  }

  if (typeof player.getPosition === 'function') {
    const fetchedPosition = player.getPosition();
    if (
      fetchedPosition &&
      Number.isFinite(fetchedPosition.x) &&
      Number.isFinite(fetchedPosition.y)
    ) {
      return { x: fetchedPosition.x, y: fetchedPosition.y };
    }
  }

  if (Number.isFinite(player.x) && Number.isFinite(player.y)) {
    return { x: player.x, y: player.y };
  }

  return null;
}

export function getPlayerHullRadius(player) {
  if (!player) {
    return SHIP_SIZE;
  }

  const rawHullRadius =
    typeof player.getHullBoundingRadius === 'function'
      ? player.getHullBoundingRadius()
      : player.hullRadius;

  if (Number.isFinite(rawHullRadius)) {
    return Math.max(0, rawHullRadius);
  }

  return SHIP_SIZE;
}
