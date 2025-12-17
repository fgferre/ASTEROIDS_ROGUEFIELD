/**
 * Batch Rendering System for optimizing canvas draw calls
 * Groups similar rendering operations to reduce context state changes
 */

const MAX_BATCH_SIZE = 1000;
const REUSE_THRESHOLD = 0.8; // Reuse batch if 80% similar

class RenderBatch {
  constructor() {
    // State management
    this.currentState = {
      fillStyle: null,
      strokeStyle: null,
      lineWidth: null,
      globalAlpha: null,
      shadowBlur: null,
      shadowColor: null,
      globalCompositeOperation: null,
    };

    // Batch collections
    this.batches = new Map();
    this.activeBatch = null;

    // Performance tracking
    this.stats = {
      totalDrawCalls: 0,
      batchedDrawCalls: 0,
      stateChanges: 0,
      savedStates: 0,
    };

    // Cache for common patterns
    this.gradientCache = new Map();
    this.pathCache = new Map();

    console.log('[RenderBatch] Initialized');
  }

  /**
   * Start a new batch operation
   */
  beginBatch(type, state = {}) {
    const batchKey = this.generateBatchKey(type, state);

    if (!this.batches.has(batchKey)) {
      this.batches.set(batchKey, {
        type,
        state: { ...state },
        operations: [],
        key: batchKey,
        reused: 0,
      });
    }

    this.activeBatch = this.batches.get(batchKey);
    this.activeBatch.operations.length = 0; // Clear previous operations

    return this.activeBatch;
  }

  /**
   * Add a draw operation to current batch
   */
  addOperation(operation) {
    if (!this.activeBatch) {
      console.warn('[RenderBatch] No active batch - operation ignored');
      return;
    }

    if (this.activeBatch.operations.length >= MAX_BATCH_SIZE) {
      this.flushBatch();
      return;
    }

    this.activeBatch.operations.push(operation);
  }

  /**
   * Add circle drawing operation
   */
  addCircle(x, y, radius, fillStyle = null, strokeStyle = null) {
    this.addOperation({
      type: 'circle',
      x,
      y,
      radius,
      fillStyle,
      strokeStyle,
    });
  }

  /**
   * Add line drawing operation
   */
  addLine(x1, y1, x2, y2, strokeStyle = null, lineWidth = null) {
    this.addOperation({
      type: 'line',
      x1,
      y1,
      x2,
      y2,
      strokeStyle,
      lineWidth,
    });
  }

  /**
   * Add rectangle drawing operation
   */
  addRect(x, y, width, height, fillStyle = null, strokeStyle = null) {
    this.addOperation({
      type: 'rect',
      x,
      y,
      width,
      height,
      fillStyle,
      strokeStyle,
    });
  }

  /**
   * Add path drawing operation
   */
  addPath(pathData, fillStyle = null, strokeStyle = null) {
    this.addOperation({
      type: 'path',
      pathData,
      fillStyle,
      strokeStyle,
    });
  }

  /**
   * Execute all batched operations
   */
  flushBatch(ctx) {
    if (!this.activeBatch || !ctx) {
      return;
    }

    const batch = this.activeBatch;
    const operations = batch.operations;

    if (operations.length === 0) {
      return;
    }

    // Apply batch state once
    this.applyState(ctx, batch.state);

    // Group operations by type for better batching
    const grouped = this.groupOperations(operations);

    // Execute grouped operations
    for (const [type, ops] of grouped) {
      this.executeOperationGroup(ctx, type, ops);
    }

    // Update stats
    this.stats.batchedDrawCalls += operations.length;
    this.stats.totalDrawCalls += operations.length;
    batch.reused++;

    // Clear batch
    this.activeBatch = null;
  }

  /**
   * Group operations by type and similar properties
   */
  groupOperations(operations) {
    const groups = new Map();

    for (const op of operations) {
      const groupKey = this.getOperationGroupKey(op);

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }

      groups.get(groupKey).push(op);
    }

    return groups;
  }

  /**
   * Execute a group of similar operations efficiently
   */
  executeOperationGroup(ctx, groupKey, operations) {
    const [type, fillStyle, strokeStyle, lineWidth] = groupKey.split('|');

    // Set styles once for the group
    let needsFill = false;
    let needsStroke = false;

    if (fillStyle && fillStyle !== 'null') {
      ctx.fillStyle = fillStyle;
      needsFill = true;
    }

    if (strokeStyle && strokeStyle !== 'null') {
      ctx.strokeStyle = strokeStyle;
      needsStroke = true;
    }

    if (lineWidth && lineWidth !== 'null') {
      ctx.lineWidth = parseFloat(lineWidth);
    }

    // Execute operations based on type
    switch (type) {
      case 'circle':
        this.executeCircleGroup(ctx, operations, needsFill, needsStroke);
        break;
      case 'line':
        this.executeLineGroup(ctx, operations);
        break;
      case 'rect':
        this.executeRectGroup(ctx, operations, needsFill, needsStroke);
        break;
      case 'path':
        this.executePathGroup(ctx, operations, needsFill, needsStroke);
        break;
    }
  }

  /**
   * Batch execute circle operations
   */
  executeCircleGroup(ctx, operations, needsFill, needsStroke) {
    if (needsFill) {
      ctx.beginPath();
      for (const op of operations) {
        ctx.moveTo(op.x + op.radius, op.y);
        ctx.arc(op.x, op.y, op.radius, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    if (needsStroke) {
      ctx.beginPath();
      for (const op of operations) {
        ctx.moveTo(op.x + op.radius, op.y);
        ctx.arc(op.x, op.y, op.radius, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
  }

  /**
   * Batch execute line operations
   */
  executeLineGroup(ctx, operations) {
    ctx.beginPath();
    for (const op of operations) {
      ctx.moveTo(op.x1, op.y1);
      ctx.lineTo(op.x2, op.y2);
    }
    ctx.stroke();
  }

  /**
   * Batch execute rectangle operations
   */
  executeRectGroup(ctx, operations, needsFill, needsStroke) {
    if (needsFill) {
      for (const op of operations) {
        ctx.fillRect(op.x, op.y, op.width, op.height);
      }
    }

    if (needsStroke) {
      for (const op of operations) {
        ctx.strokeRect(op.x, op.y, op.width, op.height);
      }
    }
  }

  /**
   * Batch execute path operations
   */
  executePathGroup(ctx, operations, needsFill, needsStroke) {
    for (const op of operations) {
      const path = this.getOrCreatePath(op.pathData);
      if (needsFill) ctx.fill(path);
      if (needsStroke) ctx.stroke(path);
    }
  }

  /**
   * Apply canvas state efficiently
   */
  applyState(ctx, state) {
    let changes = 0;

    for (const [key, value] of Object.entries(state)) {
      if (value !== null && this.currentState[key] !== value) {
        ctx[key] = value;
        this.currentState[key] = value;
        changes++;
      }
    }

    this.stats.stateChanges += changes;
    if (changes > 0) {
      this.stats.savedStates += Math.max(
        0,
        Object.keys(state).length - changes
      );
    }
  }

  /**
   * Create cached gradient
   */
  createGradient(ctx, type, params, colorStops) {
    const key = `${type}_${JSON.stringify(params)}_${JSON.stringify(colorStops)}`;

    if (this.gradientCache.has(key)) {
      return this.gradientCache.get(key);
    }

    let gradient;
    if (type === 'radial') {
      gradient = ctx.createRadialGradient(...params);
    } else if (type === 'linear') {
      gradient = ctx.createLinearGradient(...params);
    }

    if (gradient && colorStops) {
      for (const [position, color] of colorStops) {
        gradient.addColorStop(position, color);
      }
    }

    // Limit cache size
    if (this.gradientCache.size > 100) {
      const firstKey = this.gradientCache.keys().next().value;
      this.gradientCache.delete(firstKey);
    }

    this.gradientCache.set(key, gradient);
    return gradient;
  }

  /**
   * Get or create cached path
   */
  getOrCreatePath(pathData) {
    const key = JSON.stringify(pathData);

    if (this.pathCache.has(key)) {
      return this.pathCache.get(key);
    }

    const path = new Path2D();

    if (Array.isArray(pathData)) {
      // Array of path commands
      for (const cmd of pathData) {
        switch (cmd.type) {
          case 'moveTo':
            path.moveTo(cmd.x, cmd.y);
            break;
          case 'lineTo':
            path.lineTo(cmd.x, cmd.y);
            break;
          case 'arc':
            path.arc(cmd.x, cmd.y, cmd.radius, cmd.startAngle, cmd.endAngle);
            break;
          case 'closePath':
            path.closePath();
            break;
        }
      }
    } else if (typeof pathData === 'string') {
      // SVG path string
      path.addPath(new Path2D(pathData));
    }

    // Limit cache size
    if (this.pathCache.size > 50) {
      const firstKey = this.pathCache.keys().next().value;
      this.pathCache.delete(firstKey);
    }

    this.pathCache.set(key, path);
    return path;
  }

  /**
   * Generate unique key for batch identification
   */
  generateBatchKey(type, state) {
    const stateStr = Object.entries(state)
      .filter(([key, value]) => value !== null)
      .map(([key, value]) => `${key}:${value}`)
      .sort()
      .join('|');

    return `${type}_${stateStr}`;
  }

  /**
   * Generate key for operation grouping
   */
  getOperationGroupKey(operation) {
    return [
      operation.type,
      operation.fillStyle || 'null',
      operation.strokeStyle || 'null',
      operation.lineWidth || 'null',
    ].join('|');
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const efficiency =
      this.stats.totalDrawCalls > 0
        ? ((this.stats.savedStates / this.stats.totalDrawCalls) * 100).toFixed(
            1
          )
        : 0;

    return {
      ...this.stats,
      efficiency: `${efficiency}%`,
      activeBatches: this.batches.size,
      cacheHits: {
        gradients: this.gradientCache.size,
        paths: this.pathCache.size,
      },
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalDrawCalls: 0,
      batchedDrawCalls: 0,
      stateChanges: 0,
      savedStates: 0,
    };
  }

  /**
   * Clear all caches
   */
  clearCaches() {
    this.gradientCache.clear();
    this.pathCache.clear();
    this.batches.clear();
    this.activeBatch = null;
    console.log('[RenderBatch] Caches cleared');
  }
}

export default RenderBatch;
