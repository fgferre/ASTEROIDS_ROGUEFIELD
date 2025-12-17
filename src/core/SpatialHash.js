/**
 * Spatial Hash for efficient collision detection in 2D space.
 *
 * This system divides the game world into a grid of cells and tracks which objects
 * are in each cell. This reduces collision detection complexity from O(n²) to approximately
 * O(n) for most scenarios by only checking objects in nearby cells.
 *
 * @example
 * ```javascript
 * const spatialHash = new SpatialHash(64); // 64px cell size
 *
 * // Insert objects
 * spatialHash.insert(bullet, bullet.x, bullet.y, bullet.radius);
 * spatialHash.insert(asteroid, asteroid.x, asteroid.y, asteroid.radius);
 *
 * // Query nearby objects
 * const nearby = spatialHash.query(player.x, player.y, player.radius);
 *
 * // Remove objects when destroyed
 * spatialHash.remove(bullet);
 * ```
 *
 * @class SpatialHash
 */
export class SpatialHash {
  /**
   * Creates a new spatial hash.
   *
   * @param {number} [cellSize=64] - Base size of each grid cell in pixels
   * @param {Object} [options={}] - Configuration options
   * @param {number} [options.maxObjects=10] - Objects per cell before subdivision
   * @param {number} [options.maxDepth=4] - Maximum subdivision depth
   * @param {boolean} [options.dynamicResize=true] - Auto-adjust cell size based on object density
   */
  constructor(cellSize = 64, options = {}) {
    this.baseCellSize = cellSize;
    this.cellSize = cellSize;

    this.maxObjects = options.maxObjects || 10;
    this.maxDepth = options.maxDepth || 4;
    this.dynamicResize = options.dynamicResize !== false;

    /** @private @type {Map<string, Set<Object>>} Grid cells containing object sets */
    this.grid = new Map();

    /** @private @type {Map<Object, Object>} Object metadata (position, size, cells) */
    this.objects = new Map();

    /** @private @type {Set<string>} Cells that need cleanup */
    this.dirtyCells = new Set();

    /** @private @type {number} Total objects in the hash */
    this.objectCount = 0;

    /** @private @type {number} Last resize check time */
    this.lastResizeCheck = 0;

    /** @private @type {number} Resize check interval in ms */
    this.resizeCheckInterval = 2000;

    // Performance tracking
    this.stats = {
      insertions: 0,
      removals: 0,
      queries: 0,
      cellHits: 0,
      objectChecks: 0,
      dynamicResizes: 0,
    };

    // Development debugging
    if (
      typeof window !== 'undefined' &&
      process.env.NODE_ENV === 'development'
    ) {
      if (!window.__spatialHashes) {
        window.__spatialHashes = [];
      }
      window.__spatialHashes.push(this);
    }
  }

  /**
   * Inserts an object into the spatial hash.
   *
   * @param {Object} object - Object to insert
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} radius - Object radius for bounds calculation
   * @returns {boolean} True if object was inserted, false if already exists
   */
  insert(object, x, y, radius) {
    if (this.objects.has(object)) {
      // Object already exists, update position instead
      return this.update(object, x, y, radius);
    }

    const bounds = this.calculateBounds(x, y, radius);
    const cells = this.getCellsForBounds(bounds);

    // Store object metadata
    this.objects.set(object, {
      x,
      y,
      radius,
      bounds,
      cells: new Set(cells),
    });

    // Add to grid cells
    for (const cellKey of cells) {
      if (!this.grid.has(cellKey)) {
        this.grid.set(cellKey, new Set());
      }
      this.grid.get(cellKey).add(object);
    }

    this.objectCount++;
    this.stats.insertions++;

    // Check for dynamic resize periodically
    if (
      this.dynamicResize &&
      performance.now() - this.lastResizeCheck > this.resizeCheckInterval
    ) {
      this.checkDynamicResize();
    }

    return true;
  }

  /**
   * Removes an object from the spatial hash.
   *
   * @param {Object} object - Object to remove
   * @returns {boolean} True if object was removed, false if not found
   */
  remove(object) {
    const objectData = this.objects.get(object);
    if (!objectData) {
      return false;
    }

    // Remove from all cells
    for (const cellKey of objectData.cells) {
      const cell = this.grid.get(cellKey);
      if (cell) {
        cell.delete(object);

        // Mark empty cells for cleanup
        if (cell.size === 0) {
          this.dirtyCells.add(cellKey);
        }
      }
    }

    this.objects.delete(object);
    this.objectCount--;
    this.stats.removals++;

    return true;
  }

  /**
   * Updates an object's position in the spatial hash.
   *
   * @param {Object} object - Object to update
   * @param {number} x - New X position
   * @param {number} y - New Y position
   * @param {number} radius - New radius
   * @returns {boolean} True if object was updated, false if not found
   */
  update(object, x, y, radius) {
    const objectData = this.objects.get(object);
    if (!objectData) {
      // Object doesn't exist, insert it
      return this.insert(object, x, y, radius);
    }

    const newBounds = this.calculateBounds(x, y, radius);
    const newCells = this.getCellsForBounds(newBounds);
    const newCellSet = new Set(newCells);

    // Check if object moved to different cells
    const oldCells = objectData.cells;
    const cellsChanged =
      oldCells.size !== newCellSet.size ||
      [...oldCells].some((cell) => !newCellSet.has(cell));

    if (cellsChanged) {
      // Remove from old cells
      for (const cellKey of oldCells) {
        const cell = this.grid.get(cellKey);
        if (cell) {
          cell.delete(object);
          if (cell.size === 0) {
            this.dirtyCells.add(cellKey);
          }
        }
      }

      // Add to new cells
      for (const cellKey of newCells) {
        if (!this.grid.has(cellKey)) {
          this.grid.set(cellKey, new Set());
        }
        this.grid.get(cellKey).add(object);
      }
    }

    // Update object metadata
    objectData.x = x;
    objectData.y = y;
    objectData.radius = radius;
    objectData.bounds = newBounds;
    objectData.cells = newCellSet;

    return true;
  }

  /**
   * Queries for objects near a given position.
   *
   * @param {number} x - Query X position
   * @param {number} y - Query Y position
   * @param {number} radius - Query radius
   * @param {Object} [options={}] - Query options
   * @param {Function} [options.filter] - Filter function for objects
   * @param {number} [options.maxResults] - Maximum results to return
   * @returns {Array<Object>} Array of nearby objects
   */
  query(x, y, radius, options = {}) {
    const { filter, maxResults, sorted = true } = options;
    const bounds = this.calculateBounds(x, y, radius);
    const cells = this.getCellsForBounds(bounds);
    const results = new Map();

    this.stats.queries++;

    for (const cellKey of cells) {
      const cell = this.grid.get(cellKey);
      if (!cell) continue;

      this.stats.cellHits++;

      for (const object of cell) {
        if (results.has(object)) continue;

        this.stats.objectChecks++;

        // Apply filter if provided
        if (filter && !filter(object)) {
          continue;
        }

        // Check if object is actually within query bounds
        const objectData = this.objects.get(object);
        if (objectData && this.boundsIntersect(bounds, objectData.bounds)) {
          const dx = objectData.x - x;
          const dy = objectData.y - y;
          const distanceSq = dx * dx + dy * dy;
          results.set(object, distanceSq);
        }
      }
    }

    if (!sorted && !maxResults) {
      return Array.from(results.keys());
    }

    const sortedEntries = Array.from(results.entries()).sort(
      (a, b) => a[1] - b[1]
    );

    const objects = sortedEntries.map(([object]) => object);

    if (maxResults) {
      return objects.slice(0, maxResults);
    }

    return objects;
  }

  /**
   * Performs precise collision detection between two objects.
   *
   * @param {Object} objA - First object
   * @param {Object} objB - Second object
   * @returns {boolean} True if objects are colliding
   */
  checkCollision(objA, objB) {
    const dataA = this.objects.get(objA);
    const dataB = this.objects.get(objB);

    if (!dataA || !dataB) return false;

    // Calculate distance between centers
    const dx = dataA.x - dataB.x;
    const dy = dataA.y - dataB.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Check if distance is less than sum of radii
    return distance < dataA.radius + dataB.radius;
  }

  /**
   * Finds all collision pairs efficiently.
   *
   * @param {Object} [options={}] - Query options
   * @param {Function} [options.filter] - Filter function for objects
   * @param {Function} [options.callback] - Callback for each collision pair
   * @returns {Array<Array<Object>>} Array of collision pairs [objA, objB]
   */
  findAllCollisions(options = {}) {
    const collisions = [];
    const checked = new Set();

    for (const [cellKey, cell] of this.grid.entries()) {
      if (cell.size < 2) continue;

      const objects = Array.from(cell);

      for (let i = 0; i < objects.length; i++) {
        for (let j = i + 1; j < objects.length; j++) {
          const objA = objects[i];
          const objB = objects[j];

          // Create unique pair key
          const pairKey = objA < objB ? `${objA}-${objB}` : `${objB}-${objA}`;
          if (checked.has(pairKey)) continue;
          checked.add(pairKey);

          // Apply filter if provided
          if (options.filter && !options.filter(objA, objB)) {
            continue;
          }

          // Check actual collision
          if (this.checkCollision(objA, objB)) {
            const pair = [objA, objB];
            collisions.push(pair);

            // Call callback if provided
            if (options.callback) {
              options.callback(objA, objB);
            }
          }
        }
      }
    }

    return collisions;
  }

  /**
   * Cleans up empty cells and optimizes memory usage.
   */
  cleanup() {
    // Remove empty cells
    for (const cellKey of this.dirtyCells) {
      const cell = this.grid.get(cellKey);
      if (cell && cell.size === 0) {
        this.grid.delete(cellKey);
      }
    }
    this.dirtyCells.clear();

    // Remove orphaned object data (shouldn't happen but safety check)
    for (const [object, data] of this.objects.entries()) {
      let found = false;
      for (const cellKey of data.cells) {
        const cell = this.grid.get(cellKey);
        if (cell && cell.has(object)) {
          found = true;
          break;
        }
      }
      if (!found) {
        this.objects.delete(object);
        this.objectCount--;
      }
    }
  }

  /**
   * Clears all objects from the spatial hash.
   */
  clear() {
    this.grid.clear();
    this.objects.clear();
    this.dirtyCells.clear();
    this.objectCount = 0;
  }

  /**
   * Calculates bounding box for an object.
   *
   * @private
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} radius - Object radius
   * @returns {Object} Bounding box {minX, minY, maxX, maxY}
   */
  calculateBounds(x, y, radius) {
    return {
      minX: x - radius,
      minY: y - radius,
      maxX: x + radius,
      maxY: y + radius,
    };
  }

  /**
   * Gets all grid cell keys that intersect with given bounds.
   *
   * @private
   * @param {Object} bounds - Bounding box
   * @returns {Array<string>} Array of cell keys
   */
  getCellsForBounds(bounds) {
    const cells = [];

    const startX = Math.floor(bounds.minX / this.cellSize);
    const endX = Math.floor(bounds.maxX / this.cellSize);
    const startY = Math.floor(bounds.minY / this.cellSize);
    const endY = Math.floor(bounds.maxY / this.cellSize);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        cells.push(`${x},${y}`);
      }
    }

    return cells;
  }

  /**
   * Checks if two bounding boxes intersect.
   *
   * @private
   * @param {Object} boundsA - First bounding box
   * @param {Object} boundsB - Second bounding box
   * @returns {boolean} True if bounds intersect
   */
  boundsIntersect(boundsA, boundsB) {
    return !(
      boundsA.maxX < boundsB.minX ||
      boundsB.maxX < boundsA.minX ||
      boundsA.maxY < boundsB.minY ||
      boundsB.maxY < boundsA.minY
    );
  }

  /**
   * Checks if dynamic resize is needed and performs it.
   *
   * @private
   */
  checkDynamicResize() {
    this.lastResizeCheck = performance.now();

    if (this.objectCount === 0) return;

    // Calculate average objects per cell
    const activeCells = this.grid.size;
    if (activeCells === 0) return;

    const avgObjectsPerCell = this.objectCount / activeCells;

    // Resize if average is too high or too low
    let newCellSize = this.cellSize;

    if (avgObjectsPerCell > this.maxObjects * 1.5) {
      // Too crowded, make cells smaller
      newCellSize = Math.max(this.baseCellSize * 0.5, this.cellSize * 0.8);
    } else if (avgObjectsPerCell < this.maxObjects * 0.3 && activeCells > 20) {
      // Too sparse, make cells larger
      newCellSize = Math.min(this.baseCellSize * 2, this.cellSize * 1.25);
    }

    if (Math.abs(newCellSize - this.cellSize) > 1) {
      this.resize(newCellSize);
    }
  }

  /**
   * Resizes the spatial hash with a new cell size.
   *
   * @param {number} newCellSize - New cell size
   */
  resize(newCellSize) {
    if (newCellSize === this.cellSize) return;

    // Store all objects temporarily
    const tempObjects = [];
    for (const [object, data] of this.objects.entries()) {
      tempObjects.push({ object, ...data });
    }

    // Clear and resize
    this.clear();
    this.cellSize = newCellSize;

    // Re-insert all objects
    for (const { object, x, y, radius } of tempObjects) {
      this.insert(object, x, y, radius);
    }

    this.stats.dynamicResizes++;

    if (process.env.NODE_ENV === 'development') {
      console.debug(
        `[SpatialHash] Resized to cell size ${newCellSize} (objects: ${this.objectCount})`
      );
    }
  }

  /**
   * Gets comprehensive statistics about the spatial hash.
   *
   * @returns {Object} Statistics object
   */
  getStats() {
    const activeCells = this.grid.size;
    const totalCellObjects = Array.from(this.grid.values()).reduce(
      (sum, cell) => sum + cell.size,
      0
    );

    return {
      objectCount: this.objectCount,
      activeCells,
      cellSize: this.cellSize,
      avgObjectsPerCell:
        activeCells > 0 ? (totalCellObjects / activeCells).toFixed(2) : 0,
      memoryUsage: {
        gridCells: this.grid.size,
        objectEntries: this.objects.size,
        dirtyCells: this.dirtyCells.size,
      },
      performance: { ...this.stats },
      efficiency: {
        queryHitRate:
          this.stats.queries > 0
            ? ((this.stats.cellHits / this.stats.queries) * 100).toFixed(1) +
              '%'
            : '0%',
        avgChecksPerQuery:
          this.stats.queries > 0
            ? (this.stats.objectChecks / this.stats.queries).toFixed(1)
            : '0',
      },
    };
  }

  /**
   * Validates the spatial hash integrity.
   *
   * @returns {Object} Validation result
   */
  validate() {
    const errors = [];

    // Check object count consistency
    let actualObjectCount = 0;
    const objectsInCells = new Set();

    for (const cell of this.grid.values()) {
      for (const object of cell) {
        objectsInCells.add(object);
      }
    }

    actualObjectCount = objectsInCells.size;

    if (actualObjectCount !== this.objectCount) {
      errors.push(
        `Object count mismatch: stored ${this.objectCount}, actual ${actualObjectCount}`
      );
    }

    // Check object metadata consistency
    for (const [object, data] of this.objects.entries()) {
      if (!objectsInCells.has(object)) {
        errors.push(`Object in metadata but not in any cell: ${object}`);
      }

      // Verify object is in correct cells
      const expectedCells = this.getCellsForBounds(data.bounds);
      const actualCells = Array.from(data.cells);

      if (
        expectedCells.length !== actualCells.length ||
        expectedCells.some((cell) => !data.cells.has(cell))
      ) {
        errors.push(`Object in wrong cells: ${object}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      stats: this.getStats(),
    };
  }

  /**
   * Creates a string representation for debugging.
   *
   * @returns {string} Debug string
   */
  toString() {
    const stats = this.getStats();
    return `SpatialHash[objects: ${stats.objectCount}, cells: ${stats.activeCells}, size: ${stats.cellSize}]`;
  }
}

// Development tools
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.__spatialHashDebug = {
    getAllHashes: () => window.__spatialHashes || [],
    getHashStats: () =>
      (window.__spatialHashes || []).map((hash) => hash.getStats()),
    validateAllHashes: () =>
      (window.__spatialHashes || []).map((hash) => hash.validate()),
  };
}
