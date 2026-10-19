// src/modules/enemies/boss/playerTarget.js
//
// Where the player is, for the Warden's aim: the enemy system's cached player
// and its position snapshot, with fallbacks to the player's own fields, and a
// one-time log for each way the lookup fails. Acts on the boss passed first
// (its system and its log flags).

import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';

export function resolvePlayerTarget(boss) {
  const player =
    boss.system && typeof boss.system.getCachedPlayer === 'function'
      ? boss.system.getCachedPlayer()
      : null;
  let position =
    boss.system && typeof boss.system.getPlayerPositionSnapshot === 'function'
      ? boss.system.getPlayerPositionSnapshot(player)
      : player?.position || null;

  if (
    (!position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)) &&
    player &&
    Number.isFinite(player.x) &&
    Number.isFinite(player.y)
  ) {
    position = { x: player.x, y: player.y };
  }

  if (
    (!position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)) &&
    player &&
    player.position &&
    Number.isFinite(player.position.x) &&
    Number.isFinite(player.position.y)
  ) {
    position = { x: player.position.x, y: player.position.y };
  }

  const logPayload = {
    hasSystem: !!boss.system,
    hasGetCachedPlayer: typeof boss.system?.getCachedPlayer === 'function',
    hasPlayer: !!player,
    hasPosition: !!position,
    playerPosition: position || player?.position || null,
  };

  if (!boss._playerResolveLogged) {
    GameDebugLogger.log('UPDATE', 'Boss resolvePlayerTarget', logPayload);
    boss._playerResolveLogged = true;
  }

  if (!player && !boss._missingPlayerReferenceLogged) {
    GameDebugLogger.log(
      'ERROR',
      'Boss resolvePlayerTarget missing player reference',
      logPayload
    );
    boss._missingPlayerReferenceLogged = true;
  } else if (player && boss._missingPlayerReferenceLogged) {
    GameDebugLogger.log(
      'STATE',
      'Boss resolvePlayerTarget player reference restored',
      {
        playerPosition: position || player?.position || null,
      }
    );
    boss._missingPlayerReferenceLogged = false;
  }

  if (!position && !boss._missingTargetLogged) {
    GameDebugLogger.log('ERROR', 'Boss could not resolve player position', {
      ...logPayload,
      playerKeys: player ? Object.keys(player) : null,
    });
    boss._missingTargetLogged = true;
  }

  return { player, position: position || null };
}
