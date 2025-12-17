/**
 * Test to validate asteroid edge wrapping behavior
 *
 * This test verifies that asteroids spawned at edges (±80px outside screen)
 * do NOT immediately wrap, and that they wrap correctly when drifting far enough.
 */

import { describe, expect, it } from 'vitest';
import { wrapScreenEdges } from '../../../src/modules/enemies/components/MovementComponent.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../../../src/core/GameConstants.js';

describe('Asteroid edge wrapping', () => {
  it('should NOT wrap asteroids spawned at edge spawn positions (±80px)', () => {
    const bounds = {
      left: 0,
      top: 0,
      right: GAME_WIDTH,
      bottom: GAME_HEIGHT,
    };

    // Test all 4 edges at spawn margin (80px outside screen)
    const testCases = [
      { name: 'top edge', x: GAME_WIDTH / 2, y: -80, radius: 40 },
      {
        name: 'right edge',
        x: GAME_WIDTH + 80,
        y: GAME_HEIGHT / 2,
        radius: 40,
      },
      {
        name: 'bottom edge',
        x: GAME_WIDTH / 2,
        y: GAME_HEIGHT + 80,
        radius: 40,
      },
      { name: 'left edge', x: -80, y: GAME_HEIGHT / 2, radius: 40 },
    ];

    testCases.forEach(({ name, x, y, radius }) => {
      const asteroid = { x, y, radius };
      const originalX = asteroid.x;
      const originalY = asteroid.y;

      wrapScreenEdges(asteroid, bounds);

      // Asteroid should NOT wrap at spawn position
      expect(asteroid.x).toBe(originalX);
      expect(asteroid.y).toBe(originalY);
    });
  });

  it('should wrap asteroids that drift beyond wrap threshold (±100px)', () => {
    const bounds = {
      left: 0,
      top: 0,
      right: GAME_WIDTH,
      bottom: GAME_HEIGHT,
    };

    const radius = 40;

    // Test wrapping at threshold (just beyond 100px margin)
    // Asteroids should wrap to wrapDestination (radius ~40px) on opposite edge
    const asteroid1 = { x: -101, y: GAME_HEIGHT / 2, radius };
    wrapScreenEdges(asteroid1, bounds);
    expect(asteroid1.x).toBe(GAME_WIDTH + radius); // Should wrap to right edge + radius

    const asteroid2 = { x: GAME_WIDTH + 101, y: GAME_HEIGHT / 2, radius };
    wrapScreenEdges(asteroid2, bounds);
    expect(asteroid2.x).toBe(-radius); // Should wrap to left edge - radius

    const asteroid3 = { x: GAME_WIDTH / 2, y: -101, radius };
    wrapScreenEdges(asteroid3, bounds);
    expect(asteroid3.y).toBe(GAME_HEIGHT + radius); // Should wrap to bottom edge + radius

    const asteroid4 = { x: GAME_WIDTH / 2, y: GAME_HEIGHT + 101, radius };
    wrapScreenEdges(asteroid4, bounds);
    expect(asteroid4.y).toBe(-radius); // Should wrap to top edge - radius
  });

  it('should use minimum 100px margin regardless of asteroid size', () => {
    const bounds = {
      left: 0,
      top: 0,
      right: GAME_WIDTH,
      bottom: GAME_HEIGHT,
    };

    // Small asteroid (radius 20) should still use 100px margin
    const smallAsteroid = { x: -80, y: GAME_HEIGHT / 2, radius: 20 };
    const originalX = smallAsteroid.x;

    wrapScreenEdges(smallAsteroid, bounds);

    // Should NOT wrap because margin is 100px (not based on radius 20)
    expect(smallAsteroid.x).toBe(originalX);
  });

  it('should handle asteroids drifting from edge spawn into screen', () => {
    const bounds = {
      left: 0,
      top: 0,
      right: GAME_WIDTH,
      bottom: GAME_HEIGHT,
    };

    // Simulate asteroid spawning at right edge and drifting left (into screen)
    const asteroid = {
      x: GAME_WIDTH + 80,
      y: GAME_HEIGHT / 2,
      radius: 40,
      vx: -100,
      vy: 0,
    };
    const deltaTime = 0.016; // 60 FPS

    // Simulate 120 frames (2 seconds) to ensure asteroid enters screen
    for (let i = 0; i < 120; i++) {
      asteroid.x += asteroid.vx * deltaTime;
      asteroid.y += asteroid.vy * deltaTime;

      const beforeX = asteroid.x;
      wrapScreenEdges(asteroid, bounds);

      // Should NOT wrap while drifting into screen (threshold is -100)
      if (asteroid.x > -100) {
        expect(asteroid.x).toBe(beforeX);
      }
    }

    // After 2 seconds at 100 px/s (200 pixels traveled), asteroid should be well inside screen
    // Started at 880, traveled 200 pixels left, should be at 680
    expect(asteroid.x).toBeGreaterThan(0);
    expect(asteroid.x).toBeLessThan(GAME_WIDTH);
  });
});
