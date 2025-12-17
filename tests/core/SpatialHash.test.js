// src/__tests__/core/SpatialHash.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import { SpatialHash } from '../../src/core/SpatialHash.js';

describe('SpatialHash', () => {
  const createFixture = () => ({
    spatialHash: new SpatialHash(32), // 32px cell size for testing
    testObjects: {
      bullet: { id: 'bullet1', type: 'bullet' },
      asteroid: { id: 'asteroid1', type: 'asteroid' },
      player: { id: 'player1', type: 'player' },
      enemy: { id: 'enemy1', type: 'enemy' },
    },
  });

  const withInsertedObjects = () => {
    const fixture = createFixture();
    const { spatialHash, testObjects } = fixture;
    spatialHash.insert(testObjects.bullet, 50, 50, 5);
    spatialHash.insert(testObjects.asteroid, 100, 100, 15);
    spatialHash.insert(testObjects.player, 60, 60, 10);
    spatialHash.insert(testObjects.enemy, 200, 200, 12);
    return fixture;
  };

  const withRemovalSetup = () => {
    const fixture = createFixture();
    const { spatialHash, testObjects } = fixture;
    spatialHash.insert(testObjects.bullet, 50, 50, 5);
    spatialHash.insert(testObjects.asteroid, 100, 100, 15);
    return fixture;
  };

  // Optimization: describe.concurrent (independent suites)
  describe.concurrent('Constructor', () => {
    it('should create with default parameters', () => {
      const hash = new SpatialHash();
      expect(hash.baseCellSize).toBe(64);
      expect(hash.cellSize).toBe(64);
      expect(hash.maxObjects).toBe(10);
      expect(hash.maxDepth).toBe(4);
      expect(hash.dynamicResize).toBe(true);
    });

    it('should create with custom parameters', () => {
      const hash = new SpatialHash(128, {
        maxObjects: 20,
        maxDepth: 6,
        dynamicResize: false,
      });
      expect(hash.baseCellSize).toBe(128);
      expect(hash.cellSize).toBe(128);
      expect(hash.maxObjects).toBe(20);
      expect(hash.maxDepth).toBe(6);
      expect(hash.dynamicResize).toBe(false);
    });

    it('should initialize empty collections', () => {
      const { spatialHash } = createFixture();
      expect(spatialHash.grid.size).toBe(0);
      expect(spatialHash.objects.size).toBe(0);
      expect(spatialHash.objectCount).toBe(0);
    });
  });

  describe.concurrent('Insert Operations', () => {
    it('should insert object successfully', () => {
      const { spatialHash, testObjects } = createFixture();
      const result = spatialHash.insert(testObjects.bullet, 50, 50, 5);

      expect(result).toBe(true);
      expect(spatialHash.objectCount).toBe(1);
      expect(spatialHash.objects.has(testObjects.bullet)).toBe(true);

      const objectData = spatialHash.objects.get(testObjects.bullet);
      expect(objectData.x).toBe(50);
      expect(objectData.y).toBe(50);
      expect(objectData.radius).toBe(5);
    });

    it('should not insert same object twice', () => {
      const { spatialHash, testObjects } = createFixture();
      spatialHash.insert(testObjects.bullet, 50, 50, 5);
      const result = spatialHash.insert(testObjects.bullet, 60, 60, 5);

      expect(result).toBe(true); // Should update position
      expect(spatialHash.objectCount).toBe(1); // Count should not increase

      const objectData = spatialHash.objects.get(testObjects.bullet);
      expect(objectData.x).toBe(60); // Position should be updated
      expect(objectData.y).toBe(60);
    });

    it('should place objects in correct grid cells', () => {
      const { spatialHash, testObjects } = createFixture();
      spatialHash.insert(testObjects.bullet, 16, 16, 5);

      // Object at (16,16) with radius 5 should span cells (0,0)
      expect(spatialHash.grid.has('0,0')).toBe(true);
      expect(spatialHash.grid.get('0,0').has(testObjects.bullet)).toBe(true);
    });

    it('should place large objects in multiple cells', () => {
      const { spatialHash, testObjects } = createFixture();
      spatialHash.insert(testObjects.asteroid, 32, 32, 20);

      // Large object at (32,32) with radius 20 should span multiple cells
      const objectData = spatialHash.objects.get(testObjects.asteroid);
      expect(objectData.cells.size).toBeGreaterThan(1);
    });

    it('should update statistics on insert', () => {
      const { spatialHash, testObjects } = createFixture();
      const initialInsertions = spatialHash.stats.insertions;
      spatialHash.insert(testObjects.bullet, 50, 50, 5);

      expect(spatialHash.stats.insertions).toBe(initialInsertions + 1);
    });
  });

  describe.concurrent('Remove Operations', () => {
    it('should remove object successfully', () => {
      const { spatialHash, testObjects } = withRemovalSetup();
      const result = spatialHash.remove(testObjects.bullet);

      expect(result).toBe(true);
      expect(spatialHash.objectCount).toBe(1);
      expect(spatialHash.objects.has(testObjects.bullet)).toBe(false);
    });

    it('should not remove non-existent object', () => {
      const { spatialHash, testObjects } = withRemovalSetup();
      const result = spatialHash.remove(testObjects.player);

      expect(result).toBe(false);
      expect(spatialHash.objectCount).toBe(2); // No change
    });

    it('should remove object from all grid cells', () => {
      const { spatialHash, testObjects } = withRemovalSetup();
      spatialHash.remove(testObjects.asteroid);

      // Check that asteroid is removed from all cells
      for (const cell of spatialHash.grid.values()) {
        expect(cell.has(testObjects.asteroid)).toBe(false);
      }
    });

    it('should mark empty cells as dirty', () => {
      const { spatialHash, testObjects } = withRemovalSetup();
      spatialHash.remove(testObjects.bullet);
      spatialHash.remove(testObjects.asteroid);

      expect(spatialHash.dirtyCells.size).toBeGreaterThan(0);
    });

    it('should update statistics on remove', () => {
      const { spatialHash, testObjects } = withRemovalSetup();
      const initialRemovals = spatialHash.stats.removals;
      spatialHash.remove(testObjects.bullet);

      expect(spatialHash.stats.removals).toBe(initialRemovals + 1);
    });
  });

  describe.concurrent('Update Operations', () => {
    it('should update object position', () => {
      const { spatialHash, testObjects } = createFixture();
      spatialHash.insert(testObjects.bullet, 50, 50, 5);
      const result = spatialHash.update(testObjects.bullet, 100, 100, 5);

      expect(result).toBe(true);
      const objectData = spatialHash.objects.get(testObjects.bullet);
      expect(objectData.x).toBe(100);
      expect(objectData.y).toBe(100);
    });

    it('should update object size', () => {
      const { spatialHash, testObjects } = createFixture();
      spatialHash.insert(testObjects.bullet, 50, 50, 5);
      const result = spatialHash.update(testObjects.bullet, 50, 50, 10);

      expect(result).toBe(true);
      const objectData = spatialHash.objects.get(testObjects.bullet);
      expect(objectData.radius).toBe(10);
    });

    it('should handle cell changes on position update', () => {
      const { spatialHash, testObjects } = createFixture();
      spatialHash.insert(testObjects.bullet, 50, 50, 5);
      // Move object to a different cell
      spatialHash.update(testObjects.bullet, 200, 200, 5);

      const objectData = spatialHash.objects.get(testObjects.bullet);
      expect(objectData.cells.has('6,6')).toBe(true); // New cell
    });

    it('should insert non-existent object on update', () => {
      const { spatialHash, testObjects } = createFixture();
      spatialHash.insert(testObjects.bullet, 50, 50, 5);
      const result = spatialHash.update(testObjects.player, 50, 50, 8);

      expect(result).toBe(true);
      expect(spatialHash.objectCount).toBe(2);
      expect(spatialHash.objects.has(testObjects.player)).toBe(true);
    });
  });

  describe.concurrent('Query Operations', () => {
    it('should find nearby objects', () => {
      const { spatialHash, testObjects } = withInsertedObjects();
      const results = spatialHash.query(55, 55, 20);

      expect(results).toContain(testObjects.bullet);
      expect(results).toContain(testObjects.player);
      expect(results).not.toContain(testObjects.enemy); // Too far away
    });

    it('should return empty array when no objects nearby', () => {
      const { spatialHash } = withInsertedObjects();
      const results = spatialHash.query(500, 500, 10);

      expect(results).toEqual([]);
    });

    it('should respect maxResults option', () => {
      const { spatialHash } = withInsertedObjects();
      const results = spatialHash.query(0, 0, 1000, { maxResults: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should apply filter function', () => {
      const { spatialHash, testObjects } = withInsertedObjects();
      const filter = (obj) => obj.type === 'bullet';
      const results = spatialHash.query(0, 0, 1000, { filter });

      expect(results).toEqual([testObjects.bullet]);
    });

    it('should update query statistics', () => {
      const { spatialHash } = withInsertedObjects();
      const initialQueries = spatialHash.stats.queries;
      spatialHash.query(50, 50, 20);

      expect(spatialHash.stats.queries).toBe(initialQueries + 1);
      expect(spatialHash.stats.cellHits).toBeGreaterThan(0);
    });
  });

  describe.concurrent('Collision Detection', () => {
    it('should detect collision between overlapping objects', () => {
      const { spatialHash, testObjects } = createFixture();
      spatialHash.insert(testObjects.bullet, 50, 50, 5);
      spatialHash.insert(testObjects.asteroid, 55, 55, 10);
      const collision = spatialHash.checkCollision(
        testObjects.bullet,
        testObjects.asteroid
      );

      expect(collision).toBe(true);
    });

    it('should not detect collision between distant objects', () => {
      const { spatialHash, testObjects } = createFixture();
      spatialHash.insert(testObjects.bullet, 50, 50, 5);
      spatialHash.insert(testObjects.player, 100, 100, 8);
      const collision = spatialHash.checkCollision(
        testObjects.bullet,
        testObjects.player
      );

      expect(collision).toBe(false);
    });

    it('should handle non-existent objects in collision check', () => {
      const { spatialHash, testObjects } = createFixture();
      spatialHash.insert(testObjects.bullet, 50, 50, 5);
      const collision = spatialHash.checkCollision(
        testObjects.bullet,
        testObjects.enemy
      );

      expect(collision).toBe(false);
    });

    it('should find all collision pairs', () => {
      const { spatialHash, testObjects } = createFixture();
      spatialHash.insert(testObjects.bullet, 50, 50, 5);
      spatialHash.insert(testObjects.asteroid, 55, 55, 10);
      spatialHash.insert(testObjects.player, 100, 100, 8);
      const collisions = spatialHash.findAllCollisions();

      expect(collisions.length).toBeGreaterThan(0);
      const bulletAsteroidPair = collisions.find(
        (pair) =>
          pair.includes(testObjects.bullet) &&
          pair.includes(testObjects.asteroid)
      );
      expect(bulletAsteroidPair).toBeDefined();
    });

    it('should apply filter to collision detection', () => {
      const { spatialHash, testObjects } = createFixture();
      spatialHash.insert(testObjects.bullet, 50, 50, 5);
      spatialHash.insert(testObjects.asteroid, 55, 55, 10);
      spatialHash.insert(testObjects.player, 100, 100, 8);
      const filter = (objA, objB) =>
        objA.type === 'bullet' || objB.type === 'bullet';
      const collisions = spatialHash.findAllCollisions({ filter });

      expect(collisions.length).toBeGreaterThan(0);
      for (const [objA, objB] of collisions) {
        expect(objA.type === 'bullet' || objB.type === 'bullet').toBe(true);
      }
    });

    it('should call callback for each collision', () => {
      const { spatialHash, testObjects } = createFixture();
      spatialHash.insert(testObjects.bullet, 50, 50, 5);
      spatialHash.insert(testObjects.asteroid, 55, 55, 10);
      const collisionPairs = [];
      const callback = (objA, objB) => collisionPairs.push([objA, objB]);

      spatialHash.findAllCollisions({ callback });

      expect(collisionPairs.length).toBeGreaterThan(0);
    });
  });

  describe.concurrent('Bounds Calculations', () => {
    // Optimization: beforeAll instead of beforeEach (immutable setup for read-only tests)
    let calculatedBounds;
    let cellsForBounds;
    let intersectionResults;

    beforeAll(() => {
      const boundsHash = new SpatialHash(32);
      calculatedBounds = boundsHash.calculateBounds(50, 50, 10);
      cellsForBounds = boundsHash.getCellsForBounds({
        minX: 30,
        minY: 30,
        maxX: 70,
        maxY: 70,
      });
      const boundsA = { minX: 0, minY: 0, maxX: 50, maxY: 50 };
      const boundsB = { minX: 25, minY: 25, maxX: 75, maxY: 75 };
      const boundsC = { minX: 100, minY: 100, maxX: 150, maxY: 150 };
      intersectionResults = {
        ab: boundsHash.boundsIntersect(boundsA, boundsB),
        ac: boundsHash.boundsIntersect(boundsA, boundsC),
      };
    });

    it('should calculate correct bounds for object', () => {
      expect(calculatedBounds).toEqual({
        minX: 40,
        minY: 40,
        maxX: 60,
        maxY: 60,
      });
    });

    it('should get correct cells for bounds', () => {
      expect(cellsForBounds).toContain('0,0');
      expect(cellsForBounds).toContain('1,1');
      expect(cellsForBounds).toContain('2,2');
    });

    it('should detect bounds intersection correctly', () => {
      expect(intersectionResults.ab).toBe(true);
      expect(intersectionResults.ac).toBe(false);
    });
  });

  describe.concurrent('Cleanup and Maintenance', () => {
    it('should cleanup empty cells', () => {
      const { spatialHash, testObjects } = withRemovalSetup();
      spatialHash.remove(testObjects.bullet);
      spatialHash.remove(testObjects.asteroid);

      const initialCells = spatialHash.grid.size;
      spatialHash.cleanup();

      expect(spatialHash.grid.size).toBeLessThanOrEqual(initialCells);
      expect(spatialHash.dirtyCells.size).toBe(0);
    });

    it('should clear all objects', () => {
      const { spatialHash } = withRemovalSetup();
      spatialHash.clear();

      expect(spatialHash.grid.size).toBe(0);
      expect(spatialHash.objects.size).toBe(0);
      expect(spatialHash.objectCount).toBe(0);
      expect(spatialHash.dirtyCells.size).toBe(0);
    });

    it('should remove orphaned object data on cleanup', () => {
      const { spatialHash } = withRemovalSetup();
      // Manually corrupt data to test cleanup
      spatialHash.objects.set(
        { id: 'orphan' },
        { x: 0, y: 0, radius: 5, cells: new Set() }
      );
      const initialObjectCount = spatialHash.objects.size;

      spatialHash.cleanup();

      expect(spatialHash.objects.size).toBeLessThan(initialObjectCount);
    });
  });

  describe.concurrent('Dynamic Resizing', () => {
    it('should resize when cells become too crowded', () => {
      const hash = new SpatialHash(64, { maxObjects: 2 });

      // Add many objects to same area to trigger resize
      for (let i = 0; i < 10; i++) {
        hash.insert({ id: `obj${i}` }, 32 + i * 2, 32 + i * 2, 5);
      }

      // Force resize check
      hash.checkDynamicResize();

      expect(hash.stats.dynamicResizes).toBeGreaterThan(0);
    });

    it('should not resize when disabled', () => {
      const hash = new SpatialHash(64, { dynamicResize: false });
      const initialCellSize = hash.cellSize;

      // Add many objects
      for (let i = 0; i < 20; i++) {
        hash.insert({ id: `obj${i}` }, 32 + i * 2, 32 + i * 2, 5);
      }

      hash.checkDynamicResize();

      expect(hash.cellSize).toBe(initialCellSize);
      expect(hash.stats.dynamicResizes).toBe(0);
    });

    it('should preserve all objects after resize', () => {
      const hash = new SpatialHash(64);
      const objects = [];

      // Add objects
      for (let i = 0; i < 10; i++) {
        const obj = { id: `obj${i}` };
        objects.push(obj);
        hash.insert(obj, i * 10, i * 10, 5);
      }

      const initialCount = hash.objectCount;
      hash.resize(32); // Manual resize

      expect(hash.objectCount).toBe(initialCount);
      for (const obj of objects) {
        expect(hash.objects.has(obj)).toBe(true);
      }
    });
  });

  describe.concurrent('Statistics and Validation', () => {
    it('should provide comprehensive statistics', () => {
      const { spatialHash } = withRemovalSetup();
      const stats = spatialHash.getStats();

      expect(stats).toHaveProperty('objectCount');
      expect(stats).toHaveProperty('activeCells');
      expect(stats).toHaveProperty('cellSize');
      expect(stats).toHaveProperty('avgObjectsPerCell');
      expect(stats).toHaveProperty('memoryUsage');
      expect(stats).toHaveProperty('performance');
      expect(stats).toHaveProperty('efficiency');
    });

    it('should validate spatial hash integrity', () => {
      const { spatialHash } = withRemovalSetup();
      const validation = spatialHash.validate();

      expect(validation).toHaveProperty('valid');
      expect(validation).toHaveProperty('errors');
      expect(validation).toHaveProperty('stats');
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('should detect integrity violations', () => {
      const { spatialHash } = withRemovalSetup();
      // Manually corrupt the spatial hash
      spatialHash.objectCount = 999; // Wrong count

      const validation = spatialHash.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should provide meaningful toString representation', () => {
      const { spatialHash } = withRemovalSetup();
      const str = spatialHash.toString();

      expect(str).toContain('SpatialHash');
      expect(str).toContain('objects: 2');
      expect(str).toContain('cells:');
      expect(str).toContain('size: 32');
    });
  });

  describe.concurrent('Edge Cases', () => {
    it('should handle zero radius objects', () => {
      const { spatialHash, testObjects } = createFixture();
      const result = spatialHash.insert(testObjects.bullet, 50, 50, 0);

      expect(result).toBe(true);
      expect(spatialHash.objects.has(testObjects.bullet)).toBe(true);
    });

    it('should handle negative coordinates', () => {
      const { spatialHash, testObjects } = createFixture();
      const result = spatialHash.insert(testObjects.bullet, -50, -50, 10);

      expect(result).toBe(true);
      const results = spatialHash.query(-50, -50, 15);
      expect(results).toContain(testObjects.bullet);
    });

    it('should handle very large coordinates', () => {
      const { spatialHash, testObjects } = createFixture();
      const result = spatialHash.insert(testObjects.bullet, 10000, 10000, 5);

      expect(result).toBe(true);
      const results = spatialHash.query(10000, 10000, 10);
      expect(results).toContain(testObjects.bullet);
    });

    it('should handle objects with very large radius', () => {
      const { spatialHash, testObjects } = createFixture();
      const result = spatialHash.insert(testObjects.asteroid, 100, 100, 1000);

      expect(result).toBe(true);
      const objectData = spatialHash.objects.get(testObjects.asteroid);
      expect(objectData.cells.size).toBeGreaterThan(10); // Should span many cells
    });

    it('should handle empty queries gracefully', () => {
      const { spatialHash } = createFixture();
      spatialHash.clear();
      const results = spatialHash.query(50, 50, 100);

      expect(results).toEqual([]);
    });
  });

  describe.concurrent('Performance Characteristics', () => {
    it('should scale better than O(n²) for collision detection', () => {
      const spatialHash = new SpatialHash(32);
      const objects = [];

      // Add objects in a grid pattern
      for (let x = 0; x < 10; x++) {
        for (let y = 0; y < 10; y++) {
          const obj = { id: `obj${x}-${y}` };
          objects.push(obj);
          spatialHash.insert(obj, x * 50, y * 50, 8);
        }
      }

      const startTime = performance.now();
      const collisions = spatialHash.findAllCollisions();
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(50); // Should be fast
      expect(spatialHash.stats.objectChecks).toBeLessThan(
        objects.length * objects.length
      ); // Better than O(n²)
    });

    it('should maintain reasonable memory usage', () => {
      const spatialHash = new SpatialHash(32);
      // Add many objects
      for (let i = 0; i < 1000; i++) {
        spatialHash.insert(
          { id: `obj${i}` },
          Math.random() * 1000,
          Math.random() * 1000,
          5
        );
      }

      const stats = spatialHash.getStats();

      // Memory usage should be reasonable
      expect(stats.memoryUsage.gridCells).toBeLessThan(10000);
      expect(stats.memoryUsage.objectEntries).toBe(1000);
    });
  });
});
