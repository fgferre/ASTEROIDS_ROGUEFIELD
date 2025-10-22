import { describe, expect, it } from 'vitest';
import { EnemySystem } from '../../../src/modules/EnemySystem.js';
import * as CONSTANTS from '../../../src/core/GameConstants.js';
import { createTestContainer } from '../../__helpers__/setup.js';

function createEnemySystemWithSeed(seed) {
  const container = createTestContainer(seed);
  const random = container.resolve('random');

  const world = {
    getBounds() {
      return { width: CONSTANTS.GAME_WIDTH, height: CONSTANTS.GAME_HEIGHT };
    }
  };

  const player = {
    position: { x: CONSTANTS.GAME_WIDTH / 2, y: CONSTANTS.GAME_HEIGHT / 2 },
    getHullBoundingRadius() {
      return CONSTANTS.SHIP_SIZE;
    }
  };

  const physics = {
    bootstrapFromEnemySystem: () => {},
  };

  const xpOrbs = {
    createXPOrb: () => {},
  };

  const dependencies = {
    random,
    world,
    player,
    physics,
    progression: { getDifficulty: () => 1 },
    'xp-orbs': xpOrbs,
  };

  return new EnemySystem(dependencies);
}

function detectSpawnSide(asteroid) {
  const margin = 80;
  if (Math.abs(asteroid.y + margin) < 1e-6) {
    return 'top';
  }
  if (Math.abs(asteroid.x - (CONSTANTS.GAME_WIDTH + margin)) < 1e-6) {
    return 'right';
  }
  if (Math.abs(asteroid.y - (CONSTANTS.GAME_HEIGHT + margin)) < 1e-6) {
    return 'bottom';
  }
  return 'left';
}

function summarizeAsteroid(asteroid) {
  return {
    id: asteroid.id,
    spawnSide: detectSpawnSide(asteroid),
    size: asteroid.size,
    variant: asteroid.variant,
    position: {
      x: Number(asteroid.x.toFixed(4)),
      y: Number(asteroid.y.toFixed(4))
    },
    velocity: {
      vx: Number(asteroid.vx.toFixed(6)),
      vy: Number(asteroid.vy.toFixed(6))
    }
  };
}

function snapshotRandomSeeds(system) {
  return {
    base: system.services.random?.seed ?? null,
    spawn: system.randomScopeSeeds?.spawn ?? null,
    variants: system.randomScopeSeeds?.variants ?? null,
    fragments: system.randomScopeSeeds?.fragments ?? null
  };
}

function snapshotRandomSequences(system) {
  return Object.fromEntries(
    Object.entries(system.randomSequences || {}).map(([key, value]) => [key, value])
  );
}

function captureResetSnapshot(system) {
  system.reset();
  return {
    wave: system.waveState.current,
    randomSeeds: snapshotRandomSeeds(system),
    randomSequences: snapshotRandomSequences(system),
    asteroids: system.asteroids.map(summarizeAsteroid)
  };
}

describe('EnemySystem deterministic reset behaviour', () => {
  it('produces identical spawn data on successive resets with the same seed', () => {
    const enemySystem = createEnemySystemWithSeed(123);

    const first = captureResetSnapshot(enemySystem);
    const second = captureResetSnapshot(enemySystem);

    expect(second).toEqual(first);
  });
});
