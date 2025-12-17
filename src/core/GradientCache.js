/**
 * Gradient and Pattern Caching System
 * Optimizes gradient/pattern creation and reuse across frames
 */

const MAX_CACHE_SIZE = 200;
const CLEANUP_THRESHOLD = 0.8; // Cleanup when cache is 80% full

class GradientCache {
  constructor() {
    // Gradient cache
    this.gradientCache = new Map();
    this.gradientUsage = new Map(); // Track usage for LRU cleanup

    // Pattern cache
    this.patternCache = new Map();
    this.patternUsage = new Map();

    // Canvas cache for complex gradients
    this.canvasCache = new Map();

    // Performance tracking
    this.stats = {
      gradientHits: 0,
      gradientMisses: 0,
      patternHits: 0,
      patternMisses: 0,
      canvasHits: 0,
      canvasMisses: 0,
      cleanupRuns: 0,
    };

    // Common gradient presets
    this.presets = {
      bulletGlow: {
        type: 'radial',
        params: [0, 0, 1, 0, 0, 8],
        colorStops: [
          [0, '#FFFFFF'],
          [0.3, '#FFFF77'],
          [1, 'rgba(255, 255, 0, 0)'],
        ],
      },
      shieldGlow: {
        type: 'radial',
        params: [0, 0, 10, 0, 0, 50],
        colorStops: [
          [0, 'rgba(120, 240, 255, 0.22)'],
          [0.55, 'rgba(0, 190, 255, 0.55)'],
          [1, 'rgba(0, 150, 255, 0)'],
        ],
      },
      explosion: {
        type: 'radial',
        params: [0, 0, 5, 0, 0, 40],
        colorStops: [
          [0, '#FFFFFF'],
          [0.2, '#FFAA00'],
          [0.6, '#FF4400'],
          [1, 'rgba(255, 0, 0, 0)'],
        ],
      },
      background: {
        type: 'radial',
        params: [400, 300, 0, 400, 300, 600],
        colorStops: [
          [0, '#0a0a1a'],
          [0.6, '#000510'],
          [1, '#000000'],
        ],
      },
    };

    console.log(
      '[GradientCache] Initialized with',
      Object.keys(this.presets).length,
      'presets'
    );
  }

  /**
   * Get or create a gradient with caching
   */
  getGradient(ctx, type, params, colorStops, scale = 1) {
    const key = this.generateGradientKey(type, params, colorStops, scale);

    // Check cache first
    if (this.gradientCache.has(key)) {
      this.gradientUsage.set(key, Date.now());
      this.stats.gradientHits++;
      return this.gradientCache.get(key);
    }

    // Create new gradient
    const gradient = this.createGradient(ctx, type, params, colorStops, scale);
    if (gradient) {
      this.cacheGradient(key, gradient);
      this.stats.gradientMisses++;
    }

    return gradient;
  }

  /**
   * Get gradient from preset
   */
  getPresetGradient(ctx, presetName, scale = 1, overrides = {}) {
    const preset = this.presets[presetName];
    if (!preset) {
      console.warn(`[GradientCache] Unknown preset: ${presetName}`);
      return null;
    }

    const params = preset.params.map((p) => p * scale);
    const colorStops = preset.colorStops;

    // Apply overrides
    if (overrides.colorStops) {
      return this.getGradient(
        ctx,
        preset.type,
        params,
        overrides.colorStops,
        scale
      );
    }

    return this.getGradient(ctx, preset.type, params, colorStops, scale);
  }

  /**
   * Create gradient with proper scaling
   */
  createGradient(ctx, type, params, colorStops, scale = 1) {
    try {
      let gradient;
      const scaledParams = params.map((p) =>
        typeof p === 'number' ? p * scale : p
      );

      if (type === 'radial') {
        gradient = ctx.createRadialGradient(...scaledParams);
      } else if (type === 'linear') {
        gradient = ctx.createLinearGradient(...scaledParams);
      } else {
        console.warn(`[GradientCache] Unknown gradient type: ${type}`);
        return null;
      }

      // Add color stops
      for (const [position, color] of colorStops) {
        gradient.addColorStop(position, color);
      }

      return gradient;
    } catch (e) {
      console.warn('[GradientCache] Failed to create gradient:', e);
      return null;
    }
  }

  /**
   * Cache a gradient with usage tracking
   */
  cacheGradient(key, gradient) {
    if (this.gradientCache.size >= MAX_CACHE_SIZE * CLEANUP_THRESHOLD) {
      this.cleanupGradientCache();
    }

    this.gradientCache.set(key, gradient);
    this.gradientUsage.set(key, Date.now());
  }

  /**
   * Get or create a pattern with caching
   */
  getPattern(ctx, imageSource, repetition = 'repeat') {
    const key = this.generatePatternKey(imageSource, repetition);

    // Check cache first
    if (this.patternCache.has(key)) {
      this.patternUsage.set(key, Date.now());
      this.stats.patternHits++;
      return this.patternCache.get(key);
    }

    // Create new pattern
    try {
      const pattern = ctx.createPattern(imageSource, repetition);
      if (pattern) {
        this.cachePattern(key, pattern);
        this.stats.patternMisses++;
      }
      return pattern;
    } catch (e) {
      console.warn('[GradientCache] Failed to create pattern:', e);
      return null;
    }
  }

  /**
   * Cache a pattern with usage tracking
   */
  cachePattern(key, pattern) {
    if (this.patternCache.size >= MAX_CACHE_SIZE * CLEANUP_THRESHOLD) {
      this.cleanupPatternCache();
    }

    this.patternCache.set(key, pattern);
    this.patternUsage.set(key, Date.now());
  }

  /**
   * Get or create cached canvas for complex gradients
   */
  getCachedCanvas(key, width, height, drawFunction) {
    const fullKey = `${key}_${width}x${height}`;

    // Check cache first
    if (this.canvasCache.has(fullKey)) {
      this.stats.canvasHits++;
      return this.canvasCache.get(fullKey);
    }

    // Create new canvas
    if (typeof document === 'undefined') {
      this.stats.canvasMisses++;
      return null;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (drawFunction && typeof drawFunction === 'function') {
        drawFunction(ctx, width, height);
      }

      // Cache the canvas
      if (this.canvasCache.size >= MAX_CACHE_SIZE * CLEANUP_THRESHOLD) {
        this.cleanupCanvasCache();
      }

      this.canvasCache.set(fullKey, canvas);
      this.stats.canvasMisses++;

      return canvas;
    } catch (e) {
      console.warn('[GradientCache] Failed to create cached canvas:', e);
      return null;
    }
  }

  /**
   * Create shield gradient with caching
   */
  createShieldGradient(ctx, radius, ratio) {
    const key = `shield_${Math.round(radius)}_${Math.round(ratio * 100)}`;

    return this.getCachedCanvas(
      key,
      radius * 2.5,
      radius * 2.5,
      (canvasCtx, width, height) => {
        const center = width / 2;
        const gradient = canvasCtx.createRadialGradient(
          center,
          center,
          radius * 0.35,
          center,
          center,
          radius * 1.25
        );

        gradient.addColorStop(0, `rgba(120, 240, 255, ${0.08 + ratio * 0.14})`);
        gradient.addColorStop(0.55, `rgba(0, 190, 255, ${0.25 + ratio * 0.3})`);
        gradient.addColorStop(1, 'rgba(0, 150, 255, 0)');

        canvasCtx.fillStyle = gradient;
        canvasCtx.beginPath();
        canvasCtx.arc(center, center, radius * 1.25, 0, Math.PI * 2);
        canvasCtx.fill();
      }
    );
  }

  /**
   * Generate cache key for gradients
   */
  generateGradientKey(type, params, colorStops, scale) {
    const paramsStr = params
      .map((p) => (typeof p === 'number' ? p.toFixed(2) : p))
      .join(',');
    const stopsStr = colorStops
      .map(([pos, color]) => `${pos.toFixed(2)}:${color}`)
      .join('|');
    return `${type}_${paramsStr}_${stopsStr}_${scale.toFixed(2)}`;
  }

  /**
   * Generate cache key for patterns
   */
  generatePatternKey(imageSource, repetition) {
    let sourceKey = 'unknown';

    if (imageSource && typeof imageSource === 'object') {
      // Try to get a unique identifier
      if (imageSource.src) {
        sourceKey = imageSource.src;
      } else if (imageSource.width && imageSource.height) {
        sourceKey = `${imageSource.width}x${imageSource.height}`;
      }
    }

    return `pattern_${sourceKey}_${repetition}`;
  }

  /**
   * Cleanup gradient cache using LRU strategy
   */
  cleanupGradientCache() {
    const entries = Array.from(this.gradientUsage.entries());
    entries.sort((a, b) => a[1] - b[1]); // Sort by usage time

    const toRemove = Math.floor(this.gradientCache.size * 0.3); // Remove 30%

    for (let i = 0; i < toRemove && i < entries.length; i++) {
      const key = entries[i][0];
      this.gradientCache.delete(key);
      this.gradientUsage.delete(key);
    }

    this.stats.cleanupRuns++;
    console.log(`[GradientCache] Cleaned up ${toRemove} gradient entries`);
  }

  /**
   * Cleanup pattern cache using LRU strategy
   */
  cleanupPatternCache() {
    const entries = Array.from(this.patternUsage.entries());
    entries.sort((a, b) => a[1] - b[1]); // Sort by usage time

    const toRemove = Math.floor(this.patternCache.size * 0.3); // Remove 30%

    for (let i = 0; i < toRemove && i < entries.length; i++) {
      const key = entries[i][0];
      this.patternCache.delete(key);
      this.patternUsage.delete(key);
    }

    this.stats.cleanupRuns++;
    console.log(`[GradientCache] Cleaned up ${toRemove} pattern entries`);
  }

  /**
   * Cleanup canvas cache
   */
  cleanupCanvasCache() {
    const cacheSize = this.canvasCache.size;
    const toRemove = Math.floor(cacheSize * 0.3);

    const keys = Array.from(this.canvasCache.keys());
    for (let i = 0; i < toRemove; i++) {
      this.canvasCache.delete(keys[i]);
    }

    this.stats.cleanupRuns++;
    console.log(`[GradientCache] Cleaned up ${toRemove} canvas entries`);
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const gradientTotal = this.stats.gradientHits + this.stats.gradientMisses;
    const patternTotal = this.stats.patternHits + this.stats.patternMisses;
    const canvasTotal = this.stats.canvasHits + this.stats.canvasMisses;

    const gradientHitRate =
      gradientTotal > 0
        ? ((this.stats.gradientHits / gradientTotal) * 100).toFixed(1)
        : 0;
    const patternHitRate =
      patternTotal > 0
        ? ((this.stats.patternHits / patternTotal) * 100).toFixed(1)
        : 0;
    const canvasHitRate =
      canvasTotal > 0
        ? ((this.stats.canvasHits / canvasTotal) * 100).toFixed(1)
        : 0;

    return {
      ...this.stats,
      cacheSize: {
        gradients: this.gradientCache.size,
        patterns: this.patternCache.size,
        canvases: this.canvasCache.size,
      },
      hitRates: {
        gradients: `${gradientHitRate}%`,
        patterns: `${patternHitRate}%`,
        canvases: `${canvasHitRate}%`,
      },
      presetsAvailable: Object.keys(this.presets).length,
    };
  }

  /**
   * Reset all caches and statistics
   */
  reset() {
    this.gradientCache.clear();
    this.gradientUsage.clear();
    this.patternCache.clear();
    this.patternUsage.clear();
    this.canvasCache.clear();

    this.stats = {
      gradientHits: 0,
      gradientMisses: 0,
      patternHits: 0,
      patternMisses: 0,
      canvasHits: 0,
      canvasMisses: 0,
      cleanupRuns: 0,
    };

    console.log('[GradientCache] Reset complete');
  }

  /**
   * Preload common gradients
   */
  preloadGradients(ctx) {
    const commonScales = [0.5, 1, 1.5, 2];

    for (const [name, preset] of Object.entries(this.presets)) {
      for (const scale of commonScales) {
        this.getPresetGradient(ctx, name, scale);
      }
    }

    console.log('[GradientCache] Preloaded gradients for common scales');
  }
}

export default GradientCache;
