/**
 * Canvas State Management Optimization
 * Minimizes context state changes and provides efficient state tracking
 */

class CanvasStateManager {
  constructor() {
    // Current state tracking
    this.currentState = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      shadowBlur: 0,
      shadowColor: 'rgba(0, 0, 0, 0)',
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      textAlign: 'start',
      textBaseline: 'alphabetic',
      font: '10px sans-serif'
    };

    // State stack for save/restore optimization
    this.stateStack = [];

    // Performance tracking
    this.stats = {
      stateChanges: 0,
      stateSaves: 0,
      stateRestores: 0,
      redundantChanges: 0
    };

    // Commonly used state presets
    this.presets = {
      bullet: {
        fillStyle: '#FFFFFF',
        strokeStyle: '#FFFF00',
        lineWidth: 1,
        globalAlpha: 1,
        shadowBlur: 0
      },
      particle: {
        fillStyle: '#FFA500',
        strokeStyle: 'transparent',
        lineWidth: 1,
        globalAlpha: 0.8,
        shadowBlur: 3
      },
      enemy: {
        fillStyle: '#FF4444',
        strokeStyle: '#FF0000',
        lineWidth: 2,
        globalAlpha: 1,
        shadowBlur: 0
      },
      ui: {
        fillStyle: '#FFFFFF',
        strokeStyle: 'transparent',
        lineWidth: 1,
        globalAlpha: 1,
        shadowBlur: 0,
        textAlign: 'left',
        textBaseline: 'top'
      },
      shield: {
        fillStyle: 'transparent',
        strokeStyle: 'rgba(160, 245, 255, 0.52)',
        lineWidth: 2.4,
        globalAlpha: 1,
        shadowBlur: 10,
        shadowColor: 'rgba(90, 200, 255, 0.75)',
        globalCompositeOperation: 'source-over'
      }
    };

    console.log('[CanvasStateManager] Initialized with', Object.keys(this.presets).length, 'presets');
  }

  /**
   * Initialize with canvas context and capture initial state
   */
  initialize(ctx) {
    if (!ctx) return;

    // Capture initial canvas state
    for (const key of Object.keys(this.currentState)) {
      try {
        this.currentState[key] = ctx[key];
      } catch (e) {
        // Some properties might not be readable
      }
    }

    console.log('[CanvasStateManager] Initialized with context');
  }

  /**
   * Apply a state preset efficiently
   */
  applyPreset(ctx, presetName) {
    const preset = this.presets[presetName];
    if (!preset) {
      console.warn(`[CanvasStateManager] Unknown preset: ${presetName}`);
      return false;
    }

    return this.applyState(ctx, preset);
  }

  /**
   * Apply multiple state properties efficiently
   */
  applyState(ctx, newState) {
    if (!ctx || !newState) return false;

    let changes = 0;

    for (const [key, value] of Object.entries(newState)) {
      if (this.currentState[key] !== value) {
        try {
          ctx[key] = value;
          this.currentState[key] = value;
          changes++;
        } catch (e) {
          console.warn(`[CanvasStateManager] Failed to set ${key}:`, e);
        }
      } else {
        this.stats.redundantChanges++;
      }
    }

    this.stats.stateChanges += changes;
    return changes > 0;
  }

  /**
   * Set single property with change detection
   */
  setState(ctx, property, value) {
    if (!ctx || this.currentState[property] === value) {
      if (this.currentState[property] === value) {
        this.stats.redundantChanges++;
      }
      return false;
    }

    try {
      ctx[property] = value;
      this.currentState[property] = value;
      this.stats.stateChanges++;
      return true;
    } catch (e) {
      console.warn(`[CanvasStateManager] Failed to set ${property}:`, e);
      return false;
    }
  }

  /**
   * Optimized save operation
   */
  save(ctx) {
    if (!ctx) return;

    ctx.save();
    this.stateStack.push({ ...this.currentState });
    this.stats.stateSaves++;
  }

  /**
   * Optimized restore operation
   */
  restore(ctx) {
    if (!ctx || this.stateStack.length === 0) return;

    ctx.restore();
    const restoredState = this.stateStack.pop();
    this.currentState = restoredState;
    this.stats.stateRestores++;
  }

  /**
   * Batch apply multiple style properties for similar objects
   */
  batchApplyStyles(ctx, styles) {
    const changes = [];

    // Collect all changes first
    for (const [key, value] of Object.entries(styles)) {
      if (this.currentState[key] !== value) {
        changes.push([key, value]);
      }
    }

    // Apply all changes at once
    for (const [key, value] of changes) {
      try {
        ctx[key] = value;
        this.currentState[key] = value;
      } catch (e) {
        console.warn(`[CanvasStateManager] Failed to set ${key}:`, e);
      }
    }

    this.stats.stateChanges += changes.length;
    this.stats.redundantChanges += Object.keys(styles).length - changes.length;

    return changes.length;
  }

  /**
   * Create a new preset or modify existing one
   */
  createPreset(name, state) {
    this.presets[name] = { ...state };
    console.log(`[CanvasStateManager] Created preset: ${name}`);
  }

  /**
   * Get current state copy
   */
  getCurrentState() {
    return { ...this.currentState };
  }

  /**
   * Check if a specific property would cause a state change
   */
  wouldChange(property, value) {
    return this.currentState[property] !== value;
  }

  /**
   * Reset to default canvas state
   */
  reset(ctx) {
    if (!ctx) return;

    const defaultState = {
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      shadowBlur: 0,
      shadowColor: 'rgba(0, 0, 0, 0)',
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      textAlign: 'start',
      textBaseline: 'alphabetic',
      font: '10px sans-serif'
    };

    this.applyState(ctx, defaultState);
    this.stateStack.length = 0;
  }

  /**
   * Performance analysis
   */
  getStats() {
    const total = this.stats.stateChanges + this.stats.redundantChanges;
    const efficiency = total > 0 ? ((this.stats.redundantChanges / total) * 100).toFixed(1) : 0;

    return {
      ...this.stats,
      totalOperations: total,
      efficiency: `${efficiency}% redundant changes avoided`,
      stackDepth: this.stateStack.length,
      presetsAvailable: Object.keys(this.presets).length
    };
  }

  /**
   * Reset performance statistics
   */
  resetStats() {
    this.stats = {
      stateChanges: 0,
      stateSaves: 0,
      stateRestores: 0,
      redundantChanges: 0
    };
  }

  /**
   * Generate a state diff for debugging
   */
  getStateDiff(targetState) {
    const diff = {};

    for (const [key, value] of Object.entries(targetState)) {
      if (this.currentState[key] !== value) {
        diff[key] = {
          current: this.currentState[key],
          target: value
        };
      }
    }

    return diff;
  }

  /**
   * Utility: Create gradient with caching consideration
   */
  createOptimizedGradient(ctx, type, params, colorStops, cacheKey) {
    // This would integrate with RenderBatch gradient cache
    if (type === 'radial') {
      const gradient = ctx.createRadialGradient(...params);
      for (const [position, color] of colorStops) {
        gradient.addColorStop(position, color);
      }
      return gradient;
    } else if (type === 'linear') {
      const gradient = ctx.createLinearGradient(...params);
      for (const [position, color] of colorStops) {
        gradient.addColorStop(position, color);
      }
      return gradient;
    }
    return null;
  }

  /**
   * Smart state transition for rendering phases
   */
  transitionToPhase(ctx, phase) {
    switch (phase) {
      case 'background':
        return this.applyPreset(ctx, 'ui');

      case 'objects':
        // Reset to neutral state for objects
        return this.applyState(ctx, {
          globalCompositeOperation: 'source-over',
          globalAlpha: 1,
          shadowBlur: 0
        });

      case 'effects':
        return this.applyState(ctx, {
          globalCompositeOperation: 'lighter',
          globalAlpha: 0.8
        });

      case 'ui':
        return this.applyPreset(ctx, 'ui');

      default:
        return false;
    }
  }
}

export default CanvasStateManager;