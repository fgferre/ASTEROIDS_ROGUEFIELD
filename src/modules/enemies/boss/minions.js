// src/modules/enemies/boss/minions.js
//
// The minions the Warden summons in phase 2: when (the spawn cooldown), which
// type (minionRandom) and where (just outside the hull, patternRandom).
// updateMinionSpawns and spawnMinion act on the boss passed first and call
// spawnMinion, pickMinionType and spawnChild through it (a test replaces the
// last two); pickMinionType takes the types and the random source by name.

import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';
import { requireRandom } from '../../../utils/randomHelpers.js';

export function updateMinionSpawns(boss, deltaTime) {
  if (!boss.minionTypes.length) {
    return;
  }

  boss.spawnTimer -= deltaTime;
  if (boss.spawnTimer > 0) {
    return;
  }

  boss.spawnTimer = boss.computeSpawnCooldown();
  boss.spawnMinion();
}

export function spawnMinion(boss) {
  if (!boss.system || !boss.minionTypes.length) {
    return;
  }

  const type = boss.pickMinionType();
  if (!type) {
    return;
  }

  const angle =
    requireRandom(boss.patternRandom, 'enemy.boss.pattern').float() *
    Math.PI *
    2;
  const distance = boss.radius + 40;

  const minion = boss.spawnChild(type, {
    x: boss.x + Math.cos(angle) * distance,
    y: boss.y + Math.sin(angle) * distance,
    randomParentScope: `boss:${boss.id}`,
  });
  if (!minion) {
    console.warn(
      `[BossEnemy] Could not spawn minion of type '${type}'. Check factory configuration.`
    );
    return;
  }

  minion.addTag?.('minion');
  minion.spawnSource = 'boss-minion';
  minion.spawnedByBossId = boss.id;
  minion.isBossMinion = true;
  minion.metadata = {
    ...minion.metadata,
    spawnSource: 'boss-minion',
    spawnedByBossId: boss.id,
  };

  GameDebugLogger.log('STATE', 'Boss minion spawned', {
    bossId: boss.id,
    wave: boss.wave,
    minionId: minion.id,
    minionType: type,
    position: { x: Math.round(minion.x), y: Math.round(minion.y) },
  });
}

export function pickMinionType(minionTypes, minionRandom) {
  if (!minionTypes.length) {
    return null;
  }

  const index = requireRandom(minionRandom, 'enemy.boss.minion').int(
    0,
    minionTypes.length - 1
  );
  return minionTypes[index] || null;
}
