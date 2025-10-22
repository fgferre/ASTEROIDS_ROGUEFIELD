// src/__tests__/physics/collision-accuracy.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SpatialHash } from '../../src/core/SpatialHash.js';

// Mock GameConstants for testing
vi.mock('../../src/core/GameConstants.js', () => ({
  PHYSICS_CELL_SIZE: 64,
  BULLET_SIZE: 2,
  ASTEROID_SIZES: {
    small: 12,
    medium: 24,
    large: 48
  },
  ASTEROID_BASE_HEALTH: {
    small: 25,
    medium: 50,
    large: 100
  },
  SHIP_SIZE: 8
}));

// Create a simplified PhysicsSystem for testing
class TestPhysicsSystem {
  constructor() {
    this.cellSize = 64;
    this.maxAsteroidRadius = 48;
    this.activeAsteroids = new Set();
    this.spatialHash = new SpatialHash(this.cellSize);
    this.performanceMetrics = {
      collisionChecks: 0,
      spatialQueries: 0
    };
  }

  registerAsteroid(asteroid) {
    if (!asteroid || asteroid.destroyed || this.activeAsteroids.has(asteroid)) {
      return;
    }

    this.activeAsteroids.add(asteroid);
    if (Number.isFinite(asteroid.x) && Number.isFinite(asteroid.y) && Number.isFinite(asteroid.radius)) {
      this.spatialHash.insert(asteroid, asteroid.x, asteroid.y, asteroid.radius);
    }
  }

  unregisterAsteroid(asteroid) {
    if (!asteroid || !this.activeAsteroids.has(asteroid)) {
      return;
    }

    this.activeAsteroids.delete(asteroid);
    this.spatialHash.remove(asteroid);
  }

  updateSpatialHash() {
    for (const asteroid of this.activeAsteroids) {
      if (!asteroid.destroyed && Number.isFinite(asteroid.x) && Number.isFinite(asteroid.y) && Number.isFinite(asteroid.radius)) {
        this.spatialHash.update(asteroid, asteroid.x, asteroid.y, asteroid.radius);
      }
    }
  }

  getNearbyAsteroids(x, y, radius) {
    this.performanceMetrics.spatialQueries++;
    const searchRadius = Math.max(radius, this.maxAsteroidRadius);
    return this.spatialHash.query(x, y, searchRadius, {
      filter: (obj) => this.activeAsteroids.has(obj) && !obj.destroyed
    });
  }

  checkCircleCollision(x1, y1, r1, x2, y2, r2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    const totalRadius = r1 + r2;
    return (dx * dx + dy * dy) <= (totalRadius * totalRadius);
  }

  forEachBulletCollision(bullets, handler) {
    if (!Array.isArray(bullets) || typeof handler !== 'function') {
      return;
    }

    const bulletRadius = 2; // BULLET_SIZE
    const maxCheckRadius = bulletRadius + this.maxAsteroidRadius;

    for (const bullet of bullets) {
      if (!bullet || bullet.hit) continue;

      const candidates = this.spatialHash.query(bullet.x, bullet.y, maxCheckRadius, {
        filter: (obj) => this.activeAsteroids.has(obj) && !obj.destroyed
      });

      this.performanceMetrics.collisionChecks += candidates.length;

      for (const asteroid of candidates) {
        if (!asteroid) continue;

        if (this.checkCircleCollision(
          bullet.x, bullet.y, bulletRadius,
          asteroid.x, asteroid.y, asteroid.radius || 0
        )) {
          handler(bullet, asteroid);
          break;
        }
      }
    }
  }

  // Legacy naive collision detection for comparison
  forEachBulletCollisionNaive(bullets, handler) {
    if (!Array.isArray(bullets) || typeof handler !== 'function') {
      return;
    }

    const bulletRadius = 2;

    for (const bullet of bullets) {
      if (!bullet || bullet.hit) continue;

      for (const asteroid of this.activeAsteroids) {
        if (!asteroid || asteroid.destroyed) continue;

        this.performanceMetrics.collisionChecks++;

        if (this.checkCircleCollision(
          bullet.x, bullet.y, bulletRadius,
          asteroid.x, asteroid.y, asteroid.radius || 0
        )) {
          handler(bullet, asteroid);
          break;
        }
      }
    }
  }

  reset() {
    this.activeAsteroids.clear();
    this.spatialHash.clear();
    this.performanceMetrics = {
      collisionChecks: 0,
      spatialQueries: 0
    };
  }
}

describe('Collision Accuracy Tests', () => {
  let physics;
  let testAsteroids;
  let testBullets;

  beforeEach(() => {
    physics = new TestPhysicsSystem();

    // Create test asteroids in a grid pattern
    testAsteroids = [];
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const asteroid = {
          id: `asteroid-${x}-${y}`,
          x: x * 100 + 50,
          y: y * 100 + 50,
          radius: 20,
          destroyed: false
        };
        testAsteroids.push(asteroid);
        physics.registerAsteroid(asteroid);
      }
    }

    // Create test bullets
    testBullets = [
      { id: 'bullet1', x: 50, y: 50, hit: false }, // Should hit asteroid at (50, 50)
      { id: 'bullet2', x: 150, y: 150, hit: false }, // Should hit asteroid at (150, 150)
      { id: 'bullet3', x: 500, y: 500, hit: false }, // Should not hit anything
      { id: 'bullet4', x: 75, y: 75, hit: false }, // Close to asteroid at (50, 50)
      { id: 'bullet5', x: 250, y: 250, hit: false } // Should hit asteroid at (250, 250)
    ];
  });

  describe('Collision Detection Accuracy', () => {
    it('should detect all collisions that naive algorithm detects', () => {
      const spatialCollisions = [];
      const naiveCollisions = [];

      // Reset performance metrics
      physics.performanceMetrics.collisionChecks = 0;

      // Test spatial hash collision detection
      physics.forEachBulletCollision(testBullets, (bullet, asteroid) => {
        spatialCollisions.push({ bulletId: bullet.id, asteroidId: asteroid.id });
      });

      const spatialChecks = physics.performanceMetrics.collisionChecks;

      // Reset for naive test
      physics.performanceMetrics.collisionChecks = 0;

      // Test naive collision detection
      physics.forEachBulletCollisionNaive(testBullets, (bullet, asteroid) => {
        naiveCollisions.push({ bulletId: bullet.id, asteroidId: asteroid.id });
      });

      const naiveChecks = physics.performanceMetrics.collisionChecks;

      // Should detect same collisions
      expect(spatialCollisions.length).toBe(naiveCollisions.length);

      // Sort for comparison
      const sortFn = (a, b) => a.bulletId.localeCompare(b.bulletId) || a.asteroidId.localeCompare(b.asteroidId);
      spatialCollisions.sort(sortFn);
      naiveCollisions.sort(sortFn);

      expect(spatialCollisions).toEqual(naiveCollisions);

      // Spatial hash should be more efficient (fewer checks)
      expect(spatialChecks).toBeLessThan(naiveChecks);

      console.log(`Spatial checks: ${spatialChecks}, Naive checks: ${naiveChecks}, Efficiency: ${((naiveChecks - spatialChecks) / naiveChecks * 100).toFixed(1)}% fewer checks`);
    });

    it('should detect exact collision with touching circles', () => {
      const bullet = { id: 'touching-bullet', x: 50, y: 72, hit: false }; // Exactly 22 units from center (20 + 2 = 22)
      const asteroid = testAsteroids[0]; // At (50, 50) with radius 20

      const collisions = [];
      physics.forEachBulletCollision([bullet], (b, a) => {
        collisions.push({ bulletId: b.id, asteroidId: a.id });
      });

      expect(collisions.length).toBe(1);
      expect(collisions[0].bulletId).toBe('touching-bullet');
    });

    it('should not detect collision with separated circles', () => {
      const bullet = { id: 'separated-bullet', x: 50, y: 73, hit: false }; // 23 units from center (> 20 + 2)

      const collisions = [];
      physics.forEachBulletCollision([bullet], (b, a) => {
        collisions.push({ bulletId: b.id, asteroidId: a.id });
      });

      expect(collisions.length).toBe(0);
    });

    it('should handle edge case of zero radius', () => {
      const zeroRadiusAsteroid = {
        id: 'zero-radius',
        x: 300,
        y: 300,
        radius: 0,
        destroyed: false
      };

      physics.registerAsteroid(zeroRadiusAsteroid);

      const bullet = { id: 'zero-test', x: 300, y: 300, hit: false }; // Exactly on top

      const collisions = [];
      physics.forEachBulletCollision([bullet], (b, a) => {
        collisions.push({ bulletId: b.id, asteroidId: a.id });
      });

      expect(collisions.length).toBe(1);
      expect(collisions[0].asteroidId).toBe('zero-radius');
    });

    it('should handle moving asteroids correctly', () => {
      const movingAsteroid = testAsteroids[0];

      // Move asteroid to new position
      movingAsteroid.x = 200;
      movingAsteroid.y = 200;

      // Update spatial hash with new position
      physics.updateSpatialHash();

      const bulletAtOldPos = { id: 'old-pos', x: 50, y: 50, hit: false };
      const bulletAtNewPos = { id: 'new-pos', x: 200, y: 200, hit: false };

      const collisions = [];
      physics.forEachBulletCollision([bulletAtOldPos, bulletAtNewPos], (b, a) => {
        collisions.push({ bulletId: b.id, asteroidId: a.id });
      });

      // Should only collide at new position
      expect(collisions.length).toBe(1);
      expect(collisions[0].bulletId).toBe('new-pos');
    });
  });

  describe('Performance Characteristics', () => {
    it('should scale better than O(n²) with many objects', () => {
      // Add many more asteroids
      const manyAsteroids = [];
      for (let i = 0; i < 100; i++) {
        const asteroid = {
          id: `perf-asteroid-${i}`,
          x: Math.random() * 1000,
          y: Math.random() * 1000,
          radius: 10 + Math.random() * 20,
          destroyed: false
        };
        manyAsteroids.push(asteroid);
        physics.registerAsteroid(asteroid);
      }

      const manyBullets = [];
      for (let i = 0; i < 50; i++) {
        manyBullets.push({
          id: `perf-bullet-${i}`,
          x: Math.random() * 1000,
          y: Math.random() * 1000,
          hit: false
        });
      }

      physics.performanceMetrics.collisionChecks = 0;
      const startTime = performance.now();

      const collisions = [];
      physics.forEachBulletCollision(manyBullets, (b, a) => {
        collisions.push({ bulletId: b.id, asteroidId: a.id });
      });

      const endTime = performance.now();
      const totalObjects = physics.activeAsteroids.size;
      const checksPerformed = physics.performanceMetrics.collisionChecks;

      // Should be much better than O(n²)
      const expectedNaiveChecks = manyBullets.length * totalObjects;
      expect(checksPerformed).toBeLessThan(expectedNaiveChecks * 0.5); // At least 50% fewer checks

      // Should complete quickly
      expect(endTime - startTime).toBeLessThan(50); // Less than 50ms

      console.log(`Performance test: ${totalObjects} asteroids, ${manyBullets.length} bullets, ${checksPerformed} checks, ${(endTime - startTime).toFixed(2)}ms`);
    });

    it('should maintain accuracy with high object density', () => {
      physics.reset();

      // Create dense grid of small asteroids
      const denseAsteroids = [];
      for (let x = 0; x < 10; x++) {
        for (let y = 0; y < 10; y++) {
          const asteroid = {
            id: `dense-${x}-${y}`,
            x: x * 20 + 10,
            y: y * 20 + 10,
            radius: 8,
            destroyed: false
          };
          denseAsteroids.push(asteroid);
          physics.registerAsteroid(asteroid);
        }
      }

      // Bullet that should hit exactly one asteroid
      const preciseBullet = { id: 'precise', x: 10, y: 10, hit: false };

      const collisions = [];
      physics.forEachBulletCollision([preciseBullet], (b, a) => {
        collisions.push({ bulletId: b.id, asteroidId: a.id });
      });

      // Should hit exactly one asteroid (the one at 10, 10)
      expect(collisions.length).toBe(1);
      expect(collisions[0].asteroidId).toBe('dense-0-0');
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle negative coordinates correctly', () => {
      const negativeAsteroid = {
        id: 'negative',
        x: -100,
        y: -100,
        radius: 15,
        destroyed: false
      };

      physics.registerAsteroid(negativeAsteroid);

      const bullet = { id: 'neg-bullet', x: -100, y: -100, hit: false };

      const collisions = [];
      physics.forEachBulletCollision([bullet], (b, a) => {
        collisions.push({ bulletId: b.id, asteroidId: a.id });
      });

      expect(collisions.length).toBe(1);
      expect(collisions[0].asteroidId).toBe('negative');
    });

    it('should handle very large coordinates', () => {
      const largeAsteroid = {
        id: 'large-coords',
        x: 10000,
        y: 10000,
        radius: 25,
        destroyed: false
      };

      physics.registerAsteroid(largeAsteroid);

      const bullet = { id: 'large-bullet', x: 10000, y: 10000, hit: false };

      const collisions = [];
      physics.forEachBulletCollision([bullet], (b, a) => {
        collisions.push({ bulletId: b.id, asteroidId: a.id });
      });

      expect(collisions.length).toBe(1);
      expect(collisions[0].asteroidId).toBe('large-coords');
    });

    it('should handle destroyed asteroids correctly', () => {
      const asteroid = testAsteroids[0];
      asteroid.destroyed = true;

      const bullet = { id: 'destroyed-test', x: asteroid.x, y: asteroid.y, hit: false };

      const collisions = [];
      physics.forEachBulletCollision([bullet], (b, a) => {
        collisions.push({ bulletId: b.id, asteroidId: a.id });
      });

      // Should not collide with destroyed asteroid
      expect(collisions.length).toBe(0);
    });

    it('should handle hit bullets correctly', () => {
      const bullet = { id: 'hit-bullet', x: 50, y: 50, hit: true };

      const collisions = [];
      physics.forEachBulletCollision([bullet], (b, a) => {
        collisions.push({ bulletId: b.id, asteroidId: a.id });
      });

      // Should not process already hit bullets
      expect(collisions.length).toBe(0);
    });
  });

  describe('Spatial Hash Integration', () => {
    it('should maintain spatial hash consistency after multiple operations', () => {
      // Perform many operations
      for (let i = 0; i < 10; i++) {
        const asteroid = {
          id: `temp-${i}`,
          x: Math.random() * 500,
          y: Math.random() * 500,
          radius: 15,
          destroyed: false
        };

        physics.registerAsteroid(asteroid);
        physics.updateSpatialHash();
        physics.unregisterAsteroid(asteroid);
      }

      // Validate spatial hash consistency
      const validation = physics.spatialHash.validate();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('should handle rapid position updates correctly', () => {
      const asteroid = testAsteroids[0];
      const originalX = asteroid.x;
      const originalY = asteroid.y;

      // Rapidly update position
      for (let i = 0; i < 100; i++) {
        asteroid.x = originalX + i;
        asteroid.y = originalY + i;
        physics.updateSpatialHash();
      }

      // Test collision at final position
      const bullet = { id: 'final-pos', x: asteroid.x, y: asteroid.y, hit: false };

      const collisions = [];
      physics.forEachBulletCollision([bullet], (b, a) => {
        collisions.push({ bulletId: b.id, asteroidId: a.id });
      });

      expect(collisions.length).toBe(1);
      expect(collisions[0].asteroidId).toBe(asteroid.id);
    });

    it('should handle cell boundary crossings correctly', () => {
      const asteroid = {
        id: 'boundary-crosser',
        x: 63, // Near cell boundary (64px cells)
        y: 63,
        radius: 10,
        destroyed: false
      };

      physics.registerAsteroid(asteroid);

      // Move across cell boundary
      asteroid.x = 65;
      asteroid.y = 65;
      physics.updateSpatialHash();

      const bullet = { id: 'boundary-bullet', x: 65, y: 65, hit: false };

      const collisions = [];
      physics.forEachBulletCollision([bullet], (b, a) => {
        collisions.push({ bulletId: b.id, asteroidId: a.id });
      });

      expect(collisions.length).toBe(1);
      expect(collisions[0].asteroidId).toBe('boundary-crosser');
    });
  });
});