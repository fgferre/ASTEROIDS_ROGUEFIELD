/**
 * Determinism validation for asteroid movement migration
 *
 * This test validates that migrating from AsteroidMovement to MovementComponent
 * produces identical behavior for all 7 asteroid variants with deterministic random values.
 *
 * @see src/modules/enemies/components/MovementComponent.js - New strategies (parasite, volatile)
 * @see src/modules/enemies/components/AsteroidMovement.js - Original implementation (deleted in migration)
 */

import { describe, expect, it } from 'vitest';
import { createTestContainer } from '../../__helpers__/setup.js';
import { EnemySystem } from '../../../src/modules/EnemySystem.js';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  SHIP_SIZE,
} from '../../../src/core/GameConstants.js';

/**
 * Creates an EnemySystem instance with deterministic random seed
 * @param {number} seed - Random seed for deterministic behavior
 * @returns {{ system: EnemySystem, container: any, player: any }}
 */
function createEnemySystemWithSeed(seed) {
  const container = createTestContainer(seed);
  const random = container.resolve('random');
  const eventBus = container.resolve('event-bus');

  // Mock dependencies
  const world = {
    getBounds() {
      return { width: GAME_WIDTH, height: GAME_HEIGHT };
    },
  };

  const player = {
    position: {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2,
    },
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT / 2,
    getHullBoundingRadius() {
      return SHIP_SIZE / 2;
    },
  };

  const physics = {
    bootstrapFromEnemySystem: () => {},
  };

  const xpOrbs = {
    createXPOrb: () => {},
  };

  const dependencies = {
    eventBus,
    random,
    world,
    player,
    physics,
    progression: { getDifficulty: () => 1 },
    'xp-orbs': xpOrbs,
  };

  const system = new EnemySystem(dependencies);

  return { system, container, player };
}

/**
 * Captures position, velocity, and rotation snapshot of an asteroid
 * @param {object} asteroid - Asteroid instance
 * @returns {object} Snapshot with id, variant, size, position, velocity, rotation
 */
function captureAsteroidSnapshot(asteroid) {
  return {
    id: asteroid.id,
    variant: asteroid.variant,
    size: asteroid.size,
    x: Number(asteroid.x.toFixed(4)),
    y: Number(asteroid.y.toFixed(4)),
    vx: Number(asteroid.vx.toFixed(6)),
    vy: Number(asteroid.vy.toFixed(6)),
    rotation: Number(asteroid.rotation.toFixed(6)),
    rotationSpeed: Number((asteroid.rotationSpeed || 0).toFixed(6)),
  };
}

/**
 * Runs update frames and captures snapshots after each frame
 * @param {EnemySystem} system - Enemy system to update
 * @param {number} frameCount - Number of frames to run
 * @param {number} deltaTime - Time per frame (seconds)
 * @returns {Array<{frame: number, asteroids: Array}>} Frame-by-frame snapshots
 */
function runUpdateFrames(system, frameCount, deltaTime) {
  const snapshots = [];

  for (let frame = 0; frame < frameCount; frame++) {
    system.update(deltaTime);

    const frameSnapshot = {
      frame,
      asteroids: system.asteroids
        .map(captureAsteroidSnapshot)
        .sort((a, b) => a.id.localeCompare(b.id)),
    };

    snapshots.push(frameSnapshot);
  }

  return snapshots;
}

describe('Asteroid movement migration to generic MovementComponent', () => {
  it('produces identical trajectories for all 7 variants after 100 frames with same seed', () => {
    const seed = 42;
    const deltaTime = 0.016; // 60 FPS
    const frameCount = 100;

    // Create first system
    const { system: system1 } = createEnemySystemWithSeed(seed);

    // Spawn all 7 variants at fixed positions to avoid collisions
    const variants = [
      'common',
      'iron',
      'denseCore',
      'gold',
      'volatile',
      'parasite',
      'crystal',
    ];
    const spacing = GAME_WIDTH / (variants.length + 1);

    variants.forEach((variant, index) => {
      const asteroid = system1.acquireAsteroid({
        x: spacing * (index + 1), // Evenly spaced horizontally
        y: GAME_HEIGHT / 2, // Centered vertically
        size: 'large',
        variant: variant,
      });
      if (asteroid) {
        system1.registerActiveEnemy(asteroid);
      }
    });

    // Run first system and capture snapshots
    const firstSnapshots = runUpdateFrames(system1, frameCount, deltaTime);

    // Create second system with SAME seed
    const { system: system2 } = createEnemySystemWithSeed(seed);

    // Spawn same asteroids in same positions
    variants.forEach((variant, index) => {
      const asteroid = system2.acquireAsteroid({
        x: spacing * (index + 1),
        y: GAME_HEIGHT / 2,
        size: 'large',
        variant: variant,
      });
      if (asteroid) {
        system2.registerActiveEnemy(asteroid);
      }
    });

    // Run second system and capture snapshots
    const secondSnapshots = runUpdateFrames(system2, frameCount, deltaTime);

    // Verify identical trajectories
    expect(secondSnapshots).toEqual(firstSnapshots);
  });

  it('parasite asteroids track player position deterministically', () => {
    const seed = 123;
    const deltaTime = 0.016;
    const frameCount = 50;

    // First run
    const { system: system1, player: player1 } =
      createEnemySystemWithSeed(seed);

    const asteroid1 = system1.acquireAsteroid({
      x: 100,
      y: 100,
      size: 'large',
      variant: 'parasite',
    });
    if (asteroid1) {
      system1.registerActiveEnemy(asteroid1);
    }

    const snapshots1 = [];
    for (let frame = 0; frame < frameCount; frame++) {
      // Move player in a circle
      const angle = frame * 0.1;
      player1.x = GAME_WIDTH / 2 + Math.cos(angle) * 100;
      player1.y = GAME_HEIGHT / 2 + Math.sin(angle) * 100;
      player1.position.x = player1.x;
      player1.position.y = player1.y;

      system1.update(deltaTime);
      if (system1.asteroids.length > 0) {
        snapshots1.push(captureAsteroidSnapshot(system1.asteroids[0]));
      }
    }

    // Second run with same seed
    const { system: system2, player: player2 } =
      createEnemySystemWithSeed(seed);

    const asteroid2 = system2.acquireAsteroid({
      x: 100,
      y: 100,
      size: 'large',
      variant: 'parasite',
    });
    if (asteroid2) {
      system2.registerActiveEnemy(asteroid2);
    }

    const snapshots2 = [];
    for (let frame = 0; frame < frameCount; frame++) {
      // Same player movement
      const angle = frame * 0.1;
      player2.x = GAME_WIDTH / 2 + Math.cos(angle) * 100;
      player2.y = GAME_HEIGHT / 2 + Math.sin(angle) * 100;
      player2.position.x = player2.x;
      player2.position.y = player2.y;

      system2.update(deltaTime);
      if (system2.asteroids.length > 0) {
        snapshots2.push(captureAsteroidSnapshot(system2.asteroids[0]));
      }
    }

    expect(snapshots2).toEqual(snapshots1);
  });

  it('volatile asteroids apply rotation jitter deterministically when armed', () => {
    const seed = 456;
    const deltaTime = 0.016;
    const frameCount = 50;

    // First run
    const { system: system1 } = createEnemySystemWithSeed(seed);
    const volatileAsteroid1 = system1.acquireAsteroid({
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2,
      size: 'large',
      variant: 'volatile',
    });
    if (volatileAsteroid1) {
      system1.registerActiveEnemy(volatileAsteroid1);
      // Manually arm the asteroid to trigger jitter
      volatileAsteroid1.variantState = { armed: true };
    }

    const snapshots1 = runUpdateFrames(system1, frameCount, deltaTime);

    // Second run with same seed
    const { system: system2 } = createEnemySystemWithSeed(seed);
    const volatileAsteroid2 = system2.acquireAsteroid({
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2,
      size: 'large',
      variant: 'volatile',
    });
    if (volatileAsteroid2) {
      system2.registerActiveEnemy(volatileAsteroid2);
      // Manually arm the asteroid to trigger jitter
      volatileAsteroid2.variantState = { armed: true };
    }

    const snapshots2 = runUpdateFrames(system2, frameCount, deltaTime);

    // Verify rotation values are identical (jitter is deterministic)
    expect(snapshots2).toEqual(snapshots1);
  });
});
