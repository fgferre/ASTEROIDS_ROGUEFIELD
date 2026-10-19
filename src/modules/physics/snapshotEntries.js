// src/modules/physics/snapshotEntries.js
//
// One enemy in a physics snapshot: the entry PhysicsSystem's exportState
// writes for it (pool id, position, motion, random seeds), and putting an
// entry back on the pooled enemy importState matches it to.

import { safeNumber, shallowClone } from '../../utils/StateManager.js';

export const ASTEROID_POOL_ID = Symbol.for(
  'ASTEROIDS_ROGUEFIELD:asteroidPoolId'
);

export function applySnapshotStateToEnemy(enemy, entry = {}) {
  if (!enemy || !entry) {
    return false;
  }

  if (Number.isFinite(entry.x)) {
    enemy.x = entry.x;
  }
  if (Number.isFinite(entry.y)) {
    enemy.y = entry.y;
  }
  if (Number.isFinite(entry.vx)) {
    enemy.vx = entry.vx;
  }
  if (Number.isFinite(entry.vy)) {
    enemy.vy = entry.vy;
  }
  if (Number.isFinite(entry.radius)) {
    enemy.radius = entry.radius;
  }
  if (Number.isFinite(entry.rotation)) {
    enemy.rotation = entry.rotation;
  }
  if (Number.isFinite(entry.rotationSpeed)) {
    enemy.rotationSpeed = entry.rotationSpeed;
  }

  if (
    entry.randomSeed != null &&
    enemy.random &&
    typeof enemy.random.reset === 'function'
  ) {
    enemy.random.reset(entry.randomSeed);
  }

  if (entry.randomScopes && typeof entry.randomScopes === 'object') {
    const randomScopesClone = shallowClone(entry.randomScopes);
    if (randomScopesClone) {
      enemy.randomScopeSeeds = randomScopesClone;
      if (typeof enemy.ensureRandomScopes === 'function') {
        enemy.ensureRandomScopes();
      }
      if (typeof enemy.reseedRandomScopes === 'function') {
        enemy.reseedRandomScopes();
      }
    }
  }

  return true;
}

export function serializeAsteroidForSnapshot(asteroid) {
  if (!asteroid || asteroid.destroyed) {
    return null;
  }

  return {
    poolId: asteroid[ASTEROID_POOL_ID] ?? null,
    id: asteroid.id ?? null,
    x: safeNumber(asteroid.x),
    y: safeNumber(asteroid.y),
    vx: safeNumber(asteroid.vx),
    vy: safeNumber(asteroid.vy),
    radius: safeNumber(asteroid.radius),
    rotation: safeNumber(asteroid.rotation),
    rotationSpeed: safeNumber(asteroid.rotationSpeed),
    randomSeed:
      asteroid.random && typeof asteroid.random.seed === 'number'
        ? asteroid.random.seed >>> 0
        : null,
    randomScopes: asteroid.randomScopeSeeds
      ? shallowClone(asteroid.randomScopeSeeds)
      : null,
  };
}
